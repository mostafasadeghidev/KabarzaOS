import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, sql } from '../client';
import { users, userRoles, projectMembers, projects, currencies, tags } from '../schema';
import * as service from '@/server/people/service';
import { ForbiddenError } from '@/domain/access/guard';
import { verifyPassword } from '@/domain/auth/password';
import type { Actor, Permission, Role } from '@/domain/access/permissions';

/** افراد از انتها تا انتها — سه‌حالتیِ دسترسی و چهار سرانجامِ حذف. */

const actor = (over: Partial<Actor> = {}): Actor => ({
  id: 1, roles: [], permissions: [], privateAccess: false, ...over,
});
const manager = () => actor({ id: 1, permissions: ['members.manage'] as Permission[] });
const viewer = () => actor({ id: 2, permissions: ['members.view'] as Permission[] });

let plain: number, withHistory: number, dualRole: number, ownerUser: number, devRole: number;

beforeAll(async () => {
  await sql`truncate table audit_log, project_members, projects, tags, user_offices,
    tag_relations, user_roles, users, currencies restart identity cascade`;

  const c = await db.insert(currencies)
    .values({ code: 'EUR', name: 'یورو', symbol: '€', isDefault: true })
    .returning({ id: currencies.id });

  const t = await db.insert(tags).values({ name: 'دولوپر', type: 'member_role' })
    .returning({ id: tags.id });
  devRole = t[0]!.id;

  const u = await db.insert(users).values([
    { email: 'plain@t', name: 'بی‌سابقه' },
    { email: 'hist@t', name: 'باسابقه' },
    { email: 'dual@t', name: 'دو‌نقشه' },
    { email: 'owner@t', name: 'مالک' },
  ]).returning({ id: users.id });
  [plain, withHistory, dualRole, ownerUser] = u.map((r) => r.id) as [number, number, number, number];

  await db.insert(userRoles).values([
    { userId: plain, role: 'member' },
    { userId: withHistory, role: 'member' },
    { userId: dualRole, role: 'member' },
    { userId: dualRole, role: 'client' },
    { userId: ownerUser, role: 'member' },
    { userId: ownerUser, role: 'owner' },
  ]);

  const p = await db.insert(projects).values({ title: 'پ', price: '0', currencyId: c[0]!.id })
    .returning({ id: projects.id });
  await db.insert(projectMembers)
    .values({ projectId: p[0]!.id, userId: withHistory, roleTagId: devRole, agreedAmount: '100' });
});

afterAll(async () => { await sql.end(); });

describe('گاردِ دسترسی', () => {
  it('بدونِ مجوز فهرست گرفته نمی‌شود', async () => {
    await expect(service.listPeople(actor(), 'member' as Role)).rejects.toThrow(ForbiddenError);
  });

  it('کاربرِ خواندنی فهرست می‌بیند ولی مدیریت نمی‌کند', async () => {
    const data = await service.listPeople(viewer(), 'member' as Role);
    expect(data.canManage).toBe(false);
    await expect(service.setMemberState(viewer(), plain, 'locked')).rejects.toThrow(ForbiddenError);
  });
});

describe('R-PEOPLE-01 — سه‌حالتیِ دسترسی', () => {
  it('هر سه حالت ثبت می‌شوند', async () => {
    for (const state of ['finance', 'locked', 'active'] as const) {
      expect(await service.setMemberState(manager(), plain, state)).toBe(state);
      const row = (await db.select().from(users).where(eq(users.id, plain)))[0]!;
      expect(row.memberState).toBe(state);
    }
  });

  it('حالتِ ناشناخته به «فعال» می‌افتد، نه خطا', async () => {
    expect(await service.setMemberState(manager(), plain, 'bogus')).toBe('active');
  });
});

describe('R-PEOPLE-02 — چهار سرانجامِ حذف', () => {
  it('کاربرِ خالص و بی‌ردِ پا واقعاً حذف می‌شود', async () => {
    const result = await service.removePerson(manager(), plain, 'member' as Role);
    expect(result.outcome).toBe('deleted');
    const row = (await db.select().from(users).where(eq(users.id, plain)))[0]!;
    expect(row.deletedAt).not.toBeNull();
  });

  it('⚠️ کاربرِ باسابقه حذف نمی‌شود؛ قطع می‌شود و تاریخچه‌اش می‌ماند', async () => {
    const result = await service.removePerson(manager(), withHistory, 'member' as Role);
    expect(result.outcome).toBe('deactivated');
    expect(result.message).toContain('دسترسی‌اش قطع شد');

    const row = (await db.select().from(users).where(eq(users.id, withHistory)))[0]!;
    expect(row.memberState).toBe('locked');
    expect(row.deletedAt).toBeNull();
    // عضویتِ پروژه‌اش دست‌نخورده.
    expect(await db.select().from(projectMembers).where(eq(projectMembers.userId, withHistory)))
      .toHaveLength(1);
  });

  it('کاربرِ دو‌نقشه فقط از این بخش جدا می‌شود', async () => {
    const result = await service.removePerson(manager(), dualRole, 'member' as Role);
    expect(result.outcome).toBe('detached');

    const roles = await db.select().from(userRoles).where(eq(userRoles.userId, dualRole));
    expect(roles.map((r) => r.role)).toEqual(['client']);
    const row = (await db.select().from(users).where(eq(users.id, dualRole)))[0]!;
    expect(row.deletedAt).toBeNull();
  });

  it('⚠️ مالک هرگز حذف نمی‌شود — فقط نقشِ عضو از او گرفته می‌شود', async () => {
    const result = await service.removePerson(manager(), ownerUser, 'member' as Role);
    expect(result.outcome).toBe('detached');
    const row = (await db.select().from(users).where(eq(users.id, ownerUser)))[0]!;
    expect(row.deletedAt).toBeNull();
  });

  it('کاربرِ ناموجود پیامِ خودش را دارد', async () => {
    const result = await service.removePerson(manager(), 999999, 'member' as Role);
    expect(result.outcome).toBe('noop');
    expect(result.message).toContain('یافت نشد');
  });
});

describe('ساخت و ویرایش', () => {
  it('عضو ساخته می‌شود با تگ و دفتر', async () => {
    const id = await service.createPerson(manager(), 'member' as Role, {
      name: 'تازه‌وارد', email: 'new@t', phone: '0912',
      tagIds: [devRole], officeIds: [], managedOfficeIds: [],
    });
    const data = await service.listPeople(manager(), 'member' as Role);
    const person = data.people.find((p) => p.id === id)!;
    expect(person.name).toBe('تازه‌وارد');
    expect(person.tags.map((t) => t.id)).toEqual([devRole]);
  });

  it('⚠️ ایمیلِ تکراری رد می‌شود', async () => {
    await expect(service.createPerson(manager(), 'member' as Role, {
      name: 'تکراری', email: 'new@t', phone: '',
      tagIds: [], officeIds: [], managedOfficeIds: [],
    })).rejects.toThrow(ForbiddenError);
  });
});

/**
 * انتخابگرِ «کاربرِ موجود» — پورتِ `existing_user_id` ِ نسخهٔ قبلی.
 * ⚠️ نکتهٔ اصلی این است که کاربر **دوباره ساخته نمی‌شود**؛ فقط نقش می‌گیرد.
 *
 * ⚠️ کاربرهای خودش را می‌سازد: تست‌های حذفِ بالاتر بعضی از ثابت‌های مشترک
 * را واقعاً پاک می‌کنند و تکیه بر آن‌ها تست را به ترتیبِ اجرا وابسته می‌کرد.
 */
describe('افزودنِ کاربرِ موجود به یک بخش', () => {
  let solo: number, both: number;

  beforeAll(async () => {
    const rows = await db.insert(users).values([
      { email: 'solo@t', name: 'فقط‌عضو' },
      { email: 'both@t', name: 'هردو' },
    ]).returning({ id: users.id });
    [solo, both] = rows.map((r) => r.id) as [number, number];

    await db.insert(userRoles).values([
      { userId: solo, role: 'member' },
      { userId: both, role: 'member' },
      { userId: both, role: 'client' },
    ]);
  });

  it('کاربرِ دارایِ همان نقش در فهرستِ کاندیداها نیست', async () => {
    const ids = (await service.attachCandidates(manager(), 'client' as Role)).map((c) => c.id);
    expect(ids).not.toContain(both);
    expect(ids).toContain(solo);
  });

  it('نقشِ تازه اضافه می‌شود و کاربرِ دومی ساخته نمی‌شود', async () => {
    const before = await db.select({ id: users.id }).from(users);

    const result = await service.attachRole(manager(), solo, 'client' as Role);
    expect(result.added).toBe(true);

    const after = await db.select({ id: users.id }).from(users);
    expect(after).toHaveLength(before.length);

    const roles = await db.select({ role: userRoles.role })
      .from(userRoles).where(eq(userRoles.userId, solo));
    expect(roles.map((r) => r.role).sort()).toEqual(['client', 'member']);
  });

  it('⚠️ نام و ایمیلِ کاربرِ موجود بازنویسی نمی‌شود', async () => {
    const [before] = await db.select().from(users).where(eq(users.id, both));

    await service.attachRole(manager(), both, 'finance' as Role, {
      phone: '0999',
      tagIds: [], officeIds: [], managedOfficeIds: [],
    });

    const [after] = await db.select().from(users).where(eq(users.id, both));
    expect(after!.name).toBe(before!.name);
    expect(after!.email).toBe(before!.email);
    // ولی تلفن — که مربوط به همین بخش است — نوشته می‌شود.
    expect(after!.phone).toBe('0999');
  });

  it('نقشِ تکراری دوباره درج نمی‌شود', async () => {
    const result = await service.attachRole(manager(), solo, 'client' as Role);
    expect(result.added).toBe(false);

    const roles = await db.select({ role: userRoles.role })
      .from(userRoles).where(eq(userRoles.userId, solo));
    expect(roles.filter((r) => r.role === 'client')).toHaveLength(1);
  });

  it('بدونِ مجوزِ مدیریت رد می‌شود', async () => {
    await expect(service.attachRole(viewer(), solo, 'client' as Role))
      .rejects.toThrow(ForbiddenError);
    await expect(service.attachCandidates(viewer(), 'client' as Role))
      .rejects.toThrow(ForbiddenError);
  });
});

/**
 * رمزِ ورود — تا پیش از این هیچ مسیری برای دادنِ رمز به کاربرِ تازه نبود
 * و افرادی که مدیر می‌ساخت اصلاً نمی‌توانستند وارد شوند.
 */
describe('رمزِ ورود', () => {
  it('فردِ تازه بدونِ رمز ساخته می‌شود و نمی‌تواند وارد شود', async () => {
    const id = await service.createPerson(manager(), 'member', {
      name: 'بی‌رمز', email: 'nopass@t', phone: '',
      tagIds: [], officeIds: [], managedOfficeIds: [],
    });
    const [row] = await db.select({ h: users.passwordHash })
      .from(users).where(eq(users.id, id));
    expect(row!.h).toBeNull();
  });

  it('رمزِ اولیه هنگامِ ساخت پذیرفته و هش می‌شود', async () => {
    const id = await service.createPerson(manager(), 'member', {
      name: 'بارمز', email: 'withpass@t', phone: '', password: 'first-pass-123',
      tagIds: [], officeIds: [], managedOfficeIds: [],
    });
    const [row] = await db.select({ h: users.passwordHash })
      .from(users).where(eq(users.id, id));
    // ⚠️ هش، نه خودِ رمز.
    expect(row!.h).toBeTruthy();
    expect(row!.h).not.toBe('first-pass-123');
    expect(await verifyPassword(row!.h!, 'first-pass-123')).toBe(true);
  });

  it('مدیر برای فردِ دیگر رمز می‌گذارد', async () => {
    const id = await service.createPerson(manager(), 'member', {
      name: 'گیرنده', email: 'target@t', phone: '',
      tagIds: [], officeIds: [], managedOfficeIds: [],
    });
    await service.setPersonPassword(manager(), id, 'manager-set-9999');
    const [row] = await db.select({ h: users.passwordHash })
      .from(users).where(eq(users.id, id));
    expect(await verifyPassword(row!.h!, 'manager-set-9999')).toBe(true);
  });

  it('⚠️ رمزِ ضعیف رد می‌شود', async () => {
    const id = await service.createPerson(manager(), 'member', {
      name: 'ضعیف', email: 'weak@t', phone: '',
      tagIds: [], officeIds: [], managedOfficeIds: [],
    });
    await expect(service.setPersonPassword(manager(), id, 'short'))
      .rejects.toBeInstanceOf(service.PasswordPolicyError);
    await expect(service.setPersonPassword(manager(), id, 'password'))
      .rejects.toBeInstanceOf(service.PasswordPolicyError);
  });

  it('⚠️ بدونِ مجوزِ اعضا نمی‌شود رمزِ کسی را گذاشت', async () => {
    const id = await service.createPerson(manager(), 'member', {
      name: 'قربانی', email: 'victim@t', phone: '',
      tagIds: [], officeIds: [], managedOfficeIds: [],
    });
    await expect(service.setPersonPassword(actor({ id: 999 }), id, 'attacker-pass-1'))
      .rejects.toBeInstanceOf(ForbiddenError);
  });

  it('⚠️ مدیر رمزِ خودش را از این راه عوض نمی‌کند — پروفایل جای آن است', async () => {
    await expect(service.setPersonPassword(manager(), manager().id, 'self-change-123'))
      .rejects.toBeInstanceOf(ForbiddenError);
  });

  it('⚠️ هشِ رمز هرگز در فهرستِ افراد برنمی‌گردد', async () => {
    const data = await service.listPeople(manager(), 'member');
    for (const person of data.people) {
      expect(person).not.toHaveProperty('passwordHash');
      expect(person).toHaveProperty('hasPassword');
    }
  });
});


describe('چه کسی از صفحهٔ افراد ویرایش می‌شود — بستنِ حفرهٔ تصاحبِ حساب', () => {
  const input = { name: 'x', email: 'owner@t', phone: '', tagIds: [], officeIds: [], managedOfficeIds: [] };

  it('همکارِ ادمین با «اعضا → مدیریت» نمی‌تواند مالک را ویرایش کند', async () => {
    // ⚠️ پیش از این فقط مجوزِ بخش چک می‌شد، نه اینکه هدف کیست — شناسهٔ مالک را
    // می‌شد فرستاد و نام/ایمیل/رمزش را عوض کرد.
    await expect(service.updatePerson(manager(), ownerUser, input)).rejects.toThrow(ForbiddenError);
    await expect(service.setMemberState(manager(), ownerUser, 'locked')).rejects.toThrow(ForbiddenError);
    await expect(service.setPersonPassword(manager(), ownerUser, 'takeover-99999')).rejects.toThrow(ForbiddenError);
  });

  it('مالک هم مالک را از این صفحه ویرایش نمی‌کند — پروفایل جای آن است', async () => {
    const owner = actor({ id: 99, roles: ['owner'], permissions: ['members.manage'] as Permission[] });
    await expect(service.updatePerson(owner, ownerUser, input)).rejects.toThrow(ForbiddenError);
  });

  it('عضوِ عادی همچنان ویرایش می‌شود', async () => {
    // ⚠️ عضوِ تازه: آزمون‌های حذفِ بالاتر، کاربرانِ اولیه را برداشته‌اند.
    const id = await service.createPerson(manager(), 'member' as Role, { ...input, name: 'تازه', email: 'fresh@t' });
    await service.updatePerson(manager(), id, { ...input, name: 'تازهٔ ویرایش‌شده', email: 'fresh@t' });
    const row = await db.select({ name: users.name }).from(users).where(eq(users.id, id));
    expect(row[0]!.name).toBe('تازهٔ ویرایش‌شده');
  });
});
