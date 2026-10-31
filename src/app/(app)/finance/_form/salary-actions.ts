'use server';

import { revalidatePath } from 'next/cache';
import { requireActor } from '@/server/auth';
import {
  changeSalaryAmount, deleteSalary, paySalary, startSalary, stopSalary, unpaySalary, updateSalary,
} from '@/server/finance/salaries';
import { SalaryError, SALARY_MESSAGES } from '@/domain/team-money/salary';
import { MemberAccountError, MEMBER_ACCOUNT_MESSAGES } from '@/domain/team-money/member-account';
import { ForbiddenError } from '@/domain/access/guard';
import { FiscalPeriodLockedError } from '@/domain/ledger/fiscal';
import { LedgerValidationError, MissingRateError } from '@/domain/ledger/amounts';
import { getT } from '@/i18n/server';
import { ltr } from '@/i18n/bidi';

/** اقدام‌های «حقوق‌ها» (۲.۵۰.۰). */

export interface SalaryState {
  error?: string;
  ok?: boolean;
}

async function explain(error: unknown, fallback: string): Promise<string> {
  const t = await getT();
  if (error instanceof SalaryError) return t(SALARY_MESSAGES[error.code]);
  if (error instanceof MemberAccountError) return t(MEMBER_ACCOUNT_MESSAGES[error.code]);
  if (error instanceof FiscalPeriodLockedError) {
    return t('این دوره تا تاریخ {date} قفل (بسته) شده و قابل تغییر نیست.', { date: ltr(error.lockDate) });
  }
  if (error instanceof MissingRateError) {
    return t('نرخِ ارز برای این تبدیل ثبت نشده است. نرخ را در تنظیمات اضافه کنید یا مبلغِ واقعی از حساب را بنویسید.');
  }
  if (error instanceof LedgerValidationError) return t('اطلاعاتِ ردیفِ دفتر کامل نیست.');
  if (error instanceof ForbiddenError) return t('دسترسی کافی ندارید.');
  console.error(error);
  return t(fallback);
}

async function run(fn: (actor: Awaited<ReturnType<typeof requireActor>>) => Promise<unknown>, fallback: string): Promise<SalaryState> {
  try {
    await fn(await requireActor());
  } catch (error) {
    return { error: await explain(error, fallback) };
  }
  revalidatePath('/finance');
  revalidatePath('/my-money');
  return { ok: true };
}

const num = (formData: FormData, name: string) => {
  const n = Number(formData.get(name));
  return Number.isInteger(n) && n > 0 ? n : 0;
};
const str = (formData: FormData, name: string) => String(formData.get(name) ?? '').trim();

/** شروع یا ویرایشِ یک دوره — `id` خالی یعنی دورهٔ تازه. */
export async function saveSalaryAction(_prev: SalaryState, formData: FormData): Promise<SalaryState> {
  const id = num(formData, 'id');
  const input = {
    amount: str(formData, 'amount'),
    currencyId: num(formData, 'currencyId'),
    payDay: str(formData, 'payDay'),
    accountId: num(formData, 'accountId') || null,
    startMonth: str(formData, 'startMonth'),
    endMonth: str(formData, 'endMonth') || null,
    note: str(formData, 'note'),
  };
  if (!input.currencyId || !input.startMonth) return { error: 'ارز و ماهِ شروع لازم است.' };
  if (id) return run((actor) => updateSalary(actor, id, input), 'ذخیره نشد.');
  const userId = num(formData, 'userId');
  if (!userId) return { error: 'عضو را انتخاب کنید.' };
  return run((actor) => startSalary(actor, { ...input, userId }), 'ذخیره نشد.');
}

export async function stopSalaryAction(_prev: SalaryState, formData: FormData): Promise<SalaryState> {
  const id = num(formData, 'id');
  const lastMonth = str(formData, 'lastMonth');
  if (!id || !lastMonth) return { error: 'آخرین ماهِ حقوق را انتخاب کنید.' };
  return run((actor) => stopSalary(actor, id, lastMonth), 'ذخیره نشد.');
}

export async function changeSalaryAction(_prev: SalaryState, formData: FormData): Promise<SalaryState> {
  const id = num(formData, 'id');
  const fromMonth = str(formData, 'fromMonth');
  if (!id || !fromMonth) return { error: 'ماهِ شروعِ مبلغِ تازه را انتخاب کنید.' };
  return run((actor) => changeSalaryAmount(actor, id, fromMonth, str(formData, 'amount')), 'ذخیره نشد.');
}

export async function paySalaryAction(_prev: SalaryState, formData: FormData): Promise<SalaryState> {
  const salaryId = num(formData, 'salaryId');
  const month = str(formData, 'month');
  const paidAt = str(formData, 'paidAt');
  if (!salaryId || !month || !paidAt) return { error: 'ماه و تاریخِ پرداخت لازم است.' };
  return run((actor) => paySalary(actor, {
    salaryId, month, paidAt,
    accountId: num(formData, 'accountId'),
    bonus: str(formData, 'bonus'),
    deduction: str(formData, 'deduction'),
    installment: str(formData, 'installment'),
    note: str(formData, 'note'),
  }), 'پرداخت ثبت نشد.');
}

export async function deleteSalaryAction(id: number): Promise<SalaryState> {
  return run((actor) => deleteSalary(actor, id), 'حذف نشد.');
}

export async function unpaySalaryAction(paymentId: number): Promise<SalaryState> {
  return run((actor) => unpaySalary(actor, paymentId), 'حذف نشد.');
}
