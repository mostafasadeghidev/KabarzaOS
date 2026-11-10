import 'server-only';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { auditLog, schedulerStamps } from '@/db/schema';
import type { Actor } from '@/domain/access/permissions';
import { ForbiddenError } from '@/domain/access/guard';
import { normalizeCorpMail, type CorpMailConfig } from '@/domain/corp-mail/config';
import {
  isCorpMailConfigured, JmapError, jmapCall, result, sessionAccountId, stalwartHost, type JmapErrorCode,
} from './jmap';

/**
 * تنظیمات و آزمونِ اتصالِ ایمیلِ شرکتی (۲.۵۹.۰) — فقط مالک.
 *
 * ⚠️ کلیدِ API فقط در env است و هرگز اینجا نوشته یا به کلاینت داده نمی‌شود.
 */

const CONFIG_KEY = 'corp-mail:config';
const STATUS_KEY = 'corp-mail:status';

export interface CorpMailStatus {
  ok: boolean;
  at: string;
  /** شمارِ حساب‌های روی سرور، در آزمونِ موفق. */
  accounts?: number;
  /** شناسهٔ Stalwart ِ دامنهٔ تنظیم‌شده؛ null یعنی دامنه روی سرور پیدا نشد. */
  domainId?: string | null;
  /** دامنه‌هایی که سرور دارد — برای راهنماییِ مالک. */
  domains?: string[];
  error?: JmapErrorCode;
}

async function readKey(key: string): Promise<Record<string, unknown> | null> {
  const [row] = await db.select({ value: schedulerStamps.value }).from(schedulerStamps).where(eq(schedulerStamps.key, key));
  if (!row) return null;
  try {
    return JSON.parse(row.value) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function writeKey(key: string, value: unknown) {
  const json = JSON.stringify(value);
  await db.insert(schedulerStamps).values({ key, value: json })
    .onConflictDoUpdate({ target: schedulerStamps.key, set: { value: json, updatedAt: new Date() } });
}

function assertOwner(actor: Actor) {
  if (!actor.roles.includes('owner')) throw new ForbiddenError('owner');
}

/** تنظیماتِ مؤثر — برای سرویس‌های دیگرِ همین ماژول، بی‌گارد. */
export async function corpMailConfig(): Promise<CorpMailConfig> {
  return normalizeCorpMail(await readKey(CONFIG_KEY));
}

export async function corpMailStatus(): Promise<CorpMailStatus | null> {
  const raw = await readKey(STATUS_KEY);
  return raw && typeof raw.ok === 'boolean' && typeof raw.at === 'string' ? (raw as unknown as CorpMailStatus) : null;
}

export interface CorpMailSettingsView {
  /** STALWART_URL و STALWART_API_KEY هر دو هستند؟ */
  configured: boolean;
  /** فقط میزبان — مثلِ `stalwart:8080` یا `mailadmin.example.com`. */
  host: string | null;
  config: CorpMailConfig;
  status: CorpMailStatus | null;
}

export async function getCorpMailSettings(actor: Actor): Promise<CorpMailSettingsView> {
  assertOwner(actor);
  return {
    configured: isCorpMailConfigured(),
    host: stalwartHost(),
    config: await corpMailConfig(),
    status: await corpMailStatus(),
  };
}

export async function saveCorpMailSettings(actor: Actor, input: Record<string, unknown>): Promise<CorpMailConfig> {
  assertOwner(actor);
  const before = await corpMailConfig();
  const config = normalizeCorpMail(input);
  await writeKey(CONFIG_KEY, config);
  // ⚠️ دامنهٔ تازه یعنی شناسهٔ دامنهٔ قبلی دیگر معتبر نیست — آزمون باید دوباره انجام شود.
  if (before.domain !== config.domain) await writeKey(STATUS_KEY, { ok: false, at: new Date().toISOString() });
  await db.insert(auditLog).values({
    actorType: 'user', actorId: actor.id, action: 'corp_mail.settings', objectType: 'settings', objectId: 0,
    before: before as unknown as Record<string, unknown>, after: config as unknown as Record<string, unknown>,
  });
  return config;
}

/**
 * آزمونِ اتصال: نشست، دامنه‌ها و شمارِ حساب‌ها. نتیجه ذخیره می‌شود تا بقیهٔ
 * ماژول شناسهٔ دامنه را بی‌پرسیدنِ دوباره داشته باشد.
 */
export async function testCorpMail(actor: Actor): Promise<CorpMailStatus> {
  assertOwner(actor);
  const config = await corpMailConfig();
  let status: CorpMailStatus;
  try {
    const accountId = await sessionAccountId();
    const responses = await jmapCall([
      ['x:Domain/get', { accountId, ids: null, properties: ['name'] }, 'd'],
      ['x:Account/get', { accountId, ids: null, properties: ['name'] }, 'a'],
    ]);
    const domains = (result<{ list?: Array<{ id: string; name: string }> }>(responses, 'd').list ?? []);
    const accounts = (result<{ list?: unknown[] }>(responses, 'a').list ?? []).length;
    const match = domains.find((d) => d.name?.toLowerCase() === config.domain);
    status = {
      ok: true, at: new Date().toISOString(), accounts,
      domainId: match?.id ?? null, domains: domains.map((d) => d.name).filter(Boolean),
    };
  } catch (error) {
    status = { ok: false, at: new Date().toISOString(), error: error instanceof JmapError ? error.code : 'network' };
    if (!(error instanceof JmapError)) console.error('[corp-mail] test failed');
  }
  await writeKey(STATUS_KEY, status);
  return status;
}
