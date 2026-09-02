import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { auditLog, company, files, users } from '@/db/schema';
import { can, type Actor } from '@/domain/access/permissions';
import { checkPasswordPolicy, hashPassword, verifyPassword } from '@/domain/auth/password';
import { ForbiddenError } from '@/domain/access/guard';
import {
  connectDeeplink, hasBankInfo, normalizeBankInfo, normalizeTimezone,
  telegramState, type BankInfo,
} from '@/domain/people/profile';
import { normalizeMuted } from '@/domain/notifications/gateway';
import { mailEnabled } from '@/server/mail/transport';
import { telegramCredentials } from '@/server/settings/telegram-service';

/**
 * پروفایلِ خودِ کاربر + مشخصاتِ شرکت.
 * ⚠️ همهٔ گاردها اینجا هستند (R-ARCH-01).
 */

/** ⚠️ محیط بر تنظیماتِ پنل اولویت دارد — `resolveTelegram`. */
async function botToken(): Promise<string> {
  return (await telegramCredentials()).token;
}

async function botUsername(): Promise<string> {
  return (await telegramCredentials()).username;
}

/* ------------------------------------------------------------------ *
 * پروفایلِ کاربر
 * ------------------------------------------------------------------ */

export async function getMyProfile(actor: Actor) {
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      phone: users.phone,
      locale: users.locale,
      timezone: users.timezone,
      bankAccount: users.bankAccount,
      bankIban: users.bankIban,
      bankCard: users.bankCard,
      telegramChatId: users.telegramChatId,
      notifyEmail: users.notifyEmail,
      notifyEmailOff: users.notifyEmailOff,
      notifyEmailMuted: users.notifyEmailMuted,
      telegramOff: users.telegramOff,
    })
    .from(users)
    .where(eq(users.id, actor.id));

  const me = rows[0];
  if (!me) throw new ForbiddenError('user.not_found');

  const bank: BankInfo = {
    account: me.bankAccount,
    iban: me.bankIban,
    card: me.bankCard,
  };

  return {
    ...me,
    bank,
    hasBank: hasBankInfo(bank),
    telegram: telegramState({ botConfigured: Boolean(await botToken()), chatId: me.telegramChatId }),
    notify: {
      email: me.notifyEmail,
      emailOn: !me.notifyEmailOff,
      muted: normalizeMuted(me.notifyEmailMuted),
      telegramOn: !me.telegramOff,
      // ⚠️ بدونِ mailer، به‌جای گزینه‌هایی که کار نمی‌کنند، حقیقت گفته می‌شود.
      mailerReady: mailEnabled(),
    },
  };
}

/**
 * ذخیرهٔ ترجیحاتِ اعلان.
 *
 * ⚠️ ایمیلِ خالی خطا **نیست**: یعنی «همان ایمیلِ ورود». اجبار به پر کردنش
 * کاربر را وادار می‌کرد ایمیلش را دو جا نگه دارد.
 */
export async function saveNotifyPrefs(actor: Actor, input: {
  email: string;
  emailOn: boolean;
  muted: string[];
  telegramOn: boolean;
}) {
  const email = input.email.trim();
  // فقط شکلِ ساده بررسی می‌شود؛ اعتبارِ واقعی را خودِ ارسال معلوم می‌کند.
  if (email !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ForbiddenError('email.invalid');
  }

  await db.update(users).set({
    notifyEmail: email,
    notifyEmailOff: !input.emailOn,
    notifyEmailMuted: normalizeMuted(input.muted),
    telegramOff: !input.telegramOn,
    updatedAt: new Date(),
  }).where(eq(users.id, actor.id));
}

/** ذخیرهٔ اطلاعاتِ بانکی — فقط برای خودِ کاربر. */
export async function saveBankInfo(actor: Actor, input: Partial<BankInfo>) {
  const bank = normalizeBankInfo(input);

  await db.update(users).set({
    bankAccount: bank.account,
    bankIban: bank.iban,
    bankCard: bank.card,
    updatedAt: new Date(),
  }).where(eq(users.id, actor.id));

  // ⚠️ خودِ شماره‌ها در لاگِ ممیزی نمی‌روند — دادهٔ حساسِ پرداخت‌اند.
  await db.insert(auditLog).values({
    actorType: 'user',
    actorId: actor.id,
    action: 'profile.bank',
    objectType: 'user',
    objectId: actor.id,
    after: { hasBank: hasBankInfo(bank) },
  });

  return bank;
}

/** منطقهٔ زمانی — نامعتبر به پیش‌فرضِ سامانه برمی‌گردد. */
export async function saveTimezone(actor: Actor, value: string) {
  const timezone = normalizeTimezone(value);
  await db.update(users).set({ timezone, updatedAt: new Date() })
    .where(eq(users.id, actor.id));
  return timezone;
}

/* ------------------------------------------------------------------ *
 * تلگرام
 * ------------------------------------------------------------------ */

/**
 * ساختِ پیوندِ اتصال.
 *
 * ⚠️ توکن **تصادفیِ رمزنگارانه** است و هر بار از نو ساخته می‌شود: هر کسی که
 * توکن را داشته باشد می‌تواند اعلان‌های این کاربر را به چتِ خودش وصل کند، پس
 * توکنِ قابلِ‌حدس یعنی ربودنِ اعلان.
 */
export async function startTelegramLink(actor: Actor): Promise<string | null> {
  if (!(await botToken())) return null;

  const token = randomBytes(24).toString('base64url');
  await db.update(users).set({ telegramLinkToken: token, updatedAt: new Date() })
    .where(eq(users.id, actor.id));

  return connectDeeplink(await botUsername(), token);
}

/** قطعِ اتصال — شناسهٔ چت و توکن هر دو پاک می‌شوند. */
export async function disconnectTelegram(actor: Actor) {
  await db.update(users)
    .set({ telegramChatId: '', telegramLinkToken: null, updatedAt: new Date() })
    .where(eq(users.id, actor.id));
}

/**
 * گره‌زدنِ یک چت به کاربر — از سمتِ وب‌هوکِ بات صدا زده می‌شود.
 * ⚠️ توکن پس از مصرف **باطل** می‌شود؛ توکنِ چندبارمصرف یعنی هر کسی که آن را
 * ببیند بعداً هم می‌تواند استفاده کند.
 */
export async function completeTelegramLink(token: string, chatId: string): Promise<boolean> {
  if (!token || !chatId) return false;

  const rows = await db.select({ id: users.id }).from(users)
    .where(eq(users.telegramLinkToken, token));
  const user = rows[0];
  if (!user) return false;

  await db.update(users)
    // ⚠️ اتصالِ دوباره کانال را روشن می‌کند: کسی که خاموش کرده، قطع کرده و دوباره
    // وصل می‌کند انتظار دارد پیام بگیرد — نسخهٔ قبلی هم `telegram_off` را پاک می‌کرد.
    .set({ telegramChatId: chatId, telegramLinkToken: null, telegramOff: false, updatedAt: new Date() })
    .where(eq(users.id, user.id));
  return true;
}

/* ------------------------------------------------------------------ *
 * مشخصاتِ شرکت
 * ------------------------------------------------------------------ */

export interface CompanyInput {
  name: string;
  address: string;
  taxId: string;
  email: string;
  phone: string;
  website: string;
  bank: string;
  invoiceFooter: string;
  /** `undefined` = دست‌نخورده · `null` = بردار · عدد = همین فایل. */
  logoFileId?: number | null;
}

export async function getCompany() {
  const rows = await db
    .select({
      name: company.name,
      address: company.address,
      taxId: company.taxId,
      email: company.email,
      phone: company.phone,
      website: company.website,
      bank: company.bank,
      invoiceFooter: company.invoiceFooter,
      logoFileId: company.logoFileId,
    })
    .from(company)
    .where(eq(company.id, 1));

  return rows[0] ?? {
    name: '', address: '', taxId: '', email: '', phone: '',
    website: '', bank: '', invoiceFooter: '', logoFileId: null,
  };
}

/**
 * ⚠️ `settings.manage`، نه فقط مالک: در نسخهٔ قبلی تبِ «اطلاعات شرکت» زیرِ
 * بود و حسابدار هم می‌توانست ذخیره‌اش کند — منطقی است، چون
 * همین مشخصات روی فاکتورهایی می‌نشیند که خودِ او صادر می‌کند.
 */
export async function saveCompany(actor: Actor, input: CompanyInput) {
  if (!can(actor, 'settings.manage')) throw new ForbiddenError('settings.manage');

  /**
   * ⚠️ `undefined` یعنی «دست نزن» و `null` یعنی «بردار»؛ دو معنیِ متفاوت.
   * اگر هر دو یکی بودند، هر ذخیرهٔ فرمِ مشخصات لوگو را پاک می‌کرد.
   */
  const logo = input.logoFileId === undefined ? {} : { logoFileId: input.logoFileId };

  const trim = (value: string, max = 300) => value.trim().slice(0, max);

  await db.insert(company).values({
    id: 1,
    name: trim(input.name),
    address: trim(input.address, 1000),
    taxId: trim(input.taxId, 60),
    email: trim(input.email, 200),
    phone: trim(input.phone, 60),
    // متنِ ساده، نه URL ِ اجباری — `https://` تحمیلی آدرس را روی فاکتور شلوغ می‌کند.
    website: trim(input.website, 200),
    bank: trim(input.bank, 1000),
    invoiceFooter: trim(input.invoiceFooter, 1000),
    ...logo,
  }).onConflictDoUpdate({
    target: company.id,
    set: {
      name: trim(input.name),
      address: trim(input.address, 1000),
      taxId: trim(input.taxId, 60),
      email: trim(input.email, 200),
      phone: trim(input.phone, 60),
      website: trim(input.website, 200),
      bank: trim(input.bank, 1000),
      invoiceFooter: trim(input.invoiceFooter, 1000),
      updatedAt: new Date(),
      ...logo,
    },
  });

  await db.insert(auditLog).values({
    actorType: 'user',
    actorId: actor.id,
    action: 'company.update',
    objectType: 'company',
    objectId: 1,
    after: input,
  });
}

export { files };

/**
 * تکمیلِ اتصالِ تلگرام.
 *
 * ⚠️ **پولینگ، نه وب‌هوک.** نسخهٔ قبلی هم همین کار را می‌کند و دلیلش عملی است:
 * وب‌هوک آدرسِ عمومیِ HTTPS می‌خواهد و در نصبِ داخلی یا پشتِ VPN کار نمی‌کند.
 * `getUpdates` هر جایی جواب می‌دهد و فقط وقتی صدا زده می‌شود که کاربر خودش
 * دکمه را بزند — پس باری هم روی سرور نمی‌گذارد.
 *
 * ⚠️ تابعِ `completeTelegramLink` از قبل نوشته شده بود ولی **هیچ‌کس صدایش
 * نمی‌زد**: کاربر لینک را می‌گرفت، به بات پیام می‌داد، و هیچ اتفاقی
 * نمی‌افتاد. کلِ قابلیتِ تلگرام عملاً مرده بود.
 */
export type TelegramConnectResult =
  | { ok: true }
  | { ok: false; reason: 'no_token' | 'not_found' | 'taken' | 'network' };

export async function tryConnectTelegram(actor: Actor): Promise<TelegramConnectResult> {
  const token = await botToken();
  if (!token) return { ok: false, reason: 'no_token' };

  const [me] = await db.select({ linkToken: users.telegramLinkToken })
    .from(users).where(eq(users.id, actor.id));
  if (!me?.linkToken) return { ok: false, reason: 'not_found' };

  let updates: Array<{ message?: { text?: string; chat?: { id?: number }; from?: { id?: number } } }>;
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${token}/getUpdates?limit=100&timeout=0`,
    );
    const data = await res.json() as { ok?: boolean; result?: typeof updates };
    if (!data.ok || !Array.isArray(data.result)) return { ok: false, reason: 'network' };
    updates = data.result;
  } catch {
    return { ok: false, reason: 'network' };
  }

  // پیامی که کاربر به بات زده: «/start <token>».
  const want = `/start ${me.linkToken}`;
  const hit = updates.find((u) => (u.message?.text ?? '').trim() === want);
  const rawChat = hit?.message?.chat?.id ?? hit?.message?.from?.id;
  if (rawChat === undefined) return { ok: false, reason: 'not_found' };

  const chatId = String(rawChat).replace(/[^0-9-]/g, '');
  if (chatId === '') return { ok: false, reason: 'not_found' };

  /**
   * ⚠️ یک حسابِ تلگرام فقط به **یک** کاربر وصل می‌شود.
   * بدونِ این گارد، اعلان‌های مالیِ دو نفر در یک چت می‌نشست — یعنی نشتِ
   * اطلاعات، نه یک ناهماهنگیِ ساده. نسخهٔ قبلی هم صریحاً همین را نوشته.
   */
  const others = await db.select({ id: users.id })
    .from(users).where(eq(users.telegramChatId, chatId));
  if (others.some((u) => u.id !== actor.id)) return { ok: false, reason: 'taken' };

  const linked = await completeTelegramLink(me.linkToken, chatId);
  return linked ? { ok: true } : { ok: false, reason: 'not_found' };
}

/**
 * تغییرِ رمزِ **خودِ** کاربر — پورتِ صفحهٔ پروفایلِ سامانهٔ قبلی.
 *
 * ⚠️ رمزِ فعلی پرسیده می‌شود، حتی وقتی کاربر واردِ سیستم است: نشستِ
 * دزدیده‌شده نباید بتواند رمز را عوض کند و صاحبِ حساب را بیرون بگذارد.
 *
 * ⚠️ کاربری که هنوز رمزی ندارد (مدیر ساخته و رمز نگذاشته) بدونِ رمزِ
 * فعلی می‌تواند اولین رمزش را بگذارد — وگرنه در بن‌بست می‌ماند.
 */
export class PasswordError extends Error {
  constructor(readonly reason: 'wrong_current' | 'too_short' | 'too_common') {
    super(reason);
    this.name = 'PasswordError';
  }
}

export async function changeMyPassword(
  actor: Actor,
  input: { current: string; next: string },
): Promise<void> {
  const policy = checkPasswordPolicy(input.next);
  if (!policy.ok) throw new PasswordError(policy.reason ?? 'too_short');

  const [me] = await db.select({ hash: users.passwordHash })
    .from(users).where(eq(users.id, actor.id));

  if (me?.hash) {
    const ok = await verifyPassword(me.hash, input.current);
    if (!ok) throw new PasswordError('wrong_current');
  }

  await db.update(users)
    .set({ passwordHash: await hashPassword(input.next), updatedAt: new Date() })
    .where(eq(users.id, actor.id));

  await db.insert(auditLog).values({
    actorType: 'user',
    actorId: actor.id,
    action: 'profile.password',
    objectType: 'user',
    objectId: actor.id,
    before: null,
    // ⚠️ هرگز خودِ رمز یا هش در لاگ نمی‌رود — فقط اینکه عوض شد.
    after: { changed: true },
  });
}
