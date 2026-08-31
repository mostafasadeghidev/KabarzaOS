import { eq, inArray } from 'drizzle-orm';
import { db } from '@/db/client';
import { users } from '@/db/schema';
import { type Actor } from '@/domain/access/permissions';
import {
  deriveState, normalizeConfig, shouldWrite,
  type PresenceConfig, type PresenceState,
} from '@/domain/people/presence';
import { getSystemConfig } from '@/server/settings/system-service';

/**
 * حضورِ زنده.
 *
 * ⚠️ هر کاربر فقط **ردیفِ خودش** را می‌نویسد؛ نه رقابتی بینِ کاربرها هست، نه
 * جدولی که رشد کند. قاعده‌ها در `domain/people/presence.ts`.
 *
 * ⚠️ آستانه‌ها از تنظیماتِ سامانه می‌آیند، نه ثابت: اگر مالک فاصلهٔ ضربان را
 * بلندتر کند ولی آستانهٔ «آفلاین» ثابت بماند، همه دائم آفلاین می‌شوند.
 */

async function presenceConfig(): Promise<PresenceConfig> {
  const system = await getSystemConfig();
  return normalizeConfig({
    ping: system.presencePing,
    idleAfter: system.presenceIdle,
    offlineAfter: system.presenceOffline,
  });
}

/** آیا نمایشِ حضور اصلاً روشن است؟ */
export async function presenceEnabled(): Promise<boolean> {
  return (await getSystemConfig()).presenceEnabled;
}

/** ثبتِ ضربان. `focused` یعنی تب همین حالا جلوی چشمِ کاربر است. */
export async function touch(actor: Actor, focused: boolean): Promise<void> {
  const config = await presenceConfig();
  const now = new Date();

  const rows = await db
    .select({ lastSeenAt: users.lastSeenAt, lastActiveAt: users.lastActiveAt })
    .from(users)
    .where(eq(users.id, actor.id));

  const current = rows[0];
  if (!current) return;

  const patch: { lastSeenAt?: Date; lastActiveAt?: Date } = {};

  // گلوگاه: ضربانِ زودهنگام نوشته نمی‌شود.
  if (shouldWrite({ lastWrite: current.lastSeenAt, now, config })) {
    patch.lastSeenAt = now;
  }
  if (focused && shouldWrite({ lastWrite: current.lastActiveAt, now, config })) {
    patch.lastActiveAt = now;
  }

  if (Object.keys(patch).length > 0) {
    await db.update(users).set(patch).where(eq(users.id, actor.id));
  }
}

/**
 * آفلاین‌کردنِ فوری — با بستنِ تب یا خروج.
 * ⚠️ بدونِ این، کاربری که تبش را می‌بندد تا پنج دقیقه «آنلاین» می‌ماند.
 */
export async function markOffline(actor: Actor): Promise<void> {
  await db.update(users)
    .set({ lastSeenAt: null, lastActiveAt: null })
    .where(eq(users.id, actor.id));
}

/** حالتِ حضورِ چند کاربر — یک کوئری، نه یکی به‌ازای هر نفر (R-PERF-01). */
export async function presenceFor(userIds: number[]): Promise<Map<number, PresenceState>> {
  if (userIds.length === 0) return new Map();

  const [rows, config] = await Promise.all([
    db
      .select({ id: users.id, lastSeenAt: users.lastSeenAt, lastActiveAt: users.lastActiveAt })
      .from(users)
      .where(inArray(users.id, userIds)),
    presenceConfig(),
  ]);

  const now = new Date();
  return new Map(rows.map((r) => [
    r.id,
    deriveState({
      lastSeen: r.lastSeenAt,
      lastActive: r.lastActiveAt,
      now,
      config,
    }),
  ]));
}
