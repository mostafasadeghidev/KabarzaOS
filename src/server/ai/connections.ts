import { lookup } from 'node:dns/promises';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { aiConnections, auditLog } from '@/db/schema';
import type { Actor } from '@/domain/access/permissions';
import {
  authHeaders, isPrivateAddress, isProviderId, isSafeBaseUrl, keyHint, normalizeBaseUrl,
  pickDefaultModel, PROVIDERS, shapeModels, type ModelOption, type ProviderId,
} from '@/domain/ai/providers';
import { open, seal } from './secret-box';

/**
 * اتصالِ هوشِ مصنوعیِ هر کاربر (۲.۹.۰) — «مغزِ» ربات تلگرام.
 *
 * ⚠️ کلید فقط رمزگذاری‌شده ذخیره می‌شود و **هیچ‌وقت** به مرورگر برنمی‌گردد؛
 * نما فقط ارائه‌دهنده، مدل و چهار نویسهٔ آخر را دارد.
 * ⚠️ هر کاربر فقط اتصالِ **خودش** را می‌بیند و عوض می‌کند — مدیر هم نه.
 * از ۲.۱۲.۰ هر کاربر تا `MAX_CONNECTIONS` اتصال با **اولویت** دارد: ربات اولی را
 * امتحان می‌کند و اگر به سقف خورد، کلیدش کار نکرد یا جواب نداد، سراغِ بعدی می‌رود.
 */

export const MAX_CONNECTIONS = 5;

export class AiError extends Error {
  constructor(readonly code: 'bad_url' | 'invalid_key' | 'network' | 'no_key' | 'bad_provider' | 'too_many' | 'not_found') {
    super(code);
    this.name = 'AiError';
  }
}

export interface AiConnectionView {
  id: number;
  priority: number;
  provider: ProviderId;
  baseUrl: string;
  model: string;
  keyHint: string;
  updatedAt: string;
}

export interface AiSecret {
  id: number;
  provider: ProviderId;
  baseUrl: string;
  model: string;
  apiKey: string;
}

/**
 * نشانیِ پایهٔ نهایی. ارائه‌دهندهٔ آماده نشانیِ ثابتِ خودش را دارد (کاربر
 * نمی‌تواند عوضش کند)؛ «دلخواه» از گاردِ SSRF و تفکیکِ DNS می‌گذرد.
 */
async function resolveBaseUrl(provider: ProviderId, raw: string): Promise<string> {
  if (provider !== 'custom') return PROVIDERS[provider].baseUrl;
  const url = normalizeBaseUrl(raw);
  if (!isSafeBaseUrl(url)) throw new AiError('bad_url');
  // ⚠️ نامِ عمومی‌ای که به IP ِ داخلی تفکیک شود همان SSRF است.
  try {
    const addrs = await lookup(new URL(url).hostname, { all: true });
    if (addrs.length === 0 || addrs.some((a) => isPrivateAddress(a.address))) throw new AiError('bad_url');
  } catch (error) {
    if (error instanceof AiError) throw error;
    throw new AiError('bad_url');
  }
  return url;
}

/**
 * فهرستِ مدل‌ها از خودِ ارائه‌دهنده. ⚠️ `redirect: 'error'`: بازهدایت به
 * نشانیِ دیگر (شاید داخلی) دنبال نمی‌شود.
 */
export async function fetchModels(provider: ProviderId, baseUrl: string, apiKey: string): Promise<ModelOption[]> {
  let res: Response;
  try {
    res = await fetch(`${baseUrl}/models`, {
      headers: authHeaders(provider, apiKey),
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new AiError('network');
  }
  if (res.status === 401 || res.status === 403) throw new AiError('invalid_key');
  if (!res.ok) throw new AiError('network');
  return shapeModels(await res.json().catch(() => null));
}

type Row = typeof aiConnections.$inferSelect;

function view(row: Row): AiConnectionView | null {
  if (!isProviderId(row.provider)) return null;
  return {
    id: row.id, priority: row.priority, provider: row.provider, baseUrl: row.baseUrl,
    model: row.model, keyHint: row.keyHint, updatedAt: row.updatedAt.toISOString(),
  };
}

async function myRows(userId: number): Promise<Row[]> {
  return db.select().from(aiConnections).where(eq(aiConnections.userId, userId))
    .orderBy(asc(aiConnections.priority), asc(aiConnections.id));
}

/** همهٔ اتصال‌های من به ترتیبِ اولویت. */
export async function listAiConnections(actor: Actor): Promise<AiConnectionView[]> {
  return (await myRows(actor.id)).map(view).filter((v): v is AiConnectionView => v !== null);
}

/** اولین (پراولویت‌ترین) اتصال — برای نمایشِ کوتاه. */
export async function getAiConnection(actor: Actor): Promise<AiConnectionView | null> {
  return (await listAiConnections(actor))[0] ?? null;
}

/** فقط سمتِ سرور (ربات) — کلیدهای باز، به ترتیبِ اولویت. کلیدِ بازنشدنی کنار می‌رود. */
export async function loadAiSecrets(userId: number): Promise<AiSecret[]> {
  const out: AiSecret[] = [];
  for (const row of await myRows(userId)) {
    if (!isProviderId(row.provider)) continue;
    const apiKey = open(row.apiKeyEnc);
    if (!apiKey) continue;
    out.push({ id: row.id, provider: row.provider, baseUrl: row.baseUrl, model: row.model, apiKey });
  }
  return out;
}

/** اولین کلیدِ قابلِ‌استفاده. */
export async function loadAiSecret(userId: number): Promise<AiSecret | null> {
  return (await loadAiSecrets(userId))[0] ?? null;
}

export interface SaveAiInput {
  /** ویرایشِ یک اتصالِ مشخص؛ خالی = افزودن (یا به‌روزرسانیِ همان ارائه‌دهنده). */
  id?: number;
  provider: string;
  baseUrl?: string;
  /** خالی = همان کلیدِ قبلی (فرم هرگز کلیدِ فعلی را نشان نمی‌دهد). */
  apiKey?: string;
  model?: string;
}

/**
 * ذخیرهٔ اتصال. کلیدِ تازه با `/models` آزموده می‌شود: کلیدِ ردشده (۴۰۱/۴۰۳)
 * ذخیره نمی‌شود؛ ولی خطای شبکه یا نبودِ `/models` مانعِ ذخیره نیست — بعضی
 * سرویس‌ها فهرستِ مدل ندارند.
 *
 * ⚠️ همان ارائه‌دهنده و نشانی دو بار در فهرست نمی‌نشیند؛ ذخیرهٔ دوباره همان را
 * به‌روز می‌کند. اتصالِ تازه **ته** ِ فهرست می‌رود (کمترین اولویت).
 */
export async function saveAiConnection(actor: Actor, input: SaveAiInput): Promise<AiConnectionView> {
  if (!isProviderId(input.provider)) throw new AiError('bad_provider');
  const provider = input.provider;
  const baseUrl = await resolveBaseUrl(provider, input.baseUrl ?? '');

  const rows = await myRows(actor.id);
  const existing = input.id
    ? rows.find((r) => r.id === input.id)
    : rows.find((r) => r.provider === provider && r.baseUrl === baseUrl);
  if (input.id && !existing) throw new AiError('not_found');
  if (!existing && rows.length >= MAX_CONNECTIONS) throw new AiError('too_many');

  let apiKey = (input.apiKey ?? '').trim();
  // کلیدِ قبلی فقط وقتی ارائه‌دهنده و نشانی همان است — وگرنه کلیدِ یک سرویس به سرویسِ دیگر فرستاده می‌شد.
  if (!apiKey && existing && existing.provider === provider && existing.baseUrl === baseUrl) {
    apiKey = open(existing.apiKeyEnc) ?? '';
  }
  if (!apiKey) throw new AiError('no_key');

  let model = (input.model ?? '').trim();
  let models: ModelOption[] = [];
  try {
    models = await fetchModels(provider, baseUrl, apiKey);
  } catch (error) {
    if (error instanceof AiError && error.code === 'invalid_key') throw error;
  }
  if (!model) model = (existing && existing.provider === provider ? existing.model : '') || PROVIDERS[provider].defaultModel || pickDefaultModel(models);

  const values = {
    provider, baseUrl, model: model.slice(0, 200),
    apiKeyEnc: seal(apiKey), keyHint: keyHint(apiKey), updatedAt: new Date(),
  };
  let id: number;
  if (existing) {
    await db.update(aiConnections).set(values).where(eq(aiConnections.id, existing.id));
    id = existing.id;
  } else {
    const priority = rows.length === 0 ? 0 : Math.max(...rows.map((r) => r.priority)) + 1;
    const [inserted] = await db.insert(aiConnections).values({ userId: actor.id, priority, ...values })
      .returning({ id: aiConnections.id });
    id = inserted!.id;
  }
  // ⚠️ کلید هرگز در ممیزی نمی‌نشیند.
  await db.insert(auditLog).values({
    actorType: 'user', actorId: actor.id, action: 'ai.connect',
    objectType: 'user', objectId: actor.id,
    after: { provider, model: values.model },
  });
  return (await listAiConnections(actor)).find((c) => c.id === id)!;
}

/** فقط مدلِ یک اتصالِ خودم را عوض می‌کند — کلید دست نمی‌خورد. بی‌شناسه = اولی. */
export async function setAiModel(actor: Actor, model: string, id?: number): Promise<boolean> {
  const value = model.trim().slice(0, 200);
  if (!value) return false;
  const target = id ?? (await myRows(actor.id))[0]?.id;
  if (!target) return false;
  const rows = await db.update(aiConnections).set({ model: value, updatedAt: new Date() })
    .where(and(eq(aiConnections.id, target), eq(aiConnections.userId, actor.id)))
    .returning({ id: aiConnections.id });
  return rows.length > 0;
}

export async function listMyModels(actor: Actor, id?: number): Promise<ModelOption[]> {
  const secrets = await loadAiSecrets(actor.id);
  const secret = id ? secrets.find((x) => x.id === id) : secrets[0];
  if (!secret) throw new AiError('no_key');
  return fetchModels(secret.provider, secret.baseUrl, secret.apiKey);
}

/** جابه‌جاییِ اولویت (بالا/پایین) — اولویت‌ها دوباره ۰..n شماره می‌خورند. */
export async function moveAiConnection(actor: Actor, id: number, direction: 'up' | 'down'): Promise<boolean> {
  const rows = await myRows(actor.id);
  const i = rows.findIndex((r) => r.id === id);
  const j = direction === 'up' ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= rows.length) return false;
  const order = rows.map((r) => r.id);
  [order[i], order[j]] = [order[j]!, order[i]!];
  await db.transaction(async (tx) => {
    for (const [priority, rowId] of order.entries()) {
      await tx.update(aiConnections).set({ priority }).where(and(eq(aiConnections.id, rowId), eq(aiConnections.userId, actor.id)));
    }
  });
  return true;
}

/** حذفِ یک اتصال (یا بی‌شناسه: همه). فقط مالِ خودم. */
export async function deleteAiConnection(actor: Actor, id?: number): Promise<boolean> {
  const rows = await db.delete(aiConnections)
    .where(id ? and(eq(aiConnections.id, id), eq(aiConnections.userId, actor.id)) : eq(aiConnections.userId, actor.id))
    .returning({ provider: aiConnections.provider });
  if (rows.length === 0) return false;
  await db.insert(auditLog).values({
    actorType: 'user', actorId: actor.id, action: 'ai.disconnect',
    objectType: 'user', objectId: actor.id,
    before: { provider: rows.map((r) => r.provider).join(', ') },
  });
  return true;
}

/* ------------------------------------------------------------------ *
 * «ورود با OpenRouter» — OAuth PKCE ِ خودِ OpenRouter
 * ------------------------------------------------------------------ */

export function openRouterAuthUrl(callbackUrl: string, codeChallenge: string): string {
  const q = new URLSearchParams({ callback_url: callbackUrl, code_challenge: codeChallenge, code_challenge_method: 'S256' });
  return `https://openrouter.ai/auth?${q.toString()}`;
}

/** کدِ برگشتی ← کلیدِ OpenRouter ِ خودِ کاربر. */
export async function exchangeOpenRouterCode(code: string, verifier: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch('https://openrouter.ai/api/v1/auth/keys', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code, code_verifier: verifier, code_challenge_method: 'S256' }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new AiError('network');
  }
  if (!res.ok) throw new AiError('invalid_key');
  const data = await res.json().catch(() => null) as { key?: unknown } | null;
  if (typeof data?.key !== 'string' || !data.key) throw new AiError('invalid_key');
  return data.key;
}
