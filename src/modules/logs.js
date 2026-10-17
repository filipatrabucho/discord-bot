import { embed } from '../utils/embeds.js';
import { getSettings } from '../database.js';
import { t, langOf } from '../i18n/index.js';

/** Sends an embed to the guild's staff log channel, if one is configured. */
export async function sendLog(guild, logEmbed, files = []) {
  const channelId = getSettings(guild.id).channels.logs;
  if (!channelId) return;
  const channel = guild.channels.cache.get(channelId);
  await channel?.send({ embeds: [logEmbed.setTimestamp()], files }).catch(() => {});
}

export function logMessageDelete(message) {
  if (!message.guild || message.author?.bot || (!message.content && !message.attachments?.size)) return;
  const lang = langOf(message.guild);
  const e = embed('danger')
    .setAuthor({ name: message.author.tag, iconURL: message.author.displayAvatarURL() })
    .setTitle(t(lang, 'logs.messageDeleted'))
    .setDescription(message.content?.slice(0, 4000) || '*—*')
    .addFields({ name: t(lang, 'logs.channel'), value: `<#${message.channelId}>`, inline: true });
  if (message.attachments.size) {
    e.addFields({ name: t(lang, 'logs.attachments'), value: message.attachments.map((a) => a.url).join('\n').slice(0, 1024) });
  }
  return sendLog(message.guild, e);
}

export function logMessageUpdate(before, after) {
  if (!after.guild || after.author?.bot || before.content === after.content || before.partial) return;
  const lang = langOf(after.guild);
  return sendLog(
    after.guild,
    embed('warning')
      .setAuthor({ name: after.author.tag, iconURL: after.author.displayAvatarURL() })
      .setTitle(t(lang, 'logs.messageEdited'))
      .setURL(after.url)
      .addFields(
        { name: t(lang, 'logs.before'), value: before.content?.slice(0, 1024) || '*—*' },
        { name: t(lang, 'logs.after'), value: after.content?.slice(0, 1024) || '*—*' },
        { name: t(lang, 'logs.channel'), value: `<#${after.channelId}>`, inline: true },
      ),
  );
}
