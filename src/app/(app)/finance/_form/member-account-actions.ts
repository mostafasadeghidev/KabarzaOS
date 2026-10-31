'use server';

import { revalidatePath } from 'next/cache';
import { requireActor } from '@/server/auth';
import {
  deleteMemberEntry, recordCash, recordForgive, recordOffset, type CashInput,
} from '@/server/finance/member-accounts';
import { MemberAccountError, MEMBER_ACCOUNT_MESSAGES } from '@/domain/team-money/member-account';
import { ForbiddenError } from '@/domain/access/guard';
import { FiscalPeriodLockedError } from '@/domain/ledger/fiscal';
import { LedgerValidationError, MissingRateError } from '@/domain/ledger/amounts';
import { getT } from '@/i18n/server';
import { ltr } from '@/i18n/bidi';

/** اقدام‌های «حسابِ اعضا» (۲.۴۹.۰). */

export interface MemberAccountState {
  error?: string;
  ok?: boolean;
}

async function explain(error: unknown, fallback: string): Promise<string> {
  const t = await getT();
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

async function run(fn: (actor: Awaited<ReturnType<typeof requireActor>>) => Promise<unknown>, fallback: string): Promise<MemberAccountState> {
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

/** یک فرم برای همهٔ ثبت‌ها؛ `kind` می‌گوید کدام. */
export async function saveMemberEntryAction(_prev: MemberAccountState, formData: FormData): Promise<MemberAccountState> {
  const kind = str(formData, 'kind');
  const userId = num(formData, 'userId');
  const entryDate = str(formData, 'entryDate');
  const amount = str(formData, 'amount');
  const currencyId = num(formData, 'currencyId');
  const note = str(formData, 'note');
  if (!userId || !currencyId || !entryDate) return { error: 'عضو، ارز و تاریخ لازم است.' };

  if (kind === 'loan' || kind === 'gift' || kind === 'charge' || kind === 'repayment') {
    return run((actor) => recordCash(actor, {
      kind: kind as CashInput['kind'],
      userId, entryDate, amount, currencyId, note,
      accountId: num(formData, 'accountId'),
      dueDate: str(formData, 'dueDate') || null,
      vendorLabel: str(formData, 'vendorLabel'),
      sharePct: str(formData, 'sharePct') || null,
    }), 'ثبت نشد.');
  }
  if (kind === 'offset') {
    const projectId = num(formData, 'projectId');
    if (!projectId) return { error: 'پروژه را انتخاب کنید.' };
    return run((actor) => recordOffset(actor, {
      userId, projectId, entryDate, amount, currencyId, note, counted: str(formData, 'counted') || null,
    }), 'ثبت نشد.');
  }
  if (kind === 'forgive') {
    return run((actor) => recordForgive(actor, { userId, entryDate, amount, currencyId, note }), 'ثبت نشد.');
  }
  return { error: 'نوعِ ردیف معتبر نیست.' };
}

export async function deleteMemberEntryAction(id: number): Promise<MemberAccountState> {
  return run((actor) => deleteMemberEntry(actor, id), 'حذف نشد.');
}
