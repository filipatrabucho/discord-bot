import { REST, Routes } from 'discord.js';
import { config } from './config.js';
import { loadCommands } from './utils/loader.js';

if (!config.token || !config.clientId) {
  console.error('❌ DISCORD_TOKEN and CLIENT_ID are required in .env');
  process.exit(1);
}

const commands = [...(await loadCommands()).values()].map((c) => c.data.toJSON());
const rest = new REST().setToken(config.token);
const route = config.devGuildId ? Routes.applicationGuildCommands(config.clientId, config.devGuildId) : Routes.applicationCommands(config.clientId);

await rest.put(route, { body: commands });
console.log(`✅ ${commands.length} commands registered ${config.devGuildId ? `on server ${config.devGuildId}` : 'globally (may take up to 1h to appear)'}`);
