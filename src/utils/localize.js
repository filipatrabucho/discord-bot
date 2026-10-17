import { t } from '../i18n/index.js';

const clip = (s) => (s.length > 100 ? `${s.slice(0, 97)}...` : s);

/** Sets an English description plus a Portuguese localization for a command, subcommand or option. */
export function describe(builder, key) {
  return builder.setDescription(clip(t('en', `cmd.${key}`))).setDescriptionLocalizations({ 'pt-BR': clip(t('pt', `cmd.${key}`)) });
}

/** A localized choice for string options. */
export function choice(key, value) {
  return { name: t('en', `cmd.${key}`), name_localizations: { 'pt-BR': t('pt', `cmd.${key}`) }, value };
}
