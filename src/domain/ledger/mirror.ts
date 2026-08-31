/**
 * آینه‌کردنِ ردیفِ دفتر در «پرداخت‌های پروژه».
 *
 * ⚠️ چرا اصلاً دو جدول؟ `ledger` دفترِ **حسابداری** است (پول از کدام حساب
 * رفت) و `project_payments` دفترِ **تعهدات** (چه کسی بابتِ چه چیزی چقدر
 * گرفت یا داد). گزارشِ پروژه، فاکتورِ کارفرما و تسویهٔ عضو همه از دومی
 * می‌خوانند؛ بدونِ این آینه، ثبتِ ردیفِ مالی هیچ اثری روی هیچ‌کدام ندارد.
 */

export type PayDirection = 'incoming' | 'member_payout' | 'project_expense' | 'project_cost';

export interface MirrorInput {
  /** جهتِ ردیفِ دفتر. */
  direction: 'in' | 'out';
  /** ۰ یا null یعنی ردیفِ بی‌پروژه. */
  projectId: number | null;
  payerUserId: number | null;
  receiverUserId: number | null;
  /** آیا گیرنده عضوِ همین پروژه است؟ (از `project_members` خوانده می‌شود) */
  receiverIsMember: boolean;
  /**
   * هزینهٔ بیرونی به کارفرما صورتحساب می‌شود؟
   * ⚠️ پیش‌فرض **true** است، مثلِ نسخهٔ قبلی: هزینهٔ پروژه معمولاً به کارفرما
   * می‌خورد و «جذب‌شده» استثناست.
   */
  billable: boolean;
}

export interface MirrorPlan {
  direction: PayDirection;
  /** فردی که این ردیف به او منسوب است؛ ممکن است null باشد (هزینهٔ فروشنده). */
  userId: number | null;
  /**
   * `null` یعنی «بدونِ پروژه».
   * ⚠️ نسخهٔ قبلی اینجا صفر می‌گذاشت؛ ما `null` می‌گذاریم چون ستون کلیدِ خارجی
   * است و صفر ارجاعِ شکسته می‌سازد. معنا یکی است، نمایندگی متفاوت.
   */
  projectId: number | null;
}

/**
 * تصمیمِ آینه. `null` یعنی چیزی ثبت نمی‌شود.
 *
 * ⚠️ ردیفِ **بی‌پروژه** هم آینه می‌شود (با `projectId = 0`) به شرطی که به
 * فردی منسوب باشد — تا در نمای مالیِ همان فرد و فهرستِ «پرداخت‌های بدونِ
 * پروژه» دیده شود. کارمزدِ بانک یا هزینهٔ فروشندهٔ بی‌نام آینه نمی‌شود،
 * چون به هیچ‌کس منسوب نیست.
 */
export function planPaymentMirror(input: MirrorInput): MirrorPlan | null {
  const projectId = input.projectId && input.projectId > 0 ? input.projectId : null;

  if (projectId === null) {
    if (input.direction === 'in' && input.payerUserId) {
      return { direction: 'incoming', userId: input.payerUserId, projectId: null };
    }
    if (input.direction === 'out' && input.receiverUserId) {
      return { direction: 'member_payout', userId: input.receiverUserId, projectId: null };
    }
    return null; // به کسی منسوب نیست.
  }

  // ورودیِ پروژه = کارفرما (یا هر کسی) به شرکت پرداخت کرده.
  if (input.direction === 'in') {
    return { direction: 'incoming', userId: input.payerUserId, projectId };
  }

  /**
   * خروجیِ پروژه دو حالت دارد و تشخیصشان **عضویت** است، نه نوعِ ردیف:
   * پرداخت به عضوِ همین پروژه = دستمزد؛ هر چیزِ دیگر = هزینهٔ بیرونی.
   */
  if (input.receiverIsMember && input.receiverUserId) {
    return { direction: 'member_payout', userId: input.receiverUserId, projectId };
  }

  return {
    direction: input.billable ? 'project_expense' : 'project_cost',
    userId: input.receiverUserId,
    projectId,
  };
}

/** برچسبِ «بابت پروژه» — همان تگی که نسخهٔ قبلی می‌زند. */
const PROJECT_TAG = 'بابت پروژه:';

/**
 * یادداشتِ پرداخت که **همیشه** نامِ پروژه را با خود دارد.
 *
 * ⚠️ عکسِ لحظه‌ای است، نه پیوند: اگر فردا پروژه حذف یا جدا شود، ردیفِ مالی
 * در نمای کارفرما و عضو همچنان خوانا می‌ماند.
 * ⚠️ اگر برچسب از قبل در متن باشد دوباره اضافه نمی‌شود — وگرنه ویرایشِ
 * چندبارهٔ یک ردیف، دم‌به‌دم برچسب می‌چسباند.
 */
export function paymentNote(description: string, projectTitle: string | null): string {
  const text = description.trim();
  if (!projectTitle) return text;
  if (text.includes(PROJECT_TAG)) return text;

  const tag = `${PROJECT_TAG} ${projectTitle.trim()}`;
  return text ? `${text} — ${tag}` : tag;
}

/**
 * نرخِ ارزی که از یک تسویهٔ بین‌ارزی **آموخته** می‌شود.
 *
 * ⚠️ نرخِ تایپ‌شدهٔ کاربر مقدم است؛ وگرنه از خودِ دو مبلغ مشتق می‌شود
 * (`amount ÷ settled`). `null` یعنی چیزی برای آموختن نیست: یا تسویه‌ای در
 * کار نبوده، یا هر دو ارز یکی‌اند، یا نرخ نامعتبر است.
 */
export function learnedRate(input: {
  amount: string;
  amountSettled: string | null;
  currencyId: number;
  settledCurrencyId: number | null;
  typedRate?: string | null;
}): { from: number; to: number; rate: string } | null {
  const { settledCurrencyId, currencyId } = input;
  if (!input.amountSettled || !settledCurrencyId) return null;
  if (settledCurrencyId === currencyId) return null;

  const typed = Number(input.typedRate ?? 0);
  const settled = Number(input.amountSettled);
  const amount = Number(input.amount);

  const rate = typed > 0 ? typed : (settled > 0 ? amount / settled : 0);
  if (!(rate > 0) || !Number.isFinite(rate)) return null;

  // «۱ واحدِ ارزِ تسویه = rate واحدِ ارزِ ردیف».
  return { from: settledCurrencyId, to: currencyId, rate: String(rate) };
}
