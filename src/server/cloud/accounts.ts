import 'server-only';
import { and, asc, eq, inArray, isNull, ne } from 'drizzle-orm';
import { db } from '@/db/client';
import { auditLog, cloudConnections, serviceGrants, services, userRoles, users } from '@/db/schema';
import type { Actor } from '@/domain/access/permissions';
import { assertCanManage } from '@/domain/access/guard';
import {
  MAX_QUOTA_GB, cloudUserIdProblem, parseCloudUser, parseCloudUsers, suggestCloudMember, type CloudAccount,
} from '@/domain/cloud/nextcloud';
import { CloudError } from '@/domain/cloud/errors';
import { seal } from '@/server/ai/secret-box';
import { generateMailPassword, mailPasswordProblem } from '@/server/corp-mail/accounts';
import { CloudApiError, ocs, seg, type CloudTarget } from './client';
import { activeCloudConnections, connectionTarget, isCloudProvider, type CloudConnection } from './connections';

/**
 * حساب‌های فضای ابری (۳.۴.۰): فهرستِ گروهِ اتصال از Nextcloud، جفت با اعضا، ساختن،
 * حجم، رمزِ تازه، قطع و وصل.
 *
 * ⚠️ «جفت» یعنی یک ردیفِ دفتر روی سرویسِ همان اتصال (`external_id` = شناسهٔ کاربر)؛ پس
 * پروفایل، خروجی و چک‌لیستِ خروجِ عضو این حساب را بی کدِ تازه می‌بینند.
 * ⚠️ هیچ حسابی پاک نمی‌شود. «قطع» = غیرفعال روی Nextcloud (فایل‌ها می‌مانند) + قطعِ ردیف.
 * حسابِ خودِ اتصال و هر کسی که در گروهِ اتصال نیست دست نمی‌خورد.
 */

async function audit(actor: Actor, action: string, objectId: number, before: unknown, after: unknown) {
  await db.insert(auditLog).values({
    actorType: 'user', actorId: actor.id, action, objectType: 'service_grant', objectId,
    before: before ?? null, after: after ?? null,
  });
}

/** خطای API ← خطای فضای ابری با پیامِ قابلِ نمایش. */
function wrap(error: unknown): never {
  if (error instanceof CloudApiError) {
    console.warn('[cloud] nextcloud error', error.code, error.statuscode, error.detail);
    if (error.code === 'unauthorized') throw new CloudError('unauthorized');
    if (error.code === 'forbidden') throw new CloudError('forbidden');
    if (error.code === 'not_found') throw new CloudError('not_found');
    throw new CloudError('server', error.detail || error.code);
  }
  throw error;
}

async function activeMembers() {
  return db.selectDistinct({ id: users.id, name: users.name, email: users.email, username: users.username })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .where(and(isNull(users.deletedAt), eq(users.memberState, 'active'), ne(userRoles.role, 'client')))
    .orderBy(asc(users.name));
}

/** همهٔ حساب‌های گروهِ اتصال، صفحه به صفحه (۵۰۰تایی). */
async function groupAccounts(conn: CloudConnection, target: CloudTarget): Promise<CloudAccount[]> {
  const all: CloudAccount[] = [];
  for (let offset = 0; offset < 10_000; offset += 500) {
    const data = await ocs(target, 'GET', `cloud/groups/${seg(conn.groupId)}/users/details`, { limit: '500', offset: String(offset) });
    const page = parseCloudUsers(data);
    all.push(...page);
    if (page.length < 500) break;
  }
  return all.filter((a) => a.id.toLowerCase() !== conn.username.toLowerCase());
}

/** یک حساب — فقط اگر در گروهِ اتصال باشد و خودِ حسابِ اتصال نباشد. */
async function oneAccount(conn: CloudConnection, target: CloudTarget, userId: string): Promise<CloudAccount> {
  if (!userId || userId.length > 64) throw new CloudError('not_found');
  if (userId.toLowerCase() === conn.username.toLowerCase()) throw new CloudError('protected');
  let account: CloudAccount | null;
  try {
    account = parseCloudUser(await ocs(target, 'GET', `cloud/users/${seg(userId)}`));
  } catch (error) { wrap(error); }
  if (!account) throw new CloudError('not_found');
  if (!account.groups.includes(conn.groupId)) throw new CloudError('protected');
  return account;
}

async function openGrantOf(serviceId: number, externalId: string) {
  const [row] = await db.select({ id: serviceGrants.id, userId: serviceGrants.userId }).from(serviceGrants)
    .where(and(eq(serviceGrants.serviceId, serviceId), eq(serviceGrants.externalId, externalId), isNull(serviceGrants.revokedAt)));
  return row ?? null;
}

export interface CloudAccountRow extends CloudAccount {
  link: { grantId: number; userId: number; userName: string } | null;
  suggestedUserId: number | null;
}

export interface CloudAccountsView {
  connections: Array<{ id: number; name: string }>;
  current: { id: number; name: string; baseUrl: string; groupId: string; defaultQuotaGb: number } | null;
  error: string | null;
  errorDetail: string;
  accounts: CloudAccountRow[];
  people: Array<{ id: number; name: string; email: string; username: string | null }>;
}

export async function listCloudAccounts(actor: Actor, connectionId: number | null): Promise<CloudAccountsView> {
  assertCanManage(actor, 'members');
  const connections = await activeCloudConnections();
  const people = await activeMembers();
  const conn = connections.find((c) => c.id === connectionId) ?? connections[0] ?? null;
  const base: CloudAccountsView = {
    connections: connections.map(({ id, name }) => ({ id, name })),
    current: conn ? { id: conn.id, name: conn.name, baseUrl: conn.baseUrl, groupId: conn.groupId, defaultQuotaGb: conn.defaultQuotaGb } : null,
    error: null, errorDetail: '', accounts: [], people,
  };
  if (!conn) return base;

  try {
    const { target } = await connectionTarget(conn.id);
    const accounts = await groupAccounts(conn, target);
    const links = await db.select({
      grantId: serviceGrants.id, userId: serviceGrants.userId, externalId: serviceGrants.externalId, userName: users.name,
    }).from(serviceGrants)
      .innerJoin(users, eq(users.id, serviceGrants.userId))
      .where(and(eq(serviceGrants.serviceId, conn.serviceId), isNull(serviceGrants.revokedAt), ne(serviceGrants.externalId, '')));
    const byAccount = new Map(links.map((l) => [l.externalId, l]));
    const linkedUsers = new Set(links.map((l) => l.userId));
    const free = people.filter((p) => !linkedUsers.has(p.id));
    return {
      ...base,
      accounts: accounts
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((a) => {
          const link = byAccount.get(a.id);
          return {
            ...a,
            link: link ? { grantId: link.grantId, userId: link.userId, userName: link.userName } : null,
            suggestedUserId: link || !a.enabled ? null : suggestCloudMember(a, free),
          };
        }),
    };
  } catch (error) {
    if (error instanceof CloudError) return { ...base, error: error.code, errorDetail: error.detail };
    if (error instanceof CloudApiError) {
      console.warn('[cloud] list failed', error.code, error.statuscode);
      return { ...base, error: error.code === 'unauthorized' || error.code === 'forbidden' ? error.code : 'server', errorDetail: error.detail || error.code };
    }
    throw error;
  }
}

async function assertActiveMember(userId: number) {
  const [member] = await db.select({ state: users.memberState }).from(users)
    .where(and(eq(users.id, userId), isNull(users.deletedAt)));
  if (!member || member.state !== 'active') throw new CloudError('member_inactive');
}

/**
 * جفت‌کردنِ حساب با عضو (یا جداکردن با `memberId = null`).
 * ⚠️ جداکردن ردیف را **قطع** می‌کند، پاک نمی‌کند؛ خودِ حساب روی Nextcloud دست نمی‌خورد.
 */
export async function linkCloudAccount(actor: Actor, connectionId: number, userId: string, memberId: number | null): Promise<void> {
  assertCanManage(actor, 'members');
  const { conn, target } = await connectionTarget(connectionId);
  const account = await oneAccount(conn, target, userId);
  if (memberId !== null) await assertActiveMember(memberId);

  await db.transaction(async (tx) => {
    const [current] = await tx.select({ id: serviceGrants.id, userId: serviceGrants.userId }).from(serviceGrants)
      .where(and(eq(serviceGrants.serviceId, conn.serviceId), eq(serviceGrants.externalId, account.id), isNull(serviceGrants.revokedAt)))
      .for('update');
    if (current && current.userId === memberId) return;
    const now = new Date();
    if (current) {
      await tx.update(serviceGrants).set({ revokedAt: now, revokedBy: actor.id, updatedAt: now, secretEnc: '' })
        .where(eq(serviceGrants.id, current.id));
      await tx.insert(auditLog).values({
        actorType: 'user', actorId: actor.id, action: 'cloud.unlink', objectType: 'service_grant', objectId: current.id,
        before: { connection: conn.name, account: account.id, userId: current.userId }, after: null,
      });
    }
    if (memberId === null) return;

    // ردیفِ بازِ قبلیِ همین عضو روی این سرویس (مثلاً دستی، بی شناسهٔ حساب).
    const [mine] = await tx.select({ id: serviceGrants.id, externalId: serviceGrants.externalId }).from(serviceGrants)
      .where(and(eq(serviceGrants.serviceId, conn.serviceId), eq(serviceGrants.userId, memberId), isNull(serviceGrants.revokedAt)))
      .for('update');
    if (mine && mine.externalId && mine.externalId !== account.id) throw new CloudError('member_has_account');
    let grantId: number;
    if (mine) {
      await tx.update(serviceGrants).set({ externalId: account.id, accountRef: account.id, updatedAt: now }).where(eq(serviceGrants.id, mine.id));
      grantId = mine.id;
    } else {
      const [row] = await tx.insert(serviceGrants).values({
        serviceId: conn.serviceId, userId: memberId, grantedBy: actor.id, accountRef: account.id, externalId: account.id, level: 'member',
      }).returning({ id: serviceGrants.id });
      grantId = row!.id;
    }
    await tx.insert(auditLog).values({
      actorType: 'user', actorId: actor.id, action: 'cloud.link', objectType: 'service_grant', objectId: grantId,
      before: null, after: { connection: conn.name, account: account.id, userId: memberId },
    });
  });
}

function quotaValue(gb: number): string {
  if (!Number.isFinite(gb) || gb < 0.1 || gb > MAX_QUOTA_GB) throw new CloudError('invalid_quota');
  return `${Math.round(gb * 10) / 10} GB`;
}

/** رمزِ ردشده به‌خاطرِ سیاستِ رمزِ Nextcloud (۱۰۷) ← پیامِ خودِ سرور. */
function passwordRefused(error: unknown): never {
  if (error instanceof CloudApiError && error.code === 'refused' && error.statuscode === 107) {
    throw new CloudError('weak_password', error.detail || 'password policy');
  }
  wrap(error);
}

export interface CreateCloudInput {
  memberId: number;
  userId: string;
  quotaGb: number;
}

/**
 * حسابِ تازه برای یک عضو، در گروهِ اتصال، با رمزِ تصادفی. رمز در «دسترسی‌های من» ِ
 * کارمند (ردیفِ دفتر) می‌ماند.
 */
export async function createCloudAccount(actor: Actor, connectionId: number, input: CreateCloudInput): Promise<{ grantId: number; userId: string }> {
  assertCanManage(actor, 'members');
  const userId = input.userId.trim().toLowerCase();
  if (cloudUserIdProblem(userId)) throw new CloudError('invalid_name', userId);
  const quota = quotaValue(input.quotaGb);
  const { conn, target } = await connectionTarget(connectionId);
  await assertActiveMember(input.memberId);
  const [already] = await db.select({ id: serviceGrants.id }).from(serviceGrants)
    .where(and(eq(serviceGrants.serviceId, conn.serviceId), eq(serviceGrants.userId, input.memberId), isNull(serviceGrants.revokedAt)));
  if (already) throw new CloudError('member_has_account');
  const [member] = await db.select({ name: users.name }).from(users).where(eq(users.id, input.memberId));

  const password = generateMailPassword(20);
  try {
    await ocs(target, 'POST', 'cloud/users', {
      userid: userId, password, displayName: member?.name ?? userId, groups: [conn.groupId], quota,
    });
  } catch (error) {
    if (error instanceof CloudApiError && error.code === 'refused' && error.statuscode === 102) throw new CloudError('name_taken', userId);
    passwordRefused(error);
  }

  const [row] = await db.insert(serviceGrants).values({
    serviceId: conn.serviceId, userId: input.memberId, grantedBy: actor.id, accountRef: userId, externalId: userId,
    level: 'member', secretEnc: seal(password),
  }).returning({ id: serviceGrants.id });
  await audit(actor, 'cloud.create', row!.id, null, { connection: conn.name, account: userId, userId: input.memberId, quota });
  return { grantId: row!.id, userId };
}

export async function setCloudQuota(actor: Actor, connectionId: number, userId: string, gb: number): Promise<void> {
  assertCanManage(actor, 'members');
  const quota = quotaValue(gb);
  const { conn, target } = await connectionTarget(connectionId);
  const account = await oneAccount(conn, target, userId);
  try {
    await ocs(target, 'PUT', `cloud/users/${seg(account.id)}`, { key: 'quota', value: quota });
  } catch (error) { wrap(error); }
  const link = await openGrantOf(conn.serviceId, account.id);
  await audit(actor, 'cloud.quota', link?.id ?? 0, { connection: conn.name, account: account.id, quotaBytes: account.quotaBytes }, { quota });
}

/**
 * رمزِ تازه — خودکار یا دستی. حسابِ وصل ← رمز در ردیفِ دفترِ عضو؛ حسابِ بی‌صاحب ←
 * همین یک بار برگردانده می‌شود و هیچ‌جا نمی‌ماند.
 */
export async function resetCloudPassword(
  actor: Actor, connectionId: number, userId: string, custom: string | null = null,
): Promise<{ grantId: number | null; password?: string }> {
  assertCanManage(actor, 'members');
  if (custom !== null && mailPasswordProblem(custom)) throw new CloudError('weak_password', mailPasswordProblem(custom)!);
  const { conn, target } = await connectionTarget(connectionId);
  const account = await oneAccount(conn, target, userId);
  const password = custom ?? generateMailPassword(20);
  try {
    await ocs(target, 'PUT', `cloud/users/${seg(account.id)}`, { key: 'password', value: password });
  } catch (error) { passwordRefused(error); }
  const link = await openGrantOf(conn.serviceId, account.id);
  if (link) {
    await db.update(serviceGrants).set({ secretEnc: seal(password), updatedAt: new Date() }).where(eq(serviceGrants.id, link.id));
  }
  await audit(actor, 'cloud.password', link?.id ?? 0, null, { connection: conn.name, account: account.id, mode: custom === null ? 'auto' : 'custom' });
  return link ? { grantId: link.id } : { grantId: null, password };
}

/**
 * قطع یا وصلِ حساب روی Nextcloud. قطع = غیرفعال (ورود و همگام‌سازی بسته، فایل‌ها می‌مانند)
 * و ردیفِ دفتر هم قطع می‌شود. وصلِ دوباره فقط حساب را روشن می‌کند؛ صاحب را دوباره انتخاب کنید.
 *
 * ⚠️ اگر Nextcloud پاسخ ندهد، ردیف هم باز می‌ماند — دفتر نباید بگوید «قطع شد» وقتی حساب باز است.
 */
export async function setCloudEnabled(
  actor: Actor, connectionId: number, userId: string, enabled: boolean, includeInactive = false,
): Promise<void> {
  assertCanManage(actor, 'members');
  const { conn, target } = await connectionTarget(connectionId, includeInactive);
  const account = await oneAccount(conn, target, userId);
  try {
    await ocs(target, 'PUT', `cloud/users/${seg(account.id)}/${enabled ? 'enable' : 'disable'}`);
  } catch (error) { wrap(error); }
  const link = await openGrantOf(conn.serviceId, account.id);
  if (!enabled && link) {
    const now = new Date();
    await db.update(serviceGrants).set({ revokedAt: now, revokedBy: actor.id, updatedAt: now, secretEnc: '' })
      .where(and(eq(serviceGrants.id, link.id), isNull(serviceGrants.revokedAt)));
  }
  await audit(actor, enabled ? 'cloud.enable' : 'cloud.disable', link?.id ?? 0,
    { connection: conn.name, account: account.id, userId: link?.userId ?? null }, null);
}

/* ------------------------------------------------------------------ *
 * قلاب‌های دفترِ دسترسی‌ها
 * ------------------------------------------------------------------ */

/** ردیف‌های بازِ این شناسه‌ها که حسابِ فضای ابری‌اند ← اتصال و شناسهٔ کاربر. */
export async function managedCloudAccounts(grantIds: number[]): Promise<Map<number, { connectionId: number; userId: string }>> {
  if (grantIds.length === 0) return new Map();
  const rows = await db.select({ id: serviceGrants.id, externalId: serviceGrants.externalId, connectionId: cloudConnections.id })
    .from(serviceGrants)
    .innerJoin(cloudConnections, eq(cloudConnections.serviceId, serviceGrants.serviceId))
    .where(and(inArray(serviceGrants.id, grantIds), ne(serviceGrants.externalId, ''), isNull(serviceGrants.revokedAt)));
  return new Map(rows.map((r) => [r.id, { connectionId: r.connectionId, userId: r.externalId }]));
}

/** قطع از دفتر = غیرفعال روی Nextcloud — حتی اگر اتصال خاموش شده باشد. */
export async function disableCloudForGrant(actor: Actor, target: { connectionId: number; userId: string }): Promise<void> {
  await setCloudEnabled(actor, target.connectionId, target.userId, false, true);
}

/** سرویسی که مالِ یک اتصالِ فضای ابری است؟ */
export async function isCloudService(serviceId: number): Promise<boolean> {
  const [row] = await db.select({ provider: services.provider }).from(services).where(eq(services.id, serviceId));
  return isCloudProvider(row?.provider);
}
