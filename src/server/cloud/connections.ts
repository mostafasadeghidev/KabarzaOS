import 'server-only';
import { asc, eq, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { auditLog, cloudConnections, serviceGrants, services } from '@/db/schema';
import type { Actor } from '@/domain/access/permissions';
import { ForbiddenError } from '@/domain/access/guard';
import { normalizeConnectionInput, parseCloudUsers } from '@/domain/cloud/nextcloud';
import { CloudError } from '@/domain/cloud/errors';
import { open as openSecret, seal } from '@/server/ai/secret-box';
import { CloudApiError, ocs, seg, type CloudTarget } from './client';

/**
 * اتصال‌های فضای ابری (۳.۴.۰) — فقط مالک. هر اتصال = یک سرورِ Nextcloud + یک سرویس در دفتر.
 *
 * ⚠️ رمزِ برنامه هرگز به مرورگر برنمی‌گردد؛ فرمِ ویرایش با رمزِ خالی یعنی «همان قبلی».
 */

export const CLOUD_PROVIDER_PREFIX = 'nextcloud:';
export const isCloudProvider = (provider: string | null | undefined) => Boolean(provider?.startsWith(CLOUD_PROVIDER_PREFIX));

/** http ِ localhost فقط بیرون از production (سرورِ ساختگیِ آزمون). */
const allowLocalHttp = () => process.env.NODE_ENV !== 'production';

function assertOwner(actor: Actor) {
  if (!actor.roles.includes('owner')) throw new ForbiddenError('owner');
}

export interface CloudStatus {
  ok: boolean;
  at: string;
  /** شمارِ حساب‌های گروه، در آزمونِ موفق. */
  users?: number;
  /** حسابِ اتصال ادمینِ کلِ Nextcloud است — کار می‌کند ولی بیش از لازم اختیار دارد. */
  isAdmin?: boolean;
  error?: string;
  detail?: string;
}

export interface CloudConnectionView {
  id: number;
  name: string;
  baseUrl: string;
  username: string;
  groupId: string;
  defaultQuotaGb: number;
  isActive: boolean;
  serviceId: number;
  hasSecret: boolean;
  status: CloudStatus | null;
  /** ردیف‌های دفتر (باز و بسته) روی این اتصال — بیش از صفر یعنی حذف نمی‌شود. */
  grants: number;
}

export async function listCloudConnections(actor: Actor): Promise<CloudConnectionView[]> {
  assertOwner(actor);
  const rows = await db.select({
    id: cloudConnections.id, name: cloudConnections.name, baseUrl: cloudConnections.baseUrl,
    username: cloudConnections.username, groupId: cloudConnections.groupId,
    defaultQuotaGb: cloudConnections.defaultQuotaGb, isActive: cloudConnections.isActive,
    serviceId: cloudConnections.serviceId, status: cloudConnections.status,
    hasSecret: sql<boolean>`${cloudConnections.secretEnc} <> ''`,
    grants: sql<number>`(select count(*)::int from ${serviceGrants} where ${serviceGrants.serviceId} = ${cloudConnections.serviceId})`,
  }).from(cloudConnections).orderBy(asc(cloudConnections.id));
  return rows.map((r) => ({ ...r, status: (r.status as CloudStatus | null) ?? null }));
}

/** اتصال‌های روشن — برای تب‌های صفحهٔ «فضای ابری»؛ بی گارد، بی راز. */
export async function activeCloudConnections() {
  return db.select({
    id: cloudConnections.id, name: cloudConnections.name, baseUrl: cloudConnections.baseUrl,
    username: cloudConnections.username, groupId: cloudConnections.groupId,
    defaultQuotaGb: cloudConnections.defaultQuotaGb, serviceId: cloudConnections.serviceId,
  }).from(cloudConnections).where(eq(cloudConnections.isActive, true)).orderBy(asc(cloudConnections.id));
}

export type CloudConnection = Awaited<ReturnType<typeof activeCloudConnections>>[number];

/**
 * اتصال + نشانی و رمزِ بازشده — فقط برای همین ماژول. خاموش یا بی‌رمز ← خطا.
 * `includeInactive` برای قطعِ دسترسی از دفتر: اتصالِ خاموش هم باید بتواند حساب را ببندد.
 */
export async function connectionTarget(id: number, includeInactive = false): Promise<{ conn: CloudConnection; target: CloudTarget }> {
  const [row] = await db.select().from(cloudConnections).where(eq(cloudConnections.id, id));
  if (!row || (!row.isActive && !includeInactive)) throw new CloudError('no_connection');
  const secret = row.secretEnc ? openSecret(row.secretEnc) : null;
  if (!secret) throw new CloudError('not_configured');
  return {
    conn: {
      id: row.id, name: row.name, baseUrl: row.baseUrl, username: row.username, groupId: row.groupId,
      defaultQuotaGb: row.defaultQuotaGb, serviceId: row.serviceId,
    },
    target: { baseUrl: row.baseUrl, username: row.username, secret },
  };
}

function serviceFields(name: string, baseUrl: string) {
  return { name, downloadUrl: baseUrl, adminUrl: `${baseUrl}/index.php/settings/users` };
}

/** بی‌راز — برای ثبتِ رویداد. */
const auditView = (v: { name: string; baseUrl: string; username: string; groupId: string; defaultQuotaGb: number; isActive: boolean }) => ({
  name: v.name, baseUrl: v.baseUrl, username: v.username, groupId: v.groupId, defaultQuotaGb: v.defaultQuotaGb, isActive: v.isActive,
});

/**
 * ساختن یا ویرایشِ اتصال. `secret` خالی = رمزِ قبلی بماند (برای اتصالِ تازه لازم است).
 * نام و نشانیِ سرویسِ دفتر همراهِ اتصال عوض می‌شود تا کارمند لینکِ درست را در «دسترسی‌های من» ببیند.
 */
export async function saveCloudConnection(
  actor: Actor, id: number | null, input: Record<string, unknown>, secret: string,
): Promise<number> {
  assertOwner(actor);
  const { value, problems } = normalizeConnectionInput(input, allowLocalHttp());
  if (problems.length) throw new CloudError('invalid', problems.join(', '));
  const cleanSecret = secret.trim();
  if (cleanSecret.length > 512 || /\s/.test(cleanSecret)) throw new CloudError('invalid', 'secret');

  if (id === null) {
    if (!cleanSecret) throw new CloudError('no_secret');
    return db.transaction(async (tx) => {
      // provider یکتاست؛ اول با نشانِ موقت، بعد با شناسهٔ اتصال.
      const [svc] = await tx.insert(services).values({
        ...serviceFields(value.name, value.baseUrl), provider: `${CLOUD_PROVIDER_PREFIX}new-${actor.id}-${Date.now()}`, isActive: value.isActive,
      }).returning({ id: services.id });
      const [row] = await tx.insert(cloudConnections).values({
        name: value.name, baseUrl: value.baseUrl, username: value.username, groupId: value.groupId,
        defaultQuotaGb: value.defaultQuotaGb, isActive: value.isActive, secretEnc: seal(cleanSecret), serviceId: svc!.id,
      }).returning({ id: cloudConnections.id });
      await tx.update(services).set({ provider: `${CLOUD_PROVIDER_PREFIX}${row!.id}` }).where(eq(services.id, svc!.id));
      await tx.insert(auditLog).values({
        actorType: 'user', actorId: actor.id, action: 'cloud.settings', objectType: 'cloud_connection', objectId: row!.id,
        before: null, after: auditView(value),
      });
      return row!.id;
    });
  }

  const [before] = await db.select().from(cloudConnections).where(eq(cloudConnections.id, id));
  if (!before) throw new CloudError('no_connection');
  // نشانی، کاربر یا گروهِ تازه یعنی آزمونِ قبلی دیگر معتبر نیست.
  const moved = before.baseUrl !== value.baseUrl || before.username !== value.username || before.groupId !== value.groupId;
  await db.transaction(async (tx) => {
    await tx.update(cloudConnections).set({
      name: value.name, baseUrl: value.baseUrl, username: value.username, groupId: value.groupId,
      defaultQuotaGb: value.defaultQuotaGb, isActive: value.isActive, updatedAt: new Date(),
      ...(cleanSecret ? { secretEnc: seal(cleanSecret) } : {}),
      ...(moved || cleanSecret ? { status: null } : {}),
    }).where(eq(cloudConnections.id, id));
    await tx.update(services).set({ ...serviceFields(value.name, value.baseUrl), isActive: value.isActive, updatedAt: new Date() })
      .where(eq(services.id, before.serviceId));
    await tx.insert(auditLog).values({
      actorType: 'user', actorId: actor.id, action: 'cloud.settings', objectType: 'cloud_connection', objectId: id,
      before: auditView(before), after: { ...auditView(value), secretChanged: Boolean(cleanSecret) },
    });
  });
  return id;
}

/**
 * حذفِ اتصال — فقط وقتی هیچ ردیفی (باز یا بسته) در دفتر به آن نخورده؛ وگرنه تاریخچهٔ
 * «چه کسی کجا حساب داشت» می‌شکست. برای کنار گذاشتن، خاموشش کنید.
 */
export async function deleteCloudConnection(actor: Actor, id: number): Promise<void> {
  assertOwner(actor);
  await db.transaction(async (tx) => {
    const [row] = await tx.select({ serviceId: cloudConnections.serviceId, name: cloudConnections.name })
      .from(cloudConnections).where(eq(cloudConnections.id, id)).for('update');
    if (!row) throw new CloudError('no_connection');
    const [{ n } = { n: 0 }] = await tx.select({ n: sql<number>`count(*)::int` }).from(serviceGrants)
      .where(eq(serviceGrants.serviceId, row.serviceId));
    if (n > 0) throw new CloudError('in_use');
    await tx.delete(cloudConnections).where(eq(cloudConnections.id, id));
    await tx.delete(services).where(eq(services.id, row.serviceId));
    await tx.insert(auditLog).values({
      actorType: 'user', actorId: actor.id, action: 'cloud.delete', objectType: 'cloud_connection', objectId: id,
      before: { name: row.name }, after: null,
    });
  });
}

/**
 * آزمونِ اتصال: کاربرِ اتصال کیست (و آیا ادمینِ کل است) و آیا حساب‌های گروه را می‌بیند.
 * نتیجه بی راز در خودِ ردیف می‌ماند.
 */
export async function testCloudConnection(actor: Actor, id: number): Promise<CloudStatus> {
  assertOwner(actor);
  let status: CloudStatus;
  try {
    const { conn, target } = await connectionTarget(id, true);
    const me = await ocs(target, 'GET', 'cloud/user') as { id?: string; groups?: unknown };
    const groups = Array.isArray(me?.groups) ? me.groups : [];
    const members = await ocs(target, 'GET', `cloud/groups/${seg(conn.groupId)}/users/details`, { limit: '500' });
    // حسابِ خودِ اتصال شمرده نمی‌شود — همان عددی که صفحهٔ «فضای ابری» نشان می‌دهد.
    const users = parseCloudUsers(members).filter((u) => u.id.toLowerCase() !== conn.username.toLowerCase()).length;
    status = { ok: true, at: new Date().toISOString(), users, isAdmin: groups.includes('admin') };
  } catch (error) {
    if (error instanceof CloudError) status = { ok: false, at: new Date().toISOString(), error: error.code };
    else if (error instanceof CloudApiError) {
      status = { ok: false, at: new Date().toISOString(), error: error.code, detail: error.detail || String(error.statuscode || '') };
    } else throw error;
  }
  await db.update(cloudConnections).set({ status: status as unknown as Record<string, unknown> }).where(eq(cloudConnections.id, id));
  return status;
}
