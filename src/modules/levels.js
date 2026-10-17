import { db, getSettings } from '../database.js';
import { t, langOf } from '../i18n/index.js';
import { embed } from '../utils/embeds.js';
import { isPremium } from '../utils/permissions.js';

const COOLDOWN = 60_000;

/** XP needed to go from `level` to `level + 1`. */
export const xpForLevel = (level) => 5 * level * level + 50 * level + 100;

const getRow = db.prepare('SELECT * FROM levels WHERE guild_id = ? AND user_id = ?');
const saveRow = db.prepare(
  `INSERT INTO levels (guild_id, user_id, xp, level, last_xp_at) VALUES (@guild_id, @user_id, @xp, @level, @last_xp_at)
   ON CONFLICT(guild_id, user_id) DO UPDATE SET xp = excluded.xp, level = excluded.level, last_xp_at = excluded.last_xp_at`,
);

export async function handleMessage(message) {
  if (!message.guild || message.author.bot || !message.member) return;
  const settings = getSettings(message.guild.id);
  if (!settings.levels.enabled) return;

  const row = getRow.get(message.guild.id, message.author.id) ?? { guild_id: message.guild.id, user_id: message.author.id, xp: 0, level: 0, last_xp_at: 0 };
  const now = Date.now();
  if (now - row.last_xp_at < COOLDOWN) return;

  // Premium members earn 50% more XP.
  const gain = Math.round((15 + Math.floor(Math.random() * 11)) * (isPremium(message.member, settings) ? 1.5 : 1));
  row.xp += gain;
  row.last_xp_at = now;
  let leveledUp = false;
  while (row.xp >= xpForLevel(row.level)) {
    row.xp -= xpForLevel(row.level);
    row.level += 1;
    leveledUp = true;
  }
  saveRow.run(row);

  if (leveledUp) {
    const lang = langOf(message.guild);
    const channel = message.guild.channels.cache.get(settings.channels.levelUp) ?? message.channel;
    await channel
      .send({ embeds: [embed('success').setDescription(t(lang, 'levels.levelUp', { user: `<@${message.author.id}>`, level: row.level }))] })
      .catch(() => {});
  }
}

export function getRank(guildId, userId) {
  const row = getRow.get(guildId, userId) ?? { xp: 0, level: 0 };
  const position = db
    .prepare('SELECT COUNT(*) + 1 AS pos FROM levels WHERE guild_id = ? AND (level > ? OR (level = ? AND xp > ?))')
    .get(guildId, row.level, row.level, row.xp).pos;
  return { ...row, position, needed: xpForLevel(row.level) };
}

export function topLevels(guildId, limit = 10) {
  return db.prepare('SELECT user_id AS userId, level, xp FROM levels WHERE guild_id = ? ORDER BY level DESC, xp DESC LIMIT ?').all(guildId, limit);
}

export function progressBar(current, total, size = 14) {
  const filled = Math.round((current / total) * size);
  return `${'▰'.repeat(filled)}${'▱'.repeat(size - filled)}`;
}
