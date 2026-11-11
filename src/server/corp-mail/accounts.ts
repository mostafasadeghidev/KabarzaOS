import 'server-only';
import { and, asc, eq, isNull, ne } from 'drizzle-orm';
import { db } from '@/db/client';
import { auditLog, serviceGrants, services, userRoles, users } from '@/db/schema';
import type { Actor } from '@/domain/access/permissions';
import { assertCanManage } from '@/domain/access/guard';
import { localPartProblem, normalizeLocalPart, type CorpMailConfig } from '@/domain/corp-mail/config';
import {
  aliasList, buildAliasMap, suggestMember, takenNames, toMailAccount, type MailAccount,
} from '@/domain/corp-mail/accounts';
import { isCorpMailConfigured, JmapError, jmapCall, result, sessionAccountId } from './jmap';
import { corpMailConfig } from './settings';

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
  | 'invalid_name' | 'reserved_name' | 'name_taken' | 'protected' | 'stalwart';

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
    throw new CorpMailError(error.code === 'not_configured' ? 'not_configured' : 'stalwart', error.code);
  }
  throw error;
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
  const empty = { domain: config.domain, accounts: [], people: people.map(({ id, name }) => ({ id, name })) };
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
      await tx.update(serviceGrants)
        .set({ revokedAt: now, revokedBy: actor.id, updatedAt: now, secretEnc: '' })
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

    let grantId: number;
    if (mine) {
      await tx.update(serviceGrants)
        .set({ externalId: account.id, accountRef: account.emailAddress, updatedAt: now })
        .where(eq(serviceGrants.id, mine.id));
      grantId = mine.id;
    } else {
      const [row] = await tx.insert(serviceGrants).values({
        serviceId, userId, grantedBy: actor.id, accountRef: account.emailAddress, externalId: account.id, level: 'member',
      }).returning({ id: serviceGrants.id });
      grantId = row!.id;
    }
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
    const set = result<{ notUpdated?: Record<string, { type?: string }> }>(responses, 's');
    if (set.notUpdated?.[account.id]) throw new CorpMailError('stalwart', set.notUpdated[account.id]!.type ?? 'notUpdated');

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
    case 'member_inactive': return 'فقط به عضوِ فعال می‌شود صندوقِ ایمیل داد.';
    case 'member_has_mail': return 'این عضو از پیش صندوقِ ایمیلِ دیگری دارد؛ اول آن را جدا کنید.';
    // ⚠️ نامِ مشکل‌دار جای‌نگهدارِ {name} است، نه چسبیده به متن — تا ترجمه بشکند نه.
    case 'invalid_name': return 'نامِ «{name}» معتبر نیست: فقط حروفِ کوچکِ لاتین، رقم، نقطه، خط تیره و زیرخط.';
    case 'reserved_name': return 'نامِ «{name}» رزرو است و ساخته نمی‌شود.';
    case 'name_taken': return 'نشانیِ «{name}» از پیش مالِ حسابِ دیگری است.';
    case 'stalwart': return detail === 'unauthorized' || detail === 'forbidden'
      ? 'سرورِ ایمیل کلید را نپذیرفت؛ کلید و مجوزهایش را بررسی کنید.'
      : 'سرورِ ایمیل درخواست را انجام نداد؛ کمی بعد دوباره امتحان کنید.';
  }
}
