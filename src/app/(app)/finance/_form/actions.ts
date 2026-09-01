'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireActor } from '@/server/auth';
import {
  createEntry, deleteEntry, LedgerNotFoundError, transfer, updateEntry,
} from '@/server/finance/service';
import { ForbiddenError } from '@/domain/access/guard';
import { FiscalPeriodLockedError } from '@/domain/ledger/fiscal';
import { LedgerValidationError, TransferValidationError } from '@/domain/ledger/amounts';
import { FileRejected, rejectMessage } from '@/domain/files/upload';
import { removeFiles, storeReceipt } from '@/server/files/service';
import { getT } from '@/i18n/server';

/** اقدام‌های حسابداری. گاردها همه در سرویس‌اند (R-ARCH-01). */

const optionalId = z.string().trim().transform((v) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
});

const money = z
  .string()
  .trim()
  .refine((v) => /^\d+(\.\d{1,4})?$/.test(v), 'مبلغ معتبر نیست');

const day = z
  .string()
  .trim()
  .refine((v) => /^\d{4}-\d{2}-\d{2}$/.test(v), 'تاریخ معتبر نیست');

const entrySchema = z.object({
  accountId: optionalId,
  entryDate: day,
  direction: z.enum(['in', 'out']),
  amount: money,
  currencyId: optionalId,
  amountAccountOverride: z.string().trim(),
  description: z.string().trim().max(2000).default(''),
  projectId: optionalId,
  categoryTagId: optionalId,
  officeId: optionalId,
  payerUserId: optionalId,
  payerLabel: z.string().trim().max(160).default(''),
  receiverUserId: optionalId,
  receiverLabel: z.string().trim().max(160).default(''),

  /**
   * ⚠️ این چهار فیلد را فرم **می‌فرستاد** ولی اسکیما بی‌صدا می‌انداخت — پس
   * تیکِ «قابلِ بازپرداخت» و مبلغِ تسویه هیچ اثری نداشتند. هر فیلدی که فرم
   * می‌فرستد باید اینجا هم باشد، وگرنه zod دورش می‌ریزد بی‌آنکه خطایی بدهد.
   */
  billable: z.boolean(),
  amountSettled: z.string().trim(),
  settledCurrencyId: optionalId,
  fxRate: z.string().trim(),
});

export interface FinanceState {
  error?: string;
  fieldErrors?: Partial<Record<'amount' | 'entryDate' | 'description', string>>;
  values?: Record<string, string>;
  ok?: boolean;
}

/** خطاهای دامنه را به پیامِ فارسیِ روشن تبدیل می‌کند. */
async function explain(error: unknown, fallback: string): Promise<string> {
  const t = await getT();
  // دلیلِ ردِ فایل به کاربر گفته می‌شود، نه یک پیامِ کلی.
  if (error instanceof FileRejected) return rejectMessage(error.reason);
  if (error instanceof FiscalPeriodLockedError) {
    return t('این دوره تا تاریخ {date} قفل (بسته) شده و قابل تغییر نیست.', { date: error.lockDate });
  }
  if (error instanceof LedgerValidationError) {
    if (error.code === 'note_required') {
      return 'برای تراکنش‌های مرتبط با پروژه، نوشتن توضیحات الزامی است.';
    }
    if (error.code === 'amount_invalid') return 'مبلغ معتبر نیست.';
    return 'ابتدا یک حساب بانکی انتخاب کنید.';
  }
  if (error instanceof TransferValidationError) {
    if (error.code === 'same_account') return 'مبدأ و مقصدِ انتقال نمی‌تواند یکی باشد.';
    if (error.code === 'amount') return 'مبلغِ انتقال معتبر نیست.';
    return 'حساب‌های انتقال معتبر نیستند.';
  }
  if (error instanceof LedgerNotFoundError) return 'ردیف یا حساب پیدا نشد.';
  if (error instanceof ForbiddenError) return 'دسترسی کافی ندارید.';
  return fallback;
}

function parse(formData: FormData) {
  const raw = {
    accountId: String(formData.get('accountId') ?? ''),
    entryDate: String(formData.get('entryDate') ?? ''),
    direction: String(formData.get('direction') ?? 'out'),
    amount: String(formData.get('amount') ?? ''),
    currencyId: String(formData.get('currencyId') ?? ''),
    amountAccountOverride: String(formData.get('amountAccountOverride') ?? ''),
    description: String(formData.get('description') ?? ''),
    projectId: String(formData.get('projectId') ?? ''),
    categoryTagId: String(formData.get('categoryTagId') ?? ''),
    officeId: String(formData.get('officeId') ?? ''),
    payerUserId: String(formData.get('payerUserId') ?? ''),
    payerLabel: String(formData.get('payerLabel') ?? ''),
    receiverUserId: String(formData.get('receiverUserId') ?? ''),
    receiverLabel: String(formData.get('receiverLabel') ?? ''),
    amountSettled: String(formData.get('amountSettled') ?? ''),
    settledCurrencyId: String(formData.get('settledCurrencyId') ?? ''),
    fxRate: String(formData.get('fxRate') ?? ''),
  };

  /**
   * ⚠️ چک‌باکسِ تیک‌نخورده در FormData نیست، پس «نبودن» یعنی خاموش.
   * نسخهٔ قبلی اینجا `!isset(...) || !empty(...)` می‌نویسد که یعنی برداشتنِ تیک
   * هیچ اثری ندارد — رفتاری که با خودِ برچسبِ گزینه در تضاد است. اینجا
   * **نیت** پیاده شده، نه آن اشتباه. امن هم هست: این فیلد فقط وقتی خوانده
   * می‌شود که چک‌باکس واقعاً نمایش داده شده باشد (`showsBillable`).
   */
  return {
    parsed: entrySchema.safeParse({ ...raw, billable: formData.get('billable') !== null }),
    values: raw,
  };
}

export async function saveEntryAction(
  _prev: FinanceState,
  formData: FormData,
): Promise<FinanceState> {
  const rawId = Number(formData.get('entryId'));
  const entryId = Number.isInteger(rawId) && rawId > 0 ? rawId : null;

  const { parsed, values } = parse(formData);
  if (!parsed.success) {
    const fieldErrors: FinanceState['fieldErrors'] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as 'amount' | 'entryDate';
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { error: 'لطفاً خطاهای فرم را برطرف کنید.', fieldErrors, values };
  }

  const data = parsed.data;
  if (data.accountId === null || data.currencyId === null) {
    return { error: 'حساب و ارز را انتخاب کنید.', values };
  }

  /**
   * رسیدها: فایل‌های تازه **پیش از** ذخیرهٔ ردیف بارگذاری می‌شوند تا اگر
   * رسید نامعتبر بود، ردیفِ مالی اصلاً دست نخورد.
   */
  let addedReceiptIds: number[];
  try {
    const actor = await requireActor();
    const picked = formData.getAll('receipt')
      .filter((f): f is File => f instanceof File && f.size > 0);
    addedReceiptIds = [];
    for (const file of picked) {
      addedReceiptIds.push(await storeReceipt(actor, {
        name: file.name,
        mime: file.type,
        bytes: new Uint8Array(await file.arrayBuffer()),
      }));
    }
  } catch (error) {
    return { error: await explain(error, 'رسید بارگذاری نشد.'), values };
  }

  const removedReceiptIds = formData.getAll('removeReceipt')
    .map((v) => Number(v)).filter((n) => Number.isInteger(n) && n > 0);

  const input = {
    addedReceiptIds,
    removedReceiptIds,
    accountId: data.accountId,
    entryDate: data.entryDate,
    direction: data.direction,
    amount: data.amount,
    currencyId: data.currencyId,
    amountAccountOverride: data.amountAccountOverride || null,
    description: data.description,
    projectId: data.projectId,
    categoryTagId: data.categoryTagId,
    officeId: data.officeId,
    payerUserId: data.payerUserId,
    payerLabel: data.payerLabel,
    receiverUserId: data.receiverUserId,
    receiverLabel: data.receiverLabel,
    billable: data.billable,
    amountSettled: data.amountSettled || null,
    settledCurrencyId: data.settledCurrencyId,
    fxRate: data.fxRate || null,
  };

  try {
    const actor = await requireActor();
    if (entryId) await updateEntry(actor, entryId, input);
    else await createEntry(actor, input);
  } catch (error) {
    // ⚠️ R-FILE-02 — رسیدها پیش از ردیف ذخیره شده‌اند؛ اگر ذخیرهٔ ردیف شکست
    // خورد (مثلاً دورهٔ قفل)، آن فایل‌ها به هیچ ردیفی وصل نیستند و باید بروند،
    // وگرنه با هر تلاشِ ناموفق یک فایلِ بی‌صاحب در باکت می‌ماند.
    await removeFiles(addedReceiptIds).catch(() => {});
    return { error: await explain(error, 'ردیف ذخیره نشد.'), values };
  }

  revalidatePath('/finance');
  return { ok: true };
}

export async function deleteEntryAction(entryId: number): Promise<FinanceState> {
  try {
    const actor = await requireActor();
    await deleteEntry(actor, entryId);
  } catch (error) {
    return { error: await explain(error, 'ردیف حذف نشد.') };
  }
  revalidatePath('/finance');
  return { ok: true };
}

export async function transferAction(
  _prev: FinanceState,
  formData: FormData,
): Promise<FinanceState> {
  const fromAccountId = Number(formData.get('fromAccountId'));
  const toAccountId = Number(formData.get('toAccountId'));
  const fromAmount = String(formData.get('fromAmount') ?? '');
  const toAmount = String(formData.get('toAmount') ?? '');
  const entryDate = String(formData.get('entryDate') ?? '');

  try {
    const actor = await requireActor();
    await transfer(actor, { fromAccountId, toAccountId, fromAmount, toAmount, entryDate });
  } catch (error) {
    return { error: await explain(error, 'انتقال ثبت نشد.') };
  }
  revalidatePath('/finance');
  return { ok: true };
}
