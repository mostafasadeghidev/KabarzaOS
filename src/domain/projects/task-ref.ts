/**
 * ارجاع به تسک با شماره (۲.۱۶.۰) — «#325» داخلِ پروژه، «ALZ-325» بیرون از آن.
 *
 * ⚠️ قاعده‌ها:
 *  - شماره در هر پروژه یکتاست و هرگز دوباره داده نمی‌شود (تریگرِ ۰۰۴۹).
 *  - ارقام لاتین نمایش داده می‌شوند؛ ورودیِ فارسی/عربی هم پذیرفته می‌شود.
 *  - کارفرما شماره نمی‌بیند (فاصلهٔ شماره‌ها وجودِ تسکِ پنهان را لو می‌دهد)؛
 *    این را سرور با `number: null` اعمال می‌کند، نه این فایل.
 */

/** ارقامِ فارسی و عربی ← لاتین. */
export function latinDigits(input: string): string {
  return input
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
}

const CODE = /^[A-Z][A-Z0-9]{1,5}$/;

/** کدِ پروژه معتبر است؟ ۲ تا ۶ حرف/رقمِ لاتین، با حرف شروع می‌شود. */
export function isProjectCode(code: string): boolean {
  return CODE.test(code);
}

/** ورودیِ کاربر ← کدِ استاندارد (بزرگ، بی‌فاصله)؛ نامعتبر ← null. */
export function normalizeProjectCode(input: string): string | null {
  const code = latinDigits(input).trim().toUpperCase();
  return CODE.test(code) ? code : null;
}

/** کدی که پیش‌فرض نشان داده می‌شود: کدِ ذخیره‌شده، وگرنه P + شناسه. */
export function projectCodeOf(project: { id: number; code?: string | null }): string {
  return project.code || `P${project.id}`;
}

/**
 * پیشنهادِ کد از عنوان — سه حرفِ اولِ لاتین؛ عنوانِ فارسی/کوتاه ← P + شناسه.
 * (همان قاعدهٔ پرکردنِ مهاجرتِ ۰۰۴۹.)
 */
export function suggestProjectCode(title: string, id: number): string {
  const latin = title.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return latin.length >= 2 && /^[A-Z]/.test(latin) ? latin.slice(0, 3) : `P${id}`;
}

/** «#325» — داخلِ همان پروژه. */
export function taskRefLocal(number: number): string {
  return `#${number}`;
}

/** «ALZ-325» — بیرون از پروژه. */
export function taskRefGlobal(project: { id: number; code?: string | null }, number: number): string {
  return `${projectCodeOf(project)}-${number}`;
}

export type ParsedTaskRef =
  | { kind: 'local'; number: number }
  | { kind: 'global'; code: string; number: number };

/**
 * متنِ کاربر ← ارجاع: «325»، «#325»، «#۳۲۵»، «alz-325»، «ALZ 325».
 * هر چیزِ دیگری ← null (جستجوی عادی روی عنوان).
 */
export function parseTaskRef(input: string): ParsedTaskRef | null {
  const s = latinDigits(input).trim();
  const local = /^#?\s*(\d{1,7})$/.exec(s);
  if (local) {
    const number = Number(local[1]);
    return number > 0 ? { kind: 'local', number } : null;
  }
  const global = /^([A-Za-z][A-Za-z0-9]{1,5})\s*[-‐–\s#]\s*(\d{1,7})$/.exec(s);
  if (global) {
    const number = Number(global[2]);
    return number > 0 ? { kind: 'global', code: global[1]!.toUpperCase(), number } : null;
  }
  return null;
}

/**
 * ارجاع‌های داخلِ یک متن (کامنت/یادداشت) — برای پیوند کردنشان.
 * «#325» فقط وقتی به عدد یا حرفِ قبلی نچسبیده باشد (نه «abc#3» یا رنگِ «#fff»).
 */
export const TASK_REF_IN_TEXT = /(^|[^\w#&/])(#(\d{1,7})|([A-Z][A-Z0-9]{1,5})-(\d{1,7}))(?![\w-])/g;

export type TextPiece =
  | { kind: 'text'; text: string }
  | { kind: 'ref'; text: string; code: string | null; number: number };

/** متن ← تکه‌های متن و ارجاع، برای پیوند کردنِ «#325» و «ALZ-325» در کامنت. */
export function splitTaskRefs(text: string): TextPiece[] {
  const out: TextPiece[] = [];
  let last = 0;
  for (const m of text.matchAll(new RegExp(TASK_REF_IN_TEXT.source, 'g'))) {
    const start = m.index! + m[1]!.length;
    if (start > last) out.push({ kind: 'text', text: text.slice(last, start) });
    out.push(m[3]
      ? { kind: 'ref', text: m[2]!, code: null, number: Number(m[3]) }
      : { kind: 'ref', text: m[2]!, code: m[4]!, number: Number(m[5]) });
    last = start + m[2]!.length;
  }
  if (last < text.length) out.push({ kind: 'text', text: text.slice(last) });
  return out;
}
