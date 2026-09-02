'use server';

import { revalidatePath } from 'next/cache';
import { requireActor } from '@/server/auth';
import {
  decideRequest, deleteRecurring, payRecurring, payRequest, payUnit, PayoutError, saveRecurring,
} from '@/server/finance/payouts';
import { MissingRateError } from '@/domain/ledger/amounts';
import { ForbiddenError } from '@/domain/access/guard';
import { FiscalPeriodLockedError } from '@/domain/ledger/fiscal';
import { LedgerValidationError } from '@/domain/ledger/amounts';
import { AccountError, accountMessage } from '@/domain/finance/accounts';
import { RecurringPayError, type ExpenseKind } from '@/domain/finance/recurring';
import { getT } from '@/i18n/server';

/** اقدام‌های پرداخت‌ها و هزینه‌های دوره‌ای. */

export interface PayoutState {
  error?: string;
  ok?: boolean;
}

async function explain(error: unknown, fallback: string): Promise<string> {
  const t = await getT();
  if (error instanceof FiscalPeriodLockedError) {
    return t('این دوره تا تاریخ {date} قفل (بسته) شده و قابل تغییر نیست.', { date: error.lockDate });
  }
  if (error instanceof RecurringPayError) {
    return error.code === 'already_paid'
      ? 'این پرداخت قبلاً ثبت شده است.'
      : 'هزینهٔ دوره‌ای یافت نشد.';
  }
  if (error instanceof PayoutError) {
    if (error.code === 'rejected') return 'درخواستِ ردشده پرداخت نمی‌شود.';
    if (error.code === 'already_paid') return 'این درخواست قبلاً پرداخت شده است.';
    if (error.code === 'no_currency') return 'ارزِ این مورد مشخص نیست.';
    if (error.code === 'not_approved') return 'درخواست هنوز تأیید نشده است.';
    if (error.code === 'has_request') return 'برای این کارکرد درخواستِ بازی هست؛ از مسیرِ درخواست پرداخت کنید.';
    return 'مورد پیدا نشد.';
  }
  if (error instanceof MissingRateError) {
    return 'نرخِ ارز برای این تبدیل ثبت نشده است. نرخ را در تنظیمات اضافه کنید یا مبلغِ واقعی از حساب را بنویسید.';
  }
  if (error instanceof AccountError) return accountMessage(error.code);
  if (error instanceof LedgerValidationError) return 'اطلاعاتِ ردیفِ دفتر کامل نیست.';
  if (error instanceof ForbiddenError) return 'دسترسی کافی ندارید.';
  return fallback;
}

async function run(fn: (actor: Awaited<ReturnType<typeof requireActor>>) => Promise<unknown>, fallback: string) {
  try {
    await fn(await requireActor());
  } catch (error) {
    return { error: await explain(error, fallback) };
  }
  revalidatePath('/finance');
  return { ok: true };
}

export async function decideRequestAction(
  requestId: number,
  decision: 'approved' | 'rejected',
  note = '',
): Promise<PayoutState> {
  return run((actor) => decideRequest(actor, requestId, decision, note), 'تصمیم ثبت نشد.');
}

export async function payRequestAction(_prev: PayoutState, formData: FormData): Promise<PayoutState> {
  const requestId = Number(formData.get('requestId'));
  const accountId = Number(formData.get('accountId'));
  const entryDate = String(formData.get('entryDate') ?? '');
  const amount = bankAmountField(formData);
  if (amount === false) return { error: 'مبلغِ بانکی معتبر نیست.' };

  if (!Number.isInteger(requestId) || !Number.isInteger(accountId)) {
    return { error: 'درخواست یا حساب معتبر نیست.' };
  }
  return run((actor) => payRequest(actor, requestId, { accountId, entryDate, amount }), 'پرداخت ثبت نشد.');
}

/** مبلغِ واقعی از حساب — اختیاری؛ خالی یعنی «همان مبلغِ تعهد». */
function bankAmountField(formData: FormData): string | null | false {
  const raw = String(formData.get('amount') ?? '').trim();
  if (raw === '') return null;
  return /^\d+(\.\d{1,4})?$/.test(raw) ? raw : false;
}

/** پرداختِ مستقیمِ یک ردیفِ کارِ تعدادی (Flow 1 ِ افزونه). */
export async function payUnitAction(_prev: PayoutState, formData: FormData): Promise<PayoutState> {
  const unitEntryId = Number(formData.get('unitEntryId'));
  const accountId = Number(formData.get('accountId'));
  const entryDate = String(formData.get('entryDate') ?? '');
  const amount = bankAmountField(formData);
  if (amount === false) return { error: 'مبلغِ بانکی معتبر نیست.' };
  if (!Number.isInteger(unitEntryId) || !Number.isInteger(accountId)) {
    return { error: 'کارکرد یا حساب معتبر نیست.' };
  }
  return run((actor) => payUnit(actor, unitEntryId, { accountId, entryDate, amount }), 'پرداخت ثبت نشد.');
}

export async function saveRecurringAction(_prev: PayoutState, formData: FormData): Promise<PayoutState> {
  const num = (name: string) => {
    const n = Number(formData.get(name));
    return Number.isInteger(n) && n > 0 ? n : null;
  };
  const currencyId = num('currencyId');
  if (currencyId === null) return { error: 'ارز را انتخاب کنید.' };
  // پورتِ `pay_now`: نوبتِ اول همین حالا ثبت شود (فقط هنگامِ ساخت).
  const payNow = formData.get('payNow') !== null && num('id') === null;

  return run(async (actor) => {
    const id = await saveRecurring(actor, {
    id: num('id'),
    title: String(formData.get('title') ?? ''),
    amount: String(formData.get('amount') ?? '0'),
    currencyId,
    kind: (String(formData.get('kind') ?? 'recurring') as ExpenseKind),
    intervalUnit: String(formData.get('intervalUnit') ?? 'month'),
    intervalCount: Number(formData.get('intervalCount') ?? 1) || 1,
    startDate: String(formData.get('startDate') ?? ''),
    nextDueDate: String(formData.get('nextDueDate') ?? ''),
    accountId: num('accountId'),
    vendorId: num('vendorId'),
    vendorName: String(formData.get('vendorName') ?? ''),
    categoryTagId: num('categoryTagId'),
    note: String(formData.get('note') ?? ''),
    isActive: formData.get('isActive') !== null,
    });
    if (payNow) await payRecurring(actor, id, null);
  }, 'هزینه ذخیره نشد.');
}

export async function payRecurringAction(id: number, expectedDue: string): Promise<PayoutState> {
  return run((actor) => payRecurring(actor, id, expectedDue), 'پرداخت ثبت نشد.');
}

export async function deleteRecurringAction(id: number): Promise<PayoutState> {
  return run((actor) => deleteRecurring(actor, id), 'هزینه حذف نشد.');
}

/* ---- حساب‌های بانکی ---- */

export async function saveAccountAction(_prev: PayoutState, formData: FormData): Promise<PayoutState> {
  const { saveAccount } = await import('@/server/finance/service');
  const num = (name: string) => {
    const n = Number(formData.get(name));
    return Number.isInteger(n) && n > 0 ? n : null;
  };

  return run((actor) => saveAccount(actor, {
    id: num('id'),
    name: String(formData.get('name') ?? ''),
    type: (String(formData.get('type') ?? 'business') as 'business' | 'personal'),
    officeId: num('officeId'),
    currencyId: num('currencyId'),
    openingBalance: String(formData.get('openingBalance') ?? '0'),
    note: String(formData.get('note') ?? ''),
    sortOrder: Number(formData.get('sortOrder') ?? 0) || 0,
    isActive: formData.get('isActive') !== null,
    scope: (String(formData.get('scope') ?? 'company') as 'company' | 'private'),
    accountantIds: formData.getAll('accountantIds').map(Number).filter((n) => n > 0),
  }), 'حساب ذخیره نشد.');
}

export async function deleteAccountAction(id: number): Promise<PayoutState> {
  const { deleteAccount } = await import('@/server/finance/service');
  return run((actor) => deleteAccount(actor, id), 'حساب حذف نشد.');
}
