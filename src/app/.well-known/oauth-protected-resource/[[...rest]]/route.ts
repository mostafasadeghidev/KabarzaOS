import { CORS_HEADERS, json, publicOrigin } from '@/server/mcp/origin';

/**
 * RFC 9728 — «این سرورِ MCP را کدام سرورِ مجوز حفاظت می‌کند؟» (۲.۸.۰)
 * اپ پس از پاسخِ ۴۰۱ ِ `/api/mcp` این را می‌خواند. نسخهٔ پسونددار
 * (`/.well-known/oauth-protected-resource/api/mcp`) هم همین را می‌دهد.
 */
export const dynamic = 'force-dynamic';

export function GET(req: Request) {
  const origin = publicOrigin(req);
  return json({
    resource: `${origin}/api/mcp`,
    authorization_servers: [origin],
    scopes_supported: ['read', 'write', 'sensitive'],
    bearer_methods_supported: ['header'],
    resource_name: 'Kabarza',
  });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
