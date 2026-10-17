import { SlashCommandBuilder } from 'discord.js';
import { describe } from '../utils/localize.js';
import { createSuggestion } from '../modules/suggestions.js';

export const category = 'community';

export const data = describe(new SlashCommandBuilder().setName('suggest'), 'suggest.description')
  .setDMPermission(false)
  .addStringOption((o) => describe(o.setName('idea'), 'suggest.idea').setRequired(true).setMinLength(10).setMaxLength(2000));

export async function execute(interaction) {
  return createSuggestion(interaction, interaction.options.getString('idea'));
}
