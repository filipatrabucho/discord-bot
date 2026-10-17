import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { getSettings } from '../database.js';
import { t, langOf, locales } from '../i18n/index.js';
import { embed, ephemeral, failure } from '../utils/embeds.js';
import { sendLog } from './logs.js';

export function rulesEmbed(lang, guild, customRules = null) {
  const rules = customRules ?? t(lang, 'rules.list').map((rule, i) => `**${i + 1}.** ${rule}`).join('\n\n');
  return embed('info')
    .setTitle(t(lang, 'rules.title', { server: guild.name }))
    .setDescription(rules)
    .setFooter({ text: t(lang, 'rules.footer') });
}

export function verifyPanel(lang, guild) {
  return {
    embeds: [
      embed('success')
        .setTitle(t(lang, 'verify.panelTitle'))
        .setDescription(t(lang, 'verify.panelDescription', { server: guild.name, word: t(lang, 'verify.word') }))
        .setThumbnail(guild.iconURL() ?? null),
    ],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('verify:start').setStyle(ButtonStyle.Success).setEmoji('✅').setLabel(t(lang, 'verify.button')),
      ),
    ],
  };
}

const ACCEPTED_WORDS = new Set(Object.values(locales).map((l) => l.verify.word.toLowerCase()));

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
    const modal = new ModalBuilder()
      .setCustomId('verify:submit')
      .setTitle(t(lang, 'verify.modalTitle'))
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('confirm')
            .setLabel(t(lang, 'verify.confirmLabel', { word: t(lang, 'verify.word') }))
            .setPlaceholder(t(lang, 'verify.word'))
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(30),
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('source')
            .setLabel(t(lang, 'verify.sourceLabel'))
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setMaxLength(100),
        ),
      );
    return interaction.showModal(modal);
  }

  if (action === 'submit') {
    const answer = interaction.fields.getTextInputValue('confirm').trim().toLowerCase();
    if (!ACCEPTED_WORDS.has(answer)) return failure(interaction, t(lang, 'verify.wrongWord', { word: t(lang, 'verify.word') }));
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
