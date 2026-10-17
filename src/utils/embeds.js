import { EmbedBuilder, MessageFlags } from 'discord.js';

export const COLORS = {
  primary: 0x5865f2,
  success: 0x57f287,
  danger: 0xed4245,
  warning: 0xfee75c,
  premium: 0xf1c40f,
  info: 0x3498db,
  staff: 0x2c3e50,
};

export function embed(color = 'primary') {
  return new EmbedBuilder().setColor(COLORS[color] ?? color);
}

export const ephemeral = MessageFlags.Ephemeral;

/** Replies (or follows up) with an ephemeral embed, whatever state the interaction is in. */
export async function respond(interaction, color, description, extra = {}) {
  const payload = { embeds: [embed(color).setDescription(description)], ...extra };
  if (interaction.deferred && !interaction.replied) return interaction.editReply(payload);
  if (interaction.replied) return interaction.followUp({ ...payload, flags: ephemeral });
  return interaction.reply({ ...payload, flags: ephemeral });
}

export const success = (interaction, text, extra) => respond(interaction, 'success', `✅ ${text}`, extra);
export const failure = (interaction, text, extra) => respond(interaction, 'danger', `❌ ${text}`, extra);
