/**
 * مرخصیِ موردی — پورتِ `Support\Absences` نسخهٔ قبلی.
 *
 * این کنارِ برنامهٔ هفتگی (`weekly.ts`) می‌نشیند: آن الگوی تکرارشونده است و
 * این استثنای تقویمی.
 *
 * ⚠️ نکتهٔ محوری: بازهٔ همپوشان **ادغام** می‌شود، نه رد. نسخهٔ قبلی صریحاً همین
 * کار را می‌کند و دلیلش کاربردی است: کسی که مرخصی‌اش را یک روز تمدید می‌کند
 * نباید دو ردیفِ تکه‌تکه بسازد. «چسبیده» هم ادغام می‌شود (فاصلهٔ یک روز)،
 * وگرنه مرخصیِ پنج‌شنبه و جمعه دو ردیفِ جدا می‌ماند در حالی که یک غیبتِ
 * پیوسته است.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface AbsenceRow {
  id: number;
  fromDate: string;
  toDate: string;
  note: string;
}

export interface AbsencePlan {
  /** ردیفِ تازه، یا بازنویسیِ ردیفِ موجود با بازهٔ گسترده. */
  kind: 'insert' | 'merge';
  fromDate: string;
  toDate: string;
  note: string;
  /** فقط در ادغام — ردیفی که می‌ماند و گسترده می‌شود. */
  keepId?: number;
  /** فقط در ادغام — ردیف‌های اضافه که در ردیفِ نگه‌داشته حل می‌شوند. */
  deleteIds: number[];
}

/** تاریخِ معتبرِ `Y-m-d`، وگرنه رشتهٔ خالی. */
export function cleanDate(value: unknown): string {
  const text = String(value ?? '').trim().slice(0, 10);
  return DATE_RE.test(text) ? text : '';
}

function shift(date: string, days: number): string {
  // ⚠️ ساعتِ ۱۲ ظهرِ UTC، نه نیمه‌شب: با نیمه‌شب یک ثانیه اختلافِ منطقهٔ
  // زمانی می‌تواند تاریخ را یک روز بلغزاند.
  const at = new Date(`${date}T12:00:00Z`);
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
}

/**
 * بازهٔ پاک‌شده؛ اگر «تا» پیش از «از» باشد جابه‌جا می‌شود.
 * `null` یعنی ورودی اصلاً تاریخ نبود.
 */
export function normalizeRange(from: unknown, to: unknown): { from: string; to: string } | null {
  const a = cleanDate(from);
  const b = cleanDate(to);
  if (a === '' || b === '') return null;
  // ⚠️ جابه‌جایی به‌جای خطا: کاربری که تاریخ‌ها را برعکس زده منظورش روشن
  // است؛ پیغامِ خطا فقط یک کلیکِ اضافه است.
  return b < a ? { from: b, to: a } : { from: a, to: b };
}

/**
 * پنجرهٔ جست‌وجوی ردیف‌های همپوشان یا **چسبیده**.
 *
 * ⚠️ یک روز از هر طرف باز می‌شود تا بازهٔ دقیقاً مجاور هم ادغام شود
 * (`to = فردای from ِ موجود`). بدونِ این، هر تمدیدِ یک‌روزه یک ردیفِ تازه
 * می‌ساخت.
 */
export function adjacencyWindow(from: string, to: string): { lo: string; hi: string } {
  return { lo: shift(from, -1), hi: shift(to, 1) };
}

/** یادداشت‌های ناتکراریِ ناخالی، با « · » به هم. */
export function joinNotes(notes: readonly string[]): string {
  const clean = notes.map((n) => n.trim()).filter((n) => n !== '');
  return [...new Set(clean)].join(' · ');
}

/**
 * نقشهٔ ثبتِ مرخصی: ردیفِ تازه یا ادغام در ردیف‌های موجود.
 *
 * @param overlapping ردیف‌هایی که با پنجرهٔ `adjacencyWindow` برخورد دارند،
 * مرتب‌شده بر اساسِ `fromDate` سپس `id` (مثلِ نسخهٔ قبلی —
 *                    اولی همان است که می‌ماند).
 */
export function planAbsence(
  from: unknown,
  to: unknown,
  note: unknown,
  overlapping: readonly AbsenceRow[],
): AbsencePlan | null {
  const range = normalizeRange(from, to);
  if (!range) return null;

  const text = String(note ?? '').trim();

  if (overlapping.length === 0) {
    return { kind: 'insert', fromDate: range.from, toDate: range.to, note: text, deleteIds: [] };
  }

  const keep = overlapping[0]!;
  let min = range.from;
  let max = range.to;
  const notes: string[] = [];

  for (const row of overlapping) {
    if (row.fromDate < min) min = row.fromDate;
    if (row.toDate > max) max = row.toDate;
    if (row.note.trim() !== '') notes.push(row.note);
  }
  if (text !== '') notes.push(text);

  return {
    kind: 'merge',
    fromDate: min,
    toDate: max,
    note: joinNotes(notes),
    keepId: keep.id,
    deleteIds: overlapping.slice(1).map((r) => r.id),
  };
}
