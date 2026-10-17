import { SlashCommandBuilder } from 'discord.js';
import { describe } from '../utils/localize.js';
import { autocomplete, play } from '../modules/music.js';

export const category = 'music';

export const data = describe(new SlashCommandBuilder().setName('play'), 'play.description')
  .setDMPermission(false)
  .addStringOption((o) => describe(o.setName('query'), 'play.query').setRequired(true).setMaxLength(500).setAutocomplete(true));

export { autocomplete };

export async function execute(interaction) {
  return play(interaction, interaction.options.getString('query'));
}
