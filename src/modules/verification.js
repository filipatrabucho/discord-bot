import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, CheckboxBuilder, LabelBuilder, ModalBuilder, TextDisplayBuilder, TextInputBuilder, TextInputStyle,
} from 'discord.js';
import { getSettings } from '../database.js';
import { t, langOf } from '../i18n/index.js';
import { embed, ephemeral, failure } from '../utils/embeds.js';
import { sendLog } from './logs.js';

/** The server's rules as text: the custom ones saved with /verification rules, or the defaults. */
export function rulesText(lang, guildId) {
  return getSettings(guildId).verification.rules ?? t(lang, 'rules.list').map((rule, i) => `**${i + 1}.** ${rule}`).join('\n\n');
}

export function rulesEmbed(lang, guild) {
  return embed('info')
    .setTitle(t(lang, 'rules.title', { server: guild.name }))
    .setDescription(rulesText(lang, guild.id))
    .setFooter({ text: t(lang, 'rules.footer') });
}

export function verifyPanel(lang, guild) {
  return {
    embeds: [
      embed('success')
        .setTitle(t(lang, 'verify.panelTitle'))
        .setDescription(t(lang, 'verify.panelDescription', { server: guild.name }))
        .setThumbnail(guild.iconURL() ?? null),
    ],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('verify:start').setStyle(ButtonStyle.Success).setEmoji('✅').setLabel(t(lang, 'verify.button')),
      ),
    ],
  };
}

export async function handleComponent(interaction, action) {
  const { guild, member } = interaction;
  const lang = langOf(guild);
  const settings = getSettings(guild.id);
  const role = guild.roles.cache.get(settings.roles.member);
  if (!role) return failure(interaction, t(lang, 'verify.notConfigured'));
  if (member.roles.cache.has(role.id)) return failure(interaction, t(lang, 'verify.already'));
  // With Discord's own rules pop-up in charge, accepting it is the only way in.
  if (settings.verification.mode === 'discord') return failure(interaction, t(lang, 'verify.useDiscordPopup'));

  if (action === 'start') {
    const minDays = settings.verification.minAccountAgeDays;
    if (minDays && Date.now() - interaction.user.createdTimestamp < minDays * 86_400_000) {
      return failure(interaction, t(lang, 'verify.accountTooNew', { days: minDays }));
    }
    // The whole rules text plus an "I accept" checkbox, all in one pop-up.
    const rules = rulesText(lang, guild.id);
    const modal = new ModalBuilder()
      .setCustomId('verify:submit')
      .setTitle(t(lang, 'verify.modalTitle', { server: guild.name }).slice(0, 45))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${t(lang, 'rules.title', { server: guild.name })}\n${rules}`.slice(0, 3900)))
      .addLabelComponents(
        new LabelBuilder()
          .setLabel(t(lang, 'verify.acceptLabel'))
          .setDescription(t(lang, 'verify.acceptDescription'))
          .setCheckboxComponent(new CheckboxBuilder().setCustomId('accept')),
        new LabelBuilder()
          .setLabel(t(lang, 'verify.sourceLabel'))
          .setTextInputComponent(new TextInputBuilder().setCustomId('source').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(100)),
      );
    return interaction.showModal(modal);
  }

  if (action === 'submit') {
    if (!interaction.fields.getCheckbox('accept')) return failure(interaction, t(lang, 'verify.mustAccept'));
    await member.roles.add(role, 'Verified');
    const source = interaction.fields.getTextInputValue('source')?.trim();
    await sendLog(
      guild,
      embed('success')
        .setAuthor({ name: interaction.user.tag, iconURL: interaction.user.displayAvatarURL() })
        .setDescription(t(lang, 'verify.logVerified', { user: `<@${member.id}>` }))
        .addFields(source ? [{ name: t(lang, 'verify.sourceLabel'), value: source }] : []),
    );
    return interaction.reply({
      embeds: [embed('success').setDescription(t(lang, 'verify.success', { server: guild.name }))],
      flags: ephemeral,
    });
  }
}

/** Rules as a plain list for Discord's native rules screening (max 16 rules of 300 characters). */
export function rulesList(lang, guildId) {
  return rulesText(lang, guildId)
    .split(/\n+/)
    .map((line) => line.replace(/^\s*(\*\*)?\d+[.)]\s*(\*\*)?\s*/, '').trim())
    .filter(Boolean)
    .slice(0, 16)
    .map((rule) => rule.slice(0, 300));
}

/**
 * Turns on Discord's native "accept the rules" pop-up (Community servers only).
 * This endpoint isn't officially documented for bots, so callers must handle failure.
 */
export async function enableRulesScreening(guild, lang) {
  await guild.client.rest.patch(`/guilds/${guild.id}/member-verification`, {
    body: {
      enabled: true,
      description: t(lang, 'onboarding.screeningDescription', { server: guild.name }).slice(0, 300),
      form_fields: [{ field_type: 'TERMS', label: t(lang, 'onboarding.screeningLabel'), required: true, values: rulesList(lang, guild.id) }],
    },
  });
}

/** In 'discord' mode: give the Member role when someone accepts the native rules pop-up. */
export async function onScreeningPassed(before, after) {
  // before.pending is null when the old state wasn't cached; only a known `false` means nothing changed.
  if (before.pending === false || after.pending !== false || after.user.bot) return;
  const settings = getSettings(after.guild.id);
  if (!settings.verification.enabled || settings.verification.mode !== 'discord') return;
  const role = after.guild.roles.cache.get(settings.roles.member);
  if (!role || after.roles.cache.has(role.id)) return;
  await after.roles.add(role, 'Accepted the server rules');
  await sendLog(after.guild, embed('success').setDescription(t(langOf(after.guild), 'verify.logVerified', { user: `<@${after.id}>` })));
}
