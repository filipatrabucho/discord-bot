import { GuildOnboardingMode, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { getSettings, updateSettings } from '../database.js';
import { t, langOf } from '../i18n/index.js';
import { describe } from '../utils/localize.js';
import { embed, ephemeral, failure } from '../utils/embeds.js';
import { enableRulesScreening } from '../modules/verification.js';
import { gateChannels } from '../modules/setup.js';

export const category = 'admin';

export const data = describe(new SlashCommandBuilder().setName('onboarding'), 'onboarding.description')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .setDMPermission(false)
  .addSubcommand((s) => describe(s.setName('setup'), 'onboarding.setup'))
  .addSubcommand((s) => describe(s.setName('rules'), 'onboarding.rules'))
  .addSubcommand((s) => describe(s.setName('status'), 'onboarding.status'));

export async function execute(interaction) {
  const { guild } = interaction;
  const lang = langOf(guild);
  const settings = getSettings(guild.id);

  if (!guild.features.includes('COMMUNITY')) {
    return failure(interaction, t(lang, 'onboarding.needCommunity'));
  }

  if (interaction.options.getSubcommand() === 'rules') {
    await interaction.deferReply({ flags: ephemeral });
    if (!settings.roles.member || !guild.roles.cache.has(settings.roles.member)) {
      return interaction.editReply({ embeds: [embed('danger').setDescription(t(lang, 'verify.notConfigured'))] });
    }
    // Members now get the Member role only after accepting Discord's own rules pop-up.
    updateSettings(guild.id, { verification: { enabled: true, mode: 'discord' } });
    await gateChannels(guild);
    // Anyone who got the Member role without accepting the rules yet loses it until they accept.
    const members = await guild.members.fetch().catch(() => null);
    for (const m of members?.values() ?? []) {
      if (m.pending && m.roles.cache.has(settings.roles.member)) await m.roles.remove(settings.roles.member, 'Has not accepted the rules').catch(() => {});
    }
    const ok = await enableRulesScreening(guild, lang).then(() => true, (e) => {
      console.warn('[onboarding] rules screening:', e.message);
      return false;
    });
    return interaction.editReply({
      embeds: [embed(ok ? 'success' : 'warning').setDescription(t(lang, ok ? 'onboarding.rulesDone' : 'onboarding.rulesManual'))],
    });
  }

  if (interaction.options.getSubcommand() === 'status') {
    const ob = await guild.fetchOnboarding();
    return interaction.reply({
      embeds: [
        embed('info')
          .setTitle(t(lang, 'onboarding.statusTitle'))
          .addFields(
            { name: t(lang, 'onboarding.enabled'), value: ob.enabled ? '🟢' : '🔴', inline: true },
            { name: t(lang, 'onboarding.prompts'), value: String(ob.prompts.size), inline: true },
            { name: t(lang, 'onboarding.defaultChannels'), value: ob.defaultChannels.map((c) => `<#${c.id}>`).join(' ') || '—' },
          ),
      ],
      flags: ephemeral,
    });
  }

  await interaction.deferReply({ flags: ephemeral });
  const ids = { ...settings.channelIds, ...Object.fromEntries(Object.entries(settings.channels).filter(([, v]) => v)) };
  const existing = (keys) => keys.map((k) => ids[k]).filter((id) => id && guild.channels.cache.has(id));

  // Rules & updates channels are required for Community servers and show in the onboarding flow.
  await guild
    .edit({ rulesChannel: ids.rules ?? undefined, publicUpdatesChannel: ids.staffChat ?? ids.logs ?? undefined })
    .catch(() => {});

  const prompts = [];
  if (settings.selfRoles.length) {
    prompts.push({
      title: t(lang, 'onboarding.interestsPrompt'),
      singleSelect: false,
      required: false,
      inOnboarding: true,
      options: settings.selfRoles
        .filter((r) => guild.roles.cache.has(r.id))
        .slice(0, 50)
        .map((r) => ({ title: r.label, emoji: r.emoji, roles: [r.id] })),
    });
  }
  const optional = existing(['music', 'createTicket', 'suggestions']);
  if (optional.length) {
    prompts.push({
      title: t(lang, 'onboarding.channelsPrompt'),
      singleSelect: false,
      required: false,
      inOnboarding: true,
      options: [
        ids.music && { title: t(lang, 'onboarding.options.music'), emoji: '🎵', channels: existing(['music', 'musicVoice']) },
        ids.createTicket && { title: t(lang, 'onboarding.options.support'), emoji: '🎫', channels: existing(['createTicket']) },
        ids.suggestions && { title: t(lang, 'onboarding.options.suggestions'), emoji: '💡', channels: existing(['suggestions']) },
      ].filter((o) => o && o.channels.length),
    });
  }

  try {
    await guild.editOnboarding({
      enabled: true,
      mode: GuildOnboardingMode.OnboardingDefault,
      defaultChannels: existing(['welcome', 'rules', 'announcements', 'selfRoles', 'general', 'media', 'memes', 'clips', 'lfg', 'homework', 'events', 'botCommands', 'voiceLounge']),
      prompts,
    });
    return interaction.editReply({ embeds: [embed('success').setDescription(t(lang, 'onboarding.done'))] });
  } catch (e) {
    return interaction.editReply({ embeds: [embed('danger').setDescription(t(lang, 'onboarding.failed', { error: e.message }))] });
  }
}
