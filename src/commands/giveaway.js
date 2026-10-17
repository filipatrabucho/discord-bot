import { ChannelType, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { getSettings } from '../database.js';
import { t, langOf } from '../i18n/index.js';
import { describe } from '../utils/localize.js';
import { failure, success } from '../utils/embeds.js';
import { isStaff } from '../utils/permissions.js';
import { parseDuration } from '../utils/time.js';
import { endGiveaway, findGiveaway, startGiveaway } from '../modules/giveaways.js';

export const category = 'community';

const idOpt = (o) => describe(o.setName('id'), 'giveaway.id').setRequired(true);

export const data = describe(new SlashCommandBuilder().setName('giveaway'), 'giveaway.description')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
  .setDMPermission(false)
  .addSubcommand((s) =>
    describe(s.setName('start'), 'giveaway.start')
      .addStringOption((o) => describe(o.setName('prize'), 'giveaway.prize').setRequired(true).setMaxLength(200))
      .addStringOption((o) => describe(o.setName('duration'), 'giveaway.duration').setRequired(true))
      .addIntegerOption((o) => describe(o.setName('winners'), 'giveaway.winners').setMinValue(1).setMaxValue(20))
      .addChannelOption((o) => describe(o.setName('channel'), 'giveaway.channel').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)),
  )
  .addSubcommand((s) => describe(s.setName('end'), 'giveaway.end').addStringOption(idOpt))
  .addSubcommand((s) => describe(s.setName('reroll'), 'giveaway.reroll').addStringOption(idOpt));

export async function execute(interaction) {
  const lang = langOf(interaction.guild);
  if (!isStaff(interaction.member, getSettings(interaction.guild.id))) return failure(interaction, t(lang, 'common.staffOnly'));
  const sub = interaction.options.getSubcommand();

  if (sub === 'start') {
    const durationMs = parseDuration(interaction.options.getString('duration'));
    if (!durationMs) return failure(interaction, t(lang, 'common.invalidDuration'));
    return startGiveaway(interaction, {
      prize: interaction.options.getString('prize'),
      durationMs,
      winners: interaction.options.getInteger('winners') ?? 1,
      channel: interaction.options.getChannel('channel') ?? interaction.channel,
    });
  }

  const g = findGiveaway(interaction.guild.id, interaction.options.getString('id').trim());
  if (!g) return failure(interaction, t(lang, 'giveaways.notFound'));
  if (sub === 'end' && g.ended) return failure(interaction, t(lang, 'giveaways.over'));
  if (sub === 'reroll' && !g.ended) return failure(interaction, t(lang, 'giveaways.notEnded'));
  await endGiveaway(interaction.client, g.id, { reroll: sub === 'reroll' });
  return success(interaction, t(lang, sub === 'end' ? 'giveaways.endedNow' : 'giveaways.rerollDone'));
}
