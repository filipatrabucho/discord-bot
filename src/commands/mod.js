import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { db, getSettings } from '../database.js';
import { t, langOf } from '../i18n/index.js';
import { describe } from '../utils/localize.js';
import { embed, ephemeral, failure, success } from '../utils/embeds.js';
import { isStaff } from '../utils/permissions.js';
import { parseDuration, ts } from '../utils/time.js';
import { sendLog } from '../modules/logs.js';

export const category = 'staff';

const userOpt = (o) => describe(o.setName('user'), 'mod.user').setRequired(true);
const reasonOpt = (o) => describe(o.setName('reason'), 'mod.reason').setMaxLength(500);

export const data = describe(new SlashCommandBuilder().setName('mod'), 'mod.description')
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .setDMPermission(false)
  .addSubcommand((s) => describe(s.setName('warn'), 'mod.warn').addUserOption(userOpt).addStringOption((o) => reasonOpt(o).setRequired(true)))
  .addSubcommand((s) => describe(s.setName('warnings'), 'mod.warnings').addUserOption(userOpt))
  .addSubcommand((s) => describe(s.setName('clearwarns'), 'mod.clearwarns').addUserOption(userOpt))
  .addSubcommand((s) =>
    describe(s.setName('timeout'), 'mod.timeout')
      .addUserOption(userOpt)
      .addStringOption((o) => describe(o.setName('duration'), 'mod.duration').setRequired(true))
      .addStringOption(reasonOpt),
  )
  .addSubcommand((s) => describe(s.setName('untimeout'), 'mod.untimeout').addUserOption(userOpt))
  .addSubcommand((s) => describe(s.setName('kick'), 'mod.kick').addUserOption(userOpt).addStringOption(reasonOpt))
  .addSubcommand((s) =>
    describe(s.setName('ban'), 'mod.ban')
      .addUserOption(userOpt)
      .addStringOption(reasonOpt)
      .addIntegerOption((o) => describe(o.setName('delete_days'), 'mod.deleteDays').setMinValue(0).setMaxValue(7)),
  )
  .addSubcommand((s) => describe(s.setName('unban'), 'mod.unban').addStringOption((o) => describe(o.setName('user_id'), 'mod.userId').setRequired(true)))
  .addSubcommand((s) =>
    describe(s.setName('purge'), 'mod.purge')
      .addIntegerOption((o) => describe(o.setName('amount'), 'mod.amount').setRequired(true).setMinValue(1).setMaxValue(100))
      .addUserOption((o) => describe(o.setName('user'), 'mod.purgeUser')),
  );

const ACTION_COLORS = { warn: 'warning', timeout: 'warning', kick: 'danger', ban: 'danger', unban: 'success', untimeout: 'success' };

async function logAction(interaction, lang, action, user, reason, extra = '') {
  await sendLog(
    interaction.guild,
    embed(ACTION_COLORS[action] ?? 'info')
      .setTitle(t(lang, `mod.actions.${action}`))
      .addFields(
        { name: t(lang, 'mod.userLabel'), value: `<@${user.id}> (${user.id})`, inline: true },
        { name: t(lang, 'mod.moderator'), value: `<@${interaction.user.id}>`, inline: true },
        { name: t(lang, 'mod.reasonLabel'), value: (reason || '—') + extra },
      ),
  );
  if (action !== 'unban') {
    await user
      .send({ embeds: [embed(ACTION_COLORS[action]).setDescription(t(lang, 'mod.dm', { action: t(lang, `mod.actions.${action}`), server: interaction.guild.name, reason: reason || '—' }))] })
      .catch(() => {});
  }
}

export async function execute(interaction) {
  const { guild } = interaction;
  const lang = langOf(guild);
  if (!isStaff(interaction.member, getSettings(guild.id))) return failure(interaction, t(lang, 'common.staffOnly'));
  const sub = interaction.options.getSubcommand();
  const user = interaction.options.getUser('user');
  const reason = interaction.options.getString('reason');
  const member = user ? await guild.members.fetch(user.id).catch(() => null) : null;

  // Hierarchy check for actions against members.
  if (member && ['warn', 'timeout', 'kick', 'ban'].includes(sub)) {
    if (member.id === interaction.user.id) return failure(interaction, t(lang, 'mod.notYourself'));
    if (member.roles.highest.position >= interaction.member.roles.highest.position && guild.ownerId !== interaction.user.id) {
      return failure(interaction, t(lang, 'mod.higherRole'));
    }
  }

  switch (sub) {
    case 'warn': {
      db.prepare('INSERT INTO warnings (guild_id, user_id, mod_id, reason, created_at) VALUES (?, ?, ?, ?, ?)').run(guild.id, user.id, interaction.user.id, reason, Date.now());
      const count = db.prepare('SELECT COUNT(*) AS n FROM warnings WHERE guild_id = ? AND user_id = ?').get(guild.id, user.id).n;
      await logAction(interaction, lang, 'warn', user, reason, `\n(${t(lang, 'mod.totalWarnings', { count })})`);
      return success(interaction, t(lang, 'mod.warned', { user: `<@${user.id}>`, count }));
    }
    case 'warnings': {
      const rows = db.prepare('SELECT * FROM warnings WHERE guild_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 15').all(guild.id, user.id);
      const text = rows.map((r) => `**#${r.id}** ${ts(r.created_at)} — ${r.reason} (<@${r.mod_id}>)`).join('\n');
      return interaction.reply({ embeds: [embed('warning').setTitle(t(lang, 'mod.warningsTitle', { user: user.username })).setDescription(text || t(lang, 'mod.noWarnings'))], flags: ephemeral });
    }
    case 'clearwarns': {
      const { changes } = db.prepare('DELETE FROM warnings WHERE guild_id = ? AND user_id = ?').run(guild.id, user.id);
      return success(interaction, t(lang, 'mod.warnsCleared', { count: changes, user: `<@${user.id}>` }));
    }
    case 'timeout': {
      const ms = parseDuration(interaction.options.getString('duration'));
      if (!ms || ms > 28 * 86_400_000) return failure(interaction, t(lang, 'mod.invalidTimeout'));
      if (!member?.moderatable) return failure(interaction, t(lang, 'common.botMissingPerms'));
      await member.timeout(ms, reason ?? undefined);
      await logAction(interaction, lang, 'timeout', user, reason, `\n⏱️ ${ts(Date.now() + ms, 'f')}`);
      return success(interaction, t(lang, 'mod.timedOut', { user: `<@${user.id}>`, until: ts(Date.now() + ms) }));
    }
    case 'untimeout': {
      if (!member?.moderatable) return failure(interaction, t(lang, 'common.botMissingPerms'));
      await member.timeout(null);
      await logAction(interaction, lang, 'untimeout', user, null);
      return success(interaction, t(lang, 'mod.untimedOut', { user: `<@${user.id}>` }));
    }
    case 'kick': {
      if (!member?.kickable) return failure(interaction, t(lang, 'common.botMissingPerms'));
      await logAction(interaction, lang, 'kick', user, reason);
      await member.kick(reason ?? undefined);
      return success(interaction, t(lang, 'mod.kicked', { user: user.tag }));
    }
    case 'ban': {
      if (member && !member.bannable) return failure(interaction, t(lang, 'common.botMissingPerms'));
      await logAction(interaction, lang, 'ban', user, reason);
      const days = interaction.options.getInteger('delete_days') ?? 0;
      await guild.members.ban(user.id, { reason: reason ?? undefined, deleteMessageSeconds: days * 86_400 });
      return success(interaction, t(lang, 'mod.banned', { user: user.tag }));
    }
    case 'unban': {
      const id = interaction.options.getString('user_id').trim();
      const unbanned = await guild.members.unban(id).catch(() => null);
      if (!unbanned) return failure(interaction, t(lang, 'mod.notBanned'));
      await logAction(interaction, lang, 'unban', unbanned, null);
      return success(interaction, t(lang, 'mod.unbanned', { user: unbanned.tag }));
    }
    case 'purge': {
      const amount = interaction.options.getInteger('amount');
      let messages = await interaction.channel.messages.fetch({ limit: 100 });
      if (user) messages = messages.filter((m) => m.author.id === user.id);
      const deleted = await interaction.channel.bulkDelete([...messages.values()].slice(0, amount), true);
      return success(interaction, t(lang, 'mod.purged', { count: deleted.size }));
    }
  }
}
