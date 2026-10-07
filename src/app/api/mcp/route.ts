import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { bearerToken } from '@/domain/mcp/tokens';
import { authenticateToken } from '@/server/mcp/tokens';
import { buildMcpServer } from '@/server/mcp/server';

/**
 * نقطهٔ اتصالِ MCP — `POST /api/mcp` (Streamable HTTP، ۲.۷.۰).
 *
 * ⚠️ فقط با `Authorization: Bearer kbz_…`؛ کوکیِ نشستِ مرورگر **عمداً**
 * پذیرفته نمی‌شود: وگرنه هر سایتی که کاربر بازش کرده می‌توانست از طرفِ او
 * درخواست بفرستد (CSRF).
 * ⚠️ بی‌حالت (stateless): هر درخواست سرور و ترابرِ تازهٔ خودش را می‌سازد با
 * بازیگرِ همان توکن — نشستی در حافظه نمی‌ماند که بینِ کاربران قاطی شود.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function denied(status: 401 | 429, message: string): Response {
  return new Response(JSON.stringify({ jsonrpc: '2.0', error: { code: -32001, message }, id: null }), {
    status,
    headers: {
      'content-type': 'application/json',
      ...(status === 401 ? { 'www-authenticate': 'Bearer realm="kabarza"' } : { 'retry-after': '60' }),
    },
  });
}

async function handle(req: Request): Promise<Response> {
  const raw = bearerToken(req.headers.get('authorization'));
  if (!raw) return denied(401, 'Missing or malformed bearer token. Create one in Kabarza → Profile → Claude (MCP).');

  const auth = await authenticateToken(raw);
  if (!auth.ok) {
    return auth.reason === 'rate_limited'
      ? denied(429, 'Too many requests for this token; try again in a minute.')
      : denied(401, 'Invalid, revoked or inactive token.');
  }

  const server = buildMcpServer(auth.session);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  try {
    return await transport.handleRequest(req);
  } finally {
    // پاسخِ JSON کامل ساخته شده؛ بستنِ سرور چیزی را نیمه‌کاره نمی‌گذارد.
    await server.close();
  }
}

export const POST = handle;
export const GET = handle;
export const DELETE = handle;
