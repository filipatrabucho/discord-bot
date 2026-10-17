import { SlashCommandBuilder } from 'discord.js';
import { describe, choice } from '../utils/localize.js';
import { control, LOOP_MODES } from '../modules/music.js';

export const category = 'music';

export const data = describe(new SlashCommandBuilder().setName('music'), 'music.description')
  .setDMPermission(false)
  .addSubcommand((s) => describe(s.setName('skip'), 'music.skip'))
  .addSubcommand((s) => describe(s.setName('stop'), 'music.stop'))
  .addSubcommand((s) => describe(s.setName('pause'), 'music.pause'))
  .addSubcommand((s) => describe(s.setName('resume'), 'music.resume'))
  .addSubcommand((s) => describe(s.setName('nowplaying'), 'music.nowplaying'))
  .addSubcommand((s) => describe(s.setName('queue'), 'music.queue').addIntegerOption((o) => describe(o.setName('page'), 'music.page').setMinValue(1)))
  .addSubcommand((s) => describe(s.setName('shuffle'), 'music.shuffle'))
  .addSubcommand((s) =>
    describe(s.setName('volume'), 'music.volume').addIntegerOption((o) => describe(o.setName('level'), 'music.level').setRequired(true).setMinValue(1).setMaxValue(100)),
  )
  .addSubcommand((s) =>
    describe(s.setName('loop'), 'music.loop').addStringOption((o) =>
      describe(o.setName('mode'), 'music.mode').setRequired(true).addChoices(...Object.keys(LOOP_MODES).map((k) => choice(`music.modes.${k}`, k))),
    ),
  )
  .addSubcommand((s) =>
    describe(s.setName('remove'), 'music.remove').addIntegerOption((o) => describe(o.setName('position'), 'music.position').setRequired(true).setMinValue(1)),
  );

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  const arg = {
    volume: () => interaction.options.getInteger('level'),
    loop: () => LOOP_MODES[interaction.options.getString('mode')],
    queue: () => interaction.options.getInteger('page'),
    remove: () => interaction.options.getInteger('position'),
  }[sub]?.();
  return control(interaction, sub, arg);
}
