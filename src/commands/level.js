import { SlashCommandBuilder } from 'discord.js';
import { t, langOf } from '../i18n/index.js';
import { describe } from '../utils/localize.js';
import { embed } from '../utils/embeds.js';
import { getRank, progressBar, topLevels } from '../modules/levels.js';

export const category = 'community';

export const data = describe(new SlashCommandBuilder().setName('level'), 'level.description')
  .setDMPermission(false)
  .addSubcommand((s) => describe(s.setName('rank'), 'level.rank').addUserOption((o) => describe(o.setName('user'), 'level.user')))
  .addSubcommand((s) => describe(s.setName('top'), 'level.top'));

export async function execute(interaction) {
  const lang = langOf(interaction.guild);
  if (interaction.options.getSubcommand() === 'top') {
    const rows = topLevels(interaction.guild.id);
    const text = rows.map((r, i) => `**${i + 1}.** <@${r.userId}> — ${t(lang, 'levels.levelShort', { level: r.level })} (${r.xp} XP)`).join('\n');
    return interaction.reply({ embeds: [embed('primary').setTitle(t(lang, 'levels.topTitle')).setDescription(text || t(lang, 'levels.noData'))] });
  }
  const user = interaction.options.getUser('user') ?? interaction.user;
  const r = getRank(interaction.guild.id, user.id);
  return interaction.reply({
    embeds: [
      embed('primary')
        .setAuthor({ name: user.username, iconURL: user.displayAvatarURL() })
        .addFields(
          { name: t(lang, 'levels.level'), value: String(r.level), inline: true },
          { name: t(lang, 'levels.rank'), value: `#${r.position}`, inline: true },
          { name: 'XP', value: `${r.xp} / ${r.needed}`, inline: true },
        )
        .setDescription(progressBar(r.xp, r.needed)),
    ],
  });
}
