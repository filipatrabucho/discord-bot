import { ActionRowBuilder, ChannelType, ModalBuilder, PermissionFlagsBits, SlashCommandBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { getSettings, updateSettings } from '../database.js';
import { t, langOf } from '../i18n/index.js';
import { describe } from '../utils/localize.js';
import { ephemeral, failure, success } from '../utils/embeds.js';
import { buildWelcome } from '../modules/welcome.js';

export const category = 'admin';

export const data = describe(new SlashCommandBuilder().setName('welcome'), 'welcome.description')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .setDMPermission(false)
  .addSubcommand((s) =>
    describe(s.setName('channel'), 'welcome.channel').addChannelOption((o) =>
      describe(o.setName('channel'), 'welcome.channelOption').setRequired(true).addChannelTypes(ChannelType.GuildText),
    ),
  )
  .addSubcommand((s) => describe(s.setName('message'), 'welcome.message'))
  .addSubcommand((s) => describe(s.setName('goodbye'), 'welcome.goodbye'))
  .addSubcommand((s) => describe(s.setName('image'), 'welcome.image').addStringOption((o) => describe(o.setName('url'), 'welcome.imageUrl')))
  .addSubcommand((s) => describe(s.setName('dm'), 'welcome.dm').addBooleanOption((o) => describe(o.setName('enabled'), 'welcome.enabled').setRequired(true)))
  .addSubcommand((s) =>
    describe(s.setName('toggle'), 'welcome.toggle')
      .addBooleanOption((o) => describe(o.setName('welcome'), 'welcome.toggleWelcome'))
      .addBooleanOption((o) => describe(o.setName('goodbye'), 'welcome.toggleGoodbye')),
  )
  .addSubcommand((s) => describe(s.setName('test'), 'welcome.test'));

function messageModal(lang, kind, current) {
  return new ModalBuilder()
    .setCustomId(`welcome:${kind}`)
    .setTitle(t(lang, kind === 'goodbye' ? 'welcome.goodbyeModalTitle' : 'welcome.modalTitle'))
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('text')
          .setLabel(t(lang, 'welcome.modalLabel'))
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('{user} {username} {server} {count} {inviter} {invites}')
          .setValue(current)
          .setMaxLength(2000)
          .setRequired(true),
      ),
    );
}

export async function execute(interaction) {
  const { guild } = interaction;
  const lang = langOf(guild);
  const settings = getSettings(guild.id);
  const sub = interaction.options.getSubcommand();

  switch (sub) {
    case 'channel': {
      const channel = interaction.options.getChannel('channel');
      updateSettings(guild.id, { channels: { welcome: channel.id } });
      return success(interaction, t(lang, 'welcome.channelSet', { channel: `<#${channel.id}>` }));
    }
    case 'message':
      return interaction.showModal(messageModal(lang, 'message', settings.welcome.message ?? t(lang, 'welcome.defaultMessage')));
    case 'goodbye':
      return interaction.showModal(messageModal(lang, 'goodbye', settings.welcome.goodbyeMessage ?? t(lang, 'welcome.defaultGoodbye')));
    case 'image': {
      const url = interaction.options.getString('url');
      if (url && !/^https?:\/\/\S+$/i.test(url)) return failure(interaction, t(lang, 'welcome.invalidUrl'));
      updateSettings(guild.id, { welcome: { image: url ?? null } });
      return success(interaction, t(lang, url ? 'welcome.imageSet' : 'welcome.imageRemoved'));
    }
    case 'dm': {
      const enabled = interaction.options.getBoolean('enabled');
      updateSettings(guild.id, { welcome: { dm: enabled } });
      return success(interaction, t(lang, 'welcome.dmSet', { state: t(lang, enabled ? 'common.on' : 'common.off') }));
    }
    case 'toggle': {
      const w = interaction.options.getBoolean('welcome');
      const g = interaction.options.getBoolean('goodbye');
      const next = updateSettings(guild.id, { welcome: { ...(w !== null && { enabled: w }), ...(g !== null && { goodbyeEnabled: g }) } });
      return success(
        interaction,
        t(lang, 'welcome.toggled', {
          welcome: t(lang, next.welcome.enabled ? 'common.on' : 'common.off'),
          goodbye: t(lang, next.welcome.goodbyeEnabled ? 'common.on' : 'common.off'),
        }),
      );
    }
    case 'test':
      return interaction.reply({ ...buildWelcome(interaction.member, null), flags: ephemeral });
  }
}

/** Modal submissions from /welcome message and /welcome goodbye. */
export async function handleComponent(interaction, action) {
  const lang = langOf(interaction.guild);
  const text = interaction.fields.getTextInputValue('text');
  updateSettings(interaction.guild.id, { welcome: action === 'goodbye' ? { goodbyeMessage: text } : { message: text } });
  return success(interaction, t(lang, 'welcome.messageSaved'));
}
