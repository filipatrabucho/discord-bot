import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { Player, QueueRepeatMode } from 'discord-player';
import { DefaultExtractors } from '@discord-player/extractor';
import { config } from '../config.js';
import { getSettings } from '../database.js';
import { t, langOf } from '../i18n/index.js';
import { embed, failure, success } from '../utils/embeds.js';
import { isStaff } from '../utils/permissions.js';

export let player;

export async function initMusic(client) {
  player = new Player(client);
  await player.extractors.loadMulti(DefaultExtractors);
  if (config.enableYoutube) {
    try {
      const { YoutubeExtractor } = await import('discord-player-youtubei');
      await player.extractors.register(YoutubeExtractor, {});
    } catch (e) {
      console.warn('[music] YouTube extractor not loaded:', e.message);
    }
  }

  const notify = (queue, color, key, vars) =>
    queue.metadata?.channel?.send({ embeds: [embed(color).setDescription(t(queue.metadata.lang, key, vars))] }).catch(() => {});

  player.events.on('playerStart', (queue, track) => {
    queue.metadata?.channel
      ?.send({ embeds: [nowPlayingEmbed(queue.metadata.lang, queue, track)], components: [controls(queue.metadata.lang)] })
      .catch(() => {});
  });
  player.events.on('emptyQueue', (queue) => notify(queue, 'info', 'music.queueEnded'));
  player.events.on('emptyChannel', (queue) => notify(queue, 'info', 'music.leftEmpty'));
  player.events.on('playerError', (queue, error) => {
    console.warn('[music] player error:', error.message);
    notify(queue, 'danger', 'music.playerError');
  });
  player.events.on('error', (queue, error) => console.warn('[music] queue error:', error.message));
}

export function nowPlayingEmbed(lang, queue, track) {
  return embed('primary')
    .setAuthor({ name: t(lang, 'music.nowPlaying') })
    .setTitle(track.title.slice(0, 256))
    .setURL(track.url)
    .setThumbnail(track.thumbnail || null)
    .addFields(
      { name: t(lang, 'music.author'), value: track.author || '—', inline: true },
      { name: t(lang, 'music.duration'), value: track.duration || '—', inline: true },
      { name: t(lang, 'music.requestedBy'), value: track.requestedBy ? `<@${track.requestedBy.id}>` : '—', inline: true },
    )
    .setFooter({ text: t(lang, 'music.inQueue', { count: queue.tracks.size }) });
}

function controls(lang) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('music:pause').setStyle(ButtonStyle.Secondary).setEmoji('⏯️'),
    new ButtonBuilder().setCustomId('music:skip').setStyle(ButtonStyle.Secondary).setEmoji('⏭️'),
    new ButtonBuilder().setCustomId('music:loop').setStyle(ButtonStyle.Secondary).setEmoji('🔁'),
    new ButtonBuilder().setCustomId('music:shuffle').setStyle(ButtonStyle.Secondary).setEmoji('🔀'),
    new ButtonBuilder().setCustomId('music:stop').setStyle(ButtonStyle.Danger).setEmoji('⏹️').setLabel(t(lang, 'music.stopButton')),
  );
}

/** Checks the music channel restriction and that the member is in (the bot's) voice channel. Returns an error message or null. */
export function checkVoice(interaction, { requireQueue = true } = {}) {
  const { guild, member } = interaction;
  const lang = langOf(guild);
  const settings = getSettings(guild.id);
  const musicChannel = settings.channels.music;
  if (musicChannel && settings.music.restrictToChannel && interaction.channelId !== musicChannel && guild.channels.cache.has(musicChannel)) {
    return t(lang, 'music.wrongChannel', { channel: `<#${musicChannel}>` });
  }
  const voice = member.voice.channel;
  if (!voice) return t(lang, 'music.joinVoice');
  const botVoice = guild.members.me.voice.channelId;
  if (botVoice && botVoice !== voice.id) return t(lang, 'music.sameVoice', { channel: `<#${botVoice}>` });
  if (requireQueue && !player.nodes.get(guild.id)?.currentTrack) return t(lang, 'music.nothingPlaying');
  return null;
}

/** DJ, staff, the person who requested the current song, or anyone when alone with the bot / no DJ role exists. */
export function canControl(member, queue) {
  const settings = getSettings(member.guild.id);
  if (!settings.roles.dj || isStaff(member, settings) || member.roles.cache.has(settings.roles.dj)) return true;
  if (queue.currentTrack?.requestedBy?.id === member.id) return true;
  return member.voice.channel.members.filter((m) => !m.user.bot).size <= 1;
}

export async function play(interaction, query) {
  const lang = langOf(interaction.guild);
  const error = checkVoice(interaction, { requireQueue: false });
  if (error) return failure(interaction, error);
  await interaction.deferReply();
  try {
    const { track, searchResult } = await player.play(interaction.member.voice.channel, query, {
      requestedBy: interaction.user,
      nodeOptions: {
        metadata: { channel: interaction.channel, lang },
        volume: 60,
        selfDeaf: true,
        leaveOnEmpty: true,
        leaveOnEmptyCooldown: 60_000,
        leaveOnEnd: true,
        leaveOnEndCooldown: 120_000,
      },
    });
    const text = searchResult.hasPlaylist()
      ? t(lang, 'music.playlistAdded', { count: searchResult.tracks.length, name: searchResult.playlist.title })
      : t(lang, 'music.added', { title: track.title, url: track.url });
    return interaction.editReply({ embeds: [embed('success').setDescription(`🎶 ${text}`)] });
  } catch (e) {
    console.warn('[music] play failed:', e.message);
    return interaction.editReply({ embeds: [embed('danger').setDescription(`❌ ${t(lang, 'music.noResults', { query })}`)] });
  }
}

const LOOP_CYCLE = [QueueRepeatMode.OFF, QueueRepeatMode.TRACK, QueueRepeatMode.QUEUE, QueueRepeatMode.AUTOPLAY];
const LOOP_KEYS = { [QueueRepeatMode.OFF]: 'off', [QueueRepeatMode.TRACK]: 'track', [QueueRepeatMode.QUEUE]: 'queue', [QueueRepeatMode.AUTOPLAY]: 'autoplay' };
export const LOOP_MODES = { off: QueueRepeatMode.OFF, track: QueueRepeatMode.TRACK, queue: QueueRepeatMode.QUEUE, autoplay: QueueRepeatMode.AUTOPLAY };

/** Shared by /music subcommands and the now-playing buttons. */
export async function control(interaction, action, arg) {
  const lang = langOf(interaction.guild);
  const error = checkVoice(interaction);
  if (error) return failure(interaction, error);
  const queue = player.nodes.get(interaction.guild.id);

  const restricted = ['skip', 'stop', 'volume', 'loop', 'shuffle', 'remove'];
  if (restricted.includes(action) && !canControl(interaction.member, queue)) return failure(interaction, t(lang, 'music.djOnly'));

  switch (action) {
    case 'pause': {
      const paused = queue.node.isPaused();
      paused ? queue.node.resume() : queue.node.pause();
      return success(interaction, t(lang, paused ? 'music.resumed' : 'music.paused'));
    }
    case 'resume':
      queue.node.resume();
      return success(interaction, t(lang, 'music.resumed'));
    case 'skip': {
      const title = queue.currentTrack.title;
      queue.node.skip();
      return success(interaction, t(lang, 'music.skipped', { title }));
    }
    case 'stop':
      queue.delete();
      return success(interaction, t(lang, 'music.stopped'));
    case 'shuffle':
      queue.tracks.shuffle();
      return success(interaction, t(lang, 'music.shuffled'));
    case 'loop': {
      const mode = arg ?? LOOP_CYCLE[(LOOP_CYCLE.indexOf(queue.repeatMode) + 1) % LOOP_CYCLE.length];
      queue.setRepeatMode(mode);
      return success(interaction, t(lang, 'music.loopSet', { mode: t(lang, `music.loopModes.${LOOP_KEYS[mode]}`) }));
    }
    case 'volume':
      queue.node.setVolume(arg);
      return success(interaction, t(lang, 'music.volumeSet', { volume: arg }));
    case 'remove': {
      const track = queue.tracks.at(arg - 1);
      if (!track) return failure(interaction, t(lang, 'music.invalidPosition'));
      queue.removeTrack(track);
      return success(interaction, t(lang, 'music.removed', { title: track.title }));
    }
    case 'nowplaying':
      return interaction.reply({
        embeds: [nowPlayingEmbed(lang, queue, queue.currentTrack).setDescription(queue.node.createProgressBar() ?? null)],
      });
    case 'queue': {
      const page = Math.max(1, arg ?? 1);
      const tracks = queue.tracks.toArray();
      const pages = Math.max(1, Math.ceil(tracks.length / 10));
      const list = tracks
        .slice((page - 1) * 10, page * 10)
        .map((tr, i) => `**${(page - 1) * 10 + i + 1}.** [${tr.title.slice(0, 60)}](${tr.url}) — ${tr.duration}`)
        .join('\n');
      return interaction.reply({
        embeds: [
          embed('primary')
            .setTitle(t(lang, 'music.queueTitle'))
            .setDescription(`${t(lang, 'music.nowPlaying')}: **[${queue.currentTrack.title}](${queue.currentTrack.url})**\n\n${list || t(lang, 'music.queueEmpty')}`)
            .setFooter({ text: t(lang, 'music.queueFooter', { page: Math.min(page, pages), pages, count: tracks.length }) }),
        ],
      });
    }
  }
}
