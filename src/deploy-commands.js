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

try {
  await rest.put(route, { body: commands });
} catch (error) {
  if (error.status === 401) {
    console.error('❌ 401 Unauthorized: DISCORD_TOKEN is wrong. Use Developer Portal → Bot → Reset Token (not the OAuth2 Client Secret), no quotes or spaces.');
  } else if (error.status === 403 || error.code === 50001) {
    console.error('❌ Missing access: invite the bot to DEV_GUILD_ID with the applications.commands scope, and check CLIENT_ID / DEV_GUILD_ID.');
  } else {
    console.error(`❌ ${error.status ?? ''} ${error.message}`);
  }
  process.exitCode = 1;
}
if (!process.exitCode) console.log(`✅ ${commands.length} commands registered ${config.devGuildId ? `on server ${config.devGuildId}` : 'globally (may take up to 1h to appear)'}`);
