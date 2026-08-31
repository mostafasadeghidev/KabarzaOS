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
