/**
 * مجوزها — قواعدِ docs/rules/RBAC.md
 *
 * درس‌های نسخهٔ قبلی که اینجا اصلاح شده‌اند:
 *  - نامِ مجوزهای پیام گمراه‌کننده بود (manage=ارسال، access=خواندن) → روشن شد
 *  - اعمال در لایهٔ دامنه است، نه صفحه (R-ARCH-01)
 */

export const SECTIONS = ['projects', 'members', 'meetings', 'messages', 'finance', 'reports'] as const;
export type Section = (typeof SECTIONS)[number];

/**
 * مجوزها با نامِ `section.action`.
 * R-MSG-10 — پیام‌ها دو مجوزِ **مستقل** دارند، نه سلسله‌مراتبی:
 *   messages.send → می‌تواند بفرستد
 *   messages.read → صندوقِ خودش را می‌بیند
 */
export const PERMISSIONS = [
  'projects.view', 'projects.manage',
  'members.view', 'members.manage',
  'meetings.view', 'meetings.manage',
  'messages.send', 'messages.read',
  'finance.view', 'finance.manage',
  'reports.view',
  'settings.manage',
  'activity.view',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

/**
 * ⚠️ R-RBAC-01 — قانونِ طلایی: مدیریت ⇐ مشاهده.
 * دادنِ manage خودبه‌خود view را هم می‌دهد. بدونِ این، مدیر منویی را که
 * روی view گیت شده نمی‌بیند.
 */
const IMPLIES: Partial<Record<Permission, Permission[]>> = {
  'projects.manage': ['projects.view'],
  'members.manage': ['members.view'],
  'meetings.manage': ['meetings.view'],
  'finance.manage': ['finance.view'],
};

/** بستنِ مجوزها تحتِ قاعدهٔ «مدیریت ⇐ مشاهده». */
export function expandPermissions(granted: readonly Permission[]): Set<Permission> {
  const out = new Set<Permission>(granted);
  for (const p of granted) {
    for (const implied of IMPLIES[p] ?? []) out.add(implied);
  }
  return out;
}

export type Role = 'owner' | 'admin' | 'finance' | 'member' | 'client';

/** مجوزهای پایهٔ هر نقش. «admin» عمداً خالی است — دسترسی‌اش per-user داده می‌شود. */
const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  owner: [...PERMISSIONS],
  admin: [],
  /**
   * ⚠️ پورتِ دقیقِ نقشِ ACCOUNTANT نسخهٔ قبلی، که علاوه بر مالی
   * هم داشت: تنظیماتِ عمومی، شرکت، دفاتر، ارزها/نرخ‌ها، تگ‌ها، کتابخانهٔ QA
   * و صفحهٔ فعالیت. حسابداری که برای افزودنِ یک ارز یا نرخ دستش به مالک بند
   * باشد، عملاً حسابدار نیست. بخش‌های مالکانه (گزارشِ روزانه، دورهٔ مالی،
   * دسترسیِ همکاران) جدا owner-گیت شده‌اند و با این مجوز باز نمی‌شوند.
   */
  finance: ['finance.view', 'finance.manage', 'reports.view', 'settings.manage', 'activity.view'],
  member: [],
  client: [],
};

export interface Actor {
  id: number;
  roles: readonly Role[];
  /** مجوزهای per-user (همکارِ ادمین). ⚠️ R-RBAC-11 — هرگز خودکار پاک نشوند. */
  permissions: readonly Permission[];
  /** گرنتِ دیدنِ دادهٔ خصوصی — جدا از نقش، تا پس‌گرفتنش تنزلِ نقش نباشد. */
  privateAccess: boolean;
}

/** مجموعهٔ کاملِ مجوزهای یک کاربر. */
export function effectivePermissions(actor: Actor): Set<Permission> {
  const base: Permission[] = [...actor.permissions];
  for (const role of actor.roles) base.push(...ROLE_PERMISSIONS[role]);
  return expandPermissions(base);
}

export function can(actor: Actor, permission: Permission): boolean {
  return effectivePermissions(actor).has(permission);
}

export function isOwner(actor: Actor): boolean {
  return actor.roles.includes('owner');
}

/** R-RBAC-01 — «دیدنِ بخش» یعنی view یا manage. */
export function canViewSection(actor: Actor, section: Section): boolean {
  if (section === 'messages') return can(actor, 'messages.read') || can(actor, 'messages.send');
  if (section === 'reports') return can(actor, 'reports.view');
  return can(actor, `${section}.view` as Permission);
}

export function canManageSection(actor: Actor, section: Section): boolean {
  if (section === 'messages') return can(actor, 'messages.send');
  if (section === 'reports') return can(actor, 'reports.view');
  return can(actor, `${section}.manage` as Permission);
}
