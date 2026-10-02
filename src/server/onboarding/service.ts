import { and, asc, desc, eq, inArray, isNull, lt, ne, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db } from '@/db/client';
import {
  auditLog, onboardingItems, onboardingTasks, serviceGrants, services, tagRelations, tags,
  userOffices, userRoles, users,
} from '@/db/schema';
import { tagName } from '@/db/tag-name';
import { currentLocale } from '@/i18n/server';
import { canManageSection, type Actor } from '@/domain/access/permissions';
import { ForbiddenError, assertCan, assertCanManage, assertCanView } from '@/domain/access/guard';
import { localParts } from '@/domain/scheduler/tick';
import {
  canTick, dueDateFor, isAssigneeRule, isKind, itemsToAdd, MAX_DUE_DAY, progress, resolveAssignee,
  taskState, type AssigneeRule, type LibraryItem, type OnboardingKind, type TaskState,
} from '@/domain/onboarding/plan';
import { getSystemConfig } from '@/server/settings/system-service';
import { notify } from '@/server/notifications/service';
import { findOrCreateService } from '@/server/access/service';

/**
 * آنبوردینگِ نقش‌محور.
 *
 * ⚠️ گاردها اینجا هستند (R-ARCH-01): کتابخانه با `settings.manage` (مثلِ
 * کتابخانهٔ QA)، چک‌لیستِ اعضا با `members.view` / `members.manage` (پروندهٔ
 * پرسنلی، مثلِ سیاههٔ دسترسی). تیک‌زدن قاعدهٔ خودش را دارد (`canTick`).
 * ⚠️ خاموش‌بودنِ آنبوردینگ (تنظیماتِ سامانه) نوشتن را می‌بندد و داده را نگه می‌دارد.
 */

export class OnboardingError extends Error {
  constructor(readonly code: 'disabled' | 'not_member' | 'title_required' | 'service_required' | 'not_found' | 'bad_role') {
    super(`onboarding: ${code}`);
    this.name = 'OnboardingError';
  }
}

/** پیامِ هر خطا — متنِ مبدأ؛ UI با `t()` ترجمه می‌کند. */
export const ONBOARDING_MESSAGES: Record<OnboardingError['code'], string> = {
  disabled: 'آنبوردینگ خاموش است؛ از «تنظیمات ← سامانه» روشنش کنید.',
  not_member: 'آنبوردینگ فقط برای عضوِ فعالِ تیم است.',
  title_required: 'عنوان لازم است.',
  service_required: 'برای آیتمِ «دسترسی» یا «مسئولِ سرویس» یک سرویس انتخاب کنید.',
  not_found: 'پیدا نشد.',
  bad_role: 'نقشِ انتخاب‌شده معتبر نیست.',
};

export async function onboardingEnabled(): Promise<boolean> {
  return (await getSystemConfig()).onboardingEnabled;
}

async function assertEnabled(): Promise<void> {
  if (!(await onboardingEnabled())) throw new OnboardingError('disabled');
}

/** «امروز» به منطقهٔ زمانیِ سامانه — موعدها تاریخ‌اند، نه لحظه. */
async function today(now = new Date()): Promise<string> {
  return localParts(now, (await getSystemConfig()).timezone || 'UTC').date;
}

async function audit(actor: Actor, action: string, objectType: string, objectId: number, before?: unknown, after?: unknown) {
  await db.insert(auditLog).values({
    actorType: 'user', actorId: actor.id, action, objectType, objectId,
    before: before ?? null, after: after ?? null,
  });
}

/** مالکانِ فعال — صاحبِ کارهای بی‌صاحب (دفترِ بی‌مدیر، سرویسِ بی‌مسئول). */
async function ownerIds(): Promise<number[]> {
  const rows = await db.selectDistinct({ id: users.id }).from(userRoles)
    .innerJoin(users, eq(users.id, userRoles.userId))
    .where(and(eq(userRoles.role, 'owner'), isNull(users.deletedAt), eq(users.memberState, 'active')));
  return rows.map((r) => r.id);
}

/* ------------------------------------------------------------------ *
 * کتابخانه (تنظیمات)
 * ------------------------------------------------------------------ */

export async function listLibrary(actor: Actor): Promise<LibraryItem[]> {
  assertCan(actor, 'settings.manage');
  const rows = await db.select({
    id: onboardingItems.id,
    roleTagId: onboardingItems.roleTagId,
    title: onboardingItems.title,
    description: onboardingItems.description,
    kind: onboardingItems.kind,
    assignee: onboardingItems.assignee,
    assigneeUserId: onboardingItems.assigneeUserId,
    serviceId: onboardingItems.serviceId,
    link: onboardingItems.link,
    dueDay: onboardingItems.dueDay,
    sortOrder: onboardingItems.sortOrder,
  }).from(onboardingItems)
    .orderBy(sql`${onboardingItems.roleTagId} nulls first`, asc(onboardingItems.dueDay), asc(onboardingItems.sortOrder), asc(onboardingItems.id));
  return rows;
}

export interface LibraryInput {
  id?: number | null;
  roleTagId: number | null;
  title: string;
  description: string;
  kind: string;
  assignee: string;
  assigneeUserId: number | null;
  serviceId: number | null;
  /** «+ ساختِ سرویسِ تازه» ِ فرم — سرویس با همین نام پیدا یا ساخته می‌شود. */
  newServiceName?: string;
  link: string;
  dueDay: number;
  sortOrder: number;
}

/**
 * پیوند فقط http(s) یا مسیرِ داخلی — `javascript:` و مانندش نباید به کارتِ
 * عضوِ تازه برسد.
 */
function safeLink(raw: string): string {
  const link = raw.trim();
  return /^https?:\/\//i.test(link) || link.startsWith('/') ? link.slice(0, 500) : '';
}

export async function saveLibraryItem(actor: Actor, input: LibraryInput): Promise<number> {
  assertCan(actor, 'settings.manage');
  const title = input.title.trim();
  if (!title) throw new OnboardingError('title_required');
  const kind: OnboardingKind = isKind(input.kind) ? input.kind : 'task';
  const assignee: AssigneeRule = isAssigneeRule(input.assignee) ? input.assignee : 'member';
  const needsService = kind === 'access' || assignee === 'service_owner';
  const newServiceName = needsService ? (input.newServiceName ?? '').trim() : '';
  let serviceId = input.serviceId || null;
  // ⚠️ «دسترسی» و «مسئولِ سرویس» بی‌سرویس معنا ندارند: نه گرنتی ثبت می‌شود، نه کسی پیدا.
  if (needsService && !serviceId && !newServiceName) {
    throw new OnboardingError('service_required');
  }
  if (input.roleTagId) {
    const [tag] = await db.select({ type: tags.type }).from(tags).where(eq(tags.id, input.roleTagId));
    if (tag?.type !== 'member_role') throw new OnboardingError('bad_role');
  }
  /*
   * سرویسِ تازه پس از همهٔ سنجش‌ها ساخته می‌شود (نقشِ نادرست سرویسِ بی‌مصرف
   * جا نگذارد). گاردش گاردِ خودِ دفترِ دسترسی‌هاست (`members.manage`) —
   * مدیرِ تنظیمات بی‌آن حق، از این راه هم سرویس نمی‌سازد.
   */
  if (newServiceName) serviceId = await findOrCreateService(actor, newServiceName);
  const values = {
    roleTagId: input.roleTagId || null,
    title: title.slice(0, 200),
    description: input.description.trim().slice(0, 2000),
    kind,
    assignee,
    assigneeUserId: assignee === 'user' ? (input.assigneeUserId || null) : null,
    serviceId,
    link: safeLink(input.link),
    dueDay: Math.min(MAX_DUE_DAY, Math.max(1, Math.trunc(input.dueDay) || 1)),
    sortOrder: Math.trunc(input.sortOrder) || 0,
    updatedAt: new Date(),
  };
  if (input.id) {
    const [row] = await db.update(onboardingItems).set(values)
      .where(eq(onboardingItems.id, input.id)).returning({ id: onboardingItems.id });
    if (!row) throw new OnboardingError('not_found');
    await audit(actor, 'onboarding_item.update', 'onboarding_item', row.id, null, values);
    return row.id;
  }
  const [row] = await db.insert(onboardingItems).values(values).returning({ id: onboardingItems.id });
  await audit(actor, 'onboarding_item.create', 'onboarding_item', row!.id, null, values);
  return row!.id;
}

/** حذف از کتابخانه — چک‌لیستِ کسانی که شروع کرده‌اند دست نمی‌خورد (عکسِ آیتم می‌ماند). */
export async function deleteLibraryItem(actor: Actor, id: number): Promise<void> {
  assertCan(actor, 'settings.manage');
  await db.delete(onboardingItems).where(eq(onboardingItems.id, id));
  await audit(actor, 'onboarding_item.delete', 'onboarding_item', id);
}

/* ------------------------------------------------------------------ *
 * شروع و همگام‌سازی
 * ------------------------------------------------------------------ */

/** عضوِ فعالِ (نقشِ سامانه‌ای member) — فقط او آنبوردینگ دارد. */
async function activeMember(userId: number): Promise<{ id: number; name: string } | null> {
  const [row] = await db.select({ id: users.id, name: users.name }).from(users)
    .innerJoin(userRoles, and(eq(userRoles.userId, users.id), eq(userRoles.role, 'member')))
    .where(and(eq(users.id, userId), isNull(users.deletedAt), eq(users.memberState, 'active')));
  return row ?? null;
}

async function roleTagIdsOf(userId: number): Promise<Set<number>> {
  const rows = await db.select({ id: tagRelations.tagId }).from(tagRelations)
    .innerJoin(tags, eq(tags.id, tagRelations.tagId))
    .where(and(eq(tagRelations.objectType, 'user'), eq(tagRelations.objectId, userId), eq(tags.type, 'member_role')));
  return new Set(rows.map((r) => r.id));
}

/** مدیرِ یکی از دفاترِ این عضو (نه خودش) — نخستین مدیرِ فعال. */
async function officeManagerOf(userId: number): Promise<number | null> {
  const mine = await db.select({ officeId: userOffices.officeId }).from(userOffices).where(eq(userOffices.userId, userId));
  if (mine.length === 0) return null;
  const [row] = await db.select({ id: users.id }).from(userOffices)
    .innerJoin(users, eq(users.id, userOffices.userId))
    .where(and(
      inArray(userOffices.officeId, mine.map((m) => m.officeId)),
      eq(userOffices.manages, true),
      ne(userOffices.userId, userId),
      isNull(users.deletedAt),
      eq(users.memberState, 'active'),
    ))
    .orderBy(asc(users.id))
    .limit(1);
  return row?.id ?? null;
}

/**
 * آنبوردینگِ یک عضو را از کتابخانه می‌سازد — یا اگر از قبل دارد، آیتم‌های
 * تازه (نقشِ تازه، آیتمِ تازهٔ کتابخانه) را اضافه می‌کند. تکراری نمی‌سازد.
 * موعدِ آیتم‌های تازه از **امروز** حساب می‌شود.
 */
export async function startOnboarding(actor: Actor, userId: number): Promise<number> {
  assertCanManage(actor, 'members');
  await assertEnabled();
  const person = await activeMember(userId);
  if (!person) throw new OnboardingError('not_member');

  const [roleTagIds, library, existing, officeManagerId, start] = await Promise.all([
    roleTagIdsOf(userId),
    db.select().from(onboardingItems),
    db.select({ itemId: onboardingTasks.itemId, sortOrder: onboardingTasks.sortOrder })
      .from(onboardingTasks).where(eq(onboardingTasks.userId, userId)),
    officeManagerOf(userId),
    today(),
  ]);
  const toAdd = itemsToAdd(
    library.map((i) => ({ ...i, kind: i.kind as OnboardingKind, assignee: i.assignee as AssigneeRule })),
    roleTagIds,
    new Set(existing.map((e) => e.itemId).filter((id): id is number => id !== null)),
  );
  if (toAdd.length === 0) return 0;

  const serviceIds = [...new Set(toAdd.map((i) => i.serviceId).filter((id): id is number => id !== null))];
  const owners = serviceIds.length === 0 ? [] : await db.select({ id: services.id, owner: services.ownerUserId })
    .from(services).where(inArray(services.id, serviceIds));
  const ownerOf = new Map(owners.map((o) => [o.id, o.owner]));
  const base = existing.reduce((max, e) => Math.max(max, e.sortOrder), 0);

  const rows = toAdd.map((item, i) => ({
    userId,
    itemId: item.id,
    title: item.title,
    description: item.description,
    kind: item.kind,
    link: item.link,
    serviceId: item.serviceId,
    assigneeUserId: resolveAssignee(item.assignee, {
      memberId: userId,
      officeManagerId,
      serviceOwnerId: item.serviceId ? (ownerOf.get(item.serviceId) ?? null) : null,
      userId: item.assigneeUserId,
    }),
    dueDate: dueDateFor(start, item.dueDay),
    sortOrder: base + i + 1,
  }));

  // ⚠️ onConflictDoNothing: دو کلیکِ هم‌زمان روی «همگام‌سازی» تکراری نمی‌سازد (شاخصِ یکتا).
  const inserted = await db.insert(onboardingTasks).values(rows).onConflictDoNothing()
    .returning({ assignee: onboardingTasks.assigneeUserId });
  await audit(actor, 'onboarding.start', 'user', userId, null, { added: inserted.length });
  await announce(actor, person, inserted.map((r) => r.assignee), existing.length === 0);
  return inserted.length;
}

/**
 * اعلانِ شروع — به عضو (بارِ اول) و به هر انجام‌دهنده یک اعلانِ جمع‌بسته.
 * کارِ بی‌صاحب به مالکان می‌رسد. خودِ کسی که دکمه را زد اعلان نمی‌گیرد.
 * ⚠️ شکستِ اعلان نباید شروع را خراب کند — ردیف‌ها نوشته شده‌اند.
 */
async function announce(actor: Actor, person: { id: number; name: string }, assignees: Array<number | null>, first: boolean) {
  try {
    const counts = new Map<number, number>();
    const owners = assignees.some((a) => a === null) ? await ownerIds() : [];
    for (const a of assignees) {
      for (const id of a === null ? owners : [a]) {
        if (id === person.id || id === actor.id) continue;
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }
    }
    for (const [id, n] of counts) {
      await notify([id], {
        type: 'onboarding.assigned',
        title: '{n} کارِ آنبوردینگِ {person} با شماست',
        params: { n, person: person.name },
        url: `/onboarding/${person.id}`,
      });
    }
    if (first && person.id !== actor.id) {
      await notify([person.id], {
        type: 'onboarding.started',
        title: 'خوش آمدید! فهرستِ کارهای روزهای اولِ شما آماده است',
        url: '/dashboard',
      });
    }
  } catch (error) {
    console.error('[onboarding] announce', error);
  }
}

/**
 * شروعِ خودکار پس از ساختِ عضو — فقط وقتی آنبوردینگ روشن است و کتابخانه
 * چیزی دارد. ⚠️ هر خطایی بی‌صدا می‌ماند: ساختِ عضو نباید به‌خاطرِ چک‌لیست بشکند.
 */
export async function autoStartOnboarding(actor: Actor, userId: number): Promise<void> {
  try {
    if (!(await onboardingEnabled())) return;
    await startOnboarding(actor, userId);
  } catch (error) {
    if (!(error instanceof OnboardingError) && !(error instanceof ForbiddenError)) {
      console.error('[onboarding] auto start', error);
    }
  }
}

/* ------------------------------------------------------------------ *
 * آیتمِ ویژه، حذف، تیک
 * ------------------------------------------------------------------ */

export interface CustomTaskInput {
  title: string;
  description: string;
  kind: string;
  assigneeUserId: number | null;
  serviceId: number | null;
  /** «+ ساختِ سرویسِ تازه» — همان کتابخانه؛ گاردِ این مسیر (`members.manage`) همان گاردِ ساختنِ سرویس است. */
  newServiceName?: string;
  dueDate: string;
  link: string;
}

export async function addCustomTask(actor: Actor, userId: number, input: CustomTaskInput): Promise<number> {
  assertCanManage(actor, 'members');
  await assertEnabled();
  const person = await activeMember(userId);
  if (!person) throw new OnboardingError('not_member');
  const title = input.title.trim();
  if (!title) throw new OnboardingError('title_required');
  const kind: OnboardingKind = isKind(input.kind) ? input.kind : 'task';
  const newServiceName = kind === 'access' ? (input.newServiceName ?? '').trim() : '';
  if (kind === 'access' && !input.serviceId && !newServiceName) throw new OnboardingError('service_required');
  const serviceId = newServiceName ? await findOrCreateService(actor, newServiceName) : input.serviceId;
  const due = /^\d{4}-\d{2}-\d{2}$/.test(input.dueDate) ? input.dueDate : await today();
  const [{ max } = { max: 0 }] = await db.select({ max: sql<number>`coalesce(max(${onboardingTasks.sortOrder}), 0)::int` })
    .from(onboardingTasks).where(eq(onboardingTasks.userId, userId));

  const [row] = await db.insert(onboardingTasks).values({
    userId,
    itemId: null,
    title: title.slice(0, 200),
    description: input.description.trim().slice(0, 2000),
    kind,
    link: safeLink(input.link),
    serviceId: kind === 'access' ? serviceId : null,
    assigneeUserId: input.assigneeUserId || null,
    dueDate: due,
    sortOrder: max + 1,
  }).returning({ id: onboardingTasks.id, assignee: onboardingTasks.assigneeUserId });
  await audit(actor, 'onboarding.add', 'user', userId, null, { taskId: row!.id, title });
  await announce(actor, person, [row!.assignee], false);
  return row!.id;
}

export async function deleteTask(actor: Actor, taskId: number): Promise<number> {
  assertCanManage(actor, 'members');
  const [row] = await db.delete(onboardingTasks).where(eq(onboardingTasks.id, taskId))
    .returning({ userId: onboardingTasks.userId, title: onboardingTasks.title });
  if (!row) throw new OnboardingError('not_found');
  await audit(actor, 'onboarding.delete', 'user', row.userId, { taskId, title: row.title });
  return row.userId;
}

/**
 * تیک / برداشتنِ تیک.
 *
 * ⚠️ آیتمِ «دسترسی» با تیک در سیاههٔ دسترسی ثبت می‌شود (گرنتِ باز). گرنتِ بازِ
 * موجود دوباره ساخته نمی‌شود — فقط پیوند می‌خورد. برداشتنِ تیک گرنت را **نمی‌بندد**:
 * قطعِ واقعی بیرون از سامانه انجام می‌شود و بستنِ خودکارش دروغِ آرام‌بخش بود
 * (همان قاعدهٔ سیاهه).
 */
export async function toggleTask(actor: Actor, taskId: number, done: boolean): Promise<number> {
  await assertEnabled();
  const [task] = await db.select().from(onboardingTasks).where(eq(onboardingTasks.id, taskId));
  if (!task) throw new OnboardingError('not_found');
  if (!canTick({ id: actor.id, canManageMembers: canManageSection(actor, 'members') }, task)) {
    throw new ForbiddenError('onboarding.tick');
  }

  await db.transaction(async (tx) => {
    let grantId = task.grantId;
    if (done && task.kind === 'access' && task.serviceId && !grantId) {
      const [open] = await tx.select({ id: serviceGrants.id }).from(serviceGrants)
        .where(and(eq(serviceGrants.serviceId, task.serviceId), eq(serviceGrants.userId, task.userId), isNull(serviceGrants.revokedAt)));
      if (open) {
        grantId = open.id;
      } else {
        const [service] = await tx.select({ isActive: services.isActive }).from(services).where(eq(services.id, task.serviceId));
        const [person] = await tx.select({ state: users.memberState }).from(users).where(eq(users.id, task.userId));
        // سرویسِ غیرفعال یا عضوِ قفل‌شده: کار تیک می‌خورد ولی گرنتی ساخته نمی‌شود.
        if (service?.isActive && person?.state === 'active') {
          const [grant] = await tx.insert(serviceGrants).values({
            serviceId: task.serviceId,
            userId: task.userId,
            note: 'آنبوردینگ',
            grantedBy: actor.id,
          }).returning({ id: serviceGrants.id });
          grantId = grant!.id;
          await tx.insert(auditLog).values({
            actorType: 'user', actorId: actor.id, action: 'service_grant.create',
            objectType: 'service_grant', objectId: grantId, before: null,
            after: { serviceId: task.serviceId, userId: task.userId, via: 'onboarding' },
          });
        }
      }
    }
    await tx.update(onboardingTasks).set({
      doneAt: done ? new Date() : null,
      doneBy: done ? actor.id : null,
      grantId,
      updatedAt: new Date(),
    }).where(eq(onboardingTasks.id, taskId));
  });
  await audit(actor, done ? 'onboarding.done' : 'onboarding.undone', 'user', task.userId, null, { taskId });
  return task.userId;
}

/* ------------------------------------------------------------------ *
 * خواندن
 * ------------------------------------------------------------------ */

export interface TaskView {
  id: number;
  userId: number;
  title: string;
  description: string;
  kind: OnboardingKind;
  link: string;
  dueDate: string;
  state: TaskState;
  assigneeUserId: number | null;
  assigneeName: string | null;
  doneAt: Date | null;
  doneByName: string | null;
  serviceName: string | null;
  hasGrant: boolean;
  fromLibrary: boolean;
  canTick: boolean;
}

async function taskViews(actor: Actor, where: ReturnType<typeof and>, now: string): Promise<TaskView[]> {
  const assignee = alias(users, 'ob_assignee');
  const doer = alias(users, 'ob_doer');
  const rows = await db.select({
    id: onboardingTasks.id,
    userId: onboardingTasks.userId,
    title: onboardingTasks.title,
    description: onboardingTasks.description,
    kind: onboardingTasks.kind,
    link: onboardingTasks.link,
    dueDate: onboardingTasks.dueDate,
    doneAt: onboardingTasks.doneAt,
    assigneeUserId: onboardingTasks.assigneeUserId,
    assigneeName: assignee.name,
    doneByName: doer.name,
    serviceName: services.name,
    grantId: onboardingTasks.grantId,
    itemId: onboardingTasks.itemId,
  }).from(onboardingTasks)
    .leftJoin(assignee, eq(assignee.id, onboardingTasks.assigneeUserId))
    .leftJoin(doer, eq(doer.id, onboardingTasks.doneBy))
    .leftJoin(services, eq(services.id, onboardingTasks.serviceId))
    .where(where)
    .orderBy(asc(onboardingTasks.dueDate), asc(onboardingTasks.sortOrder), asc(onboardingTasks.id));
  const manage = canManageSection(actor, 'members');
  return rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    title: r.title,
    description: r.description,
    kind: r.kind as OnboardingKind,
    link: r.link,
    dueDate: r.dueDate,
    state: taskState(r, now),
    assigneeUserId: r.assigneeUserId,
    assigneeName: r.assigneeName,
    doneAt: r.doneAt,
    doneByName: r.doneByName,
    serviceName: r.serviceName,
    hasGrant: r.grantId !== null,
    fromLibrary: r.itemId !== null,
    canTick: canTick({ id: actor.id, canManageMembers: manage }, r),
  }));
}

export interface BoardRow {
  userId: number;
  name: string;
  total: number;
  done: number;
  overdue: number;
  startedAt: Date;
}

/** صفحهٔ «آنبوردینگ»: کارهای با من، عضوهای در جریان، و اعضای بی‌آنبوردینگ. */
export async function onboardingBoard(actor: Actor) {
  assertCanView(actor, 'members');
  const [enabled, now] = await Promise.all([onboardingEnabled(), today()]);
  const canManage = canManageSection(actor, 'members');

  const people = await db.select({
    userId: onboardingTasks.userId,
    name: users.name,
    total: sql<number>`count(*)::int`,
    done: sql<number>`count(${onboardingTasks.doneAt})::int`,
    overdue: sql<number>`count(*) filter (where ${onboardingTasks.doneAt} is null and ${onboardingTasks.dueDate} < ${now})::int`,
    startedAt: sql<Date>`min(${onboardingTasks.createdAt})`,
  }).from(onboardingTasks)
    .innerJoin(users, eq(users.id, onboardingTasks.userId))
    .where(isNull(users.deletedAt))
    .groupBy(onboardingTasks.userId, users.name)
    .orderBy(desc(sql`min(${onboardingTasks.createdAt})`));

  const mine = await taskViews(actor, and(
    eq(onboardingTasks.assigneeUserId, actor.id),
    ne(onboardingTasks.userId, actor.id),
    isNull(onboardingTasks.doneAt),
  ), now);
  const names = new Map(people.map((p) => [p.userId, p.name]));

  // اعضای فعالی که هنوز چک‌لیستی ندارند — برای «شروعِ آنبوردینگ».
  const started = new Set(people.map((p) => p.userId));
  const candidates = canManage
    ? (await db.selectDistinct({ id: users.id, name: users.name }).from(users)
      .innerJoin(userRoles, and(eq(userRoles.userId, users.id), eq(userRoles.role, 'member')))
      .where(and(isNull(users.deletedAt), eq(users.memberState, 'active')))
      .orderBy(asc(users.name)))
      .filter((u) => !started.has(u.id))
    : [];

  return {
    enabled,
    canManage,
    today: now,
    people: people.map((p) => ({ ...p, startedAt: new Date(p.startedAt) })) as BoardRow[],
    mine: mine.map((t) => ({ ...t, personName: names.get(t.userId) ?? '' })),
    candidates,
  };
}

/** صفحهٔ آنبوردینگِ یک نفر (نمای مدیر). */
export async function onboardingDetail(actor: Actor, userId: number) {
  assertCanView(actor, 'members');
  const [enabled, now, locale] = await Promise.all([onboardingEnabled(), today(), currentLocale()]);
  const [person] = await db.select({ id: users.id, name: users.name, state: users.memberState })
    .from(users).where(and(eq(users.id, userId), isNull(users.deletedAt)));
  if (!person) throw new OnboardingError('not_found');

  const [roles, tasks] = await Promise.all([
    db.select({ name: tagName(locale) }).from(tagRelations)
      .innerJoin(tags, eq(tags.id, tagRelations.tagId))
      .where(and(eq(tagRelations.objectType, 'user'), eq(tagRelations.objectId, userId), eq(tags.type, 'member_role'))),
    taskViews(actor, and(eq(onboardingTasks.userId, userId)), now),
  ]);
  const canManage = canManageSection(actor, 'members');
  const options = canManage ? await assignOptions() : { people: [], services: [] };

  return {
    enabled,
    canManage,
    today: now,
    person: { ...person, roles: roles.map((r) => r.name) },
    tasks,
    progress: progress(tasks, now),
    grants: tasks.filter((t) => t.hasGrant).length,
    ...options,
  };
}

/** انتخاب‌گرهای فرمِ «آیتمِ ویژه» و کتابخانه: کادر و اعضای فعال، سرویس‌های فعال. */
export async function assignOptions() {
  const [people, activeServices] = await Promise.all([
    db.selectDistinct({ id: users.id, name: users.name }).from(users)
      .innerJoin(userRoles, eq(userRoles.userId, users.id))
      .where(and(isNull(users.deletedAt), eq(users.memberState, 'active'), ne(userRoles.role, 'client')))
      .orderBy(asc(users.name)),
    db.select({ id: services.id, name: services.name }).from(services)
      .where(eq(services.isActive, true)).orderBy(asc(services.name)),
  ]);
  return { people, services: activeServices };
}

/**
 * کارتِ داشبوردِ عضو: چک‌لیستِ خودش + کارهای آنبوردینگِ دیگران که با اوست.
 * `null` وقتی خاموش است یا هیچ‌کدام نیست — کارت اصلاً نمی‌آید.
 */
export async function myOnboarding(actor: Actor) {
  if (!(await onboardingEnabled())) return null;
  const now = await today();
  const [own, forOthers] = await Promise.all([
    taskViews(actor, and(eq(onboardingTasks.userId, actor.id)), now),
    taskViews(actor, and(
      eq(onboardingTasks.assigneeUserId, actor.id),
      ne(onboardingTasks.userId, actor.id),
      isNull(onboardingTasks.doneAt),
    ), now),
  ]);
  if (own.length === 0 && forOthers.length === 0) return null;
  const otherIds = [...new Set(forOthers.map((t) => t.userId))];
  const names = otherIds.length === 0 ? new Map<number, string>() : new Map(
    (await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, otherIds)))
      .map((u) => [u.id, u.name]),
  );
  // روزِ شروع = زودترین موعد، تا «روزِ ۱» همان روزِ اول باشد.
  const start = own.reduce<string | null>((min, t) => (min === null || t.dueDate < min ? t.dueDate : min), null);
  return {
    today: now,
    start,
    own,
    progress: progress(own, now),
    forOthers: forOthers.map((t) => ({ ...t, personName: names.get(t.userId) ?? '' })),
  };
}

/* ------------------------------------------------------------------ *
 * زمان‌بند
 * ------------------------------------------------------------------ */

/**
 * یادآوریِ کارهای عقب‌افتاده — هر کار فقط **یک بار** (مهرِ
 * `overdue_notified_at`). به انجام‌دهنده؛ کارِ بی‌صاحب به مالکان.
 * خروجی: تعدادِ کارهایی که یادآوری‌شان رفت.
 */
export async function notifyOverdueOnboarding(now = new Date()): Promise<number> {
  if (!(await onboardingEnabled())) return 0;
  const day = await today(now);
  const person = alias(users, 'ob_person');
  const rows = await db.select({
    id: onboardingTasks.id,
    title: onboardingTasks.title,
    userId: onboardingTasks.userId,
    assignee: onboardingTasks.assigneeUserId,
    personName: person.name,
  }).from(onboardingTasks)
    .innerJoin(person, eq(person.id, onboardingTasks.userId))
    .where(and(
      isNull(onboardingTasks.doneAt),
      isNull(onboardingTasks.overdueNotifiedAt),
      lt(onboardingTasks.dueDate, day),
      isNull(person.deletedAt),
      eq(person.memberState, 'active'),
    ))
    .limit(500);
  if (rows.length === 0) return 0;

  // ⚠️ مهر پیش از ارسال — شکستِ میانه نباید در تیکِ بعدی دوباره بفرستد.
  await db.update(onboardingTasks).set({ overdueNotifiedAt: now })
    .where(inArray(onboardingTasks.id, rows.map((r) => r.id)));

  const owners = rows.some((r) => r.assignee === null) ? await ownerIds() : [];
  const byRecipient = new Map<number, typeof rows>();
  for (const r of rows) {
    for (const id of r.assignee === null ? owners : [r.assignee]) {
      byRecipient.set(id, [...(byRecipient.get(id) ?? []), r]);
    }
  }
  for (const [id, list] of byRecipient) {
    try {
      const ownOnly = list.every((r) => r.userId === id);
      await notify([id], {
        type: 'onboarding.overdue',
        title: '{n} کارِ آنبوردینگ از موعد گذشته است',
        body: '{items}',
        params: {
          n: list.length,
          items: list.map((r) => (r.userId === id ? r.title : `${r.title} — ${r.personName}`)).join(' · '),
        },
        url: ownOnly ? '/dashboard' : '/onboarding',
      });
    } catch (error) {
      console.error('[onboarding] overdue notify', error);
    }
  }
  return rows.length;
}
