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

await client.login(config.token);
