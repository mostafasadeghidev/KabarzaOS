/**
 * محاسبهٔ مبالغِ یک تراکنش — قواعدِ docs/rules/LEDGER.md
 *
 * هر ردیفِ دفترکل چهار مبلغ ذخیره می‌کند، نه یکی. دلیلش این است که
 * حساب، دفتر و گزارشِ کلی هرکدام ارزِ خودشان را دارند و جمع‌زدنِ مبالغ
 * با ارزهای مختلف بی‌معنی است.
 */

import { convert, effectiveRate, type RateSource } from '../currency/rates';

export interface AmountInput {
  /** مبلغ در ارزی که کاربر وارد کرده. */
  amount: string;
  currencyId: number;
  /** ارزِ حساب — مرجعِ محاسبهٔ مانده (R-LEDGER-02). */
  accountCurrencyId: number;
  /** ارزِ پیش‌فرضِ دفتر — برای گزارشِ منطقه‌ای. */
  officeCurrencyId: number;
  /** ارزِ پایهٔ گزارش (یورو). */
  baseCurrencyId: number;
  /**
   * R-LEDGER-03 — مبلغِ واقعیِ رسیده به حساب.
   * اگر داده شود بر نرخِ بازار **مقدم است** و نرخِ ذخیره‌شده از آن محاسبه می‌شود.
   * کارمزد و مالیاتِ انتقال این‌طور طبیعی ثبت می‌شود.
   */
  amountAccountOverride?: string | null;
}

/**
 * نرخِ ارز برای این تبدیل ثبت نشده.
 *
 * ⚠️ دامنه `missingRates` را از اول برمی‌گرداند (R-MONEY-06: نبودِ نرخ
 * بی‌صدا ۱ نمی‌شود)، ولی هیچ فراخوانی نمی‌خواندش — ردیف با مبلغِ حسابِ صفر
 * ثبت می‌شد. حالا سرویس روی آن خطا می‌دهد، مگر کاربر مبلغِ واقعاً رسیده
 * به حساب را خودش نوشته باشد.
 */
export class MissingRateError extends Error {
  constructor(readonly currencyIds: number[]) {
    super('exchange rate missing');
    this.name = 'MissingRateError';
  }
}

export interface ComputedAmounts {
  amountAccount: string;
  amountOffice: string;
  amountEur: string;
  exchangeRate: string;
  /** ارزهایی که نرخ نداشتند — فراخوان باید تصمیم بگیرد (R-MONEY-06). */
  missingRates: number[];
}

/**
 * چهار رقمِ ذخیره‌شده را محاسبه می‌کند.
 *
 * ⚠️ برخلافِ نسخهٔ قبلی، نبودِ نرخ **بی‌صدا ۱ نمی‌شود**؛ در `missingRates` گزارش
 * می‌شود تا لایهٔ بالاتر یا خطا بدهد یا از کاربر مبلغِ واقعی بخواهد.
 */
export function computeAmounts(source: RateSource, input: AmountInput): ComputedAmounts {
  const missing: number[] = [];

  const converted = (to: number): string => {
    const out = convert(source, input.amount, input.currencyId, to);
    if (out === null) {
      missing.push(to);
      return '0';
    }
    return out;
  };

  // R-LEDGER-03 — مبلغِ واقعیِ رسیده مقدم است.
  const hasOverride =
    input.amountAccountOverride !== null &&
    input.amountAccountOverride !== undefined &&
    input.amountAccountOverride !== '';

  const amountAccount = hasOverride ? input.amountAccountOverride! : converted(input.accountCurrencyId);

  return {
    amountAccount,
    amountOffice: converted(input.officeCurrencyId),
    amountEur: converted(input.baseCurrencyId),
    // R-LEDGER-01 — نرخ روی خودِ ردیف منجمد می‌شود و دیگر بازمحاسبه نمی‌شود.
    exchangeRate: effectiveRate(input.amount, amountAccount),
    missingRates: [...new Set(missing)],
  };
}

/* ------------------------------------------------------------------ *
 * انتقالِ داخلی
 * ------------------------------------------------------------------ */

export interface TransferInput {
  fromAccountId: number;
  toAccountId: number;
  /** مبلغی که از مبدأ خارج شد، در ارزِ حسابِ مبدأ. */
  fromAmount: string;
  /** مبلغی که واقعاً به مقصد رسید، در ارزِ حسابِ مقصد. */
  toAmount: string;
  entryDate: string;
  /** شرحِ آزاد — روی هر دو لِگ می‌نشیند (پورتِ فیلدِ توضیحِ فرمِ انتقال). */
  description?: string;
  /** رسیدِ انتقال — روی هر دو لِگ می‌نشیند (پورتِ `receipt_attachment_id`). */
  receiptIds?: number[];
}

export class TransferValidationError extends Error {
  constructor(readonly code: 'accounts' | 'same_account' | 'amount') {
    super(`transfer invalid: ${code}`);
    this.name = 'TransferValidationError';
  }
}

/**
 * R-LEDGER-05 — گاردهای انتقال.
 * ⚠️ **هر دو مبلغ اجباری‌اند** — سیستم مبلغِ مقصد را حدس نمی‌زند، چون
 * کارمزد و اختلافِ نرخ فقط با مبلغِ واقعیِ رسیده ثبت می‌شود.
 */
export function validateTransfer(input: TransferInput): void {
  if (!input.fromAccountId || !input.toAccountId) {
    throw new TransferValidationError('accounts');
  }
  if (input.fromAccountId === input.toAccountId) {
    throw new TransferValidationError('same_account');
  }
  const from = Number(input.fromAmount);
  const to = Number(input.toAmount);
  if (!(from > 0) || !(to > 0)) {
    throw new TransferValidationError('amount');
  }
}

/** یک لِگِ انتقال — دو تا از این‌ها یک انتقال می‌سازند. */
export interface TransferLeg {
  accountId: number;
  direction: 'in' | 'out';
  amount: string;
  transferGroup: string;
  counterpartAccountId: number;
}

/**
 * R-LEDGER-04 — انتقال = دو لِگ، هرکدام در ارزِ حسابِ خودش، با گروهِ مشترک.
 * R-LEDGER-06 — ردیف‌های دارای transferGroup باید از گزارشِ درآمد/هزینه کنار بروند.
 */
export function buildTransferLegs(input: TransferInput, transferGroup: string): [TransferLeg, TransferLeg] {
  validateTransfer(input);
  return [
    {
      accountId: input.fromAccountId,
      direction: 'out',
      amount: input.fromAmount,
      transferGroup,
      counterpartAccountId: input.toAccountId,
    },
    {
      accountId: input.toAccountId,
      direction: 'in',
      amount: input.toAmount,
      transferGroup,
      counterpartAccountId: input.fromAccountId,
    },
  ];
}

/* ------------------------------------------------------------------ *
 * اعتبارسنجیِ ردیفِ دفتر
 * ------------------------------------------------------------------ */

export class LedgerValidationError extends Error {
  constructor(readonly code: 'note_required' | 'amount_invalid' | 'no_account') {
    super(`ledger entry invalid: ${code}`);
    this.name = 'LedgerValidationError';
  }
}

export interface EntryDraft {
  amount: string;
  accountId: number | null;
  projectId: number | null;
  description: string;
}

/**
 * ⚠️ R-LEDGER-12 — ردیفِ **مرتبط با پروژه** حتماً باید توضیحات داشته باشد.
 *
 * چرا: نامِ پروژه روی ردیف عکسِ لحظه‌ای است؛ اگر پروژه بعداً حذف یا جدا شود،
 * تنها چیزی که در نمای مالیِ کارفرما و عضو می‌ماند همین توضیحات است. بدونِ
 * آن یک مبلغِ بی‌شرح باقی می‌ماند که هیچ‌کس نمی‌داند بابتِ چه بوده.
 */
export function validateEntry(draft: EntryDraft): void {
  if (draft.accountId === null) throw new LedgerValidationError('no_account');
  if (!/^\d+(\.\d{1,4})?$/.test(draft.amount) || Number(draft.amount) <= 0) {
    throw new LedgerValidationError('amount_invalid');
  }
  if (draft.projectId !== null && draft.description.trim() === '') {
    throw new LedgerValidationError('note_required');
  }
}
