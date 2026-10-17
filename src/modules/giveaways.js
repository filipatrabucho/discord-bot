import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { db } from '../database.js';
import { t, langOf } from '../i18n/index.js';
import { embed, failure, success } from '../utils/embeds.js';
import { ts } from '../utils/time.js';

const getById = db.prepare('SELECT * FROM giveaways WHERE id = ?');

function giveawayMessage(lang, g, ended = false) {
  const entrants = JSON.parse(g.entrants);
  const winners = JSON.parse(g.winner_ids);
  const e = embed(ended ? 'staff' : 'premium')
    .setTitle(`🎉 ${g.prize}`)
    .setDescription(
      ended
        ? t(lang, 'giveaways.endedDescription', { winners: winners.length ? winners.map((id) => `<@${id}>`).join(', ') : t(lang, 'giveaways.noWinners') })
        : t(lang, 'giveaways.description', { end: ts(g.ends_at), winners: g.winners, host: `<@${g.host_id}>` }),
    )
    .setFooter({ text: `ID ${g.id} • ${t(lang, 'giveaways.entrants', { count: entrants.length })}` })
    .setTimestamp(g.ends_at);
  const button = new ButtonBuilder()
    .setCustomId(`giveaway:enter:${g.id}`)
    .setStyle(ButtonStyle.Primary)
    .setEmoji('🎉')
    .setLabel(`${t(lang, 'giveaways.enter')} (${entrants.length})`)
    .setDisabled(ended);
  return { embeds: [e], components: [new ActionRowBuilder().addComponents(button)] };
}

export async function startGiveaway(interaction, { prize, durationMs, winners, channel }) {
  const lang = langOf(interaction.guild);
  const { lastInsertRowid } = db
    .prepare('INSERT INTO giveaways (guild_id, channel_id, prize, winners, ends_at, host_id) VALUES (?, ?, ?, ?, ?, ?)')
    .run(interaction.guild.id, channel.id, prize, winners, Date.now() + durationMs, interaction.user.id);
  const g = getById.get(lastInsertRowid);
  const message = await channel.send(giveawayMessage(lang, g));
  db.prepare('UPDATE giveaways SET message_id = ? WHERE id = ?').run(message.id, g.id);
  return success(interaction, t(lang, 'giveaways.started', { url: message.url }));
}

function pickWinners(entrants, count) {
  const pool = [...entrants];
  const picked = [];
  while (pool.length && picked.length < count) picked.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  return picked;
}

export async function endGiveaway(client, id, { reroll = false } = {}) {
  const g = getById.get(id);
  if (!g || (g.ended && !reroll)) return null;
  const guild = client.guilds.cache.get(g.guild_id);
  const channel = guild?.channels.cache.get(g.channel_id);
  db.prepare('UPDATE giveaways SET ended = 1 WHERE id = ?').run(id);
  if (!channel) return null;

  const lang = langOf(guild);
  const winners = pickWinners(JSON.parse(g.entrants), g.winners);
  db.prepare('UPDATE giveaways SET winner_ids = ? WHERE id = ?').run(JSON.stringify(winners), id);
  const updated = getById.get(id);
  const message = await channel.messages.fetch(g.message_id).catch(() => null);
  await message?.edit(giveawayMessage(lang, updated, true)).catch(() => {});
  await channel
    .send({
      content: winners.length
        ? t(lang, reroll ? 'giveaways.rerolled' : 'giveaways.winnersAnnounce', { winners: winners.map((w) => `<@${w}>`).join(', '), prize: g.prize })
        : t(lang, 'giveaways.noEntrants', { prize: g.prize }),
      reply: message ? { messageReference: message.id } : undefined,
    })
    .catch(() => {});
  return updated;
}

export async function checkEnded(client) {
  const due = db.prepare('SELECT id FROM giveaways WHERE ended = 0 AND ends_at <= ?').all(Date.now());
  for (const { id } of due) await endGiveaway(client, id).catch((e) => console.warn('[giveaway]', e.message));
}

export const findGiveaway = (guildId, id) => db.prepare('SELECT * FROM giveaways WHERE guild_id = ? AND (id = ? OR message_id = ?)').get(guildId, Number(id) || -1, id);

export async function handleComponent(interaction, action, [id]) {
  if (action !== 'enter') return;
  const lang = langOf(interaction.guild);
  const g = getById.get(Number(id));
  if (!g || g.ended) return failure(interaction, t(lang, 'giveaways.over'));
  const entrants = new Set(JSON.parse(g.entrants));
  const joined = !entrants.has(interaction.user.id);
  joined ? entrants.add(interaction.user.id) : entrants.delete(interaction.user.id);
  db.prepare('UPDATE giveaways SET entrants = ? WHERE id = ?').run(JSON.stringify([...entrants]), g.id);
  await interaction.message.edit(giveawayMessage(lang, getById.get(g.id))).catch(() => {});
  return success(interaction, t(lang, joined ? 'giveaways.joined' : 'giveaways.left'));
}
