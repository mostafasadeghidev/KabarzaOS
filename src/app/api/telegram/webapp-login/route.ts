import { cookies } from 'next/headers';
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from '@/domain/auth/session';
import { safeNextPath } from '@/domain/auth/next-path';
import { sessionSecret } from '@/server/auth';
import { miniAppLogin } from '@/server/telegram/webapp';

export const dynamic = 'force-dynamic';

/**
 * `POST /api/telegram/webapp-login` — `{ initData, next }` ← نشستِ ورود.
 * ⚠️ هیچ چیزی از `initDataUnsafe` پذیرفته نمی‌شود؛ فقط رشتهٔ امضاشده.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null) as { initData?: unknown; next?: unknown } | null;
  const initData = typeof body?.initData === 'string' ? body.initData : '';
  const result = await miniAppLogin(initData);
  if (!result.ok) return Response.json({ ok: false, reason: result.reason }, { status: result.reason === 'invalid' ? 401 : 403 });

  const token = await createSessionToken({ userId: result.userId }, sessionSecret());
  (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions());
  return Response.json({ ok: true, to: safeNextPath(body?.next) });
}
