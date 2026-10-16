import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { auditLog, schedulerStamps } from '@/db/schema';
import type { Actor } from '@/domain/access/permissions';
import { ForbiddenError } from '@/domain/access/guard';
import {
  EMPTY_SMTP, isValidSmtpHost, normalizeFrom, normalizePort, normalizeSmtp, resolveSmtp,
  type SmtpConfig, type SmtpStored,
} from '@/domain/settings/smtp';
import { open, seal } from '@/server/ai/secret-box';

/**
 * ایمیلِ خروجی از پنل (۲.۳۲.۰) — زیرِ کلیدِ خودش، نه در `SystemConfig` ِ بی‌مجوز.
 * قاعدهٔ «محیط برنده است» در `domain/settings/smtp`.
 */

const KEY = 'mail:smtp';

function env() {
  return {
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    user: process.env.SMTP_USER,
    password: process.env.SMTP_PASSWORD,
    from: process.env.SMTP_FROM,
  };
}

function envProvides(): boolean {
  return (process.env.SMTP_HOST ?? '').trim() !== '';
}

async function stored(): Promise<SmtpStored> {
  const rows = await db.select({ value: schedulerStamps.value })
    .from(schedulerStamps).where(eq(schedulerStamps.key, KEY));
  if (!rows[0]) return EMPTY_SMTP;
  try {
    return normalizeSmtp(JSON.parse(rows[0].value) as Record<string, unknown>);
  } catch {
    // ردیفِ خراب نباید اپ را بخواباند؛ ایمیل فقط خاموش می‌ماند.
    return EMPTY_SMTP;
  }
}

/** پیکربندیِ مؤثر، یا null یعنی ایمیل خاموش است. ⚠️ فقط سمتِ سرور — رمز در آن است. */
export async function smtpConfig(): Promise<SmtpConfig | null> {
  const s = await stored();
  const password = s.passwordSealed ? open(s.passwordSealed) : null;
  return resolveSmtp(env(), s, password);
}

function assertOwner(actor: Actor) {
  if (!actor.roles.includes('owner')) throw new ForbiddenError('owner');
}

export interface SmtpSettingsView {
  host: string;
  port: number;
  user: string;
  from: string;
  /** فقط «هست یا نه» — رمز هرگز به کلاینت نمی‌رود. */
  hasPassword: boolean;
  /** ایمیل الان فعال است؟ */
  enabled: boolean;
  /** از محیط می‌آید ← فرم فقط‌خواندنی. */
  fromEnv: boolean;
}

export async function getSmtpSettings(actor: Actor): Promise<SmtpSettingsView> {
  assertOwner(actor);
  if (envProvides()) {
    const e = env();
    return {
      host: (e.host ?? '').trim(), port: normalizePort(e.port ?? 587), user: (e.user ?? '').trim(),
      from: (e.from ?? '').trim(), hasPassword: Boolean(e.password), enabled: true, fromEnv: true,
    };
  }
  const s = await stored();
  return {
    host: s.host, port: s.port, user: s.user, from: s.from,
    hasPassword: Boolean(s.passwordSealed && open(s.passwordSealed) !== null),
    enabled: s.host !== '',
    fromEnv: false,
  };
}

export type SmtpSaveResult = 'saved' | 'cleared' | 'invalid_host' | 'invalid_from' | 'env_locked';

/**
 * ذخیره یا پاک‌کردن. ⚠️ رمزِ خالی یعنی «دست نزن» — فرم هرگز رمزِ فعلی را نشان
 * نمی‌دهد، پس خانهٔ خالی حالتِ عادیِ هر بار است. رمز هرگز در ممیزی نمی‌رود.
 */
export async function saveSmtpSettings(
  actor: Actor,
  input: { host: string; port: string; user: string; password: string; from: string; clear?: boolean },
): Promise<SmtpSaveResult> {
  assertOwner(actor);
  if (envProvides()) return 'env_locked';

  const write = async (value: SmtpStored, action: string) => {
    await db.insert(schedulerStamps)
      .values({ key: KEY, value: JSON.stringify(value) })
      .onConflictDoUpdate({ target: schedulerStamps.key, set: { value: JSON.stringify(value), updatedAt: new Date() } });
    await db.insert(auditLog).values({
      actorType: 'user', actorId: actor.id, action, objectType: 'settings', objectId: 0,
      after: { host: value.host, port: value.port, user: value.user, from: value.from },
    });
  };

  if (input.clear) {
    await write(EMPTY_SMTP, 'settings.smtp.clear');
    return 'cleared';
  }
  const host = input.host.trim();
  if (!isValidSmtpHost(host)) return 'invalid_host';
  const from = normalizeFrom(input.from);
  if (input.from.trim() !== '' && from === '') return 'invalid_from';

  const before = await stored();
  const password = input.password;
  await write({
    host,
    port: normalizePort(input.port.trim() || 587),
    user: input.user.trim(),
    passwordSealed: password !== '' ? seal(password) : before.passwordSealed,
    from,
  }, 'settings.smtp.save');
  return 'saved';
}
