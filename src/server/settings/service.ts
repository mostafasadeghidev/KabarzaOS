import { isGrantableCap } from '@/domain/access/project-scope';
import { cleanI18nMap } from '@/domain/settings/tag-label';
import { and, eq, inArray, isNull, sql, desc } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  accounts, auditLog, currencies, exchangeRates, ledger, offices, projects,
  projectMembers, qaItems, tagRelations, tags, tasks, vendors,
} from '@/db/schema';
import { can, type Actor } from '@/domain/access/permissions';
import { ForbiddenError } from '@/domain/access/guard';
import {
  assertCurrencyDeletable, assertName, assertRateValid, assertTagDeletable,
  planSetDefaultCurrency,
} from '@/domain/settings/catalogs';
import { isValidGroup, supportsClosed, supportsReview } from '@/domain/tags/groups';
import type { TagType } from '@/db/schema/base';

/**
 * سرویسِ فهرست‌های پایه — ارز، نرخ، تگ، دفتر، طرف‌حساب، کتابخانهٔ QA.
 *
 * ⚠️ این‌ها «تنظیمات» به‌نظر می‌رسند ولی حذفِ اشتباهشان دادهٔ زنده را خراب
 * می‌کند؛ برای همین هر حذف پیش از اجرا **شمارشِ استفاده** می‌شود.
 */

export type CatalogKind = 'currencies' | 'tags' | 'offices' | 'vendors' | 'qa';

/**
 * ⚠️ «تنظیمات» عمداً مجوزِ **دیدن** ندارد، فقط `settings.manage` — مثلِ نسخهٔ قبلی
 * که این صفحه مالک‌محور است. هر کس بتواند ببیند، می‌تواند تغییر هم بدهد.
 */
function assertSettings(actor: Actor): void {
  if (!can(actor, 'settings.manage')) throw new ForbiddenError('settings.manage');
}

async function audit(actor: Actor, action: string, objectId: number, before?: unknown, after?: unknown) {
  await db.insert(auditLog).values({
    actorType: 'user',
    actorId: actor.id,
    action,
    objectType: 'settings',
    objectId,
    before: before ?? null,
    after: after ?? null,
  });
}

/* ------------------------------------------------------------------ *
 * خواندن
 * ------------------------------------------------------------------ */

export async function getSettings(actor: Actor) {
  assertSettings(actor);

  const [currencyRows, rateRows, tagRows, officeRows, vendorRows, qaRows] = await Promise.all([
    db.select().from(currencies).orderBy(currencies.id),
    // آخرین نرخِ هر جفت — پورتِ `latest_rates()`؛ تاریخچه می‌ماند ولی فهرست یکی‌یکی است.
    db.selectDistinctOn([exchangeRates.fromCurrencyId, exchangeRates.toCurrencyId], {
      fromCurrencyId: exchangeRates.fromCurrencyId,
      toCurrencyId: exchangeRates.toCurrencyId,
      rate: exchangeRates.rate,
      effectiveDate: exchangeRates.effectiveDate,
    }).from(exchangeRates)
      .orderBy(exchangeRates.fromCurrencyId, exchangeRates.toCurrencyId, desc(exchangeRates.effectiveDate)),
    db.select().from(tags).orderBy(tags.type, tags.sortOrder, tags.id),
    db.select().from(offices).orderBy(offices.name),
    db.select().from(vendors).orderBy(vendors.name),
    db.select().from(qaItems).orderBy(qaItems.sortOrder, qaItems.id),
  ]);

  return {
    currencies: currencyRows,
    rates: rateRows,
    tags: tagRows,
    offices: officeRows,
    vendors: vendorRows,
    qaItems: qaRows,
    canManage: true,
  };
}

/* ------------------------------------------------------------------ *
 * ارز
 * ------------------------------------------------------------------ */

export async function saveCurrency(
  actor: Actor,
  input: { id: number | null; code: string; name: string; symbol: string; decimals: number; isActive?: boolean },
) {
  assertSettings(actor);
  const name = assertName(input.name);
  const code = assertName(input.code).toUpperCase();

  if (input.id) {
    // ⚠️ ارزِ پیش‌فرض غیرفعال نمی‌شود — پایهٔ گزارش است.
    const current = (await db.select({ isDefault: currencies.isDefault }).from(currencies).where(eq(currencies.id, input.id)))[0];
    const isActive = current?.isDefault ? true : (input.isActive ?? true);
    await db.update(currencies)
      .set({ code, name, symbol: input.symbol, decimals: input.decimals, isActive, updatedAt: new Date() })
      .where(eq(currencies.id, input.id));
    await audit(actor, 'currency.update', input.id, null, input);
    return input.id;
  }

  const rows = await db.insert(currencies)
    .values({ code, name, symbol: input.symbol, decimals: input.decimals, isActive: input.isActive ?? true })
    .returning({ id: currencies.id });
  await audit(actor, 'currency.create', rows[0]!.id, null, input);
  return rows[0]!.id;
}

/** ⚠️ R-SET-02 — پیش‌فرضِ یکتا: پرچمِ همه پاک، بعد یکی نشانده می‌شود. */
export async function setDefaultCurrency(actor: Actor, id: number) {
  assertSettings(actor);
  const plan = planSetDefaultCurrency(id);

  await db.transaction(async (tx) => {
    if (plan.clearAll) await tx.update(currencies).set({ isDefault: false });
    await tx.update(currencies)
      .set({ isDefault: true, isActive: plan.alsoActivate, updatedAt: new Date() })
      .where(eq(currencies.id, plan.setId));
  });

  await audit(actor, 'currency.default', id);
}

export async function deleteCurrency(actor: Actor, id: number) {
  assertSettings(actor);

  const rows = await db.select().from(currencies).where(eq(currencies.id, id));
  const currency = rows[0];
  if (!currency) return;

  // ⚠️ شمارشِ استفاده پیش از حذف — حساب، ردیفِ دفتر و پروژه.
  const used = await db.execute(sql`
    select
      (select count(*) from accounts where currency_id = ${id})
      + (select count(*) from ledger where currency_id = ${id})
      + (select count(*) from projects where currency_id = ${id}) as n
  `);
  const usageCount = Number((used as unknown as Array<{ n: number }>)[0]?.n ?? 0);

  assertCurrencyDeletable({ isDefault: currency.isDefault, usageCount });

  await db.delete(exchangeRates).where(sql`
    ${exchangeRates.fromCurrencyId} = ${id} or ${exchangeRates.toCurrencyId} = ${id}
  `);
  await db.delete(currencies).where(eq(currencies.id, id));
  await audit(actor, 'currency.delete', id, currency, null);
}

export async function saveRate(
  actor: Actor,
  input: { fromCurrencyId: number; toCurrencyId: number; rate: string; effectiveDate: string },
) {
  assertSettings(actor);
  assertRateValid(input.fromCurrencyId, input.toCurrencyId, input.rate);

  // ⚠️ همان جفت در همان روز **به‌روز** می‌شود (پورتِ `set_rate` ِ upsert)، نه خطای یکتایی.
  await db.insert(exchangeRates).values(input).onConflictDoUpdate({
    target: [exchangeRates.fromCurrencyId, exchangeRates.toCurrencyId, exchangeRates.effectiveDate],
    set: { rate: input.rate, updatedAt: new Date() },
  });
  await audit(actor, 'rate.create', input.fromCurrencyId, null, input);
}

export async function deleteRate(actor: Actor, fromCurrencyId: number, toCurrencyId: number) {
  assertSettings(actor);
  await db.delete(exchangeRates).where(and(
    eq(exchangeRates.fromCurrencyId, fromCurrencyId),
    eq(exchangeRates.toCurrencyId, toCurrencyId),
  ));
  await audit(actor, 'rate.delete', fromCurrencyId, { fromCurrencyId, toCurrencyId }, null);
}

/* ------------------------------------------------------------------ *
 * تگ
 * ------------------------------------------------------------------ */

export async function saveTag(
  actor: Actor,
  input: {
    id: number | null;
    name: string;
    type: string;
    color: string;
    statusGroup: string;
    isReview: boolean;
    isClosed: boolean;
    sortOrder: number;
    grantsCap?: string;
    nameI18n?: Record<string, string> | null;
  },
) {
  assertSettings(actor);
  const name = assertName(input.name);

  const values = {
    name,
    type: input.type as 'member_role',
    color: input.color,
    /**
     * ⚠️ معنیِ `status_group` به نوعِ تگ بستگی دارد (ستونِ کانبان، تبِ
     * خط‌لوله، یا جهتِ حسابداری). مقدارِ بیرون از فهرستِ همان نوع دور
     * ریخته می‌شود، وگرنه یک رشتهٔ ساختگی تگ را از هر دسته‌بندی‌ای بیرون
     * می‌اندازد و کاربر فقط می‌بیند تگش «ناپدید» شده.
     */
    statusGroup: isValidGroup(input.type as TagType, input.statusGroup)
      ? input.statusGroup
      : '',
    /** فقط وضعیتِ تسک ستونِ بررسی دارد. */
    isReview: supportsReview(input.type as TagType) && input.isReview,
    /** «تمام‌شده» فقط برای وضعیتِ تسک و پروژه معنا دارد. */
    isClosed: supportsClosed(input.type as TagType) && input.isClosed,
    sortOrder: input.sortOrder,
    /**
     * ⚠️ فقط مقدارِ شناخته‌شده ذخیره می‌شود و فقط روی تگِ **نقشِ عضو**.
     * مقدارِ دلخواه اینجا یعنی کسی می‌تواند با یک رشتهٔ ساختگی اختیارِ
     * مدیریت بسازد؛ و تگِ وضعیت اصلاً جای دسترسی نیست.
     */
    grantsCap: input.type === 'member_role' && isGrantableCap(input.grantsCap ?? '')
      ? (input.grantsCap ?? '')
      : '',
    /**
     * ⚠️ نگاشتِ خالی `null` ذخیره می‌شود، نه `{}`: در پرس‌وجو تفاوتی ندارد
     * ولی ردیف‌های قدیمی هم `null`اند و دو شکلِ «هیچ» گیج‌کننده است.
     */
    nameI18n: (() => {
      const clean = cleanI18nMap(input.nameI18n);
      return Object.keys(clean).length > 0 ? clean : null;
    })(),
  };

  if (input.id) {
    await db.update(tags).set({ ...values, updatedAt: new Date() }).where(eq(tags.id, input.id));
    await audit(actor, 'tag.update', input.id, null, input);
    return input.id;
  }

  const rows = await db.insert(tags).values(values).returning({ id: tags.id });
  await audit(actor, 'tag.create', rows[0]!.id, null, input);
  return rows[0]!.id;
}

export async function deleteTag(actor: Actor, id: number) {
  assertSettings(actor);

  // ⚠️ شمارشِ استفاده در همهٔ جاهایی که یک تگ می‌تواند بنشیند.
  const used = await db.execute(sql`
    select
      (select count(*) from tag_relations where tag_id = ${id})
      + (select count(*) from projects where status_tag_id = ${id})
      + (select count(*) from tasks where status_tag_id = ${id} or priority_tag_id = ${id})
      + (select count(*) from project_members where role_tag_id = ${id}) as n
  `);
  const [tag] = await db.select({ isProtected: tags.isProtected })
    .from(tags).where(eq(tags.id, id));

  assertTagDeletable(
    Number((used as unknown as Array<{ n: number }>)[0]?.n ?? 0),
    tag?.isProtected === true,
  );

  await db.delete(tags).where(eq(tags.id, id));
  await audit(actor, 'tag.delete', id);
}

/* ------------------------------------------------------------------ *
 * دفتر · طرف‌حساب · کتابخانهٔ QA
 * ------------------------------------------------------------------ */

export async function saveOffice(
  actor: Actor,
  input: {
    id: number | null; name: string; location: string;
    defaultCurrencyId: number | null; isActive: boolean;
  },
) {
  assertSettings(actor);
  const name = assertName(input.name);
  /**
   * ⚠️ `isActive` از فرم می‌آید تا دفترِ غیرفعال دوباره فعال شود. حذفِ
   * دفتر آن را `false` می‌کند (ارجاع‌های قدیمی نباید بشکنند) و پیش از این
   * هیچ راهی برای برگرداندن نبود — یعنی حذف عملاً برگشت‌ناپذیر بود.
   */
  const values = {
    name, location: input.location,
    defaultCurrencyId: input.defaultCurrencyId,
    isActive: input.isActive,
  };

  if (input.id) {
    await db.update(offices).set({ ...values, updatedAt: new Date() }).where(eq(offices.id, input.id));
    await audit(actor, 'office.update', input.id, null, input);
    return input.id;
  }
  const rows = await db.insert(offices).values(values).returning({ id: offices.id });
  await audit(actor, 'office.create', rows[0]!.id, null, input);
  return rows[0]!.id;
}

export async function deleteOffice(actor: Actor, id: number) {
  assertSettings(actor);
  // دفتر حذفِ نرم ندارد؛ به‌جای حذف غیرفعال می‌شود تا ارجاع‌ها نشکنند.
  await db.update(offices).set({ isActive: false, updatedAt: new Date() }).where(eq(offices.id, id));
  await audit(actor, 'office.deactivate', id);
}

export async function saveVendor(
  actor: Actor,
  input: { id: number | null; name: string; note: string },
) {
  // ⚠️ طرف‌حساب کاتالوگِ **مالی** است، نه تنظیمات: در نسخهٔ قبلی زیرِ
  // بود، پس همکاری که فقط بستهٔ مالی دارد هم باید
  // بتواند — با گاردِ تنظیمات، او بیرون می‌ماند.
  if (!can(actor, 'finance.manage')) throw new ForbiddenError('finance.manage');
  const name = assertName(input.name);

  if (input.id) {
    await db.update(vendors).set({ name, note: input.note, updatedAt: new Date() })
      .where(eq(vendors.id, input.id));
    await audit(actor, 'vendor.update', input.id, null, input);
    return input.id;
  }
  const rows = await db.insert(vendors).values({ name, note: input.note })
    .returning({ id: vendors.id });
  await audit(actor, 'vendor.create', rows[0]!.id, null, input);
  return rows[0]!.id;
}

export async function deleteVendor(actor: Actor, id: number) {
  // ⚠️ همان گاردِ ساخت — کاتالوگِ مالی ( در نسخهٔ قبلی).
  if (!can(actor, 'finance.manage')) throw new ForbiddenError('finance.manage');
  await db.delete(vendors).where(eq(vendors.id, id));
  await audit(actor, 'vendor.delete', id);
}

export async function saveQaItem(
  actor: Actor,
  input: {
    id: number | null;
    title: string;
    description: string;
    roleTagId: number | null;
    isTask: boolean;
    sortOrder: number;
  },
) {
  assertSettings(actor);
  const title = assertName(input.title);
  const values = {
    title,
    description: input.description,
    roleTagId: input.roleTagId,
    isTask: input.isTask,
    sortOrder: input.sortOrder,
  };

  if (input.id) {
    await db.update(qaItems).set({ ...values, updatedAt: new Date() }).where(eq(qaItems.id, input.id));
    await audit(actor, 'qa.update', input.id, null, input);
    return input.id;
  }
  const rows = await db.insert(qaItems).values(values).returning({ id: qaItems.id });
  await audit(actor, 'qa.create', rows[0]!.id, null, input);
  return rows[0]!.id;
}

export async function deleteQaItem(actor: Actor, id: number) {
  assertSettings(actor);
  // ⚠️ ردیف‌های پروژه‌ها می‌مانند — عنوانشان عکسِ لحظه‌ای است (R-PROJ-28).
  await db.delete(qaItems).where(eq(qaItems.id, id));
  await audit(actor, 'qa.delete', id);
}

export { inArray, isNull, tagRelations, projectMembers, tasks, ledger, accounts, projects };
