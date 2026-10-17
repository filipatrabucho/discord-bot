import { ChannelType, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { getSettings, updateSettings } from '../database.js';
import { t, langOf } from '../i18n/index.js';
import { describe } from '../utils/localize.js';
import { failure, success } from '../utils/embeds.js';
import { rulesEmbed, verifyPanel } from '../modules/verification.js';

export const category = 'admin';

export const data = describe(new SlashCommandBuilder().setName('verification'), 'verification.description')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .setDMPermission(false)
  .addSubcommand((s) =>
    describe(s.setName('panel'), 'verification.panel')
      .addRoleOption((o) => describe(o.setName('role'), 'verification.role'))
      .addChannelOption((o) => describe(o.setName('channel'), 'verification.channel').addChannelTypes(ChannelType.GuildText)),
  )
  .addSubcommand((s) =>
    describe(s.setName('rules'), 'verification.rules')
      .addChannelOption((o) => describe(o.setName('channel'), 'verification.channel').addChannelTypes(ChannelType.GuildText))
      .addStringOption((o) => describe(o.setName('text'), 'verification.rulesText').setMaxLength(4000)),
  )
  .addSubcommand((s) =>
    describe(s.setName('account-age'), 'verification.accountAge').addIntegerOption((o) =>
      describe(o.setName('days'), 'verification.days').setRequired(true).setMinValue(0).setMaxValue(365),
    ),
  )
  .addSubcommand((s) =>
    describe(s.setName('toggle'), 'verification.toggle').addBooleanOption((o) => describe(o.setName('enabled'), 'verification.enabled').setRequired(true)),
  );

export async function execute(interaction) {
  const { guild } = interaction;
  const lang = langOf(guild);
  const sub = interaction.options.getSubcommand();
  const channel = interaction.options.getChannel('channel') ?? interaction.channel;

  if (sub === 'panel') {
    const role = interaction.options.getRole('role');
    if (role) updateSettings(guild.id, { roles: { member: role.id } });
    const settings = getSettings(guild.id);
    if (!settings.roles.member) return failure(interaction, t(lang, 'verify.notConfigured'));
    updateSettings(guild.id, { verification: { enabled: true, mode: 'button' }, channels: { verify: channel.id } });
    await channel.send(verifyPanel(lang, guild));
    return success(interaction, t(lang, 'verification.panelSent', { channel: `<#${channel.id}>` }));
  }
  if (sub === 'rules') {
    // Saved so the verification pop-up shows the same rules.
    const text = interaction.options.getString('text')?.replaceAll('\\n', '\n');
    updateSettings(guild.id, { channels: { rules: channel.id }, ...(text && { verification: { rules: text } }) });
    await channel.send({ embeds: [rulesEmbed(lang, guild)] });
    return success(interaction, t(lang, 'verification.rulesSent', { channel: `<#${channel.id}>` }));
  }
  if (sub === 'account-age') {
    const days = interaction.options.getInteger('days');
    updateSettings(guild.id, { verification: { minAccountAgeDays: days } });
    return success(interaction, t(lang, 'verification.ageSet', { days }));
  }
  if (sub === 'toggle') {
    const enabled = interaction.options.getBoolean('enabled');
    updateSettings(guild.id, { verification: { enabled } });
    return success(interaction, t(lang, 'verification.toggled', { state: t(lang, enabled ? 'common.on' : 'common.off') }));
  }
}
