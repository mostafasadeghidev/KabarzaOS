/**
 * نمایشِ تاریخ/ساعت در **منطقهٔ زمانیِ بیننده**.
 *
 * ⚠️ پیش از این شش کمکیِ `when()` هر کدام `toISOString().slice(0, 16)` می‌زدند:
 * یعنی UTC ِ خام. جلسهٔ ۱۴:۰۰ تهران ۱۰:۳۰ نشان داده می‌شد. اینجا یک قالبِ ثابت
 * (`YYYY-MM-DD HH:mm`، رقمِ لاتین — همان قراردادِ `.num`) در منطقهٔ زمانیِ
 * کاربر ساخته می‌شود؛ قالبِ ثابت است تا با فیلترها و مرتب‌سازیِ رشته‌ای
 * ناسازگار نشود.
 *
 * ⚠️ منطقهٔ نامعتبر یا خالی → منطقهٔ خودِ مرورگر؛ روی سرور → UTC.
 */
function resolveZone(timeZone: string | undefined): string | undefined {
  if (timeZone && timeZone.trim() !== '') {
    try { new Intl.DateTimeFormat('en-CA', { timeZone }); return timeZone; } catch { /* نامعتبر */ }
  }
  return undefined;
}

function parts(d: Date, timeZone: string | undefined): Record<string, string> {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });
  const out: Record<string, string> = {};
  for (const p of f.formatToParts(d)) if (p.type !== 'literal') out[p.type] = p.value;
  return out;
}

/** `YYYY-MM-DD HH:mm` در منطقهٔ زمانیِ داده‌شده. */
export function formatDateTime(value: Date | string | null | undefined, timeZone?: string): string {
  if (!value) return '';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '';
  const p = parts(d, resolveZone(timeZone));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}

/** مقدارِ `<input type="datetime-local">` — همان تاریخ در منطقهٔ زمانیِ کاربر. */
export function formatForDateTimeInput(value: Date | string | null | undefined, timeZone?: string): string {
  const s = formatDateTime(value, timeZone);
  return s === '' ? '' : s.replace(' ', 'T');
}

/**
 * برعکس: رشتهٔ `datetime-local` ِ کاربر (`YYYY-MM-DDTHH:mm`) در منطقهٔ زمانیِ او
 * → لحظهٔ مطلق. `new Date(str)` آن را در منطقهٔ **سرور** می‌خواند — همان باگی
 * که جلسهٔ ثبت‌شده را چند ساعت جابه‌جا می‌کرد.
 */
export function parseInZone(local: string, timeZone?: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(local);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m.map(Number);
  const zone = resolveZone(timeZone);
  if (!zone) return new Date(y!, mo! - 1, d!, h!, mi!);
  // حدسِ اول: همان اعداد به‌عنوانِ UTC؛ بعد اختلافِ منطقه در همان لحظه اصلاح می‌شود (دو بار، برای گذارِ ساعتِ تابستانی).
  let guess = Date.UTC(y!, mo! - 1, d!, h!, mi!);
  for (let i = 0; i < 2; i++) {
    const p = parts(new Date(guess), zone);
    const asUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute));
    guess -= asUtc - Date.UTC(y!, mo! - 1, d!, h!, mi!);
  }
  return new Date(guess);
}
