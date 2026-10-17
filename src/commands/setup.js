import { ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { t, langOf, LANGS } from '../i18n/index.js';
import { describe, choice } from '../utils/localize.js';
import { embed, ephemeral, failure } from '../utils/embeds.js';
import { runSetup, TEMPLATES } from '../modules/setup.js';

export const category = 'admin';

export const data = describe(new SlashCommandBuilder().setName('setup'), 'setup.description')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .setDMPermission(false)
  .addStringOption((o) =>
    describe(o.setName('template'), 'setup.template').addChoices(...TEMPLATES.map((x) => choice(`setup.templates.${x}`, x))),
  )
  .addStringOption((o) => describe(o.setName('language'), 'setup.language').addChoices(choice('langs.pt', 'pt'), choice('langs.en', 'en')))
  .addBooleanOption((o) => describe(o.setName('verification'), 'setup.verification'))
  .addBooleanOption((o) => describe(o.setName('cleanup'), 'setup.cleanup'));

export async function execute(interaction) {
  const template = interaction.options.getString('template') ?? 'community';
  const lang = interaction.options.getString('language') ?? langOf(interaction.guild);
  const verification = interaction.options.getBoolean('verification') ?? true;
  const cleanup = interaction.options.getBoolean('cleanup') ?? false;

  if (!interaction.guild.members.me.permissions.has(PermissionFlagsBits.Administrator)) {
    return failure(interaction, t(lang, 'setup.needAdmin'));
  }

  const id = [interaction.user.id, template, lang, Number(verification), Number(cleanup)].join(':');
  return interaction.reply({
    embeds: [
      embed('warning')
        .setTitle(t(lang, 'setup.previewTitle'))
        .setDescription(t(lang, 'setup.previewDescription'))
        .addFields(
          { name: t(lang, 'setup.fields.template'), value: t(lang, `cmd.setup.templates.${template}`), inline: true },
          { name: t(lang, 'setup.fields.language'), value: t(lang, `cmd.langs.${lang}`), inline: true },
          { name: t(lang, 'setup.fields.verification'), value: t(lang, verification ? 'common.yes' : 'common.no'), inline: true },
          { name: t(lang, 'setup.fields.cleanup'), value: t(lang, cleanup ? 'common.yes' : 'common.no'), inline: true },
          { name: t(lang, 'setup.fields.whatWillHappen'), value: t(lang, 'setup.whatWillHappen') },
        ),
    ],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`setup:confirm:${id}`).setStyle(ButtonStyle.Success).setLabel(t(lang, 'setup.confirm')),
        new ButtonBuilder().setCustomId(`setup:cancel:${interaction.user.id}`).setStyle(ButtonStyle.Secondary).setLabel(t(lang, 'common.cancel')),
      ),
    ],
    flags: ephemeral,
  });
}

export async function handleComponent(interaction, action, [userId, template, lang, verification, cleanup]) {
  if (interaction.user.id !== userId) return;
  const uiLang = LANGS.includes(lang) ? lang : langOf(interaction.guild);
  if (action === 'cancel') {
    return interaction.update({ embeds: [embed('danger').setDescription(t(uiLang, 'setup.cancelled'))], components: [] });
  }
  if (action !== 'confirm' || !TEMPLATES.includes(template)) return;

  const lines = [];
  const progress = () => embed('info').setTitle(t(uiLang, 'setup.runningTitle')).setDescription(lines.map((l, i) => `${i === lines.length - 1 ? '⏳' : '✅'} ${l}`).join('\n'));
  const report = async (line) => {
    lines.push(line);
    await interaction.editReply({ embeds: [progress()], components: [] }).catch(() => {});
  };
  await interaction.update({ embeds: [embed('info').setTitle(t(uiLang, 'setup.runningTitle'))], components: [] });

  try {
    const result = await runSetup(
      interaction.guild,
      { template, lang: uiLang, verification: verification === '1', cleanup: cleanup === '1' },
      report,
    );
    const c = (key) => (result.channels[key] ? `<#${result.channels[key]}>` : '—');
    const done = embed('success')
      .setTitle(t(uiLang, 'setup.doneTitle'))
      .setDescription(t(uiLang, 'setup.doneDescription', { roles: result.rolesCreated, channels: result.channelsCreated }))
      .addFields(
        { name: t(uiLang, 'setup.fields.keyChannels'), value: [c('welcome'), c('rules'), c('verify'), c('createTicket'), c('music'), c('premiumChat'), c('staffChat'), c('logs')].filter((x) => x !== '—').join(' ') },
        { name: t(uiLang, 'setup.fields.nextSteps'), value: t(uiLang, 'setup.nextSteps') },
      );
    if (result.notes.length) done.addFields({ name: '⚠️', value: result.notes.join('\n') });
    return interaction.editReply({ embeds: [done], components: [] });
  } catch (e) {
    console.error('[setup]', e);
    return interaction.editReply({ embeds: [embed('danger').setDescription(t(uiLang, 'setup.failed', { error: e.message }))], components: [] });
  }
}
