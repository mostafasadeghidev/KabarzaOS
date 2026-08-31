/**
 * قفلِ دورهٔ مالی — پیاده‌سازیِ قواعدِ docs/rules/FISCAL.md
 *
 * ⚠️ R-LEDGER-11 / R-ARCH-01 — درسِ نسخهٔ قبلی:
 * آنجا این گارد در **لایهٔ صفحه** بود، پس هر مسیرِ جدید (API، ایجنت، ایمپورت)
 * می‌توانست دورش بزند. اینجا در **لایهٔ دامنه** است تا همهٔ مسیرها از آن رد شوند.
 */

/** تاریخِ روز به‌صورتِ 'YYYY-MM-DD'. */
export type DayString = string;

export class FiscalPeriodLockedError extends Error {
  constructor(
    readonly date: DayString,
    readonly lockDate: DayString,
  ) {
    super(`fiscal period locked: ${date} is on or before ${lockDate}`);
    this.name = 'FiscalPeriodLockedError';
  }
}

/**
 * R-FISCAL-01 — قفل «تا و شاملِ» تاریخ است.
 * مقایسه به‌صورتِ **رشته‌ای** روی 'YYYY-MM-DD' انجام می‌شود — عمدی، برای پرهیز از
 * غافلگیریِ منطقهٔ زمانی (R-DATA-02). تبدیل به Date اینجا یک روز جابه‌جا می‌کند.
 */
export function isLocked(date: DayString | null | undefined, lockDate: DayString | null): boolean {
  if (!lockDate) return false;
  if (!date) return false;
  return date.slice(0, 10) <= lockDate.slice(0, 10);
}

/**
 * گاردِ نوشتن. برای **ویرایش** باید تاریخِ فعلیِ ردیف هم داده شود.
 *
 * ⚠️ R-FISCAL-02 — هر دو تاریخ چک می‌شوند:
 * وگرنه می‌شد ردیفی را از دورهٔ قفل‌شده «بیرون کشید» یا به داخلش «هل داد»
 * و ارقامِ بسته‌شده را تغییر داد. گاردِ ظریفی که راحت فراموش می‌شود.
 */
export function assertWritable(
  lockDate: DayString | null,
  newDate: DayString,
  existingDate?: DayString | null,
): void {
  if (isLocked(newDate, lockDate)) {
    throw new FiscalPeriodLockedError(newDate, lockDate!);
  }
  if (existingDate && isLocked(existingDate, lockDate)) {
    throw new FiscalPeriodLockedError(existingDate, lockDate!);
  }
}

/** R-FISCAL-03 — حذفِ ردیفِ داخلِ دورهٔ قفل‌شده ممنوع. */
export function assertDeletable(lockDate: DayString | null, entryDate: DayString): void {
  if (isLocked(entryDate, lockDate)) {
    throw new FiscalPeriodLockedError(entryDate, lockDate!);
  }
}

/**
 * R-FISCAL-06 — دوره از **فردای** بستنِ قبلی شروع می‌شود.
 * اگر بستنی وجود نداشته باشد، از ابتدا.
 */
export function periodStart(previousCloseDate: DayString | null): DayString {
  if (!previousCloseDate) return '1970-01-01';
  const [y, m, d] = previousCloseDate.slice(0, 10).split('-').map(Number);
  const next = new Date(Date.UTC(y!, m! - 1, d! + 1));
  return next.toISOString().slice(0, 10);
}

/**
 * R-FISCAL-10 — بستنِ دوره **قفل را عقب نمی‌برد**.
 *
 * ⚠️ اگر قفلِ فعلی جلوتر از تاریخِ این بستن باشد، همان می‌ماند. عقب‌بردنِ قفل
 * یعنی دوره‌ای که قبلاً بسته شده دوباره **باز** شود و ردیف‌هایش قابلِ تغییر
 * شوند — بی‌سروصدا و بدونِ اینکه کسی بخواهد.
 */
export function nextLockDate(
  currentLock: DayString | null,
  closeDate: DayString,
): DayString {
  return currentLock && currentLock > closeDate ? currentLock : closeDate;
}

/** تاریخِ بستن معتبر است؟ فقط `YYYY-MM-DD`. */
export function isValidCloseDate(value: string): boolean {
  const raw = value.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false;
  // ⚠️ الگو کافی نیست: «۲۰۲۶-۰۲-۳۰» هم الگو را پاس می‌کند ولی روز نیست.
  const parsed = new Date(`${raw}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === raw;
}

/**
 * موجودیِ پایانیِ یک حساب = ماندهٔ آغازین + همهٔ ورودی‌ها − همهٔ خروجی‌ها
 * **تا** تاریخِ بستن.
 *
 * ⚠️ «همه»، نه فقط این دوره: موجودی انباشته است، برخلافِ گردشِ دوره که
 * بازه‌ای است. قاطی‌کردنشان یعنی هر بستن، موجودی را از صفر می‌شمارد.
 */
export function closingBalance(input: {
  openingBalance: number;
  cumulativeIn: number;
  cumulativeOut: number;
}): number {
  return input.openingBalance + input.cumulativeIn - input.cumulativeOut;
}
