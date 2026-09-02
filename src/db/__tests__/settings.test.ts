import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, sql } from '../client';
import { currencies, exchangeRates, tags, projects, accounts, offices, vendors, users } from '../schema';
import * as service from '@/server/settings/service';
import { getSystemConfig, saveSystemConfig } from '@/server/settings/system-service';
import { ForbiddenError } from '@/domain/access/guard';
import { CatalogError } from '@/domain/settings/catalogs';
import type { Actor, Permission } from '@/domain/access/permissions';

/** تنظیمات — قواعدِ حذف که دادهٔ زنده را محافظت می‌کنند. */

const actor = (over: Partial<Actor> = {}): Actor => ({
  id: 1, roles: [], permissions: [], privateAccess: false, ...over,
});
const admin = () => actor({ id: 1, permissions: ['settings.manage'] as Permission[] });
// طرف‌حساب کاتالوگِ مالی است — گاردش finance.manage است.
const financeAdmin = () =>
  actor({ id: 1, permissions: ['settings.manage', 'finance.view', 'finance.manage'] as Permission[] });

let eur: number, usd: number, unused: number, usedTag: number, freeTag: number;

beforeAll(async () => {
  await sql`truncate table audit_log, exchange_rates, projects, accounts, offices,
    vendors, qa_items, tags, users, currencies restart identity cascade`;

  const c = await db.insert(currencies).values([
    { code: 'EUR', name: 'یورو', symbol: '€', isDefault: true },
    { code: 'USD', name: 'دلار', symbol: '$' },
    { code: 'GBP', name: 'پوند', symbol: '£' },
  ]).returning({ id: currencies.id });
  eur = c[0]!.id; usd = c[1]!.id; unused = c[2]!.id;

  await db.insert(users).values({ email: 'a@t', name: 'مدیر' });
  await db.insert(accounts).values({ name: 'حساب', currencyId: usd });

  const t = await db.insert(tags).values([
    { name: 'در حال انجام', type: 'project_status', statusGroup: 'in_progress' },
    { name: 'تگِ بلااستفاده', type: 'member_role' },
  ]).returning({ id: tags.id });
  usedTag = t[0]!.id; freeTag = t[1]!.id;

  await db.insert(projects).values({
    title: 'پروژه', price: '0', currencyId: eur, statusTagId: usedTag,
  });
});

afterAll(async () => { await sql.end(); });

describe('گاردِ دسترسی', () => {
  it('⚠️ تنظیمات مجوزِ دیدنِ جدا ندارد — بدونِ settings.manage هیچ', async () => {
    await expect(service.getSettings(actor())).rejects.toThrow(ForbiddenError);
    await expect(service.deleteTag(actor(), freeTag)).rejects.toThrow(ForbiddenError);
  });

  it('با مجوز همه‌چیز دیده می‌شود', async () => {
    const data = await service.getSettings(admin());
    expect(data.currencies).toHaveLength(3);
    expect(data.canManage).toBe(true);
  });
});

describe('R-SET-01 — ⚠️ محافظت از ارز', () => {
  it('ارزِ پیش‌فرض حذف نمی‌شود', async () => {
    await expect(service.deleteCurrency(admin(), eur)).rejects.toThrow(CatalogError);
    expect(await db.select().from(currencies).where(eq(currencies.id, eur))).toHaveLength(1);
  });

  it('⚠️ ارزی که روی حساب نشسته حذف نمی‌شود', async () => {
    // وگرنه آن حساب بی‌ارز می‌ماند و مانده‌اش بی‌معنا می‌شد.
    await expect(service.deleteCurrency(admin(), usd)).rejects.toThrow(CatalogError);
  });

  it('ارزِ بلااستفاده حذف می‌شود', async () => {
    await service.deleteCurrency(admin(), unused);
    expect(await db.select().from(currencies).where(eq(currencies.id, unused))).toHaveLength(0);
  });
});

describe('R-SET-02 — ارزِ پیش‌فرضِ یکتا', () => {
  it('⚠️ نشاندنِ پیش‌فرضِ نو، قبلی را پاک می‌کند', async () => {
    await service.setDefaultCurrency(admin(), usd);
    const rows = await db.select().from(currencies);
    expect(rows.filter((c) => c.isDefault).map((c) => c.id)).toEqual([usd]);
  });

  it('ارزِ پیش‌فرض خودبه‌خود فعال می‌شود', async () => {
    const row = (await db.select().from(currencies).where(eq(currencies.id, usd)))[0]!;
    expect(row.isActive).toBe(true);
  });
});

describe('R-SET-03 — نرخِ تبدیل', () => {
  it('نرخِ ارز به خودش و نرخِ صفر رد می‌شوند', async () => {
    await expect(service.saveRate(admin(), {
      fromCurrencyId: eur, toCurrencyId: eur, rate: '1', effectiveDate: '2026-01-01',
    })).rejects.toThrow(CatalogError);

    await expect(service.saveRate(admin(), {
      fromCurrencyId: usd, toCurrencyId: eur, rate: '0', effectiveDate: '2026-01-01',
    })).rejects.toThrow(CatalogError);
  });

  it('نرخِ معتبر ثبت می‌شود', async () => {
    await service.saveRate(admin(), {
      fromCurrencyId: usd, toCurrencyId: eur, rate: '0.9', effectiveDate: '2026-01-01',
    });
    expect(await db.select().from(exchangeRates)).toHaveLength(1);
  });

  it('⚠️ حذفِ ارز نرخ‌هایش را هم می‌برد — نرخِ یتیم نمی‌ماند', async () => {
    const gbp = (await db.insert(currencies).values({ code: 'CHF', name: 'فرانک', symbol: 'F' })
      .returning({ id: currencies.id }))[0]!.id;
    await service.saveRate(admin(), {
      fromCurrencyId: gbp, toCurrencyId: eur, rate: '1.1', effectiveDate: '2026-01-01',
    });
    await service.deleteCurrency(admin(), gbp);
    expect(await db.select().from(exchangeRates)).toHaveLength(1);
  });
});

describe('R-SET-04 — ⚠️ محافظت از تگ', () => {
  it('تگی که وضعیتِ یک پروژه است حذف نمی‌شود', async () => {
    // وگرنه آن پروژه بی‌صدا از تبِ خودش می‌افتاد.
    await expect(service.deleteTag(admin(), usedTag)).rejects.toThrow(CatalogError);
  });

  it('تگِ بلااستفاده حذف می‌شود', async () => {
    await service.deleteTag(admin(), freeTag);
    expect(await db.select().from(tags).where(eq(tags.id, freeTag))).toHaveLength(0);
  });
});

describe('دفتر و طرف‌حساب', () => {
  it('⚠️ دفتر حذف نمی‌شود، غیرفعال می‌شود', async () => {
    // ارجاع‌های قدیمی (ردیفِ دفتر، عضویت) نباید بشکنند.
    const id = await service.saveOffice(admin(), {
      id: null, name: 'دفتر تست', location: '', defaultCurrencyId: null, isActive: true,
    });
    await service.deleteOffice(admin(), id);
    const row = (await db.select().from(offices).where(eq(offices.id, id)))[0]!;
    expect(row.isActive).toBe(false);
  });

  it('نامِ خالی رد می‌شود', async () => {
    await expect(service.saveVendor(financeAdmin(), { id: null, name: '  ', note: '' }))
      .rejects.toThrow(CatalogError);
  });

  it('طرف‌حساب ساخته و حذف می‌شود', async () => {
    const id = await service.saveVendor(financeAdmin(), { id: null, name: 'فروشنده', note: '' });
    await service.deleteVendor(financeAdmin(), id);
    expect(await db.select().from(vendors).where(eq(vendors.id, id))).toHaveLength(0);
  });
});

/**
 * زبانِ پیش‌فرضِ سامانه — پلهٔ دومِ `Core\I18n::current_locale()` (R-I18N-14).
 */
describe('زبانِ پیش‌فرضِ سامانه', () => {
  it('ذخیره و بازخوانی می‌شود', async () => {
    await saveSystemConfig(admin(), { defaultLocale: 'de' });
    expect((await getSystemConfig()).defaultLocale).toBe('de');
  });

  it('زبانِ ناشناخته ذخیره نمی‌شود و به فارسی برمی‌گردد', async () => {
    await saveSystemConfig(admin(), { defaultLocale: 'klingon' });
    expect((await getSystemConfig()).defaultLocale).toBe('fa');
  });

  it('بدونِ مجوز ذخیره نمی‌شود', async () => {
    await expect(saveSystemConfig(actor({ id: 9 }), { defaultLocale: 'en' }))
      .rejects.toBeInstanceOf(ForbiddenError);
  });

  it('⚠️ کاربرِ تازه زبانِ خالی دارد، نه فارسیِ تحمیلی', async () => {
    // این همان چیزی است که پلهٔ دوم را ممکن می‌کند: تا وقتی کاربر خودش
    // انتخاب نکرده، `locale` باید null بماند وگرنه تنظیمِ سراسری هرگز
    // اثر نمی‌کند.
    const [row] = await db.insert(users)
      .values({ email: 'fresh@t', name: 'تازه‌وارد' })
      .returning({ locale: users.locale });
    expect(row!.locale).toBeNull();
  });
});

/**
 * ماتریسِ حسابدار — پورتِ **اثرِ واقعیِ** نقشِ ACCOUNTANT نسخهٔ قبلی:
 * فهرستِ capهایش (class-roles.php) manage_finance + finance_scoped + view_reports
 * + kteam_manage است، ولی Lockdown (class-lockdown.php) حسابدار را فقط به دو
 * صفحهٔ حسابداری و پرداخت‌ها راه می‌دهد؛ تنظیمات (ارز، شرکت) و گزارش‌ها برایش
 * بسته‌اند. طرف‌حساب کاتالوگِ مالی است و از خودِ صفحهٔ حسابداری ساخته می‌شود.
 */
describe('ماتریسِ حسابدار (نقشِ finance)', () => {
  const accountant = () => actor({ id: 1, roles: ['finance'] as Actor['roles'] });

  it('⚠️ حسابدار ارز نمی‌سازد — تنظیمات پشتِ Lockdown است', async () => {
    await expect(service.saveCurrency(accountant(), {
      id: null, code: 'CHF', name: 'فرانک', symbol: '₣', decimals: 2,
    })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('حسابدار طرف‌حساب می‌سازد (کاتالوگِ مالی)', async () => {
    const id = await service.saveVendor(accountant(), { id: null, name: 'هاست‌بان', note: '' });
    expect(id).toBeGreaterThan(0);
    await service.deleteVendor(accountant(), id);
  });

  it('⚠️ همکار با بستهٔ مالی (بدونِ تنظیمات) طرف‌حساب آری، ارز نه', async () => {
    // پورتِ تفکیکِ نسخهٔ قبلی: vendors زیرِ بود و
    // currencies زیرِ
    const staffFinance = actor({ id: 1, permissions: ['finance.view', 'finance.manage'] as Permission[] });
    const id = await service.saveVendor(staffFinance, { id: null, name: 'سرورچی', note: '' });
    expect(id).toBeGreaterThan(0);
    await service.deleteVendor(staffFinance, id);

    await expect(service.saveCurrency(staffFinance, {
      id: null, code: 'NOK', name: 'کرون', symbol: 'kr', decimals: 2,
    })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('⚠️ حسابدار مشخصاتِ شرکت را هم ذخیره نمی‌کند', async () => {
    const { saveCompany } = await import('@/server/people/profile-service');
    await expect(saveCompany(accountant(), {
      name: 'کبرزا', address: '', taxId: '', email: '', phone: '',
      website: '', bank: '', invoiceFooter: '',
    })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('⚠️ حسابدار دوره نمی‌بندد و گزارشِ روزانه را نمی‌گرداند — مالکانه‌اند', async () => {
    const { closePeriod } = await import('@/server/finance/service');
    await expect(closePeriod(accountant(), '2026-01-31'))
      .rejects.toBeInstanceOf(ForbiddenError);

    const { saveReportConfig, getReportConfig } = await import('@/server/scheduler/daily-report');
    await expect(saveReportConfig(accountant(), await getReportConfig()))
      .rejects.toBeInstanceOf(ForbiddenError);
  });
});

