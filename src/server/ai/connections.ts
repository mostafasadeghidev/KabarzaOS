import { lookup } from 'node:dns/promises';
import { eq } from 'drizzle-orm';
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
 */

export class AiError extends Error {
  constructor(readonly code: 'bad_url' | 'invalid_key' | 'network' | 'no_key' | 'bad_provider') {
    super(code);
    this.name = 'AiError';
  }
}

export interface AiConnectionView {
  provider: ProviderId;
  baseUrl: string;
  model: string;
  keyHint: string;
  updatedAt: string;
}

export interface AiSecret {
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

export async function getAiConnection(actor: Actor): Promise<AiConnectionView | null> {
  const [row] = await db.select().from(aiConnections).where(eq(aiConnections.userId, actor.id));
  if (!row || !isProviderId(row.provider)) return null;
  return {
    provider: row.provider,
    baseUrl: row.baseUrl,
    model: row.model,
    keyHint: row.keyHint,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** فقط سمتِ سرور (ربات) — کلیدِ باز. */
export async function loadAiSecret(userId: number): Promise<AiSecret | null> {
  const [row] = await db.select().from(aiConnections).where(eq(aiConnections.userId, userId));
  if (!row || !isProviderId(row.provider)) return null;
  const apiKey = open(row.apiKeyEnc);
  if (!apiKey) return null;
  return { provider: row.provider, baseUrl: row.baseUrl, model: row.model, apiKey };
}

export interface SaveAiInput {
  provider: string;
  baseUrl?: string;
  /** خالی = همان کلیدِ قبلی (فرم هرگز کلیدِ فعلی را نشان نمی‌دهد). */
  apiKey?: string;
  model?: string;
}

/**
 * ذخیرهٔ اتصال. کلیدِ تازه با `/models` آزموده می‌شود: کلیدِ رد‌شده (۴۰۱/۴۰۳)
 * ذخیره نمی‌شود؛ ولی خطای شبکه یا نبودِ `/models` مانعِ ذخیره نیست — بعضی
 * سرویس‌ها فهرستِ مدل ندارند.
 */
export async function saveAiConnection(actor: Actor, input: SaveAiInput): Promise<AiConnectionView> {
  if (!isProviderId(input.provider)) throw new AiError('bad_provider');
  const provider = input.provider;
  const baseUrl = await resolveBaseUrl(provider, input.baseUrl ?? '');

  const [existing] = await db.select().from(aiConnections).where(eq(aiConnections.userId, actor.id));
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
  if (!model) model = PROVIDERS[provider].defaultModel || pickDefaultModel(models);

  const values = {
    provider, baseUrl, model: model.slice(0, 200),
    apiKeyEnc: seal(apiKey), keyHint: keyHint(apiKey), updatedAt: new Date(),
  };
  await db.insert(aiConnections).values({ userId: actor.id, ...values })
    .onConflictDoUpdate({ target: aiConnections.userId, set: values });
  // ⚠️ کلید هرگز در ممیزی نمی‌نشیند.
  await db.insert(auditLog).values({
    actorType: 'user', actorId: actor.id, action: 'ai.connect',
    objectType: 'user', objectId: actor.id,
    after: { provider, model: values.model },
  });
  return (await getAiConnection(actor))!;
}

/** فقط مدل را عوض می‌کند — کلید دست نمی‌خورد. */
export async function setAiModel(actor: Actor, model: string): Promise<boolean> {
  const value = model.trim().slice(0, 200);
  if (!value) return false;
  const rows = await db.update(aiConnections).set({ model: value, updatedAt: new Date() })
    .where(eq(aiConnections.userId, actor.id)).returning({ id: aiConnections.id });
  return rows.length > 0;
}

export async function listMyModels(actor: Actor): Promise<ModelOption[]> {
  const secret = await loadAiSecret(actor.id);
  if (!secret) throw new AiError('no_key');
  return fetchModels(secret.provider, secret.baseUrl, secret.apiKey);
}

export async function deleteAiConnection(actor: Actor): Promise<boolean> {
  const rows = await db.delete(aiConnections).where(eq(aiConnections.userId, actor.id))
    .returning({ provider: aiConnections.provider });
  if (rows.length === 0) return false;
  await db.insert(auditLog).values({
    actorType: 'user', actorId: actor.id, action: 'ai.disconnect',
    objectType: 'user', objectId: actor.id,
    before: { provider: rows[0]!.provider },
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
