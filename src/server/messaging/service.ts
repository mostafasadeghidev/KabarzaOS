import { and, asc, desc, eq, inArray, isNull, lt, sql } from 'drizzle-orm';
import { getSystemConfig } from '@/server/settings/system-service';
import { getT } from '@/i18n/server';
import { db } from '@/db/client';
import {
  messages, notifications, offices, projectClients, projectMembers, projects, threads,
  threadUsers, userOffices, userPermissions, userRoles, users,
} from '@/db/schema';
import { can, type Actor, type Role } from '@/domain/access/permissions';
import { ForbiddenError } from '@/domain/access/guard';
import {
  canRead, canReply, cooldownRemaining, isRateLimited, planCompose,
  streamFingerprint, type Audience,
} from '@/domain/messaging/threads';
import {
  counterpartLabel, personLabel, readUpTo, type LabelContext,
} from '@/domain/messaging/labels';
import {
  canMentionAll, canPostInGroup, ChannelError, groupRecipients, mentionsToPlain, normalizeAudience,
  normalizeChannelTitle, PROJECT_GROUP_RETENTION_DAYS, sanitizeMentions, splitMentions,
} from '@/domain/messaging/channels';
import { markReadForTarget, notify, type NotifyInput } from '@/server/notifications/service';
import { canManageProject } from '@/server/projects/authority';
import {
  channelAudienceOptions, ensureReadRows, groupMemberIds, groupsVisibleTo, loadGroups,
  mutedMembers, recentlyNotified, type GroupThread,
} from './groups';

/**
 * سرویسِ پیام‌ها.
 *
 * ⚠️ صندوقِ پیام کاملاً شخصی است: هیچ کوئری‌ای «همهٔ گفتگوها» را نمی‌خواند؛
 * همیشه از `thread_users` ِ خودِ کاربر شروع می‌شود (R-MSG-02).
 *
 * ⚠️ R-MSG-03 — نامِ مدیران برای عضو/کارفرما **سمتِ سرور** به «مدیریت» ماسک
 * می‌شود (صندوق، سربرگ، نامِ نویسندهٔ پیام، عنوانِ اعلان). «مدیر» یعنی هر
 * کسی که به نامِ سازمان می‌فرستد: مالک، همکارِ ادمین، و کارمندی که مجوزِ
 * ارسال دارد — همان `can_broadcast()` ِ نسخهٔ قبلی.
 */

export class ThreadNotFoundError extends Error {
  constructor() {
    super('thread_not_found');
    this.name = 'ThreadNotFoundError';
  }
}

export class RateLimitedError extends Error {
  constructor(readonly secondsLeft: number) {
    super('rate_limited');
    this.name = 'RateLimitedError';
  }
}

/**
 * شناسهٔ **مالکان** — جدا از مدیران.
 * ⚠️ «مدیر» همکارِ ادمین را هم می‌گیرد؛ برای هم‌مالکیِ رشته فقط مالک لازم
 * است، وگرنه رشتهٔ همکارِ ادمین از دیدِ مالک پنهان می‌ماند.
 */
async function ownerIds(): Promise<number[]> {
  const rows = await db
    .selectDistinct({ id: users.id })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .where(and(eq(userRoles.role, 'owner'), isNull(users.deletedAt)));
  return rows.map((r) => r.id);
}

/** مالک و ادمین — هم‌مالکیِ رشتهٔ همکار (R-MSG-N3). */
async function managerIds(): Promise<number[]> {
  const rows = await db
    .selectDistinct({ id: users.id })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .where(and(inArray(userRoles.role, ['owner', 'admin']), isNull(users.deletedAt)));
  return rows.map((r) => r.id);
}

/**
 * «مدیریت» از دیدِ پیام‌رسان — مالک/ادمین **و** هر کسی که مجوزِ ارسال دارد:
 * نامِ همهٔ این‌ها برای عضو/کارفرما ماسک می‌شود.
 */
async function managementIds(): Promise<Set<number>> {
  const [roles, perms] = await Promise.all([
    managerIds(),
    db.select({ id: userPermissions.userId })
      .from(userPermissions)
      .where(eq(userPermissions.permission, 'messages.send')),
  ]);
  return new Set([...roles, ...perms.map((r) => r.id)]);
}

function isManager(actor: Actor): boolean {
  return actor.roles.includes('owner') || actor.roles.includes('admin');
}

/** بیننده خودش «مدیریت» است؟ — نامِ واقعیِ همه را می‌بیند. */
function isManagement(actor: Actor): boolean {
  return isManager(actor) || can(actor, 'messages.send');
}

async function labelContext(actor: Actor, userIds: Iterable<number>): Promise<LabelContext> {
  const ids = [...new Set(userIds)];
  const [names, mgmt] = await Promise.all([
    ids.length > 0
      ? db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, ids))
      : [],
    managementIds(),
  ]);
  return {
    viewerId: actor.id,
    viewerIsManager: isManagement(actor),
    managerIds: mgmt,
    names: new Map(names.map((n) => [n.id, n.name])),
  };
}

/**
 * صندوقِ پیام — آخرین پیامِ هر رشته و شمارِ خوانده‌نشده.
 *
 * ⚠️ R-PERF-01 — سه کوئریِ ثابت، نه یکی به‌ازای هر رشته. در نسخهٔ قبلی همین
 * صفحه یک بار به‌خاطرِ کوئری‌های داخلِ حلقه بازنویسی شد.
 *
 * ⚠️ ترتیب: آخرین فعالیت (`updated_at` که با هر پاسخ جلو می‌رود)، نه شناسه —
 * گفتگویی که جوابِ تازه گرفته باید بالا بیاید.
 */
export async function listInbox(actor: Actor) {
  /*
   * ⚠️ گروه‌ها از عضویتِ **زنده** می‌آیند، نه از `thread_users`: کسی که از
   * پروژه برداشته شده ردیفِ رسیدش هنوز هست ولی گروه دیگر در صندوقش نیست.
   * ردیفِ رسید برای گروهِ تازه‌دیده همین‌جا ساخته می‌شود («تا امروز خوانده»).
   */
  const visible = await groupsVisibleTo(actor);
  const groupById = new Map(visible.map((g) => [g.id, g]));
  await ensureReadRows(actor.id, visible.map((g) => g.id));

  const myThreads = await db
    .select({
      threadId: threads.id,
      creatorId: threads.creatorId,
      allowReply: threads.allowReply,
      broadcastId: threads.broadcastId,
      kind: threads.kind,
      muted: threadUsers.muted,
      lastReadMessageId: threadUsers.lastReadMessageId,
    })
    .from(threadUsers)
    .innerJoin(threads, eq(threads.id, threadUsers.threadId))
    .where(and(
      eq(threadUsers.userId, actor.id),
      visible.length > 0
        ? sql`(${threads.kind} = 'direct' or ${threads.id} in ${sql.raw(`(${visible.map((g) => g.id).join(',')})`)})`
        : eq(threads.kind, 'direct'),
    ))
    .orderBy(desc(threads.updatedAt), desc(threads.id));

  if (myThreads.length === 0) return { threads: [], canSend: can(actor, 'messages.send') };
  const ids = myThreads.map((t) => t.threadId);

  const [lastMessages, unreadCounts, participants] = await Promise.all([
    // آخرین پیامِ هر رشته — یک کوئری با distinct on.
    db.execute(sql`
      select distinct on (m.thread_id)
        m.thread_id, m.id, m.body, m.created_at, m.from_user_id
      from messages m
      where m.thread_id in ${sql.raw(`(${ids.join(',')})`)}
      order by m.thread_id, m.id desc
    `),
    db.execute(sql`
      select tu.thread_id, count(m.id)::int as unread
      from thread_users tu
      join messages m on m.thread_id = tu.thread_id
        and m.id > coalesce(tu.last_read_message_id, 0)
        and m.from_user_id <> ${actor.id}
      where tu.user_id = ${actor.id}
      group by tu.thread_id
    `),
    db
      .select({ threadId: threadUsers.threadId, userId: threadUsers.userId })
      .from(threadUsers)
      .where(inArray(threadUsers.threadId, ids)),
  ]);

  const last = new Map(
    (lastMessages as unknown as Array<{
      thread_id: number; id: number; body: string; created_at: Date; from_user_id: number;
    }>).map((r) => [Number(r.thread_id), r]),
  );
  const unread = new Map(
    (unreadCounts as unknown as Array<{ thread_id: number; unread: number }>)
      .map((r) => [Number(r.thread_id), Number(r.unread)]),
  );

  const byThread = new Map<number, number[]>();
  for (const p of participants) {
    const list = byThread.get(p.threadId) ?? [];
    list.push(p.userId);
    byThread.set(p.threadId, list);
  }

  const t = await getT();
  const lastBodies = [...last.values()].map((r) => r.body);
  const ctx = await labelContext(actor, [
    ...participants.filter((p) => !groupById.has(p.threadId)).map((p) => p.userId),
    ...[...last.values()].map((r) => Number(r.from_user_id)),
    ...mentionedIdsIn(lastBodies),
  ]);
  const plain = (body: string) => mentionsToPlain(body, (id) => personLabel(id, ctx, t), t('همه'));

  return {
    threads: myThreads.map((row) => {
      const group = groupById.get(row.threadId) ?? null;
      // ⚠️ برای گروه، شرکت‌کنندگان از عضویتِ زنده‌اند؛ ردیف‌های رسیدِ اعضای سابق برچسب نمی‌سازند.
      const ids = group ? [] : (byThread.get(row.threadId) ?? []);
      const lastRow = last.get(row.threadId);
      return {
        id: row.threadId,
        kind: (group?.kind ?? 'direct') as 'direct' | 'channel' | 'project',
        allowReply: row.allowReply,
        broadcastId: group ? null : row.broadcastId,
        isMine: row.creatorId === actor.id,
        muted: group ? row.muted : false,
        // «مخاطب» یعنی بقیه، نه خودم — با نامِ ماسک‌شده.
        counterparts: ids.filter((id) => id !== actor.id)
          .map((userId) => ({ userId, name: personLabel(userId, ctx, t) })),
        label: group ? groupLabel(group) : counterpartLabel(ids, ctx, t),
        lastBody: lastRow ? plain(lastRow.body) : '',
        lastAt: lastRow?.created_at ?? null,
        lastFromName: lastRow ? personLabel(Number(lastRow.from_user_id), ctx, t) : null,
        unread: unread.get(row.threadId) ?? 0,
      };
    }),
    canSend: can(actor, 'messages.send'),
  };
}

/**
 * یک گفتگو با پیام‌هایش — و علامت‌زدنِ خوانده‌شده.
 *
 * ⚠️ خواندنِ گفتگو اعلانِ زنگولهٔ همان گفتگو را هم خوانده می‌کند (R-NOTIF-08)؛
 * پیش از این «پیامِ تازه» بعد از خواندنِ گفتگو هم روشن می‌ماند.
 */
export async function openThread(actor: Actor, threadId: number) {
  const access = await accessThread(actor, threadId);
  if (!access.readable) throw new ThreadNotFoundError();
  const { thread, group } = access;
  if (group) await ensureReadRows(actor.id, [threadId]);

  const [rows, states] = await Promise.all([
    db.select({
      id: messages.id,
      body: messages.body,
      createdAt: messages.createdAt,
      fromUserId: messages.fromUserId,
    })
      .from(messages)
      .where(eq(messages.threadId, threadId))
      .orderBy(asc(messages.id)),
    db.select({ userId: threadUsers.userId, lastReadMessageId: threadUsers.lastReadMessageId })
      .from(threadUsers).where(eq(threadUsers.threadId, threadId)),
  ]);

  // رسیدِ خواندن تا آخرین پیام جلو می‌رود.
  const lastId = rows.at(-1)?.id;
  if (lastId) {
    await db.update(threadUsers)
      .set({ lastReadMessageId: lastId, updatedAt: new Date() })
      .where(and(eq(threadUsers.threadId, threadId), eq(threadUsers.userId, actor.id)));
  }
  await markReadForTarget(actor, '/messages', threadId);

  const t = await getT();
  const members = access.members ?? [];
  const ctx = await labelContext(actor, [
    ...(group ? members : thread.participantIds),
    ...rows.map((r) => r.fromUserId),
    ...mentionedIdsIn(rows.map((r) => r.body)),
  ]);

  return {
    thread: {
      id: thread.id,
      allowReply: thread.allowReply,
      creatorId: thread.creatorId,
      label: group ? groupLabel(group) : counterpartLabel(thread.participantIds, ctx, t),
      /**
       * حذفِ کلِ گفتگو: سازنده یا مدیر (R-MSG-11). کانالِ تیم فقط مدیر؛ گروهِ
       * پروژه مدیر یا مدیرِ همان پروژه.
       */
      canDelete: group
        ? isManager(actor) || await managesGroupProject(actor, group)
        : thread.creatorId === actor.id || isManager(actor),
      /** تیکِ ✓✓ فقط برای مدیران و فقط در گفتگوی دونفره — در گروه «همه خواندند» معنا ندارد. */
      showReceipts: !group && isManagement(actor),
    },
    group: group ? await groupView(actor, group, members, ctx, t) : null,
    messages: rows.map((m) => ({ ...m, fromName: personLabel(m.fromUserId, ctx, t) })),
    canReply: access.writable,
    /** تا این شناسه، همهٔ طرف‌های دیگر خوانده‌اند (R-MSG-07). */
    readUpTo: readUpTo(states, actor.id),
    /** برچسبِ هر منشن برای همین بیننده (ماسکِ R-MSG-03 هم اعمال شده). */
    mentionNames: Object.fromEntries(
      mentionedIdsIn(rows.map((r) => r.body)).map((id) => [id, personLabel(id, ctx, t)]),
    ) as Record<number, string>,
  };
}

/**
 * دادهٔ سربرگ و نوارِ نوشتنِ یک گروه.
 *
 * ⚠️ فهرستِ منشن برای عضوِ عادی مدیران را ندارد: نامشان برایش «مدیریت» است و
 * منشنِ «مدیریت» معلوم نمی‌کرد به کدام نفر اعلان برود.
 */
async function groupView(
  actor: Actor,
  group: GroupThread,
  members: number[],
  ctx: LabelContext,
  t: Awaited<ReturnType<typeof getT>>,
) {
  const [mine] = await db.select({ muted: threadUsers.muted }).from(threadUsers)
    .where(and(eq(threadUsers.threadId, group.id), eq(threadUsers.userId, actor.id)));
  const managesProject = await managesGroupProject(actor, group);
  return {
    kind: group.kind,
    projectId: group.projectId,
    muted: mine?.muted ?? false,
    memberCount: members.length,
    /** پیام‌های گروهِ پروژه ثابت ۹۰ روز؛ بقیه از تنظیمِ سامانه. */
    retentionDays: group.kind === 'project'
      ? PROJECT_GROUP_RETENTION_DAYS
      : (await getSystemConfig()).msgPurgeDays,
    /** چرا نمی‌شود نوشت — برای جملهٔ جای کادرِ نوشتن. */
    readOnly: group.kind === 'project' && group.projectArchived
      ? 'archived' as const
      : !group.allowReply && !isManager(actor) ? 'announce' as const : null,
    canMentionAll: canMentionAll({ kind: group.kind, isManager: isManager(actor), managesProject }),
    mentionables: members
      .filter((id) => id !== actor.id && (ctx.viewerIsManager || !ctx.managerIds.has(id)))
      .map((id) => ({ id, name: personLabel(id, ctx, t) }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

async function loadThread(threadId: number) {
  const rows = await db.select().from(threads).where(eq(threads.id, threadId));
  const thread = rows[0];
  if (!thread) throw new ThreadNotFoundError();

  // ⚠️ برای گروه، ردیف‌های رسید عضویت نیستند — `accessThread` عضویتِ زنده را می‌سنجد.
  const parts = thread.kind === 'direct'
    ? await db.select({ userId: threadUsers.userId }).from(threadUsers).where(eq(threadUsers.threadId, threadId))
    : [];

  return {
    id: thread.id,
    creatorId: thread.creatorId,
    allowReply: thread.allowReply,
    kind: thread.kind,
    participantIds: parts.map((p) => p.userId),
  };
}

/**
 * دسترسیِ یک نفر به یک گفتگو — دونفره با `thread_users`، گروهی با عضویتِ زنده.
 *
 * ⚠️ همهٔ مسیرها (باز کردن، پاسخ، پول، حذف) از همین می‌گذرند تا قاعدهٔ
 * «عضوِ گروه کیست» فقط یک جا باشد.
 */
async function accessThread(actor: Actor, threadId: number) {
  const thread = await loadThread(threadId);
  if (thread.kind === 'direct') {
    return {
      thread, group: null, members: null,
      readable: canRead(thread, actor.id), writable: canReply(thread, actor.id),
    };
  }
  const [group] = await loadGroups([threadId]);
  if (!group) throw new ThreadNotFoundError();
  const members = await groupMemberIds(group);
  const isMember = members.includes(actor.id);
  return {
    thread, group, members,
    readable: isMember,
    writable: canPostInGroup({
      kind: group.kind, isMember, allowReply: group.allowReply,
      isManager: isManager(actor), projectArchived: group.projectArchived,
    }),
  };
}

/** نامِ نمایشیِ گروه — کانال نامِ خودش، گروهِ پروژه نامِ **زندهٔ** پروژه. */
function groupLabel(group: GroupThread): string {
  return group.kind === 'project' ? (group.projectTitle ?? '') : group.title;
}

/** مدیرِ پروژهٔ این گروه است؟ (برای «@همه» و حذفِ گروه.) */
async function managesGroupProject(actor: Actor, group: GroupThread): Promise<boolean> {
  return group.kind === 'project' && group.projectId !== null && canManageProject(actor, group.projectId);
}

/** شناسه‌های منشن‌شده در چند متن — برای ساختنِ برچسب‌هایشان. */
function mentionedIdsIn(bodies: Iterable<string>): number[] {
  const ids = new Set<number>();
  for (const body of bodies) {
    for (const part of splitMentions(body)) if (part.kind === 'mention' && part.id !== 'all') ids.add(part.id);
  }
  return [...ids];
}

/**
 * گیرندگانِ ممکن — اعضا و کارفرمایانِ **فعال**، با نقش (پورتِ
 * `pickable_recipients()`). عضوِ سابق (حتی «فقط مالی»)، مالک و همکاران در
 * فهرست نیستند؛ راهِ رسیدن به مدیریت «پیام به مدیریت» است.
 */
export async function getRecipients(actor: Actor) {
  if (!can(actor, 'messages.send')) throw new ForbiddenError('messages.send');
  return db
    .selectDistinct({ id: users.id, name: users.name, role: userRoles.role })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .where(and(
      inArray(userRoles.role, ['member', 'client']),
      isNull(users.deletedAt),
      eq(users.memberState, 'active'),
      sql`${users.id} <> ${actor.id}`,
    ))
    .orderBy(users.name);
}

/**
 * دادهٔ فیلترِ زندهٔ گیرندگان — دفاتر، پروژه‌ها و عضویت‌ها.
 *
 * ⚠️ یک‌جا و در چند کوئریِ ثابت خوانده می‌شود، نه یکی به‌ازای هر پروژه
 * (R-PERF-01). فیلتر در مرورگر اجرا می‌شود، پس رفت‌وبرگشتِ سرور ندارد.
 */
export async function getRecipientFilterData(actor: Actor) {
  if (!can(actor, 'messages.send')) throw new ForbiddenError('messages.send');

  const [officeRows, projectRows, memberRows, clientRows, officeMemberRows] = await Promise.all([
    db.select({ id: offices.id, name: offices.name })
      .from(offices).where(eq(offices.isActive, true)).orderBy(offices.name),
    db.select({ id: projects.id, title: projects.title, officeId: projects.officeId })
      .from(projects).where(eq(projects.isArchived, false)).orderBy(projects.title),
    db.selectDistinct({ projectId: projectMembers.projectId, userId: projectMembers.userId })
      .from(projectMembers),
    db.select({ projectId: projectClients.projectId, userId: projectClients.userId })
      .from(projectClients),
    db.select({ officeId: userOffices.officeId, userId: userOffices.userId })
      .from(userOffices),
  ]);

  const membersOf = new Map<number, number[]>();
  for (const r of memberRows) {
    const list = membersOf.get(r.projectId) ?? [];
    list.push(r.userId);
    membersOf.set(r.projectId, list);
  }
  const clientsOf = new Map<number, number[]>();
  for (const r of clientRows) {
    const list = clientsOf.get(r.projectId) ?? [];
    list.push(r.userId);
    clientsOf.set(r.projectId, list);
  }
  const officeMembers: Record<number, number[]> = {};
  for (const r of officeMemberRows) {
    (officeMembers[r.officeId] ??= []).push(r.userId);
  }

  return {
    offices: officeRows,
    projects: projectRows.map((p) => ({
      id: p.id,
      title: p.title,
      officeId: p.officeId,
      memberIds: membersOf.get(p.id) ?? [],
      clientIds: clientsOf.get(p.id) ?? [],
    })),
    officeMembers,
  };
}

/**
 * گیرندگانِ یک مخاطبِ آماده («همهٔ اعضا» و …) — فقط برای مدیر.
 * `officeId` فقط با «همهٔ اعضا» معنا دارد: همهٔ اعضای همان دفتر. کارفرما به
 * دفتر تعلق ندارد، پس برای بقیهٔ مخاطب‌ها نادیده گرفته می‌شود.
 */
export async function resolveAudience(
  actor: Actor,
  audience: Audience,
  officeId: number | null = null,
): Promise<number[]> {
  // ⚠️ پخشِ همگانی فقط از مدیر — وگرنه هر عضوی می‌توانست به کلِ تیم پیام بدهد.
  if (!isManager(actor)) throw new ForbiddenError('messages.broadcast');

  const roles: Role[] = audience === 'members'
    ? ['member']
    : audience === 'clients' ? ['client'] : ['member', 'client'];

  // عضوِ سابق — «فقط مالی» هم — هرگز پخشِ همگانی نمی‌گیرد.
  const rows = await db
    .selectDistinct({ id: users.id })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .where(and(
      inArray(userRoles.role, roles),
      isNull(users.deletedAt),
      eq(users.memberState, 'active'),
      audience === 'members' && officeId
        ? inArray(users.id, db.select({ id: userOffices.userId }).from(userOffices)
          .where(eq(userOffices.officeId, officeId)))
        : undefined,
    ));
  return rows.map((r) => r.id);
}

/**
 * اعلانِ پیامِ تازه با نامِ فرستنده — و ماسکِ آن (R-NOTIF-13).
 *
 * ⚠️ اگر فرستنده «مدیریت» است، گیرندگانِ عادی «پیام جدید از مدیریت» می‌بینند
 * و فقط مدیرانِ هم‌رشته (مثلاً مالک روی رشتهٔ همکار) نامِ واقعی را.
 */
async function notifyMessage(
  actor: Actor,
  recipientIds: number[],
  input: { kind: 'new' | 'reply'; body: string; url: string },
): Promise<void> {
  await notifyFrom(actor, recipientIds, {
    type: 'message.received',
    named: input.kind === 'new' ? 'پیام جدید از {name}' : 'پاسخِ تازه از {name}',
    masked: input.kind === 'new' ? 'پیام جدید از مدیریت' : 'پاسخِ تازه از مدیریت',
    body: input.body.slice(0, 120),
    url: input.url,
  });
}

/**
 * اعلانی با نامِ فرستنده، ماسک‌شده برای گیرندهٔ عادی وقتی فرستنده «مدیریت»
 * است (R-NOTIF-13) — مشترکِ پیامِ دونفره، پیامِ گروه و منشن.
 * `named` جای‌نگهدارِ `{name}` دارد؛ `masked` ندارد.
 */
async function notifyFrom(
  actor: Actor,
  recipientIds: number[],
  input: {
    type: string; named: string; masked: string; body: string; url: string;
    params?: Record<string, string | number>; channels?: NotifyInput['channels'];
  },
): Promise<void> {
  const ids = [...new Set(recipientIds.filter((id) => id !== actor.id))];
  if (ids.length === 0) return;

  const [nameRow, mgmt] = await Promise.all([
    db.select({ name: users.name }).from(users).where(eq(users.id, actor.id)),
    managementIds(),
  ]);
  const name = nameRow[0]?.name ?? '';
  const base = { type: input.type, body: input.body, url: input.url, channels: input.channels };

  const plain = mgmt.has(actor.id) ? ids.filter((id) => !mgmt.has(id)) : [];
  const withName = ids.filter((id) => !plain.includes(id));
  if (plain.length > 0) {
    await notify(plain, { ...base, title: input.masked, params: input.params });
  }
  if (withName.length > 0) {
    await notify(withName, { ...base, title: input.named, params: { ...input.params, name } });
  }
}

/**
 * اعلانِ یک پیامِ گروهی.
 *  · منشن: فوری، با تلگرام و ایمیل؛ بی‌صدا کردنِ گروه جلویش را نمی‌گیرد.
 *  · گروهِ پروژه: بقیهٔ اعضا اعلانِ «پیامِ تازه» در برنامه و تلگرام — بی‌ایمیل، و
 *    **جمع‌شده**: کسی که اعلانِ خوانده‌نشدهٔ تازه‌ای از همین گروه دارد دوباره نمی‌گیرد.
 *  · کانالِ تیم: پیامِ عادی هیچ اعلانی ندارد.
 */
async function notifyGroup(
  actor: Actor,
  group: GroupThread,
  members: number[],
  body: string,
  mentions: { ids: number[]; all: boolean },
): Promise<void> {
  const muted = await mutedMembers(group.id);
  const recipients = groupRecipients({
    kind: group.kind, memberIds: members, authorId: actor.id, mutedIds: muted,
    mentionedIds: mentions.ids, mentionAll: mentions.all,
  });

  // متنِ اعلان بی‌توکن؛ مدیرِ منشن‌شده برای همه «مدیریت» است (گیرندگان متفاوت‌اند).
  const mgmt = await managementIds();
  const names = new Map((await db.select({ id: users.id, name: users.name }).from(users)
    .where(inArray(users.id, [...new Set([0, ...mentions.ids])]))).map((r) => [r.id, r.name]));
  const snippet = mentionsToPlain(body, (id) => (mgmt.has(id) ? MANAGEMENT : names.get(id) ?? '#'), ALL_LABEL)
    .slice(0, 120);
  const where = groupLabel(group);
  const url = `/messages/${group.id}`;

  await notifyFrom(actor, recipients.mention, {
    type: 'message.mention',
    named: '{name} در «{where}» از شما نام برد',
    masked: 'مدیریت در «{where}» از شما نام برد',
    params: { where }, body: snippet, url,
  });

  const quiet = await recentlyNotified(group.id, recipients.group);
  await notifyFrom(actor, recipients.group.filter((id) => !quiet.has(id)), {
    type: 'message.group',
    named: 'پیامِ تازه از {name} در گروهِ «{where}»',
    masked: 'پیامِ تازه از مدیریت در گروهِ «{where}»',
    params: { where }, body: snippet, url,
    channels: { email: false },
  });
}

/** متنِ مبدأ؛ اعلان به زبانِ هر گیرنده ترجمه می‌شود. */
const MANAGEMENT = 'مدیریت';
const ALL_LABEL = 'همه';

/**
 * ارسالِ پیامِ نو — برای هر گیرنده یک رشتهٔ دونفره (R-MSG-N1).
 * مهرِ محدودیت فقط پس از ارسالِ **موفق** زده می‌شود.
 */
export async function compose(
  actor: Actor,
  input: { recipientIds: number[]; body: string; allowReply: boolean },
): Promise<number[]> {
  if (!can(actor, 'messages.send')) throw new ForbiddenError('messages.send');

  const body = noMentions(input.body).trim();
  if (body === '') throw new ForbiddenError('message.empty');

  await assertNotRateLimited(actor);

  const [managers, owners] = await Promise.all([managerIds(), ownerIds()]);
  const plan = planCompose(input.recipientIds, {
    senderId: actor.id,
    senderIsManager: isManager(actor),
    managerIds: managers,
    ownerIds: owners,
  });
  if (plan.threads.length === 0) throw new ForbiddenError('message.no_recipients');

  const created = await db.transaction(async (tx) => {
    const ids: number[] = [];
    for (const t of plan.threads) {
      const rows = await tx.insert(threads).values({
        creatorId: actor.id,
        allowReply: input.allowReply,
      }).returning({ id: threads.id });
      const threadId = rows[0]!.id;

      await tx.insert(threadUsers).values(
        t.participantIds.map((userId) => ({ threadId, userId })),
      );
      await tx.insert(messages).values({ threadId, fromUserId: actor.id, body });
      ids.push(threadId);
    }

    // رشته‌های یک ارسالِ چندنفره با شناسهٔ اولی گروه می‌شوند.
    if (plan.isBroadcast && ids.length > 0) {
      await tx.update(threads)
        .set({ broadcastId: ids[0]! })
        .where(inArray(threads.id, ids));
    }
    return ids;
  });

  await touchSent(actor);

  // R-NOTIF-01 — از همان دروازه؛ شکستش ارسالِ پیام را نمی‌شکند.
  for (let i = 0; i < plan.threads.length; i += 1) {
    await notifyMessage(actor, [plan.threads[i]!.recipientId], {
      kind: 'new', body, url: `/messages/${created[i]}`,
    });
  }
  return created;
}

/**
 * «پیام به مدیریت».
 *
 * ⚠️ برخلافِ ارسالِ عادی، **یک** رشتهٔ مشترک ساخته می‌شود که همهٔ مدیران در
 * آن هستند، نه یک رشته به‌ازای هر مدیر. دلیلش این است که این یک گفتگوی
 * واحد است: هر مدیری جوابِ بقیه را می‌بیند و کار دوباره انجام نمی‌شود.
 *
 * ⚠️ مجوزِ `messages.send` لازم **نیست** — کسی که حق ندارد گیرنده انتخاب
 * کند هم باید بتواند به مدیریت پیام بدهد. ولی محدودیتِ زمانی همان است.
 */
export async function contactManagement(actor: Actor, body: string): Promise<number> {
  const text = noMentions(body).trim();
  if (text === '') throw new ForbiddenError('message.empty');

  await assertNotRateLimited(actor);

  // ⚠️ خودِ فرستنده از فهرست کنار می‌رود — مدیری که به مدیریت پیام می‌دهد
  // نباید رشته‌ای با خودش بسازد.
  const managers = (await managerIds()).filter((id) => id !== actor.id);
  if (managers.length === 0) throw new ForbiddenError('message.no_recipients');

  const threadId = await db.transaction(async (tx) => {
    const rows = await tx.insert(threads).values({
      creatorId: actor.id,
      allowReply: true,
    }).returning({ id: threads.id });
    const id = rows[0]!.id;

    await tx.insert(threadUsers).values(
      [actor.id, ...managers].map((userId) => ({ threadId: id, userId })),
    );
    await tx.insert(messages).values({ threadId: id, fromUserId: actor.id, body: text });
    return id;
  });

  await touchSent(actor);

  await notify(managers, {
    type: 'message.received',
    title: 'پیام به مدیریت',
    body: text.slice(0, 120),
    url: `/messages/${threadId}`,
  });

  return threadId;
}

/**
 * پاسخ در یک گفتگو.
 *
 * ⚠️ R-MSG-09 — پاسخ **محدودیتِ زمانی ندارد**؛ فقط ارسالِ نو دارد. پیش از این
 * کاربری که همین حالا چیزی فرستاده بود تا ۳۰ ثانیه نمی‌توانست جواب بدهد و
 * گفتگوی روان می‌شکست.
 */
export async function reply(actor: Actor, threadId: number, body: string): Promise<number> {
  const access = await accessThread(actor, threadId);
  if (!access.readable) throw new ThreadNotFoundError();
  const { thread, group } = access;
  if (!access.writable) {
    // ⚠️ گروهِ پروژهٔ بایگانی‌شده فقط‌خواندنی است — پیامِ روشن، نه «اعلانِ یک‌طرفه».
    if (group?.kind === 'project' && group.projectArchived) throw new ChannelError('archived');
    // ⚠️ اعلانِ یک‌طرفه پاسخ نمی‌پذیرد — گاردِ سرور، نه فقط پنهان‌کردنِ فرم.
    throw new ForbiddenError('thread.no_reply');
  }

  /*
   * ⚠️ سرور به منشن‌های فرستاده‌شده اعتماد نمی‌کند: در گروه فقط عضوِ همان
   * گروه منشن می‌شود و «همه» فقط از کسی که اجازه دارد؛ در گفتگوی دونفره
   * منشن معنا ندارد و هر توکنی متنِ ساده می‌شود.
   */
  const clean = group
    ? sanitizeMentions(body, {
      memberIds: new Set(access.members),
      allowAll: canMentionAll({ kind: group.kind, isManager: isManager(actor), managesProject: await managesGroupProject(actor, group) }),
    })
    : { body: noMentions(body), ids: [], all: false };
  const text = clean.body.trim();
  if (text === '') throw new ForbiddenError('message.empty');

  const rows = await db.insert(messages)
    .values({ threadId, fromUserId: actor.id, body: text })
    .returning({ id: messages.id });

  // گفتگو با هر پیام بالا می‌آید (ترتیبِ صندوق). ⚠️ ساعتِ **دیتابیس**، نه Node:
  // ساختِ رشته با now() ِ دیتابیس مهر می‌خورد و دو ساعتِ متفاوت ترتیب را به‌هم می‌زد.
  await db.update(threads).set({ updatedAt: sql`now()` }).where(eq(threads.id, threadId));

  if (group) {
    await notifyGroup(actor, group, access.members ?? [], text, clean);
  } else {
    // همهٔ شرکت‌کنندگان جز خودِ نویسنده.
    await notifyMessage(actor, thread.participantIds, {
      kind: 'reply', body: text, url: `/messages/${threadId}`,
    });
  }
  return rows[0]!.id;
}

/** توکنِ منشن در جایی که منشن ندارد (گفتگوی دونفره) متنِ ساده می‌شود. */
function noMentions(body: string): string {
  return sanitizeMentions(body, { memberIds: new Set(), allowAll: false }).body;
}

/**
 * حذفِ گفتگو — فقط از **صندوقِ خودم**.
 * ⚠️ رشته و پیام‌ها می‌مانند تا طرفِ مقابل گفتگویش را از دست ندهد.
 * اعلانِ همان گفتگو هم می‌رود، وگرنه در زنگوله می‌ماند و به رشته‌ای اشاره
 * می‌کند که دیگر در صندوق نیست.
 */
export async function leaveThread(actor: Actor, threadId: number) {
  const thread = await loadThread(threadId);
  // ⚠️ از گروه نمی‌شود «بیرون رفت» — عضویت از پروژه/نقش/دفتر می‌آید؛ راهش بی‌صدا کردن است.
  if (thread.kind !== 'direct') throw new ForbiddenError('thread.group_leave');
  if (!canRead(thread, actor.id)) throw new ThreadNotFoundError();
  await db.delete(threadUsers)
    .where(and(eq(threadUsers.threadId, threadId), eq(threadUsers.userId, actor.id)));
  await db.delete(notifications)
    .where(and(eq(notifications.userId, actor.id), eq(notifications.url, `/messages/${threadId}`)));
}

/**
 * حذفِ **کلِ** گفتگو برای همه — سازنده یا مدیر (R-MSG-11، پورتِ
 * `Messages::delete()`). گیرندهٔ عادی این را ندارد؛ او فقط از صندوقِ خودش
 * کنار می‌گذارد (`leaveThread`).
 */
export async function deleteThread(actor: Actor, threadId: number) {
  const access = await accessThread(actor, threadId);
  if (!access.readable) throw new ThreadNotFoundError();
  const { thread, group } = access;
  // کانالِ تیم: فقط مدیر. گروهِ پروژه: مدیر یا مدیرِ همان پروژه. دونفره: سازنده یا مدیر.
  const allowed = group
    ? isManager(actor) || await managesGroupProject(actor, group)
    : thread.creatorId === actor.id || isManager(actor);
  if (!allowed) throw new ForbiddenError('thread.delete');

  await db.transaction(async (tx) => {
    await tx.delete(messages).where(eq(messages.threadId, threadId));
    await tx.delete(threadUsers).where(eq(threadUsers.threadId, threadId));
    await tx.delete(threads).where(eq(threads.id, threadId));
    await tx.delete(notifications).where(eq(notifications.url, `/messages/${threadId}`));
  });
}

async function assertNotRateLimited(actor: Actor) {
  const rows = await db.select({ at: users.lastMessageSentAt })
    .from(users).where(eq(users.id, actor.id));
  const last = rows[0]?.at ?? null;
  const now = new Date();
  if (isRateLimited(last, now)) throw new RateLimitedError(cooldownRemaining(last, now));
}

async function touchSent(actor: Actor) {
  await db.update(users)
    .set({ lastMessageSentAt: new Date() })
    .where(eq(users.id, actor.id));
}

/* ------------------------------------------------------------------ *
 * پاک‌سازیِ خودکار
 * ------------------------------------------------------------------ */

/**
 * حذفِ پیام‌های کهنه.
 *
 * ⚠️ دو مرحله، و ترتیبش مهم است:
 *  ۱. گفت‌وگویی که **آخرین** پیامش هم کهنه است (یا اصلاً پیامی ندارد) کامل
 *     می‌رود: پیام‌ها + مشارکت‌کننده‌ها + خودِ گفت‌وگو. وگرنه ردیف‌های یتیم
 *     در `thread_users` می‌مانند.
 *  ۲. گفت‌وگویِ **زنده** فقط پیام‌های کهنه‌اش هرس می‌شود؛ پیام‌های اخیرش
 *     سرِ جایشان می‌مانند. حذفِ کلِ گفت‌وگویی که همین دیروز در آن حرف زده‌اند
 *     دادهٔ زنده را می‌برد.
 *
 * @returns تعدادِ پیام‌های حذف‌شده.
 */
export async function purgeMessages(days: number): Promise<number> {
  /*
   * ⚠️ گروهِ پروژه قاعدهٔ خودش را دارد: پیام‌هایش ثابت ۹۰ روز می‌مانند، حتی
   * اگر پاک‌سازیِ بقیه «هرگز» باشد. خودِ گروه (و کانالِ تیم) هیچ‌وقت با پاک‌سازی
   * نمی‌رود — ظرفِ دائمی است؛ فقط پیام‌های کهنه‌اش هرس می‌شوند.
   */
  const projectCutoff = new Date(Date.now() - PROJECT_GROUP_RETENTION_DAYS * 86400000);
  const projectTrimmed = await db.delete(messages)
    .where(and(
      lt(messages.createdAt, projectCutoff),
      sql`${messages.threadId} in (select id from threads where kind = 'project')`,
    ))
    .returning({ id: messages.id });

  // ⚠️ صفر یعنی «هرگز» — نه «همین حالا همه را پاک کن».
  if (days <= 0) return projectTrimmed.length;

  const cutoff = new Date(Date.now() - days * 86400000);

  // ⚠️ حذفِ کاملِ رشته فقط برای گفتگوی دونفره — کانال و گروه با کهنه شدن نمی‌روند.
  const stale = await db
    .select({ id: threads.id })
    .from(threads)
    .where(and(eq(threads.kind, 'direct'), sql`coalesce(
      (select max(m.created_at) from ${messages} m where m.thread_id = ${threads.id}),
      '1000-01-01'::timestamp
    ) < ${cutoff.toISOString()}::timestamptz`));

  const staleIds = stale.map((t) => t.id);
  if (staleIds.length > 0) {
    await db.delete(messages).where(inArray(messages.threadId, staleIds));
    await db.delete(threadUsers).where(inArray(threadUsers.threadId, staleIds));
    await db.delete(threads).where(inArray(threads.id, staleIds));
    /**
     * ⚠️ اعلانِ گفتگوی پاک‌شده هم باید برود، وگرنه در زنگوله می‌ماند و به
     * رشته‌ای اشاره می‌کند که دیگر نیست: کلیک، صندوقِ خالی باز می‌کند.
     * پاک‌سازیِ خودکار سه ردیف از همین شکل در دیتابیس جا گذاشته بود.
     */
    await db.delete(notifications).where(inArray(
      notifications.url,
      staleIds.map((id) => `/messages/${id}`),
    ));
  }

  // دونفره و کانالِ تیم با تنظیمِ سامانه؛ گروهِ پروژه بالاتر جدا هرس شد.
  const trimmed = await db.delete(messages)
    .where(and(
      lt(messages.createdAt, cutoff),
      sql`${messages.threadId} in (select id from threads where kind <> 'project')`,
    ))
    .returning({ id: messages.id });

  return trimmed.length + projectTrimmed.length;
}

/**
 * پولِ سبکِ گفت‌وگو.
 *
 * ⚠️ اگر اثرانگشت عوض نشده باشد، **هیچ داده‌ای** برنمی‌گردد. این مسیر هر
 * چند ثانیه از هر تبِ باز صدا زده می‌شود؛ برگرداندنِ کلِ گفت‌وگو در حالتِ
 * «تغییری نیست» همان هزینه‌ای است که پول را گران می‌کند.
 *
 * ⚠️ رسیدِ خواندن فقط در حالتِ **تغییر** جلو می‌رود — گفت‌وگویی که روی صفحه
 * باز است و پیامِ تازه گرفته، واقعاً خوانده شده. نسخهٔ قبلی هم همین کار را
 * می‌کند — و اعلانِ زنگوله‌اش هم همان‌جا خوانده می‌شود.
 */
export async function pollThread(actor: Actor, threadId: number, fingerprint: string) {
  const config = await getSystemConfig();
  // R-ARCH-01 — گاردِ سرور، نه فقط سوارنشدنِ کامپوننت.
  if (!config.chatPollEnabled) return { off: true as const, changed: false as const };

  const access = await accessThread(actor, threadId);
  if (!access.readable) throw new ThreadNotFoundError();

  const [maxRow, states] = await Promise.all([
    db.select({ maxId: sql<number>`coalesce(max(${messages.id}), 0)::int` })
      .from(messages).where(eq(messages.threadId, threadId)),
    db.select({ userId: threadUsers.userId, lastReadMessageId: threadUsers.lastReadMessageId })
      .from(threadUsers).where(eq(threadUsers.threadId, threadId)),
  ]);

  const fp = streamFingerprint({
    maxMessageId: maxRow[0]?.maxId ?? 0,
    readStates: states,
    viewerId: actor.id,
  });

  if (fp === fingerprint) return { off: false as const, changed: false as const, fingerprint: fp };

  const rows = await db
    .select({
      id: messages.id,
      body: messages.body,
      createdAt: messages.createdAt,
      fromUserId: messages.fromUserId,
    })
    .from(messages)
    .where(eq(messages.threadId, threadId))
    .orderBy(asc(messages.id));

  const lastId = rows.at(-1)?.id;
  if (lastId) {
    await db.update(threadUsers)
      .set({ lastReadMessageId: lastId, updatedAt: new Date() })
      .where(and(eq(threadUsers.threadId, threadId), eq(threadUsers.userId, actor.id)));
  }
  await markReadForTarget(actor, '/messages', threadId);

  const t = await getT();
  const mentioned = mentionedIdsIn(rows.map((r) => r.body));
  const ctx = await labelContext(actor, [...rows.map((r) => r.fromUserId), ...mentioned]);

  return {
    off: false as const,
    changed: true as const,
    fingerprint: fp,
    messages: rows.map((m) => ({ ...m, fromName: personLabel(m.fromUserId, ctx, t) })),
    readUpTo: readUpTo(states, actor.id),
    mentionNames: Object.fromEntries(mentioned.map((id) => [id, personLabel(id, ctx, t)])) as Record<number, string>,
  };
}

/**
 * شمارِ پیامِ خوانده‌نشده — همان تعریفِ صندوق و مسیرِ نبض.
 *
 * ⚠️ یک کوئری، نه پیمایشِ صندوق: این عدد در **هر** بارگذاریِ صفحه خوانده
 * می‌شود (بجِ سایدبار)، پس باید ارزان بماند.
 */
export async function unreadMessageCount(actor: Actor): Promise<number> {
  /*
   * ⚠️ گروهِ بی‌صدا شمرده نمی‌شود، و گروهی که این نفر دیگر عضوش نیست (ردیفِ
   * رسیدش مانده) هم نه. عضویت فقط وقتی سنجیده می‌شود که اصلاً پیامِ گروهیِ
   * خوانده‌نشده‌ای باشد — مسیرِ معمولِ صفحه همان یک کوئری می‌ماند.
   */
  const rows = await db.execute(sql`
    select tu.thread_id, t.kind, count(m.id)::int as n
    from thread_users tu
    join threads t on t.id = tu.thread_id
    join messages m on m.thread_id = tu.thread_id
      and m.id > coalesce(tu.last_read_message_id, 0)
      and m.from_user_id <> ${actor.id}
    where tu.user_id = ${actor.id} and not tu.muted
    group by tu.thread_id, t.kind
  `);
  const list = (rows as unknown as Array<{ thread_id: number; kind: string; n: number }>)
    .map((r) => ({ threadId: Number(r.thread_id), kind: r.kind, n: Number(r.n) }));

  const groupIds = list.filter((r) => r.kind !== 'direct').map((r) => r.threadId);
  const visible = groupIds.length > 0
    ? new Set((await groupsVisibleTo(actor, await loadGroups(groupIds))).map((g) => g.id))
    : new Set<number>();
  return list.reduce((sum, r) => sum + (r.kind === 'direct' || visible.has(r.threadId) ? r.n : 0), 0);
}


/* ------------------------------------------------------------------ *
 * کانالِ تیم و گروهِ پروژه
 * ------------------------------------------------------------------ */

/** گزینه‌های فرمِ «کانالِ تازه» — فقط برای مدیر. */
export async function channelFormOptions(actor: Actor) {
  if (!isManager(actor)) throw new ForbiddenError('messages.channel');
  return channelAudienceOptions();
}

/**
 * ساختِ کانالِ تیم — فقط مالک و ادمین.
 *
 * ⚠️ مخاطب سمتِ سرور سنجیده می‌شود: تگی که «نقشِ عضو» نیست یا دفترِ غیرفعال
 * پذیرفته نمی‌شود، وگرنه کانالی ساخته می‌شد که هیچ‌کس جز مدیر عضوش نیست.
 * عضوها خبرِ «به کانال اضافه شدید» را فقط داخلِ برنامه می‌گیرند — کانالِ تیم
 * طبقِ قاعده‌اش برای پیامِ عادی تلگرام و ایمیل نمی‌فرستد.
 */
export async function createChannel(
  actor: Actor,
  input: { title: string; audience: unknown; allowReply: boolean; body?: string },
): Promise<number> {
  if (!isManager(actor)) throw new ForbiddenError('messages.channel');
  const title = normalizeChannelTitle(input.title);
  const audience = normalizeAudience(input.audience);
  if (!audience) throw new ChannelError('audience_invalid');
  const options = await channelAudienceOptions();
  if (audience.type === 'role' && !options.roleTags.some((r) => r.id === audience.tagId)) {
    throw new ChannelError('audience_invalid');
  }
  if (audience.type === 'office' && !options.offices.some((o) => o.id === audience.officeId)) {
    throw new ChannelError('audience_invalid');
  }

  const first = noMentions(input.body ?? '').trim();
  const threadId = await db.transaction(async (tx) => {
    const [row] = await tx.insert(threads).values({
      creatorId: actor.id, allowReply: input.allowReply, kind: 'channel', title, audience,
    }).returning({ id: threads.id });
    if (first) await tx.insert(messages).values({ threadId: row!.id, fromUserId: actor.id, body: first });
    return row!.id;
  });

  const group: GroupThread = {
    id: threadId, kind: 'channel', title, audience, projectId: null, projectTitle: null,
    projectArchived: false, projectOfficeId: null, creatorId: actor.id, allowReply: input.allowReply,
  };
  const members = await groupMemberIds(group);
  // رسیدِ خواندن برای عضوهای امروز — پیامِ اول برایشان «خوانده‌نشده» است.
  if (members.length > 0) {
    await db.insert(threadUsers).values(members.map((userId) => ({ threadId, userId })))
      .onConflictDoNothing();
  }
  await notifyFrom(actor, members, {
    type: 'message.channel',
    named: 'به کانالِ «{where}» اضافه شدید',
    masked: 'به کانالِ «{where}» اضافه شدید',
    params: { where: title }, body: first.slice(0, 120), url: `/messages/${threadId}`,
    channels: { email: false, telegram: false },
  });
  return threadId;
}

/**
 * ساختِ گروهِ گفتگوی یک پروژه — مدیر یا مدیرِ همان پروژه.
 *
 * ⚠️ یکی به‌ازای هر پروژه: اگر هست همان برمی‌گردد (دو کلیکِ هم‌زمان را شاخصِ
 * یکتای دیتابیس هم می‌گیرد). پروژهٔ بایگانی‌شده یا حذف‌شده گروهِ تازه نمی‌گیرد.
 */
export async function createProjectGroup(actor: Actor, projectId: number): Promise<number> {
  const [project] = await db.select({
    id: projects.id, title: projects.title, isArchived: projects.isArchived,
    officeId: projects.officeId, deletedAt: projects.deletedAt,
  }).from(projects).where(eq(projects.id, projectId));
  if (!project || project.deletedAt) throw new ThreadNotFoundError();
  if (!(isManager(actor) || await canManageProject(actor, projectId))) {
    throw new ForbiddenError('messages.project_group');
  }
  if (project.isArchived) throw new ChannelError('archived');

  const [existing] = await db.select({ id: threads.id }).from(threads)
    .where(and(eq(threads.kind, 'project'), eq(threads.projectId, projectId)));
  if (existing) return existing.id;

  const inserted = await db.insert(threads).values({
    creatorId: actor.id, allowReply: true, kind: 'project', projectId,
  }).onConflictDoNothing().returning({ id: threads.id });
  if (inserted.length === 0) {
    // کسِ دیگری همین لحظه ساخت — همان را بده.
    const [again] = await db.select({ id: threads.id }).from(threads)
      .where(and(eq(threads.kind, 'project'), eq(threads.projectId, projectId)));
    return again!.id;
  }
  const threadId = inserted[0]!.id;

  const group: GroupThread = {
    id: threadId, kind: 'project', title: '', audience: null, projectId,
    projectTitle: project.title, projectArchived: false, projectOfficeId: project.officeId,
    creatorId: actor.id, allowReply: true,
  };
  const members = await groupMemberIds(group);
  if (members.length > 0) {
    await db.insert(threadUsers).values(members.map((userId) => ({ threadId, userId })))
      .onConflictDoNothing();
  }
  // مثلِ هر خبرِ گروهِ پروژه: در برنامه و تلگرام، بی‌ایمیل.
  await notifyFrom(actor, members, {
    type: 'message.group',
    named: 'گروهِ گفتگوی «{where}» باز شد',
    masked: 'گروهِ گفتگوی «{where}» باز شد',
    params: { where: project.title }, body: '', url: `/messages/${threadId}`,
    channels: { email: false },
  });
  return threadId;
}

/** بی‌صدا کردن یا برداشتنِ آن — فقط برای خودِ این نفر و فقط در گروهی که عضوش است. */
export async function setThreadMuted(actor: Actor, threadId: number, muted: boolean): Promise<void> {
  const access = await accessThread(actor, threadId);
  if (!access.readable || !access.group) throw new ThreadNotFoundError();
  await ensureReadRows(actor.id, [threadId]);
  await db.update(threadUsers).set({ muted, updatedAt: new Date() })
    .where(and(eq(threadUsers.threadId, threadId), eq(threadUsers.userId, actor.id)));
}

/**
 * حذفِ یک پیام در گروه — نویسنده پیامِ خودش را، مدیر (و مدیرِ پروژه در گروهِ
 * همان پروژه) هر پیامی را. ⚠️ در گفتگوی دونفره نیست؛ آنجا قاعدهٔ قبلی
 * (حذفِ کلِ گفتگو) سرِ جایش است.
 */
export async function deleteGroupMessage(actor: Actor, messageId: number): Promise<number> {
  const [row] = await db.select({ threadId: messages.threadId, fromUserId: messages.fromUserId })
    .from(messages).where(eq(messages.id, messageId));
  if (!row) throw new ThreadNotFoundError();
  const access = await accessThread(actor, row.threadId);
  if (!access.readable || !access.group) throw new ThreadNotFoundError();
  const allowed = row.fromUserId === actor.id || isManager(actor) || await managesGroupProject(actor, access.group);
  if (!allowed) throw new ForbiddenError('message.delete');
  await db.delete(messages).where(eq(messages.id, messageId));
  return row.threadId;
}

/**
 * خلاصهٔ گروهِ یک پروژه برای صفحهٔ همان پروژه — هست؟ عضوم؟ می‌توانم بسازم؟
 * ⚠️ کارفرما و غیرعضو چیزی نمی‌گیرند (`null`) — حتی وجودِ گروه را.
 */
export async function projectGroupSummary(actor: Actor, projectId: number) {
  const [row] = await db.select({ id: threads.id }).from(threads)
    .where(and(eq(threads.kind, 'project'), eq(threads.projectId, projectId)));
  if (row) {
    const [group] = await groupsVisibleTo(actor, await loadGroups([row.id]));
    if (!group) return null;
    await ensureReadRows(actor.id, [row.id]);
    const unread = await db.execute(sql`
      select count(m.id)::int as n from thread_users tu
      join messages m on m.thread_id = tu.thread_id and m.id > coalesce(tu.last_read_message_id, 0)
        and m.from_user_id <> ${actor.id}
      where tu.thread_id = ${row.id} and tu.user_id = ${actor.id}
    `);
    return {
      threadId: row.id as number | null,
      unread: Number((unread as unknown as Array<{ n: number }>)[0]?.n ?? 0),
      canCreate: false,
      archived: group.projectArchived,
    };
  }
  const [project] = await db.select({ isArchived: projects.isArchived, deletedAt: projects.deletedAt })
    .from(projects).where(eq(projects.id, projectId));
  if (!project || project.deletedAt) return null;
  const canCreate = !project.isArchived && (isManager(actor) || await canManageProject(actor, projectId));
  return canCreate ? { threadId: null as number | null, unread: 0, canCreate: true, archived: false } : null;
}
