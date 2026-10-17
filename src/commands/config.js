import { ChannelType, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { getSettings, updateSettings } from '../database.js';
import { t, langOf } from '../i18n/index.js';
import { describe, choice } from '../utils/localize.js';
import { embed, ephemeral, success } from '../utils/embeds.js';

export const category = 'admin';

const ROLE_KEYS = ['admin', 'staff', 'premium', 'dj', 'member', 'bots', 'autorole'];
const CHANNEL_KEYS = ['welcome', 'goodbye', 'rules', 'verify', 'announcements', 'selfRoles', 'logs', 'music', 'createTicket', 'ticketLogs', 'suggestions', 'levelUp', 'premiumChat', 'staffChat'];
const TOGGLES = {
  levels: ['levels', 'enabled'],
  musicRestrict: ['music', 'restrictToChannel'],
  boostersPremium: ['premium', 'boosters'],
  verification: ['verification', 'enabled'],
};

export const data = describe(new SlashCommandBuilder().setName('config'), 'config.description')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .setDMPermission(false)
  .addSubcommand((s) => describe(s.setName('view'), 'config.view'))
  .addSubcommand((s) =>
    describe(s.setName('role'), 'config.role')
      .addStringOption((o) => describe(o.setName('type'), 'config.roleType').setRequired(true).addChoices(...ROLE_KEYS.map((k) => choice(`config.roleTypes.${k}`, k))))
      .addRoleOption((o) => describe(o.setName('role'), 'config.roleOption')),
  )
  .addSubcommand((s) =>
    describe(s.setName('channel'), 'config.channel')
      .addStringOption((o) => describe(o.setName('type'), 'config.channelType').setRequired(true).addChoices(...CHANNEL_KEYS.map((k) => choice(`config.channelTypes.${k}`, k))))
      .addChannelOption((o) => describe(o.setName('channel'), 'config.channelOption').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)),
  )
  .addSubcommand((s) =>
    describe(s.setName('ticket-category'), 'config.ticketCategory').addChannelOption((o) =>
      describe(o.setName('category'), 'config.categoryOption').setRequired(true).addChannelTypes(ChannelType.GuildCategory),
    ),
  )
  .addSubcommand((s) =>
    describe(s.setName('toggle'), 'config.toggle')
      .addStringOption((o) => describe(o.setName('feature'), 'config.feature').setRequired(true).addChoices(...Object.keys(TOGGLES).map((k) => choice(`config.features.${k}`, k))))
      .addBooleanOption((o) => describe(o.setName('enabled'), 'config.enabled').setRequired(true)),
  );

export async function execute(interaction) {
  const { guild } = interaction;
  const lang = langOf(guild);
  const sub = interaction.options.getSubcommand();

  if (sub === 'role') {
    const type = interaction.options.getString('type');
    const role = interaction.options.getRole('role');
    updateSettings(guild.id, { roles: { [type]: role?.id ?? null } });
    return success(interaction, t(lang, 'config.saved', { item: t(lang, `cmd.config.roleTypes.${type}`), value: role ? `<@&${role.id}>` : '—' }));
  }
  if (sub === 'channel') {
    const type = interaction.options.getString('type');
    const channel = interaction.options.getChannel('channel');
    updateSettings(guild.id, { channels: { [type]: channel?.id ?? null } });
    return success(interaction, t(lang, 'config.saved', { item: t(lang, `cmd.config.channelTypes.${type}`), value: channel ? `<#${channel.id}>` : '—' }));
  }
  if (sub === 'ticket-category') {
    const channel = interaction.options.getChannel('category');
    updateSettings(guild.id, { categories: { tickets: channel.id } });
    return success(interaction, t(lang, 'config.saved', { item: '🎫', value: channel.name }));
  }
  if (sub === 'toggle') {
    const feature = interaction.options.getString('feature');
    const enabled = interaction.options.getBoolean('enabled');
    const [section, key] = TOGGLES[feature];
    updateSettings(guild.id, { [section]: { [key]: enabled } });
    return success(interaction, t(lang, 'config.saved', { item: t(lang, `cmd.config.features.${feature}`), value: t(lang, enabled ? 'common.on' : 'common.off') }));
  }

  const s = getSettings(guild.id);
  const roles = ROLE_KEYS.map((k) => `**${t(lang, `cmd.config.roleTypes.${k}`)}:** ${s.roles[k] ? `<@&${s.roles[k]}>` : '—'}`).join('\n');
  const channels = CHANNEL_KEYS.map((k) => `**${t(lang, `cmd.config.channelTypes.${k}`)}:** ${s.channels[k] ? `<#${s.channels[k]}>` : '—'}`).join('\n');
  const toggles = Object.entries(TOGGLES)
    .map(([k, [section, key]]) => `**${t(lang, `cmd.config.features.${k}`)}:** ${s[section][key] ? '🟢' : '🔴'}`)
    .join('\n');
  return interaction.reply({
    embeds: [
      embed('primary')
        .setTitle(t(lang, 'config.title'))
        .addFields(
          { name: t(lang, 'config.language'), value: t(lang, `cmd.langs.${lang}`) },
          { name: t(lang, 'config.roles'), value: roles, inline: true },
          { name: t(lang, 'config.channels'), value: channels, inline: true },
          { name: t(lang, 'config.features'), value: toggles },
        ),
    ],
    flags: ephemeral,
  });
}
