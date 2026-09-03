import { can, canViewSection, type Actor } from './permissions';

/**
 * اولین صفحه‌ای که کاربرِ واردشده اجازه‌اش را دارد — پورتِ `Access::first_page()`.
 *
 * ⚠️ چرا لازم است: ریشهٔ اپ فقط پروژه‌ها، گزارش‌ها و نقشِ عضو/کارفرما را
 * می‌شناخت و بقیه را به `/login` می‌فرستاد. همکارِ ادمینی که فقط
 * اعضا/جلسات/پیام/مالی گرفته بود، بعد از ورودِ موفق دوباره فرمِ ورود را
 * می‌دید و ورود دوباره به `/` برمی‌گشت — بن‌بست. افزونه او را به اولین
 * بخشِ مجازش می‌برد.
 *
 * ⚠️ آخرین گزینه هرگز `/login` نیست: کاربرِ واردشده همیشه دستِ‌کم پروفایلِ
 * خودش را دارد. فرستادنِ یک نشستِ زنده به فرمِ ورود یعنی حلقه.
 */
const ORDER: ReadonlyArray<{ href: string; allowed: (a: Actor) => boolean }> = [
  { href: '/dashboard', allowed: (a) => canViewSection(a, 'projects') },
  { href: '/members', allowed: (a) => canViewSection(a, 'members') },
  { href: '/finance', allowed: (a) => canViewSection(a, 'finance') },
  { href: '/reports', allowed: (a) => canViewSection(a, 'reports') },
  { href: '/meetings', allowed: (a) => canViewSection(a, 'meetings') },
  { href: '/messages', allowed: (a) => canViewSection(a, 'messages') },
  { href: '/activity', allowed: (a) => can(a, 'activity.view') },
  { href: '/settings', allowed: (a) => can(a, 'settings.manage') },
  // عضو و کارفرما هیچ مجوزِ بخشی ندارند — دیدشان عضویت‌محور است.
  // پورتِ `home_for()`: عضو و کارفرما به نمای کلیِ خودشان می‌روند، نه فهرستِ پروژه‌ها.
  { href: '/dashboard', allowed: (a) => a.roles.includes('member') || a.roles.includes('client') },
];

export function firstPage(actor: Actor): string {
  return ORDER.find((o) => o.allowed(actor))?.href ?? '/profile';
}
