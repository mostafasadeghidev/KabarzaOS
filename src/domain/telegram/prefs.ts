/**
 * ترجیحاتِ تلگرامِ هر کاربر (۲.۴۱.۰) — قاعده‌ها به‌شکلِ خالص.
 *
 *  - `off`: دسته‌هایی که در تلگرام **نمی‌آیند** (در برنامه و ایمیل می‌مانند).
 *  - `quiet`: ساعتِ سکوت؛ اعلان‌های این بازه در تلگرام فرستاده نمی‌شوند و پایانِ
 *    بازه یک «خلاصهٔ ساعتِ سکوت» می‌رسد. بازهٔ شبانه از نیمه‌شب می‌گذرد.
 *  - `evening`: ساعتِ گزارشِ عصر؛ خالی = خاموش.
 *
 * ⚠️ ستونِ `users.telegram_prefs` jsonb است و هر چیزِ ناشناخته یا خراب به پیش‌فرض
 * برمی‌گردد — ترجیحِ خراب نباید اعلانی را برای همیشه گم کند.
 */

/** دسته‌هایی که در تلگرام خاموش‌شدنی‌اند — همان دسته‌های ایمیل؛ «سایر» نه. */
export const TG_CATEGORIES = ['tasks', 'projects', 'money', 'meetings', 'messages'] as const;
export type TgCategory = (typeof TG_CATEGORIES)[number];

export const TG_CATEGORY_LABELS: Record<TgCategory, string> = {
  tasks: 'تسک‌ها',
  projects: 'پروژه‌ها',
  money: 'مالی',
  meetings: 'جلسات و یادآورها',
  messages: 'پیام‌ها',
};

export interface QuietHours { from: string; to: string }

export interface TelegramPrefs {
  off: TgCategory[];
  quiet: QuietHours | null;
  evening: string;
}

export const DEFAULT_PREFS: TelegramPrefs = { off: [], quiet: null, evening: '' };

/** گزینه‌های آمادهٔ ساعتِ سکوت — دکمهٔ ربات بینشان می‌چرخد. */
export const QUIET_PRESETS: ReadonlyArray<QuietHours | null> = [
  null,
  { from: '22:00', to: '08:00' },
  { from: '23:00', to: '08:00' },
  { from: '00:00', to: '09:00' },
  { from: '21:00', to: '07:00' },
];
export const EVENING_CHOICES = ['', '17:00', '18:00', '19:00', '20:00', '21:00'] as const;
export const BRIEF_CHOICES = ['', '07:00', '07:30', '08:00', '08:30', '09:00', '09:30', '10:00'] as const;

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

function minutes(hhmm: string): number {
  const m = HHMM.exec(hhmm);
  return m ? Number(m[1]) * 60 + Number(m[2]) : -1;
}

export function normalizePrefs(raw: unknown): TelegramPrefs {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const off = Array.isArray(r.off)
    ? [...new Set(r.off.filter((x): x is TgCategory => (TG_CATEGORIES as readonly string[]).includes(String(x))))]
    : [];
  const q = r.quiet as Record<string, unknown> | null | undefined;
  const quiet = q && typeof q.from === 'string' && typeof q.to === 'string' && HHMM.test(q.from) && HHMM.test(q.to) && q.from !== q.to
    ? { from: q.from, to: q.to }
    : null;
  const evening = typeof r.evening === 'string' && HHMM.test(r.evening) ? r.evening : '';
  return { off, quiet, evening };
}

/** این لحظه (HH:MM ِ محلیِ کاربر) در ساعتِ سکوت است؟ بازهٔ شبانه از نیمه‌شب می‌گذرد. */
export function inQuiet(time: string, quiet: QuietHours | null): boolean {
  if (!quiet) return false;
  const now = minutes(time);
  const from = minutes(quiet.from);
  const to = minutes(quiet.to);
  if (now < 0 || from < 0 || to < 0 || from === to) return false;
  return from < to ? now >= from && now < to : now >= from || now < to;
}

/** طولِ ساعتِ سکوت به دقیقه — برای «اعلان‌های همین بازه» در خلاصهٔ پایانِ سکوت. */
export function quietLength(quiet: QuietHours): number {
  const d = minutes(quiet.to) - minutes(quiet.from);
  return d > 0 ? d : d + 24 * 60;
}

/**
 * خلاصهٔ پایانِ سکوت حالا وقتش است؟ از لحظهٔ پایان تا ۲ ساعت بعد، یک بار در روز.
 * ⚠️ «۲ ساعت»: اگر زمان‌بند خاموش بوده، خلاصهٔ صبح عصر نرسد.
 */
export function quietEnded(time: string, date: string, quiet: QuietHours | null, lastSent: string | null): boolean {
  if (!quiet || lastSent === date) return false;
  const now = minutes(time);
  const to = minutes(quiet.to);
  return now >= to && now < to + 120;
}

export interface EveningCheck {
  at: string;
  local: { date: string; time: string };
  lastSent: string | null;
  workDays: number[];
  weekday: number;
  onLeave: boolean;
}

/** گزارشِ عصر: یک بار در روز، بعد از ساعتِ انتخابی و پیش از نیمه‌شب؛ فقط روزِ کاری و نه در مرخصی. */
export function eveningDue(c: EveningCheck): boolean {
  const at = minutes(c.at);
  if (at < 0) return false;
  if (minutes(c.local.time) < at || c.lastSent === c.local.date) return false;
  if (c.workDays.length > 0 && !c.workDays.includes(c.weekday)) return false;
  return !c.onLeave;
}

/** گزینهٔ بعدیِ یک فهرستِ چرخشی (دکمهٔ ربات). */
export function nextChoice<T>(list: readonly T[], current: T, same: (a: T, b: T) => boolean = (a, b) => a === b): T {
  const i = list.findIndex((x) => same(x, current));
  return list[(i + 1) % list.length]!;
}

export function sameQuiet(a: QuietHours | null, b: QuietHours | null): boolean {
  return (a?.from ?? '') === (b?.from ?? '') && (a?.to ?? '') === (b?.to ?? '');
}
