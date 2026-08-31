import { PERMISSIONS, type Permission } from './permissions';

/**
 * سطحِ دسترسیِ همکارِ ادمین.
 *
 * ⚠️ چرا «سطح» و نه فهرستِ تیکِ مجوزها؟ چون در نسخهٔ قبلی هم همین بود و دلیلش
 * درست است: مالک باید یک تصمیمِ ساده بگیرد («نبیند / ببیند / مدیریت کند»)،
 * نه اینکه ترکیبِ ناسازگارِ مجوز بسازد (مثلاً manage بدونِ view).
 */

export type Level = 'none' | 'view' | 'manage' | 'send' | 'sendread';

export interface LevelOption {
  value: Level;
  label: string;
  permissions: Permission[];
}

export interface SectionAccess {
  key: string;
  label: string;
  levels: LevelOption[];
}

const NONE: LevelOption = { value: 'none', label: 'بدون دسترسی', permissions: [] };

/**
 * فهرستِ بخش‌ها با برچسب و سطوحِ همان بخش.
 *
 * سه استثنا که در نسخهٔ قبلی هم بودند و عمداً حفظ می‌شوند:
 *  - **گزارش‌ها** فقط یک سطحِ «دسترسی» دارد (مدیریتِ گزارش معنا ندارد)؛
 *    برچسبش «دسترسی» است نه «مشاهده»، وگرنه کاربر دنبالِ گزینهٔ مدیریت می‌گردد.
 *  - **مالی** فقط none/manage است — نمای فقط‌خواندنیِ مالی وجود ندارد.
 *  - **پیام‌ها** دو مجوزِ مستقل دارد (R-MSG-10): «فقط ارسال» یعنی می‌فرستد
 *    ولی صندوق را نمی‌بیند.
 */
export const SECTION_ACCESS: SectionAccess[] = [
  {
    key: 'projects',
    label: 'پروژه‌ها',
    levels: [
      NONE,
      { value: 'view', label: 'مشاهده', permissions: ['projects.view'] },
      { value: 'manage', label: 'مدیریت', permissions: ['projects.manage'] },
    ],
  },
  {
    key: 'members',
    label: 'اعضا و کارفرمایان',
    levels: [
      NONE,
      { value: 'view', label: 'مشاهده', permissions: ['members.view'] },
      { value: 'manage', label: 'مدیریت', permissions: ['members.manage'] },
    ],
  },
  {
    key: 'meetings',
    label: 'جلسات و یادآورها',
    levels: [
      NONE,
      { value: 'view', label: 'مشاهده', permissions: ['meetings.view'] },
      { value: 'manage', label: 'مدیریت', permissions: ['meetings.manage'] },
    ],
  },
  {
    key: 'messages',
    label: 'پیام‌ها',
    levels: [
      NONE,
      { value: 'send', label: 'فقط ارسال', permissions: ['messages.send'] },
      { value: 'sendread', label: 'ارسال و خواندن', permissions: ['messages.send', 'messages.read'] },
    ],
  },
  {
    key: 'finance',
    label: 'مالی (حسابداری، مدیریت مالی، مالی اعضا)',
    levels: [
      NONE,
      { value: 'manage', label: 'مدیریت', permissions: ['finance.manage'] },
    ],
  },
  {
    key: 'reports',
    label: 'گزارش‌ها',
    levels: [
      NONE,
      { value: 'view', label: 'دسترسی', permissions: ['reports.view'] },
    ],
  },
  {
    key: 'activity',
    label: 'فعالیت',
    levels: [
      NONE,
      { value: 'view', label: 'دسترسی', permissions: ['activity.view'] },
    ],
  },
];

/**
 * سطحِ فعلیِ یک بخش از روی مجوزهای ذخیره‌شده.
 *
 * ⚠️ از **آخر** به اول می‌گردیم و غنی‌ترین سطحی را برمی‌داریم که همهٔ مجوزهایش
 * را دارد. اگر از اول می‌گشتیم، «ارسال و خواندن» همیشه به «فقط ارسال» تنزل
 * پیدا می‌کرد و مالک با ذخیرهٔ دوباره ناخواسته دسترسی را کم می‌کرد.
 */
export function currentLevel(section: SectionAccess, granted: ReadonlySet<string>): Level {
  for (let i = section.levels.length - 1; i >= 0; i -= 1) {
    const lv = section.levels[i]!;
    if (lv.permissions.length > 0 && lv.permissions.every((p) => granted.has(p))) return lv.value;
  }
  return 'none';
}

/** نگاشتِ کاملِ بخش ← سطح. */
export function levelsOf(granted: readonly string[]): Record<string, Level> {
  const set = new Set(granted);
  const out: Record<string, Level> = {};
  for (const section of SECTION_ACCESS) out[section.key] = currentLevel(section, set);
  return out;
}

/**
 * سطوحِ انتخاب‌شده ← فهرستِ مجوز.
 * سطحِ ناشناخته «بدون دسترسی» است، نه خطا: ورودیِ دستکاری‌شده نباید دسترسی بدهد.
 */
export function permissionsFor(selected: Record<string, string>): Permission[] {
  const out = new Set<Permission>();
  for (const section of SECTION_ACCESS) {
    const level = section.levels.find((l) => l.value === selected[section.key]);
    for (const p of level?.permissions ?? []) out.add(p);
  }
  return [...out];
}

/* ------------------------------------------------------------------ *
 * تب‌های گزارش
 * ------------------------------------------------------------------ */

/** کلید و برچسبِ تب‌های گزارش — همان ترتیبِ صفحهٔ گزارش‌ها. */
export const REPORT_TABS: Array<{ key: string; label: string }> = [
  { key: 'overall', label: 'گزارش کلی' },
  { key: 'members', label: 'اعضا' },
  { key: 'clients', label: 'مطالبات کارفرما' },
  { key: 'expenses', label: 'هزینه‌ها' },
  { key: 'accounts', label: 'حساب‌ها و نقدینگی' },
  { key: 'hours', label: 'ساعت کاری' },
  { key: 'projects', label: 'گزارش پروژه‌ها' },
  { key: 'units', label: 'کارکردِ تعدادی' },
  { key: 'attendance', label: 'حضور و مرخصی' },
  { key: 'closings', label: 'دوره‌های بسته‌شده' },
];

/**
 * تبِ پنهان به‌صورتِ ردیفِ `reports.hide:<tab>` در همان جدولِ مجوزها ذخیره
 * می‌شود.
 *
 * ⚠️ **پنهان** ذخیره می‌شود، نه **نمایان** — تا تبِ تازه‌ای که فردا اضافه شود
 * به‌صورتِ پیش‌فرض دیده شود، نه اینکه بی‌صدا از همه پنهان بماند.
 */
export const HIDE_PREFIX = 'reports.hide:';

export function hiddenTabsFrom(granted: readonly string[]): string[] {
  return granted
    .filter((p) => p.startsWith(HIDE_PREFIX))
    .map((p) => p.slice(HIDE_PREFIX.length))
    .filter((key) => REPORT_TABS.some((t) => t.key === key));
}

/** تیک‌های «نمایش» ← ردیف‌های پنهان. */
export function hideRowsFor(visibleKeys: readonly string[]): string[] {
  const visible = new Set(visibleKeys);
  return REPORT_TABS.filter((t) => !visible.has(t.key)).map((t) => HIDE_PREFIX + t.key);
}

/** آیا رشته یک مجوزِ شناخته‌شده یا ردیفِ پنهان‌سازیِ معتبر است؟ */
export function isStorablePermission(value: string): boolean {
  if ((PERMISSIONS as readonly string[]).includes(value)) return true;
  return value.startsWith(HIDE_PREFIX)
    && REPORT_TABS.some((t) => HIDE_PREFIX + t.key === value);
}
