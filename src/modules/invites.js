import { db, getSettings } from '../database.js';
import { t, langOf } from '../i18n/index.js';
import { embed } from '../utils/embeds.js';
import { isAssignableRole } from '../utils/permissions.js';

/**
 * guildId -> Map(code -> { uses, inviterId, maxUses }).
 * Deleted invites are deliberately kept until the next snapshot: a single-use invite is deleted
 * right as the member joins, and the stale entry still lets us attribute that join.
 */
const cache = new Map();

async function snapshot(guild) {
  const invites = await guild.invites.fetch().catch(() => null);
  if (!invites) return null;
  const map = new Map(invites.map((i) => [i.code, { uses: i.uses ?? 0, inviterId: i.inviterId, maxUses: i.maxUses }]));
  if (guild.vanityURLCode) {
    const vanity = await guild.fetchVanityData().catch(() => null);
    if (vanity) map.set(vanity.code, { uses: vanity.uses, inviterId: null, maxUses: 0, vanity: true });
  }
  return map;
}

export async function cacheGuildInvites(guild) {
  const map = await snapshot(guild);
  if (map) cache.set(guild.id, map);
}

export function onInviteCreate(invite) {
  if (!invite.guild) return;
  const map = cache.get(invite.guild.id) ?? new Map();
  map.set(invite.code, { uses: invite.uses ?? 0, inviterId: invite.inviterId, maxUses: invite.maxUses });
  cache.set(invite.guild.id, map);
}

/** Figures out which invite a new member used and records it. Returns { inviterId, code, vanity } or null. */
export async function trackJoin(member) {
  const { guild } = member;
  const before = cache.get(guild.id);
  const after = await snapshot(guild);
  if (after) cache.set(guild.id, after);
  if (!before || !after) return null;

  let used = null;
  for (const [code, now] of after) {
    const old = before.get(code);
    if (now.uses > (old?.uses ?? 0)) {
      used = { code, ...now };
      break;
    }
  }
  if (!used) {
    // An invite that vanished was probably used up (max uses reached).
    for (const [code, old] of before) {
      if (!after.has(code) && old.maxUses && old.uses + 1 >= old.maxUses) {
        used = { code, ...old };
        break;
      }
    }
  }
  if (!used) return null;

  const { invites } = getSettings(guild.id);
  const fake = Date.now() - member.user.createdTimestamp < invites.fakeDays * 86_400_000 ? 1 : 0;
  db.prepare(
    `INSERT INTO invite_joins (guild_id, member_id, inviter_id, code, joined_at, fake, left) VALUES (?, ?, ?, ?, ?, ?, 0)
     ON CONFLICT(guild_id, member_id) DO UPDATE SET inviter_id = excluded.inviter_id, code = excluded.code,
       joined_at = excluded.joined_at, fake = excluded.fake, left = 0`,
  ).run(guild.id, member.id, used.inviterId, used.code, Date.now(), fake);

  if (used.inviterId) await applyRewards(guild, used.inviterId);
  return { inviterId: used.inviterId, code: used.code, vanity: Boolean(used.vanity) };
}

export function trackLeave(member) {
  db.prepare('UPDATE invite_joins SET left = 1 WHERE guild_id = ? AND member_id = ?').run(member.guild.id, member.id);
}

export function getStats(guildId, userId) {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(left), 0) AS left,
              COALESCE(SUM(CASE WHEN fake = 1 AND left = 0 THEN 1 ELSE 0 END), 0) AS fake
       FROM invite_joins WHERE guild_id = ? AND inviter_id = ?`,
    )
    .get(guildId, userId);
  const bonus = db.prepare('SELECT bonus FROM invite_bonus WHERE guild_id = ? AND user_id = ?').get(guildId, userId)?.bonus ?? 0;
  const regular = row.total - row.left - row.fake;
  return { total: row.total, left: row.left, fake: row.fake, bonus, valid: regular + bonus };
}

export function leaderboard(guildId, limit = 10) {
  return db
    .prepare(
      `SELECT u.user_id AS userId,
              COALESCE(j.valid, 0) + COALESCE(b.bonus, 0) AS valid
       FROM (SELECT inviter_id AS user_id FROM invite_joins WHERE guild_id = ? AND inviter_id IS NOT NULL
             UNION SELECT user_id FROM invite_bonus WHERE guild_id = ?) u
       LEFT JOIN (SELECT inviter_id, SUM(CASE WHEN left = 0 AND fake = 0 THEN 1 ELSE 0 END) AS valid
                  FROM invite_joins WHERE guild_id = ? GROUP BY inviter_id) j ON j.inviter_id = u.user_id
       LEFT JOIN invite_bonus b ON b.guild_id = ? AND b.user_id = u.user_id
       ORDER BY valid DESC LIMIT ?`,
    )
    .all(guildId, guildId, guildId, guildId, limit)
    .filter((r) => r.valid > 0);
}

export function whoInvited(guildId, memberId) {
  return db.prepare('SELECT inviter_id AS inviterId, code, joined_at AS joinedAt FROM invite_joins WHERE guild_id = ? AND member_id = ?').get(guildId, memberId);
}

export function addBonus(guildId, userId, amount) {
  db.prepare(
    `INSERT INTO invite_bonus (guild_id, user_id, bonus) VALUES (?, ?, ?)
     ON CONFLICT(guild_id, user_id) DO UPDATE SET bonus = bonus + excluded.bonus`,
  ).run(guildId, userId, amount);
}

export function resetInvites(guildId, userId = null) {
  if (userId) {
    db.prepare('DELETE FROM invite_joins WHERE guild_id = ? AND inviter_id = ?').run(guildId, userId);
    db.prepare('DELETE FROM invite_bonus WHERE guild_id = ? AND user_id = ?').run(guildId, userId);
  } else {
    db.prepare('DELETE FROM invite_joins WHERE guild_id = ?').run(guildId);
    db.prepare('DELETE FROM invite_bonus WHERE guild_id = ?').run(guildId);
  }
}

export const rewards = {
  list: (guildId) => db.prepare('SELECT invites, role_id AS roleId FROM invite_rewards WHERE guild_id = ? ORDER BY invites').all(guildId),
  add: (guildId, invites, roleId) =>
    db.prepare('INSERT OR REPLACE INTO invite_rewards (guild_id, invites, role_id) VALUES (?, ?, ?)').run(guildId, invites, roleId),
  remove: (guildId, roleId) => db.prepare('DELETE FROM invite_rewards WHERE guild_id = ? AND role_id = ?').run(guildId, roleId).changes,
};

/** Gives the inviter every reward role whose threshold they've reached. */
export async function applyRewards(guild, userId) {
  const list = rewards.list(guild.id);
  if (!list.length) return;
  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) return;
  const { valid } = getStats(guild.id, userId);
  const lang = langOf(guild);
  for (const { invites, roleId } of list) {
    const role = guild.roles.cache.get(roleId);
    if (valid >= invites && role && isAssignableRole(role) && !member.roles.cache.has(roleId)) {
      await member.roles.add(role, 'Invite reward').catch(() => {});
      await member
        .send({ embeds: [embed('success').setDescription(t(lang, 'invites.rewardDm', { role: role.name, invites, server: guild.name }))] })
        .catch(() => {});
    }
  }
}
