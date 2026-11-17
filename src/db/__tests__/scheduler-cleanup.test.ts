import { describe, it, expect, beforeEach } from 'vitest';
import { sql, db } from '../client';
import { auditLog, users } from '../schema';
import { runTick } from '@/server/scheduler/service';
import { RETENTION_DAYS } from '@/domain/scheduler/tick';

/**
 * پاک‌سازیِ روزانهٔ زمان‌بند.
 *
 * ⚠️ این تست برای یک اشتباهِ مشخص نوشته شد: ثابتِ `RETENTION_DAYS.activity`
 * تعریف شده بود ولی هیچ‌جا مصرف نمی‌شد — یعنی `audit_log` بی‌مرز رشد می‌کرد
 * و کسی خبر نداشت، چون یک ثابتِ **مرده** دقیقاً مثلِ یک ثابتِ زنده به نظر
 * می‌رسد.
 */

let userId: number;

beforeEach(async () => {
  await sql`truncate table audit_log, scheduler_stamps, users restart identity cascade`;
  const rows = await db.insert(users).values({ email: 'a@t', name: 'کاربر' })
    .returning({ id: users.id });
  userId = rows[0]!.id;
});

const daysAgo = (n: number) => new Date(Date.now() - n * 86400000);

describe('پاک‌سازیِ لاگِ ممیزی', () => {
  it('⚠️ ردیفِ کهنه‌تر از پنجرهٔ نگهداری پاک می‌شود', async () => {
    await db.insert(auditLog).values([
      {
        actorType: 'user', actorId: userId, action: 'project.create',
        objectType: 'project', objectId: 1,
        createdAt: daysAgo(RETENTION_DAYS.activity + 5),
      },
      {
        actorType: 'user', actorId: userId, action: 'project.update',
        objectType: 'project', objectId: 2,
        createdAt: daysAgo(3),
      },
    ]);

    await runTick(new Date());

    const left = await db.select({ action: auditLog.action }).from(auditLog);
    expect(left).toHaveLength(1);
    expect(left[0]!.action).toBe('project.update');
  });

  it('ردیفِ درست روی مرز می‌ماند', async () => {
    await db.insert(auditLog).values({
      actorType: 'user', actorId: userId, action: 'project.create',
      objectType: 'project', objectId: 1,
      createdAt: daysAgo(RETENTION_DAYS.activity - 1),
    });

    await runTick(new Date());
    expect(await db.select().from(auditLog)).toHaveLength(1);
  });

  it('⚠️ پاک‌سازی روزی یک بار است، نه هر تیک', async () => {
    await runTick(new Date());

    await db.insert(auditLog).values({
      actorType: 'user', actorId: userId, action: 'project.create',
      objectType: 'project', objectId: 1,
      createdAt: daysAgo(RETENTION_DAYS.activity + 5),
    });

    // تیکِ دومِ همان روز نباید دوباره پاک کند.
    const report = await runTick(new Date());
    expect(report.cleaned).toBe(false);
    expect(await db.select().from(auditLog)).toHaveLength(1);
  });
});

describe('پاک‌سازیِ یادآورها — Reminders::purge_old', () => {
  it('⚠️ یادآورِ یک هفته گذشته پاک می‌شود، فرستاده یا نه؛ یادآورِ تازه می‌ماند', async () => {
    const { reminders } = await import('../schema');
    await db.insert(reminders).values([
      { userId, body: 'کهنهٔ فرستاده', remindAt: daysAgo(RETENTION_DAYS.reminders + 2), isSent: true },
      { userId, body: 'کهنهٔ فرستاده‌نشده', remindAt: daysAgo(RETENTION_DAYS.reminders + 2), isSent: false },
      { userId, body: 'تازه', remindAt: daysAgo(1), isSent: false },
    ]);
    await runTick(new Date());
    expect((await db.select().from(reminders)).map((r) => r.body)).toEqual(['تازه']);
  });
});

describe('۳.۱۱.۰ — قفلِ تیک: دو تیکِ هم‌زمان با هم کار نمی‌کنند', () => {
  it('وقتی تیکی در جریان است، تیکِ دوم کنار می‌رود؛ قفلِ کهنه (تیکِ مُرده) گرفته می‌شود', async () => {
    const { schedulerStamps } = await import('../schema');
    const { eq } = await import('drizzle-orm');
    // تیکِ دیگری همین حالا شروع شده:
    await db.insert(schedulerStamps).values({ key: 'tick:lease', value: 'x', updatedAt: new Date() });
    expect((await runTick(new Date())).skipped).toBe(true);
    // تیکِ قبلی ۵ دقیقه پیش مُرد و قفل را پس نداد:
    await db.update(schedulerStamps).set({ updatedAt: new Date(Date.now() - 5 * 60_000) }).where(eq(schedulerStamps.key, 'tick:lease'));
    expect((await runTick(new Date())).skipped).toBeUndefined();
    // پایانِ تیک قفل را آزاد می‌کند.
    expect(await db.select().from(schedulerStamps).where(eq(schedulerStamps.key, 'tick:lease'))).toEqual([]);
  });

  it('⚠️ دو تیکِ واقعاً هم‌زمان: فقط یکی کار می‌کند', async () => {
    const [a, b] = await Promise.all([runTick(new Date()), runTick(new Date())]);
    expect([a.skipped, b.skipped].filter(Boolean)).toHaveLength(1);
  });
});
