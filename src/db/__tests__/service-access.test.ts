import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, sql } from '../client';
import {
  currencies, notifications, onboardingItems, recurringExpenses, serviceGrants, services, tags, userRoles, users,
} from '../schema';
import * as access from '@/server/access/service';
import * as settings from '@/server/settings/service';
import { ForbiddenError } from '@/domain/access/guard';
import { AccessError } from '@/domain/access/service-grants';
import { CatalogError } from '@/domain/settings/catalogs';
import type { Actor, Permission } from '@/domain/access/permissions';

/**
 * دفترِ دسترسی‌های بیرونی — قواعدی که فقط با دیتابیسِ واقعی ثابت می‌شوند:
 * شاخصِ یکتای **جزئی**، ماندنِ ردیفِ قطع‌شده، و غیرفعال‌سازیِ سرویس.
 */

const actor = (over: Partial<Actor> = {}): Actor => ({
  id: 1, roles: [], permissions: [], privateAccess: false, ...over,
});
const viewer = () => actor({ id: 1, permissions: ['members.view'] as Permission[] });
const manager = () => actor({ id: 1, permissions: ['members.manage'] as Permission[] });
/** مدیرِ اعضا که مالی را هم می‌بیند — ستونِ هزینه فقط برای اوست. */
const cfo = () =>
  actor({ id: 1, permissions: ['members.manage', 'finance.view'] as Permission[] });

let boss: number, dev: number, gone: number, buyer: number;
let ai: number, voip: number;
let eur: number, sub: number;
/** دو دستهٔ سرویس و یک تگِ نقش — برای آزمونِ «فقط دستهٔ سرویس پذیرفته می‌شود». */
let aiCat: number, voipCat: number, roleTag: number;

beforeAll(async () => {
  await sql`truncate table audit_log, notifications, service_grants, services,
    recurring_expenses, currencies, user_roles, users, tags restart identity cascade`;

  const cats = await db.insert(tags).values([
    { name: 'هوش مصنوعی', type: 'service_category', color: '#8b5cf6', sortOrder: 2, nameI18n: { en: 'AI' } },
    { name: 'ویپ و تلفن', type: 'service_category', sortOrder: 1 },
    { name: 'طراح', type: 'member_role' },
  ]).returning({ id: tags.id });
  [aiCat, voipCat, roleTag] = cats.map((r) => r.id) as [number, number, number];

  const rows = await db.insert(users).values([
    { email: 'boss@t', name: 'مدیر' },
    { email: 'dev@t', name: 'برنامه‌نویس' },
    { email: 'gone@t', name: 'رفته', memberState: 'locked' },
    { email: 'buyer@t', name: 'کارفرما' },
  ]).returning({ id: users.id });
  [boss, dev, gone, buyer] = rows.map((r) => r.id) as [number, number, number, number];

  await db.insert(userRoles).values([
    { userId: boss, role: 'owner' },
    { userId: dev, role: 'member' },
    { userId: gone, role: 'member' },
    { userId: buyer, role: 'client' },
  ]);

  const cur = await db.insert(currencies).values({ code: 'EUR', name: 'یورو', symbol: '€', isDefault: true })
    .returning({ id: currencies.id });
  eur = cur[0]!.id;

  // اشتراکِ سالانه ۲۴۰ یورو → ماهی ۲۰.
  const rec = await db.insert(recurringExpenses).values({
    title: 'ChatGPT Team', amount: '240.0000', currencyId: eur,
    intervalUnit: 'year', intervalCount: 1,
    startDate: '2026-01-01', nextDueDate: '2027-01-01',
  }).returning({ id: recurringExpenses.id });
  sub = rec[0]!.id;

  ai = await access.saveService(manager(), {
    id: null, name: 'ChatGPT', categoryTagId: aiCat, ownerUserId: boss,
    adminUrl: 'https://chat.example', note: '', isActive: true,
  });
  voip = await access.saveService(manager(), {
    id: null, name: 'VoIP', categoryTagId: voipCat, ownerUserId: null,
    adminUrl: '', note: '', isActive: true,
  });
});

afterAll(async () => { await sql.end(); });

describe('گاردِ دسترسی', () => {
  it('بدونِ members.view دفتر باز نمی‌شود', async () => {
    await expect(access.accessBoard(actor())).rejects.toThrow(ForbiddenError);
  });

  it('⚠️ دیدن کافی نیست — نوشتن members.manage می‌خواهد', async () => {
    await expect(access.saveService(viewer(), {
      id: null, name: 'X', categoryTagId: null, ownerUserId: null,
      adminUrl: '', note: '', isActive: true,
    })).rejects.toThrow(ForbiddenError);
    await expect(access.grantAccess(viewer(), {
      serviceId: ai, userId: dev, accountRef: '', level: 'member', vaultRef: '', note: '',
    })).rejects.toThrow(ForbiddenError);
    await expect(access.revokeAccess(viewer(), 1)).rejects.toThrow(ForbiddenError);
  });
});

describe('اعطای دسترسی', () => {
  it('ردیفِ تازه ساخته می‌شود و در دفتر دیده می‌شود', async () => {
    await access.grantAccess(manager(), {
      serviceId: ai, userId: dev, accountRef: 'dev@t', level: 'member',
      vaultRef: 'vault/chatgpt', note: '',
    });

    const board = await access.accessBoard(viewer());
    expect(board.grants).toHaveLength(1);
    expect(board.grants[0]!.userName).toBe('برنامه‌نویس');
    expect(board.services.find((s) => s.id === ai)!.openCount).toBe(1);
  });

  it('⚠️ اعطای دوباره ردیفِ تکراری نمی‌سازد — همان را به‌روز می‌کند', async () => {
    // شاخصِ یکتای جزئی درجِ دوم را رد می‌کرد؛ سرویس پیش از درج تصمیم می‌گیرد.
    await access.grantAccess(manager(), {
      serviceId: ai, userId: dev, accountRef: 'dev@t', level: 'admin',
      vaultRef: '', note: 'ارتقا',
    });

    const rows = await db.select().from(serviceGrants).where(eq(serviceGrants.userId, dev));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.level).toBe('admin');
  });

  it('⚠️ به عضوِ سابق دسترسیِ تازه داده نمی‌شود', async () => {
    await expect(access.grantAccess(manager(), {
      serviceId: ai, userId: gone, accountRef: '', level: 'member', vaultRef: '', note: '',
    })).rejects.toThrow(AccessError);
  });

  it('سرویسِ غیرفعال دسترسیِ تازه نمی‌دهد', async () => {
    const dead = await access.saveService(manager(), {
      id: null, name: 'مرده', categoryTagId: null, ownerUserId: null,
      adminUrl: '', note: '', isActive: false,
    });
    await expect(access.grantAccess(manager(), {
      serviceId: dead, userId: dev, accountRef: '', level: 'member', vaultRef: '', note: '',
    })).rejects.toThrow(AccessError);
  });

  it('کاربرِ ناموجود رد می‌شود', async () => {
    await expect(access.grantAccess(manager(), {
      serviceId: ai, userId: 9999, accountRef: '', level: 'member', vaultRef: '', note: '',
    })).rejects.toThrow(AccessError);
  });
});

describe('R-ACCESS-01 — قطع یعنی مهرِ زمان، نه حذف', () => {
  it('ردیف می‌ماند و تاریخِ قطع می‌خورد', async () => {
    const [grant] = await db.select().from(serviceGrants).where(eq(serviceGrants.userId, dev));
    await access.revokeAccess(manager(), grant!.id);

    const [after] = await db.select().from(serviceGrants).where(eq(serviceGrants.id, grant!.id));
    expect(after).toBeDefined();
    expect(after!.revokedAt).not.toBeNull();
    expect(after!.revokedBy).toBe(1);
  });

  it('قطعِ دوباره خطاست — تاریخِ قطع بازنویسی نمی‌شود', async () => {
    const [grant] = await db.select().from(serviceGrants).where(eq(serviceGrants.userId, dev));
    await expect(access.revokeAccess(manager(), grant!.id)).rejects.toThrow(AccessError);
  });

  it('⚠️ بعد از قطع می‌شود دوباره دسترسی داد — یکتایی فقط روی بازهاست', async () => {
    // با یکتاییِ کامل، کسی که رفت و برگشت دیگر نمی‌توانست دسترسی بگیرد.
    await access.grantAccess(manager(), {
      serviceId: ai, userId: dev, accountRef: 'dev@t', level: 'viewer', vaultRef: '', note: '',
    });

    const rows = await db.select().from(serviceGrants).where(eq(serviceGrants.userId, dev));
    expect(rows).toHaveLength(2);
    expect(rows.filter((r) => r.revokedAt === null)).toHaveLength(1);
  });
});

/** یک دسترسیِ **بسته‌شده** — کمترین تاریخچه‌ای که سرویس را از پاک‌شدن نگه می‌دارد. */
const withHistory = (serviceId: number) => db.insert(serviceGrants).values({
  serviceId, userId: boss, accountRef: 'old', level: 'member', vaultRef: '', note: '',
  revokedAt: new Date('2026-01-01'),
});

describe('سرویس‌ها', () => {
  it('⚠️ با تاریخچه حذف نمی‌شود، غیرفعال می‌شود — تاریخچه با cascade نمی‌رود', async () => {
    await withHistory(voip);
    expect(await access.deleteService(manager(), voip)).toBe('deactivate');

    const [row] = await db.select().from(services).where(eq(services.id, voip));
    expect(row).toBeDefined();
    expect(row!.isActive).toBe(false);
    expect((await db.select().from(serviceGrants).where(eq(serviceGrants.serviceId, voip))).length).toBe(1);
  });

  it('بی‌تاریخچه واقعاً پاک می‌شود — فعال یا غیرفعال', async () => {
    const a = await access.findOrCreateService(manager(), 'آزمایشیِ ۱');
    expect(await access.deleteService(manager(), a)).toBe('delete');
    expect((await db.select().from(services).where(eq(services.id, a))).length).toBe(0);

    const b = await access.findOrCreateService(manager(), 'آزمایشیِ ۲');
    await db.update(services).set({ isActive: false }).where(eq(services.id, b));
    expect(await access.deleteService(manager(), b)).toBe('delete');
    expect((await db.select().from(services).where(eq(services.id, b))).length).toBe(0);
  });

  it('⚠️ اشتراکِ مالیِ وصل‌شده با حذفِ سرویس نمی‌رود', async () => {
    const id = await access.saveService(cfo(), {
      id: null, name: 'با اشتراک', categoryTagId: null, ownerUserId: null, adminUrl: '', note: '',
      isActive: true, recurringExpenseId: sub,
    });
    expect(await access.deleteService(manager(), id)).toBe('delete');
    expect((await db.select().from(recurringExpenses).where(eq(recurringExpenses.id, sub))).length).toBe(1);
  });

  it('⚠️ استفاده در آنبوردینگ هم تاریخچه است', async () => {
    const id = await access.findOrCreateService(manager(), 'در آنبوردینگ');
    await db.insert(onboardingItems).values({ title: 'دسترسی', kind: 'access', assignee: 'member', serviceId: id });
    expect(await access.deleteService(manager(), id)).toBe('deactivate');
    expect((await db.select().from(services).where(eq(services.id, id))).length).toBe(1);
  });

  it('سرویسِ غیرفعالِ دارای تاریخچه کاری ندارد و پاک نمی‌شود', async () => {
    await expect(access.deleteService(manager(), voip)).rejects.toBeInstanceOf(AccessError);
    expect((await db.select().from(services).where(eq(services.id, voip))).length).toBe(1);
  });

  it('دفتر شمارِ تاریخچه را به صفحه می‌دهد', async () => {
    const board = await access.accessBoard(manager());
    const row = board.services.find((x) => x.id === voip)!;
    expect(row.grantCount).toBeGreaterThanOrEqual(1);
    expect(row.onboardingCount).toBe(0);
  });

  it('حذف هم گاردِ دفتر را دارد', async () => {
    await expect(access.deleteService(viewer(), ai)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('قطعِ گروهی — چک‌لیستِ خروج', () => {
  // بخشِ پیشین VoIP را غیرفعال کرد و سرویسِ غیرفعال گرنتِ تازه نمی‌دهد.
  beforeAll(async () => {
    await db.update(services).set({ isActive: true }).where(eq(services.id, voip));
  });

  it('چند ردیف را با هم می‌بندد و شمارِ بسته‌شده‌ها را می‌دهد', async () => {
    const a = await access.grantAccess(manager(), {
      serviceId: voip, userId: boss, accountRef: '201', level: 'admin', vaultRef: '', note: '',
    });
    const b = await access.grantAccess(manager(), {
      serviceId: ai, userId: boss, accountRef: 'boss@t', level: 'admin', vaultRef: '', note: '',
    });

    expect(await access.revokeMany(manager(), [a, b])).toBe(2);
    const rows = await db.select().from(serviceGrants).where(eq(serviceGrants.userId, boss));
    expect(rows.every((r) => r.revokedAt !== null)).toBe(true);
  });

  it('⚠️ ردیفِ قبلاً بسته نادیده گرفته می‌شود، کلِ کار نمی‌افتد', async () => {
    // چک‌لیست از دادهٔ لحظه‌ای ساخته می‌شود؛ ممکن است همکارِ دیگری زودتر بسته باشد.
    const rows = await db.select().from(serviceGrants).where(eq(serviceGrants.userId, boss));
    expect(await access.revokeMany(manager(), rows.map((r) => r.id))).toBe(0);
  });

  it('شناسهٔ بی‌معنا چیزی را خراب نمی‌کند', async () => {
    expect(await access.revokeMany(manager(), [0, -3, 99999])).toBe(0);
  });

  it('بدونِ مجوزِ مدیریت رد می‌شود', async () => {
    await expect(access.revokeMany(viewer(), [1])).rejects.toThrow(ForbiddenError);
  });
});

describe('اعلانِ خروجِ عضو', () => {
  it('⚠️ مسئولِ هر سرویس یک اعلان می‌گیرد، نه یکی به ازای هر ردیف', async () => {
    // مسئولِ هر دو سرویس یک نفر است (boss) و دو گرنتِ باز دارد → یک اعلان.
    await db.update(services).set({ ownerUserId: boss }).where(eq(services.id, voip));
    const extra = await access.grantAccess(manager(), {
      serviceId: voip, userId: dev, accountRef: '204', level: 'viewer', vaultRef: '', note: '',
    });

    await db.delete(notifications);
    const touched = await access.notifyRevocationNeeded(dev);
    expect(touched).toBeGreaterThan(0);

    const rows = await db.select().from(notifications);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.userId).toBe(boss);

    // این گرنت فقط برای همین تست بود؛ بخش‌های بعدی شمارِ دست‌نخورده می‌خواهند.
    await access.revokeAccess(manager(), extra);
  });

  it('بی‌گرنتِ باز هیچ اعلانی نمی‌رود', async () => {
    await db.delete(notifications);
    expect(await access.notifyRevocationNeeded(gone)).toBe(0);
    expect(await db.select().from(notifications)).toHaveLength(0);
  });
});

describe('هزینهٔ سرویس — گاردِ مالی', () => {
  it('⚠️ بدونِ finance.view نه ستونِ هزینه می‌آید نه فهرستِ اشتراک‌ها', async () => {
    await db.update(services).set({ recurringExpenseId: sub }).where(eq(services.id, ai));

    const board = await access.accessBoard(manager());
    expect(board.canSeeCost).toBe(false);
    expect(board.subscriptions).toHaveLength(0);
    expect(board.services.find((s) => s.id === ai)!.cost).toBeNull();
    expect(board.costTotals).toHaveLength(0);
  });

  it('با مجوزِ مالی، سالانه به ماهانه تبدیل می‌شود', async () => {
    const board = await access.accessBoard(cfo());
    const row = board.services.find((s) => s.id === ai)!;
    expect(board.canSeeCost).toBe(true);
    expect(row.cost!.monthly).toBe('20.0000');
    expect(row.cost!.currencyCode).toBe('EUR');
    expect(board.costTotals[0]!.monthly).toBe('20.0000');
  });

  it('⚠️ ویرایشِ سرویس توسطِ مدیرِ اعضا اتصالِ مالی را پاک نمی‌کند', async () => {
    // فرمِ او این فیلد را ندارد، پس null می‌رسد؛ مقدارِ قبلی باید بماند.
    await access.saveService(manager(), {
      id: ai, name: 'ChatGPT', categoryTagId: aiCat, ownerUserId: boss,
      adminUrl: '', note: 'ویرایشِ ساده', isActive: true, recurringExpenseId: null,
    });

    const [row] = await db.select().from(services).where(eq(services.id, ai));
    expect(row!.recurringExpenseId).toBe(sub);
  });

  it('کسی که مالی را می‌بیند می‌تواند اتصال را بردارد', async () => {
    await access.saveService(cfo(), {
      id: ai, name: 'ChatGPT', categoryTagId: aiCat, ownerUserId: boss,
      adminUrl: '', note: '', isActive: true, recurringExpenseId: null,
    });

    const [row] = await db.select().from(services).where(eq(services.id, ai));
    expect(row!.recurringExpenseId).toBeNull();

    await db.update(services).set({ recurringExpenseId: sub }).where(eq(services.id, ai));
  });
});

describe('دستهٔ سرویس — تگی که در تنظیمات اداره می‌شود', () => {
  it('نام و رنگِ دسته از خودِ تگ می‌آید؛ گزینه‌ها به ترتیبِ تنظیمات‌اند', async () => {
    const board = await access.accessBoard(viewer());
    const row = board.services.find((s) => s.id === ai)!;
    expect(row.categoryTagId).toBe(aiCat);
    expect(row.categoryName).toBe('هوش مصنوعی');
    expect(row.categoryColor).toBe('#8b5cf6');
    // ⚠️ فقط نوعِ service_category، به ترتیبِ sortOrder — نقشِ عضو گزینه نیست.
    expect(board.categories.map((c) => c.id)).toEqual([voipCat, aiCat]);
  });

  it('سرویسِ بی‌دسته در فهرست می‌ماند', async () => {
    const id = await access.saveService(manager(), {
      id: null, name: 'بی‌دسته', categoryTagId: null, ownerUserId: null,
      adminUrl: '', note: '', isActive: true,
    });
    const row = (await access.accessBoard(viewer())).services.find((s) => s.id === id)!;
    expect(row.categoryTagId).toBeNull();
    expect(row.categoryName).toBeNull();
  });

  it('⚠️ تگی از نوعِ دیگر دسته نمی‌شود — بی‌دسته ذخیره می‌شود', async () => {
    const id = await access.saveService(manager(), {
      id: null, name: 'نقش به‌جای دسته', categoryTagId: roleTag, ownerUserId: null,
      adminUrl: '', note: '', isActive: true,
    });
    const [row] = await db.select().from(services).where(eq(services.id, id));
    expect(row!.categoryTagId).toBeNull();
  });

  it('⚠️ دسته‌ای که سرویسی دارد حذف نمی‌شود؛ دستهٔ خالی حذف می‌شود', async () => {
    const admin = actor({ id: 1, permissions: ['settings.manage'] as Permission[] });
    await expect(settings.deleteTag(admin, aiCat)).rejects.toThrow(CatalogError);

    const [spare] = await db.insert(tags).values({ name: 'موقت', type: 'service_category' })
      .returning({ id: tags.id });
    await settings.deleteTag(admin, spare!.id);
    expect(await db.select().from(tags).where(eq(tags.id, spare!.id))).toHaveLength(0);
  });

  it('⚠️ سرویسِ غیرفعال هم دسته‌اش را نگه می‌دارد و جلوی حذفِ آن را می‌گیرد', async () => {
    const admin = actor({ id: 1, permissions: ['settings.manage'] as Permission[] });
    const [cat] = await db.insert(tags).values({ name: 'قدیمی', type: 'service_category' })
      .returning({ id: tags.id });
    const id = await access.saveService(manager(), {
      id: null, name: 'کنارگذاشته', categoryTagId: cat!.id, ownerUserId: null,
      adminUrl: '', note: '', isActive: true,
    });
    await withHistory(id);
    await access.deleteService(manager(), id);

    await expect(settings.deleteTag(admin, cat!.id)).rejects.toThrow(CatalogError);
  });

  it('پیوندِ «مدیریتِ دسته‌ها» فقط برای کسی است که تنظیمات را اداره می‌کند', async () => {
    expect((await access.accessBoard(viewer())).canManageCategories).toBe(false);
    const both = actor({ id: 1, permissions: ['members.view', 'settings.manage'] as Permission[] });
    expect((await access.accessBoard(both)).canManageCategories).toBe(true);
  });
});

describe('شمارِ دسترسیِ بازِ هر نفر', () => {
  it('فقط بازها را می‌شمارد و گاردِ اعضا را دارد', async () => {
    const counts = await access.openGrantCounts(viewer(), [dev, boss]);
    expect(counts.get(boss) ?? 0).toBe(0);
    expect(counts.get(dev)).toBeGreaterThan(0);
    await expect(access.openGrantCounts(actor(), [dev])).rejects.toThrow(ForbiddenError);
  });

  it('فهرستِ خالی پرس‌وجو نمی‌زند', async () => {
    expect((await access.openGrantCounts(viewer(), [])).size).toBe(0);
  });
});

describe('دفتر', () => {
  it('کارفرما در فهرستِ افراد نیست', async () => {
    const board = await access.accessBoard(viewer());
    expect(board.people.map((p) => p.id)).not.toContain(buyer);
    expect(board.people.map((p) => p.id)).toContain(dev);
  });

  it('⚠️ عضوی که سابق شد و دسترسیِ باز دارد، ریسک می‌شود', async () => {
    // همان کارِ نیمه‌تمامِ off-boarding: حسابِ KabarzaOS بسته، سرویسِ بیرونی باز.
    await db.update(users).set({ memberState: 'locked' }).where(eq(users.id, dev));

    const board = await access.accessBoard(viewer());
    expect(board.risks.map((r) => r.userId)).toContain(dev);
    expect(board.risks.find((r) => r.userId === dev)!.grantIds).toHaveLength(1);

    await db.update(users).set({ memberState: 'active' }).where(eq(users.id, dev));
  });

  it('«دسترسی‌های من» فقط بازهای خودِ کاربر را می‌دهد', async () => {
    const mine = await access.myGrants(actor({ id: dev }));
    expect(mine).toHaveLength(1);
    expect(mine[0]!.serviceName).toBe('ChatGPT');
    expect(mine[0]!.level).toBe('viewer');

    expect(await access.myGrants(actor({ id: boss }))).toHaveLength(0);
  });
});

describe('ساختنِ همان‌جا — سرویس، دسته و اشتراک از داخلِ فرم', () => {
  const full = () => actor({
    id: 1, permissions: ['members.manage', 'settings.manage', 'finance.manage'] as Permission[],
  });
  const base = { id: null, categoryTagId: null, ownerUserId: null, adminUrl: '', note: '', isActive: true };
  const sub = { amount: '۱۵', currencyId: 0, intervalUnit: 'month', nextDueDate: '2026-11-01' };
  const count = async (table: typeof services | typeof tags | typeof recurringExpenses) =>
    (await db.select({ id: table.id }).from(table)).length;

  it('سرویس به نام: تکراری نمی‌سازد (بی‌توجه به بزرگی و کوچکیِ حروف)', async () => {
    const id = await access.findOrCreateService(manager(), 'Figma');
    expect(await access.findOrCreateService(manager(), '  figma ')).toBe(id);
    expect(await access.findOrCreateService(manager(), 'ChatGPT')).toBe(ai);
  });

  it('⚠️ سرویسِ غیرفعالِ هم‌نام دوباره فعال می‌شود، نه ردیفِ دوم', async () => {
    const id = await access.findOrCreateService(manager(), 'Trello');
    await withHistory(id);
    await access.deleteService(manager(), id);
    expect(await access.findOrCreateService(manager(), 'trello')).toBe(id);
    const [row] = await db.select({ isActive: services.isActive }).from(services).where(eq(services.id, id));
    expect(row?.isActive).toBe(true);
  });

  it('سرویس به نام هم گاردِ دفترِ دسترسی‌ها را دارد', async () => {
    await expect(access.findOrCreateService(viewer(), 'X')).rejects.toBeInstanceOf(ForbiddenError);
    await expect(access.findOrCreateService(manager(), '   ')).rejects.toBeInstanceOf(AccessError);
  });

  it('دستهٔ تازه ساخته می‌شود و هم‌نامِ موجود دوباره ساخته نمی‌شود', async () => {
    const a = await access.saveService(full(), { ...base, name: 'Miro', newCategoryName: 'طراحی' });
    const b = await access.saveService(full(), { ...base, name: 'Canva', newCategoryName: ' طراحی ' });
    const rows = await db.select({ id: services.id, cat: services.categoryTagId }).from(services)
      .where(eq(services.categoryTagId, (await db.select({ id: services.categoryTagId }).from(services).where(eq(services.id, a)))[0]!.id!));
    expect(rows.map((r) => r.id).sort()).toEqual([a, b].sort());
    const [tag] = await db.select({ type: tags.type }).from(tags).where(eq(tags.id, rows[0]!.cat!));
    expect(tag?.type).toBe('service_category');
  });

  it('اشتراکِ تازه: هزینهٔ دوره‌ای با نامِ سرویس ساخته و وصل می‌شود', async () => {
    const id = await access.saveService(full(), { ...base, name: 'Slack', newSubscription: { ...sub, currencyId: eur } });
    const [svc] = await db.select({ rec: services.recurringExpenseId }).from(services).where(eq(services.id, id));
    const [rec] = await db.select().from(recurringExpenses).where(eq(recurringExpenses.id, svc!.rec!));
    expect(rec?.title).toBe('Slack');
    expect(Number(rec?.amount)).toBe(15);
    expect(rec?.intervalUnit).toBe('month');
    expect(rec?.nextDueDate).toBe('2026-11-01');
  });

  it('⚠️ میان‌برها گاردِ جای اصلیِ خودشان را دارند', async () => {
    // مدیرِ اعضا بی‌حقِ تنظیمات دسته نمی‌سازد؛ بی‌حقِ مدیریتِ مالی اشتراک نمی‌سازد (دیدنِ مالی کافی نیست).
    await expect(access.saveService(manager(), { ...base, name: 'A1', newCategoryName: 'تازه' }))
      .rejects.toBeInstanceOf(ForbiddenError);
    await expect(access.saveService(cfo(), { ...base, name: 'A2', newSubscription: { ...sub, currencyId: eur } }))
      .rejects.toBeInstanceOf(ForbiddenError);
  });

  it('⚠️ ورودیِ نادرست پیش از هر نوشتنی رد می‌شود — نه دسته، نه هزینه، نه سرویسِ نیمه‌کاره', async () => {
    const before = [await count(services), await count(tags), await count(recurringExpenses)];
    await expect(access.saveService(full(), {
      ...base, name: 'Broken', newCategoryName: 'دستهٔ یتیم', newSubscription: { ...sub, amount: '0', currencyId: eur },
    })).rejects.toBeInstanceOf(AccessError);
    await expect(access.saveService(full(), {
      ...base, name: '', newCategoryName: 'دستهٔ یتیم',
    })).rejects.toBeInstanceOf(AccessError);
    expect([await count(services), await count(tags), await count(recurringExpenses)]).toEqual(before);
  });

  it('دفتر به فرم می‌گوید چه کسی اشتراک می‌سازد و با چه ارزی', async () => {
    const plain = await access.accessBoard(cfo());
    expect(plain.canCreateSubscription).toBe(false);
    expect(plain.currencies).toEqual([]);
    const board = await access.accessBoard(full());
    expect(board.canCreateSubscription).toBe(true);
    expect(board.currencies.map((c) => c.code)).toContain('EUR');
    expect(board.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
