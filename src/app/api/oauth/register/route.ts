import { rateWindow } from '@/domain/mcp/tokens';
import { CORS_HEADERS, json } from '@/server/mcp/origin';
import { OAuthError, registerClient } from '@/server/mcp/oauth';

/**
 * RFC 7591 — ثبتِ پویای اپ (۲.۸.۰). claude.ai و بقیه پیش از «اجازه» خودشان را
 * اینجا ثبت می‌کنند. ⚠️ هر IP ساعتی ۳۰ ثبت — تا کسی جدول را پر نکند.
 */
export const dynamic = 'force-dynamic';

const windows = new Map<string, { start: number; count: number }>();

export async function POST(req: Request) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  const rate = rateWindow(windows.get(ip), Date.now(), 30, 60 * 60_000);
  windows.set(ip, rate.state);
  if (!rate.allowed) return json({ error: 'slow_down' }, 429);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: 'invalid_client_metadata' }, 400); }
  try {
    const client = await registerClient(body);
    return json({
      ...client,
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      client_id_issued_at: Math.floor(Date.now() / 1000),
    }, 201);
  } catch (error) {
    if (error instanceof OAuthError) return json({ error: error.code, error_description: error.message }, 400);
    throw error;
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
