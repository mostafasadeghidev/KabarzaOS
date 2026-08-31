/**
 * Telegram bot credentials.
 *
 * ⚠️ These live apart from `SystemConfig` on purpose. `getSystemConfig()`
 * is deliberately readable **without any permission** — half the app
 * (presence ping, week start) needs it, and gating it would show ordinary
 * users a blank page. A bot token is a secret and must never ride along
 * on that path, so it is stored under its own key and read through its
 * own function.
 *
 * ⚠️ An environment variable always wins over the stored value. Existing
 * deployments configured through `.env` keep working untouched, and an
 * operator who wants the credential out of the database can still put it
 * there.
 */

export interface TelegramCredentials {
  token: string;
  username: string;
}

export const EMPTY_TELEGRAM: TelegramCredentials = { token: '', username: '' };

/** Bot usernames are 5–32 chars of `[A-Za-z0-9_]` and end in `bot`. */
export function isValidBotUsername(value: string): boolean {
  return /^[A-Za-z][A-Za-z0-9_]{3,30}[A-Za-z0-9]$/.test(value);
}

/**
 * A token looks like `<digits>:<35 chars>`. Validated so a typo is caught
 * at save time rather than showing up as silent delivery failures later.
 */
export function isValidBotToken(value: string): boolean {
  return /^\d{6,12}:[A-Za-z0-9_-]{30,}$/.test(value);
}

export function normalizeTelegram(
  input: Partial<Record<keyof TelegramCredentials, unknown>>,
): TelegramCredentials {
  const token = String(input.token ?? '').trim();
  // A leading @ is what people copy out of Telegram; accept and strip it.
  const username = String(input.username ?? '').trim().replace(/^@/, '');
  return {
    token: isValidBotToken(token) ? token : '',
    username: isValidBotUsername(username) ? username : '',
  };
}

/**
 * Environment first, stored value second.
 *
 * ⚠️ Both must come from the same source. Mixing a stored token with an
 * environment username produces a connect link that points at one bot
 * while messages are sent by another — the link silently does nothing.
 */
export function resolveTelegram(
  env: Partial<TelegramCredentials>,
  stored: TelegramCredentials,
): TelegramCredentials {
  const envToken = (env.token ?? '').trim();
  if (envToken !== '') {
    return { token: envToken, username: (env.username ?? '').trim().replace(/^@/, '') };
  }
  return stored;
}
