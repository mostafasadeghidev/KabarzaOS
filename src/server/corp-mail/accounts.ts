import 'server-only';
import { randomInt } from 'node:crypto';
import { and, asc, eq, isNull, ne } from 'drizzle-orm';
import { db } from '@/db/client';
import { auditLog, corpMailSecrets, serviceGrants, services, userRoles, users } from '@/db/schema';
import type { Actor } from '@/domain/access/permissions';
import { assertCanManage } from '@/domain/access/guard';
import { localPartProblem, normalizeLocalPart, quotaBytes, type CorpMailConfig } from '@/domain/corp-mail/config';
import { open as openSecret, seal } from '@/server/ai/secret-box';
import { smtpConfig } from '@/server/settings/smtp-service';
import {
  aliasList, buildAliasMap, suggestMember, takenNames, toMailAccount, type MailAccount,
} from '@/domain/corp-mail/accounts';
import { isCorpMailConfigured, JmapError, jmapCall, result, sessionAccountId } from './jmap';
import { corpMailConfig } from './settings';
import { issueAppPassword } from './mailbox';

/**
 * حساب‌های ایمیلِ شرکتی (۲.۶۰.۰): فهرست از Stalwart، جفت‌کردن با اعضا، alias.
 *
 * ⚠️ «جفت» یعنی یک ردیفِ دسترسی در دفتر: سرویسِ ایمیلِ شرکتی (`provider =
 * 'stalwart'`)، شناسهٔ حساب = نشانی، `external_id` = id ِ حساب در Stalwart. پس
 * پروفایل، خروجی و چک‌لیستِ خروجِ عضو ایمیل را بی‌هیچ کدِ تازه‌ای می‌بینند.
 *
 * ⚠️ هیچ حسابی اینجا پاک نمی‌شود (کلید هم مجوزش را ندارد). حسابِ `admin` نه
 * فهرست می‌شود نه جفت.
 */

export type CorpMailErrorCode =
  | 'not_configured' | 'no_domain' | 'not_found' | 'member_inactive' | 'member_has_mail'
  | 'invalid_name' | 'reserved_name' | 'name_taken' | 'protected' | 'stalwart' | 'invalid_quota' | 'weak_password'
  | 'not_linked' | 'created_unlinked';

export class CorpMailError extends Error {
  constructor(readonly code: CorpMailErrorCode, readonly detail = '') {
    super(`corp-mail: ${code}${detail ? ` (${detail})` : ''}`);
    this.name = 'CorpMailError';
  }
}

const PROVIDER = 'stalwart';
/** حساب‌هایی که برنامه هرگز دست نمی‌زند. */
const PROTECTED = new Set(['admin']);

async function audit(actor: Actor, action: string, objectId: number, before: unknown, after: unknown) {
  await db.insert(auditLog).values({
    actorType: 'user', actorId: actor.id, action, objectType: 'service_grant', objectId,
    before: before ?? null, after: after ?? null,
  });
}

function wrap(error: unknown): never {
  if (error instanceof JmapError) {
    console.warn('[corp-mail] jmap error', error.code, error.detail);
    throw new CorpMailError(error.code === 'not_configured' ? 'not_configured' : 'stalwart', error.code);
  }
  throw error;
}

/**
 * ردِ یک ورودی در پاسخِ `x:Account/set` (`notCreated` / `notUpdated`).
 *
 * ⚠️ نوع و توضیحِ Stalwart هم در لاگِ سرور می‌نشیند و هم به مدیر می‌رسد: بی‌آن
 * «کلید پذیرفته نشد» تنها نشانه بود و علت (مثلاً مجوزِ کم برای یک فیلد) فقط
 * در پاسخ بود. هیچ‌کدام راز ندارند؛ بدنهٔ درخواست (رمز) هرگز لاگ نمی‌شود.
 */
function refused(op: string, entry: { type?: string; description?: string } | undefined): never {
  const type = entry?.type ?? 'unknown';
  const description = String(entry?.description ?? '').slice(0, 200);
  console.warn('[corp-mail] stalwart refused', op, type, description);
  throw new CorpMailError('stalwart', description ? `${type}: ${description}` : type);
}

/** سرویسِ «ایمیلِ شرکتی» در دفتر — اگر نیست ساخته می‌شود. */
export async function corpMailServiceId(config?: CorpMailConfig): Promise<number> {
  const [row] = await db.select({ id: services.id }).from(services).where(eq(services.provider, PROVIDER));
  if (row) return row.id;
  const cfg = config ?? await corpMailConfig();
  const [created] = await db.insert(services).values({
    name: 'ایمیلِ شرکتی', provider: PROVIDER, downloadUrl: cfg.webmailUrl,
  }).onConflictDoNothing().returning({ id: services.id });
  if (created) return created.id;
  // هم‌زمان کسِ دیگری ساخت.
  const [again] = await db.select({ id: services.id }).from(services).where(eq(services.provider, PROVIDER));
  return again!.id;
}

/** شناسهٔ Stalwart ِ دامنهٔ تنظیم‌شده — از آزمونِ اتصال، وگرنه همین حالا. */
async function domainIdOf(config: CorpMailConfig, adminId: string): Promise<{ id: string; names: Map<string, string> }> {
  if (!config.domain) throw new CorpMailError('no_domain');
  const responses = await jmapCall([['x:Domain/get', { accountId: adminId, ids: null, properties: ['name'] }, 'd']]);
  const list = result<{ list?: Array<{ id: string; name: string }> }>(responses, 'd').list ?? [];
  const names = new Map(list.map((d) => [d.id, d.name]));
  const match = list.find((d) => d.name?.toLowerCase() === config.domain);
  if (!match) throw new CorpMailError('no_domain');
  return { id: match.id, names };
}

const ACCOUNT_PROPS = ['name', 'domainId', 'emailAddress', 'aliases', 'description', 'usedDiskQuota', 'quotas'];

async function fetchAccounts(adminId: string, domainId: string, names: Map<string, string>, ids: string[] | null = null) {
  const responses = await jmapCall([['x:Account/get', { accountId: adminId, ids, properties: ACCOUNT_PROPS }, 'a']]);
  const raw = result<{ list?: Array<Record<string, unknown>> }>(responses, 'a').list ?? [];
  return {
    accounts: raw.map((r) => toMailAccount(r, domainId, names)).filter((a): a is MailAccount => a !== null),
    raw,
  };
}

export interface MailAccountRow extends MailAccount {
  link: { grantId: number; userId: number; userName: string } | null;
  /** رمزِ صندوقِ بی‌صاحب نگه داشته شده (۳.۳.۰)؟ */
  hasSharedSecret: boolean;
  suggestedUserId: number | null;
  protected: boolean;
}

export interface MailAccountsView {
  configured: boolean;
  domain: string;
  error: CorpMailErrorCode | null;
  errorDetail: string;
  accounts: MailAccountRow[];
  people: Array<{ id: number; name: string }>;
  /** نشانی‌های اتصال برای راهنمای «تنظیم در گوشی، Outlook یا SMTP» (۳.۲.۰). */
  setup: { webmailUrl: string; imapHost: string; imapPort: number; smtpHost: string; smtpPort: number };
}

async function activeMembers() {
  return db.selectDistinct({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .where(and(isNull(users.deletedAt), eq(users.memberState, 'active'), ne(userRoles.role, 'client')))
    .orderBy(asc(users.name));
}

export async function listMailAccounts(actor: Actor): Promise<MailAccountsView> {
  assertCanManage(actor, 'members');
  const config = await corpMailConfig();
  const people = await activeMembers();
  const setup = {
    webmailUrl: config.webmailUrl, imapHost: config.imapHost, imapPort: config.imapPort,
    smtpHost: config.smtpHost, smtpPort: config.smtpPort,
  };
  const empty = { domain: config.domain, accounts: [], people: people.map(({ id, name }) => ({ id, name })), setup };
  if (!isCorpMailConfigured()) return { configured: false, error: null, errorDetail: '', ...empty };

  try {
    const adminId = await sessionAccountId();
    const { id: domainId, names } = await domainIdOf(config, adminId);
    const { accounts } = await fetchAccounts(adminId, domainId, names);
    const serviceId = await corpMailServiceId(config);
    const links = await db.select({
      grantId: serviceGrants.id, userId: serviceGrants.userId, externalId: serviceGrants.externalId, userName: users.name,
    })
      .from(serviceGrants)
      .innerJoin(users, eq(users.id, serviceGrants.userId))
      .where(and(eq(serviceGrants.serviceId, serviceId), isNull(serviceGrants.revokedAt), ne(serviceGrants.externalId, '')));
    const byAccount = new Map(links.map((l) => [l.externalId, l]));
    const kept = new Set((await db.select({ id: corpMailSecrets.accountId }).from(corpMailSecrets)).map((r) => r.id));
    const linkedUsers = new Set(links.map((l) => l.userId));
    const free = people.filter((p) => !linkedUsers.has(p.id));

    return {
      configured: true, error: null, errorDetail: '', ...empty,
      accounts: accounts
        .filter((a) => !PROTECTED.has(a.name))
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((a) => {
          const link = byAccount.get(a.id);
          return {
            ...a,
            protected: false,
            link: link ? { grantId: link.grantId, userId: link.userId, userName: link.userName } : null,
            hasSharedSecret: !link && kept.has(a.id),
            suggestedUserId: link ? null : suggestMember(a, config.domain, free),
          };
        }),
    };
  } catch (error) {
    if (error instanceof CorpMailError) return { configured: true, error: error.code, errorDetail: error.detail, ...empty };
    if (error instanceof JmapError) return { configured: true, error: 'stalwart', errorDetail: error.code, ...empty };
    throw error;
  }
}

/** یک حساب از Stalwart، یا خطای not_found. */
async function oneAccount(adminId: string, accountId: string) {
  const config = await corpMailConfig();
  const { id: domainId, names } = await domainIdOf(config, adminId);
  const { accounts, raw } = await fetchAccounts(adminId, domainId, names, [accountId]);
  const account = accounts[0];
  if (!account) throw new CorpMailError('not_found');
  if (PROTECTED.has(account.name)) throw new CorpMailError('protected');
  return { account, raw: raw[0]!, config, domainId };
}

/** رمزِ صندوقِ بی‌صاحب را (رمزگذاری‌شده) نگه می‌دارد؛ بارِ تازه جایگزینِ قبلی. */
async function storeSharedSecret(accountId: string, address: string, password: string) {
  const now = new Date();
  await db.insert(corpMailSecrets).values({ accountId, address, secretEnc: seal(password), updatedAt: now })
    .onConflictDoUpdate({ target: corpMailSecrets.accountId, set: { address, secretEnc: seal(password), updatedAt: now } });
}

/**
 * قاعدهٔ رمزِ دستیِ صندوق (۳.۳.۰): ۱۲ تا ۱۲۸ نویسه، بی فاصله و نویسهٔ کنترلی، با حرف و رقم.
 * `null` یعنی پذیرفته؛ وگرنه علت.
 */
export function mailPasswordProblem(value: string): 'length' | 'space' | 'mix' | null {
  if (value.length < 12 || value.length > 128) return 'length';
  if (/[\s\u0000-\u001f\u007f]/.test(value)) return 'space';
  if (!/[A-Za-z]/.test(value) || !/[0-9]/.test(value)) return 'mix';
  return null;
}

/**
 * دیدنِ رمزِ صندوقِ بی‌صاحب (۳.۳.۰) — گاردِ «مدیریتِ اعضا» و ثبتِ هر دیدن، مثلِ رمزهای دفتر.
 *
 * ⚠️ اگر رمز هنوز در برنامه نیست ولی همین صندوق فرستندهٔ SMTP ِ خودِ برنامه است، رمز از
 * همان تنظیم برداشته و نگه داشته می‌شود — برای صندوقی که پیش از ۳.۳.۰ ساخته شده و رمزش
 * فقط در SMTP مانده بود. رمزِ SMTP هم مالِ همان صندوق است، پس چیزی بیرون نمی‌زند.
 */
export async function revealSharedMailSecret(actor: Actor, accountId: string): Promise<string | null> {
  assertCanManage(actor, 'members');
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(accountId)) throw new CorpMailError('not_found');
  const [row] = await db.select({ address: corpMailSecrets.address, secretEnc: corpMailSecrets.secretEnc })
    .from(corpMailSecrets).where(eq(corpMailSecrets.accountId, accountId));
  if (row) {
    await audit(actor, 'corp_mail.secret_view', 0, null, { account: row.address });
    return openSecret(row.secretEnc);
  }
  // هنوز در انبار نیست — اگر فرستندهٔ SMTP ِ همین برنامه است، از آنجا.
  let address = '';
  try {
    ({ account: { emailAddress: address } } = await oneAccount(await sessionAccountId(), accountId));
  } catch (error) { wrap(error); }
  const smtp = await smtpConfig();
  if (!smtp || !smtp.pass || smtp.user.trim().toLowerCase() !== address.toLowerCase()) return null;
  await storeSharedSecret(accountId, address, smtp.pass);
  await audit(actor, 'corp_mail.secret_view', 0, null, { account: address, from: 'smtp' });
  return smtp.pass;
}

/**
 * حجمِ یک صندوق (۳.۲.۰) — گیگابایت، همان بازهٔ تنظیمِ پیش‌فرض (۰٫۱ تا ۱۰۰۰).
 *
 * ⚠️ `update` روی فیلدِ map کلِ آن را جایگزین می‌کند (راهنمای سرورِ ایمیل)؛ پس
 * سهمیه‌های دیگرِ صندوق از همان پاسخِ `get` خوانده و دست‌نخورده پس فرستاده می‌شوند.
 */
export async function setMailQuota(actor: Actor, accountId: string, gb: number): Promise<number> {
  assertCanManage(actor, 'members');
  if (!Number.isFinite(gb) || gb < 0.1 || gb > 1000) throw new CorpMailError('invalid_quota');
  const bytes = Math.round(Math.round(gb * 10) / 10 * 1024 ** 3);
  let before: number | null = null;
  let address = '';
  try {
    const adminId = await sessionAccountId();
    const { account, raw } = await oneAccount(adminId, accountId);
    address = account.emailAddress;
    before = account.quotaBytes;
    const current = (raw.quotas && typeof raw.quotas === 'object' ? raw.quotas : {}) as Record<string, unknown>;
    const responses = await jmapCall([['x:Account/set', {
      accountId: adminId,
      update: { [account.id]: { quotas: { ...current, maxDiskQuota: bytes } } },
    }, 's']]);
    const set = result<SetResult>(responses, 's');
    if (set.notUpdated?.[account.id]) refused('update', set.notUpdated[account.id]);
  } catch (error) { wrap(error); }
  const link = await linkedGrant(await corpMailServiceId(), accountId);
  await audit(actor, 'corp_mail.quota', link?.id ?? 0, { account: address, bytes: before }, { account: address, bytes });
  return bytes;
}

/**
 * جزئیاتِ صندوقِ یک ردیفِ دفتر (۳.۱.۰) — برای مودالِ «دسترسی‌ها»: نشانیِ اصلی،
 * نشانی‌های دیگر و حجم، زنده از سرورِ ایمیل. رمز اینجا نیست (همان دکمهٔ چشم).
 */
export async function mailboxOfGrant(actor: Actor, grantId: number): Promise<{
  accountId: string; address: string; aliases: string[]; otherAliases: string[];
  usedBytes: number; quotaBytes: number | null;
}> {
  assertCanManage(actor, 'members');
  const serviceId = await corpMailServiceId();
  const [grant] = await db.select({ externalId: serviceGrants.externalId }).from(serviceGrants)
    .where(and(eq(serviceGrants.id, grantId), eq(serviceGrants.serviceId, serviceId), isNull(serviceGrants.revokedAt)));
  if (!grant?.externalId) throw new CorpMailError('not_linked');
  try {
    const { account, config } = await oneAccount(await sessionAccountId(), grant.externalId);
    return {
      accountId: account.id,
      address: account.emailAddress,
      aliases: account.aliases.map((a) => `${a}@${config.domain}`),
      otherAliases: account.otherAliases,
      usedBytes: account.usedBytes,
      quotaBytes: account.quotaBytes,
    };
  } catch (error) { wrap(error); }
}

/**
 * جفت‌کردنِ یک حساب با عضو (یا جداکردن با `userId = null`).
 *
 * ⚠️ جداکردن ردیف را **قطع** می‌کند، پاک نمی‌کند — تاریخچهٔ «چه کسی این
 * صندوق را داشت» می‌ماند. عضوی که از پیش صندوقِ دیگری دارد رد می‌شود.
 */
export async function linkMailAccount(actor: Actor, accountId: string, userId: number | null): Promise<void> {
  assertCanManage(actor, 'members');
  let account: MailAccount;
  try {
    ({ account } = await oneAccount(await sessionAccountId(), accountId));
  } catch (error) { wrap(error); }
  const serviceId = await corpMailServiceId();

  if (userId !== null) {
    const [member] = await db.select({ state: users.memberState }).from(users)
      .where(and(eq(users.id, userId), isNull(users.deletedAt)));
    if (!member || member.state !== 'active') throw new CorpMailError('member_inactive');
  }

  await db.transaction(async (tx) => {
    const [current] = await tx.select({ id: serviceGrants.id, userId: serviceGrants.userId }).from(serviceGrants)
      .where(and(eq(serviceGrants.serviceId, serviceId), eq(serviceGrants.externalId, account.id), isNull(serviceGrants.revokedAt)))
      .for('update');
    if (current && current.userId === userId) return;

    const now = new Date();
    if (current) {
      /*
       * ⚠️ ۳.۳.۰: رمزِ صندوق با جدا شدن از عضو گم نمی‌شود — اگر بی‌صاحب می‌ماند به
       * انبارِ صندوق‌های بی‌صاحب می‌رود (و اگر به عضوِ دیگری می‌رود، پایین‌تر به ردیفِ او).
       */
      const [old] = await tx.select({ secretEnc: serviceGrants.secretEnc }).from(serviceGrants).where(eq(serviceGrants.id, current.id));
      if (old?.secretEnc) {
        await tx.insert(corpMailSecrets).values({ accountId: account.id, address: account.emailAddress, secretEnc: old.secretEnc, updatedAt: now })
          .onConflictDoUpdate({ target: corpMailSecrets.accountId, set: { secretEnc: old.secretEnc, address: account.emailAddress, updatedAt: now } });
      }
      await tx.update(serviceGrants)
        .set({ revokedAt: now, revokedBy: actor.id, updatedAt: now, secretEnc: '', appSecretEnc: '' })
        .where(eq(serviceGrants.id, current.id));
      await tx.insert(auditLog).values({
        actorType: 'user', actorId: actor.id, action: 'corp_mail.unlink', objectType: 'service_grant', objectId: current.id,
        before: { account: account.emailAddress, userId: current.userId }, after: null,
      });
    }
    if (userId === null) return;

    // ردیفِ بازِ قبلیِ همین عضو روی این سرویس (مثلاً دستی ثبت‌شده، بی شناسهٔ حساب).
    const [mine] = await tx.select({ id: serviceGrants.id, externalId: serviceGrants.externalId }).from(serviceGrants)
      .where(and(eq(serviceGrants.serviceId, serviceId), eq(serviceGrants.userId, userId), isNull(serviceGrants.revokedAt)))
      .for('update');
    if (mine && mine.externalId && mine.externalId !== account.id) throw new CorpMailError('member_has_mail');

    // ۳.۳.۰ — رمزِ نگه‌داشته‌شدهٔ صندوقِ بی‌صاحب به ردیفِ عضوِ تازه می‌رود (کارمند در «دسترسی‌های من» می‌بیند).
    const [kept] = await tx.select({ secretEnc: corpMailSecrets.secretEnc }).from(corpMailSecrets).where(eq(corpMailSecrets.accountId, account.id));
    const carried = kept?.secretEnc ? { secretEnc: kept.secretEnc } : {};

    let grantId: number;
    if (mine) {
      await tx.update(serviceGrants)
        .set({ externalId: account.id, accountRef: account.emailAddress, updatedAt: now, ...carried })
        .where(eq(serviceGrants.id, mine.id));
      grantId = mine.id;
    } else {
      const [row] = await tx.insert(serviceGrants).values({
        serviceId, userId, grantedBy: actor.id, accountRef: account.emailAddress, externalId: account.id, level: 'member', ...carried,
      }).returning({ id: serviceGrants.id });
      grantId = row!.id;
    }
    if (kept) await tx.delete(corpMailSecrets).where(eq(corpMailSecrets.accountId, account.id));
    await tx.insert(auditLog).values({
      actorType: 'user', actorId: actor.id, action: 'corp_mail.link', objectType: 'service_grant', objectId: grantId,
      before: null, after: { account: account.emailAddress, userId },
    });
  });
}

/**
 * aliasهای دامنهٔ اصلیِ یک حساب را با این فهرست جایگزین می‌کند.
 * ⚠️ نامِ رزرو یا گرفته‌شده (حساب یا aliasِ دیگری) رد می‌شود — ایمیلِ آن
 * نشانی به صندوقِ اشتباه می‌رفت.
 */
export async function setMailAliases(actor: Actor, accountId: string, wanted: string[]): Promise<string[]> {
  assertCanManage(actor, 'members');
  try {
    const adminId = await sessionAccountId();
    const { account, raw, config, domainId } = await oneAccount(adminId, accountId);
    const names = [...new Set(wanted.map(normalizeLocalPart).filter(Boolean))];
    for (const name of names) {
      const problem = localPartProblem(name, config);
      if (problem === 'reserved') throw new CorpMailError('reserved_name', name);
      if (problem) throw new CorpMailError('invalid_name', name);
    }
    const all = (await fetchAccounts(adminId, domainId, new Map())).accounts;
    const taken = takenNames(all, domainId, account.id);
    const clash = names.find((n) => taken.has(n) || n === account.name);
    if (clash) throw new CorpMailError('name_taken', clash);

    const aliases = buildAliasMap(aliasList(raw.aliases), names, domainId);
    const responses = await jmapCall([['x:Account/set', { accountId: adminId, update: { [account.id]: { aliases } } }, 's']]);
    const set = result<{ notUpdated?: Record<string, { type?: string; description?: string }> }>(responses, 's');
    if (set.notUpdated?.[account.id]) refused('aliases', set.notUpdated[account.id]);

    const serviceId = await corpMailServiceId(config);
    const [link] = await db.select({ id: serviceGrants.id }).from(serviceGrants)
      .where(and(eq(serviceGrants.serviceId, serviceId), eq(serviceGrants.externalId, account.id), isNull(serviceGrants.revokedAt)));
    await audit(actor, 'corp_mail.aliases', link?.id ?? 0, { account: account.emailAddress, aliases: account.aliases }, { aliases: names });
    return names;
  } catch (error) { wrap(error); }
}

/** پیامِ فارسیِ هر خطا — برای اکشن‌ها و صفحه. */
export function corpMailMessage(code: CorpMailErrorCode, detail = ''): string {
  switch (code) {
    case 'not_configured': return 'ایمیلِ شرکتی وصل نیست؛ در تنظیمات اتصال را بررسی کنید.';
    case 'no_domain': return 'دامنهٔ ایمیل تنظیم نشده یا روی سرورِ ایمیل پیدا نشد.';
    case 'not_found': return 'این حساب روی سرورِ ایمیل پیدا نشد.';
    case 'protected': return 'این حساب از برنامه قابلِ تغییر نیست.';
    case 'invalid_quota': return 'حجم باید بینِ ۰٫۱ تا ۱۰۰۰ گیگابایت باشد.';
    case 'weak_password': return 'رمز باید دست‌کم ۱۲ نویسه باشد، بی فاصله، و حرف و رقم هر دو را داشته باشد.';
    case 'member_inactive': return 'فقط به عضوِ فعال می‌شود صندوقِ ایمیل داد.';
    case 'member_has_mail': return 'این عضو از پیش صندوقِ ایمیلِ دیگری دارد؛ اول آن را جدا کنید.';
    // ⚠️ نامِ مشکل‌دار جای‌نگهدارِ {name} است، نه چسبیده به متن — تا ترجمه بشکند نه.
    case 'invalid_name': return 'نامِ «{name}» معتبر نیست: فقط حروفِ کوچکِ لاتین، رقم، نقطه، خط تیره و زیرخط.';
    case 'reserved_name': return 'نامِ «{name}» رزرو است و ساخته نمی‌شود.';
    case 'name_taken': return 'نشانیِ «{name}» از پیش مالِ حسابِ دیگری است.';
    case 'not_linked': return 'این صندوق به هیچ عضوی وصل نیست؛ رمزِ تازه جایی برای ماندن ندارد. اول آن را به عضو وصل کنید.';
    case 'created_unlinked': return 'صندوقِ «{name}» ساخته شد ولی در دفتر ثبت نشد. از همین صفحه آن را به عضو وصل کنید و رمزِ تازه بگیرید.';
    case 'stalwart':
      if (detail === 'unauthorized' || detail === 'forbidden') return 'سرورِ ایمیل کلید را نپذیرفت؛ کلید و مجوزهایش را بررسی کنید.';
      // ⚠️ ردِ یک ورودی (نوع: توضیح) — علت عیناً از Stalwart، تا مدیر بداند چه مجوز یا فیلدی کم است.
      if (detail.includes(':') || /^[a-z][A-Za-z]+$/.test(detail) && !['network', 'http', 'method', 'bad_response', 'not_configured'].includes(detail)) {
        return 'سرورِ ایمیل این تغییر را نپذیرفت: {name}';
      }
      return 'سرورِ ایمیل درخواست را انجام نداد؛ کمی بعد دوباره امتحان کنید.';
  }
}

/* ------------------------------------------------------------------ *
 * ساختن، رمزِ تازه، بستن (۲.۶۱.۰)
 * ------------------------------------------------------------------ */

/** بی‌نویسه‌های گیج‌کننده (0/O، 1/l/I) — کارمند گاهی رمز را از روی صفحه تایپ می‌کند. */
const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

/** رمزِ تصادفیِ امن (~۱۱۶ بیت برای ۲۰ نویسه) با `crypto.randomInt`، نه Math.random. */
export function generateMailPassword(length = 20): string {
  let out = '';
  for (let i = 0; i < length; i++) out += PASSWORD_ALPHABET[randomInt(PASSWORD_ALPHABET.length)];
  return out;
}

type SetResult = {
  created?: Record<string, { id?: string }>;
  notCreated?: Record<string, { type?: string; description?: string }>;
  notUpdated?: Record<string, { type?: string; description?: string }>;
};

/** ردیفِ بازِ دفتر برای این صندوق، اگر هست. */
async function linkedGrant(serviceId: number, accountId: string) {
  const [row] = await db.select({ id: serviceGrants.id, userId: serviceGrants.userId }).from(serviceGrants)
    .where(and(eq(serviceGrants.serviceId, serviceId), eq(serviceGrants.externalId, accountId), isNull(serviceGrants.revokedAt)));
  return row ?? null;
}

export interface CreateMailInput {
  /** `null` = صندوقِ مشترکِ بی‌صاحب (۲.۶۷.۰) — مثلاً noreply برای ایمیل‌های سامانه. */
  userId: number | null;
  local: string;
  aliases: string[];
}

/**
 * صندوقِ تازه برای یک عضو: حساب در Stalwart با رمزِ تصادفی، و یک ردیفِ دفتر
 * با همان رمز (رمزگذاری‌شده) تا کارمند در «دسترسی‌های من» ببیندش.
 *
 * ⚠️ همهٔ سنجش‌ها پیش از ساختن: عضوِ فعال بی‌صندوق، نامِ معتبر و آزاد، aliasهای
 * آزاد. رمز هرگز در گزارش، لاگ یا پاسخ نمی‌آید.
 */
export async function createMailAccount(
  actor: Actor,
  input: CreateMailInput,
): Promise<{ grantId: number | null; address: string; password?: string }> {
  assertCanManage(actor, 'members');
  /*
   * ⚠️ صندوقِ مشترک (۲.۶۷.۰): بی ردیفِ دفتر — پس رمز **هیچ‌جا** ذخیره نمی‌شود و فقط
   * یک بار به سازنده برمی‌گردد (مثلاً برای تنظیمِ SMTP). بعداً می‌شود آن را به عضوی
   * وصل کرد و «رمزِ تازه» گرفت تا رمز به دفترِ همان عضو برود.
   */
  const shared = input.userId === null;
  let member: { name: string; state: string } | undefined;
  let existing: { id: number; externalId: string | null } | undefined;
  const serviceId = await corpMailServiceId();
  if (input.userId !== null) {
    [member] = await db.select({ name: users.name, state: users.memberState }).from(users)
      .where(and(eq(users.id, input.userId), isNull(users.deletedAt)));
    if (!member || member.state !== 'active') throw new CorpMailError('member_inactive');
    const [client] = await db.select({ id: userRoles.userId }).from(userRoles)
      .where(and(eq(userRoles.userId, input.userId), eq(userRoles.role, 'client')));
    if (client) throw new CorpMailError('member_inactive');

    [existing] = await db.select({ id: serviceGrants.id, externalId: serviceGrants.externalId }).from(serviceGrants)
      .where(and(eq(serviceGrants.serviceId, serviceId), eq(serviceGrants.userId, input.userId), isNull(serviceGrants.revokedAt)));
    if (existing?.externalId) throw new CorpMailError('member_has_mail');
  }

  let created!: { id: string; address: string };
  const password = generateMailPassword();
  try {
    const adminId = await sessionAccountId();
    const config = await corpMailConfig();
    const { id: domainId } = await domainIdOf(config, adminId);
    const local = normalizeLocalPart(input.local);
    const aliases = [...new Set(input.aliases.map(normalizeLocalPart).filter(Boolean))].filter((a) => a !== local);
    for (const name of [local, ...aliases]) {
      const problem = localPartProblem(name, config);
      if (problem === 'reserved') throw new CorpMailError('reserved_name', name);
      if (problem) throw new CorpMailError('invalid_name', name);
    }
    const taken = takenNames((await fetchAccounts(adminId, domainId, new Map())).accounts, domainId);
    const clash = [local, ...aliases].find((n) => taken.has(n));
    if (clash) throw new CorpMailError('name_taken', clash);

    const responses = await jmapCall([['x:Account/set', {
      accountId: adminId,
      create: {
        n: {
          '@type': 'User',
          name: local,
          domainId,
          description: member?.name ?? 'Shared mailbox',
          roles: { '@type': 'User' },
          permissions: { '@type': 'Inherit' },
          quotas: { maxDiskQuota: quotaBytes(config) },
          aliases: buildAliasMap([], aliases, domainId),
          credentials: { 0: { '@type': 'Password', secret: password } },
        },
      },
    }, 's']]);
    const set = result<SetResult>(responses, 's');
    const id = set.created?.n?.id;
    if (!id) refused('create', set.notCreated?.n);
    created = { id, address: `${local}@${config.domain}` };
  } catch (error) { wrap(error); }

  if (shared) {
    // ۳.۳.۰ — رمزِ صندوقِ بی‌صاحب هم رمزگذاری‌شده می‌ماند (پشتِ چشم، با ثبتِ دیدن).
    await storeSharedSecret(created.id, created.address, password);
    await audit(actor, 'corp_mail.create', 0, null, { account: created.address, shared: true, aliases: input.aliases });
    return { grantId: null, address: created.address, password };
  }

  // ⚠️ حساب ساخته شد؛ اگر ثبت در دفتر شکست بخورد، صندوق بی‌صاحب می‌ماند و مدیر باید بداند.
  try {
    const grantId = await db.transaction(async (tx) => {
      const values = { accountRef: created.address, externalId: created.id, secretEnc: seal(password), updatedAt: new Date() };
      if (existing) {
        await tx.update(serviceGrants).set(values).where(eq(serviceGrants.id, existing.id));
        return existing.id;
      }
      const [row] = await tx.insert(serviceGrants).values({
        serviceId, userId: input.userId!, grantedBy: actor.id, level: 'member', ...values,
      }).returning({ id: serviceGrants.id });
      return row!.id;
    });
    await audit(actor, 'corp_mail.create', grantId, null, { account: created.address, userId: input.userId, aliases: input.aliases });
    await connectQuietly(grantId, created.address, password);
    return { grantId, address: created.address };
  } catch (error) {
    console.error('[corp-mail] created but not linked', created.address, error instanceof Error ? error.name : 'error');
    throw new CorpMailError('created_unlinked', created.address);
  }
}

/**
 * رمزِ تازه برای صندوقی که به عضوی وصل است. رمز در همان ردیفِ دفتر می‌نشیند.
 *
 * ⚠️ `credentials` در Stalwart یک‌جا جایگزین می‌شود: app passwordهای قبلی (گوشی،
 * Outlook، اتصالِ همین برنامه) هم باطل می‌شوند. صفحه پیش از این کار هشدار می‌دهد.
 */
export async function resetMailPassword(
  actor: Actor,
  accountId: string,
  /** رمزِ دلخواهِ مدیر (۳.۳.۰)؛ خالی = تصادفی. */
  custom: string | null = null,
): Promise<{ grantId: number | null; password?: string }> {
  assertCanManage(actor, 'members');
  if (custom !== null && mailPasswordProblem(custom)) throw new CorpMailError('weak_password');
  const serviceId = await corpMailServiceId();
  const link = await linkedGrant(serviceId, accountId);
  const password = custom ?? generateMailPassword();
  let address = '';
  try {
    const adminId = await sessionAccountId();
    const { account } = await oneAccount(adminId, accountId);
    address = account.emailAddress;
    const responses = await jmapCall([['x:Account/set', {
      accountId: adminId,
      update: { [account.id]: { credentials: { 0: { '@type': 'Password', secret: password } } } },
    }, 's']]);
    const set = result<SetResult>(responses, 's');
    if (set.notUpdated?.[account.id]) refused('update', set.notUpdated[account.id]);
  } catch (error) { wrap(error); }
  /*
   * ⚠️ صندوقِ بی‌صاحب (۲.۶۷.۰): رمز جایی برای ماندن ندارد، پس فقط همین یک بار به
   * مدیر برمی‌گردد و هیچ‌جا ذخیره یا لاگ نمی‌شود.
   */
  if (!link) {
    await storeSharedSecret(accountId, address, password);
    await audit(actor, 'corp_mail.password', 0, null, { account: address, shared: true, custom: custom !== null });
    return { grantId: null, password };
  }
  // ⚠️ credentials ِ تازه app password ِ قبلی را هم باطل کرد؛ کلیدِ برنامه پاک و دوباره گرفته می‌شود.
  await db.update(serviceGrants).set({ secretEnc: seal(password), appSecretEnc: '', updatedAt: new Date() }).where(eq(serviceGrants.id, link.id));
  await audit(actor, 'corp_mail.password', link.id, null, { account: address, custom: custom !== null });
  await connectQuietly(link.id, address, password);
  return { grantId: link.id };
}

/**
 * بستنِ صندوق — برای عضوی که رفته (راهنمای سرورِ ایمیل، بخشِ ۴-۵).
 *
 * ⚠️ حساب پاک **نمی‌شود** (ایمیل‌هایش می‌ماند): رمز به مقدارِ تصادفی‌ای عوض
 * می‌شود که هیچ‌جا نوشته نمی‌شود (پس همهٔ ورودها و app passwordها هم باطل
 * می‌شوند) و همهٔ aliasها خاموش می‌شوند. ردیفِ دفتر قطع می‌شود.
 *
 * ⚠️ اگر سرورِ ایمیل پاسخ ندهد، ردیف هم باز می‌ماند — دفتر نباید بگوید
 * «بسته شد» وقتی صندوق باز است.
 */
export async function closeMailAccount(actor: Actor, accountId: string): Promise<void> {
  assertCanManage(actor, 'members');
  let address = '';
  try {
    const adminId = await sessionAccountId();
    const { account, raw } = await oneAccount(adminId, accountId);
    address = account.emailAddress;
    const aliases = Object.fromEntries(aliasList(raw.aliases).map((a, i) => [String(i), { ...a, enable: false }]));
    const responses = await jmapCall([['x:Account/set', {
      accountId: adminId,
      update: { [account.id]: { aliases, credentials: { 0: { '@type': 'Password', secret: generateMailPassword(32) } } } },
    }, 's']]);
    const set = result<SetResult>(responses, 's');
    if (set.notUpdated?.[account.id]) refused('update', set.notUpdated[account.id]);
  } catch (error) { wrap(error); }

  const serviceId = await corpMailServiceId();
  const link = await linkedGrant(serviceId, accountId);
  const now = new Date();
  // رمزِ تصادفیِ بستن هیچ‌جا نوشته نمی‌شود؛ رمزِ قبلیِ صندوقِ بی‌صاحب هم دیگر معنا ندارد.
  await db.delete(corpMailSecrets).where(eq(corpMailSecrets.accountId, accountId));
  if (link) {
    await db.update(serviceGrants)
      .set({ revokedAt: now, revokedBy: actor.id, updatedAt: now, secretEnc: '', appSecretEnc: '' })
      .where(and(eq(serviceGrants.id, link.id), isNull(serviceGrants.revokedAt)));
  }
  await audit(actor, 'corp_mail.close', link?.id ?? 0, link ? { account: address, userId: link.userId } : { account: address }, null);
}

/**
 * اتصالِ صندوق به برنامه با رمزی که همین حالا ساخته شد (۲.۶۲.۰).
 * ⚠️ شکستش ساختن یا رمزِ تازه را خراب نمی‌کند؛ کارمند بعداً خودش «اتصال» می‌زند.
 */
async function connectQuietly(grantId: number, address: string, password: string) {
  try {
    await issueAppPassword(grantId, address, password);
  } catch (error) {
    console.warn('[corp-mail] auto-connect failed', address, error instanceof Error ? error.message : 'error');
  }
}

/**
 * برای «قطعِ دسترسی» در دفتر (۲.۶۱.۰): ردیف‌هایی که صندوقِ ایمیلِ شرکتیِ وصل‌اند،
 * با شناسهٔ حسابشان — تا قطع واقعی باشد، نه فقط در دفتر.
 */
export async function managedMailboxes(grantIds: number[]): Promise<Map<number, string>> {
  if (grantIds.length === 0) return new Map();
  const rows = await db.select({ id: serviceGrants.id, externalId: serviceGrants.externalId })
    .from(serviceGrants)
    .innerJoin(services, eq(services.id, serviceGrants.serviceId))
    .where(and(eq(services.provider, PROVIDER), ne(serviceGrants.externalId, ''), isNull(serviceGrants.revokedAt)));
  const wanted = new Set(grantIds);
  return new Map(rows.filter((r) => wanted.has(r.id)).map((r) => [r.id, r.externalId]));
}

/** سرویسی که برنامه خودش اداره‌اش می‌کند (ایمیلِ شرکتی)؟ */
export async function isManagedService(serviceId: number): Promise<boolean> {
  const [row] = await db.select({ provider: services.provider }).from(services).where(eq(services.id, serviceId));
  return row?.provider === PROVIDER;
}

/**
 * نشانی‌های دیگرِ (alias) صندوقِ خودِ کاربر — برای «دسترسی‌های من» (۲.۶۴.۰).
 *
 * ⚠️ aliasها فقط روی سرورِ ایمیل‌اند (از پنلِ Stalwart هم عوض می‌شوند)، پس هر بار
 * زنده خوانده می‌شوند. فقط روشن‌ها، با دامنهٔ هر کدام. شکستِ سرورِ ایمیل = فهرستِ
 * خالی، نه شکستنِ پروفایل. فقط صندوقِ وصل به `userId` خوانده می‌شود.
 */
export async function ownMailAliases(userId: number): Promise<string[]> {
  if (!isCorpMailConfigured()) return [];
  const [row] = await db.select({ externalId: serviceGrants.externalId })
    .from(serviceGrants)
    .innerJoin(services, eq(services.id, serviceGrants.serviceId))
    .where(and(
      eq(serviceGrants.userId, userId), isNull(serviceGrants.revokedAt),
      eq(services.provider, PROVIDER), ne(serviceGrants.externalId, ''),
    ));
  if (!row) return [];
  try {
    const adminId = await sessionAccountId();
    const responses = await jmapCall([
      ['x:Domain/get', { accountId: adminId, ids: null, properties: ['name'] }, 'd'],
      ['x:Account/get', { accountId: adminId, ids: [row.externalId], properties: ['aliases'] }, 'a'],
    ]);
    const names = new Map((result<{ list?: Array<{ id: string; name: string }> }>(responses, 'd').list ?? []).map((d) => [d.id, d.name]));
    const account = (result<{ list?: Array<{ aliases?: unknown }> }>(responses, 'a').list ?? [])[0];
    return aliasList(account?.aliases)
      .filter((a) => a.enable && names.has(a.domainId))
      .map((a) => `${a.name}@${names.get(a.domainId)}`);
  } catch {
    return [];
  }
}
