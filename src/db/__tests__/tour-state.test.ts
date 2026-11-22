import { describe, it, expect, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, sql } from '../client';
import { users } from '../schema';
import { assignTours, getTourState, patchTourState } from '@/server/tours';

/**
 * پیشرفتِ راهنمای تعاملی (۳.۱۹.۰) — ادغامِ اتمی روی مقدارِ پایگاه‌داده.
 * ⚠️ پیش از این مرورگر کلِ `done`/`assigned` ِ کهنه را می‌فرستاد و جایگزین می‌کرد: راهنمایی که مدیر در همین
 * فاصله فرستاده بود، یا پیشرفتِ تبِ دیگر، بی‌صدا پاک می‌شد.
 */
const U = 1, V = 2;

beforeEach(async () => {
  await sql`truncate table users restart identity cascade`;
  await db.insert(users).values([
    { email: 'u@t.test', name: 'U', passwordHash: 'x' },
    { email: 'v@t.test', name: 'V', passwordHash: 'x' },
  ]);
});

describe('patchTourState', () => {
  it('done کلید‌به‌کلید ادغام می‌شود، نه جایگزین', async () => {
    await patchTourState(U, { done: { a: '2026-01-01T00:00:00.000Z' } });
    await patchTourState(U, { done: { b: 'skipped:2026-01-02T00:00:00.000Z' } });
    const s = await getTourState(U);
    expect(s.done).toEqual({ a: '2026-01-01T00:00:00.000Z', b: 'skipped:2026-01-02T00:00:00.000Z' });
  });

  it('تمام کردنِ یک راهنما فقط همان را از assigned برمی‌دارد — فرستادنِ تازهٔ مدیر می‌ماند', async () => {
    await assignTours([U], ['x', 'y']);
    // مدیر در این فاصله «z» را هم فرستاد؛ مرورگرِ کاربر از آن خبر ندارد.
    await assignTours([U], ['z']);
    await patchTourState(U, { done: { x: '2026-01-01T00:00:00.000Z' }, unassign: 'x', active: null });
    const s = await getTourState(U);
    expect([...(s.assigned ?? [])].sort()).toEqual(['y', 'z']);
    expect(s.active).toBeNull();
  });

  it('active و snoozeUntil جایگزین می‌شوند و بقیه دست نمی‌خورد', async () => {
    await patchTourState(U, { done: { a: '2026-01-01T00:00:00.000Z' } });
    await patchTourState(U, { active: { id: 'a', step: 's1' } });
    await patchTourState(U, { active: null, snoozeUntil: '2026-02-01T00:00:00.000Z' });
    const s = await getTourState(U);
    expect(s).toMatchObject({ active: null, snoozeUntil: '2026-02-01T00:00:00.000Z', done: { a: '2026-01-01T00:00:00.000Z' } });
  });
});

describe('assignTours', () => {
  it('برای چند نفر با یک UPDATE: از done برمی‌دارد، به assigned بی‌تکرار می‌افزاید، «بعداً» را پاک می‌کند', async () => {
    await patchTourState(U, { done: { x: '2026-01-01T00:00:00.000Z', keep: '2026-01-01T00:00:00.000Z' }, snoozeUntil: '2099-01-01T00:00:00.000Z' });
    await assignTours([U], ['x']);
    await assignTours([U, V], ['x', 'w']);
    const [su, sv] = [await getTourState(U), await getTourState(V)];
    expect(su.done).toEqual({ keep: '2026-01-01T00:00:00.000Z' });
    expect([...(su.assigned ?? [])].sort()).toEqual(['w', 'x']);
    expect(su.snoozeUntil).toBeUndefined();
    expect([...(sv.assigned ?? [])].sort()).toEqual(['w', 'x']);
  });

  it('کاربرِ دیگری که در فهرست نیست دست نمی‌خورد', async () => {
    await assignTours([U], ['x']);
    const [row] = await db.select({ s: users.tourState }).from(users).where(eq(users.id, V));
    expect(row?.s ?? {}).toEqual({});
  });
});
