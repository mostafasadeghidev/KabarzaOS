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

export const SERVICE_KINDS = [
  'ai', 'voip', 'storage', 'email', 'design', 'dev', 'social', 'finance', 'other',
] as const;
export type ServiceKind = (typeof SERVICE_KINDS)[number];

export const GRANT_LEVELS = ['admin', 'member', 'viewer'] as const;
export type GrantLevel = (typeof GRANT_LEVELS)[number];

/** برچسبِ فارسیِ مبدأ — کلیدِ ترجمه است، نه متنِ نهایی (R-I18N-01). */
export const KIND_LABELS: Record<ServiceKind, string> = {
  ai: 'هوش مصنوعی',
  voip: 'ویپ و تلفن',
  storage: 'ذخیره‌سازی',
  email: 'ایمیل',
  design: 'طراحی',
  dev: 'توسعه و زیرساخت',
  social: 'شبکه‌های اجتماعی',
  finance: 'مالی و پرداخت',
  other: 'سایر',
};

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
      | 'not_found',
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
  }
}

export function normalizeKind(raw: string): ServiceKind {
  return (SERVICE_KINDS as readonly string[]).includes(raw) ? (raw as ServiceKind) : 'other';
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
