import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { updateSettings } from '../database.js';
import { t } from '../i18n/index.js';
import { describe, choice } from '../utils/localize.js';
import { success } from '../utils/embeds.js';

export const category = 'admin';

export const data = describe(new SlashCommandBuilder().setName('language'), 'language.description')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .setDMPermission(false)
  .addStringOption((o) => describe(o.setName('language'), 'language.option').setRequired(true).addChoices(choice('langs.pt', 'pt'), choice('langs.en', 'en')));

export async function execute(interaction) {
  const lang = interaction.options.getString('language');
  updateSettings(interaction.guild.id, { lang });
  return success(interaction, t(lang, 'language.changed'));
}
