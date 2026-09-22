import { and, asc, eq, isNull, ne, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { auditLog, serviceGrants, services, userRoles, users } from '@/db/schema';
import { canManageSection, type Actor } from '@/domain/access/permissions';
import { assertCanManage, assertCanView } from '@/domain/access/guard';
import {
  assertRevocable, assertServiceName, countByService, normalizeKind, normalizeLevel,
  openRisks, planGrant, type GrantLevel, type ServiceKind,
} from '@/domain/access/service-grants';
import type { MemberState } from '@/domain/people/offboarding';

/**
 * دفترِ دسترسی‌های بیرونی.
 *
 * ⚠️ گاردها اینجا هستند، نه در صفحه (R-ARCH-01): خواندن با `members.view`
 * و نوشتن با `members.manage` — این پروندهٔ پرسنلی است، پس همان کسی که
 * اعضا را اداره می‌کند دسترسی‌هایشان را هم اداره می‌کند.
 */

async function audit(
  actor: Actor, action: string, objectType: string, objectId: number,
  before?: unknown, after?: unknown,
) {
  await db.insert(auditLog).values({
    actorType: 'user',
    actorId: actor.id,
    action,
    objectType,
    objectId,
    before: before ?? null,
    after: after ?? null,
  });
}

/* ------------------------------------------------------------------ *
 * خواندن
 * ------------------------------------------------------------------ */

export async function accessBoard(actor: Actor) {
  assertCanView(actor, 'members');

  const [serviceRows, grantRows, peopleRows] = await Promise.all([
    db.select().from(services).orderBy(asc(services.name)),

    db.select({
      id: serviceGrants.id,
      serviceId: serviceGrants.serviceId,
      userId: serviceGrants.userId,
      accountRef: serviceGrants.accountRef,
      level: serviceGrants.level,
      vaultRef: serviceGrants.vaultRef,
      note: serviceGrants.note,
      grantedAt: serviceGrants.grantedAt,
      revokedAt: serviceGrants.revokedAt,
      userName: users.name,
      memberState: users.memberState,
    })
      .from(serviceGrants)
      .innerJoin(users, eq(users.id, serviceGrants.userId))
      // بازها اول — کاری که مانده، بالای فهرست.
      .orderBy(sql`${serviceGrants.revokedAt} asc nulls first`, sql`${serviceGrants.grantedAt} desc`),

    /**
     * ⚠️ کارفرمایان عمداً بیرون‌اند: آن‌ها کاربرِ بیرونی‌اند و به سامانه‌های
     * داخلیِ شرکت دسترسی نمی‌گیرند. هر کاربرِ دیگری — عضو، همکارِ ادمین،
     * مالی و خودِ مالک — می‌تواند در این دفتر ردیف داشته باشد.
     */
    db.selectDistinct({
      id: users.id,
      name: users.name,
      memberState: users.memberState,
    })
      .from(users)
      .innerJoin(userRoles, eq(userRoles.userId, users.id))
      .where(and(isNull(users.deletedAt), ne(userRoles.role, 'client')))
      .orderBy(asc(users.name)),
  ]);

  const stateOf = new Map<number, MemberState>(
    peopleRows.map((p) => [p.id, p.memberState as MemberState]),
  );
  const counts = countByService(grantRows);

  return {
    services: serviceRows.map((s) => ({ ...s, openCount: counts.get(s.id) ?? 0 })),
    grants: grantRows,
    people: peopleRows,
    /** عضوِ سابقی که هنوز دسترسیِ باز دارد — همان کارِ نیمه‌تمام. */
    risks: openRisks(grantRows, stateOf),
    canManage: canManageSection(actor, 'members'),
  };
}

/**
 * دسترسی‌های خودِ کاربر — فقط‌خواندنی، بی‌مجوزِ خاص.
 * هرکس باید بتواند ببیند به چه چیزهایی دسترسی دارد.
 */
export async function myGrants(actor: Actor) {
  return db.select({
    id: serviceGrants.id,
    serviceName: services.name,
    kind: services.kind,
    level: serviceGrants.level,
    accountRef: serviceGrants.accountRef,
    grantedAt: serviceGrants.grantedAt,
  })
    .from(serviceGrants)
    .innerJoin(services, eq(services.id, serviceGrants.serviceId))
    .where(and(eq(serviceGrants.userId, actor.id), isNull(serviceGrants.revokedAt)))
    .orderBy(asc(services.name));
}

/* ------------------------------------------------------------------ *
 * سرویس‌ها
 * ------------------------------------------------------------------ */

export interface ServiceInput {
  id: number | null;
  name: string;
  kind: string;
  ownerUserId: number | null;
  adminUrl: string;
  note: string;
  isActive: boolean;
}

export async function saveService(actor: Actor, input: ServiceInput) {
  assertCanManage(actor, 'members');
  const name = assertServiceName(input.name);
  const values = {
    name,
    kind: normalizeKind(input.kind) as ServiceKind,
    ownerUserId: input.ownerUserId,
    adminUrl: input.adminUrl.trim(),
    note: input.note.trim(),
    isActive: input.isActive,
  };

  if (input.id) {
    await db.update(services).set({ ...values, updatedAt: new Date() })
      .where(eq(services.id, input.id));
    await audit(actor, 'service.update', 'service', input.id, null, values);
    return input.id;
  }
  const rows = await db.insert(services).values(values).returning({ id: services.id });
  await audit(actor, 'service.create', 'service', rows[0]!.id, null, values);
  return rows[0]!.id;
}

/**
 * ⚠️ سرویس حذف نمی‌شود، غیرفعال می‌شود — مثلِ دفتر.
 *
 * چرا: گرنت‌ها با `on delete cascade` به سرویس بسته‌اند، پس حذفِ یک سرویس
 * کلِ تاریخچهٔ «چه کسی به آن دسترسی داشت» را هم می‌برد — همان پرسشی که این
 * ماژول برای پاسخش ساخته شده.
 */
export async function deleteService(actor: Actor, id: number) {
  assertCanManage(actor, 'members');
  await db.update(services).set({ isActive: false, updatedAt: new Date() })
    .where(eq(services.id, id));
  await audit(actor, 'service.deactivate', 'service', id);
}

/* ------------------------------------------------------------------ *
 * اعطا و قطع
 * ------------------------------------------------------------------ */

export interface GrantInput {
  serviceId: number | null;
  userId: number | null;
  accountRef: string;
  level: string;
  vaultRef: string;
  note: string;
}

export async function grantAccess(actor: Actor, input: GrantInput) {
  assertCanManage(actor, 'members');

  const [service] = input.serviceId
    ? await db.select({ isActive: services.isActive }).from(services)
      .where(eq(services.id, input.serviceId))
    : [];
  const [person] = input.userId
    ? await db.select({ memberState: users.memberState }).from(users)
      .where(and(eq(users.id, input.userId), isNull(users.deletedAt)))
    : [];
  const [existing] = input.serviceId && input.userId
    ? await db.select({ id: serviceGrants.id }).from(serviceGrants)
      .where(and(
        eq(serviceGrants.serviceId, input.serviceId),
        eq(serviceGrants.userId, input.userId),
        isNull(serviceGrants.revokedAt),
      ))
    : [];

  const plan = planGrant({
    serviceId: input.serviceId,
    userId: input.userId,
    serviceActive: Boolean(service?.isActive),
    // کاربرِ ناموجود مثلِ عضوِ سابق رد می‌شود، نه با خطای مبهم.
    memberState: (person?.memberState ?? 'locked') as MemberState,
    openGrantId: existing?.id ?? null,
  });

  const values = {
    accountRef: input.accountRef.trim(),
    level: normalizeLevel(input.level) as GrantLevel,
    vaultRef: input.vaultRef.trim(),
    note: input.note.trim(),
  };

  if (plan.action === 'update') {
    await db.update(serviceGrants).set({ ...values, updatedAt: new Date() })
      .where(eq(serviceGrants.id, plan.grantId!));
    await audit(actor, 'service_grant.update', 'service_grant', plan.grantId!, null, values);
    return plan.grantId!;
  }

  const rows = await db.insert(serviceGrants).values({
    serviceId: input.serviceId!,
    userId: input.userId!,
    grantedBy: actor.id,
    ...values,
  }).returning({ id: serviceGrants.id });
  await audit(actor, 'service_grant.create', 'service_grant', rows[0]!.id, null, {
    ...values, serviceId: input.serviceId, userId: input.userId,
  });
  return rows[0]!.id;
}

/** ⚠️ قطع یعنی مهرِ زمان، نه حذفِ ردیف (R-ACCESS-01) — تاریخچه باید بماند. */
export async function revokeAccess(actor: Actor, grantId: number) {
  assertCanManage(actor, 'members');

  const [grant] = await db.select({
    id: serviceGrants.id,
    revokedAt: serviceGrants.revokedAt,
    serviceId: serviceGrants.serviceId,
    userId: serviceGrants.userId,
  }).from(serviceGrants).where(eq(serviceGrants.id, grantId));

  assertRevocable(grant);

  await db.update(serviceGrants)
    .set({ revokedAt: new Date(), revokedBy: actor.id, updatedAt: new Date() })
    .where(eq(serviceGrants.id, grantId));
  await audit(actor, 'service_grant.revoke', 'service_grant', grantId, grant, null);
}
