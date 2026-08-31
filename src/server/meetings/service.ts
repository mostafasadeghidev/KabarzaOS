import { tagName } from '@/db/tag-name';
import { currentLocale } from '@/i18n/server';
import { and, asc, eq, gte, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  auditLog, meetingAttendees, meetings, offices, projectClients, projectMembers,
  projects, reminders, tags, userOffices, userRoles, users,
} from '@/db/schema';
import { canManageSection, type Actor, canViewSection } from '@/domain/access/permissions';
import { assertCanManage, assertCanView, ForbiddenError, visibleScopes } from '@/domain/access/guard';
import { meetingCandidates, type Candidate } from '@/domain/meetings/attendees';
import { normalizeLeads } from '@/domain/meetings/reminders';
import { notify } from '@/server/notifications/service';

/**
 * سرویسِ جلسات و یادآورها.
 * ⚠️ همهٔ گاردها اینجا هستند، نه در صفحه (R-ARCH-01).
 */

export class MeetingNotFoundError extends Error {
  constructor() {
    super('meeting_not_found');
    this.name = 'MeetingNotFoundError';
  }
}

async function audit(actor: Actor, action: string, objectId: number, before?: unknown, after?: unknown) {
  await db.insert(auditLog).values({
    actorType: 'user',
    actorId: actor.id,
    action,
    objectType: 'meeting',
    objectId,
    before: before ?? null,
    after: after ?? null,
  });
}

/** جلسات پیشِ‌رو + گزینه‌های فرم. */
export async function listMeetings(actor: Actor) {
  /**
   * ⚠️ بدونِ مجوزِ بخش، فهرست به «جلساتی که خودم دعوتم» می‌افتد — پورتِ
   * نمای عضوِ نسخهٔ قبلی. عضو مجوزِ `meetings.view` ندارد ولی جلساتش را
   * می‌بیند؛ پیش از این کلاً بیرون می‌ماند.
   */
  const attendeeOnly = !canViewSection(actor, 'meetings');
  const myMeetingIds = attendeeOnly
    ? (await db.select({ id: meetingAttendees.meetingId })
        .from(meetingAttendees)
        .where(eq(meetingAttendees.userId, actor.id))).map((r) => r.id)
    : [];
  if (attendeeOnly && myMeetingIds.length === 0) {
    return { meetings: [], canManage: false };
  }
  const scopes: Array<'company' | 'private'> = attendeeOnly
    ? ['company', 'private']
    : visibleScopes(actor);

  const rows = await db
    .select({
      id: meetings.id,
      title: meetings.title,
      description: meetings.description,
      meetAt: meetings.meetAt,
      location: meetings.location,
      meetingScope: meetings.meetingScope,
      projectId: meetings.projectId,
      projectTitle: projects.title,
      officeId: meetings.officeId,
      officeName: offices.name,
      createdBy: meetings.createdBy,
      scope: meetings.scope,
    })
    .from(meetings)
    .leftJoin(projects, eq(projects.id, meetings.projectId))
    .leftJoin(offices, eq(offices.id, meetings.officeId))
    .where(and(
      inArray(meetings.scope, scopes),
      ...(attendeeOnly ? [inArray(meetings.id, myMeetingIds)] : []),
      // فقط جلسات پیشِ‌رو — همان «جلسات پیشِ‌رو» ِ نسخهٔ قبلی.
      gte(meetings.meetAt, new Date()),
    ))
    .orderBy(asc(meetings.meetAt));

  // ⚠️ گاردِ scope همان بالا در SQL اعمال شد؛ `filterVisible` برای «رکوردِ
  // خصوصی» (تسک) است نه scope، پس اینجا جایی ندارد.
  const ids = rows.map((m) => m.id);

  const attendeeRows = ids.length > 0
    ? await db
      .select({ meetingId: meetingAttendees.meetingId, userId: users.id, name: users.name })
      .from(meetingAttendees)
      .innerJoin(users, eq(users.id, meetingAttendees.userId))
      .where(inArray(meetingAttendees.meetingId, ids))
    : [];

  const byMeeting = new Map<number, Array<{ userId: number; name: string }>>();
  for (const a of attendeeRows) {
    const list = byMeeting.get(a.meetingId) ?? [];
    list.push({ userId: a.userId, name: a.name });
    byMeeting.set(a.meetingId, list);
  }

  return {
    meetings: rows.map((m) => ({ ...m, attendees: byMeeting.get(m.id) ?? [] })),
    canManage: canManageSection(actor, 'meetings'),
  };
}

/** پروژه‌ها و دفاترِ قابلِ انتخاب در فرمِ جلسه. */
export async function getMeetingFormOptions(actor: Actor) {
  assertCanManage(actor, 'meetings');
  const [projectRows, officeRows] = await Promise.all([
    db.select({ id: projects.id, title: projects.title })
      .from(projects)
      .where(and(isNull(projects.deletedAt), inArray(projects.scope, visibleScopes(actor))))
      .orderBy(projects.title),
    db.select({ id: offices.id, name: offices.name })
      .from(offices).where(eq(offices.isActive, true)).orderBy(offices.name),
  ]);
  return { projects: projectRows, offices: officeRows };
}

/**
 * کاندیداهای دعوت — قواعدش در `meetingCandidates` است و تست دارد.
 * برای جلسهٔ پروژه‌ای از اعضا/کارفرمایانِ همان پروژه، و برای جلسهٔ عمومی از
 * اعضای دفاترِ انتخابی.
 */
export async function getCandidates(
  actor: Actor,
  input: { projectId: number | null; officeIds: number[] },
): Promise<Candidate[]> {
  assertCanManage(actor, 'meetings');

  const inactive = await db
    .select({ id: users.id }).from(users)
    .where(sql`${users.memberState} <> 'active' or ${users.deletedAt} is not null`);
  const inactiveUserIds = new Set(inactive.map((r) => r.id));

  const admins = await db
    .selectDistinct({ userId: users.id, name: users.name })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .where(and(inArray(userRoles.role, ['owner', 'admin']), isNull(users.deletedAt)))
    .orderBy(users.name);

  if (input.projectId !== null) {
    const [memberRows, clientRows] = await Promise.all([
      db.select({ userId: users.id, name: users.name, roleName: tagName(await currentLocale()) })
        .from(projectMembers)
        .innerJoin(users, eq(users.id, projectMembers.userId))
        .leftJoin(tags, eq(tags.id, projectMembers.roleTagId))
        .where(eq(projectMembers.projectId, input.projectId)),
      db.select({ userId: users.id, name: users.name })
        .from(projectClients)
        .innerJoin(users, eq(users.id, projectClients.userId))
        .where(eq(projectClients.projectId, input.projectId)),
    ]);
    return meetingCandidates('project', {
      projectMembers: memberRows,
      projectClients: clientRows,
      admins,
      inactiveUserIds,
    });
  }

  // جلسهٔ عمومی: اعضای دفاترِ انتخابی، یا همهٔ اعضا اگر دفتری انتخاب نشده.
  const base = db
    .selectDistinct({ userId: users.id, name: users.name })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id));

  const officeMembers = input.officeIds.length > 0
    ? await base
      .innerJoin(userOffices, eq(userOffices.userId, users.id))
      .where(and(
        eq(userRoles.role, 'member'),
        isNull(users.deletedAt),
        inArray(userOffices.officeId, input.officeIds),
      ))
      .orderBy(users.name)
    : await base
      .where(and(eq(userRoles.role, 'member'), isNull(users.deletedAt)))
      .orderBy(users.name);

  return meetingCandidates('general', { officeMembers, admins, inactiveUserIds });
}

export interface MeetingInput {
  title: string;
  description: string;
  meetAt: Date;
  location: string;
  projectId: number | null;
  officeId: number | null;
  attendeeIds: number[];
}

/** ساختِ جلسه + ثبتِ دعوت‌شدگان. */
export async function createMeeting(actor: Actor, input: MeetingInput): Promise<number> {
  assertCanManage(actor, 'meetings');

  // ⚠️ جلسه scope ِ پروژه‌اش را ارث می‌برد — وگرنه جلسهٔ یک پروژهٔ خصوصی در
  // فهرستِ عمومی دیده می‌شد (همان تلهٔ R-PROJ-30).
  let scope: 'company' | 'private' = 'company';
  if (input.projectId !== null) {
    const rows = await db.select({ scope: projects.scope })
      .from(projects).where(eq(projects.id, input.projectId));
    const project = rows[0];
    if (!project) throw new MeetingNotFoundError();
    scope = project.scope as 'company' | 'private';
    if (!visibleScopes(actor).includes(scope)) throw new ForbiddenError('meeting.scope');
  }

  const id = await db.transaction(async (tx) => {
    const rows = await tx.insert(meetings).values({
      title: input.title,
      description: input.description,
      meetAt: input.meetAt,
      location: input.location,
      meetingScope: input.projectId !== null ? 'project' : 'general',
      projectId: input.projectId,
      officeId: input.officeId,
      createdBy: actor.id,
      scope,
    }).returning({ id: meetings.id });

    const meetingId = rows[0]!.id;
    if (input.attendeeIds.length > 0) {
      await tx.insert(meetingAttendees).values(
        [...new Set(input.attendeeIds)].map((userId) => ({ meetingId, userId })),
      );
    }
    return meetingId;
  });

  await audit(actor, 'meeting.create', id, null, input);

  // R-NOTIF-01 — دعوت‌شدگان (جز خودِ سازنده) خبردار می‌شوند.
  await notify(input.attendeeIds.filter((uid) => uid !== actor.id), {
    type: 'meeting.invited',
    title: 'دعوت به جلسه',
    body: input.title,
    url: '/meetings',
  });
  return id;
}

/** ویرایشِ جلسه — دعوت‌شدگان کاملاً جایگزین می‌شوند. */
export async function updateMeeting(actor: Actor, meetingId: number, input: MeetingInput) {
  assertCanManage(actor, 'meetings');
  const before = await getMeeting(actor, meetingId);

  await db.transaction(async (tx) => {
    await tx.update(meetings).set({
      title: input.title,
      description: input.description,
      meetAt: input.meetAt,
      location: input.location,
      projectId: input.projectId,
      officeId: input.officeId,
      meetingScope: input.projectId !== null ? 'project' : 'general',
      updatedAt: new Date(),
    }).where(eq(meetings.id, meetingId));

    await tx.delete(meetingAttendees).where(eq(meetingAttendees.meetingId, meetingId));
    if (input.attendeeIds.length > 0) {
      await tx.insert(meetingAttendees).values(
        [...new Set(input.attendeeIds)].map((userId) => ({ meetingId, userId })),
      );
    }
  });

  await audit(actor, 'meeting.update', meetingId, before, input);
}

/** حذفِ جلسه — دعوت‌ها با cascade می‌روند. */
export async function deleteMeeting(actor: Actor, meetingId: number) {
  assertCanManage(actor, 'meetings');
  const before = await getMeeting(actor, meetingId);
  await db.delete(meetings).where(eq(meetings.id, meetingId));
  await audit(actor, 'meeting.delete', meetingId, before, null);
}

async function getMeeting(actor: Actor, meetingId: number) {
  const rows = await db.select().from(meetings).where(eq(meetings.id, meetingId));
  const meeting = rows[0];
  if (!meeting) throw new MeetingNotFoundError();
  if (!visibleScopes(actor).includes(meeting.scope as 'company' | 'private')) {
    throw new MeetingNotFoundError();
  }
  return meeting;
}

/* ------------------------------------------------------------------ *
 * یادآورها — شخصی‌اند: هر کس فقط یادآورهای خودش را می‌بیند.
 * ------------------------------------------------------------------ */

/** ⚠️ یادآور مجوزِ بخش نمی‌خواهد؛ مالِ خودِ کاربر است. */
export async function listReminders(actor: Actor) {
  return db.select({
    id: reminders.id,
    remindAt: reminders.remindAt,
    body: reminders.body,
    leadMinutes: reminders.leadMinutes,
    isSent: reminders.isSent,
  })
    .from(reminders)
    .where(eq(reminders.userId, actor.id))
    .orderBy(asc(reminders.remindAt));
}

export async function createReminder(
  actor: Actor,
  input: { remindAt: Date; body: string; leads: number[] },
): Promise<number> {
  const body = input.body.trim();
  if (body === '') throw new ForbiddenError('reminder.empty');

  const rows = await db.insert(reminders).values({
    userId: actor.id,
    remindAt: input.remindAt,
    body,
    leadMinutes: normalizeLeads(input.leads),
  }).returning({ id: reminders.id });

  return rows[0]!.id;
}

/** ⚠️ فقط صاحبِ یادآور می‌تواند حذفش کند — حتی مدیر هم نه. */
export async function deleteReminder(actor: Actor, reminderId: number) {
  await db.delete(reminders)
    .where(and(eq(reminders.id, reminderId), eq(reminders.userId, actor.id)));
}

/**
 * دادهٔ فایلِ تقویمِ یک جلسه.
 *
 * ⚠️ گاردش **عضویت** است نه مدیریت: هر دعوت‌شده‌ای باید بتواند جلسه را به
 * تقویمش اضافه کند. ولی کسی که دعوت نشده حتی عنوانِ جلسه را هم نمی‌بیند —
 * وگرنه دانستنِ شناسه برای فهمیدنِ محتوای جلسه کافی می‌شد.
 */
export async function getMeetingForCalendar(actor: Actor, meetingId: number) {
  const rows = await db
    .select({
      id: meetings.id,
      title: meetings.title,
      description: meetings.description,
      location: meetings.location,
      meetAt: meetings.meetAt,
      createdBy: meetings.createdBy,
      projectTitle: projects.title,
    })
    .from(meetings)
    .leftJoin(projects, eq(projects.id, meetings.projectId))
    .where(eq(meetings.id, meetingId));

  const meeting = rows[0];
  if (!meeting) return null;

  const invited = await db
    .select({ userId: meetingAttendees.userId })
    .from(meetingAttendees)
    .where(eq(meetingAttendees.meetingId, meetingId));

  const isInvited = invited.some((a) => a.userId === actor.id);
  const canManage = meeting.createdBy === actor.id || canManageSection(actor, 'meetings');
  if (!isInvited && !canManage) return null;

  return meeting;
}
