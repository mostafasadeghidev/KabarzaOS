import { and, desc, eq, gt, isNull, lt } from 'drizzle-orm';
import { db } from '@/db/client';
import { apiKeys, auditLog, oauthClients, oauthCodes, oauthGrants } from '@/db/schema';
import type { Actor } from '@/domain/access/permissions';
import { generateToken, hashToken, scopesFor, tokenPrefix, type TokenScope } from '@/domain/mcp/tokens';
import {
  ACCESS_TTL_S, CODE_TTL_MS, isAllowedRedirect, randomSecret, redirectMatches, REFRESH_TTL_MS, sha256, verifyPkce,
} from '@/domain/mcp/oauth';

/**
 * OAuth 2.1 برای MCP (۲.۸.۰) — اپِ هوشِ مصنوعیِ وب (claude.ai، ChatGPT …)
 * به نیابت از کاربر به `/api/mcp` وصل می‌شود.
 *
 * ⚠️ توکنِ دسترسیِ صادرشده یک ردیفِ `api_keys` است (کوتاه‌عمر، با
 * `oauth_grant_id`) — پس احراز همان `authenticateToken` است و همان گاردها:
 * دسترسیِ اتصال هرگز از صاحبش بیشتر نیست.
 */

/** خطاهای استانداردِ OAuth (RFC 6749 §5.2) — `code` همان رشتهٔ پاسخ است. */
export class OAuthError extends Error {
  constructor(readonly code: 'invalid_request' | 'invalid_client' | 'invalid_grant' | 'unsupported_grant_type' | 'invalid_redirect_uri', message: string = code) {
    super(message);
    this.name = 'OAuthError';
  }
}

async function audit(userId: number, action: string, objectId: number, after?: unknown) {
  await db.insert(auditLog).values({
    actorType: 'user', actorId: userId, action, objectType: 'api_key', objectId, after: after ?? null,
  });
}

/* ---------------- ثبتِ اپ ---------------- */

/** RFC 7591 — اپ خودش را ثبت می‌کند؛ فقط نام و نشانی‌های بازگشت. */
export async function registerClient(input: { client_name?: unknown; redirect_uris?: unknown }) {
  const uris = Array.isArray(input.redirect_uris) ? input.redirect_uris.filter((u): u is string => typeof u === 'string') : [];
  if (uris.length === 0 || uris.length > 10 || !uris.every(isAllowedRedirect)) {
    throw new OAuthError('invalid_redirect_uri', 'redirect_uris must be https, loopback http, or an app scheme');
  }
  const name = (typeof input.client_name === 'string' ? input.client_name : '').trim().slice(0, 120) || 'AI app';
  const clientId = randomSecret('kbzc_', 18);
  await db.insert(oauthClients).values({ clientId, name, redirectUris: uris });
  return { client_id: clientId, client_name: name, redirect_uris: uris };
}

export async function findClient(clientId: string) {
  const [row] = await db.select().from(oauthClients).where(eq(oauthClients.clientId, clientId));
  return row ?? null;
}

/** اپ و نشانیِ بازگشت را پیش از نشان‌دادنِ صفحهٔ «اجازه» می‌سنجد. */
export async function validateAuthorizeRequest(p: {
  clientId: string; redirectUri: string; codeChallenge: string; method: string; responseType: string;
}) {
  const client = await findClient(p.clientId);
  if (!client) throw new OAuthError('invalid_client', 'Unknown client');
  if (!redirectMatches(p.redirectUri, client.redirectUris)) throw new OAuthError('invalid_redirect_uri', 'redirect_uri is not registered');
  if (p.responseType !== 'code') throw new OAuthError('invalid_request', 'response_type must be code');
  if (p.method !== 'S256' || !p.codeChallenge) throw new OAuthError('invalid_request', 'PKCE with S256 is required');
  return client;
}

/* ---------------- اجازه ← کد ---------------- */

export async function createAuthCode(actor: Actor, p: {
  clientId: string; redirectUri: string; codeChallenge: string; scope: TokenScope;
}): Promise<string> {
  const client = await validateAuthorizeRequest({ ...p, method: 'S256', responseType: 'code' });
  const code = randomSecret('kbzk_');
  await db.insert(oauthCodes).values({
    codeHash: sha256(code),
    clientId: client.id,
    userId: actor.id,
    redirectUri: p.redirectUri,
    codeChallenge: p.codeChallenge,
    scopes: scopesFor(p.scope),
    expiresAt: new Date(Date.now() + CODE_TTL_MS),
  });
  return code;
}

/* ---------------- توکن ---------------- */

export interface TokenResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  refresh_token: string;
  scope: string;
}

/** توکنِ دسترسیِ تازه برای یک اتصال؛ توکن‌های قبلیِ همان اتصال پاک می‌شوند. */
async function issue(grant: { id: number; userId: number; scopes: string[] }, clientName: string, refresh: string): Promise<TokenResponse> {
  await db.delete(apiKeys).where(eq(apiKeys.oauthGrantId, grant.id));
  const access = generateToken();
  await db.insert(apiKeys).values({
    userId: grant.userId,
    name: clientName,
    hash: hashToken(access),
    prefix: tokenPrefix(access),
    scopes: grant.scopes,
    expiresAt: new Date(Date.now() + ACCESS_TTL_S * 1000),
    oauthGrantId: grant.id,
  });
  return { access_token: access, token_type: 'Bearer', expires_in: ACCESS_TTL_S, refresh_token: refresh, scope: grant.scopes.join(' ') };
}

/** کد ← اتصال + توکن. ⚠️ کد یک‌بار مصرف است؛ مصرفِ دوباره یعنی نشت. */
export async function exchangeCode(p: { code: string; clientId: string; redirectUri: string; codeVerifier: string }): Promise<TokenResponse> {
  const client = await findClient(p.clientId);
  if (!client) throw new OAuthError('invalid_client');
  const [code] = await db.select().from(oauthCodes).where(eq(oauthCodes.codeHash, sha256(p.code)));
  if (!code || code.clientId !== client.id || code.usedAt || code.expiresAt < new Date()) throw new OAuthError('invalid_grant');
  if (code.redirectUri !== p.redirectUri) throw new OAuthError('invalid_grant', 'redirect_uri mismatch');
  if (!verifyPkce(p.codeVerifier, code.codeChallenge)) throw new OAuthError('invalid_grant', 'PKCE verification failed');

  // ⚠️ «مصرف‌شده» پیش از صدورِ توکن — دو درخواستِ هم‌زمان دو اتصال نمی‌سازند.
  const [claimed] = await db.update(oauthCodes).set({ usedAt: new Date() })
    .where(and(eq(oauthCodes.id, code.id), isNull(oauthCodes.usedAt))).returning({ id: oauthCodes.id });
  if (!claimed) throw new OAuthError('invalid_grant');

  const refresh = randomSecret('kbzr_');
  const [grant] = await db.insert(oauthGrants).values({
    clientId: client.id,
    userId: code.userId,
    scopes: code.scopes,
    refreshHash: sha256(refresh),
    refreshExpiresAt: new Date(Date.now() + REFRESH_TTL_MS),
    lastUsedAt: new Date(),
  }).returning();
  await audit(code.userId, 'mcp.oauth_connect', grant!.id, { name: client.name, scopes: code.scopes });
  return issue(grant!, client.name, refresh);
}

/** تمدید با چرخش — توکنِ تمدیدِ قبلی دیگر کار نمی‌کند. */
export async function refreshGrant(p: { refreshToken: string; clientId: string }): Promise<TokenResponse> {
  const client = await findClient(p.clientId);
  if (!client) throw new OAuthError('invalid_client');
  const [grant] = await db.select().from(oauthGrants).where(eq(oauthGrants.refreshHash, sha256(p.refreshToken)));
  if (!grant || grant.clientId !== client.id || grant.revokedAt || grant.refreshExpiresAt < new Date()) {
    throw new OAuthError('invalid_grant');
  }
  const refresh = randomSecret('kbzr_');
  const [rotated] = await db.update(oauthGrants).set({
    refreshHash: sha256(refresh),
    refreshExpiresAt: new Date(Date.now() + REFRESH_TTL_MS),
    lastUsedAt: new Date(),
    updatedAt: new Date(),
  }).where(and(eq(oauthGrants.id, grant.id), eq(oauthGrants.refreshHash, grant.refreshHash))).returning();
  if (!rotated) throw new OAuthError('invalid_grant');
  return issue(rotated, client.name, refresh);
}

/** RFC 7009 — باطل‌کردنِ توکنِ تمدید یا دسترسی؛ پاسخ همیشه موفق است. */
export async function revokeByToken(token: string): Promise<void> {
  const [grant] = await db.select({ id: oauthGrants.id, userId: oauthGrants.userId }).from(oauthGrants)
    .where(eq(oauthGrants.refreshHash, sha256(token)));
  if (grant) {
    await db.update(oauthGrants).set({ revokedAt: new Date() }).where(eq(oauthGrants.id, grant.id));
    await db.delete(apiKeys).where(eq(apiKeys.oauthGrantId, grant.id));
    return;
  }
  await db.delete(apiKeys).where(and(eq(apiKeys.hash, hashToken(token)), gt(apiKeys.id, 0)));
}

/* ---------------- اتصال‌های کاربر ---------------- */

export interface GrantRow {
  id: number;
  name: string;
  scopes: string[];
  createdAt: Date;
  lastUsedAt: Date | null;
}

/** اتصال‌های وبِ فعالِ خودِ کاربر — برای تبِ «دستیارِ هوشِ مصنوعی». */
export async function listGrants(actor: Actor): Promise<GrantRow[]> {
  return db.select({
    id: oauthGrants.id,
    name: oauthClients.name,
    scopes: oauthGrants.scopes,
    createdAt: oauthGrants.createdAt,
    lastUsedAt: oauthGrants.lastUsedAt,
  }).from(oauthGrants)
    .innerJoin(oauthClients, eq(oauthClients.id, oauthGrants.clientId))
    .where(and(eq(oauthGrants.userId, actor.id), isNull(oauthGrants.revokedAt), gt(oauthGrants.refreshExpiresAt, new Date())))
    .orderBy(desc(oauthGrants.id));
}

/** قطعِ یک اتصال — فقط صاحبش؛ توکن‌هایش بی‌درنگ پاک می‌شوند. */
export async function revokeGrant(actor: Actor, id: number): Promise<boolean> {
  const [row] = await db.update(oauthGrants).set({ revokedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(oauthGrants.id, id), eq(oauthGrants.userId, actor.id), isNull(oauthGrants.revokedAt)))
    .returning({ id: oauthGrants.id });
  if (!row) return false;
  await db.delete(apiKeys).where(eq(apiKeys.oauthGrantId, id));
  await audit(actor.id, 'mcp.oauth_revoke', id);
  return true;
}

/** پاک‌سازیِ کدهای مصرف‌شده یا منقضی — ارزان، هنگامِ صدورِ کدِ تازه. */
export async function pruneCodes(): Promise<void> {
  await db.delete(oauthCodes).where(lt(oauthCodes.expiresAt, new Date(Date.now() - CODE_TTL_MS)));
}
