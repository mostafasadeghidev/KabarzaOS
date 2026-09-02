/**
 * گاردهای دسترسی — قواعدِ docs/rules/RBAC.md
 *
 * ⚠️ R-ARCH-01 / R-LEDGER-11 — درسِ اصلیِ نسخهٔ قبلی:
 * آنجا گاردها در **لایهٔ صفحه** بودند، پس هر مسیرِ جدید (API، ایجنت، ایمپورت)
 * دورشان می‌زد. اینجا در **لایهٔ دامنه** هستند تا هیچ مسیری استثنا نباشد.
 *
 * R-RBAC-05 — سه لایهٔ دفاع: منو، ورودِ صفحه، و **اینجا** (گاردِ اکشن).
 * مخفی‌کردنِ دکمه امنیت نیست؛ این لایه است که واقعاً جلو را می‌گیرد.
 */

import { can, canManageSection, canViewSection, isOwner, type Actor, type Permission, type Section } from './permissions';

export class ForbiddenError extends Error {
  constructor(readonly required: string) {
    super(`forbidden: requires ${required}`);
    this.name = 'ForbiddenError';
  }
}

export function assertCan(actor: Actor, permission: Permission): void {
  if (!can(actor, permission)) throw new ForbiddenError(permission);
}

export function assertCanView(actor: Actor, section: Section): void {
  if (!canViewSection(actor, section)) throw new ForbiddenError(`${section}.view`);
}

export function assertCanManage(actor: Actor, section: Section): void {
  if (!canManageSection(actor, section)) throw new ForbiddenError(`${section}.manage`);
}

export function assertOwner(actor: Actor): void {
  if (!isOwner(actor)) throw new ForbiddenError('owner');
}

/**
 * ⚠️ R-RBAC-08 — مجوز کافی نیست، مالکیت هم لازم است.
 * «دسترسی به پیام‌ها» یعنی «صندوقِ خودت»، نه «همهٔ گفتگوها».
 */
export function assertParticipant(actor: Actor, participantIds: readonly number[]): void {
  if (!participantIds.includes(actor.id)) throw new ForbiddenError('participant');
}

/**
 * ⚠️ R-RBAC-12 — فیلدهای مشتق هم اطلاعات لو می‌دهند.
 * وضعیت و شمارنده باید همان گاردِ خودِ رکورد را داشته باشند — یک نشتیِ
 * واقعی در نسخهٔ قبلی از همین آمد (وضعیتِ تسکِ خصوصی دیده می‌شد).
 */
export interface PrivateRecord {
  isPrivate: boolean;
  createdBy: number | null;
  assignedTo: number | null;
}

export function canSeePrivateRecord(actor: Actor, record: PrivateRecord, section: Section): boolean {
  if (!record.isPrivate) return true;
  if (record.createdBy === actor.id || record.assignedTo === actor.id) return true;
  // مدیرِ بخش همه را می‌بیند.
  return canManageSection(actor, section);
}

/** فیلترِ امنِ فهرست — همان گارد، اعمال‌شده روی مجموعه. */
export function filterVisible<T extends PrivateRecord>(actor: Actor, records: T[], section: Section): T[] {
  return records.filter((r) => canSeePrivateRecord(actor, r, section));
}

/**
 * همان قاعده با **مدیریتِ پروژه‌محور** — پورتِ `can_view_task()`: مدیرِ
 * پروژهٔ تگ‌دار و مدیرِ دفترِ مالک هم تسکِ خصوصیِ پروژهٔ خودشان را می‌بینند.
 *
 * ⚠️ `canSeePrivateRecord` فقط مجوزِ **سراسری** را می‌شناخت؛ مدیرِ پروژه‌ای
 * که هیچ مجوزِ سراسری ندارد تسکِ خصوصیِ پروژهٔ خودش را نمی‌دید و نمی‌توانست
 * وضعیتش را عوض کند — در حالی که همان تسک را می‌توانست ویرایش کند.
 */
export function canSeePrivateRecordFor(
  actor: Actor,
  record: PrivateRecord,
  managesProject: boolean,
): boolean {
  if (!record.isPrivate) return true;
  if (record.createdBy === actor.id || record.assignedTo === actor.id) return true;
  return managesProject;
}

export function filterVisibleFor<T extends PrivateRecord>(
  actor: Actor,
  records: T[],
  managesProject: boolean,
): T[] {
  return records.filter((r) => canSeePrivateRecordFor(actor, r, managesProject));
}

/**
 * درزِ scope — دیدنِ دادهٔ خصوصیِ مالک یک **گرنت** است، نه نقش.
 * این‌طور می‌شود گرفتنش بدونِ تنزلِ نقشِ کاربر.
 */
export function visibleScopes(actor: Actor): Array<'company' | 'private'> {
  return actor.privateAccess || isOwner(actor) ? ['company', 'private'] : ['company'];
}

export function canSeeScope(actor: Actor, scope: 'company' | 'private'): boolean {
  return visibleScopes(actor).includes(scope);
}
