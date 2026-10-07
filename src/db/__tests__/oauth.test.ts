import { createHash, randomBytes } from 'node:crypto';
import { describe, it, expect, beforeAll } from 'vitest';
import { db, sql } from '../client';
import { userRoles, users } from '../schema';
import {
  createAuthCode, exchangeCode, listGrants, OAuthError, refreshGrant, registerClient, revokeGrant,
} from '@/server/mcp/oauth';
import { authenticateToken, listTokens } from '@/server/mcp/tokens';
import type { Actor } from '@/domain/access/permissions';

/**
 * OAuth 2.1 ِ MCP (۲.۸.۰) — ثبتِ اپ، «اجازه»، کد با PKCE، تمدیدِ چرخشی و قطع.
 */

let USER = 0;
const actor = (): Actor => ({ id: USER, roles: ['member'], permissions: [], privateAccess: false });
const REDIRECT = 'https://claude.ai/api/mcp/auth_callback';

function pkce() {
  const verifier = randomBytes(48).toString('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
}

async function connect(scope: 'read' | 'write' = 'write') {
  const client = await registerClient({ client_name: 'Claude', redirect_uris: [REDIRECT] });
  const { verifier, challenge } = pkce();
  const code = await createAuthCode(actor(), { clientId: client.client_id, redirectUri: REDIRECT, codeChallenge: challenge, scope });
  return { client, code, verifier };
}

beforeAll(async () => {
  await sql`truncate table oauth_codes, oauth_grants, oauth_clients, api_keys, audit_log, user_roles, users restart identity cascade`;
  const [u] = await db.insert(users).values({ email: 'oa@t', name: 'عضو' }).returning({ id: users.id });
  USER = u!.id;
  await db.insert(userRoles).values({ userId: USER, role: 'member' });
});

describe('OAuth', () => {
  it('نشانیِ بازگشتِ ناامن ثبت نمی‌شود', async () => {
    await expect(registerClient({ client_name: 'x', redirect_uris: ['http://evil.example/cb'] })).rejects.toBeInstanceOf(OAuthError);
    await expect(registerClient({ client_name: 'x', redirect_uris: [] })).rejects.toBeInstanceOf(OAuthError);
  });

  it('کد ← توکن با PKCE؛ توکن روی MCP کار می‌کند و دامنه همان «اجازه» است', async () => {
    const { client, code, verifier } = await connect('read');
    await expect(exchangeCode({ code, clientId: client.client_id, redirectUri: REDIRECT, codeVerifier: pkce().verifier }))
      .rejects.toMatchObject({ code: 'invalid_grant' });
    const tokens = await exchangeCode({ code, clientId: client.client_id, redirectUri: REDIRECT, codeVerifier: verifier });
    expect(tokens.scope).toBe('read');
    const auth = await authenticateToken(tokens.access_token);
    expect(auth.ok && auth.session.actor.id).toBe(USER);
    expect(auth.ok && auth.session.scopes).toEqual(['read']);
    // ⚠️ کد یک‌بارمصرف است.
    await expect(exchangeCode({ code, clientId: client.client_id, redirectUri: REDIRECT, codeVerifier: verifier }))
      .rejects.toMatchObject({ code: 'invalid_grant' });
  });

  it('کدِ یک اپ برای اپِ دیگر کار نمی‌کند', async () => {
    const { code, verifier } = await connect();
    const other = await registerClient({ client_name: 'Other', redirect_uris: [REDIRECT] });
    await expect(exchangeCode({ code, clientId: other.client_id, redirectUri: REDIRECT, codeVerifier: verifier }))
      .rejects.toMatchObject({ code: 'invalid_grant' });
  });

  it('تمدیدِ چرخشی: توکنِ قبلی و تمدیدِ قبلی باطل می‌شوند', async () => {
    const { client, code, verifier } = await connect();
    const first = await exchangeCode({ code, clientId: client.client_id, redirectUri: REDIRECT, codeVerifier: verifier });
    const second = await refreshGrant({ refreshToken: first.refresh_token, clientId: client.client_id });
    expect((await authenticateToken(first.access_token)).ok).toBe(false);
    expect((await authenticateToken(second.access_token)).ok).toBe(true);
    await expect(refreshGrant({ refreshToken: first.refresh_token, clientId: client.client_id }))
      .rejects.toMatchObject({ code: 'invalid_grant' });
  });

  it('قطعِ اتصال: توکن و تمدید از کار می‌افتند؛ توکن‌های اتصال در فهرستِ توکن‌های شخصی نیستند', async () => {
    const { client, code, verifier } = await connect();
    const t = await exchangeCode({ code, clientId: client.client_id, redirectUri: REDIRECT, codeVerifier: verifier });
    expect((await listTokens(actor())).length).toBe(0);
    const grants = await listGrants(actor());
    const mine = grants[0]!;
    expect(await revokeGrant({ ...actor(), id: USER + 999 }, mine.id)).toBe(false);
    expect(await revokeGrant(actor(), mine.id)).toBe(true);
    expect((await authenticateToken(t.access_token)).ok).toBe(false);
    await expect(refreshGrant({ refreshToken: t.refresh_token, clientId: client.client_id }))
      .rejects.toMatchObject({ code: 'invalid_grant' });
  });
});
