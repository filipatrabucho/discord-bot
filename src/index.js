import { Client, GatewayIntentBits, Partials } from 'discord.js';
import { config } from './config.js';
import { loadCommands } from './utils/loader.js';
import { registerEvents } from './events.js';
import { initMusic } from './modules/music.js';

if (!config.token) {
  console.error('❌ DISCORD_TOKEN is missing. Copy .env.example to .env and fill it in.');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers, // privileged: welcome, invites, premium boosts
    GatewayIntentBits.GuildInvites,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, // privileged: logs and ticket transcripts
    GatewayIntentBits.GuildVoiceStates,
  ],
  partials: [Partials.GuildMember, Partials.Message, Partials.Channel],
});

client.commands = await loadCommands();
await initMusic(client);
registerEvents(client);

process.on('unhandledRejection', (error) => console.error('[unhandledRejection]', error));

try {
  await client.login(config.token);
} catch (error) {
  const hints = {
    TokenInvalid: 'DISCORD_TOKEN is wrong. Use Developer Portal → Bot → Reset Token (not the OAuth2 Client Secret), no quotes or spaces.',
    DisallowedIntents: 'Enable "Server Members Intent" and "Message Content Intent" in Developer Portal → Bot → Privileged Gateway Intents.',
  };
  const hint = hints[error.code] ?? (/disallowed intents/i.test(error.message) ? hints.DisallowedIntents : error.message);
  console.error(`❌ ${hint}`);
  process.exit(1);
}
