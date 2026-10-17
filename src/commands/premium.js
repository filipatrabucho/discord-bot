import { SlashCommandBuilder } from 'discord.js';
import { getSettings } from '../database.js';
import { t, langOf } from '../i18n/index.js';
import { describe } from '../utils/localize.js';
import { embed, ephemeral, failure, success } from '../utils/embeds.js';
import { isAdmin } from '../utils/permissions.js';
import { parseDuration, ts } from '../utils/time.js';
import { getPremium, grantPremium, listPremium, perksEmbed, revokePremium } from '../modules/premium.js';

export const category = 'premium';

export const data = describe(new SlashCommandBuilder().setName('premium'), 'premium.description')
  .setDMPermission(false)
  .addSubcommand((s) =>
    describe(s.setName('grant'), 'premium.grant')
      .addUserOption((o) => describe(o.setName('user'), 'premium.user').setRequired(true))
      .addStringOption((o) => describe(o.setName('duration'), 'premium.duration')),
  )
  .addSubcommand((s) => describe(s.setName('revoke'), 'premium.revoke').addUserOption((o) => describe(o.setName('user'), 'premium.user').setRequired(true)))
  .addSubcommand((s) => describe(s.setName('status'), 'premium.status').addUserOption((o) => describe(o.setName('user'), 'premium.user')))
  .addSubcommand((s) => describe(s.setName('list'), 'premium.list'))
  .addSubcommand((s) => describe(s.setName('perks'), 'premium.perksCmd'));

export async function execute(interaction) {
  const { guild } = interaction;
  const lang = langOf(guild);
  const sub = interaction.options.getSubcommand();
  if (['grant', 'revoke', 'list'].includes(sub) && !isAdmin(interaction.member)) return failure(interaction, t(lang, 'common.adminOnly'));
  if (!getSettings(guild.id).roles.premium && sub !== 'perks') return failure(interaction, t(lang, 'premium.noRole'));

  switch (sub) {
    case 'grant': {
      const user = interaction.options.getUser('user');
      const raw = interaction.options.getString('duration');
      const permanent = !raw || ['perm', 'permanent', 'permanente', '∞'].includes(raw.toLowerCase());
      const durationMs = permanent ? null : parseDuration(raw);
      if (!permanent && !durationMs) return failure(interaction, t(lang, 'common.invalidDuration'));
      const { expiresAt } = await grantPremium(guild, user.id, durationMs, interaction.user.id);
      await user
        .send({ embeds: [embed('premium').setDescription(t(lang, 'premium.grantedDm', { server: guild.name, until: expiresAt ? ts(expiresAt, 'f') : t(lang, 'premium.forever') }))] })
        .catch(() => {});
      return success(interaction, t(lang, 'premium.granted', { user: `<@${user.id}>`, until: expiresAt ? ts(expiresAt, 'f') : t(lang, 'premium.forever') }));
    }
    case 'revoke': {
      const user = interaction.options.getUser('user');
      if (!getPremium(guild.id, user.id)) return failure(interaction, t(lang, 'premium.notPremium', { user: `<@${user.id}>` }));
      await revokePremium(guild, user.id, 'manual');
      return success(interaction, t(lang, 'premium.revoked', { user: `<@${user.id}>` }));
    }
    case 'status': {
      const user = interaction.options.getUser('user') ?? interaction.user;
      const row = getPremium(guild.id, user.id);
      if (!row) return interaction.reply({ embeds: [embed('info').setDescription(t(lang, 'premium.notPremium', { user: `<@${user.id}>` }))], flags: ephemeral });
      return interaction.reply({
        embeds: [
          embed('premium').setDescription(
            t(lang, 'premium.statusText', {
              user: `<@${user.id}>`,
              until: row.expires_at ? ts(row.expires_at, 'f') : t(lang, 'premium.forever'),
              source: t(lang, `premium.sources.${row.source}`),
            }),
          ),
        ],
        flags: ephemeral,
      });
    }
    case 'list': {
      const rows = listPremium(guild.id);
      const text = rows
        .slice(0, 40)
        .map((r) => `💎 <@${r.user_id}> — ${r.expires_at ? ts(r.expires_at) : '∞'} (${t(lang, `premium.sources.${r.source}`)})`)
        .join('\n');
      return interaction.reply({ embeds: [embed('premium').setTitle(t(lang, 'premium.listTitle', { count: rows.length })).setDescription(text || '—')], flags: ephemeral });
    }
    case 'perks':
      return interaction.reply({ embeds: [perksEmbed(lang)], flags: ephemeral });
  }
}
