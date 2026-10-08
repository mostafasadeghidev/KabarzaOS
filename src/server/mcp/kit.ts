import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { auditLog, users } from '@/db/schema';
import { ForbiddenError } from '@/domain/access/guard';
import type { Actor } from '@/domain/access/permissions';
import { TimerError } from '@/server/timelogs/service';
import { RateLimitedError } from '@/server/messaging/service';
import { getSystemConfig } from '@/server/settings/system-service';
import { assertSensitive, assertWrite, type TokenSession } from './tokens';

/**
 * ابزار-کیتِ MCP (۲.۱۳.۰) — کمکی‌های مشترکِ همهٔ فایل‌های `tools/*`.
 *
 * ⚠️ قاعده‌های اصلی (بی‌تغییر از ۲.۷.۰):
 *  1. هر ابزار **فقط سرویسِ موجود** را صدا می‌زند؛ گاردِ نقش، ماسکِ نام برای
 *     کارفرما، تسکِ خصوصی و «پنهان از کارفرما» همه همان‌جا اعمال می‌شوند.
 *  2. خروجی **فهرستِ سفید** است، نه خروجیِ خامِ سرویس.
 *  3. هر فراخوانِ نوشتنی جدا در «رویدادها» ثبت می‌شود (`mcp.call`).
 *  4. کارهای حساس (پول، حذف، دسترسی‌ها، تنظیمات) دامنهٔ جدای `sensitive` می‌خواهند
 *     که کاربر صریحاً روشنش می‌کند؛ بی آن اصلاً ثبت نمی‌شوند و مدل نمی‌بیندشان.
 */

export type Json = Record<string, unknown> | unknown[];

/**
 * نوعِ محتوای پاسخ. ⚠️ ثابتِ جدا، نه رشتهٔ لفظی کنارِ کلیدِ type: تستِ نگاشتِ اعلان
 * (`gateway.test`) هر `type: '…'` ِ کد را نوعِ اعلان حساب می‌کند.
 */
const TEXT = 'text' as const;

export function ok(data: Json) {
  return { content: [{ type: TEXT, text: JSON.stringify(data, null, 2) }] };
}

export function fail(message: string) {
  return { content: [{ type: TEXT, text: message }], isError: true };
}

/** خطاهای تایمر به زبانِ مدل — تا بداند گامِ بعدی چیست، نه فقط «نشد». */
const TIMER_MESSAGES: Record<TimerError['code'], string> = {
  already_running: 'A timer is already running. Stop it first (stop_timer).',
  not_running: 'No timer is running.',
  nothing_pending: 'There is no long timer waiting for confirmation.',
};

/** خطای سرویس ← پیامِ قابلِ‌فهم برای مدل؛ جزئیاتِ داخلی بیرون نمی‌رود. */
export function explain(error: unknown): string {
  if (error instanceof TimerError) return TIMER_MESSAGES[error.code];
  if (error instanceof RateLimitedError) return 'A new message was sent less than 30 seconds ago. Wait a little and try again.';
  if (error instanceof ForbiddenError) {
    return `Not allowed (${error.message}). The user does not have permission for this, or this connection lacks the needed access level.`;
  }
  if (error instanceof Error && /not.?found/i.test(error.name + error.message)) return 'Not found.';
  if (error instanceof Error && error.name === 'ZodError') return 'Invalid input.';
  return 'The request could not be completed.';
}

/**
 * پالایهٔ خروجی (۲.۱۳.۰). ابزارهای تازه خروجیِ **همان سرویسی** را می‌دهند که صفحهٔ
 * سایت می‌گیرد (گاردِ نقش و ماسکِ نام آنجا اعمال شده). این پالایه فقط چیزهایی را
 * برمی‌دارد که هیچ صفحه‌ای نشان نمی‌دهد و به مدل نباید برسد — کلیدِ فایل در انبار،
 * هش و توکن و راز — و اندازه را مهار می‌کند تا یک فهرستِ بزرگ اتصال را خفه نکند.
 */
const SECRET_KEY = /password|hash|token|secret|apikey|api_key|keyenc|storagekey|storage_key|vaultref|iban|cardnumber/i;
const MAX_ITEMS = 60;
const MAX_STRING = 3000;

export function shape(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value ?? null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…` : value;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value !== 'object') return value;
  if (depth > 7) return '…';
  if (value instanceof Map) return shape(Object.fromEntries(value), depth);
  if (value instanceof Set) return shape([...value], depth);
  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_ITEMS).map((v) => shape(v, depth + 1));
    return value.length > MAX_ITEMS ? [...items, `… ${value.length - MAX_ITEMS} more`] : items;
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (SECRET_KEY.test(k) || typeof v === 'function') continue;
    out[k] = shape(v, depth + 1);
  }
  return out;
}

/** اجرای امنِ یک ابزار: خطا ← isError، نه کرشِ اتصال. */
export async function run(fn: () => Promise<Json>) {
  try {
    return ok(shape(await fn()) as Json);
  } catch (error) {
    return fail(explain(error));
  }
}

async function logCall(session: TokenSession, tool: string, args: unknown, sensitive: boolean) {
  if (session.via === 'telegram') {
    // ربات توکنی ندارد؛ «مورد» ِ رویداد خودِ کاربر است.
    await db.insert(auditLog).values({
      actorType: 'user', actorId: session.actor.id, action: 'telegram.bot_call',
      objectType: 'user', objectId: session.actor.id, after: { tool, args, ai: true, ...(sensitive ? { sensitive } : {}) },
    });
    return;
  }
  await db.insert(auditLog).values({
    actorType: 'api_key',
    actorId: session.actor.id,
    action: 'mcp.call',
    objectType: 'api_key',
    objectId: session.keyId,
    // `name` = نامِ توکن — «مورد» ِ رویداد در «رویدادها» همین را نشان می‌دهد.
    after: { tool, args, name: session.name, ...(sensitive ? { sensitive } : {}) },
  });
}

/** تاریخِ امروز به وقتِ سامانه — `yyyy-mm-dd`. */
export function todayIn(tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz || 'UTC' }).format(new Date());
}

export const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
export const ID = z.number().int().positive();

export interface Kit {
  server: McpServer;
  session: TokenSession;
  actor: Actor;
  /** کاربر به کارهای حساس اجازه داده؟ ابزارهای حساس فقط آن‌وقت ثبت می‌شوند. */
  sensitiveAllowed: boolean;
  /** ابزارِ نوشتنی: دامنهٔ write + ثبتِ فراخوان، پیش از اجرای سرویس. */
  write: (tool: string, args: unknown, fn: () => Promise<Json>) => Promise<ReturnType<typeof ok> | ReturnType<typeof fail>>;
  /** ابزارِ حساس: دامنهٔ sensitive + ثبتِ فراخوان با برچسبِ حساس. */
  sensitive: (tool: string, args: unknown, fn: () => Promise<Json>) => Promise<ReturnType<typeof ok> | ReturnType<typeof fail>>;
  /** منطقهٔ زمانیِ خودِ کاربر، وگرنه سامانه. */
  userZone: () => Promise<string>;
}

export function makeKit(server: McpServer, session: TokenSession): Kit {
  const { actor } = session;
  const guard = (check: () => void, sensitiveCall: boolean) =>
    async (tool: string, args: unknown, fn: () => Promise<Json>) => {
      try {
        check();
      } catch (error) {
        return fail(explain(error));
      }
      await logCall(session, tool, args, sensitiveCall);
      return run(fn);
    };
  return {
    server,
    session,
    actor,
    sensitiveAllowed: session.scopes.includes('sensitive'),
    write: guard(() => assertWrite(session), false),
    sensitive: guard(() => assertSensitive(session), true),
    userZone: async () => {
      const [row] = await db.select({ tz: users.timezone }).from(users).where(eq(users.id, actor.id));
      return row?.tz || (await getSystemConfig()).timezone || 'UTC';
    },
  };
}
