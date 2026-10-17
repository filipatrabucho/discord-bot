import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { db, getSettings } from '../database.js';
import { t, langOf } from '../i18n/index.js';
import { embed, failure, success } from '../utils/embeds.js';
import { isStaff } from '../utils/permissions.js';

const STATUS_COLORS = { pending: 'info', approved: 'success', denied: 'danger' };
const getById = db.prepare('SELECT * FROM suggestions WHERE id = ?');

function suggestionMessage(lang, s, author) {
  const votes = Object.values(JSON.parse(s.votes));
  const up = votes.filter((v) => v === 1).length;
  const down = votes.length - up;
  const done = s.status !== 'pending';
  return {
    embeds: [
      embed(STATUS_COLORS[s.status])
        .setAuthor({ name: author?.tag ?? s.user_id, iconURL: author?.displayAvatarURL() })
        .setTitle(t(lang, 'suggestions.title', { id: s.id }))
        .setDescription(s.content)
        .addFields({ name: t(lang, 'suggestions.status'), value: t(lang, `suggestions.statuses.${s.status}`) })
        .setTimestamp(s.created_at),
    ],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`suggest:up:${s.id}`).setStyle(ButtonStyle.Success).setEmoji('👍').setLabel(String(up)).setDisabled(done),
        new ButtonBuilder().setCustomId(`suggest:down:${s.id}`).setStyle(ButtonStyle.Danger).setEmoji('👎').setLabel(String(down)).setDisabled(done),
        new ButtonBuilder().setCustomId(`suggest:approve:${s.id}`).setStyle(ButtonStyle.Secondary).setEmoji('✅').setDisabled(done),
        new ButtonBuilder().setCustomId(`suggest:deny:${s.id}`).setStyle(ButtonStyle.Secondary).setEmoji('⛔').setDisabled(done),
      ),
    ],
  };
}

export async function createSuggestion(interaction, content) {
  const { guild, user } = interaction;
  const lang = langOf(guild);
  const channel = guild.channels.cache.get(getSettings(guild.id).channels.suggestions);
  if (!channel) return failure(interaction, t(lang, 'suggestions.noChannel'));

  const { lastInsertRowid } = db
    .prepare('INSERT INTO suggestions (guild_id, channel_id, user_id, content, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(guild.id, channel.id, user.id, content, Date.now());
  const s = getById.get(lastInsertRowid);
  const message = await channel.send(suggestionMessage(lang, s, user));
  db.prepare('UPDATE suggestions SET message_id = ? WHERE id = ?').run(message.id, s.id);
  await message.startThread({ name: t(lang, 'suggestions.thread', { id: s.id }) }).catch(() => {});
  return success(interaction, t(lang, 'suggestions.created', { url: message.url }));
}

export async function handleComponent(interaction, action, [id]) {
  const lang = langOf(interaction.guild);
  const s = getById.get(Number(id));
  if (!s) return;
  if (s.status !== 'pending') return failure(interaction, t(lang, 'suggestions.closed'));
  const author = await interaction.client.users.fetch(s.user_id).catch(() => null);

  if (action === 'up' || action === 'down') {
    const votes = JSON.parse(s.votes);
    const value = action === 'up' ? 1 : -1;
    votes[interaction.user.id] === value ? delete votes[interaction.user.id] : (votes[interaction.user.id] = value);
    db.prepare('UPDATE suggestions SET votes = ? WHERE id = ?').run(JSON.stringify(votes), s.id);
    return interaction.update(suggestionMessage(lang, getById.get(s.id), author));
  }

  if (action === 'approve' || action === 'deny') {
    if (!isStaff(interaction.member, getSettings(interaction.guild.id))) return failure(interaction, t(lang, 'common.staffOnly'));
    const status = action === 'approve' ? 'approved' : 'denied';
    db.prepare('UPDATE suggestions SET status = ? WHERE id = ?').run(status, s.id);
    await interaction.update(suggestionMessage(lang, getById.get(s.id), author));
    await author
      ?.send({ embeds: [embed(STATUS_COLORS[status]).setDescription(t(lang, `suggestions.dm.${status}`, { id: s.id, server: interaction.guild.name, url: interaction.message.url }))] })
      .catch(() => {});
  }
}
