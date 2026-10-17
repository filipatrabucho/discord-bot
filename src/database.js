import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config } from './config.js';

fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });

// Node's built-in SQLite: no native module to compile on install.
export const db = new DatabaseSync(config.dbPath);
db.exec('PRAGMA journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS guild_settings (
  guild_id TEXT PRIMARY KEY,
  data TEXT NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS invite_joins (
  guild_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  inviter_id TEXT,
  code TEXT,
  joined_at INTEGER NOT NULL,
  fake INTEGER NOT NULL DEFAULT 0,
  left INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (guild_id, member_id)
);
CREATE TABLE IF NOT EXISTS invite_bonus (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  bonus INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (guild_id, user_id)
);
CREATE TABLE IF NOT EXISTS invite_rewards (
  guild_id TEXT NOT NULL,
  invites INTEGER NOT NULL,
  role_id TEXT NOT NULL,
  PRIMARY KEY (guild_id, role_id)
);
CREATE TABLE IF NOT EXISTS tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  number INTEGER NOT NULL,
  channel_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  claimed_by TEXT,
  created_at INTEGER NOT NULL,
  closed_at INTEGER
);
CREATE TABLE IF NOT EXISTS premium_members (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  expires_at INTEGER,
  granted_by TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  PRIMARY KEY (guild_id, user_id)
);
CREATE TABLE IF NOT EXISTS warnings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  mod_id TEXT NOT NULL,
  reason TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS levels (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  xp INTEGER NOT NULL DEFAULT 0,
  level INTEGER NOT NULL DEFAULT 0,
  last_xp_at INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (guild_id, user_id)
);
CREATE TABLE IF NOT EXISTS giveaways (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  message_id TEXT,
  prize TEXT NOT NULL,
  winners INTEGER NOT NULL,
  ends_at INTEGER NOT NULL,
  host_id TEXT NOT NULL,
  entrants TEXT NOT NULL DEFAULT '[]',
  winner_ids TEXT NOT NULL DEFAULT '[]',
  ended INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS suggestions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  message_id TEXT,
  user_id TEXT NOT NULL,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  votes TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL
);
`);

const DEFAULT_SETTINGS = {
  lang: null,
  roles: { admin: null, staff: null, premium: null, dj: null, member: null, bots: null, autorole: null },
  channels: {
    welcome: null, goodbye: null, rules: null, verify: null, announcements: null, selfRoles: null,
    logs: null, music: null, createTicket: null, ticketLogs: null, suggestions: null,
    levelUp: null, premiumChat: null, staffChat: null,
  },
  categories: { tickets: null },
  // Every channel created by /setup, by key (also the non-configurable ones like general).
  channelIds: {},
  welcome: { enabled: true, message: null, image: null, dm: false, goodbyeEnabled: true, goodbyeMessage: null },
  // rules: custom rules text (null = default rules)
  // mode: 'button' = the bot's own pop-up; 'discord' = Discord's native rules screening, Member role given once accepted.
  // kickAfterMinutes: in 'discord' mode, kick members who haven't accepted the rules after this long (0 = never).
  verification: { enabled: false, mode: 'button', minAccountAgeDays: 0, rules: null, kickAfterMinutes: 0 },
  tickets: { counter: 0 },
  levels: { enabled: true },
  music: { restrictToChannel: true },
  premium: { boosters: true },
  invites: { fakeDays: 7 },
  selfRoles: [],
};

function isObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v);
}

function deepMerge(base, extra) {
  const out = { ...base };
  for (const [k, v] of Object.entries(extra ?? {})) {
    out[k] = isObject(v) && isObject(base[k]) ? deepMerge(base[k], v) : v;
  }
  return out;
}

const getStmt = db.prepare('SELECT data FROM guild_settings WHERE guild_id = ?');
const setStmt = db.prepare(
  'INSERT INTO guild_settings (guild_id, data) VALUES (?, ?) ON CONFLICT(guild_id) DO UPDATE SET data = excluded.data',
);

export function getSettings(guildId) {
  const row = getStmt.get(guildId);
  return deepMerge(DEFAULT_SETTINGS, row ? JSON.parse(row.data) : {});
}

/** Deep-merges `patch` into the stored settings and returns the result. */
export function updateSettings(guildId, patch) {
  const next = deepMerge(getSettings(guildId), patch);
  setStmt.run(guildId, JSON.stringify(next));
  return next;
}
