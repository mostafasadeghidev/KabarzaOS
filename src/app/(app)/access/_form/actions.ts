'use server';

import { revalidatePath } from 'next/cache';
import { requireActor, revealActor } from '@/server/auth';
import * as access from '@/server/access/service';
import { AccessError, accessMessage } from '@/domain/access/service-grants';
import { ForbiddenError } from '@/domain/access/guard';
import { CorpMailError, corpMailMessage } from '@/server/corp-mail/accounts';

/** اقدام‌های دفترِ دسترسی‌ها. گاردها در سرویس‌اند (R-ARCH-01). */

export interface AccessState {
  error?: string;
  ok?: boolean;
  /** پیامِ موفقیتِ ویژه — مثلاً «غیرفعال شد» به‌جای «حذف شد». */
  message?: string;
  /** جای‌نگهدارهای پیام (۲.۶۰.۰) — مثلاً نامِ aliasِ ردشده. */
  params?: Record<string, string>;
}

function explain(error: unknown, fallback: string): string {
  if (error instanceof AccessError) return accessMessage(error.code);
  // قطعِ ردیفِ ایمیلِ شرکتی صندوق را واقعاً می‌بندد؛ خطای سرورِ ایمیل پیامِ خودش را دارد.
  if (error instanceof CorpMailError) return corpMailMessage(error.code, error.detail);
  if (error instanceof ForbiddenError) return 'دسترسی کافی ندارید.';
  return fallback;
}

async function run(
  fn: (actor: Awaited<ReturnType<typeof requireActor>>) => Promise<unknown>,
  fallback: string,
): Promise<AccessState> {
  try {
    await fn(await requireActor());
  } catch (error) {
    return { error: explain(error, fallback) };
  }
  revalidatePath('/access');
  // کارتِ «دسترسی‌های من» در پروفایل از همین داده می‌خواند.
  revalidatePath('/profile');
  return { ok: true };
}

const num = (v: FormDataEntryValue | null): number | null => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};

/* ---- سرویس‌ها ---- */

export async function saveServiceAction(_prev: AccessState, formData: FormData) {
  return run((actor) => access.saveService(actor, {
    id: num(formData.get('id')),
    name: String(formData.get('name') ?? ''),
    categoryTagId: num(formData.get('categoryTagId')),
    ownerUserId: num(formData.get('ownerUserId')),
    adminUrl: String(formData.get('adminUrl') ?? ''),
    note: String(formData.get('note') ?? ''),
    downloadUrl: String(formData.get('downloadUrl') ?? ''),
    guide: String(formData.get('guide') ?? ''),
    /**
     * ⚠️ چک‌باکسِ تیک‌نخورده اصلاً در FormData نیست. در افزودنِ تازه هم
     * همین است، پس پیش‌فرضِ فرم تیک‌خورده می‌آید تا سرویسِ نو فعال باشد.
     */
    isActive: formData.get('isActive') !== null,
    /**
     * ⚠️ نبودنِ فیلد با «پاک‌کن» یکی نیست: فرمِ کسی که هزینه را نمی‌بیند
     * این ورودی را ندارد. سرویس در آن حالت مقدارِ قبلی را نگه می‌دارد.
     */
    recurringExpenseId: num(formData.get('recurringExpenseId')),
    // «+ دستهٔ تازه» ِ انتخابگر: مقدارِ فیلد `__new__` و نام در فیلدِ جدا.
    newCategoryName: formData.get('categoryTagId') === NEW
      ? String(formData.get('newCategoryName') ?? '') : '',
    newSubscription: formData.get('recurringExpenseId') === NEW
      ? {
        amount: String(formData.get('subAmount') ?? ''),
        currencyId: num(formData.get('subCurrencyId')),
        intervalUnit: String(formData.get('subIntervalUnit') ?? 'month'),
        nextDueDate: String(formData.get('subNextDueDate') ?? ''),
      }
      : null,
  }), 'سرویس ذخیره نشد.');
}

/** همان `CREATE_VALUE` ِ انتخابگر — رشتهٔ ساده، چون این فایل سرور است و آن کامپوننتِ کلاینت. */
const NEW = '__new__';

export async function deleteServiceAction(id: number): Promise<AccessState> {
  let outcome: Awaited<ReturnType<typeof access.deleteService>> = 'delete';
  const result = await run(async (actor) => { outcome = await access.deleteService(actor, id); }, 'سرویس حذف نشد.');
  if (result.error) return result;
  // ⚠️ پیامِ درست: سرویسِ دارای تاریخچه فقط غیرفعال شده، نه حذف.
  return { ...result, message: outcome === 'delete' ? 'سرویس حذف شد.' : 'سرویس غیرفعال شد؛ تاریخچه‌اش ماند.' };
}

/* ---- اعطا و قطع ---- */

export async function grantAccessAction(_prev: AccessState, formData: FormData) {
  return run((actor) => access.grantAccess(actor, {
    grantId: num(formData.get('grantId')),
    serviceId: num(formData.get('serviceId')),
    userId: num(formData.get('userId')),
    accountRef: String(formData.get('accountRef') ?? ''),
    level: String(formData.get('level') ?? 'member'),
    note: String(formData.get('note') ?? ''),
    secret: String(formData.get('secret') ?? ''),
    clearSecret: formData.get('clearSecret') !== null,
  }), 'دسترسی ثبت نشد.');
}

/**
 * نمایشِ رمزِ یک دسترسی. ⚠️ `requireActor` «دیدن به‌جای کاربر» را رد می‌کند،
 * پس مالک از آن حالت رمزی نمی‌بیند که به اسمِ آن کاربر ثبت شود.
 */
export async function revealSecretAction(grantId: number): Promise<{ secret?: string; error?: string }> {
  try {
    // ⚠️ در «دیدن به‌جای کاربر» بازیگرِ واقعیِ مالک، نه کاربرِ دیده‌شده (۲.۶۳.۱).
    const { actor, viewingAs } = await revealActor();
    const secret = await access.revealGrantSecret(actor, grantId, { viewingAs });
    if (secret === null) return { error: 'رمز خوانده نشد؛ دوباره ثبتش کنید.' };
    return { secret };
  } catch (error) {
    return { error: explain(error, 'رمز خوانده نشد؛ دوباره ثبتش کنید.') };
  }
}

export async function revokeAccessAction(grantId: number) {
  return run((actor) => access.revokeAccess(actor, grantId), 'دسترسی قطع نشد.');
}

/** قطعِ گروهی — چک‌لیستِ خروجِ عضو. */
export async function revokeManyAction(grantIds: number[]) {
  return run((actor) => access.revokeMany(actor, grantIds), 'دسترسی‌ها قطع نشدند.');
}

/* ---- ایمیلِ شرکتی (۲.۶۰.۰) ---- */

async function runMail(fn: (actor: Awaited<ReturnType<typeof requireActor>>) => Promise<unknown>, fallback: string): Promise<AccessState> {
  const { CorpMailError, corpMailMessage } = await import('@/server/corp-mail/accounts');
  try {
    await fn(await requireActor());
  } catch (error) {
    if (error instanceof CorpMailError) {
      return { error: corpMailMessage(error.code, error.detail), params: { name: error.detail } };
    }
    return { error: explain(error, fallback) };
  }
  revalidatePath('/access');
  revalidatePath('/access/mail');
  revalidatePath('/profile');
  return { ok: true };
}

/** جفت یا جداکردنِ صندوقِ ایمیل و عضو. `userId = null` یعنی جدا. */
export async function linkMailAccountAction(accountId: string, userId: number | null): Promise<AccessState> {
  const { linkMailAccount } = await import('@/server/corp-mail/accounts');
  return runMail((actor) => linkMailAccount(actor, accountId, userId), 'صندوقِ ایمیل وصل نشد.');
}

/** aliasهای یک صندوق — متنِ آزاد، جداشده با ویرگول یا فاصله. */
export async function setMailAliasesAction(accountId: string, raw: string): Promise<AccessState> {
  const { setMailAliases } = await import('@/server/corp-mail/accounts');
  const names = raw.split(/[\s,،]+/).map((s) => s.replace(/@.*$/, '')).filter(Boolean);
  return runMail((actor) => setMailAliases(actor, accountId, names), 'aliasها ذخیره نشدند.');
}

/** صندوقِ تازه برای عضو (۲.۶۱.۰). شناسهٔ ردیف برمی‌گردد تا مدیر رمز را ببیند و تحویل دهد. */
type Created = { grantId: number | null; address: string; password?: string };

/**
 * ⚠️ `userId=shared` = صندوقِ مشترکِ بی‌صاحب (۲.۶۷.۰): رمز فقط در همین پاسخ می‌آید
 * و هیچ‌جا ذخیره نمی‌شود. خالی یا نامعتبر = ۰ که سرویس رد می‌کند.
 */
export async function createMailAccountAction(
  _prev: AccessState & Partial<Created>,
  formData: FormData,
): Promise<AccessState & Partial<Created>> {
  const { createMailAccount } = await import('@/server/corp-mail/accounts');
  const rawUser = String(formData.get('userId') ?? '');
  let created: Created | null = null;
  const state = await runMail(async (actor) => {
    created = await createMailAccount(actor, {
      userId: rawUser === 'shared' ? null : Number(rawUser) || 0,
      local: String(formData.get('local') ?? ''),
      aliases: String(formData.get('aliases') ?? '').split(/[\s,،]+/).map((s) => s.replace(/@.*$/, '')).filter(Boolean),
    });
  }, 'صندوق ساخته نشد.');
  return created ? { ...state, ...(created as Created) } : state;
}

/** رمزِ تازه — app passwordهای قبلی هم باطل می‌شوند (هشدار در صفحه). */
export async function resetMailPasswordAction(
  accountId: string,
  /** رمزِ دلخواه (۳.۳.۰)؛ null = تصادفی. قاعده سمتِ سرور سنجیده می‌شود. */
  custom: string | null = null,
): Promise<AccessState & { grantId?: number | null; password?: string }> {
  const { resetMailPassword } = await import('@/server/corp-mail/accounts');
  let out: { grantId: number | null; password?: string } = { grantId: null };
  const value = typeof custom === 'string' ? custom : null;
  const state = await runMail(async (actor) => { out = await resetMailPassword(actor, accountId, value); }, 'رمز عوض نشد.');
  // رمز فقط برای صندوقِ بی‌صاحب برمی‌گردد (یک بار)؛ برای صندوقِ عضو در دفترِ او می‌نشیند.
  return state.error ? state : { ...state, ...out };
}

/**
 * رمزِ صندوقِ بی‌صاحب پشتِ چشم (۳.۳.۰) — گارد و ثبتِ دیدن در سرویس.
 * ⚠️ `requireActor` «دیدن به‌جای کاربر» را رد می‌کند.
 */
export async function revealSharedMailSecretAction(accountId: string): Promise<{ secret?: string; error?: string }> {
  const { revealSharedMailSecret, CorpMailError, corpMailMessage } = await import('@/server/corp-mail/accounts');
  try {
    const secret = await revealSharedMailSecret(await requireActor(), String(accountId));
    if (secret === null) return { error: 'رمزِ این صندوق در برنامه نیست؛ «رمزِ تازه» بگیرید.' };
    return { secret };
  } catch (error) {
    if (error instanceof CorpMailError) return { error: corpMailMessage(error.code, error.detail) };
    return { error: explain(error, 'رمز خوانده نشد.') };
  }
}

/** حجمِ یک صندوق به گیگابایت (۳.۲.۰). */
export async function setMailQuotaAction(accountId: string, gb: number): Promise<AccessState> {
  const { setMailQuota } = await import('@/server/corp-mail/accounts');
  return runMail((actor) => setMailQuota(actor, accountId, Number(gb)), 'حجم ذخیره نشد.');
}

/** جزئیاتِ صندوقِ یک ردیفِ دفتر برای مودالِ «دسترسی‌ها» (۳.۱.۰). */
export async function mailboxOfGrantAction(grantId: number) {
  const { mailboxOfGrant, CorpMailError, corpMailMessage } = await import('@/server/corp-mail/accounts');
  try {
    return { ok: true as const, mailbox: await mailboxOfGrant(await requireActor(), grantId) };
  } catch (error) {
    if (error instanceof CorpMailError) return { ok: false as const, error: corpMailMessage(error.code, error.detail), params: { name: error.detail } };
    return { ok: false as const, error: explain(error, 'صندوق خوانده نشد.'), params: {} as Record<string, string> };
  }
}

/** بستنِ صندوق: رمزِ نامعلوم + aliasهای خاموش؛ ایمیل‌ها می‌مانند. */
export async function closeMailAccountAction(accountId: string): Promise<AccessState> {
  const { closeMailAccount } = await import('@/server/corp-mail/accounts');
  return runMail((actor) => closeMailAccount(actor, accountId), 'صندوق بسته نشد.');
}
