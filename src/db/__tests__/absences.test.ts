import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, sql } from '../client';
import { absences, notifications, offices, userOffices, userRoles, users } from '../schema';
import {
  canManageLeave, deleteAbsence, leaveTargets, listAbsences, saveAbsence,
} from '@/server/availability/absence-service';
import { ForbiddenError } from '@/domain/access/guard';
import type { Actor, Permission } from '@/domain/access/permissions';

/**
 * مرخصیِ موردی — پورتِ `Support\Absences`.
 *
 * ⚠️ مهم‌ترین رفتارِ زیرِ آزمون **ادغام** است: نسخهٔ قبلی بازهٔ همپوشان یا هم‌مرز
 * را با ردیفِ موجود یکی می‌کند. پیش از این، جدولِ `absences` در اپ اصلاً
 * مسیرِ نوشتن نداشت و همیشه خالی می‌ماند.
 */

const actor = (over: Partial<Actor> = {}): Actor => ({
  id: 1, roles: [], permissions: [], privateAccess: false, ...over,
});

let ali: number, sara: number, reza: number, boss: number;
let tehran: number, shiraz: number;

beforeAll(async () => {
  await sql`truncate table absences, notifications, user_offices, user_roles,
    offices, audit_log, users restart identity cascade`;

  const rows = await db.insert(users).values([
    { email: 'ali@t', name: 'علی' },
    { email: 'sara@t', name: 'سارا' },
    { email: 'reza@t', name: 'رضا' },
    { email: 'boss@t', name: 'مدیرِ دفتر' },
  ]).returning({ id: users.id });
  [ali, sara, reza, boss] = rows.map((r) => r.id) as [number, number, number, number];

  await db.insert(userRoles).values(
    [ali, sara, reza, boss].map((userId) => ({ userId, role: 'member' as const })),
  );

  const o = await db.insert(offices).values([
    { name: 'تهران' }, { name: 'شیراز' },
  ]).returning({ id: offices.id });
  tehran = o[0]!.id; shiraz = o[1]!.id;

  await db.insert(userOffices).values([
    { userId: ali, officeId: tehran, manages: false },
    { userId: sara, officeId: shiraz, manages: false },
    { userId: boss, officeId: tehran, manages: true },
  ]);
});

beforeEach(async () => {
  await sql`truncate table absences, notifications restart identity cascade`;
});

describe('ثبتِ مرخصی', () => {
  it('بازهٔ ساده ثبت می‌شود', async () => {
    const id = await saveAbsence(actor({ id: ali }), {
      userId: ali, from: '2026-05-10', to: '2026-05-12', note: 'سفر',
    });
    const rows = await db.select().from(absences).where(eq(absences.id, id));
    expect(rows[0]).toMatchObject({ fromDate: '2026-05-10', toDate: '2026-05-12', note: 'سفر' });
  });

  it('تاریخِ برعکس جابه‌جا می‌شود', async () => {
    const id = await saveAbsence(actor({ id: ali }), {
      userId: ali, from: '2026-05-12', to: '2026-05-10',
    });
    const [row] = await db.select().from(absences).where(eq(absences.id, id));
    expect(row).toMatchObject({ fromDate: '2026-05-10', toDate: '2026-05-12' });
  });

  it('⚠️ بازهٔ همپوشان ادغام می‌شود، نه ردیفِ دوم', async () => {
    const first = await saveAbsence(actor({ id: ali }), {
      userId: ali, from: '2026-05-10', to: '2026-05-12', note: 'بیماری',
    });
    const second = await saveAbsence(actor({ id: ali }), {
      userId: ali, from: '2026-05-11', to: '2026-05-15', note: 'ادامه',
    });

    expect(second).toBe(first);
    const rows = await db.select().from(absences).where(eq(absences.userId, ali));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      fromDate: '2026-05-10', toDate: '2026-05-15', note: 'بیماری · ادامه',
    });
  });

  it('⚠️ بازهٔ هم‌مرز (فردای روزِ آخر) هم ادغام می‌شود', async () => {
    await saveAbsence(actor({ id: ali }), { userId: ali, from: '2026-05-10', to: '2026-05-12' });
    await saveAbsence(actor({ id: ali }), { userId: ali, from: '2026-05-13', to: '2026-05-14' });

    const rows = await db.select().from(absences).where(eq(absences.userId, ali));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ fromDate: '2026-05-10', toDate: '2026-05-14' });
  });

  it('چند ردیفِ همپوشان در یکی حل می‌شوند', async () => {
    await saveAbsence(actor({ id: ali }), { userId: ali, from: '2026-05-01', to: '2026-05-03' });
    await saveAbsence(actor({ id: ali }), { userId: ali, from: '2026-05-20', to: '2026-05-22' });
    expect(await db.select().from(absences).where(eq(absences.userId, ali))).toHaveLength(2);

    // بازهٔ پوشاننده هر دو را می‌بلعد.
    await saveAbsence(actor({ id: ali }), { userId: ali, from: '2026-05-02', to: '2026-05-21' });
    const rows = await db.select().from(absences).where(eq(absences.userId, ali));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ fromDate: '2026-05-01', toDate: '2026-05-22' });
  });

  it('بازهٔ دور ادغام نمی‌شود', async () => {
    await saveAbsence(actor({ id: ali }), { userId: ali, from: '2026-05-10', to: '2026-05-12' });
    await saveAbsence(actor({ id: ali }), { userId: ali, from: '2026-05-20', to: '2026-05-21' });
    expect(await db.select().from(absences).where(eq(absences.userId, ali))).toHaveLength(2);
  });

  it('مرخصیِ دیگری با مالِ من ادغام نمی‌شود', async () => {
    await saveAbsence(actor({ id: ali }), { userId: ali, from: '2026-05-10', to: '2026-05-12' });
    await saveAbsence(actor({ id: sara }), { userId: sara, from: '2026-05-10', to: '2026-05-12' });
    expect(await db.select().from(absences)).toHaveLength(2);
  });

  it('تاریخِ نامعتبر رد می‌شود', async () => {
    await expect(saveAbsence(actor({ id: ali }), { userId: ali, from: '', to: '2026-05-10' }))
      .rejects.toThrow();
  });
});

describe('دامنهٔ ثبت برای دیگری', () => {
  it('عضوِ عادی نمی‌تواند برای دیگری ثبت کند', async () => {
    await expect(saveAbsence(actor({ id: ali }), {
      userId: sara, from: '2026-05-10', to: '2026-05-12',
    })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('مدیرِ اعضا برای هر کسی می‌تواند', async () => {
    const id = await saveAbsence(
      actor({ id: reza, permissions: ['members.view', 'members.manage'] as Permission[] }),
      { userId: sara, from: '2026-05-10', to: '2026-05-12' },
    );
    expect(id).toBeGreaterThan(0);
  });

  it('مدیرِ دفتر فقط برای عضوِ دفترِ خودش', async () => {
    expect(await canManageLeave(actor({ id: boss }), ali)).toBe(true);
    // سارا در شیراز است، نه تهران.
    expect(await canManageLeave(actor({ id: boss }), sara)).toBe(false);

    await expect(saveAbsence(actor({ id: boss }), {
      userId: sara, from: '2026-05-10', to: '2026-05-12',
    })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('⚠️ وقتی دیگری ثبت می‌کند، خودِ عضو اعلان می‌گیرد', async () => {
    await saveAbsence(actor({ id: boss }), { userId: ali, from: '2026-05-10', to: '2026-05-12' });
    const rows = await db.select().from(notifications).where(eq(notifications.userId, ali));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.type).toBe('absence_set');
  });

  it('ثبت برای خود اعلان نمی‌فرستد', async () => {
    await saveAbsence(actor({ id: ali }), { userId: ali, from: '2026-05-10', to: '2026-05-12' });
    expect(await db.select().from(notifications)).toHaveLength(0);
  });

  it('⚠️ مالکی که «عضو» نیست هم خودش را در فهرست می‌بیند', async () => {
    // بدونِ این، پیش‌فرضِ انتخابگر روی اولین عضو می‌افتاد و مرخصی برای
    // کسِ دیگری ثبت می‌شد.
    const [owner] = await db.insert(users)
      .values({ email: 'owner-only@t', name: 'مالکِ بی‌نقش' })
      .returning({ id: users.id });
    const list = await leaveTargets(
      actor({ id: owner!.id, permissions: ['members.view', 'members.manage'] as Permission[] }),
    );
    expect(list[0]!.id).toBe(owner!.id);
  });

  it('فهرستِ هدف‌ها با دامنه محدود می‌شود', async () => {
    const forBoss = await leaveTargets(actor({ id: boss }));
    expect(forBoss.map((t) => t.id).sort()).toEqual([ali, boss].sort());

    const forAli = await leaveTargets(actor({ id: ali }));
    expect(forAli.map((t) => t.id)).toEqual([ali]);

    const forAdmin = await leaveTargets(
      actor({ id: reza, permissions: ['members.view', 'members.manage'] as Permission[] }),
    );
    expect(forAdmin).toHaveLength(4);
  });
});

describe('حذف و فهرست', () => {
  it('صاحبِ مرخصی حذفش می‌کند', async () => {
    const id = await saveAbsence(actor({ id: ali }), {
      userId: ali, from: '2026-05-10', to: '2026-05-12',
    });
    await deleteAbsence(actor({ id: ali }), id);
    expect(await db.select().from(absences)).toHaveLength(0);
  });

  it('⚠️ دیگری با شناسهٔ حدس‌زده نمی‌تواند حذف کند', async () => {
    const id = await saveAbsence(actor({ id: ali }), {
      userId: ali, from: '2026-05-10', to: '2026-05-12',
    });
    await expect(deleteAbsence(actor({ id: sara }), id)).rejects.toBeInstanceOf(ForbiddenError);
    expect(await db.select().from(absences)).toHaveLength(1);
  });

  it('حذفِ شناسهٔ ناموجود خطا نمی‌دهد', async () => {
    await expect(deleteAbsence(actor({ id: ali }), 99999)).resolves.toBeUndefined();
  });

  it('فهرستِ آینده گذشته را کنار می‌گذارد', async () => {
    await saveAbsence(actor({ id: ali }), { userId: ali, from: '2026-01-01', to: '2026-01-02' });
    await saveAbsence(actor({ id: ali }), { userId: ali, from: '2026-09-01', to: '2026-09-02' });

    const all = await listAbsences(actor({ id: ali }), ali);
    expect(all).toHaveLength(2);

    const upcoming = await listAbsences(actor({ id: ali }), ali, {
      upcomingOnly: true, today: '2026-06-01',
    });
    expect(upcoming).toHaveLength(1);
    expect(upcoming[0]).toMatchObject({ fromDate: '2026-09-01' });
  });
});
