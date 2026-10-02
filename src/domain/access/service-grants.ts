/**
 * دفترِ دسترسی‌های بیرونی — قواعدِ «چه کسی به چه سامانه‌ای دسترسی دارد».
 *
 * چرا این ماژول هست: وقتی کسی از شرکت می‌رود، KabarzaOS دسترسیِ **خودش**
 * را می‌بندد (`member_state`)، ولی حسابِ هوش مصنوعی، ویپ و ذخیره‌سازیِ او
 * بیرون از این سامانه‌اند و باز می‌مانند. تا وقتی جایی ثبت نشده باشد که او
 * چه داشت، کسی هم نمی‌فهمد چه باید بسته شود.
 *
 * ⚠️ این ماژول **راز نگه نمی‌دارد**. نه رمز، نه توکن، نه کلید. فقط دفترِ
 * «چه کسی، کجا، با چه سطحی، از کی». اگر رمزها اینجا می‌آمدند، خودِ
 * KabarzaOS جذاب‌ترین هدفِ نفوذ می‌شد.
 */

import type { MemberState } from '@/domain/people/offboarding';

export const GRANT_LEVELS = ['admin', 'member', 'viewer'] as const;
export type GrantLevel = (typeof GRANT_LEVELS)[number];

/** برچسبِ فارسیِ مبدأ — کلیدِ ترجمه است، نه متنِ نهایی (R-I18N-01). */
export const LEVEL_LABELS: Record<GrantLevel, string> = {
  admin: 'مدیر',
  member: 'کاربر',
  viewer: 'فقط مشاهده',
};

export class AccessError extends Error {
  constructor(
    readonly code:
      | 'name_required'
      | 'service_required'
      | 'user_required'
      | 'service_inactive'
      | 'member_inactive'
      | 'already_revoked'
      | 'not_found'
      | 'amount_invalid'
      | 'currency_required'
      | 'date_invalid'
      | 'has_history',
  ) {
    super(`access rule violated: ${code}`);
    this.name = 'AccessError';
  }
}

export function accessMessage(code: AccessError['code']): string {
  switch (code) {
    case 'name_required': return 'نامِ سرویس را بنویسید.';
    case 'service_required': return 'سرویس را انتخاب کنید.';
    case 'user_required': return 'شخص را انتخاب کنید.';
    case 'service_inactive': return 'این سرویس غیرفعال است؛ اول فعالش کنید.';
    case 'member_inactive': return 'به عضوِ سابق دسترسیِ تازه داده نمی‌شود.';
    case 'already_revoked': return 'این دسترسی پیش‌تر قطع شده بود.';
    case 'not_found': return 'این دسترسی پیدا نشد.';
    case 'amount_invalid': return 'مبلغِ اشتراک معتبر نیست.';
    case 'currency_required': return 'ارزِ اشتراک را انتخاب کنید.';
    case 'date_invalid': return 'تاریخِ تمدیدِ بعدی معتبر نیست.';
    case 'has_history': return 'این سرویس تاریخچهٔ دسترسی دارد و پاک نمی‌شود؛ پیش‌تر غیرفعال شده است.';
  }
}

export interface NewSubscriptionInput {
  amount: string;
  currencyId: number | null;
  intervalUnit: string;
  nextDueDate: string;
}

/**
 * اشتراکِ تازه از فرمِ سرویس — پیش از **هر** نوشتنی سنجیده می‌شود، تا ورودیِ
 * بد نیمه‌کاره چیزی (دسته، هزینه) نسازد و بعد سرویس شکست بخورد.
 *
 * ⚠️ رقمِ فارسی و عربی و جداکنندهٔ هزارگان پذیرفته می‌شوند: این فیلد را
 * فارسی‌زبان با صفحه‌کلیدِ خودش پر می‌کند.
 */
export function normalizeNewSubscription(input: NewSubscriptionInput) {
  const amount = input.amount
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[,،٬\s]/g, '')
    .replace('٫', '.');
  if (!/^\d+(\.\d{1,4})?$/.test(amount) || Number(amount) <= 0) throw new AccessError('amount_invalid');
  if (!input.currencyId) throw new AccessError('currency_required');
  const date = input.nextDueDate.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
    throw new AccessError('date_invalid');
  }
  const unit = (['day', 'week', 'month', 'year'] as const).find((u) => u === input.intervalUnit) ?? 'month';
  return { amount, currencyId: input.currencyId, intervalUnit: unit, nextDueDate: date };
}

export function normalizeLevel(raw: string): GrantLevel {
  return (GRANT_LEVELS as readonly string[]).includes(raw) ? (raw as GrantLevel) : 'member';
}

export function assertServiceName(raw: string): string {
  const name = raw.trim();
  if (!name) throw new AccessError('name_required');
  return name;
}

/** شکلِ کمینهٔ یک گرنت — هر دو لایهٔ سرور و UI همین را می‌بینند. */
export interface GrantLike {
  id: number;
  serviceId: number;
  userId: number;
  level: GrantLevel;
  revokedAt: Date | string | null;
}

export function isOpen(grant: Pick<GrantLike, 'revokedAt'>): boolean {
  return grant.revokedAt === null;
}

export function openGrants<T extends Pick<GrantLike, 'revokedAt'>>(grants: readonly T[]): T[] {
  return grants.filter(isOpen);
}

/**
 * ⚠️ R-ACCESS-03 — اعطای دوباره به کسی که همین حالا گرنتِ **باز** دارد،
 * ردیفِ تازه نمی‌سازد بلکه همان ردیف را به‌روز می‌کند.
 *
 * چرا: شاخصِ یکتای جزئی (`service_grants_open_uq`) درجِ دوم را با خطای
 * دیتابیس رد می‌کند. بدونِ این قاعده، کاربر فقط یک خطای نامفهومِ ۵۰۰
 * می‌دید — درحالی‌که کارِ درست روشن است: همان دسترسی، با سطحِ تازه.
 */
export interface GrantPlan {
  action: 'create' | 'update';
  grantId: number | null;
}

export function planGrant(input: {
  serviceId: number | null;
  userId: number | null;
  serviceActive: boolean;
  memberState: MemberState;
  /** گرنتِ بازِ همین جفت، اگر هست. */
  openGrantId: number | null;
}): GrantPlan {
  if (!input.serviceId) throw new AccessError('service_required');
  if (!input.userId) throw new AccessError('user_required');
  if (!input.serviceActive) throw new AccessError('service_inactive');
  /**
   * ⚠️ به عضوِ سابق دسترسیِ تازه داده نمی‌شود. اگر واقعاً لازم است، اول
   * باید بازفعال شود — وگرنه همان شکافی که این ماژول برای بستنش ساخته شده
   * از راهِ خودِ ماژول باز می‌ماند.
   */
  if (input.memberState !== 'active') throw new AccessError('member_inactive');

  return input.openGrantId
    ? { action: 'update', grantId: input.openGrantId }
    : { action: 'create', grantId: null };
}

/** قطعِ دسترسی — تکرارِ قطع خطاست، نه بی‌اثر؛ وگرنه تاریخِ قطع بازنویسی می‌شد. */
export function assertRevocable(grant: Pick<GrantLike, 'revokedAt'> | undefined): void {
  if (!grant) throw new AccessError('not_found');
  if (!isOpen(grant)) throw new AccessError('already_revoked');
}

/**
 * ⚠️ قلبِ ماژول — عضوِ سابقی که هنوز دسترسیِ باز دارد.
 *
 * KabarzaOS با قفل‌کردنِ حساب کارِ **خودش** را تمام‌شده می‌داند، ولی
 * سرویس‌های بیرونی خبر ندارند. این فهرست همان کارِ نیمه‌تمام است.
 */
export interface OpenRisk {
  userId: number;
  memberState: MemberState;
  grantIds: number[];
}

export function openRisks(
  grants: readonly GrantLike[],
  stateOf: ReadonlyMap<number, MemberState>,
): OpenRisk[] {
  const byUser = new Map<number, OpenRisk>();
  for (const grant of openGrants(grants)) {
    const state = stateOf.get(grant.userId) ?? 'active';
    if (state === 'active') continue;
    const row = byUser.get(grant.userId)
      ?? { userId: grant.userId, memberState: state, grantIds: [] };
    row.grantIds.push(grant.id);
    byUser.set(grant.userId, row);
  }
  // بیشترین دسترسیِ باز اول — همان چیزی که باید زودتر بسته شود.
  return [...byUser.values()].sort((a, b) => b.grantIds.length - a.grantIds.length);
}

/** شمارِ دسترسیِ بازِ هر سرویس — ستونِ «کاربران» در فهرستِ سرویس‌ها. */
/**
 * «حذف» ِ سرویس چه می‌کند.
 *
 * ⚠️ سرویسِ دارای تاریخچه **پاک نمی‌شود**، غیرفعال می‌شود: گرنت‌ها با
 * `on delete cascade` به سرویس بسته‌اند و پاک‌شدنش کلِ «چه کسی از کی به آن
 * دسترسی داشت» را می‌برد — همان پرسشی که این دفتر برای پاسخش هست. تاریخچه
 * یعنی **هر** گرنتی (بسته‌شده هم) یا استفاده در آنبوردینگ (آیتمِ «دسترسی» ِ
 * بی‌سرویس بی‌معنا می‌شد).
 *
 * سرویسِ بی‌تاریخچه (ساختهٔ اشتباهی یا آزمایشی) واقعاً پاک می‌شود؛ پیش از
 * ۱.۱۰۸ این هم فقط غیرفعال می‌شد و دکمهٔ «حذف» کارِ دیگری می‌کرد.
 *
 * `none`: سرویسِ غیرفعالِ دارای تاریخچه — کاری نمانده، دکمه نمی‌آید.
 */
export type ServiceRemoval = 'delete' | 'deactivate' | 'none';

export function planServiceRemoval(s: { isActive: boolean; grantCount: number; onboardingCount: number }): ServiceRemoval {
  if (s.grantCount === 0 && s.onboardingCount === 0) return 'delete';
  return s.isActive ? 'deactivate' : 'none';
}

/** شمارِ **همهٔ** گرنت‌های هر سرویس، بسته‌شده هم — «تاریخچه» برای `planServiceRemoval`. */
export function historyByService(grants: readonly GrantLike[]): Map<number, number> {
  const out = new Map<number, number>();
  for (const grant of grants) out.set(grant.serviceId, (out.get(grant.serviceId) ?? 0) + 1);
  return out;
}

export function countByService(grants: readonly GrantLike[]): Map<number, number> {
  const out = new Map<number, number>();
  for (const grant of openGrants(grants)) {
    out.set(grant.serviceId, (out.get(grant.serviceId) ?? 0) + 1);
  }
  return out;
}

/** شمارِ دسترسیِ بازِ هر شخص. */
export function countByUser(grants: readonly GrantLike[]): Map<number, number> {
  const out = new Map<number, number>();
  for (const grant of openGrants(grants)) {
    out.set(grant.userId, (out.get(grant.userId) ?? 0) + 1);
  }
  return out;
}
