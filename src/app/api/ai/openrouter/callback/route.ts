import { requireActor } from '@/server/auth';
import { AiError, exchangeOpenRouterCode, saveAiConnection } from '@/server/ai/connections';
import { publicOrigin } from '@/server/mcp/origin';

export const dynamic = 'force-dynamic';

const COOKIE = 'kbz_or_pkce';

/**
 * `GET /api/ai/openrouter/callback?code=…` — برگشت از OpenRouter.
 * کد + verifier ِ کوکی ← کلیدِ خودِ کاربر ← ذخیرهٔ رمزگذاری‌شده با مدلِ
 * رایگانِ پیش‌فرض. نتیجه با `ai=` به تبِ پروفایل برمی‌گردد.
 */
export async function GET(req: Request) {
  const origin = publicOrigin(req);
  const back = (result: string) => {
    const headers = new Headers({ location: `${origin}/profile?tab=mcp&ai=${result}` });
    headers.append('set-cookie', `${COOKIE}=; Path=/api/ai/openrouter; HttpOnly; SameSite=Lax; Max-Age=0`);
    return new Response(null, { status: 302, headers });
  };

  const code = new URL(req.url).searchParams.get('code') ?? '';
  const verifier = (req.headers.get('cookie') ?? '')
    .split(';').map((c) => c.trim()).find((c) => c.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1) ?? '';
  if (!code || !verifier) return back('failed');

  try {
    const actor = await requireActor();
    const apiKey = await exchangeOpenRouterCode(code, verifier);
    await saveAiConnection(actor, { provider: 'openrouter', apiKey });
    return back('connected');
  } catch (error) {
    if (error instanceof AiError || (error instanceof Error && error.message === 'unauthenticated')) return back('failed');
    throw error;
  }
}
