'use server';

import { db } from '@/db/client';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { requireActor } from '@/server/auth';
import * as settings from '@/server/settings/service';
import { ForbiddenError } from '@/domain/access/guard';
import {
  dispatchReport, getReportConfig, previewReport, saveReportConfig,
} from '@/server/scheduler/daily-report';
import { hasDestination, reportDate } from '@/domain/scheduler/daily-report';
import { CatalogError, catalogMessage } from '@/domain/settings/catalogs';
import { saveSystemConfig } from '@/server/settings/system-service';
import { closePeriod, reopenPeriod } from '@/server/finance/service';
import { saveTelegramSettings, telegramCredentials, telegramEnabled } from '@/server/settings/telegram-service';

/** اقدام‌های تنظیمات. گاردها در سرویس‌اند (R-ARCH-01). */

export interface SettingsState {
  error?: string;
  ok?: boolean;
}

function explain(error: unknown, fallback: string): string {
  if (error instanceof CatalogError) return catalogMessage(error.code);
  if (error instanceof ForbiddenError) return 'دسترسی کافی ندارید.';
  return fallback;
}

async function run(fn: (actor: Awaited<ReturnType<typeof requireActor>>) => Promise<unknown>, fallback: string) {
  try {
    await fn(await requireActor());
  } catch (error) {
    return { error: explain(error, fallback) };
  }
  revalidatePath('/settings');
  // فهرست‌های پایه همه‌جا استفاده می‌شوند، پس کلِ اپ تازه می‌شود.
  revalidatePath('/', 'layout');
  return { ok: true };
}

const num = (v: FormDataEntryValue | null): number | null => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};

/* ---- ارز ---- */

export async function saveCurrencyAction(_prev: SettingsState, formData: FormData) {
  return run((actor) => settings.saveCurrency(actor, {
    id: num(formData.get('id')),
    code: String(formData.get('code') ?? ''),
    name: String(formData.get('name') ?? ''),
    symbol: String(formData.get('symbol') ?? ''),
    decimals: Number(formData.get('decimals') ?? 2) || 2,
  }), 'ارز ذخیره نشد.');
}

export async function setDefaultCurrencyAction(id: number) {
  return run((actor) => settings.setDefaultCurrency(actor, id), 'ارز پیش‌فرض تنظیم نشد.');
}

export async function deleteCurrencyAction(id: number) {
  return run((actor) => settings.deleteCurrency(actor, id), 'ارز حذف نشد.');
}

export async function saveRateAction(_prev: SettingsState, formData: FormData) {
  const from = num(formData.get('fromCurrencyId'));
  const to = num(formData.get('toCurrencyId'));
  if (from === null || to === null) return { error: 'ارزِ مبدأ و مقصد را انتخاب کنید.' };

  return run((actor) => settings.saveRate(actor, {
    fromCurrencyId: from,
    toCurrencyId: to,
    rate: String(formData.get('rate') ?? ''),
    effectiveDate: String(formData.get('effectiveDate') ?? new Date().toISOString().slice(0, 10)),
  }), 'نرخ ثبت نشد.');
}

export async function deleteRateAction(from: number, to: number) {
  return run((actor) => settings.deleteRate(actor, from, to), 'نرخ حذف نشد.');
}

/* ---- تگ ---- */

export async function saveTagAction(_prev: SettingsState, formData: FormData) {
  return run((actor) => settings.saveTag(actor, {
    id: num(formData.get('id')),
    name: String(formData.get('name') ?? ''),
    type: String(formData.get('type') ?? 'member_role'),
    color: String(formData.get('color') ?? ''),
    statusGroup: String(formData.get('statusGroup') ?? ''),
    grantsCap: String(formData.get('grantsCap') ?? ''),
    /**
     * فیلدهای `name-<locale>` — نامِ هر زبان جداگانه.
     * ⚠️ خالی‌ها در دامنه کنار می‌روند، نه اینجا: مهار یک جا باشد.
     */
    nameI18n: Object.fromEntries(
      [...formData.entries()]
        .filter(([key]) => key.startsWith('name-'))
        .map(([key, value]) => [key.slice(5), String(value)]),
    ),
    isReview: formData.get('isReview') !== null,
    sortOrder: Number(formData.get('sortOrder') ?? 0) || 0,
  }), 'تگ ذخیره نشد.');
}

export async function deleteTagAction(id: number) {
  return run((actor) => settings.deleteTag(actor, id), 'تگ حذف نشد.');
}

/* ---- دفتر ---- */

export async function saveOfficeAction(_prev: SettingsState, formData: FormData) {
  return run((actor) => settings.saveOffice(actor, {
    id: num(formData.get('id')),
    name: String(formData.get('name') ?? ''),
    location: String(formData.get('location') ?? ''),
    defaultCurrencyId: num(formData.get('defaultCurrencyId')),
  }), 'دفتر ذخیره نشد.');
}

export async function deleteOfficeAction(id: number) {
  return run((actor) => settings.deleteOffice(actor, id), 'دفتر غیرفعال نشد.');
}

/* ---- طرف‌حساب ---- */

export async function saveVendorAction(_prev: SettingsState, formData: FormData) {
  return run((actor) => settings.saveVendor(actor, {
    id: num(formData.get('id')),
    name: String(formData.get('name') ?? ''),
    note: String(formData.get('note') ?? ''),
  }), 'طرف‌حساب ذخیره نشد.');
}

export async function deleteVendorAction(id: number) {
  return run((actor) => settings.deleteVendor(actor, id), 'طرف‌حساب حذف نشد.');
}

/* ---- کتابخانهٔ QA ---- */

export async function saveQaItemAction(_prev: SettingsState, formData: FormData) {
  return run((actor) => settings.saveQaItem(actor, {
    id: num(formData.get('id')),
    title: String(formData.get('title') ?? ''),
    description: String(formData.get('description') ?? ''),
    roleTagId: num(formData.get('roleTagId')),
    isTask: formData.get('isTask') !== null,
    sortOrder: Number(formData.get('sortOrder') ?? 0) || 0,
  }), 'آیتم ذخیره نشد.');
}

export async function deleteQaItemAction(id: number) {
  return run((actor) => settings.deleteQaItem(actor, id), 'آیتم حذف نشد.');
}

/* ------------------------------------------------------------------ *
 * گزارشِ روزانه
 * ------------------------------------------------------------------ */

export interface ReportState {
  error?: string;
  message?: string;
  preview?: string;
}

/** ⚠️ فقط مالک — گزارش به کانالِ بیرونیِ تیم می‌رود. */
async function assertOwner() {
  const actor = await requireActor();
  if (!actor.roles.includes('owner')) throw new ForbiddenError('owner_only');
  return actor;
}

export async function saveReportAction(
  _prev: ReportState,
  formData: FormData,
): Promise<ReportState> {
  try {
    await saveReportConfig(await assertOwner(), {
      sections: formData.getAll('sections').map(String),
      time: String(formData.get('time') ?? '09:00'),
      offset: Number(formData.get('offset') ?? 1),
      discord: formData.get('discord') !== null,
      webhook: String(formData.get('webhook') ?? '').trim(),
      telegram: formData.get('telegram') !== null,
    });
  } catch (error) {
    if (error instanceof ForbiddenError) return { error: 'فقط مدیرِ کل.' };
    return { error: 'ذخیره نشد.' };
  }
  revalidatePath('/settings');
  return { message: 'تنظیماتِ گزارش ذخیره شد.' };
}

/** پیش‌نمایشِ گزارشِ دیروز — بدونِ فرستادن. */
export async function previewReportAction(): Promise<ReportState> {
  try {
    await assertOwner();
    const config = await getReportConfig();
    const today = new Date().toISOString().slice(0, 10);
    const text = await previewReport(reportDate(today, config.offset));
    return { preview: text || 'هیچ بخشی فعال نیست.' };
  } catch (error) {
    if (error instanceof ForbiddenError) return { error: 'فقط مدیرِ کل.' };
    return { error: 'پیش‌نمایش ساخته نشد.' };
  }
}

/** ارسالِ فوری — برای آزمودنِ مقصد. */
export async function sendReportNowAction(): Promise<ReportState> {
  try {
    await assertOwner();
    const config = await getReportConfig();
    if (!hasDestination(config, await telegramEnabled())) {
      return { error: 'هیچ مقصدی تنظیم نشده است.' };
    }
    const today = new Date().toISOString().slice(0, 10);
    const sent = await dispatchReport(reportDate(today, config.offset));
    return sent ? { message: 'گزارش فرستاده شد.' } : { error: 'هیچ بخشی فعال نیست.' };
  } catch (error) {
    if (error instanceof ForbiddenError) return { error: 'فقط مدیرِ کل.' };
    return { error: 'ارسال نشد.' };
  }
}

/* ------------------------------------------------------------------ *
 * تنظیماتِ سامانه
 * ------------------------------------------------------------------ */

export interface SystemState {
  error?: string;
  message?: string;
}

/**
 * ذخیرهٔ تنظیماتِ سامانه.
 *
 * ⚠️ چک‌باکسِ تیک‌نخورده اصلاً در FormData نیست؛ پس «نبودن» یعنی خاموش —
 * نه «دست‌نخورده». همین باعث می‌شود خاموش‌کردن واقعاً ذخیره شود.
 */
export async function saveSystemAction(
  _prev: SystemState,
  formData: FormData,
): Promise<SystemState> {
  try {
    const actor = await requireActor();
    await saveSystemConfig(actor, {
      brandName: formData.get('brandName'),
      defaultLocale: formData.get('defaultLocale'),
      weekStart: formData.get('weekStart'),
      presenceEnabled: formData.get('presenceEnabled') !== null,
      presencePing: formData.get('presencePing'),
      presenceIdle: formData.get('presenceIdle'),
      presenceOffline: formData.get('presenceOffline'),
      msgPurgeDays: formData.get('msgPurgeDays'),
      pulseEnabled: formData.get('pulseEnabled') !== null,
      pulseInterval: formData.get('pulseInterval'),
      chatPollEnabled: formData.get('chatPollEnabled') !== null,
      chatPollInterval: formData.get('chatPollInterval'),
    });
  } catch (error) {
    if (error instanceof ForbiddenError) return { error: 'دسترسی ندارید.' };
    return { error: 'ذخیره نشد.' };
  }
  // ⚠️ کلِ اپ، نه فقط /settings — ترتیبِ هفته و ضربانِ حضور همه‌جا خوانده می‌شوند.
  revalidatePath('/', 'layout');
  return { message: 'تنظیماتِ سامانه ذخیره شد.' };
}

/* ------------------------------------------------------------------ *
 * دورهٔ مالی
 * ------------------------------------------------------------------ */

export interface FiscalState {
  error?: string;
  message?: string;
}

/** بستنِ دوره — خلاصهٔ هر حساب منجمد و دوره قفل می‌شود. */
export async function closePeriodAction(
  _prev: FiscalState,
  formData: FormData,
): Promise<FiscalState> {
  try {
    const actor = await requireActor();
    const n = await closePeriod(actor, String(formData.get('lockDate') ?? ''));
    revalidatePath('/settings');
    revalidatePath('/reports');
    return { message: `دوره بسته شد؛ خلاصهٔ ${n} حساب ذخیره و دوره قفل شد.` };
  } catch (error) {
    if (error instanceof ForbiddenError) {
      if (error.message === 'fiscal.bad_date') return { error: 'تاریخ معتبر نیست.' };
      return { error: 'فقط مدیرِ کل می‌تواند دوره را ببندد.' };
    }
    return { error: 'دوره بسته نشد.' };
  }
}

/**
 * بازگشاییِ دوره.
 * ⚠️ خلاصه‌های ثبت‌شده پاک نمی‌شوند؛ فقط قفل برداشته می‌شود.
 */
export async function reopenPeriodAction(): Promise<FiscalState> {
  try {
    const actor = await requireActor();
    await reopenPeriod(actor);
    revalidatePath('/settings');
    return { message: 'دوره بازگشایی شد (قفل برداشته شد).' };
  } catch (error) {
    if (error instanceof ForbiddenError) return { error: 'فقط مدیرِ کل.' };
    return { error: 'بازگشایی نشد.' };
  }
}

/**
 * آزمونِ باتِ تلگرام — پورتِ دکمهٔ آزمونِ تبِ «اطلاع‌رسانی».
 *
 * ⚠️ فقط `getMe` صدا زده می‌شود، نه ارسالِ پیامِ آزمایشی: هدف این است که
 * بفهمیم توکن درست است، نه اینکه به کسی پیامِ بی‌ربط برسد.
 */
export async function testTelegramAction(): Promise<SystemState> {
  try {
    const actor = await requireActor();
    if (!actor.roles.includes('owner')) return { error: 'فقط مدیرِ کل.' };

    const { token } = await telegramCredentials();
    if (!token) return { error: 'توکنِ بات تنظیم نشده است.' };

    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const data = await res.json() as { ok?: boolean; result?: { username?: string } };

    if (!data.ok) return { error: 'توکن پذیرفته نشد؛ تلگرام آن را نشناخت.' };
    return { message: `بات متصل است: @${data.result?.username ?? '—'}` };
  } catch {
    // ⚠️ شکستِ شبکه با توکنِ غلط فرق دارد و کاربر باید بداند کدام است.
    return { error: 'ارتباط با تلگرام برقرار نشد.' };
  }
}

/**
 * ارسالِ پیامِ تست به چتِ **خودِ** مالک — پورتِ دکمهٔ «ارسال پیام تست».
 *
 * ⚠️ به چتِ وصل‌شدهٔ خودش می‌رود، نه به همه: تستی که برای کلِ تیم پیام
 * بفرستد، یک بار استفاده می‌شود و دیگر کسی جرئت نمی‌کند بزندش.
 */
export async function sendTelegramTestAction(): Promise<SystemState> {
  try {
    const actor = await requireActor();
    if (!actor.roles.includes('owner')) return { error: 'فقط مدیرِ کل.' };

    const { token } = await telegramCredentials();
    if (!token) return { error: 'توکنِ بات تنظیم نشده است.' };

    const [me] = await db.select({ chatId: users.telegramChatId })
      .from(users).where(eq(users.id, actor.id));

    if (!me?.chatId) {
      return { error: 'ابتدا از تبِ «تلگرام» در پروفایلِ خود، حساب را وصل کنید.' };
    }

    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: me.chatId, text: 'پیامِ تستِ کبرزا — اتصال برقرار است.' }),
    });
    const data = await res.json() as { ok?: boolean; description?: string };

    if (!data.ok) return { error: data.description ?? 'تلگرام پیام را نپذیرفت.' };
    return { message: 'پیامِ تست فرستاده شد.' };
  } catch {
    return { error: 'ارتباط با تلگرام برقرار نشد.' };
  }
}

/**
 * ارسالِ **همین حالا**ی گزارشِ روزانه به مقصدهای پیکربندی‌شده — پورتِ دکمهٔ
 * «تست ارسال گزارش».
 *
 * ⚠️ مهرِ «امروز فرستاده شد» را نمی‌زند: این یک تست است و نباید جلوی ارسالِ
 * واقعیِ سرِ ساعت را بگیرد.
 */
export async function sendReportTestAction(): Promise<SystemState> {
  try {
    const actor = await requireActor();
    if (!actor.roles.includes('owner')) return { error: 'فقط مدیرِ کل.' };

    /**
     * ⚠️ ایمپورتِ **پویا**: `daily-report` به فرستندهٔ ایمیل (nodemailer)
     * می‌رسد و آن به `child_process`. این فایل را یک کامپوننتِ کلاینتی هم
     * وارد می‌کند (اکشن‌ها از آنجا صدا زده می‌شوند)، پس ایمپورتِ ایستا کلِ
     * آن زنجیره را به باندلِ کلاینت می‌کشید و ساخت را می‌شکست.
     */
    const { dispatchReport } = await import('@/server/scheduler/daily-report');
    const sent = await dispatchReport(new Date().toISOString().slice(0, 10));
    return sent
      ? { message: 'گزارش به مقصدهای پیکربندی‌شده فرستاده شد.' }
      : { error: 'مقصدی پیکربندی نشده، یا گزارش خاموش است.' };
  } catch {
    return { error: 'ارسالِ گزارش شکست خورد.' };
  }
}

/**
 * ذخیرهٔ اعتبارِ باتِ تلگرام از خودِ پنل.
 *
 * ⚠️ توکن هرگز به کلاینت برنمی‌گردد — فرم فقط می‌داند «توکنی هست یا نه».
 * پس فیلدِ خالی یعنی «دست نزن»، نه «پاک کن»؛ پاک‌کردن دکمهٔ جداست.
 */
export async function saveTelegramAction(
  _prev: { error?: string; message?: string },
  formData: FormData,
): Promise<{ error?: string; message?: string }> {
  const actor = await requireActor();
  if (!actor.roles.includes('owner')) return { error: 'فقط مدیرِ کل.' };

  const clear = formData.get('clear') === '1';
  const result = await saveTelegramSettings(actor, {
    token: String(formData.get('botToken') ?? ''),
    username: String(formData.get('botUsername') ?? ''),
    clear,
  });

  if (result === 'env_locked') {
    return { error: 'توکن از متغیرِ محیطی می‌آید و از اینجا قابلِ تغییر نیست.' };
  }
  if (result === 'invalid') {
    return { error: 'توکن یا نامِ کاربریِ بات معتبر نیست.' };
  }
  revalidatePath('/settings');
  return { message: result === 'cleared' ? 'اتصالِ بات پاک شد.' : 'اعتبارِ بات ذخیره شد.' };
}
