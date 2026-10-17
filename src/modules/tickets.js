import {
  ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, ChannelType, ModalBuilder,
  PermissionFlagsBits as P, StringSelectMenuBuilder, TextInputBuilder, TextInputStyle,
} from 'discord.js';
import { db, getSettings, updateSettings } from '../database.js';
import { t, langOf } from '../i18n/index.js';
import { embed, ephemeral, failure, success } from '../utils/embeds.js';
import { isStaff } from '../utils/permissions.js';
import { ts } from '../utils/time.js';
import { sendLog } from './logs.js';

export const TICKET_TYPES = [
  { key: 'support', emoji: '🛠️' },
  { key: 'report', emoji: '🚨' },
  { key: 'premium', emoji: '💎' },
  { key: 'partnership', emoji: '🤝' },
  { key: 'other', emoji: '❓' },
];

export const getTicketByChannel = (channelId) => db.prepare("SELECT * FROM tickets WHERE channel_id = ? AND status = 'open'").get(channelId);

export function ticketPanel(lang) {
  return {
    embeds: [
      embed('primary')
        .setTitle(t(lang, 'tickets.panelTitle'))
        .setDescription(
          `${t(lang, 'tickets.panelDescription')}\n\n${TICKET_TYPES.map((x) => `${x.emoji} **${t(lang, `tickets.types.${x.key}`)}** — ${t(lang, `tickets.typeDescriptions.${x.key}`)}`).join('\n')}`,
        ),
    ],
    components: [
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('ticket:open')
          .setPlaceholder(t(lang, 'tickets.selectPlaceholder'))
          .addOptions(
            TICKET_TYPES.map((x) => ({
              label: t(lang, `tickets.types.${x.key}`),
              description: t(lang, `tickets.typeDescriptions.${x.key}`).slice(0, 100),
              value: x.key,
              emoji: x.emoji,
            })),
          ),
      ),
    ],
  };
}

function ticketControls(lang, claimedBy = null) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket:close').setStyle(ButtonStyle.Danger).setEmoji('🔒').setLabel(t(lang, 'tickets.closeButton')),
    new ButtonBuilder()
      .setCustomId('ticket:claim')
      .setStyle(ButtonStyle.Success)
      .setEmoji('🙋')
      .setLabel(t(lang, 'tickets.claimButton'))
      .setDisabled(Boolean(claimedBy)),
  );
}

async function openTicket(interaction, type, reason) {
  const { guild, user } = interaction;
  const lang = langOf(guild);
  const settings = getSettings(guild.id);

  const existing = db.prepare("SELECT channel_id FROM tickets WHERE guild_id = ? AND user_id = ? AND status = 'open'").get(guild.id, user.id);
  if (existing && guild.channels.cache.has(existing.channel_id)) {
    return failure(interaction, t(lang, 'tickets.alreadyOpen', { channel: `<#${existing.channel_id}>` }));
  }
  if (existing) db.prepare("UPDATE tickets SET status = 'closed', closed_at = ? WHERE channel_id = ?").run(Date.now(), existing.channel_id);

  const number = settings.tickets.counter + 1;
  updateSettings(guild.id, { tickets: { counter: number } });

  const staffRoles = [settings.roles.staff, settings.roles.admin].filter((id) => id && guild.roles.cache.has(id));
  const parent = guild.channels.cache.get(settings.categories.tickets);
  const memberPerms = [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.AttachFiles, P.EmbedLinks];
  const channel = await guild.channels.create({
    name: `ticket-${String(number).padStart(4, '0')}-${user.username}`.slice(0, 90),
    type: ChannelType.GuildText,
    parent: parent?.id,
    topic: `${t(lang, `tickets.types.${type}`)} • ${user.tag} (${user.id})`,
    permissionOverwrites: [
      { id: guild.roles.everyone.id, deny: [P.ViewChannel] },
      { id: user.id, allow: memberPerms },
      { id: guild.members.me.id, allow: [...memberPerms, P.ManageChannels, P.ManageMessages] },
      ...staffRoles.map((id) => ({ id, allow: [...memberPerms, P.ManageMessages] })),
    ],
  });

  db.prepare('INSERT INTO tickets (guild_id, number, channel_id, user_id, type, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
    guild.id, number, channel.id, user.id, type, Date.now(),
  );

  const typeInfo = TICKET_TYPES.find((x) => x.key === type);
  await channel.send({
    content: [`<@${user.id}>`, ...staffRoles.map((id) => `<@&${id}>`)].join(' '),
    embeds: [
      embed('primary')
        .setTitle(`${typeInfo.emoji} ${t(lang, 'tickets.ticketTitle', { number })}`)
        .setDescription(t(lang, 'tickets.ticketWelcome', { user: `<@${user.id}>` }))
        .addFields(
          { name: t(lang, 'tickets.type'), value: t(lang, `tickets.types.${type}`), inline: true },
          { name: t(lang, 'tickets.openedBy'), value: `<@${user.id}>`, inline: true },
          { name: t(lang, 'tickets.reason'), value: reason.slice(0, 1024) },
        )
        .setTimestamp(),
    ],
    components: [ticketControls(lang)],
    allowedMentions: { users: [user.id], roles: staffRoles },
  });

  await sendLog(guild, embed('info').setDescription(t(lang, 'tickets.logOpened', { number, user: `<@${user.id}>`, channel: `<#${channel.id}>` })));
  return success(interaction, t(lang, 'tickets.created', { channel: `<#${channel.id}>` }));
}

async function buildTranscript(channel) {
  const messages = [];
  let before;
  while (messages.length < 1000) {
    const batch = await channel.messages.fetch({ limit: 100, before });
    if (!batch.size) break;
    messages.push(...batch.values());
    before = batch.last().id;
  }
  const lines = messages.reverse().map((m) => {
    const time = new Date(m.createdTimestamp).toISOString().replace('T', ' ').slice(0, 16);
    const extra = [
      ...m.embeds.map((e) => `[embed] ${e.title ?? ''} ${e.description ?? ''}`.trim()),
      ...m.attachments.map((a) => `[file] ${a.url}`),
    ];
    return `[${time}] ${m.author.tag}: ${m.content}${extra.length ? `\n    ${extra.join('\n    ')}` : ''}`;
  });
  return `${channel.name}\n${'='.repeat(channel.name.length)}\n\n${lines.join('\n')}\n`;
}

export async function closeTicket(interaction) {
  const { guild, channel } = interaction;
  const lang = langOf(guild);
  const settings = getSettings(guild.id);
  const ticket = getTicketByChannel(channel.id);
  if (!ticket) return failure(interaction, t(lang, 'tickets.notATicket'));
  if (ticket.user_id !== interaction.user.id && !isStaff(interaction.member, settings)) {
    return failure(interaction, t(lang, 'tickets.noPermission'));
  }

  await interaction.reply({ embeds: [embed('warning').setDescription(t(lang, 'tickets.closing'))] });
  db.prepare("UPDATE tickets SET status = 'closed', closed_at = ? WHERE id = ?").run(Date.now(), ticket.id);

  const name = `transcript-${String(ticket.number).padStart(4, '0')}.txt`;
  const text = await buildTranscript(channel).catch(() => '');
  const summary = embed('info')
    .setTitle(t(lang, 'tickets.ticketTitle', { number: ticket.number }))
    .addFields(
      { name: t(lang, 'tickets.type'), value: t(lang, `tickets.types.${ticket.type}`), inline: true },
      { name: t(lang, 'tickets.openedBy'), value: `<@${ticket.user_id}>`, inline: true },
      { name: t(lang, 'tickets.closedBy'), value: `<@${interaction.user.id}>`, inline: true },
      { name: t(lang, 'tickets.claimedBy'), value: ticket.claimed_by ? `<@${ticket.claimed_by}>` : '—', inline: true },
      { name: t(lang, 'tickets.opened'), value: ts(ticket.created_at, 'f'), inline: true },
    )
    .setTimestamp();

  // The transcript only goes to the staff log channel, never to the member.
  const logChannel = guild.channels.cache.get(settings.channels.ticketLogs ?? settings.channels.logs);
  await logChannel?.send({ embeds: [summary], files: [new AttachmentBuilder(Buffer.from(text), { name })] }).catch(() => {});

  setTimeout(() => channel.delete(`Ticket #${ticket.number} closed`).catch(() => {}), 5_000);
}

export async function handleComponent(interaction, action) {
  const { guild } = interaction;
  const lang = langOf(guild);
  const settings = getSettings(guild.id);

  if (action === 'open') {
    const type = interaction.values[0];
    const modal = new ModalBuilder()
      .setCustomId(`ticket:submit:${type}`)
      .setTitle(t(lang, 'tickets.modalTitle', { type: t(lang, `tickets.types.${type}`) }).slice(0, 45))
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('reason')
            .setLabel(t(lang, 'tickets.reasonLabel'))
            .setStyle(TextInputStyle.Paragraph)
            .setMinLength(5)
            .setMaxLength(1000)
            .setRequired(true),
        ),
      );
    await interaction.showModal(modal);
    // Reset the select so the same option can be picked again.
    return interaction.message.edit(ticketPanel(lang)).catch(() => {});
  }

  if (action === 'submit') {
    const type = interaction.customId.split(':')[2];
    if (!TICKET_TYPES.some((x) => x.key === type)) return;
    await interaction.deferReply({ flags: ephemeral });
    return openTicket(interaction, type, interaction.fields.getTextInputValue('reason'));
  }

  if (action === 'close') {
    const ticket = getTicketByChannel(interaction.channelId);
    if (!ticket) return failure(interaction, t(lang, 'tickets.notATicket'));
    return interaction.reply({
      embeds: [embed('warning').setDescription(t(lang, 'tickets.confirmClose'))],
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('ticket:confirmclose').setStyle(ButtonStyle.Danger).setLabel(t(lang, 'tickets.closeButton')),
        ),
      ],
      flags: ephemeral,
    });
  }

  if (action === 'confirmclose') return closeTicket(interaction);

  if (action === 'claim') {
    const ticket = getTicketByChannel(interaction.channelId);
    if (!ticket) return failure(interaction, t(lang, 'tickets.notATicket'));
    if (!isStaff(interaction.member, settings)) return failure(interaction, t(lang, 'common.staffOnly'));
    db.prepare('UPDATE tickets SET claimed_by = ? WHERE id = ?').run(interaction.user.id, ticket.id);
    await interaction.message.edit({ components: [ticketControls(lang, interaction.user.id)] }).catch(() => {});
    return interaction.reply({ embeds: [embed('success').setDescription(t(lang, 'tickets.claimed', { user: `<@${interaction.user.id}>` }))] });
  }
}
