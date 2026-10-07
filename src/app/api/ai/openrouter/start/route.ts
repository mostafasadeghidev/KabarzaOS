import { createHash, randomBytes } from 'node:crypto';
import { currentSession } from '@/server/auth';
import { openRouterAuthUrl } from '@/server/ai/connections';
import { publicOrigin } from '@/server/mcp/origin';

export const dynamic = 'force-dynamic';

/** کوکیِ کوتاه‌عمرِ verifier ِ PKCE — فقط برای مسیرِ برگشت. */
const OR_COOKIE = 'kbz_or_pkce';

/**
 * `GET /api/ai/openrouter/start` — «ورود با OpenRouter» (۲.۹.۰).
 *
 * ⚠️ verifier در کوکیِ httpOnly می‌ماند، نه در نشانی؛ کدِ برگشتی بی آن
 * به کلید تبدیل نمی‌شود، پس کدِ دزدیده‌شده بی‌فایده است.
 */
export async function GET(req: Request) {
  const origin = publicOrigin(req);
  if (!(await currentSession())) return Response.redirect(`${origin}/login?next=${encodeURIComponent('/profile?tab=mcp')}`, 302);

  const verifier = randomBytes(48).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const headers = new Headers({ location: openRouterAuthUrl(`${origin}/api/ai/openrouter/callback`, challenge) });
  headers.append('set-cookie', [
    `${OR_COOKIE}=${verifier}`, 'Path=/api/ai/openrouter', 'HttpOnly', 'SameSite=Lax', 'Max-Age=600',
    ...(origin.startsWith('https://') ? ['Secure'] : []),
  ].join('; '));
  return new Response(null, { status: 302, headers });
}
