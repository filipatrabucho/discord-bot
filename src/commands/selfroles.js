import { ChannelType, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { t, langOf } from '../i18n/index.js';
import { describe } from '../utils/localize.js';
import { failure, success } from '../utils/embeds.js';
import { isAssignableRole } from '../utils/permissions.js';
import { selfRolesPanel } from '../modules/selfroles.js';

export const category = 'admin';

const builder = describe(new SlashCommandBuilder().setName('selfroles'), 'selfroles.description')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
  .setDMPermission(false)
  .addStringOption((o) => describe(o.setName('title'), 'selfroles.title').setRequired(true).setMaxLength(200))
  .addRoleOption((o) => describe(o.setName('role1'), 'selfroles.role').setRequired(true));
for (let i = 2; i <= 10; i += 1) builder.addRoleOption((o) => describe(o.setName(`role${i}`), 'selfroles.role'));
builder
  .addStringOption((o) => describe(o.setName('description'), 'selfroles.descriptionOption').setMaxLength(1000))
  .addChannelOption((o) => describe(o.setName('channel'), 'selfroles.channel').addChannelTypes(ChannelType.GuildText));

export const data = builder;

export async function execute(interaction) {
  const lang = langOf(interaction.guild);
  const roles = [];
  for (let i = 1; i <= 10; i += 1) {
    const role = interaction.options.getRole(`role${i}`);
    if (!role) continue;
    if (!isAssignableRole(role)) return failure(interaction, `${t(lang, 'common.roleNotAssignable')} (<@&${role.id}>)`);
    if (!roles.some((r) => r.id === role.id)) roles.push({ id: role.id, label: role.name });
  }
  const channel = interaction.options.getChannel('channel') ?? interaction.channel;
  await channel.send(
    selfRolesPanel(interaction.options.getString('title'), interaction.options.getString('description') ?? t(lang, 'selfroles.defaultDescription'), roles),
  );
  return success(interaction, t(lang, 'selfroles.panelSent', { channel: `<#${channel.id}>` }));
}
