import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { getSettings } from '../database.js';
import { t, langOf } from '../i18n/index.js';
import { embed } from '../utils/embeds.js';
import { getStats } from './invites.js';

/** Replaces the welcome/goodbye placeholders. */
export function fillPlaceholders(text, member, lang, inviteInfo = null) {
  const inviter = inviteInfo?.inviterId
    ? `<@${inviteInfo.inviterId}>`
    : inviteInfo?.vanity
      ? t(lang, 'invites.vanity')
      : t(lang, 'invites.unknown');
  const invites = inviteInfo?.inviterId ? getStats(member.guild.id, inviteInfo.inviterId).valid : 0;
  return text
    .replaceAll('{user}', `<@${member.id}>`)
    .replaceAll('{username}', member.user.username)
    .replaceAll('{server}', member.guild.name)
    .replaceAll('{count}', String(member.guild.memberCount))
    .replaceAll('{inviter}', inviter)
    .replaceAll('{invites}', String(invites));
}

function channelLink(guild, id) {
  return `https://discord.com/channels/${guild.id}/${id}`;
}

export function buildWelcome(member, inviteInfo = null) {
  const { guild } = member;
  const settings = getSettings(guild.id);
  const lang = langOf(guild);
  // New members who still have to accept the rules get the button right on the welcome card.
  const memberRole = settings.verification.enabled && settings.verification.mode === 'button' && guild.roles.cache.get(settings.roles.member);
  const needsVerify = Boolean(memberRole && !member.roles.cache.has(memberRole.id));
  // In 'discord' mode a pending member still has to accept Discord's own rules pop-up.
  const needsDiscordRules = settings.verification.enabled && settings.verification.mode === 'discord' && member.pending;
  const defaultKey = needsVerify ? 'welcome.defaultMessageVerify' : needsDiscordRules ? 'welcome.defaultMessageRules' : 'welcome.defaultMessage';
  const text = settings.welcome.message ?? t(lang, defaultKey);

  const e = embed('primary')
    .setAuthor({ name: guild.name, iconURL: guild.iconURL() ?? undefined })
    .setTitle(t(lang, 'welcome.title', { username: member.user.username }))
    .setDescription(fillPlaceholders(text, member, lang, inviteInfo))
    .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
    .setFooter({ text: t(lang, 'welcome.footer', { count: guild.memberCount }) })
    .setTimestamp();
  if (settings.welcome.image) e.setImage(settings.welcome.image);
  if (inviteInfo) e.addFields({ name: t(lang, 'welcome.invitedBy'), value: fillPlaceholders('{inviter} ({invites})', member, lang, inviteInfo) });

  const buttons = [];
  const { rules, selfRoles } = settings.channels;
  // Opens the same rules pop-up as the #verify panel (handled by the verify module).
  if (needsVerify) buttons.push(new ButtonBuilder().setCustomId('verify:start').setStyle(ButtonStyle.Success).setLabel(t(lang, 'welcome.verifyButton')).setEmoji('✅'));
  if (rules) buttons.push(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(t(lang, 'welcome.rulesButton')).setEmoji('📜').setURL(channelLink(guild, rules)));
  if (selfRoles) buttons.push(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(t(lang, 'welcome.rolesButton')).setEmoji('🎭').setURL(channelLink(guild, selfRoles)));

  return { content: `<@${member.id}>`, embeds: [e], components: buttons.length ? [new ActionRowBuilder().addComponents(buttons)] : [] };
}

export async function sendWelcome(member, inviteInfo) {
  const settings = getSettings(member.guild.id);
  if (!settings.welcome.enabled) return;
  const payload = buildWelcome(member, inviteInfo);
  const channel = member.guild.channels.cache.get(settings.channels.welcome);
  await channel?.send(payload).catch((e) => console.warn('[welcome]', e.message));
  if (settings.welcome.dm) {
    await member.send({ embeds: payload.embeds, components: payload.components }).catch(() => {});
  }
}

export async function sendGoodbye(member) {
  const settings = getSettings(member.guild.id);
  if (!settings.welcome.goodbyeEnabled) return;
  const channel = member.guild.channels.cache.get(settings.channels.goodbye ?? settings.channels.welcome);
  if (!channel) return;
  const lang = langOf(member.guild);
  const text = settings.welcome.goodbyeMessage ?? t(lang, 'welcome.defaultGoodbye');
  await channel
    .send({
      embeds: [
        embed('danger')
          .setDescription(fillPlaceholders(text, member, lang))
          .setThumbnail(member.user.displayAvatarURL())
          .setFooter({ text: t(lang, 'welcome.footer', { count: member.guild.memberCount }) }),
      ],
    })
    .catch(() => {});
}

/** Auto-role for new members when the verification gate is off. */
export async function applyAutoRoles(member) {
  const settings = getSettings(member.guild.id);
  const { enabled, mode } = settings.verification;
  // In 'discord' mode a member who still has to accept the native rules pop-up is "pending";
  // they get the Member role from onScreeningPassed() once they accept.
  const giveMember = !enabled || (mode === 'discord' && !member.pending);
  const ids = member.user.bot ? [settings.roles.bots] : [settings.roles.autorole, giveMember ? settings.roles.member : null];
  const roles = ids.filter(Boolean).filter((id) => member.guild.roles.cache.has(id));
  if (roles.length) await member.roles.add(roles, 'Auto role').catch((e) => console.warn('[autorole]', e.message));
}
