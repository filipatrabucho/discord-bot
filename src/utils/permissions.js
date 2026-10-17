import { PermissionFlagsBits } from 'discord.js';

export function isAdmin(member) {
  return member.permissions.has(PermissionFlagsBits.Administrator) || member.permissions.has(PermissionFlagsBits.ManageGuild);
}

export function isStaff(member, settings) {
  if (isAdmin(member)) return true;
  return [settings.roles.staff, settings.roles.admin].some((id) => id && member.roles.cache.has(id));
}

export function isPremium(member, settings) {
  return Boolean(settings.roles.premium && member.roles.cache.has(settings.roles.premium));
}

const DANGEROUS = [
  PermissionFlagsBits.Administrator,
  PermissionFlagsBits.ManageGuild,
  PermissionFlagsBits.ManageRoles,
  PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.ManageMessages,
  PermissionFlagsBits.ManageWebhooks,
  PermissionFlagsBits.BanMembers,
  PermissionFlagsBits.KickMembers,
  PermissionFlagsBits.ModerateMembers,
  PermissionFlagsBits.MentionEveryone,
];

/** True when the bot may hand this role out to regular members (self-roles, rewards). */
export function isAssignableRole(role) {
  if (!role || role.managed || role.id === role.guild.id) return false;
  if (DANGEROUS.some((p) => role.permissions.has(p))) return false;
  return role.comparePositionTo(role.guild.members.me.roles.highest) < 0;
}
