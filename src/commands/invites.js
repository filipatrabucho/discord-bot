import { SlashCommandBuilder } from 'discord.js';
import { t, langOf } from '../i18n/index.js';
import { describe } from '../utils/localize.js';
import { embed, failure, success } from '../utils/embeds.js';
import { isAdmin, isAssignableRole } from '../utils/permissions.js';
import { ts } from '../utils/time.js';
import { addBonus, applyRewards, getStats, leaderboard, resetInvites, rewards, whoInvited } from '../modules/invites.js';

export const category = 'community';

const MEDALS = ['🥇', '🥈', '🥉'];

export const data = describe(new SlashCommandBuilder().setName('invites'), 'invites.description')
  .setDMPermission(false)
  .addSubcommand((s) => describe(s.setName('user'), 'invites.user').addUserOption((o) => describe(o.setName('user'), 'invites.userOption')))
  .addSubcommand((s) => describe(s.setName('leaderboard'), 'invites.leaderboard'))
  .addSubcommand((s) => describe(s.setName('who'), 'invites.who').addUserOption((o) => describe(o.setName('user'), 'invites.userOption').setRequired(true)))
  .addSubcommand((s) =>
    describe(s.setName('bonus'), 'invites.bonus')
      .addUserOption((o) => describe(o.setName('user'), 'invites.userOption').setRequired(true))
      .addIntegerOption((o) => describe(o.setName('amount'), 'invites.amount').setRequired(true).setMinValue(-1000).setMaxValue(1000)),
  )
  .addSubcommand((s) =>
    describe(s.setName('reward-add'), 'invites.rewardAdd')
      .addIntegerOption((o) => describe(o.setName('invites'), 'invites.threshold').setRequired(true).setMinValue(1))
      .addRoleOption((o) => describe(o.setName('role'), 'invites.rewardRole').setRequired(true)),
  )
  .addSubcommand((s) => describe(s.setName('reward-remove'), 'invites.rewardRemove').addRoleOption((o) => describe(o.setName('role'), 'invites.rewardRole').setRequired(true)))
  .addSubcommand((s) => describe(s.setName('rewards'), 'invites.rewards'))
  .addSubcommand((s) => describe(s.setName('reset'), 'invites.reset').addUserOption((o) => describe(o.setName('user'), 'invites.resetUser')));

const ADMIN_SUBS = ['bonus', 'reward-add', 'reward-remove', 'reset'];

export async function execute(interaction) {
  const { guild } = interaction;
  const lang = langOf(guild);
  const sub = interaction.options.getSubcommand();
  if (ADMIN_SUBS.includes(sub) && !isAdmin(interaction.member)) return failure(interaction, t(lang, 'common.adminOnly'));

  switch (sub) {
    case 'user': {
      const user = interaction.options.getUser('user') ?? interaction.user;
      const s = getStats(guild.id, user.id);
      return interaction.reply({
        embeds: [
          embed('primary')
            .setAuthor({ name: user.username, iconURL: user.displayAvatarURL() })
            .setDescription(t(lang, 'invites.summary', { user: `<@${user.id}>`, valid: s.valid }))
            .addFields(
              { name: `✅ ${t(lang, 'invites.regular')}`, value: String(s.total - s.left - s.fake), inline: true },
              { name: `👋 ${t(lang, 'invites.left')}`, value: String(s.left), inline: true },
              { name: `🤖 ${t(lang, 'invites.fake')}`, value: String(s.fake), inline: true },
              { name: `🎁 ${t(lang, 'invites.bonusLabel')}`, value: String(s.bonus), inline: true },
            ),
        ],
      });
    }
    case 'leaderboard': {
      const rows = leaderboard(guild.id);
      const text = rows.map((r, i) => `${MEDALS[i] ?? `**${i + 1}.**`} <@${r.userId}> — **${r.valid}** ${t(lang, 'invites.invitesWord')}`).join('\n');
      return interaction.reply({ embeds: [embed('premium').setTitle(t(lang, 'invites.leaderboardTitle')).setDescription(text || t(lang, 'invites.noData'))] });
    }
    case 'who': {
      const user = interaction.options.getUser('user');
      const row = whoInvited(guild.id, user.id);
      if (!row) return failure(interaction, t(lang, 'invites.whoUnknown', { user: `<@${user.id}>` }));
      return success(
        interaction,
        t(lang, 'invites.whoResult', { user: `<@${user.id}>`, inviter: row.inviterId ? `<@${row.inviterId}>` : t(lang, 'invites.vanity'), code: row.code, when: ts(row.joinedAt) }),
      );
    }
    case 'bonus': {
      const user = interaction.options.getUser('user');
      const amount = interaction.options.getInteger('amount');
      addBonus(guild.id, user.id, amount);
      await applyRewards(guild, user.id);
      return success(interaction, t(lang, 'invites.bonusAdded', { amount, user: `<@${user.id}>`, total: getStats(guild.id, user.id).valid }));
    }
    case 'reward-add': {
      const role = interaction.options.getRole('role');
      if (!isAssignableRole(role)) return failure(interaction, t(lang, 'common.roleNotAssignable'));
      const count = interaction.options.getInteger('invites');
      rewards.add(guild.id, count, role.id);
      return success(interaction, t(lang, 'invites.rewardAdded', { role: `<@&${role.id}>`, invites: count }));
    }
    case 'reward-remove': {
      const role = interaction.options.getRole('role');
      return rewards.remove(guild.id, role.id) ? success(interaction, t(lang, 'invites.rewardRemoved')) : failure(interaction, t(lang, 'invites.noReward'));
    }
    case 'rewards': {
      const list = rewards.list(guild.id);
      const text = list.map((r) => `**${r.invites}** ${t(lang, 'invites.invitesWord')} → <@&${r.roleId}>`).join('\n');
      return interaction.reply({ embeds: [embed('premium').setTitle(t(lang, 'invites.rewardsTitle')).setDescription(text || t(lang, 'invites.noRewards'))] });
    }
    case 'reset': {
      const user = interaction.options.getUser('user');
      resetInvites(guild.id, user?.id);
      return success(interaction, t(lang, 'invites.resetDone'));
    }
  }
}
