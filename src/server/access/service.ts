import { and, asc, desc, eq, getTableColumns, inArray, isNull, ne, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  auditLog, currencies, onboardingItems, onboardingTasks, recurringExpenses, serviceGrants, services, tags,
  userRoles, users,
} from '@/db/schema';
import { tagName } from '@/db/tag-name';
import { currentLocale } from '@/i18n/server';
import { can, canManageSection, type Actor } from '@/domain/access/permissions';
import { assertCan, assertCanManage, assertCanView } from '@/domain/access/guard';
import {
  AccessError, assertRevocable, assertServiceName, countByService, historyByService, normalizeLevel,
  normalizeNewSubscription, openRisks, planGrant, planServiceRemoval,
  type GrantLevel, type NewSubscriptionInput, type ServiceRemoval,
} from '@/domain/access/service-grants';
import { localParts } from '@/domain/scheduler/tick';
import { saveRecurring } from '@/server/finance/payouts';
import { saveTag } from '@/server/settings/service';
import { getSystemConfig } from '@/server/settings/system-service';
import {
  monthlyEquivalent, perUserCost, totalsByCurrency, type IntervalUnit,
} from '@/domain/access/service-cost';
import { notify } from '@/server/notifications/service';
import type { MemberState } from '@/domain/people/offboarding';

/**
 * دفترِ دسترسی‌های بیرونی.
 *
 * ⚠️ گاردها اینجا هستند، نه در صفحه (R-ARCH-01): خواندن با `members.view`
 * و نوشتن با `members.manage` — این پروندهٔ پرسنلی است، پس همان کسی که
 * اعضا را اداره می‌کند دسترسی‌هایشان را هم اداره می‌کند.
 */

async function audit(
  actor: Actor, action: string, objectType: string, objectId: number,
  before?: unknown, after?: unknown,
) {
  await db.insert(auditLog).values({
    actorType: 'user',
    actorId: actor.id,
    action,
    objectType,
    objectId,
    before: before ?? null,
    after: after ?? null,
  });
}

/* ------------------------------------------------------------------ *
 * خواندن
 * ------------------------------------------------------------------ */

export async function accessBoard(actor: Actor) {
  assertCanView(actor, 'members');
  const locale = await currentLocale();

  const [serviceRows, grantRows, peopleRows, categoryRows] = await Promise.all([
    /**
     * دسته از تگ می‌آید (نوعِ `service_category`)، به زبانِ بیننده.
     * ⚠️ `leftJoin`: سرویسِ بی‌دسته هم باید در فهرست بماند.
     */
    db.select({
      ...getTableColumns(services),
      categoryName: sql<string | null>`${tagName(locale)}`,
      categoryColor: tags.color,
    })
      .from(services)
      .leftJoin(tags, eq(tags.id, services.categoryTagId))
      .orderBy(asc(services.name)),

    db.select({
      id: serviceGrants.id,
      serviceId: serviceGrants.serviceId,
      userId: serviceGrants.userId,
      accountRef: serviceGrants.accountRef,
      level: serviceGrants.level,
      vaultRef: serviceGrants.vaultRef,
      note: serviceGrants.note,
      grantedAt: serviceGrants.grantedAt,
      revokedAt: serviceGrants.revokedAt,
      userName: users.name,
      memberState: users.memberState,
    })
      .from(serviceGrants)
      .innerJoin(users, eq(users.id, serviceGrants.userId))
      // بازها اول — کاری که مانده، بالای فهرست.
      .orderBy(sql`${serviceGrants.revokedAt} asc nulls first`, sql`${serviceGrants.grantedAt} desc`),

    /**
     * ⚠️ کارفرمایان عمداً بیرون‌اند: آن‌ها کاربرِ بیرونی‌اند و به سامانه‌های
     * داخلیِ شرکت دسترسی نمی‌گیرند. هر کاربرِ دیگری — عضو، همکارِ ادمین،
     * مالی و خودِ مالک — می‌تواند در این دفتر ردیف داشته باشد.
     */
    db.selectDistinct({
      id: users.id,
      name: users.name,
      memberState: users.memberState,
    })
      .from(users)
      .innerJoin(userRoles, eq(userRoles.userId, users.id))
      .where(and(isNull(users.deletedAt), ne(userRoles.role, 'client')))
      .orderBy(asc(users.name)),

    // گزینه‌های «دسته» در فرمِ سرویس — به ترتیبی که در تنظیمات چیده شده.
    db.select({ id: tags.id, name: tagName(locale), color: tags.color })
      .from(tags)
      .where(eq(tags.type, 'service_category'))
      .orderBy(asc(tags.sortOrder), asc(tags.id)),
  ]);

  const stateOf = new Map<number, MemberState>(
    peopleRows.map((p) => [p.id, p.memberState as MemberState]),
  );
  const counts = countByService(grantRows);

  /**
   * ⚠️ هزینه دادهٔ **مالی** است و گاردِ خودش را دارد: کسی که اعضا را اداره
   * می‌کند لزوماً حق ندارد مبلغِ اشتراک‌ها را ببیند. بی‌این مجوز، نه ستونِ
   * هزینه می‌آید و نه فهرستِ اشتراک‌ها اصلاً خوانده می‌شود.
   */
  const canSeeCost = can(actor, 'finance.view');
  const subscriptions = canSeeCost ? await db.select({
    id: recurringExpenses.id,
    title: recurringExpenses.title,
    amount: recurringExpenses.amount,
    currencyId: recurringExpenses.currencyId,
    currencyCode: currencies.code,
    intervalUnit: recurringExpenses.intervalUnit,
    intervalCount: recurringExpenses.intervalCount,
    isActive: recurringExpenses.isActive,
  })
    .from(recurringExpenses)
    .leftJoin(currencies, eq(currencies.id, recurringExpenses.currencyId))
    .orderBy(asc(recurringExpenses.title)) : [];

  const subById = new Map(subscriptions.map((r) => [r.id, r]));

  // تاریخچهٔ هر سرویس — دکمهٔ «حذف» با آن می‌داند پاک می‌کند یا غیرفعال (planServiceRemoval).
  const history = historyByService(grantRows);
  const onboardingUse = await onboardingUseByService();

  const serviceViews = serviceRows.map((s) => {
    const openCount = counts.get(s.id) ?? 0;
    const grantCount = history.get(s.id) ?? 0;
    const onboardingCount = onboardingUse.get(s.id) ?? 0;
    const sub = s.recurringExpenseId ? subById.get(s.recurringExpenseId) : undefined;
    if (!sub) return { ...s, openCount, grantCount, onboardingCount, cost: null };
    const monthly = monthlyEquivalent(sub.amount, sub.intervalUnit as IntervalUnit, sub.intervalCount);
    return {
      ...s,
      openCount,
      grantCount,
      onboardingCount,
      cost: {
        subscriptionId: sub.id,
        title: sub.title,
        monthly,
        perUser: perUserCost(monthly, openCount),
        currencyId: sub.currencyId,
        currencyCode: sub.currencyCode ?? '',
        subscriptionActive: sub.isActive,
      },
    };
  });

  /**
   * ⚠️ جمع بر اساسِ **اشتراکِ فعال** است، نه سرویسِ فعال: سرویسی که
   * غیرفعالش کرده‌ای ولی اشتراکش هنوز تمدید می‌شود، دقیقاً همان پولی است
   * که باید ببینی.
   */
  const totals = totalsByCurrency(
    serviceViews
      .filter((s) => s.cost?.subscriptionActive)
      .map((s) => ({ currencyId: s.cost!.currencyId, monthly: s.cost!.monthly })),
  );
  const codeOf = new Map(subscriptions.map((r) => [r.currencyId, r.currencyCode ?? '']));

  /**
   * «+ اشتراکِ تازه» در فرمِ سرویس یک هزینهٔ دوره‌ای می‌سازد، پس همان گاردِ
   * ساختنش در مالی را دارد (`finance.manage`) — دیدنِ مبلغ کافی نیست.
   */
  const canCreateSubscription = canManageSection(actor, 'finance');
  const currencyRows = canCreateSubscription
    ? await db.select({ id: currencies.id, code: currencies.code, isDefault: currencies.isDefault })
      .from(currencies).where(eq(currencies.isActive, true)).orderBy(asc(currencies.id))
    : [];

  return {
    services: serviceViews,
    categories: categoryRows,
    /** پیوندِ «مدیریتِ دسته‌ها» فقط برای کسی که تنظیمات را اداره می‌کند. */
    canManageCategories: can(actor, 'settings.manage'),
    grants: grantRows,
    people: peopleRows,
    /** عضوِ سابقی که هنوز دسترسیِ باز دارد — همان کارِ نیمه‌تمام. */
    risks: openRisks(grantRows, stateOf),
    canManage: canManageSection(actor, 'members'),
    canSeeCost,
    subscriptions,
    costTotals: [...totals].map(([currencyId, monthly]) => ({
      currencyId, monthly, currencyCode: codeOf.get(currencyId) ?? '',
    })),
    canCreateSubscription,
    currencies: currencyRows,
    /** پیش‌فرضِ «تمدیدِ بعدی» — امروز به منطقهٔ زمانیِ سامانه. */
    today: localParts(new Date(), (await getSystemConfig()).timezone || 'UTC').date,
  };
}

/**
 * دسترسی‌های خودِ کاربر — فقط‌خواندنی، بی‌مجوزِ خاص.
 * هرکس باید بتواند ببیند به چه چیزهایی دسترسی دارد.
 */
export async function myGrants(actor: Actor) {
  return db.select({
    id: serviceGrants.id,
    serviceName: services.name,
    level: serviceGrants.level,
    accountRef: serviceGrants.accountRef,
    grantedAt: serviceGrants.grantedAt,
  })
    .from(serviceGrants)
    .innerJoin(services, eq(services.id, serviceGrants.serviceId))
    .where(and(eq(serviceGrants.userId, actor.id), isNull(serviceGrants.revokedAt)))
    .orderBy(asc(services.name));
}

/**
 * شمارِ دسترسیِ بازِ چند نفر — برای بجِ «دسترسیِ باز» روی کارتِ عضو.
 * گاردش همان گاردِ فهرستِ افراد است، پس فراخوان چیزی بیش از حقش نمی‌بیند.
 */
export async function openGrantCounts(
  actor: Actor,
  userIds: readonly number[],
): Promise<Map<number, number>> {
  assertCanView(actor, 'members');
  if (userIds.length === 0) return new Map();

  const rows = await db.select({
    userId: serviceGrants.userId,
    n: sql<number>`count(*)::int`,
  })
    .from(serviceGrants)
    .where(and(inArray(serviceGrants.userId, [...userIds]), isNull(serviceGrants.revokedAt)))
    .groupBy(serviceGrants.userId);

  return new Map(rows.map((r) => [r.userId, r.n]));
}

/* ------------------------------------------------------------------ *
 * سرویس‌ها
 * ------------------------------------------------------------------ */

export interface ServiceInput {
  id: number | null;
  name: string;
  /** تگی از نوعِ `service_category`؛ `null` یعنی بی‌دسته. */
  categoryTagId: number | null;
  ownerUserId: number | null;
  adminUrl: string;
  note: string;
  isActive: boolean;
  /** اشتراکِ متناظر در ماژولِ مالی؛ فقط با `finance.view` قابلِ تغییر. */
  recurringExpenseId?: number | null;
  /** «+ دستهٔ تازه» — دسته با همین نام پیدا یا ساخته می‌شود (`settings.manage`). */
  newCategoryName?: string;
  /** «+ اشتراکِ تازه» — هزینهٔ دوره‌ای ساخته و وصل می‌شود (`finance.manage`). */
  newSubscription?: NewSubscriptionInput | null;
}

/**
 * نوعِ تگِ دستهٔ سرویس. ⚠️ ثابت، نه رشتهٔ درجا: تستِ نگاشتِ اعلان‌ها هر
 * `type: '…'` ِ درجا در کدِ سرور را «نوعِ اعلان» می‌شمارد.
 */
const SERVICE_CATEGORY = 'service_category' as const;

/**
 * دستهٔ سرویس به نام: همان‌نامِ موجود، یا تازه.
 * ⚠️ گاردِ خودِ «تگ‌ها» (`settings.manage`): این میان‌بر راهِ دوم به همان کار
 * است، نه دری که کسِ دیگری را به تنظیمات راه بدهد.
 */
async function findOrCreateServiceCategory(actor: Actor, raw: string): Promise<number> {
  assertCan(actor, 'settings.manage');
  const name = raw.trim().slice(0, 100);
  const [existing] = await db.select({ id: tags.id }).from(tags)
    .where(and(eq(tags.type, SERVICE_CATEGORY), sql`lower(${tags.name}) = lower(${name})`))
    .limit(1);
  if (existing) return existing.id;
  const [last] = await db.select({ n: sql<number>`coalesce(max(${tags.sortOrder}), 0)::int` }).from(tags)
    .where(eq(tags.type, SERVICE_CATEGORY));
  return saveTag(actor, {
    id: null, name, type: SERVICE_CATEGORY, color: '', statusGroup: '',
    isReview: false, isClosed: false, sortOrder: (last?.n ?? 0) + 1,
  });
}

/**
 * سرویس به نام — برای «+ ساختِ سرویسِ تازه» در کتابخانهٔ آنبوردینگ.
 *
 * ⚠️ نامِ تکراری سرویسِ دوم نمی‌سازد: همان‌نامِ موجود برگردانده می‌شود، و اگر
 * غیرفعال بود دوباره فعال می‌شود (همان کسی که حالا به آن نیاز دارد). دو
 * «Figma» یعنی دسترسی‌های یک سامانه در دو ردیف، و قطعِ دسترسی یکی را جا می‌انداخت.
 */
export async function findOrCreateService(actor: Actor, raw: string): Promise<number> {
  assertCanManage(actor, 'members');
  const name = assertServiceName(raw).slice(0, 200);
  const [existing] = await db.select({ id: services.id, isActive: services.isActive }).from(services)
    .where(sql`lower(${services.name}) = lower(${name})`)
    .orderBy(desc(services.isActive), asc(services.id))
    .limit(1);
  if (existing) {
    if (!existing.isActive) {
      await db.update(services).set({ isActive: true, updatedAt: new Date() }).where(eq(services.id, existing.id));
      await audit(actor, 'service.update', 'service', existing.id, { isActive: false }, { isActive: true });
    }
    return existing.id;
  }
  const [row] = await db.insert(services).values({ name }).returning({ id: services.id });
  await audit(actor, 'service.create', 'service', row!.id, null, { name });
  return row!.id;
}

export async function saveService(actor: Actor, input: ServiceInput) {
  assertCanManage(actor, 'members');
  const name = assertServiceName(input.name);

  /*
   * ⚠️ ترتیب: اول هر چه ممکن است رد شود سنجیده می‌شود (نام، گاردها، اشتراکِ
   * تازه)، بعد ساختن. وگرنه مبلغِ نادرست پس از ساختنِ دسته رد می‌شد و دستهٔ
   * بی‌سرویس جا می‌ماند.
   */
  const newCategory = input.newCategoryName?.trim() ?? '';
  if (newCategory) assertCan(actor, 'settings.manage');
  const newSub = input.newSubscription ? normalizeNewSubscription(input.newSubscription) : null;
  if (newSub) assertCanManage(actor, 'finance');

  if (newCategory) input = { ...input, categoryTagId: await findOrCreateServiceCategory(actor, newCategory) };
  if (newSub) {
    const recurringExpenseId = await saveRecurring(actor, {
      id: null,
      title: name,
      amount: newSub.amount,
      currencyId: newSub.currencyId,
      kind: 'recurring',
      intervalUnit: newSub.intervalUnit,
      intervalCount: 1,
      startDate: newSub.nextDueDate,
      nextDueDate: newSub.nextDueDate,
      accountId: null,
      vendorId: null,
      // فروشنده همان سرویس است — در گزارشِ هزینه‌ها با نامِ خودش می‌آید.
      vendorName: name,
    });
    input = { ...input, recurringExpenseId };
  }

  /**
   * ⚠️ کسی که هزینه را نمی‌بیند، فرمش هم این فیلد را ندارد؛ پس مقدارش
   * `null` می‌رسد. اگر همان را ذخیره می‌کردیم، هر ویرایشِ سادهٔ نامِ سرویس
   * توسطِ مدیرِ اعضا بی‌صدا اتصالِ مالی را پاک می‌کرد.
   */
  const keepCost = !can(actor, 'finance.view');
  const [existing] = input.id
    ? await db.select({ recurringExpenseId: services.recurringExpenseId })
      .from(services).where(eq(services.id, input.id))
    : [];

  /**
   * ⚠️ فقط تگی از نوعِ «دستهٔ سرویس» پذیرفته می‌شود و شناسهٔ دیگر بی‌دسته
   * می‌شود — مثلِ دستهٔ ناشناخته که پیش‌تر «سایر» می‌شد. اگر مثلاً یک نقشِ
   * عضو اینجا می‌نشست، آن نقش هم دیگر در تنظیمات حذف‌شدنی نبود.
   */
  const [category] = input.categoryTagId
    ? await db.select({ id: tags.id }).from(tags)
      .where(and(eq(tags.id, input.categoryTagId), eq(tags.type, 'service_category')))
    : [];

  const values = {
    name,
    categoryTagId: category?.id ?? null,
    ownerUserId: input.ownerUserId,
    adminUrl: input.adminUrl.trim(),
    note: input.note.trim(),
    isActive: input.isActive,
    recurringExpenseId: keepCost
      ? (existing?.recurringExpenseId ?? null)
      : (input.recurringExpenseId ?? null),
  };

  if (input.id) {
    await db.update(services).set({ ...values, updatedAt: new Date() })
      .where(eq(services.id, input.id));
    await audit(actor, 'service.update', 'service', input.id, null, values);
    return input.id;
  }
  const rows = await db.insert(services).values(values).returning({ id: services.id });
  await audit(actor, 'service.create', 'service', rows[0]!.id, null, values);
  return rows[0]!.id;
}

/** شمارِ استفادهٔ هر سرویس در آنبوردینگ (آیتمِ کتابخانه + کارِ اعضا). */
async function onboardingUseByService(serviceId?: number): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  for (const table of [onboardingItems, onboardingTasks]) {
    const rows = await db.select({ id: table.serviceId, n: sql<number>`count(*)::int` }).from(table)
      .where(serviceId ? eq(table.serviceId, serviceId) : sql`${table.serviceId} is not null`)
      .groupBy(table.serviceId);
    for (const r of rows) if (r.id) out.set(r.id, (out.get(r.id) ?? 0) + r.n);
  }
  return out;
}

/**
 * «حذف» ِ سرویس: بی‌تاریخچه پاک می‌شود، با تاریخچه غیرفعال (`planServiceRemoval`).
 *
 * ⚠️ شمارش و پاک‌کردن در یک تراکنش، با قفلِ ردیفِ سرویس: گرنتِ تازه برای
 * کلیدِ خارجی‌اش همان ردیف را قفل می‌کند، پس میانِ «تاریخچه ندارد» و «پاک شد»
 * کسی نمی‌تواند دسترسی‌ای ثبت کند که بی‌صدا با cascade برود.
 *
 * اشتراکِ مالیِ وصل‌شده دست نمی‌خورد: هزینهٔ دوره‌ای در «مالی» می‌ماند.
 */
export async function deleteService(actor: Actor, id: number): Promise<ServiceRemoval> {
  assertCanManage(actor, 'members');
  const outcome = await db.transaction(async (tx) => {
    const [svc] = await tx.select({ isActive: services.isActive }).from(services)
      .where(eq(services.id, id)).for('update');
    if (!svc) throw new AccessError('not_found');
    const [{ n: grantCount } = { n: 0 }] = await tx.select({ n: sql<number>`count(*)::int` })
      .from(serviceGrants).where(eq(serviceGrants.serviceId, id));
    const onboardingCount = (await onboardingUseByService(id)).get(id) ?? 0;

    const plan = planServiceRemoval({ isActive: svc.isActive, grantCount, onboardingCount });
    if (plan === 'none') throw new AccessError('has_history');
    if (plan === 'delete') await tx.delete(services).where(eq(services.id, id));
    else await tx.update(services).set({ isActive: false, updatedAt: new Date() }).where(eq(services.id, id));
    return plan;
  });
  await audit(actor, outcome === 'delete' ? 'service.delete' : 'service.deactivate', 'service', id);
  return outcome;
}

/* ------------------------------------------------------------------ *
 * اعطا و قطع
 * ------------------------------------------------------------------ */

export interface GrantInput {
  serviceId: number | null;
  userId: number | null;
  accountRef: string;
  level: string;
  vaultRef: string;
  note: string;
}

export async function grantAccess(actor: Actor, input: GrantInput) {
  assertCanManage(actor, 'members');

  const [service] = input.serviceId
    ? await db.select({ isActive: services.isActive }).from(services)
      .where(eq(services.id, input.serviceId))
    : [];
  const [person] = input.userId
    ? await db.select({ memberState: users.memberState }).from(users)
      .where(and(eq(users.id, input.userId), isNull(users.deletedAt)))
    : [];
  const [existing] = input.serviceId && input.userId
    ? await db.select({ id: serviceGrants.id }).from(serviceGrants)
      .where(and(
        eq(serviceGrants.serviceId, input.serviceId),
        eq(serviceGrants.userId, input.userId),
        isNull(serviceGrants.revokedAt),
      ))
    : [];

  const plan = planGrant({
    serviceId: input.serviceId,
    userId: input.userId,
    serviceActive: Boolean(service?.isActive),
    // کاربرِ ناموجود مثلِ عضوِ سابق رد می‌شود، نه با خطای مبهم.
    memberState: (person?.memberState ?? 'locked') as MemberState,
    openGrantId: existing?.id ?? null,
  });

  const values = {
    accountRef: input.accountRef.trim(),
    level: normalizeLevel(input.level) as GrantLevel,
    vaultRef: input.vaultRef.trim(),
    note: input.note.trim(),
  };

  if (plan.action === 'update') {
    await db.update(serviceGrants).set({ ...values, updatedAt: new Date() })
      .where(eq(serviceGrants.id, plan.grantId!));
    await audit(actor, 'service_grant.update', 'service_grant', plan.grantId!, null, values);
    return plan.grantId!;
  }

  const rows = await db.insert(serviceGrants).values({
    serviceId: input.serviceId!,
    userId: input.userId!,
    grantedBy: actor.id,
    ...values,
  }).returning({ id: serviceGrants.id });
  await audit(actor, 'service_grant.create', 'service_grant', rows[0]!.id, null, {
    ...values, serviceId: input.serviceId, userId: input.userId,
  });
  return rows[0]!.id;
}

/**
 * قطعِ گروهی — چک‌لیستِ خروجِ عضو با یک دکمه بسته می‌شود.
 *
 * ⚠️ ردیفِ قبلاً قطع‌شده **نادیده گرفته می‌شود**، نه اینکه کلِ کار بیفتد:
 * چک‌لیست از روی دادهٔ لحظه‌ای ساخته می‌شود و ممکن است همکارِ دیگری
 * هم‌زمان یکی را بسته باشد. خطاداکردنِ کلِ عملیات یعنی هیچ‌کدام بسته نشود.
 */
export async function revokeMany(actor: Actor, grantIds: number[]): Promise<number> {
  assertCanManage(actor, 'members');
  const ids = [...new Set(grantIds.filter((id) => Number.isInteger(id) && id > 0))];
  if (ids.length === 0) return 0;

  const open = await db.select({ id: serviceGrants.id })
    .from(serviceGrants)
    .where(and(inArray(serviceGrants.id, ids), isNull(serviceGrants.revokedAt)));
  if (open.length === 0) return 0;

  const now = new Date();
  await db.update(serviceGrants)
    .set({ revokedAt: now, revokedBy: actor.id, updatedAt: now })
    .where(inArray(serviceGrants.id, open.map((r) => r.id)));

  for (const row of open) {
    await audit(actor, 'service_grant.revoke', 'service_grant', row.id);
  }
  return open.length;
}

/**
 * وقتی عضوی سابق می‌شود، مسئولِ هر سرویس خبر می‌گیرد که دسترسی‌اش را ببندد.
 *
 * ⚠️ خودِ گرنت‌ها بسته **نمی‌شوند**: قطعِ واقعی در پنلِ همان سرویس انجام
 * می‌شود و بستنِ خودکارِ ردیف یعنی دفتر بگوید «بسته شد» درحالی‌که حساب
 * هنوز باز است — بدتر از ثبت‌نکردن.
 *
 * ⚠️ شکستِ اعلان نباید off-boarding را بشکند؛ فراخوان در try/catch است.
 */
export async function notifyRevocationNeeded(userId: number): Promise<number> {
  const rows = await db.select({
    grantId: serviceGrants.id,
    serviceName: services.name,
    ownerUserId: services.ownerUserId,
    personName: users.name,
  })
    .from(serviceGrants)
    .innerJoin(services, eq(services.id, serviceGrants.serviceId))
    .innerJoin(users, eq(users.id, serviceGrants.userId))
    .where(and(eq(serviceGrants.userId, userId), isNull(serviceGrants.revokedAt)));

  if (rows.length === 0) return 0;

  // یک اعلان به ازای هر مسئول، با فهرستِ سرویس‌هایش — نه یکی به ازای هر ردیف.
  const byOwner = new Map<number, string[]>();
  for (const row of rows) {
    if (!row.ownerUserId) continue;
    byOwner.set(row.ownerUserId, [...(byOwner.get(row.ownerUserId) ?? []), row.serviceName]);
  }

  for (const [ownerId, names] of byOwner) {
    await notify([ownerId], {
      type: 'access.revoke_needed',
      title: 'دسترسی‌های {person} را ببندید',
      body: '{services}',
      params: { person: rows[0]!.personName, services: names.join(' · ') },
      url: '/access?user=' + userId,
    });
  }
  return rows.length;
}

/** ⚠️ قطع یعنی مهرِ زمان، نه حذفِ ردیف (R-ACCESS-01) — تاریخچه باید بماند. */
export async function revokeAccess(actor: Actor, grantId: number) {
  assertCanManage(actor, 'members');

  const [grant] = await db.select({
    id: serviceGrants.id,
    revokedAt: serviceGrants.revokedAt,
    serviceId: serviceGrants.serviceId,
    userId: serviceGrants.userId,
  }).from(serviceGrants).where(eq(serviceGrants.id, grantId));

  assertRevocable(grant);

  await db.update(serviceGrants)
    .set({ revokedAt: new Date(), revokedBy: actor.id, updatedAt: new Date() })
    .where(eq(serviceGrants.id, grantId));
  await audit(actor, 'service_grant.revoke', 'service_grant', grantId, grant, null);
}
