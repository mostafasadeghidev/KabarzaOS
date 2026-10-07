import { CORS_HEADERS } from '@/server/mcp/origin';
import { revokeByToken } from '@/server/mcp/oauth';

/** RFC 7009 — باطل‌کردنِ توکن؛ پاسخ همیشه ۲۰۰ است، چه توکن بود چه نبود. */
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const type = req.headers.get('content-type') ?? '';
  const token = type.includes('application/json')
    ? String((await req.json().catch(() => ({}))).token ?? '')
    : new URLSearchParams(await req.text()).get('token') ?? '';
  if (token) await revokeByToken(token);
  return new Response(null, { status: 200, headers: CORS_HEADERS });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
