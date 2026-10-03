import { and, eq, gt, inArray, ne, sql } from 'drizzle-orm';
import { tagName } from '@/db/tag-name';
import { currentLocale } from '@/i18n/server';
import { db } from '@/db/client';
import {
  messages, notifications, offices, projectMembers, projects, tagRelations, tags, threads, threadUsers,
  userOffices, userRoles, users,
} from '@/db/schema';
import type { Actor } from '@/domain/access/permissions';
import {
  channelMemberIds, GROUP_NOTIFY_QUIET_MINUTES, isChannelManager, normalizeAudience,
  projectGroupMemberIds, type ChannelAudience, type TeamPerson,
} from '@/domain/messaging/channels';

/**
 * کانالِ تیم و گروهِ پروژه — عضویت، دیده‌شدن و پاک‌سازی.
 *
 * ⚠️ عضویت هر بار **از منبع** حساب می‌شود (عضویتِ پروژه، نقش، دفتر، وضعیتِ
 * عضو)، نه از `thread_users`. آن جدول برای گروه‌ها فقط رسیدِ خواندن و «بی‌صدا»
 * است؛ ردیفِ کسی که دیگر عضو نیست می‌ماند ولی هیچ‌جا به حساب نمی‌آید.
 */

export interface GroupThread {
  id: number;
  kind: 'channel' | 'project';
  title: string;
  audience: ChannelAudience | null;
  projectId: number | null;
  projectTitle: string | null;
  projectArchived: boolean;
  projectOfficeId: number | null;
  creatorId: number;
  allowReply: boolean;
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** همهٔ گروه‌های زنده — گروهِ پروژهٔ حذف‌شده (حذفِ نرم) دیگر گروهی ندارد. */
export async function loadGroups(ids?: number[]): Promise<GroupThread[]> {
  if (ids && ids.length === 0) return [];
  const rows = await db
    .select({
      id: threads.id,
      kind: threads.kind,
      title: threads.title,
      audience: threads.audience,
      projectId: threads.projectId,
      creatorId: threads.creatorId,
      allowReply: threads.allowReply,
      projectTitle: projects.title,
      projectArchived: projects.isArchived,
      projectOfficeId: projects.officeId,
      projectDeletedAt: projects.deletedAt,
    })
    .from(threads)
    .leftJoin(projects, eq(projects.id, threads.projectId))
    .where(and(ne(threads.kind, 'direct'), ids ? inArray(threads.id, ids) : undefined));

  return rows
    .filter((r) => r.kind === 'channel' || (r.kind === 'project' && r.projectId !== null && r.projectDeletedAt === null))
    .map((r) => ({
      id: r.id,
      kind: r.kind as 'channel' | 'project',
      title: r.title,
      audience: normalizeAudience(r.audience),
      projectId: r.projectId,
      projectTitle: r.projectTitle,
      projectArchived: r.projectArchived ?? false,
      projectOfficeId: r.projectOfficeId,
      creatorId: r.creatorId,
      allowReply: r.allowReply,
    }));
}

/**
 * آدم‌ها از دیدِ عضویت. ⚠️ چهار کوئریِ ثابت برای کلِ تیم، نه یکی به‌ازای هر
 * نفر (R-PERF-01). `ids` فقط همان چند نفر را می‌خواند.
 */
export async function loadPeople(ids?: number[]): Promise<TeamPerson[]> {
  if (ids && ids.length === 0) return [];
  const [userRows, roleRows, tagRows, officeRows] = await Promise.all([
    db.select({ id: users.id, memberState: users.memberState, deletedAt: users.deletedAt })
      .from(users).where(ids ? inArray(users.id, ids) : undefined),
    db.select({ userId: userRoles.userId, role: userRoles.role }).from(userRoles)
      .where(ids ? inArray(userRoles.userId, ids) : undefined),
    db.select({ userId: tagRelations.objectId, tagId: tagRelations.tagId })
      .from(tagRelations)
      .innerJoin(tags, eq(tags.id, tagRelations.tagId))
      .where(and(
        eq(tagRelations.objectType, 'user'), eq(tags.type, 'member_role'),
        ids ? inArray(tagRelations.objectId, ids) : undefined,
      )),
    db.select({ userId: userOffices.userId, officeId: userOffices.officeId }).from(userOffices)
      .where(ids ? inArray(userOffices.userId, ids) : undefined),
  ]);

  const group = <K extends string>(rows: Array<{ userId: number } & Record<K, unknown>>, key: K) => {
    const map = new Map<number, Array<(typeof rows)[number][K]>>();
    for (const r of rows) map.set(r.userId, [...(map.get(r.userId) ?? []), r[key]]);
    return map;
  };
  const roles = group(roleRows, 'role');
  const tagsOf = group(tagRows, 'tagId');
  const officesOf = group(officeRows, 'officeId');

  return userRows.map((u) => ({
    id: u.id,
    active: u.memberState === 'active' && u.deletedAt === null,
    roles: (roles.get(u.id) ?? []) as string[],
    roleTagIds: (tagsOf.get(u.id) ?? []) as number[],
    officeIds: (officesOf.get(u.id) ?? []) as number[],
  }));
}

/** اعضای یک گروه — از منبع. */
export async function groupMemberIds(group: GroupThread, people?: TeamPerson[]): Promise<number[]> {
  const everyone = people ?? await loadPeople();
  if (group.kind === 'channel') {
    return group.audience ? channelMemberIds(group.audience, everyone) : [];
  }
  const [members, officeManagers] = await Promise.all([
    db.select({ userId: projectMembers.userId, accessBlocked: projectMembers.accessBlocked })
      .from(projectMembers).where(eq(projectMembers.projectId, group.projectId!)),
    group.projectOfficeId
      ? db.select({ userId: userOffices.userId }).from(userOffices)
        .where(and(eq(userOffices.officeId, group.projectOfficeId), eq(userOffices.manages, true)))
      : Promise.resolve([] as Array<{ userId: number }>),
  ]);
  return projectGroupMemberIds({
    people: everyone,
    projectMembers: members,
    officeManagerIds: officeManagers.map((r) => r.userId),
  });
}

/**
 * گروه‌هایی که این نفر عضوشان است.
 *
 * ⚠️ برای هر بارگذاریِ صفحه (شمارندهٔ سایدبار) صدا زده می‌شود، پس فقط دادهٔ
 * **همین نفر** خوانده می‌شود، نه کلِ تیم: عضویت‌های پروژه‌اش، دفترهایی که
 * مدیرشان است، نقش و دفترش.
 */
export async function groupsVisibleTo(actor: Actor, candidates?: GroupThread[]): Promise<GroupThread[]> {
  const groups = candidates ?? await loadGroups();
  if (groups.length === 0) return [];

  const [me] = await loadPeople([actor.id]);
  if (!me || !me.active || !me.roles.some((r) => r !== 'client')) return [];
  if (isChannelManager(me.roles)) return groups;

  const projectIds = groups.filter((g) => g.kind === 'project').map((g) => g.projectId!);
  const [memberships, managed] = await Promise.all([
    projectIds.length > 0
      ? db.select({ projectId: projectMembers.projectId, accessBlocked: projectMembers.accessBlocked })
        .from(projectMembers)
        .where(and(eq(projectMembers.userId, actor.id), inArray(projectMembers.projectId, projectIds)))
      : Promise.resolve([] as Array<{ projectId: number; accessBlocked: boolean }>),
    db.select({ officeId: userOffices.officeId }).from(userOffices)
      .where(and(eq(userOffices.userId, actor.id), eq(userOffices.manages, true))),
  ]);
  const onProject = new Set(memberships.filter((m) => !m.accessBlocked).map((m) => m.projectId));
  const managesOffice = new Set(managed.map((m) => m.officeId));

  return groups.filter((g) => {
    if (g.kind === 'project') {
      return onProject.has(g.projectId!) || (g.projectOfficeId !== null && managesOffice.has(g.projectOfficeId));
    }
    return g.audience !== null && channelMemberIds(g.audience, [me]).length === 1;
  });
}

/**
 * ردیفِ رسیدِ خواندن برای عضوهایی که هنوز ندارند — «تا امروز خوانده».
 * ⚠️ عضوِ تازهٔ یک پروژهٔ قدیمی با صدها پیامِ خوانده‌نشده روبه‌رو نمی‌شود؛ از
 * پیامِ بعدی به‌بعد برایش تازه است.
 */
export async function ensureReadRows(userId: number, threadIds: number[]): Promise<void> {
  if (threadIds.length === 0) return;
  await db.execute(sql`
    insert into thread_users (thread_id, user_id, last_read_message_id)
    select t.id, ${userId}, (select max(m.id) from messages m where m.thread_id = t.id)
    from threads t
    where t.id in ${sql.raw(`(${threadIds.map(Number).join(',')})`)}
    on conflict (thread_id, user_id) do nothing
  `);
}

/** شمارِ گروهی که این نفر بی‌صدایش کرده — برای شمارنده و اعلان. */
export async function mutedThreadIds(userId: number, threadIds: number[]): Promise<Set<number>> {
  if (threadIds.length === 0) return new Set();
  const rows = await db.select({ threadId: threadUsers.threadId }).from(threadUsers)
    .where(and(eq(threadUsers.userId, userId), eq(threadUsers.muted, true), inArray(threadUsers.threadId, threadIds)));
  return new Set(rows.map((r) => r.threadId));
}

/** چه کسانی این گروه را بی‌صدا کرده‌اند. */
export async function mutedMembers(threadId: number): Promise<Set<number>> {
  const rows = await db.select({ userId: threadUsers.userId }).from(threadUsers)
    .where(and(eq(threadUsers.threadId, threadId), eq(threadUsers.muted, true)));
  return new Set(rows.map((r) => r.userId));
}

/**
 * اعلانِ جمع‌شدهٔ گروه — کسانی که اعلانِ **خوانده‌نشده** و تازه‌ای از همین گروه
 * دارند دوباره خبر نمی‌گیرند (نه در برنامه، نه در تلگرام).
 */
export async function recentlyNotified(threadId: number, userIds: number[]): Promise<Set<number>> {
  if (userIds.length === 0) return new Set();
  const since = new Date(Date.now() - GROUP_NOTIFY_QUIET_MINUTES * 60_000);
  const rows = await db.select({ userId: notifications.userId }).from(notifications)
    .where(and(
      inArray(notifications.userId, userIds),
      eq(notifications.type, 'message.group'),
      eq(notifications.url, `/messages/${threadId}`),
      eq(notifications.isRead, false),
      gt(notifications.createdAt, since),
    ));
  return new Set(rows.map((r) => r.userId));
}

/**
 * پاک کردنِ گروهِ یک پروژه با همهٔ پیام‌ها و اعلان‌هایش — داخلِ تراکنشِ
 * حذف یا سبک‌سازیِ پروژه.
 * ⚠️ حذفِ پروژه **نرم** است (فقط `deleted_at`)، پس `on delete cascade` ِ کلیدِ
 * خارجی هیچ‌وقت اجرا نمی‌شود؛ این تابع باید صریحاً صدا زده شود.
 */
export async function deleteProjectGroupsTx(tx: Tx, projectId: number): Promise<void> {
  const rows = await tx.select({ id: threads.id }).from(threads)
    .where(and(eq(threads.kind, 'project'), eq(threads.projectId, projectId)));
  const ids = rows.map((r) => r.id);
  if (ids.length === 0) return;
  await tx.delete(messages).where(inArray(messages.threadId, ids));
  await tx.delete(threadUsers).where(inArray(threadUsers.threadId, ids));
  await tx.delete(threads).where(inArray(threads.id, ids));
  await tx.delete(notifications).where(inArray(notifications.url, ids.map((id) => `/messages/${id}`)));
}

/** گزینه‌های مخاطبِ کانال برای فرمِ ساخت: تگ‌های نقشِ عضو (به زبانِ بیننده) و دفاترِ فعال. */
export async function channelAudienceOptions() {
  const locale = await currentLocale();
  const [roleTags, officeRows] = await Promise.all([
    db.select({ id: tags.id, name: tagName(locale) }).from(tags)
      .where(eq(tags.type, 'member_role')).orderBy(tags.sortOrder, tags.id),
    db.select({ id: offices.id, name: offices.name }).from(offices)
      .where(eq(offices.isActive, true)).orderBy(offices.name),
  ]);
  return { roleTags, offices: officeRows };
}
