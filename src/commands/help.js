import { SlashCommandBuilder } from 'discord.js';
import { t, langOf } from '../i18n/index.js';
import { describe } from '../utils/localize.js';
import { embed, ephemeral } from '../utils/embeds.js';

export const category = 'community';

export const data = describe(new SlashCommandBuilder().setName('help'), 'help.description');

const ORDER = ['admin', 'staff', 'community', 'support', 'music', 'premium'];

export async function execute(interaction) {
  const lang = interaction.guild ? langOf(interaction.guild) : interaction.locale.startsWith('pt') ? 'pt' : 'en';
  const groups = Object.fromEntries(ORDER.map((c) => [c, []]));
  for (const cmd of interaction.client.commands.values()) {
    const json = cmd.data.toJSON();
    const subs = json.options?.filter((o) => o.type === 1) ?? [];
    const text = subs.length ? `\`/${json.name}\` ${subs.map((s) => `\`${s.name}\``).join(' ')}` : `\`/${json.name}\``;
    groups[cmd.category ?? 'community'].push(`${text}\n${t(lang, `cmd.${json.name}.description`)}`);
  }
  const e = embed('primary').setTitle(t(lang, 'help.title')).setDescription(t(lang, 'help.intro'));
  for (const c of ORDER) if (groups[c].length) e.addFields({ name: t(lang, `help.categories.${c}`), value: groups[c].join('\n').slice(0, 1024) });
  return interaction.reply({ embeds: [e], flags: ephemeral });
}
