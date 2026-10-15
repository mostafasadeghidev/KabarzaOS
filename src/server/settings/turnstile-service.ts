import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { auditLog, schedulerStamps } from '@/db/schema';
import type { Actor } from '@/domain/access/permissions';
import { ForbiddenError } from '@/domain/access/guard';
import {
  EMPTY_TURNSTILE, isValidTurnstileKey, normalizeTurnstile, resolveTurnstile, siteverifyOk,
  type SiteverifyResponse, type TurnstileActive, type TurnstileStored,
} from '@/domain/settings/turnstile';
import { open, seal } from '@/server/ai/secret-box';

/**
 * کپچای کلودفلر (۲.۳۱.۰) — کلیدها زیرِ کلیدِ خودشان، نه در `SystemConfig` ِ بی‌مجوز.
 * قواعد و سه محافظِ ضدِ قفل‌شدن در `domain/settings/turnstile`.
 */

const KEY = 'security:turnstile';
const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

function env() {
  return {
    siteKey: process.env.TURNSTILE_SITE_KEY,
    secret: process.env.TURNSTILE_SECRET_KEY,
    disabled: process.env.TURNSTILE_DISABLED,
  };
}

function envProvidesKeys(): boolean {
  return Boolean(process.env.TURNSTILE_SITE_KEY?.trim() && process.env.TURNSTILE_SECRET_KEY?.trim());
}

function envKillSwitch(): boolean {
  return ['1', 'true', 'yes'].includes((process.env.TURNSTILE_DISABLED ?? '').trim().toLowerCase());
}

/** اثرِ انگشتِ جفتِ کلید — آزمونِ موفق فقط برای همین جفت معتبر است. */
function fingerprint(siteKey: string, secret: string): string {
  return createHash('sha256').update(`turnstile|${siteKey}|${secret}`).digest('base64url').slice(0, 24);
}

async function stored(): Promise<TurnstileStored> {
  const rows = await db.select({ value: schedulerStamps.value })
    .from(schedulerStamps).where(eq(schedulerStamps.key, KEY));
  if (!rows[0]) return EMPTY_TURNSTILE;
  try {
    return normalizeTurnstile(JSON.parse(rows[0].value) as Record<string, unknown>);
  } catch {
    // ردیفِ خراب نباید ورود را ببندد؛ کپچا فقط خاموش می‌ماند.
    return EMPTY_TURNSTILE;
  }
}

async function write(actor: Actor, value: TurnstileStored, action: string) {
  await db.insert(schedulerStamps)
    .values({ key: KEY, value: JSON.stringify(value) })
    .onConflictDoUpdate({ target: schedulerStamps.key, set: { value: JSON.stringify(value), updatedAt: new Date() } });
  // ⚠️ کلیدِ محرمانه هرگز در ممیزی نمی‌رود — فقط رویداد و کلیدِ عمومی.
  await db.insert(auditLog).values({
    actorType: 'user', actorId: actor.id, action, objectType: 'settings', objectId: 0,
    after: { siteKey: value.siteKey, enabled: value.enabled },
  });
}

function assertOwner(actor: Actor) {
  if (!actor.roles.includes('owner')) throw new ForbiddenError('owner');
}

/** کلیدهای مؤثر، یا null یعنی کپچا خاموش است. ⚠️ فقط سمتِ سرور — رازِ کلودفلر در آن است. */
export async function activeTurnstile(): Promise<TurnstileActive | null> {
  const s = await stored();
  const secret = s.secretSealed ? open(s.secretSealed) : null;
  return resolveTurnstile(env(), s, secret, fingerprint);
}

/** برای صفحه‌های عمومی: فقط کلیدِ عمومی (یا null). */
export async function publicTurnstileSiteKey(): Promise<string | null> {
  return (await activeTurnstile())?.siteKey ?? null;
}

/** تماس با کلودفلر. خطای شبکه = رد (بسته‌ماندن امن‌تر است؛ راهِ نجات `TURNSTILE_DISABLED`). */
async function siteverify(secret: string, token: string, ip: string | null): Promise<SiteverifyResponse | null> {
  const body = new URLSearchParams({ secret, response: token });
  if (ip) body.set('remoteip', ip);
  try {
    const res = await fetch(SITEVERIFY, { method: 'POST', body, signal: AbortSignal.timeout(8000) });
    return (await res.json()) as SiteverifyResponse;
  } catch {
    return null;
  }
}

/**
 * پاسخِ ویجت از فرم را می‌سنجد. کپچای خاموش ← همیشه true.
 * ⚠️ پیش از هر کارِ دیگرِ فرم صدا زده می‌شود (ورود، درخواستِ ایمیل).
 */
export async function verifyTurnstile(token: FormDataEntryValue | null, ip: string | null): Promise<boolean> {
  const active = await activeTurnstile();
  if (!active) return true;
  const value = typeof token === 'string' ? token.trim() : '';
  if (!value || value.length > 2048) return false;
  return siteverifyOk(await siteverify(active.secret, value, ip));
}

/* ------------------------------------------------------------------ *
 * تنظیمات — فقط مالک
 * ------------------------------------------------------------------ */

export interface TurnstileSettingsView {
  siteKey: string;
  /** فقط «هست یا نه» — خودِ کلیدِ محرمانه هرگز به کلاینت نمی‌رود. */
  hasSecret: boolean;
  enabled: boolean;
  /** آزمونِ موفق برای همین کلیدها انجام شده؟ (پیش‌شرطِ روشن‌کردن) */
  verified: boolean;
  /** الان واقعاً روی فرم‌ها هست؟ */
  active: boolean;
  fromEnv: boolean;
  killSwitch: boolean;
}

export async function getTurnstileSettings(actor: Actor): Promise<TurnstileSettingsView> {
  assertOwner(actor);
  const s = await stored();
  const secret = s.secretSealed ? open(s.secretSealed) : null;
  const fromEnv = envProvidesKeys();
  return {
    siteKey: fromEnv ? (process.env.TURNSTILE_SITE_KEY ?? '').trim() : s.siteKey,
    hasSecret: fromEnv || Boolean(secret),
    enabled: s.enabled,
    verified: Boolean(secret && s.siteKey && s.verifiedFor === fingerprint(s.siteKey, secret)),
    active: (await activeTurnstile()) !== null,
    fromEnv,
    killSwitch: envKillSwitch(),
  };
}

export type TurnstileSaveResult = 'saved' | 'cleared' | 'invalid' | 'env_locked';

/**
 * ذخیره یا پاک‌کردنِ کلیدها. ⚠️ هر ذخیره کپچا را خاموش و آزمون را باطل می‌کند:
 * کلیدِ تازهٔ آزموده‌نشده هرگز مستقیم روی فرمِ ورود نمی‌نشیند.
 * کلیدِ محرمانهٔ خالی یعنی «دست نزن» (فرم هرگز مقدارِ فعلی را نشان نمی‌دهد).
 */
export async function saveTurnstileKeys(
  actor: Actor,
  input: { siteKey: string; secret: string; clear?: boolean },
): Promise<TurnstileSaveResult> {
  assertOwner(actor);
  if (envProvidesKeys()) return 'env_locked';
  if (input.clear) {
    await write(actor, EMPTY_TURNSTILE, 'settings.turnstile.clear');
    return 'cleared';
  }
  const before = await stored();
  const siteKey = input.siteKey.trim();
  const secret = input.secret.trim();
  if (!isValidTurnstileKey(siteKey)) return 'invalid';
  if (secret && !isValidTurnstileKey(secret)) return 'invalid';
  if (!secret && !before.secretSealed) return 'invalid';
  await write(actor, {
    siteKey,
    secretSealed: secret ? seal(secret) : before.secretSealed,
    enabled: false,
    verifiedFor: '',
  }, 'settings.turnstile.save');
  return 'saved';
}

export type TurnstileTestResult = 'ok' | 'no_keys' | 'failed';

/**
 * آزمون: ویجتِ صفحهٔ تنظیمات با کلیدِ عمومیِ ذخیره‌شده توکن ساخته؛ اینجا با
 * کلیدِ محرمانهٔ ذخیره‌شده نزدِ کلودفلر سنجیده می‌شود. موفق ← این جفت «آزموده».
 */
export async function testTurnstile(actor: Actor, token: string, ip: string | null): Promise<TurnstileTestResult> {
  assertOwner(actor);
  const s = await stored();
  const secret = s.secretSealed ? open(s.secretSealed) : null;
  if (!s.siteKey || !secret) return 'no_keys';
  if (!siteverifyOk(await siteverify(secret, token, ip))) return 'failed';
  await write(actor, { ...s, verifiedFor: fingerprint(s.siteKey, secret) }, 'settings.turnstile.verified');
  return 'ok';
}

export type TurnstileToggleResult = 'on' | 'off' | 'not_verified' | 'env_locked';

export async function setTurnstileEnabled(actor: Actor, on: boolean): Promise<TurnstileToggleResult> {
  assertOwner(actor);
  if (envProvidesKeys()) return 'env_locked';
  const s = await stored();
  const secret = s.secretSealed ? open(s.secretSealed) : null;
  if (on && !(secret && s.siteKey && s.verifiedFor === fingerprint(s.siteKey, secret))) return 'not_verified';
  await write(actor, { ...s, enabled: on }, on ? 'settings.turnstile.on' : 'settings.turnstile.off');
  return on ? 'on' : 'off';
}
