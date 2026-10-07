/**
 * نشانیِ عمومیِ سایت برای OAuth و MCP (۲.۸.۰).
 *
 * ⚠️ `APP_URL` اولویت دارد: پشتِ پراکسی (nginx/Caddy) سرآیندِ `host` ممکن است
 * نشانیِ داخلیِ کانتینر باشد و اپ‌های بیرونی با آن به جایی نمی‌رسند.
 */
export function publicOrigin(req?: Request): string {
  const configured = (process.env.APP_URL ?? '').replace(/\/$/, '');
  if (configured) return configured;
  if (!req) return 'http://localhost:3000';
  const url = new URL(req.url);
  const proto = req.headers.get('x-forwarded-proto') ?? url.protocol.replace(':', '');
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? url.host;
  return `${proto}://${host}`;
}

/** سرآیندهای CORS برای نقطه‌های عمومیِ OAuth — بعضی اپ‌ها از مرورگر صدا می‌زنند. */
export const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type, mcp-protocol-version',
} as const;

export function json(data: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...CORS_HEADERS, ...extra },
  });
}
