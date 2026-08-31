import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { auditLog, schedulerStamps } from '@/db/schema';
import { can, type Actor } from '@/domain/access/permissions';
import { ForbiddenError } from '@/domain/access/guard';
import {
  EMPTY_TELEGRAM, normalizeTelegram, resolveTelegram, type TelegramCredentials,
} from '@/domain/settings/telegram';

/**
 * Telegram credentials — stored under their own key, never inside the
 * permission-free system config.
 */

const KEY = 'telegram:bot';

function fromEnv(): Partial<TelegramCredentials> {
  return {
    token: process.env.TELEGRAM_BOT_TOKEN ?? '',
    username: process.env.TELEGRAM_BOT_USERNAME ?? '',
  };
}

async function stored(): Promise<TelegramCredentials> {
  const rows = await db.select({ value: schedulerStamps.value })
    .from(schedulerStamps).where(eq(schedulerStamps.key, KEY));
  if (!rows[0]) return EMPTY_TELEGRAM;
  try {
    return normalizeTelegram(JSON.parse(rows[0].value) as Record<string, unknown>);
  } catch {
    // A corrupt row must not take the app down; Telegram just stays off.
    return EMPTY_TELEGRAM;
  }
}

/**
 * The credentials the server should actually use.
 *
 * ⚠️ Server-side only. Never hand the result to a client component — the
 * token is a secret. Components that need to know whether Telegram is
 * available get `telegramEnabled()` instead.
 */
export async function telegramCredentials(): Promise<TelegramCredentials> {
  return resolveTelegram(fromEnv(), await stored());
}

/** Is the channel usable at all? Safe to expose — it is only a boolean. */
export async function telegramEnabled(): Promise<boolean> {
  return (await telegramCredentials()).token !== '';
}

/** The bot username, for building connect links. Not a secret. */
export async function telegramBotUsername(): Promise<string> {
  return (await telegramCredentials()).username;
}

export interface TelegramSettingsView {
  /** Never the token itself — only whether one is set. */
  hasToken: boolean;
  username: string;
  /**
   * True when the environment supplies the token, which means the form is
   * read-only: saving would store a value the resolver then ignores, and
   * the operator would think it took effect.
   */
  fromEnv: boolean;
}

/** What the settings page may show. Requires permission to view. */
export async function getTelegramSettings(actor: Actor): Promise<TelegramSettingsView> {
  if (!can(actor, 'settings.manage')) throw new ForbiddenError('settings.manage');
  const env = (process.env.TELEGRAM_BOT_TOKEN ?? '').trim() !== '';
  const current = await telegramCredentials();
  return { hasToken: current.token !== '', username: current.username, fromEnv: env };
}

export type TelegramSaveResult = 'saved' | 'cleared' | 'invalid' | 'env_locked';

/**
 * Save or clear the credentials.
 *
 * ⚠️ An empty token field means "leave it alone", not "delete it" — the
 * form never renders the current token, so an empty box is the normal
 * state on every visit. Clearing is explicit, via `clear`.
 */
export async function saveTelegramSettings(
  actor: Actor,
  input: { token: string; username: string; clear?: boolean },
): Promise<TelegramSaveResult> {
  if (!can(actor, 'settings.manage')) throw new ForbiddenError('settings.manage');
  if ((process.env.TELEGRAM_BOT_TOKEN ?? '').trim() !== '') return 'env_locked';

  const write = async (value: TelegramCredentials, action: string) => {
    await db.insert(schedulerStamps)
      .values({ key: KEY, value: JSON.stringify(value) })
      .onConflictDoUpdate({
        target: schedulerStamps.key,
        set: { value: JSON.stringify(value), updatedAt: new Date() },
      });
    // ⚠️ The token is never written to the audit trail, only the event.
    await db.insert(auditLog).values({
      actorType: 'user', actorId: actor.id, action,
      objectType: 'settings', objectId: 0,
      after: { username: value.username },
    });
  };

  if (input.clear) {
    await write(EMPTY_TELEGRAM, 'settings.telegram.clear');
    return 'cleared';
  }

  const next = normalizeTelegram(input);
  if (next.token === '' || next.username === '') return 'invalid';
  await write(next, 'settings.telegram.save');
  return 'saved';
}
