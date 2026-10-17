import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const commandsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'commands');

export async function loadCommands() {
  const commands = new Map();
  for (const file of fs.readdirSync(commandsDir).filter((f) => f.endsWith('.js')).sort()) {
    const mod = await import(pathToFileURL(path.join(commandsDir, file)).href);
    commands.set(mod.data.name, mod);
  }
  return commands;
}
