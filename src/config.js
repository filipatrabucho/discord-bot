import 'dotenv/config';

export const config = {
  token: process.env.DISCORD_TOKEN,
  clientId: process.env.CLIENT_ID,
  devGuildId: process.env.DEV_GUILD_ID || null,
  defaultLang: process.env.DEFAULT_LANG === 'en' ? 'en' : 'pt',
  enableYoutube: process.env.ENABLE_YOUTUBE !== 'false',
  dbPath: process.env.DB_PATH || 'data/bot.db',
};
