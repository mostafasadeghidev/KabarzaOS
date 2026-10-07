import { CORS_HEADERS, json } from '@/server/mcp/origin';
import { exchangeCode, OAuthError, refreshGrant } from '@/server/mcp/oauth';

/**
 * نقطهٔ توکن (۲.۸.۰) — کد ← توکن (با PKCE)، و تمدید با چرخش.
 * بدنه `application/x-www-form-urlencoded` است (RFC 6749)؛ JSON هم پذیرفته می‌شود.
 */
export const dynamic = 'force-dynamic';

async function params(req: Request): Promise<Record<string, string>> {
  const type = req.headers.get('content-type') ?? '';
  if (type.includes('application/json')) {
    const body = await req.json().catch(() => ({}));
    return Object.fromEntries(Object.entries(body).map(([k, v]) => [k, String(v)]));
  }
  return Object.fromEntries(new URLSearchParams(await req.text()));
}

export async function POST(req: Request) {
  const p = await params(req);
  try {
    if (p.grant_type === 'authorization_code') {
      if (!p.code || !p.client_id || !p.redirect_uri || !p.code_verifier) throw new OAuthError('invalid_request');
      return json(await exchangeCode({
        code: p.code, clientId: p.client_id, redirectUri: p.redirect_uri, codeVerifier: p.code_verifier,
      }));
    }
    if (p.grant_type === 'refresh_token') {
      if (!p.refresh_token || !p.client_id) throw new OAuthError('invalid_request');
      return json(await refreshGrant({ refreshToken: p.refresh_token, clientId: p.client_id }));
    }
    throw new OAuthError('unsupported_grant_type');
  } catch (error) {
    if (error instanceof OAuthError) {
      return json({ error: error.code, error_description: error.message }, error.code === 'invalid_client' ? 401 : 400);
    }
    throw error;
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
