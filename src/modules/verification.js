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
