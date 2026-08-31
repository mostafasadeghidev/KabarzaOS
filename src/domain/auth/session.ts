/**
 * نشست — توکنِ امضاشده در کوکیِ HttpOnly.
 *
 * نشست فقط **شناسه** را حمل می‌کند، نه مجوزها.
 * دلیل: اگر مجوزها در توکن باشند، پس‌گرفتنِ دسترسی تا انقضای توکن اثر نمی‌کند —
 * و ما دقیقاً همان مشکلِ «دسترسی که پاک نمی‌شود» را در نسخهٔ قبلی دیدیم (R-RBAC-11).
 * مجوزها هر بار از دیتابیس خوانده می‌شوند.
 */

import { SignJWT, jwtVerify } from 'jose';

const ALG = 'HS256';
const DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 7; // یک هفته

export interface SessionPayload {
  userId: number;
}

function secretKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(
  payload: SessionPayload,
  secret: string,
  ttlSeconds: number = DEFAULT_TTL_SECONDS,
): Promise<string> {
  return new SignJWT({ uid: payload.userId })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + ttlSeconds)
    .sign(secretKey(secret));
}

/** خواندنِ نشست. توکنِ نامعتبر یا منقضی → null، بدونِ throw. */
export async function readSessionToken(
  token: string | undefined | null,
  secret: string,
): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(secret), { algorithms: [ALG] });
    const uid = payload['uid'];
    return typeof uid === 'number' && uid > 0 ? { userId: uid } : null;
  } catch {
    return null;
  }
}

export const SESSION_COOKIE = 'kabarza_session';

/** تنظیماتِ کوکی — HttpOnly و SameSite تا از CSRF و XSS در امان بماند. */
export function sessionCookieOptions(maxAgeSeconds: number = DEFAULT_TTL_SECONDS) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: maxAgeSeconds,
  };
}
