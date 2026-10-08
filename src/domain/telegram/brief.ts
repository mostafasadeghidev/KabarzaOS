/**
 * گزارشِ صبحگاهی در تلگرام (۲.۱۴.۰) — قاعدهٔ «کی بفرستیم» به‌شکلِ خالص.
 *
 * ⚠️ قاعده‌های «مزاحم نشدن»:
 *  1. **یک بار در روز** (مهرِ روز) و فقط بعد از ساعتِ انتخابیِ خودِ کاربر.
 *  2. فقط **پیش از ظهر** — اگر زمان‌بند خاموش بوده، عصر گزارشِ صبح نمی‌آید.
 *  3. فقط **روزِ کاریِ همان نفر** (برنامهٔ هفتگی‌اش، اگر دارد) و نه در مرخصی.
 *  4. ساعتِ خالی یا نامعتبر = خاموش. (خالی‌بودنِ خودِ گزارش را فرستنده می‌سنجد.)
 */

export interface BriefCheck {
  /** HH:MM یا خالی. */
  briefAt: string;
  local: { date: string; hour: number; minute: number };
  /** روزِ آخرین گزارشِ فرستاده. */
  lastSent: string | null;
  /** روزهای کاری (۰ = شنبه)؛ خالی = برنامه‌ای ثبت نشده، پس همهٔ روزها. */
  workDays: number[];
  /** روزِ هفتهٔ ایرانیِ امروز. */
  weekday: number;
  /** امروز مرخصی است؟ */
  onLeave: boolean;
}

export function briefDue(c: BriefCheck): boolean {
  const m = /^(\d{2}):(\d{2})$/.exec(c.briefAt.trim());
  if (!m) return false;
  const at = Number(m[1]) * 60 + Number(m[2]);
  const now = c.local.hour * 60 + c.local.minute;
  if (now < at || c.local.hour >= 12) return false;
  if (c.lastSent === c.local.date) return false;
  if (c.workDays.length > 0 && !c.workDays.includes(c.weekday)) return false;
  return !c.onLeave;
}
