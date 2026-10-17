import { ActionRowBuilder, ChannelType, ModalBuilder, PermissionFlagsBits, SlashCommandBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { getSettings } from '../database.js';
import { t, langOf } from '../i18n/index.js';
import { describe } from '../utils/localize.js';
import { embed, failure, success } from '../utils/embeds.js';
import { isStaff } from '../utils/permissions.js';

export const category = 'staff';

export const data = describe(new SlashCommandBuilder().setName('announce'), 'announce.description')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
  .setDMPermission(false)
  .addChannelOption((o) => describe(o.setName('channel'), 'announce.channel').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
  .addRoleOption((o) => describe(o.setName('ping'), 'announce.ping'));

export async function execute(interaction) {
  const lang = langOf(interaction.guild);
  const settings = getSettings(interaction.guild.id);
  if (!isStaff(interaction.member, settings)) return failure(interaction, t(lang, 'common.staffOnly'));
  const channel = interaction.options.getChannel('channel') ?? interaction.guild.channels.cache.get(settings.channels.announcements) ?? interaction.channel;
  const ping = interaction.options.getRole('ping');
  const input = (id, style, required, max) =>
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId(id).setLabel(t(lang, `announce.fields.${id}`)).setStyle(style).setRequired(required).setMaxLength(max),
    );
  return interaction.showModal(
    new ModalBuilder()
      .setCustomId(`announce:submit:${channel.id}:${ping?.id ?? 'none'}`)
      .setTitle(t(lang, 'announce.modalTitle'))
      .addComponents(
        input('title', TextInputStyle.Short, true, 256),
        input('message', TextInputStyle.Paragraph, true, 4000),
        input('image', TextInputStyle.Short, false, 500),
      ),
  );
}

export async function handleComponent(interaction, action, [channelId, pingId]) {
  if (action !== 'submit') return;
  const lang = langOf(interaction.guild);
  if (!isStaff(interaction.member, getSettings(interaction.guild.id))) return failure(interaction, t(lang, 'common.staffOnly'));
  const channel = interaction.guild.channels.cache.get(channelId);
  if (!channel) return failure(interaction, t(lang, 'common.channelMissing'));
  const image = interaction.fields.getTextInputValue('image')?.trim();
  const e = embed('primary')
    .setTitle(interaction.fields.getTextInputValue('title'))
    .setDescription(interaction.fields.getTextInputValue('message'))
    .setFooter({ text: interaction.user.username, iconURL: interaction.user.displayAvatarURL() })
    .setTimestamp();
  if (/^https?:\/\/\S+$/i.test(image ?? '')) e.setImage(image);
  const isEveryone = pingId === interaction.guild.id;
  const message = await channel.send({
    content: pingId !== 'none' ? (isEveryone ? '@everyone' : `<@&${pingId}>`) : undefined,
    embeds: [e],
    allowedMentions: isEveryone ? { parse: ['everyone'] } : { roles: pingId !== 'none' ? [pingId] : [] },
  });
  if (channel.type === ChannelType.GuildAnnouncement) await message.crosspost().catch(() => {});
  return success(interaction, t(lang, 'announce.sent', { url: message.url }));
}
