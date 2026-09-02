import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, sql } from '../client';
import { currencies, projectMembers, projects, tags, users } from '../schema';
import { addUnitEntry } from '@/server/finance/member-service';
import { deleteTag } from '@/server/settings/service';
import { CatalogError } from '@/domain/settings/catalogs';
import type { Actor, Permission } from '@/domain/access/permissions';

/**
 * دو قاعده‌ای که ممیزیِ پنجم پیدا کرد و **هیچ‌کدام تست نداشتند**:
 *
 * ۱. پروژهٔ لغوشده/متوقف **منجمد** است — نه فقط بایگانی‌شده. پیش از این
 *    روی پروژهٔ لغوشده هنوز می‌شد کارکرد ثبت کرد، تسک ساخت و ساعت زد.
 * ۲. تگِ محافظت‌شده حذف نمی‌شود، حتی وقتی روی هیچ‌چیز نیست.
 */

const actor = (over: Partial<Actor> = {}): Actor => ({
  id: 1, roles: [], permissions: [], privateAccess: false, ...over,
});
const admin = () => actor({ id: 1, permissions: ['settings.manage'] as Permission[] });

let member: number, eur: number;
let running: number, cancelled: number, onHold: number, archived: number;
let protectedTag: number, plainTag: number;

beforeAll(async () => {
  await sql`truncate table unit_entries, payment_requests, project_members, projects, tags,
    currencies, audit_log, notifications, users restart identity cascade`;

  const u = await db.insert(users).values([
    { email: 'boss@t', name: 'مدیر' },
    { email: 'dev@t', name: 'عضو' },
  ]).returning({ id: users.id });
  member = u[1]!.id;

  const c = await db.insert(currencies).values({ code: 'EUR', name: 'یورو', isDefault: true })
    .returning({ id: currencies.id });
  eur = c[0]!.id;

  const t = await db.insert(tags).values([
    { name: 'در حال انجام', type: 'project_status', statusGroup: 'in_progress', isProtected: true },
    { name: 'لغو شده', type: 'project_status', statusGroup: 'cancelled', isProtected: true },
    { name: 'متوقف', type: 'project_status', statusGroup: 'on_hold', isProtected: true },
    { name: 'تگِ آزاد', type: 'member_role', isProtected: false },
  ]).returning({ id: tags.id });
  protectedTag = t[0]!.id; plainTag = t[3]!.id;

  const p = await db.insert(projects).values([
    { title: 'در جریان', scope: 'company', currencyId: eur, statusTagId: t[0]!.id, isUnitBased: true },
    { title: 'لغوشده', scope: 'company', currencyId: eur, statusTagId: t[1]!.id, isUnitBased: true },
    { title: 'متوقف', scope: 'company', currencyId: eur, statusTagId: t[2]!.id, isUnitBased: true },
    { title: 'بایگانی', scope: 'company', currencyId: eur, statusTagId: t[0]!.id, isArchived: true, isUnitBased: true },
  ]).returning({ id: projects.id });
  [running, cancelled, onHold, archived] = p.map((r) => r.id) as [number, number, number, number];

  // عضو روی هر چهار پروژه، با تعهدِ کافی برای درخواست.
  await db.insert(projectMembers).values(
    [running, cancelled, onHold, archived].map((projectId) => ({
      projectId, userId: member, agreedAmount: '1000', currencyId: eur,
    })),
  );
});

beforeEach(async () => {
  await sql`truncate table payment_requests, unit_entries restart identity cascade`;
});

/**
 * ⚠️ کارکردِ تعدادی ملاک است، نه درخواستِ پرداخت.
 *
 * نسخهٔ قبلی درخواستِ پرداخت را روی پروژهٔ منجمد **آزاد** گذاشته و این عمدی
 * است: عضوی که روی پروژهٔ لغوشده کارِ انجام‌شده دارد باید بتواند پولش را
 * بخواهد. تستِ اولِ من سخت‌گیرانه‌تر از نسخهٔ قبلی بود و اصلاح شد.
 */
const addUnit = (projectId: number) =>
  addUnitEntry(actor({ id: member }), {
    projectId, userId: member, entryDate: '2026-05-10', quantity: 2, note: '',
  });

describe('پروژهٔ منجمد', () => {
  it('روی پروژهٔ در جریان، ثبتِ کارکرد ممکن است', async () => {
    await expect(addUnit(running)).resolves.toBeGreaterThan(0);
  });

  it('⚠️ روی پروژهٔ لغوشده ممکن نیست', async () => {
    await expect(addUnit(cancelled)).rejects.toThrow();
  });

  it('⚠️ روی پروژهٔ متوقف هم ممکن نیست', async () => {
    await expect(addUnit(onHold)).rejects.toThrow();
  });

  it('روی پروژهٔ بایگانی ممکن نیست', async () => {
    await expect(addUnit(archived)).rejects.toThrow();
  });
});

describe('تگِ محافظت‌شده', () => {
  it('⚠️ حذف نمی‌شود، حتی وقتی روی هیچ پروژه‌ای نیست', async () => {
    // تگی محافظت‌شده که هیچ ارجاعی ندارد.
    const [orphan] = await db.insert(tags)
      .values({ name: 'وضعیتِ بی‌ارجاع', type: 'project_status', statusGroup: 'lead', isProtected: true })
      .returning({ id: tags.id });

    await expect(deleteTag(admin(), orphan!.id)).rejects.toBeInstanceOf(CatalogError);
    expect(await db.select().from(tags).where(eq(tags.id, orphan!.id))).toHaveLength(1);
  });

  it('تگِ محافظت‌شدهٔ در حالِ استفاده هم حذف نمی‌شود', async () => {
    await expect(deleteTag(admin(), protectedTag)).rejects.toBeInstanceOf(CatalogError);
  });

  it('تگِ آزادِ بی‌استفاده حذف می‌شود', async () => {
    await expect(deleteTag(admin(), plainTag)).resolves.toBeUndefined();
    expect(await db.select().from(tags).where(eq(tags.id, plainTag))).toHaveLength(0);
  });
});
