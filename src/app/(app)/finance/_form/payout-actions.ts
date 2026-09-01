'use server';

import { revalidatePath } from 'next/cache';
import { requireActor } from '@/server/auth';
import {
  decideRequest, deleteRecurring, payRecurring, payRequest, PayoutError, saveRecurring,
} from '@/server/finance/payouts';
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
    return 'مورد پیدا نشد.';
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

  if (!Number.isInteger(requestId) || !Number.isInteger(accountId)) {
    return { error: 'درخواست یا حساب معتبر نیست.' };
  }
  return run((actor) => payRequest(actor, requestId, { accountId, entryDate }), 'پرداخت ثبت نشد.');
}

export async function saveRecurringAction(_prev: PayoutState, formData: FormData): Promise<PayoutState> {
  const num = (name: string) => {
    const n = Number(formData.get(name));
    return Number.isInteger(n) && n > 0 ? n : null;
  };
  const currencyId = num('currencyId');
  if (currencyId === null) return { error: 'ارز را انتخاب کنید.' };

  return run((actor) => saveRecurring(actor, {
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
  }), 'هزینه ذخیره نشد.');
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
