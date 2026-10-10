/**
 * نامِ ردیفِ کارکرد (۲.۲۱.۰) — مثلاً «CAT» داخلِ پروژهٔ «Simon Zickert media».
 *
 * نام داخلِ یک پروژه یکتاست (بی‌توجه به بزرگی/کوچکیِ حرف) و خالی یعنی بی‌نام.
 * در فهرست‌ها، جستجو و ثبتِ ساعت به شکلِ «نامِ پروژه - نامِ ردیف» نشان داده می‌شود.
 */

export const ENTRY_NAME_MAX = 80;

export type EntryName = { ok: true; name: string } | { ok: false; error: 'too_long' };

/** فاصله‌های اضافه را یکی می‌کند و طول را می‌سنجد؛ خالی مجاز است. */
export function normalizeEntryName(raw: string | null | undefined): EntryName {
  const name = (raw ?? '').replace(/\s+/g, ' ').trim();
  if (name.length > ENTRY_NAME_MAX) return { ok: false, error: 'too_long' };
  return { ok: true, name };
}

/** «Simon Zickert media - CAT»؛ بی‌نام فقط نامِ پروژه. */
export function entryLabel(projectTitle: string, name: string | null | undefined): string {
  const n = (name ?? '').trim();
  return n === '' ? projectTitle : `${projectTitle} - ${n}`;
}

/**
 * مقصدِ ثبتِ ساعت از فرم: `''` ساعتِ عمومی، `57` پروژه، `57:12` ردیفِ ۱۲ از پروژهٔ ۵۷.
 * ورودیِ خراب هم به «عمومی» نمی‌افتد؛ `null` می‌دهد تا فراخوان خطا بدهد.
 */
export function parseHoursTarget(raw: string | null | undefined): { projectId: number | null; unitEntryId: number | null } | null {
  const text = (raw ?? '').trim();
  if (text === '') return { projectId: null, unitEntryId: null };
  const m = /^(\d+)(?::(\d+))?$/.exec(text);
  if (!m) return null;
  const projectId = Number(m[1]);
  const unitEntryId = m[2] === undefined ? null : Number(m[2]);
  if (!Number.isSafeInteger(projectId) || projectId <= 0) return null;
  if (unitEntryId !== null && (!Number.isSafeInteger(unitEntryId) || unitEntryId <= 0)) return null;
  return { projectId, unitEntryId };
}
