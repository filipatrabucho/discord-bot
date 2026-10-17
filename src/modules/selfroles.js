import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { t, langOf } from '../i18n/index.js';
import { embed, failure, success } from '../utils/embeds.js';
import { isAssignableRole } from '../utils/permissions.js';

/** roles: [{ id, label, emoji }] (max 25) */
export function selfRolesPanel(title, description, roles) {
  const rows = [];
  for (let i = 0; i < roles.length && i < 25; i += 5) {
    rows.push(
      new ActionRowBuilder().addComponents(
        roles.slice(i, i + 5).map((r) => {
          const b = new ButtonBuilder().setCustomId(`selfrole:toggle:${r.id}`).setStyle(ButtonStyle.Secondary).setLabel(r.label.slice(0, 80));
          if (r.emoji) b.setEmoji(r.emoji);
          return b;
        }),
      ),
    );
  }
  return {
    embeds: [embed('primary').setTitle(title).setDescription(`${description}\n\n${roles.map((r) => `${r.emoji ?? '•'} <@&${r.id}>`).join('\n')}`)],
    components: rows,
  };
}

export async function handleComponent(interaction, action, [roleId]) {
  if (action !== 'toggle') return;
  const lang = langOf(interaction.guild);
  const role = interaction.guild.roles.cache.get(roleId);
  if (!isAssignableRole(role)) return failure(interaction, t(lang, 'selfroles.unavailable'));
  const { member } = interaction;
  if (member.roles.cache.has(role.id)) {
    await member.roles.remove(role, 'Self role');
    return success(interaction, t(lang, 'selfroles.removed', { role: `<@&${role.id}>` }));
  }
  await member.roles.add(role, 'Self role');
  return success(interaction, t(lang, 'selfroles.added', { role: `<@&${role.id}>` }));
}
