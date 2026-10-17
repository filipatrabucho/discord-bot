import { Events, MessageFlags } from 'discord.js';
import { getSettings, updateSettings } from './database.js';
import { t, langOf } from './i18n/index.js';
import { embed } from './utils/embeds.js';
import { cacheGuildInvites, onInviteCreate, trackJoin, trackLeave } from './modules/invites.js';
import { applyAutoRoles, sendGoodbye, sendWelcome } from './modules/welcome.js';
import { logMessageDelete, logMessageUpdate, sendLog } from './modules/logs.js';
import { checkExpired, onMemberUpdate } from './modules/premium.js';
import { checkEnded } from './modules/giveaways.js';
import { handleMessage } from './modules/levels.js';
import { control } from './modules/music.js';
import * as verification from './modules/verification.js';
import * as tickets from './modules/tickets.js';
import * as giveaways from './modules/giveaways.js';
import * as suggestions from './modules/suggestions.js';
import * as selfroles from './modules/selfroles.js';

/** customId prefix -> handler(interaction, action, args). Commands exporting handleComponent are added too. */
const componentHandlers = {
  verify: verification.handleComponent,
  ticket: tickets.handleComponent,
  giveaway: giveaways.handleComponent,
  suggest: suggestions.handleComponent,
  selfrole: selfroles.handleComponent,
  music: (interaction, action) => control(interaction, action),
};

async function reportError(interaction, error) {
  console.error(`[interaction] ${interaction.customId ?? interaction.commandName}:`, error);
  const lang = langOf(interaction.guild);
  const payload = { embeds: [embed('danger').setDescription(`❌ ${t(lang, 'common.error')}`)], flags: MessageFlags.Ephemeral };
  try {
    if (interaction.deferred && !interaction.replied) await interaction.editReply(payload);
    else if (interaction.replied) await interaction.followUp(payload);
    else await interaction.reply(payload);
  } catch {
    // The interaction may have expired; nothing else to do.
  }
}

export function registerEvents(client) {
  for (const [name, cmd] of client.commands) if (cmd.handleComponent) componentHandlers[name] = cmd.handleComponent;

  client.once(Events.ClientReady, async () => {
    console.log(`✅ Logged in as ${client.user.tag} — ${client.guilds.cache.size} server(s)`);
    for (const guild of client.guilds.cache.values()) {
      await cacheGuildInvites(guild);
      // Cache members so updates (e.g. accepting the rules pop-up) compare against real data.
      if (guild.memberCount <= 5000) await guild.members.fetch().catch((e) => console.warn('[members]', e.message));
    }
    const tick = () => {
      checkExpired(client).catch((e) => console.warn('[premium]', e.message));
      checkEnded(client).catch((e) => console.warn('[giveaways]', e.message));
      verification.kickUnaccepted(client).catch((e) => console.warn('[verification]', e.message));
    };
    tick();
    setInterval(tick, 30_000);
  });

  client.on(Events.GuildCreate, async (guild) => {
    await cacheGuildInvites(guild);
    if (!getSettings(guild.id).lang) updateSettings(guild.id, { lang: langOf(guild) });
    // Say hi in the first channel we can talk in.
    const lang = langOf(guild);
    const channel = guild.systemChannel ?? guild.channels.cache.find((c) => c.isTextBased() && c.permissionsFor(guild.members.me)?.has('SendMessages'));
    await channel?.send({ embeds: [embed('primary').setTitle(t(lang, 'bot.joinTitle')).setDescription(t(lang, 'bot.joinDescription'))] }).catch(() => {});
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.inGuild() && !interaction.isChatInputCommand()) return;
    if (interaction.isAutocomplete()) {
      return client.commands.get(interaction.commandName)?.autocomplete?.(interaction).catch((e) => console.warn('[autocomplete]', e.message));
    }
    try {
      if (interaction.isChatInputCommand()) {
        const cmd = client.commands.get(interaction.commandName);
        if (!cmd) return;
        if (!interaction.inGuild() && cmd.data.name !== 'help') {
          return interaction.reply({ content: t(interaction.locale?.startsWith('pt') ? 'pt' : 'en', 'common.guildOnly'), flags: MessageFlags.Ephemeral });
        }
        return await cmd.execute(interaction);
      }
      if (interaction.isButton() || interaction.isStringSelectMenu() || interaction.isModalSubmit()) {
        const [prefix, action, ...args] = interaction.customId.split(':');
        await componentHandlers[prefix]?.(interaction, action, args);
      }
    } catch (error) {
      await reportError(interaction, error);
    }
  });

  client.on(Events.GuildMemberAdd, async (member) => {
    const inviteInfo = await trackJoin(member).catch((e) => console.warn('[invites]', e.message));
    await applyAutoRoles(member);
    if (!member.user.bot) await sendWelcome(member, inviteInfo ?? null);
    const lang = langOf(member.guild);
    await sendLog(
      member.guild,
      embed('success')
        .setAuthor({ name: member.user.tag, iconURL: member.user.displayAvatarURL() })
        .setDescription(t(lang, 'logs.memberJoined', { user: `<@${member.id}>`, created: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>` }))
        .addFields(inviteInfo ? [{ name: t(lang, 'welcome.invitedBy'), value: inviteInfo.inviterId ? `<@${inviteInfo.inviterId}> (\`${inviteInfo.code}\`)` : `\`${inviteInfo.code}\`` }] : []),
    );
  });

  client.on(Events.GuildMemberRemove, async (member) => {
    trackLeave(member);
    if (!member.user.bot) await sendGoodbye(member);
    const lang = langOf(member.guild);
    await sendLog(member.guild, embed('danger').setAuthor({ name: member.user.tag, iconURL: member.user.displayAvatarURL() }).setDescription(t(lang, 'logs.memberLeft', { user: `<@${member.id}>` })));
  });

  client.on(Events.GuildMemberUpdate, (before, after) => {
    onMemberUpdate(before, after).catch((e) => console.warn('[premium]', e.message));
    verification.onScreeningPassed(before, after).catch((e) => console.warn('[verification]', e.message));
  });
  client.on(Events.InviteCreate, onInviteCreate);
  client.on(Events.MessageCreate, (message) => handleMessage(message).catch((e) => console.warn('[levels]', e.message)));
  client.on(Events.MessageDelete, (message) => logMessageDelete(message)?.catch(() => {}));
  client.on(Events.MessageUpdate, (before, after) => logMessageUpdate(before, after)?.catch(() => {}));
}
