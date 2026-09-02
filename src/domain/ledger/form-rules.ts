/**
 * قواعدِ **وابستگیِ فیلدها** در فرمِ ردیفِ دفتر.
 *
 * منبع: `assets/js/admin-accounting.js` (`applyAccCond`, `filterAccTags`,
 * `computeSettled`, `unitPicker`) + `templates/admin/accounting/add-form.php`.
 *
 * ⚠️ این‌ها فقط «زیبایی» نیستند — هر کدام جلوی یک ثبتِ مالیِ غلط را می‌گیرند.
 * به همین دلیل به‌جای پراکنده‌شدن در JSX، اینجا خالص و آزموده‌شده‌اند.
 */

export type Direction = 'in' | 'out';

/* ------------------------------------------------------------------ *
 * R-FORM-01 — طرفِ حساب با جهت عوض می‌شود
 * ------------------------------------------------------------------ */

/**
 * کدام طرفِ حساب نشان داده شود؟
 * واریز ← پرداخت‌کننده · برداشت ← دریافت‌کننده.
 */
export function visibleParty(direction: Direction): 'payer' | 'receiver' {
  return direction === 'out' ? 'receiver' : 'payer';
}

export interface PartyValue {
  userId: number | null;
  label: string;
}

export interface PartyState {
  payer: PartyValue;
  receiver: PartyValue;
}

const EMPTY: PartyValue = { userId: null, label: '' };

function isEmpty(v: PartyValue): boolean {
  return !v.userId && !v.label.trim();
}

/**
 * جابه‌جاییِ مقدار هنگامِ تغییرِ جهت.
 *
 * ⚠️ مقدار به خانهٔ **نمایان** منتقل می‌شود (فقط اگر خالی باشد) و خانهٔ پنهان
 * پاک می‌گردد. بدونِ این، کاربر «مالک» را به‌عنوانِ پرداخت‌کننده می‌نوشت،
 * جهت را به برداشت عوض می‌کرد، و ردیف با یک پرداخت‌کنندهٔ **نامرئی** ذخیره
 * می‌شد — دقیقاً همان چیزی که کامنتِ نسخهٔ قبلی دربارهٔ «مقدارِ کهنه در خانهٔ
 * اشتباه» هشدار می‌دهد.
 */
export function relocateParty(state: PartyState, next: Direction): PartyState {
  const showing = visibleParty(next);
  const from = showing === 'receiver' ? state.payer : state.receiver;
  const to = showing === 'receiver' ? state.receiver : state.payer;

  const moved = isEmpty(to) && !isEmpty(from) ? from : to;

  return showing === 'receiver'
    ? { payer: EMPTY, receiver: moved }
    : { payer: moved, receiver: EMPTY };
}

/* ------------------------------------------------------------------ *
 * R-FORM-02 — «قابلِ بازپرداخت از کارفرما»
 * ------------------------------------------------------------------ */

/**
 * چک‌باکسِ بازپرداخت فقط وقتی معنا دارد که: **برداشت** باشد، **پروژه** داشته
 * باشد، و دریافت‌کننده **عضوِ همان پروژه نباشد**.
 *
 * ⚠️ شرطِ سوم مهم‌ترین است: پرداخت به عضو یک **دستمزد** است، نه هزینه‌ای که
 * از کارفرما پس گرفته شود. بدونِ آن، دستمزدِ عضو دوباره به کارفرما صورت‌حساب
 * می‌شد.
 */
export function showsBillable(input: {
  direction: Direction;
  projectId: number | null;
  receiverUserId: number | null;
  projectMemberIds: readonly number[];
}): boolean {
  if (input.direction !== 'out') return false;
  if (!input.projectId) return false;
  if (input.receiverUserId && input.projectMemberIds.includes(input.receiverUserId)) return false;
  return true;
}

/* ------------------------------------------------------------------ *
 * R-FORM-03 — هزینهٔ دوره‌ای فقط برای برداشت
 * ------------------------------------------------------------------ */

export function showsRecurring(direction: Direction): boolean {
  return direction === 'out';
}

/* ------------------------------------------------------------------ *
 * R-FORM-04 — تگ‌های دفتر با جهت فیلتر می‌شوند
 * ------------------------------------------------------------------ */

export interface DirectionalTag {
  id: number;
  name: string;
  /** `both` | `in` | `out` */
  dir: string;
}

/**
 * آیا این تگ در این جهت قابلِ **انتخاب** است؟
 *
 * ⚠️ تگی که همین حالا انتخاب شده، حتی اگر با جهتِ تازه نخواند، **می‌ماند** —
 * وگرنه عوض‌کردنِ جهت هنگامِ ویرایش، تگِ ذخیره‌شده را بی‌صدا می‌انداخت.
 * کاربر خودش با × برش می‌دارد.
 */
export function isTagSelectable(tag: DirectionalTag, direction: Direction, isSelected: boolean): boolean {
  if (isSelected) return true;
  const dir = tag.dir || 'both';
  return dir === 'both' || dir === direction;
}

export function selectableTags(
  tags: readonly DirectionalTag[],
  direction: Direction,
  selectedIds: readonly number[],
): DirectionalTag[] {
  return tags.filter((t) => isTagSelectable(t, direction, selectedIds.includes(t.id)));
}

/* ------------------------------------------------------------------ *
 * R-FORM-05 — بلوکِ «معادل» و ارزِ هدفش
 * ------------------------------------------------------------------ */

/** بلوکِ معادل فقط وقتی پروژه انتخاب شده باشد دیده می‌شود. */
export function showsSettled(projectId: number | null): boolean {
  return Boolean(projectId);
}

/**
 * ارزِ پیش‌فرضِ بلوکِ معادل.
 *
 * ترتیبِ اولویت — دقیقاً مثلِ `computeSettled()`:
 *  ۱. برداشت + دریافت‌کنندهٔ عضو ← ارزِ **قراردادِ همان عضو در همان پروژه**
 *  ۲. وگرنه ارزِ پروژه
 *  ۳. وگرنه ارزِ پیش‌فرضِ سامانه
 */
export function settledCurrencyId(input: {
  direction: Direction;
  projectId: number | null;
  receiverUserId: number | null;
  memberCurrency: ReadonlyMap<string, number>;
  projectCurrency: ReadonlyMap<number, number>;
  defaultCurrencyId: number | null;
}): number | null {
  if (!input.projectId) return null;

  if (input.direction === 'out' && input.receiverUserId) {
    const key = `${input.projectId}:${input.receiverUserId}`;
    const memberCur = input.memberCurrency.get(key);
    if (memberCur) return memberCur;
  }

  return input.projectCurrency.get(input.projectId) ?? input.defaultCurrencyId ?? null;
}

/**
 * نرخِ تبدیلِ دوطرفه: «۱ واحدِ معادل = نرخ واحدِ حساب»، پس
 * `مبلغ = معادل × نرخ`.
 *
 * ⚠️ گردکردن تا شش رقم، وگرنه تایپ در یک فیلد، فیلدِ دیگر را با دنبالهٔ
 * اعشارِ شناور پر می‌کند و کاربر فکر می‌کند عدد خراب شده.
 */
export function fxRound(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

/**
 * ⚠️ `settled <= 0` هم رد می‌شود، نه فقط `rate <= 0` — قرینهٔ
 * `rateFromAmounts`، که این گارد را از اول داشت.
 *
 * بدونِ آن «معادلِ» خالی `Number('') === 0` می‌شد و حاصل‌ضرب یک صفرِ
 * **معتبر** برمی‌گرداند؛ یعنی کاربر مبلغ را می‌نوشت، بعد در «نرخ» یک رقم
 * می‌زد و مبلغش بی‌صدا «۰» می‌شد. از بیرون شبیهِ «فیلدِ مبلغ چیزی
 * نمی‌پذیرد» دیده می‌شد.
 */
export function amountFromSettled(settled: number, rate: number): number | null {
  if (!Number.isFinite(settled) || !Number.isFinite(rate)) return null;
  if (settled <= 0 || rate <= 0) return null;
  return fxRound(settled * rate);
}

/**
 * معادل از مبلغ و نرخ: `معادل = مبلغ ÷ نرخ` — پورتِ «rate typed → settled = amount ÷ rate».
 *
 * ⚠️ فرم هرگز **مبلغ** را بازنویسی نمی‌کند (پورتِ افزونه): مبلغ همان است که
 * از حساب رفته؛ معادل و نرخ از آن مشتق می‌شوند، نه برعکس. پیش از این تایپِ
 * معادل یا نرخ، مبلغِ بانکیِ نوشته‌شده را عوض می‌کرد.
 */
export function settledFromAmount(amount: number, rate: number): number | null {
  if (!Number.isFinite(amount) || !Number.isFinite(rate)) return null;
  if (amount <= 0 || rate <= 0) return null;
  return fxRound(amount / rate);
}

export function rateFromAmounts(amount: number, settled: number): number | null {
  if (!Number.isFinite(amount) || !Number.isFinite(settled) || settled <= 0) return null;
  return fxRound(amount / settled);
}

/* ------------------------------------------------------------------ *
 * R-FORM-06 — انتخابگرِ کارکرد
 * ------------------------------------------------------------------ */

/**
 * فهرستِ کارکردِ پرداخت‌نشده فقط وقتی نشان داده می‌شود که: برداشت +
 * دریافت‌کنندهٔ عضو + پروژهٔ انتخاب‌شده.
 */
export function showsUnitPicker(input: {
  direction: Direction;
  projectId: number | null;
  receiverUserId: number | null;
}): boolean {
  return input.direction === 'out' && Boolean(input.projectId) && Boolean(input.receiverUserId);
}

/* ------------------------------------------------------------------ *
 * R-FORM-07 — توضیحاتِ اجباریِ ردیفِ پروژه‌دار
 * ------------------------------------------------------------------ */

/**
 * ⚠️ ردیفی که به پروژه وصل است **باید** توضیح داشته باشد.
 * نسخهٔ قبلی عمداً از `required` ِ مرورگر استفاده نمی‌کند تا پیام فارسی و یکسان
 * بماند — همان کار را اینجا هم می‌کنیم.
 */
export function requiresDescription(projectId: number | null): boolean {
  return Boolean(projectId);
}
