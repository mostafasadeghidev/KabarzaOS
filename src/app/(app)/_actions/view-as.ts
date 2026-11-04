'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { db } from '@/db/client';
import { auditLog } from '@/db/schema';
import { loadActor, requireActor, sessionSecret } from '@/server/auth';
import { canViewAs, createViewAsToken, readViewAsToken, VIEW_AS_COOKIE, viewAsCookieOptions } from '@/domain/auth/view-as';
import { readSessionToken, SESSION_COOKIE } from '@/domain/auth/session';

/**
 * «دیدن به‌جای کاربر» (۲.۵۳.۰) — شروع و برگشت. هر دو در «رویدادها» ثبت می‌شوند:
 * چه کسی، به‌جای چه کسی، چه وقت.
 */

async function record(ownerId: number, action: 'view_as.start' | 'view_as.stop', targetId: number) {
  await db.insert(auditLog).values({
    actorType: 'user', actorId: ownerId, action, objectType: 'user', objectId: targetId,
  });
}

export async function startViewAsAction(targetId: number): Promise<{ error?: string }> {
  // ⚠️ requireActor: کسی که همین حالا به‌جای دیگری است، زنجیره نمی‌سازد.
  const owner = await requireActor();
  const target = Number.isInteger(targetId) && targetId > 0 ? await loadActor(targetId) : null;
  if (!target) return { error: 'این کاربر پیدا نشد یا اجازهٔ ورود ندارد.' };
  if (!canViewAs(owner, target.actor)) return { error: 'فقط مالک می‌تواند برنامه را به‌جای کاربرِ دیگری ببیند.' };

  const token = await createViewAsToken({ ownerId: owner.id, targetId: target.actor.id }, sessionSecret());
  (await cookies()).set(VIEW_AS_COOKIE, token, viewAsCookieOptions());
  await record(owner.id, 'view_as.start', target.actor.id);
  redirect('/dashboard');
}

/**
 * برگشت به حسابِ خودِ مالک.
 * ⚠️ requireActor نه (در این حالت همیشه رد می‌کند)؛ مالک از نشستِ واقعی خوانده می‌شود.
 */
export async function stopViewAsAction(): Promise<void> {
  const store = await cookies();
  const [session, va] = await Promise.all([
    readSessionToken(store.get(SESSION_COOKIE)?.value, sessionSecret()),
    readViewAsToken(store.get(VIEW_AS_COOKIE)?.value, sessionSecret()),
  ]);
  store.delete(VIEW_AS_COOKIE);
  if (session && va && va.ownerId === session.userId) await record(session.userId, 'view_as.stop', va.targetId);
  redirect('/members');
}

