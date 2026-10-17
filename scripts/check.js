// Sanity checks without connecting to Discord:
//  - every module loads, every slash command builds valid JSON
//  - PT and EN translations have the same keys
//  - every literal translation key used in the code exists
import fs from 'node:fs';
import path from 'node:path';
import en from '../src/i18n/en.js';
import pt from '../src/i18n/pt.js';
import { loadCommands } from '../src/utils/loader.js';

process.env.DB_PATH ??= ':memory:';
let failed = false;
const fail = (msg) => {
  failed = true;
  console.error(`✗ ${msg}`);
};

function flatten(obj, prefix = '', out = new Map()) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out);
    else out.set(key, v);
  }
  return out;
}

const enKeys = flatten(en);
const ptKeys = flatten(pt);
for (const k of enKeys.keys()) if (!ptKeys.has(k)) fail(`pt.js is missing "${k}"`);
for (const k of ptKeys.keys()) if (!enKeys.has(k)) fail(`en.js is missing "${k}"`);
for (const [k, v] of enKeys) {
  if (k.startsWith('cmd.') && typeof v === 'string' && (v.length > 100 || ptKeys.get(k)?.length > 100)) fail(`"${k}" is longer than 100 characters`);
}

// Literal keys used in the code, e.g. t(lang, 'music.added') or 'common.yes'.
const namespaces = new Set(Object.keys(en));
const srcDir = path.resolve('src');
const files = fs.readdirSync(srcDir, { recursive: true }).filter((f) => f.endsWith('.js') && !f.startsWith('i18n'));
const prefixes = new Set([...enKeys.keys()].flatMap((k) => k.split('.').map((_, i, a) => a.slice(0, i + 1).join('.'))));
for (const file of files) {
  const code = fs.readFileSync(path.join(srcDir, file), 'utf8');
  for (const [, key] of code.matchAll(/'([a-z][a-zA-Z]*(?:\.[a-zA-Z0-9]+)+)'/g)) {
    if (!namespaces.has(key.split('.')[0])) continue;
    const full = file.startsWith('commands') && !enKeys.has(key) && !prefixes.has(key) ? `cmd.${key}` : key;
    if (!enKeys.has(full) && !prefixes.has(full)) fail(`${file}: unknown translation key "${key}"`);
  }
}

const { config } = await import('../src/config.js');
config.dbPath = ':memory:';
const commands = await loadCommands();
for (const [name, cmd] of commands) {
  try {
    const json = cmd.data.toJSON();
    if (JSON.stringify(json).length > 8000) fail(`/${name} is too large`);
  } catch (e) {
    fail(`/${name}: ${e.message}`);
  }
}
for (const file of fs.readdirSync(path.join(srcDir, 'modules'))) await import(`../src/modules/${file}`);
await import('../src/events.js');

console.log(failed ? '\nChecks failed.' : `✓ ${commands.size} commands, ${enKeys.size} translation keys — all good.`);
process.exit(failed ? 1 : 0);
