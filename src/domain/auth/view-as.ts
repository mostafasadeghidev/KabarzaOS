/**
 * «دیدن به‌جای کاربر» (۲.۵۳.۰) — مالک برنامه را همان‌طور می‌بیند که یک کاربر می‌بیند،
 * بی‌رمزِ او و **فقط برای دیدن**.
 *
 * ⚠️ کوکیِ جدا از نشست است و نشستِ خودِ مالک دست نمی‌خورد: برگشت فقط پاک‌کردنِ
 * همین کوکی است، و اگر کوکی دستکاری یا منقضی شود نشست به خودِ مالک برمی‌گردد.
 * ⚠️ شناسهٔ مالک هم در توکن است و با نشستِ واقعی سنجیده می‌شود: کوکیِ دزدیده‌شده
 * در مرورگرِ کسِ دیگری کاری نمی‌کند.
 */

import { SignJWT, jwtVerify } from 'jose';
import type { Actor, Role } from '../access/permissions';

const ALG = 'HS256';
/** یک ساعت — بعدش خودکار به حسابِ خودِ مالک برمی‌گردد. */
export const VIEW_AS_TTL_SECONDS = 60 * 60;
export const VIEW_AS_COOKIE = 'kabarza_view_as';

export interface ViewAsPayload {
  ownerId: number;
  targetId: number;
}

const key = (secret: string) => new TextEncoder().encode(`view-as:${secret}`);

export async function createViewAsToken(payload: ViewAsPayload, secret: string): Promise<string> {
  return new SignJWT({ va: [payload.ownerId, payload.targetId] })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + VIEW_AS_TTL_SECONDS)
    .sign(key(secret));
}

/** توکنِ نامعتبر یا منقضی → null، بی‌throw. */
export async function readViewAsToken(token: string | undefined | null, secret: string): Promise<ViewAsPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(secret), { algorithms: [ALG] });
    const va = payload['va'];
    if (!Array.isArray(va) || va.length !== 2) return null;
    const [ownerId, targetId] = va;
    if (typeof ownerId !== 'number' || typeof targetId !== 'number' || ownerId <= 0 || targetId <= 0) return null;
    return { ownerId, targetId };
  } catch {
    return null;
  }
}

export function viewAsCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: VIEW_AS_TTL_SECONDS,
  };
}

/**
 * چه کسی به‌جای چه کسی؟ فقط **مالک**، نه خودش، و نه مالکِ دیگر —
 * دیدنِ برنامه از چشمِ هم‌ترازِ خودش چیزی نشان نمی‌دهد و فقط مرزِ اعتماد را باز می‌کند.
 */
export function canViewAs(viewer: Pick<Actor, 'id' | 'roles'>, target: { id: number; roles: readonly Role[] }): boolean {
  if (!viewer.roles.includes('owner')) return false;
  if (viewer.id === target.id) return false;
  return !target.roles.includes('owner');
}
