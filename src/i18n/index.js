import en from './en.js';
import pt from './pt.js';
import { config } from '../config.js';
import { getSettings } from '../database.js';

export const locales = { en, pt };
export const LANGS = ['pt', 'en'];

function lookup(obj, key) {
  return key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

/**
 * Translates `key` into `lang`, falling back to English. Strings get `{var}`
 * interpolation; arrays and objects are returned as-is.
 */
export function t(lang, key, vars = {}) {
  const value = lookup(locales[lang], key) ?? lookup(en, key);
  if (value === undefined) return key;
  if (typeof value !== 'string') return value;
  return value.replace(/\{(\w+)\}/g, (match, name) => (name in vars ? String(vars[name]) : match));
}

/** Language used for messages in a guild: explicit setting, then the guild's locale, then the default. */
export function langOf(guild) {
  if (!guild) return config.defaultLang;
  const { lang } = getSettings(guild.id);
  if (lang) return lang;
  if (guild.preferredLocale?.startsWith('pt')) return 'pt';
  if (guild.preferredLocale?.startsWith('en')) return 'en';
  return config.defaultLang;
}
