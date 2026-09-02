import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { getSystemConfig } from '@/server/settings/system-service';
import { db } from '@/db/client';
import {
  messages, notifications, offices, projectClients, projectMembers, projects, threads,
  threadUsers, userOffices, userRoles, users,
} from '@/db/schema';
import { can, type Actor, type Role } from '@/domain/access/permissions';
import { ForbiddenError } from '@/domain/access/guard';
import {
  canRead, canReply, cooldownRemaining, isRateLimited, planCompose,
  streamFingerprint, type Audience,
} from '@/domain/messaging/threads';
import { notify } from '@/server/notifications/service';

/**
 * سرویسِ پیام‌ها.
 *
 * ⚠️ صندوقِ پیام کاملاً شخصی است: هیچ کوئری‌ای «همهٔ گفتگوها» را نمی‌خواند؛
 * همیشه از `thread_users` ِ خودِ کاربر شروع می‌شود (R-MSG-02).
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

/** شناسهٔ مدیران — هم‌مالکیِ رشتهٔ همکار (R-MSG-N3). */
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

async function managerIds(): Promise<number[]> {
  const rows = await db
    .selectDistinct({ id: users.id })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .where(and(inArray(userRoles.role, ['owner', 'admin']), isNull(users.deletedAt)));
  return rows.map((r) => r.id);
}

function isManager(actor: Actor): boolean {
  return actor.roles.includes('owner') || actor.roles.includes('admin');
}

/**
 * صندوقِ پیام — آخرین پیامِ هر رشته و شمارِ خوانده‌نشده.
 *
 * ⚠️ R-PERF-01 — سه کوئریِ ثابت، نه یکی به‌ازای هر رشته. در نسخهٔ قبلی همین
 * صفحه یک بار به‌خاطرِ کوئری‌های داخلِ حلقه بازنویسی شد.
 */
export async function listInbox(actor: Actor) {
  const myThreads = await db
    .select({
      threadId: threads.id,
      creatorId: threads.creatorId,
      allowReply: threads.allowReply,
      broadcastId: threads.broadcastId,
      lastReadMessageId: threadUsers.lastReadMessageId,
    })
    .from(threadUsers)
    .innerJoin(threads, eq(threads.id, threadUsers.threadId))
    .where(eq(threadUsers.userId, actor.id))
    .orderBy(desc(threads.id));

  if (myThreads.length === 0) return { threads: [], canSend: can(actor, 'messages.send') };
  const ids = myThreads.map((t) => t.threadId);

  const [lastMessages, unreadCounts, participants] = await Promise.all([
    // آخرین پیامِ هر رشته — یک کوئری با distinct on.
    db.execute(sql`
      select distinct on (m.thread_id)
        m.thread_id, m.id, m.body, m.created_at, m.from_user_id, u.name as from_name
      from messages m
      left join users u on u.id = m.from_user_id
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
      .select({ threadId: threadUsers.threadId, userId: users.id, name: users.name })
      .from(threadUsers)
      .innerJoin(users, eq(users.id, threadUsers.userId))
      .where(inArray(threadUsers.threadId, ids)),
  ]);

  const last = new Map(
    (lastMessages as unknown as Array<{
      thread_id: number; id: number; body: string; created_at: Date;
      from_user_id: number; from_name: string | null;
    }>).map((r) => [Number(r.thread_id), r]),
  );
  const unread = new Map(
    (unreadCounts as unknown as Array<{ thread_id: number; unread: number }>)
      .map((r) => [Number(r.thread_id), Number(r.unread)]),
  );

  const others = new Map<number, Array<{ userId: number; name: string }>>();
  for (const p of participants) {
    if (p.userId === actor.id) continue; // «مخاطب» یعنی بقیه، نه خودم.
    const list = others.get(p.threadId) ?? [];
    list.push({ userId: p.userId, name: p.name });
    others.set(p.threadId, list);
  }

  return {
    threads: myThreads.map((t) => ({
      id: t.threadId,
      allowReply: t.allowReply,
      broadcastId: t.broadcastId,
      isMine: t.creatorId === actor.id,
      counterparts: others.get(t.threadId) ?? [],
      lastBody: last.get(t.threadId)?.body ?? '',
      lastAt: last.get(t.threadId)?.created_at ?? null,
      lastFromName: last.get(t.threadId)?.from_name ?? null,
      unread: unread.get(t.threadId) ?? 0,
    })),
    canSend: can(actor, 'messages.send'),
  };
}

/** یک گفتگو با پیام‌هایش — و علامت‌زدنِ خوانده‌شده. */
export async function openThread(actor: Actor, threadId: number) {
  const thread = await loadThread(threadId);
  if (!canRead(thread, actor.id)) throw new ThreadNotFoundError();

  const rows = await db
    .select({
      id: messages.id,
      body: messages.body,
      createdAt: messages.createdAt,
      fromUserId: messages.fromUserId,
      fromName: users.name,
    })
    .from(messages)
    .leftJoin(users, eq(users.id, messages.fromUserId))
    .where(eq(messages.threadId, threadId))
    .orderBy(asc(messages.id));

  // رسیدِ خواندن تا آخرین پیام جلو می‌رود.
  const lastId = rows.at(-1)?.id;
  if (lastId) {
    await db.update(threadUsers)
      .set({ lastReadMessageId: lastId, updatedAt: new Date() })
      .where(and(eq(threadUsers.threadId, threadId), eq(threadUsers.userId, actor.id)));
  }

  return {
    thread: { id: thread.id, allowReply: thread.allowReply, creatorId: thread.creatorId },
    messages: rows,
    canReply: canReply(thread, actor.id),
  };
}

async function loadThread(threadId: number) {
  const rows = await db.select().from(threads).where(eq(threads.id, threadId));
  const thread = rows[0];
  if (!thread) throw new ThreadNotFoundError();

  const parts = await db.select({ userId: threadUsers.userId })
    .from(threadUsers).where(eq(threadUsers.threadId, threadId));

  return {
    id: thread.id,
    creatorId: thread.creatorId,
    allowReply: thread.allowReply,
    participantIds: parts.map((p) => p.userId),
  };
}

/** گیرندگانِ ممکن — با مجوزِ ارسال، هر کاربرِ فعالِ دیگری. */
export async function getRecipients(actor: Actor) {
  if (!can(actor, 'messages.send')) throw new ForbiddenError('messages.send');
  return db
    .selectDistinct({ id: users.id, name: users.name, role: userRoles.role })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .where(and(
      isNull(users.deletedAt),
      sql`${users.memberState} <> 'locked'`,
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

/** گیرندگانِ یک مخاطبِ آماده («همهٔ اعضا» و …) — فقط برای مدیر. */
export async function resolveAudience(actor: Actor, audience: Audience): Promise<number[]> {
  // ⚠️ پخشِ همگانی فقط از مدیر — وگرنه هر عضوی می‌توانست به کلِ تیم پیام بدهد.
  if (!isManager(actor)) throw new ForbiddenError('messages.broadcast');

  const roles: Role[] = audience === 'members'
    ? ['member']
    : audience === 'clients' ? ['client'] : ['member', 'client'];

  const rows = await db
    .selectDistinct({ id: users.id })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .where(and(
      inArray(userRoles.role, roles),
      isNull(users.deletedAt),
      sql`${users.memberState} <> 'locked'`,
    ));
  return rows.map((r) => r.id);
}

/**
 * ارسالِ پیامِ نو — برای هر گیرنده یک رشتهٔ دونفره (R-MSG-N1).
 * مهرِ محدودیت فقط پس از ارسالِ **موفق** زده می‌شود.
 */
export async function compose(
  actor: Actor,
  input: { recipientIds: number[]; body: string; allowReply: boolean },
): Promise<number[]> {
  if (!can(actor, 'messages.send')) throw new ForbiddenError('messages.send');

  const body = input.body.trim();
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
    await notify([plan.threads[i]!.recipientId], {
      type: 'message.received',
      title: 'پیامِ تازه',
      body: body.slice(0, 120),
      url: `/messages/${created[i]}`,
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
  const text = body.trim();
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

/** پاسخ در یک گفتگو. */
export async function reply(actor: Actor, threadId: number, body: string): Promise<number> {
  const thread = await loadThread(threadId);
  if (!canRead(thread, actor.id)) throw new ThreadNotFoundError();
  // ⚠️ اعلانِ یک‌طرفه پاسخ نمی‌پذیرد — گاردِ سرور، نه فقط پنهان‌کردنِ فرم.
  if (!canReply(thread, actor.id)) throw new ForbiddenError('thread.no_reply');

  const text = body.trim();
  if (text === '') throw new ForbiddenError('message.empty');

  await assertNotRateLimited(actor);

  const rows = await db.insert(messages)
    .values({ threadId, fromUserId: actor.id, body: text })
    .returning({ id: messages.id });

  await touchSent(actor);

  // همهٔ شرکت‌کنندگان جز خودِ نویسنده.
  await notify(thread.participantIds.filter((id) => id !== actor.id), {
    type: 'message.received',
    title: 'پاسخِ تازه',
    body: text.slice(0, 120),
    url: `/messages/${threadId}`,
  });
  return rows[0]!.id;
}

/**
 * حذفِ گفتگو — فقط از **صندوقِ خودم**.
 * ⚠️ رشته و پیام‌ها می‌مانند تا طرفِ مقابل گفتگویش را از دست ندهد.
 */
export async function leaveThread(actor: Actor, threadId: number) {
  const thread = await loadThread(threadId);
  if (!canRead(thread, actor.id)) throw new ThreadNotFoundError();
  await db.delete(threadUsers)
    .where(and(eq(threadUsers.threadId, threadId), eq(threadUsers.userId, actor.id)));
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
  // ⚠️ صفر یعنی «هرگز» — نه «همین حالا همه را پاک کن».
  if (days <= 0) return 0;

  const cutoff = new Date(Date.now() - days * 86400000);

  const stale = await db
    .select({ id: threads.id })
    .from(threads)
    .where(sql`coalesce(
      (select max(m.created_at) from ${messages} m where m.thread_id = ${threads.id}),
      '1000-01-01'::timestamp
    ) < ${cutoff}`);

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

  const trimmed = await db.delete(messages)
    .where(sql`${messages.createdAt} < ${cutoff}`)
    .returning({ id: messages.id });

  return trimmed.length;
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
 * می‌کند.
 */
export async function pollThread(actor: Actor, threadId: number, fingerprint: string) {
  const config = await getSystemConfig();
  // R-ARCH-01 — گاردِ سرور، نه فقط سوارنشدنِ کامپوننت.
  if (!config.chatPollEnabled) return { off: true as const, changed: false as const };

  const thread = await loadThread(threadId);
  if (!canRead(thread, actor.id)) throw new ThreadNotFoundError();

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
      fromName: users.name,
    })
    .from(messages)
    .leftJoin(users, eq(users.id, messages.fromUserId))
    .where(eq(messages.threadId, threadId))
    .orderBy(asc(messages.id));

  const lastId = rows.at(-1)?.id;
  if (lastId) {
    await db.update(threadUsers)
      .set({ lastReadMessageId: lastId, updatedAt: new Date() })
      .where(and(eq(threadUsers.threadId, threadId), eq(threadUsers.userId, actor.id)));
  }

  return { off: false as const, changed: true as const, fingerprint: fp, messages: rows };
}

/**
 * شمارِ پیامِ خوانده‌نشده — همان تعریفِ صندوق و مسیرِ نبض.
 *
 * ⚠️ یک کوئری، نه پیمایشِ صندوق: این عدد در **هر** بارگذاریِ صفحه خوانده
 * می‌شود (بجِ سایدبار)، پس باید ارزان بماند.
 */
export async function unreadMessageCount(actor: Actor): Promise<number> {
  const rows = await db.execute(sql`
    select count(m.id)::int as n
    from thread_users tu
    join messages m on m.thread_id = tu.thread_id
      and m.id > coalesce(tu.last_read_message_id, 0)
      and m.from_user_id <> ${actor.id}
    where tu.user_id = ${actor.id}
  `);
  return Number((rows as unknown as Array<{ n: number }>)[0]?.n ?? 0);
}
