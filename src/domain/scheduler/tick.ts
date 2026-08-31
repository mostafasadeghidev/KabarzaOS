/**
 * زمان‌بند — تصمیم‌های خالصِ تیکِ دوره‌ای.
 *
 * منبع: `Core\ و متدهای زیرش.
 *
 * ⚠️ قاعدهٔ حاکم بر همهٔ کارها (کامنتِ خودِ نسخهٔ قبلی): هر شرط به شکلِ
 * «**از ساعتِ محلی گذشته و برای این تاریخ هنوز فرستاده نشده**» نوشته
 * می‌شود. نتیجه: تیکِ دیر رسیده باز هم تحویل می‌دهد — فقط دیرتر — و هرگز
 * تکراری نمی‌فرستد و هیچ‌وقت چیزی را از دست نمی‌دهد.
 */

/** ساعتِ محلیِ تلنگرِ همان‌روز و تلنگرِ روزِ ازدست‌رفته. */
export const NUDGE_TODAY_HOUR = 22;
export const NUDGE_YESTERDAY_HOUR = 10;

/**
 * تایمرِ رهاشده پس از این مدت یک‌بار یادآوری می‌گیرد.
 *
 * ⚠️ ۲۴۰ است نه ۳۰۰، و این دو عددِ **متفاوت**اند که به‌سادگی قاطی می‌شوند:
 * نسخهٔ قبلی `REMIND_MINUTES = 240` (۴ ساعت — کِی یادآوری کن) و
 * `CAP_MINUTES = 300` (۵ ساعت — کِی به‌جای ذخیره پارک کن). اپ اشتباهاً هر دو
 * را ۳۰۰ گذاشته بود، پس یادآور یک ساعت دیرتر می‌رسید — بی‌آنکه چیزی خطا
 * بدهد.
 */
export const TIMER_REMIND_MINUTES = 240;

/** روزهای نگهداریِ داده‌های موقت — پورتِ `run_cleanup()`. */
export const RETENTION_DAYS = {
  reminders: 7,
  meetings: 7,
  absences: 30,
  notifications: 30,
  activity: 90,
} as const;

/* ------------------------------------------------------------------ *
 * ساعتِ محلیِ کاربر
 * ------------------------------------------------------------------ */

/**
 * تاریخ و ساعتِ محلیِ کاربر.
 *
 * ⚠️ تلنگرها باید در منطقهٔ زمانیِ **خودِ عضو** حساب شوند؛ «ساعتِ ۲۲» برای
 * کسی که در برلین است با تهران یکی نیست. منطقهٔ نامعتبر به UTC برمی‌گردد،
 * نه اینکه استثنا بیندازد و کلِ تیک را بخواباند.
 */
export function localParts(now: Date, timezone: string): { date: string; hour: number } {
  const zone = timezone || 'UTC';
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: zone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', hour12: false,
    }).formatToParts(now);
  } catch {
    return localParts(now, 'UTC');
  }

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  // ساعتِ ۲۴ در برخی محیط‌ها یعنی نیمه‌شب.
  const hour = Number(get('hour')) % 24;
  return { date: `${get('year')}-${get('month')}-${get('day')}`, hour };
}

/** روزِ قبلِ یک تاریخِ `YYYY-MM-DD`. */
export function previousDay(date: string): string {
  const at = new Date(`${date}T12:00:00Z`);
  at.setUTCDate(at.getUTCDate() - 1);
  return at.toISOString().slice(0, 10);
}

/**
 * روزِ هفته به ترتیبِ ایرانی: ۰ = شنبه … ۶ = جمعه.
 * ⚠️ `getUTCDay()` یکشنبه را صفر می‌گیرد؛ بدونِ این جابه‌جایی، برنامهٔ
 * هفتگیِ همه یک روز می‌لغزید.
 */
export function iranianWeekday(date: string): number {
  const jsDay = new Date(`${date}T12:00:00Z`).getUTCDay(); // 0=یکشنبه
  return (jsDay + 1) % 7;
}

/* ------------------------------------------------------------------ *
 * تلنگرِ ثبتِ ساعت
 * ------------------------------------------------------------------ */

export interface NudgeInput {
  /** ساعت و تاریخِ محلیِ کاربر. */
  local: { date: string; hour: number };
  /** روزهای هفته‌ای که کاربر اعلام کرده در دسترس است. */
  availableWeekdays: readonly number[];
  /** آخرین تاریخی که تلنگرِ «امروز» برایش فرستاده شده. */
  lastTodayStamp: string | null;
  lastYesterdayStamp: string | null;
  /** تاریخ‌هایی که مرخصی بوده. */
  absentDates: readonly string[];
  /** تاریخ‌هایی که ساعت ثبت کرده. */
  loggedDates: readonly string[];
}

export type NudgeKind = 'today' | 'yesterday';

/**
 * کدام تلنگرها الان سررسیده‌اند؟
 *
 * شرط‌ها برای هر کدام یکی است:
 *  · از ساعتِ محلیِ مقرر گذشته باشد
 *  · برای **همان تاریخ** قبلاً فرستاده نشده باشد
 *  · آن روز جزوِ روزهای در دسترسِ کاربر باشد
 *  · مرخصی نبوده باشد
 *  · ساعتی ثبت نکرده باشد
 */
export function dueNudges(input: NudgeInput): NudgeKind[] {
  const out: NudgeKind[] = [];

  const eligible = (date: string) =>
    input.availableWeekdays.includes(iranianWeekday(date))
    && !input.absentDates.includes(date)
    && !input.loggedDates.includes(date);

  if (input.local.hour >= NUDGE_TODAY_HOUR
    && input.lastTodayStamp !== input.local.date
    && eligible(input.local.date)) {
    out.push('today');
  }

  if (input.local.hour >= NUDGE_YESTERDAY_HOUR) {
    const yesterday = previousDay(input.local.date);
    if (input.lastYesterdayStamp !== yesterday && eligible(yesterday)) {
      out.push('yesterday');
    }
  }

  return out;
}

/* ------------------------------------------------------------------ *
 * یادآورهای شخصی
 * ------------------------------------------------------------------ */

export interface ReminderRow {
  id: number;
  remindAt: Date;
  leadMinutes: number[] | null;
  sentOffsets: number[] | null;
}

/**
 * کدام «فاصله‌ها»ی یک یادآور سررسیده‌اند؟
 *
 * ⚠️ یک یادآور می‌تواند چند فاصله داشته باشد (سرِ وقت / ۱۰ دقیقه / ۱ ساعت /
 * ۱ روز قبل) و هر کدام **یک‌بار** می‌سوزد. فهرستِ فرستاده‌شده‌ها باید در
 * همان پاس هم به‌روز بماند، وگرنه دو فاصله که هم‌زمان سررسیده‌اند دو بار
 * حساب می‌شوند.
 */
export function dueOffsets(reminder: ReminderRow, now: Date): number[] {
  const leads = reminder.leadMinutes?.length ? reminder.leadMinutes : [0];
  const sent = new Set(reminder.sentOffsets ?? []);
  const target = reminder.remindAt.getTime();

  return leads
    .filter((lead) => !sent.has(lead))
    .filter((lead) => target - lead * 60_000 <= now.getTime());
}

/* ------------------------------------------------------------------ *
 * تایمرِ رهاشده
 * ------------------------------------------------------------------ */

/**
 * تایمری که خیلی وقت است روشن مانده یک‌بار یادآوری می‌گیرد.
 * ⚠️ «یک‌بار» با پرچمی که هنگامِ توقف پاک می‌شود — پس تایمرِ تازه دوباره
 * می‌تواند یادآوری بگیرد.
 */
export function needsTimerReminder(input: {
  minutes: number;
  alreadyReminded: boolean;
}): boolean {
  return !input.alreadyReminded && input.minutes >= TIMER_REMIND_MINUTES;
}

/* ------------------------------------------------------------------ *
 * پاک‌سازیِ روزانه
 * ------------------------------------------------------------------ */

/**
 * آیا پاک‌سازی امروز باید اجرا شود؟
 * ⚠️ مهرِ تاریخ **پیش از** اجرا زده می‌شود تا خطای وسطِ کار حلقه نسازد
 * (همان کاری که نسخهٔ قبلی می‌کند).
 */
export function shouldRunCleanup(lastRunDate: string | null, today: string): boolean {
  return lastRunDate !== today;
}

/** تاریخِ مرزِ نگهداری. */
export function retentionCutoff(now: Date, days: number): string {
  const at = new Date(now);
  at.setUTCDate(at.getUTCDate() - days);
  return at.toISOString().slice(0, 10);
}

/** دقیقهٔ سپری‌شدهٔ یک تایمرِ در حالِ شمارش. */
export function elapsedFor(startedAt: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - startedAt.getTime()) / 60_000));
}
