import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from '@/db/client';
import { apiKeys, auditLog, oauthGrants } from '@/db/schema';
import type { Actor } from '@/domain/access/permissions';
import { ForbiddenError } from '@/domain/access/guard';
import {
  generateToken, hashToken, isScope, looksLikeToken, rateWindow, scopesFor, tokenPrefix, type TokenScope,
} from '@/domain/mcp/tokens';
import { loadActor } from '@/server/auth';

/**
 * توکن‌های شخصیِ MCP (۲.۷.۰).
 *
 * ⚠️ توکن هیچ مجوزِ خودش را ندارد: هر درخواست بازیگرِ صاحبش را **از نو** از
 * دیتابیس می‌سازد (`loadActor`) — پس قطع‌کردنِ دسترسیِ کسی یا گرفتنِ نقشش
 * بی‌درنگ روی توکن‌هایش هم اثر دارد. دامنه (`read`/`write`) فقط **کم** می‌کند.
 */

/** سقفِ توکنِ فعالِ هر کاربر — کلیدِ فراموش‌شده نباید بی‌حساب جمع شود. */
export const MAX_TOKENS_PER_USER = 10;

export class TokenError extends Error {
  constructor(readonly code: 'name_required' | 'too_many' | 'not_found') {
    super(`token: ${code}`);
    this.name = 'TokenError';
  }
}

export const TOKEN_MESSAGES: Record<TokenError['code'], string> = {
  name_required: 'یک نام برای توکن بنویسید (مثلاً «لپ‌تاپ» یا «Claude Code»).',
  too_many: 'حداکثر ۱۰ توکنِ فعال؛ یکی از قبلی‌ها را باطل کنید.',
  not_found: 'توکن پیدا نشد.',
};

async function audit(actor: Actor, action: string, objectId: number, after?: unknown) {
  await db.insert(auditLog).values({
    actorType: 'user', actorId: actor.id, action, objectType: 'api_key', objectId, after: after ?? null,
  });
}

export interface TokenRow {
  id: number;
  name: string;
  prefix: string;
  scopes: string[];
  lastUsedAt: Date | null;
  createdAt: Date;
}

/** توکن‌های فعالِ خودِ کاربر — هیچ‌کس توکنِ دیگری را نمی‌بیند. */
export async function listTokens(actor: Actor): Promise<TokenRow[]> {
  return db.select({
    id: apiKeys.id,
    name: apiKeys.name,
    prefix: apiKeys.prefix,
    scopes: apiKeys.scopes,
    lastUsedAt: apiKeys.lastUsedAt,
    createdAt: apiKeys.createdAt,
  }).from(apiKeys)
    // ⚠️ توکن‌های «اتصالِ وب» (OAuth) اینجا نیستند — فهرستِ جدای خودشان را دارند.
    .where(and(eq(apiKeys.userId, actor.id), isNull(apiKeys.revokedAt), isNull(apiKeys.oauthGrantId)))
    .orderBy(desc(apiKeys.id));
}

/**
 * ساختنِ توکن. ⚠️ متنِ توکن **فقط همین‌جا** برمی‌گردد و دیگر هرگز قابلِ
 * خواندن نیست؛ دیتابیس فقط هش را دارد.
 */
export async function createToken(actor: Actor, input: { name: string; scope: string }): Promise<{ id: number; token: string }> {
  const name = input.name.trim().slice(0, 80);
  if (!name) throw new TokenError('name_required');
  const scope: TokenScope = isScope(input.scope) ? input.scope : 'read';
  const active = await listTokens(actor);
  if (active.length >= MAX_TOKENS_PER_USER) throw new TokenError('too_many');

  const token = generateToken();
  const [row] = await db.insert(apiKeys).values({
    userId: actor.id,
    name,
    hash: hashToken(token),
    prefix: tokenPrefix(token),
    scopes: scopesFor(scope),
  }).returning({ id: apiKeys.id });
  // ⚠️ خودِ توکن در ممیزی نمی‌آید — فقط نام و دامنه.
  await audit(actor, 'mcp.token_create', row!.id, { name, scope });
  return { id: row!.id, token };
}

/** باطل‌کردن — فقط صاحبش. ردیف می‌ماند (تاریخچه)، فقط دیگر پذیرفته نمی‌شود. */
export async function revokeToken(actor: Actor, id: number): Promise<void> {
  const [row] = await db.update(apiKeys).set({ revokedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(apiKeys.id, id), eq(apiKeys.userId, actor.id), isNull(apiKeys.revokedAt)))
    .returning({ id: apiKeys.id });
  if (!row) throw new TokenError('not_found');
  await audit(actor, 'mcp.token_revoke', id);
}

export interface TokenSession {
  actor: Actor;
  keyId: number;
  scopes: string[];
  name: string;
  /** ربات تلگرام (۲.۹.۰): همان ابزارها، بی توکن — `keyId` صفر است. */
  via?: 'telegram';
}

/** شمارندهٔ درخواست‌ها به‌ازای هر کلید — در حافظهٔ همین فرایند. */
const windows = new Map<number, { start: number; count: number }>();
/** مهرِ «آخرین استفاده» حداکثر دقیقه‌ای یک بار نوشته می‌شود، نه با هر درخواست. */
const lastStamp = new Map<number, number>();

export type AuthResult =
  | { ok: true; session: TokenSession }
  | { ok: false; reason: 'invalid' | 'rate_limited' | 'inactive' };

/**
 * توکن ← نشست. ⚠️ عضوِ سابق («فقط مالی») هم رد می‌شود: MCP راهِ کار است و
 * آن عضو دیگر کاری در پروژه‌ها ندارد (همان `requireActor`).
 */
export async function authenticateToken(raw: string, now = Date.now()): Promise<AuthResult> {
  if (!looksLikeToken(raw)) return { ok: false, reason: 'invalid' };
  const [key] = await db.select().from(apiKeys).where(eq(apiKeys.hash, hashToken(raw)));
  if (!key || key.revokedAt || key.userId === null) return { ok: false, reason: 'invalid' };
  // توکنِ دسترسیِ OAuth کوتاه‌عمر است؛ اپ با توکنِ تمدید تازه‌اش می‌کند.
  if (key.expiresAt && key.expiresAt.getTime() <= now) return { ok: false, reason: 'invalid' };

  const rate = rateWindow(windows.get(key.id), now, key.rateLimit);
  windows.set(key.id, rate.state);
  if (!rate.allowed) return { ok: false, reason: 'rate_limited' };

  const loaded = await loadActor(key.userId);
  if (!loaded || loaded.user.memberState !== 'active') return { ok: false, reason: 'inactive' };

  if (now - (lastStamp.get(key.id) ?? 0) > 60_000) {
    lastStamp.set(key.id, now);
    await db.update(apiKeys).set({ lastUsedAt: new Date(now) }).where(eq(apiKeys.id, key.id));
    if (key.oauthGrantId) {
      await db.update(oauthGrants).set({ lastUsedAt: new Date(now) }).where(eq(oauthGrants.id, key.oauthGrantId));
    }
  }
  return { ok: true, session: { actor: loaded.actor, keyId: key.id, scopes: key.scopes, name: key.name } };
}

/** ابزارِ نوشتنی بی‌دامنهٔ `write` — همان خطای «دسترسی ندارید» ِ بقیهٔ سامانه. */
export function assertWrite(session: TokenSession): void {
  if (!session.scopes.includes('write')) throw new ForbiddenError('mcp.read_only');
}
