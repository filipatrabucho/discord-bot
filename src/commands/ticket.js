import { ChannelType, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { getSettings } from '../database.js';
import { t, langOf } from '../i18n/index.js';
import { describe } from '../utils/localize.js';
import { failure, success } from '../utils/embeds.js';
import { isAdmin, isStaff } from '../utils/permissions.js';
import { closeTicket, getTicketByChannel, ticketPanel } from '../modules/tickets.js';

export const category = 'support';

export const data = describe(new SlashCommandBuilder().setName('ticket'), 'ticket.description')
  .setDMPermission(false)
  .addSubcommand((s) =>
    describe(s.setName('panel'), 'ticket.panel').addChannelOption((o) => describe(o.setName('channel'), 'ticket.channel').addChannelTypes(ChannelType.GuildText)),
  )
  .addSubcommand((s) => describe(s.setName('close'), 'ticket.close'))
  .addSubcommand((s) => describe(s.setName('add'), 'ticket.add').addUserOption((o) => describe(o.setName('user'), 'ticket.user').setRequired(true)))
  .addSubcommand((s) => describe(s.setName('remove'), 'ticket.remove').addUserOption((o) => describe(o.setName('user'), 'ticket.user').setRequired(true)))
  .addSubcommand((s) =>
    describe(s.setName('rename'), 'ticket.rename').addStringOption((o) => describe(o.setName('name'), 'ticket.name').setRequired(true).setMaxLength(90)),
  );

export async function execute(interaction) {
  const { guild } = interaction;
  const lang = langOf(guild);
  const settings = getSettings(guild.id);
  const sub = interaction.options.getSubcommand();

  if (sub === 'panel') {
    if (!isAdmin(interaction.member)) return failure(interaction, t(lang, 'common.adminOnly'));
    const channel = interaction.options.getChannel('channel') ?? interaction.channel;
    await channel.send(ticketPanel(lang));
    return success(interaction, t(lang, 'ticket.panelSent', { channel: `<#${channel.id}>` }));
  }

  const ticket = getTicketByChannel(interaction.channelId);
  if (!ticket) return failure(interaction, t(lang, 'tickets.notATicket'));
  if (sub === 'close') return closeTicket(interaction);
  if (!isStaff(interaction.member, settings)) return failure(interaction, t(lang, 'common.staffOnly'));

  if (sub === 'add') {
    const user = interaction.options.getUser('user');
    await interaction.channel.permissionOverwrites.edit(user.id, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true, AttachFiles: true });
    return interaction.reply({ content: t(lang, 'ticket.added', { user: `<@${user.id}>` }) });
  }
  if (sub === 'remove') {
    const user = interaction.options.getUser('user');
    if (user.id === ticket.user_id) return failure(interaction, t(lang, 'ticket.cantRemoveOwner'));
    await interaction.channel.permissionOverwrites.delete(user.id);
    return success(interaction, t(lang, 'ticket.removed', { user: `<@${user.id}>` }));
  }
  if (sub === 'rename') {
    if (!interaction.guild.members.me.permissionsIn(interaction.channel).has(PermissionFlagsBits.ManageChannels)) {
      return failure(interaction, t(lang, 'common.botMissingPerms'));
    }
    await interaction.channel.setName(interaction.options.getString('name'));
    return success(interaction, t(lang, 'ticket.renamed'));
  }
}
