import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, sql } from '../client';
import {
  users, userRoles, projects, projectClients, currencies, accounts, ledger,
} from '../schema';
import * as service from '@/server/people/service';
import * as repo from '@/server/people/repository';
import {
  adoptDeviceTimezone, getAccountInfo, ProfileValidationError, saveTimezone, updateMyProfile,
} from '@/server/people/profile-service';
import { removeAvatar } from '@/server/files/service';
import { ForbiddenError } from '@/domain/access/guard';
import type { Actor, Permission } from '@/domain/access/permissions';

/** افراد — ردِ پا (پورتِ `has_footprint`)، حسابِ خودم، حذفِ تصویر. */

const actor = (over: Partial<Actor> = {}): Actor => ({
  id: 1, roles: [], permissions: [], privateAccess: false, ...over,
});
const manager = () => actor({ id: 1, permissions: ['members.manage', 'members.view'] as Permission[] });
const CLIENT_ONLY = 2, LEDGER_ONLY = 3, NOBODY = 4, SELF = 5, OTHER = 6;

beforeAll(async () => {
  await sql`truncate table audit_log, ledger, accounts, project_clients, projects, users, currencies
    restart identity cascade`;

  const c = await db.insert(currencies).values({ code: 'EUR', name: 'یورو', symbol: '€', isDefault: true })
    .returning({ id: currencies.id });
  await db.insert(users).values([
    { email: 'm@t', name: 'مدیر' },
    { email: 'c@t', name: 'کارفرمای قدیمی' },
    { email: 'l@t', name: 'گیرندهٔ قدیمی' },
    { email: 'n@t', name: 'بی‌رد' },
    { email: 'me@t', name: 'خودم', phone: '0912', username: 'me' },
    { email: 'Other@Test.local', name: 'دیگری' },
  ]);
  await db.insert(userRoles).values([
    { userId: CLIENT_ONLY, role: 'member' },
    { userId: LEDGER_ONLY, role: 'member' },
    { userId: NOBODY, role: 'member' },
  ]);

  const p = await db.insert(projects).values({ title: 'پ', price: '0', currencyId: c[0]!.id })
    .returning({ id: projects.id });
  await db.insert(projectClients).values({ projectId: p[0]!.id, userId: CLIENT_ONLY });

  const a = await db.insert(accounts).values({ name: 'حساب', currencyId: c[0]!.id, openingBalance: '0' })
    .returning({ id: accounts.id });
  await db.insert(ledger).values({
    accountId: a[0]!.id, createdBy: 1, entryDate: '2026-08-01', direction: 'out', amount: '10', currencyId: c[0]!.id,
    amountAccount: '10', receiverUserId: LEDGER_ONLY,
  });
});

afterAll(async () => { await sql.end(); });

describe('ردِ پا — پورتِ has_footprint (همهٔ جدول‌ها)', () => {
  it('کارفرمای پروژه و طرفِ یک ردیفِ دفتر «سابق» می‌شوند، نه حذف', async () => {
    expect(await repo.hasFootprint(CLIENT_ONLY)).toBe(true);
    expect(await repo.hasFootprint(LEDGER_ONLY)).toBe(true);
    expect(await repo.hasFootprint(NOBODY)).toBe(false);

    expect((await service.removePerson(manager(), CLIENT_ONLY, 'member')).outcome).toBe('deactivated');
    expect((await service.removePerson(manager(), LEDGER_ONLY, 'member')).outcome).toBe('deactivated');
    expect((await service.removePerson(manager(), NOBODY, 'member')).outcome).toBe('deleted');
  });
});

describe('حسابِ خودم — پورتِ پنلِ «حساب»', () => {
  it('نام/ایمیل/تلفن به دستِ خودِ کاربر؛ نامِ کاربری فقط نمایش', async () => {
    const me = actor({ id: SELF });
    expect(await getAccountInfo(me)).toMatchObject({ username: 'me', phone: '0912', avatarFileId: null });

    await updateMyProfile(me, { name: 'خودِ تازه', email: 'Me2@Test.local', phone: '0999' });
    const [row] = await db.select().from(users).where(eq(users.id, SELF));
    expect(row!.name).toBe('خودِ تازه');
    expect(row!.email).toBe('me2@test.local');
    expect(row!.phone).toBe('0999');
  });

  it('⚠️ ایمیلِ حسابِ دیگری (بی‌اعتنا به حروف) و ایمیلِ نامعتبر رد می‌شوند', async () => {
    const me = actor({ id: SELF });
    await expect(updateMyProfile(me, { name: 'x', email: 'other@test.local', phone: '' }))
      .rejects.toMatchObject({ code: 'email_taken' });
    await expect(updateMyProfile(me, { name: 'x', email: 'not-an-email', phone: '' }))
      .rejects.toBeInstanceOf(ProfileValidationError);
    await expect(updateMyProfile(me, { name: '  ', email: 'me2@test.local', phone: '' }))
      .rejects.toMatchObject({ code: 'name' });
  });

  it('⚠️ منطقهٔ زمانیِ دستگاه فقط وقتی هرگز انتخاب نشده (۳.۱۵.۱)', async () => {
    const tz = async (id: number) => (await db.select().from(users).where(eq(users.id, id)))[0]!;
    // هرگز انتخاب نکرده ← منطقهٔ دستگاه ذخیره می‌شود؛ بارِ دوم دیگر نه.
    expect(await adoptDeviceTimezone(actor({ id: NOBODY }), 'Asia/Tehran')).toBe(true);
    expect((await tz(NOBODY)).timezone).toBe('Asia/Tehran');
    expect(await adoptDeviceTimezone(actor({ id: NOBODY }), 'Europe/Berlin')).toBe(false);
    expect((await tz(NOBODY)).timezone).toBe('Asia/Tehran');
    // مقدارِ نامعتبر هیچ.
    expect(await adoptDeviceTimezone(actor({ id: OTHER }), 'Mars/Base')).toBe(false);
    // ⚠️ «پیش‌فرضِ سامانه» ِ دستی (خالی) انتخاب است — تشخیصِ خودکار بازنویسی‌اش نمی‌کند.
    await saveTimezone(actor({ id: OTHER }), '');
    expect((await tz(OTHER)).timezoneChosenAt).not.toBeNull();
    expect(await adoptDeviceTimezone(actor({ id: OTHER }), 'Asia/Tehran')).toBe(false);
    expect((await tz(OTHER)).timezone).toBe('');
  });

  it('حذفِ تصویر: خودِ فرد یا مدیرِ اعضا؛ دیگری نه', async () => {
    await expect(removeAvatar(actor({ id: OTHER }), SELF)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(removeAvatar(actor({ id: SELF }), SELF)).resolves.toBeUndefined();
    await expect(removeAvatar(manager(), SELF)).resolves.toBeUndefined();
  });
});
