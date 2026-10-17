import { ChannelType, GuildSystemChannelFlags, PermissionFlagsBits as P } from 'discord.js';
import { getSettings, updateSettings } from '../database.js';
import { t } from '../i18n/index.js';
import { embed } from '../utils/embeds.js';
import { rulesEmbed, verifyPanel } from './verification.js';
import { ticketPanel } from './tickets.js';
import { perksEmbed } from './premium.js';
import { selfRolesPanel } from './selfroles.js';

const { GuildText: TEXT, GuildVoice: VOICE, GuildCategory: CATEGORY } = ChannelType;

export const TEMPLATES = ['community', 'gaming', 'study'];

// Created bottom-up so the first entry ends up highest in the role list.
const ROLE_DEFS = [
  { key: 'admin', color: 0xe74c3c, hoist: true, permissions: [P.Administrator] },
  {
    key: 'staff', color: 0x3498db, hoist: true, mentionable: true,
    permissions: [P.KickMembers, P.BanMembers, P.ModerateMembers, P.ManageMessages, P.ManageNicknames, P.ManageThreads,
      P.MuteMembers, P.DeafenMembers, P.MoveMembers, P.ViewAuditLog],
  },
  { key: 'premium', color: 0xf1c40f, hoist: true, permissions: [] },
  { key: 'dj', color: 0x9b59b6, permissions: [] },
  { key: 'member', color: 0x2ecc71, permissions: [] },
  { key: 'bots', color: 0x95a5a6, hoist: true, permissions: [] },
];

const SELF_ROLES = {
  community: [{ key: 'announcements', emoji: '🔔' }, { key: 'events', emoji: '🎉' }, { key: 'giveaways', emoji: '🎁' }],
  gaming: [{ key: 'announcements', emoji: '🔔' }, { key: 'pc', emoji: '🖥️' }, { key: 'console', emoji: '🎮' }, { key: 'mobile', emoji: '📱' }, { key: 'giveaways', emoji: '🎁' }],
  study: [{ key: 'announcements', emoji: '🔔' }, { key: 'events', emoji: '🎉' }, { key: 'studyBuddy', emoji: '📚' }],
};

/** Category/channel layout. `visibility`: public | gated | verify | premium | staff | hidden. */
function buildPlan(template, verification) {
  const extra = {
    community: [{ key: 'memes', type: TEXT }, { key: 'events', type: TEXT }],
    gaming: [{ key: 'clips', type: TEXT }, { key: 'lfg', type: TEXT }],
    study: [{ key: 'homework', type: TEXT }, { key: 'resources', type: TEXT, readOnly: true }],
  }[template];
  const extraVoice = {
    community: [{ key: 'voiceLounge', type: VOICE }, { key: 'voiceChill', type: VOICE }],
    gaming: [{ key: 'voiceSquad1', type: VOICE }, { key: 'voiceSquad2', type: VOICE }, { key: 'voiceLounge', type: VOICE }],
    study: [{ key: 'voiceFocus', type: VOICE }, { key: 'voiceLounge', type: VOICE }],
  }[template];

  return [
    {
      key: 'info', visibility: 'public',
      channels: [
        { key: 'welcome', type: TEXT, readOnly: true },
        { key: 'rules', type: TEXT, readOnly: true },
        { key: 'announcements', type: TEXT, readOnly: true },
        verification && { key: 'verify', type: TEXT, readOnly: true, visibility: 'verify' },
        { key: 'selfRoles', type: TEXT, readOnly: true, visibility: 'gated' },
      ].filter(Boolean),
    },
    {
      key: 'community', visibility: 'gated',
      channels: [
        { key: 'general', type: TEXT },
        { key: 'media', type: TEXT },
        ...extra,
        { key: 'suggestions', type: TEXT, readOnly: true },
        { key: 'botCommands', type: TEXT },
        ...extraVoice,
      ],
    },
    { key: 'music', visibility: 'gated', channels: [{ key: 'music', type: TEXT }, { key: 'musicVoice', type: VOICE }] },
    { key: 'support', visibility: 'gated', channels: [{ key: 'createTicket', type: TEXT, readOnly: true }] },
    { key: 'tickets', visibility: 'hidden', channels: [] },
    {
      key: 'premium', visibility: 'premium',
      channels: [{ key: 'premiumPerks', type: TEXT, readOnly: true }, { key: 'premiumChat', type: TEXT }, { key: 'premiumVoice', type: VOICE }],
    },
    {
      key: 'staff', visibility: 'staff',
      channels: [
        { key: 'staffChat', type: TEXT },
        { key: 'staffCommands', type: TEXT },
        { key: 'logs', type: TEXT, readOnly: true },
        { key: 'ticketLogs', type: TEXT, readOnly: true },
        { key: 'staffVoice', type: VOICE },
      ],
    },
  ];
}

const SEND = [P.SendMessages, P.SendMessagesInThreads, P.CreatePublicThreads, P.CreatePrivateThreads];

function overwrites(guild, roles, gateId, visibility, readOnly) {
  const everyone = guild.roles.everyone.id;
  const staff = [roles.admin, roles.staff].filter(Boolean).map((r) => r.id);
  const list = [
    { id: guild.members.me.id, allow: [P.ViewChannel, P.SendMessages, P.EmbedLinks, P.AttachFiles, P.ReadMessageHistory, P.ManageChannels, P.ManageMessages, P.Connect, P.Speak] },
    ...staff.map((id) => ({ id, allow: [P.ViewChannel, P.SendMessages, P.Connect] })),
  ];
  const sendDeny = readOnly ? SEND : [];
  const gated = gateId !== everyone;

  switch (visibility) {
    case 'public':
      list.push({ id: everyone, allow: [P.ViewChannel], deny: sendDeny });
      break;
    case 'gated':
      if (gated) list.push({ id: everyone, deny: [P.ViewChannel] }, { id: gateId, allow: [P.ViewChannel], deny: sendDeny });
      else list.push({ id: everyone, allow: [P.ViewChannel], deny: sendDeny });
      break;
    case 'verify':
      // Visible until verified, then hidden for members.
      list.push({ id: everyone, allow: [P.ViewChannel], deny: SEND }, { id: gateId, deny: [P.ViewChannel] });
      break;
    case 'premium':
      list.push({ id: everyone, deny: [P.ViewChannel] }, { id: roles.premium.id, allow: [P.ViewChannel], deny: sendDeny });
      break;
    case 'staff':
    case 'hidden':
      list.push({ id: everyone, deny: [P.ViewChannel] });
      break;
  }
  return list;
}

async function ensureRole(guild, existingId, data) {
  const role = (existingId && guild.roles.cache.get(existingId)) ?? guild.roles.cache.find((r) => r.name === data.name);
  if (role) {
    if (role.editable) await role.edit({ permissions: data.permissions, color: data.color, hoist: data.hoist }).catch(() => {});
    return role;
  }
  return guild.roles.create({ ...data, reason: 'Server setup' });
}

const normalize = (name, type) => (type === TEXT ? name.toLowerCase().replace(/\s+/g, '-') : name);

async function ensureChannel(guild, existingId, { name, type, parent, permissionOverwrites, topic }) {
  let channel = existingId && guild.channels.cache.get(existingId);
  if (!channel || channel.type !== type) {
    channel = guild.channels.cache.find((c) => c.type === type && c.name === normalize(name, type) && (c.parentId ?? null) === (parent ?? null));
  }
  if (channel) {
    await channel.edit({ parent, permissionOverwrites, ...(type === TEXT && topic ? { topic } : {}) }).catch(() => {});
    return { channel, created: false };
  }
  return { channel: await guild.channels.create({ name, type, parent, permissionOverwrites, topic, reason: 'Server setup' }), created: true };
}

/** Posts `payload` unless the bot already posted something in this channel. */
async function postOnce(channel, payload) {
  const recent = await channel.messages.fetch({ limit: 20 }).catch(() => null);
  if (recent?.some((m) => m.author.id === channel.client.user.id)) return false;
  await channel.send(payload);
  return true;
}

/**
 * Builds the whole server. `report(line)` is called with progress lines.
 * Re-running is safe: roles/channels found by stored ID or name are reused and updated.
 */
export async function runSetup(guild, { template, lang, verification, cleanup }, report) {
  const settings = getSettings(guild.id);
  const result = { roles: 0, channels: 0, notes: [] };

  // 1. Roles
  await report(t(lang, 'setup.progress.roles'));
  const roles = {};
  for (const def of [...ROLE_DEFS].reverse()) {
    const existed = settings.roles[def.key] && guild.roles.cache.has(settings.roles[def.key]);
    roles[def.key] = await ensureRole(guild, settings.roles[def.key], {
      name: t(lang, `setup.roles.${def.key}`),
      color: def.color,
      hoist: def.hoist ?? false,
      mentionable: def.mentionable ?? false,
      permissions: def.permissions,
    });
    if (!existed) result.roles += 1;
  }
  const selfRoles = [];
  for (const def of SELF_ROLES[template]) {
    const label = t(lang, `setup.selfRoles.${def.key}`);
    const role = await ensureRole(guild, null, { name: label, permissions: [], mentionable: true });
    selfRoles.push({ id: role.id, label, emoji: def.emoji });
  }

  // 2. Categories and channels
  await report(t(lang, 'setup.progress.channels'));
  const gateId = verification ? roles.member.id : guild.roles.everyone.id;
  const channels = {};
  const categories = {};
  for (const cat of buildPlan(template, verification)) {
    const { channel: category, created } = await ensureChannel(guild, settings.categories[cat.key], {
      name: t(lang, `setup.categories.${cat.key}`),
      type: CATEGORY,
      permissionOverwrites: overwrites(guild, roles, gateId, cat.visibility, false),
    });
    categories[cat.key] = category.id;
    if (created) result.channels += 1;
    for (const ch of cat.channels) {
      const { channel, created: chCreated } = await ensureChannel(guild, settings.channels[ch.key] ?? settings.channelIds?.[ch.key], {
        name: t(lang, `setup.channels.${ch.key}`),
        type: ch.type,
        parent: category.id,
        topic: ch.type === TEXT ? t(lang, `setup.topics.${ch.key}`, {}) : undefined,
        permissionOverwrites: overwrites(guild, roles, gateId, ch.visibility ?? cat.visibility, ch.readOnly),
      });
      channels[ch.key] = channel.id;
      if (chCreated) result.channels += 1;
    }
  }

  // 3. Save configuration
  const known = Object.keys(settings.channels);
  updateSettings(guild.id, {
    lang,
    roles: Object.fromEntries(Object.entries(roles).map(([k, r]) => [k, r.id])),
    channels: Object.fromEntries(Object.entries(channels).filter(([k]) => known.includes(k))),
    channelIds: channels,
    categories,
    verification: { enabled: verification },
    selfRoles,
  });

  // 4. Existing members keep access once the gate is on; the bot gets the bots role.
  await report(t(lang, 'setup.progress.members'));
  await guild.members.me.roles.add(roles.bots).catch(() => {});
  if (guild.memberCount <= 1000) {
    const members = await guild.members.fetch().catch(() => null);
    for (const m of members?.values() ?? []) {
      const roleId = m.user.bot ? roles.bots.id : verification ? roles.member.id : null;
      if (roleId && !m.roles.cache.has(roleId) && m.id !== guild.members.me.id) await m.roles.add(roleId, 'Server setup').catch(() => {});
    }
  } else {
    result.notes.push(t(lang, 'setup.notes.bigServer'));
  }

  // 5. Panels
  await report(t(lang, 'setup.progress.panels'));
  const ch = (key) => guild.channels.cache.get(channels[key]);
  await postOnce(ch('rules'), { embeds: [rulesEmbed(lang, guild)] });
  if (verification) await postOnce(ch('verify'), verifyPanel(lang, guild));
  await postOnce(ch('createTicket'), ticketPanel(lang));
  await postOnce(ch('selfRoles'), selfRolesPanel(t(lang, 'selfroles.defaultTitle'), t(lang, 'selfroles.defaultDescription'), selfRoles));
  await postOnce(ch('premiumPerks'), { embeds: [perksEmbed(lang)] });
  await postOnce(ch('welcome'), { embeds: [embed('primary').setTitle(t(lang, 'setup.welcomeIntroTitle', { server: guild.name })).setDescription(t(lang, 'setup.welcomeIntro'))] });
  await postOnce(ch('staffChat'), { embeds: [embed('staff').setTitle(t(lang, 'setup.staffIntroTitle')).setDescription(t(lang, 'setup.staffIntro'))] });
  await postOnce(ch('music'), { embeds: [embed('primary').setDescription(t(lang, 'setup.musicIntro'))] });

  // 6. Silence Discord's own join messages (the bot sends nicer ones) and remove default channels.
  await guild.setSystemChannelFlags([GuildSystemChannelFlags.SuppressJoinNotifications, GuildSystemChannelFlags.SuppressJoinNotificationReplies]).catch(() => {});
  if (cleanup) {
    await report(t(lang, 'setup.progress.cleanup'));
    const defaults = new Set(['general', 'General', 'Text Channels', 'Voice Channels', 'Canais de texto', 'Canais de voz', 'geral', 'Geral']);
    const ours = new Set([...Object.values(channels), ...Object.values(categories)]);
    for (const c of guild.channels.cache.values()) {
      if (defaults.has(c.name) && !ours.has(c.id) && c.deletable) {
        if (c.type === CATEGORY && c.children.cache.size) continue;
        await c.delete('Server setup cleanup').catch(() => {});
      }
    }
  }

  if (Object.values(roles).some((r) => !r.editable)) result.notes.push(t(lang, 'setup.notes.rolePosition'));
  return { rolesCreated: result.roles, channelsCreated: result.channels, notes: result.notes, channels };
}
