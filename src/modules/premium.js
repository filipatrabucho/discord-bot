import { db, getSettings } from '../database.js';
import { t, langOf } from '../i18n/index.js';
import { embed } from '../utils/embeds.js';
import { ts } from '../utils/time.js';
import { sendLog } from './logs.js';

const getRow = db.prepare('SELECT * FROM premium_members WHERE guild_id = ? AND user_id = ?');

export function getPremium(guildId, userId) {
  return getRow.get(guildId, userId);
}

export function listPremium(guildId) {
  return db.prepare('SELECT * FROM premium_members WHERE guild_id = ? ORDER BY expires_at IS NULL, expires_at').all(guildId);
}

export function perksEmbed(lang) {
  return embed('premium')
    .setTitle(t(lang, 'premium.perksTitle'))
    .setDescription(t(lang, 'premium.perks').map((p) => `• ${p}`).join('\n'))
    .setFooter({ text: t(lang, 'premium.perksFooter') });
}

/**
 * Grants premium (adds the role and records it). `durationMs` null = permanent.
 * Extends an existing timed grant instead of resetting it.
 */
export async function grantPremium(guild, userId, durationMs, grantedBy, source = 'manual') {
  const settings = getSettings(guild.id);
  const role = guild.roles.cache.get(settings.roles.premium);
  if (!role) throw new Error('premium.noRole');
  const member = await guild.members.fetch(userId);

  const existing = getPremium(guild.id, userId);
  let expiresAt = null;
  if (durationMs) {
    const base = existing?.expires_at && existing.expires_at > Date.now() ? existing.expires_at : Date.now();
    expiresAt = existing && existing.expires_at === null ? null : base + durationMs;
  }
  db.prepare(
    `INSERT INTO premium_members (guild_id, user_id, expires_at, granted_by, source) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(guild_id, user_id) DO UPDATE SET expires_at = excluded.expires_at, granted_by = excluded.granted_by,
       source = CASE WHEN premium_members.source = 'boost' AND excluded.source = 'manual' THEN 'manual' ELSE excluded.source END`,
  ).run(guild.id, userId, expiresAt, grantedBy, source);
  await member.roles.add(role, 'Premium');

  const lang = langOf(guild);
  if (!existing) {
    const chat = guild.channels.cache.get(settings.channels.premiumChat);
    await chat?.send({ content: `<@${userId}>`, embeds: [embed('premium').setDescription(t(lang, 'premium.welcomeChat', { user: `<@${userId}>` }))] }).catch(() => {});
  }
  await sendLog(guild, embed('premium').setDescription(t(lang, 'premium.logGranted', { user: `<@${userId}>`, by: `<@${grantedBy}>`, until: expiresAt ? ts(expiresAt, 'f') : '∞' })));
  return { expiresAt, member };
}

export async function revokePremium(guild, userId, reason = 'manual') {
  const settings = getSettings(guild.id);
  db.prepare('DELETE FROM premium_members WHERE guild_id = ? AND user_id = ?').run(guild.id, userId);
  const member = await guild.members.fetch(userId).catch(() => null);
  if (member && settings.roles.premium) await member.roles.remove(settings.roles.premium, `Premium ${reason}`).catch(() => {});
  const lang = langOf(guild);
  await sendLog(guild, embed('warning').setDescription(t(lang, 'premium.logRevoked', { user: `<@${userId}>`, reason: t(lang, `premium.reasons.${reason}`) })));
  return member;
}

export async function checkExpired(client) {
  const rows = db.prepare('SELECT * FROM premium_members WHERE expires_at IS NOT NULL AND expires_at <= ?').all(Date.now());
  for (const row of rows) {
    const guild = client.guilds.cache.get(row.guild_id);
    if (!guild) continue;
    const member = await revokePremium(guild, row.user_id, 'expired');
    await member?.send({ embeds: [embed('warning').setDescription(t(langOf(guild), 'premium.expiredDm', { server: guild.name }))] }).catch(() => {});
  }
}

/** Server boosters automatically become premium while they boost. */
export async function onMemberUpdate(before, after) {
  const settings = getSettings(after.guild.id);
  if (!settings.premium.boosters || !settings.roles.premium) return;
  const lang = langOf(after.guild);
  if (!before.premiumSince && after.premiumSince) {
    await grantPremium(after.guild, after.id, null, after.client.user.id, 'boost').catch(() => {});
    const chat = after.guild.channels.cache.get(settings.channels.premiumChat);
    await chat?.send({ embeds: [embed('premium').setDescription(t(lang, 'premium.boostThanks', { user: `<@${after.id}>` }))] }).catch(() => {});
  } else if (before.premiumSince && !after.premiumSince) {
    if (getPremium(after.guild.id, after.id)?.source === 'boost') await revokePremium(after.guild, after.id, 'boostEnded');
  }
}
