import { CORS_HEADERS, json } from '@/server/mcp/origin';
import { authorizationServerMetadata } from '@/server/mcp/as-metadata';

/**
 * متادیتای سرورِ مجوز (۲.۸.۰). ⚠️ نسخهٔ `openid-configuration` هم همین را
 * می‌دهد: بعضی اپ‌ها اول آن را می‌خوانند. OIDC (شناسهٔ کاربر) پشتیبانی نمی‌شود.
 */
export const dynamic = 'force-dynamic';

export function GET(req: Request) {
  return json(authorizationServerMetadata(req));
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
