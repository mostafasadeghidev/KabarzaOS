import { tagName } from '@/db/tag-name';
import { currentLocale, getT } from '@/i18n/server';
import { formatDateTime } from '@/i18n/datetime';
import { and, asc, eq, gte, inArray, isNull, or, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  auditLog, meetingAttendees, meetings, offices, projectClients, projectMembers,
  projects, reminders, tags, userOffices, userRoles, users,
} from '@/db/schema';
import { canManageSection, type Actor, canViewSection } from '@/domain/access/permissions';
import { ForbiddenError, visibleScopes } from '@/domain/access/guard';
import {
  canCreateGeneralMeeting, canManageMeeting, generalOfficeScope, type MeetingActorContext,
} from '@/domain/access/meeting-authority';
import { PM_CAP } from '@/domain/access/project-scope';
import { meetingCandidates, type Candidate } from '@/domain/meetings/attendees';
import { attendeeLabel, classifyAttendee } from '@/domain/meetings/labels';
import { normalizeLeads } from '@/domain/meetings/reminders';
import { canManageProject } from '@/server/projects/authority';
import { managedOfficeIds } from '@/server/team/service';
import { notify } from '@/server/notifications/service';

/**
 * سرویسِ جلسات و یادآورها.
 * ⚠️ همهٔ گاردها اینجا هستند، نه در صفحه (R-ARCH-01).
 *
 * اختیار — پورتِ قواعدِ نسخهٔ قبلی، تصمیم در `domain/access/meeting-authority`:
 *  · جلسهٔ **پروژه‌ای** را کسی می‌سازد که آن پروژه را مدیریت می‌کند (سراسری،
 *    مدیرِ پروژه، مدیرِ دفترِ آن).
 *  · جلسهٔ **عمومی** را مالک/مدیرِ بخش برای هر دفتری و مدیرِ دفتر فقط برای
 *    دفاترِ خودش.
 *  · ویرایش/حذف: سازنده، مدیرِ پروژه‌اش، یا مدیرِ سراسری.
 * پیش از این تنها کلید `meetings.manage` بود که هیچ عضوی ندارد؛ مدیرِ پروژه و
 * مدیرِ دفتر اصلاً دکمهٔ «جلسهٔ جدید» را نمی‌دیدند.
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

/* ------------------------------------------------------------------ *
 * اختیار
 * ------------------------------------------------------------------ */

function hasGlobal(actor: Actor): boolean {
  return canManageSection(actor, 'meetings') || canManageSection(actor, 'projects');
}

async function actorContext(actor: Actor): Promise<MeetingActorContext> {
  const global = hasGlobal(actor);
  return { hasGlobal: global, managedOfficeIds: global ? [] : await managedOfficeIds(actor.id) };
}

/** شناسهٔ پروژه‌هایی که کاربر در آن‌ها با تگِ «مدیرِ پروژه» امضا شده. */
async function pmProjectIds(userId: number): Promise<number[]> {
  const rows = await db
    .selectDistinct({ projectId: projectMembers.projectId })
    .from(projectMembers)
    .innerJoin(tags, eq(tags.id, projectMembers.roleTagId))
    .where(and(eq(projectMembers.userId, userId), eq(tags.grantsCap, PM_CAP)));
  return rows.map((r) => r.projectId);
}

/** آیا این کاربر اصلاً می‌تواند جلسه‌ای بسازد؟ (دکمهٔ «جلسهٔ جدید») */
async function canCreateAny(actor: Actor, ctx: MeetingActorContext): Promise<boolean> {
  if (canCreateGeneralMeeting(ctx)) return true;
  return (await pmProjectIds(actor.id)).length > 0;
}

/** گاردِ جلسهٔ پروژه‌ای — مدیریتِ همان پروژه. */
async function assertProjectMeeting(actor: Actor, projectId: number): Promise<void> {
  if (hasGlobal(actor)) return;
  if (!(await canManageProject(actor, projectId))) throw new ForbiddenError('meeting.project');
}

/* ------------------------------------------------------------------ *
 * فهرست
 * ------------------------------------------------------------------ */

/** جلسات پیشِ‌رو + اختیارِ بیننده. */
export async function listMeetings(actor: Actor) {
  /**
   * ⚠️ بدونِ مجوزِ بخش، فهرست به «جلساتی که دعوتم **یا خودم ساخته‌ام**»
   * می‌افتد — پورتِ `upcoming_for_user()`. سازنده‌ای که خودش را دعوت نکرده
   * پیش از این جلسهٔ خودش را نمی‌دید.
   */
  const attendeeOnly = !canViewSection(actor, 'meetings');
  const myMeetingIds = attendeeOnly
    ? [...new Set([
      ...(await db.select({ id: meetingAttendees.meetingId })
        .from(meetingAttendees)
        .where(eq(meetingAttendees.userId, actor.id))).map((r) => r.id),
      ...(await db.select({ id: meetings.id })
        .from(meetings)
        .where(eq(meetings.createdBy, actor.id))).map((r) => r.id),
    ])]
    : [];

  const ctx = await actorContext(actor);
  const canManage = await canCreateAny(actor, ctx);

  if (attendeeOnly && myMeetingIds.length === 0) {
    return { meetings: [], canManage, canCreateGeneral: canCreateGeneralMeeting(ctx) };
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
  const projectIds = [...new Set(rows.map((m) => m.projectId).filter((id): id is number => id !== null))];
  const locale = await currentLocale();

  const [attendeeRows, memberRows, clientRows, adminRows] = await Promise.all([
    ids.length > 0
      ? db.select({ meetingId: meetingAttendees.meetingId, userId: users.id, name: users.name })
        .from(meetingAttendees)
        .innerJoin(users, eq(users.id, meetingAttendees.userId))
        .where(inArray(meetingAttendees.meetingId, ids))
      : [],
    projectIds.length > 0
      ? db.select({
        projectId: projectMembers.projectId, userId: projectMembers.userId, roleName: tagName(locale),
      })
        .from(projectMembers)
        .leftJoin(tags, eq(tags.id, projectMembers.roleTagId))
        .where(inArray(projectMembers.projectId, projectIds))
      : [],
    projectIds.length > 0
      ? db.select({ projectId: projectClients.projectId, userId: projectClients.userId })
        .from(projectClients)
        .where(inArray(projectClients.projectId, projectIds))
      : [],
    db.selectDistinct({ userId: userRoles.userId })
      .from(userRoles).where(inArray(userRoles.role, ['owner', 'admin'])),
  ]);

  const roleByProject = new Map<number, Map<number, string | null>>();
  for (const r of memberRows) {
    const map = roleByProject.get(r.projectId) ?? new Map<number, string | null>();
    if (!map.has(r.userId)) map.set(r.userId, r.roleName);
    roleByProject.set(r.projectId, map);
  }
  const clientsByProject = new Map<number, Set<number>>();
  for (const r of clientRows) {
    const set = clientsByProject.get(r.projectId) ?? new Set<number>();
    set.add(r.userId);
    clientsByProject.set(r.projectId, set);
  }
  const adminIds = new Set(adminRows.map((r) => r.userId));

  const byMeeting = new Map<number, Array<{ userId: number; name: string }>>();
  for (const a of attendeeRows) {
    const list = byMeeting.get(a.meetingId) ?? [];
    list.push({ userId: a.userId, name: a.name });
    byMeeting.set(a.meetingId, list);
  }

  /**
   * ⚠️ R-MEET-08 — ماسکِ نام سمتِ سرور: کارفرما نقشِ اعضا را می‌بیند نه
   * نامشان، و تیم «کارفرما» را می‌بیند نه نامش. مالک همه را.
   */
  const t = await getT();
  const isOwner = hasGlobal(actor);
  const manageCache = new Map<number, boolean>();
  const managesProject = async (projectId: number) => {
    let v = manageCache.get(projectId);
    if (v === undefined) {
      v = isOwner || await canManageProject(actor, projectId);
      manageCache.set(projectId, v);
    }
    return v;
  };

  const out = [];
  for (const m of rows) {
    const roleByUser = m.projectId !== null
      ? (roleByProject.get(m.projectId) ?? new Map<number, string | null>())
      : new Map<number, string | null>();
    const clientIds = m.projectId !== null
      ? (clientsByProject.get(m.projectId) ?? new Set<number>())
      : new Set<number>();
    const viewer = { isOwner, isClient: !isOwner && clientIds.has(actor.id) };
    const attendees = (byMeeting.get(m.id) ?? []).map((a) => ({
      userId: a.userId,
      name: attendeeLabel(
        { ...a, ...classifyAttendee(a.userId, { roleByUser, clientIds, adminIds }) },
        viewer,
        t,
      ),
    }));
    const canEdit = canManageMeeting({
      isCreator: m.createdBy === actor.id,
      hasGlobal: isOwner,
      managesProject: m.projectId !== null ? await managesProject(m.projectId) : false,
    });
    out.push({ ...m, attendees, canEdit });
  }

  return { meetings: out, canManage, canCreateGeneral: canCreateGeneralMeeting(ctx) };
}

/**
 * پروژه‌ها و دفاترِ قابلِ انتخاب در فرمِ جلسه — فقط آن‌هایی که این کاربر
 * می‌تواند برایشان جلسه بسازد.
 */
export async function getMeetingFormOptions(actor: Actor) {
  const ctx = await actorContext(actor);
  if (!(await canCreateAny(actor, ctx))) throw new ForbiddenError('meetings.manage');

  const scopes = visibleScopes(actor);
  if (ctx.hasGlobal) {
    const [projectRows, officeRows] = await Promise.all([
      db.select({ id: projects.id, title: projects.title })
        .from(projects)
        .where(and(isNull(projects.deletedAt), inArray(projects.scope, scopes)))
        .orderBy(projects.title),
      db.select({ id: offices.id, name: offices.name })
        .from(offices).where(eq(offices.isActive, true)).orderBy(offices.name),
    ]);
    return { projects: projectRows, offices: officeRows };
  }

  // مدیرِ پروژه/دفتر: پروژه‌های خودش (به تگ) ∪ پروژه‌های دفاترِ خودش؛ دفاترِ خودش.
  const pmIds = await pmProjectIds(actor.id);
  const managed = [...ctx.managedOfficeIds];
  const projectRows = (pmIds.length > 0 || managed.length > 0)
    ? await db.select({ id: projects.id, title: projects.title })
      .from(projects)
      .where(and(
        isNull(projects.deletedAt),
        inArray(projects.scope, scopes),
        or(
          ...(pmIds.length > 0 ? [inArray(projects.id, pmIds)] : []),
          ...(managed.length > 0 ? [inArray(projects.officeId, managed)] : []),
        ),
      ))
      .orderBy(projects.title)
    : [];
  const officeRows = managed.length > 0
    ? await db.select({ id: offices.id, name: offices.name })
      .from(offices)
      .where(and(eq(offices.isActive, true), inArray(offices.id, managed)))
      .orderBy(offices.name)
    : [];
  return { projects: projectRows, offices: officeRows };
}

/* ------------------------------------------------------------------ *
 * دعوت‌شدگان
 * ------------------------------------------------------------------ */

/** استخرِ کاندیداها بدونِ گارد — گارد را صدازننده گذاشته. */
async function candidatePool(
  projectId: number | null,
  officeIds: number[] | null,
  currentUserId: number | null = null,
): Promise<Candidate[]> {
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

  if (projectId !== null) {
    const locale = await currentLocale();
    const [memberRows, clientRows] = await Promise.all([
      db.select({ userId: users.id, name: users.name, roleName: tagName(locale) })
        .from(projectMembers)
        .innerJoin(users, eq(users.id, projectMembers.userId))
        .leftJoin(tags, eq(tags.id, projectMembers.roleTagId))
        .where(eq(projectMembers.projectId, projectId)),
      db.select({ userId: users.id, name: users.name })
        .from(projectClients)
        .innerJoin(users, eq(users.id, projectClients.userId))
        .where(eq(projectClients.projectId, projectId)),
    ]);
    return meetingCandidates('project', {
      projectMembers: memberRows,
      projectClients: clientRows,
      admins,
      inactiveUserIds,
      currentUserId,
    });
  }

  // جلسهٔ عمومی: اعضای دفاترِ دامنه، یا همهٔ اعضا اگر دامنه «همه» است.
  const base = db
    .selectDistinct({ userId: users.id, name: users.name })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id));

  const officeMembers = officeIds !== null
    ? (officeIds.length > 0
      ? await base
        .innerJoin(userOffices, eq(userOffices.userId, users.id))
        .where(and(
          eq(userRoles.role, 'member'),
          isNull(users.deletedAt),
          inArray(userOffices.officeId, officeIds),
        ))
        .orderBy(users.name)
      : [])
    : await base
      .where(and(eq(userRoles.role, 'member'), isNull(users.deletedAt)))
      .orderBy(users.name);

  return meetingCandidates('general', { officeMembers, admins, inactiveUserIds, currentUserId });
}

/**
 * کاندیداهای دعوت — قواعدش در `meetingCandidates` است و تست دارد.
 * برای جلسهٔ پروژه‌ای از اعضا/کارفرمایانِ همان پروژه، و برای جلسهٔ عمومی از
 * اعضای دفاترِ مجاز (مدیرِ دفتر فقط دفاترِ خودش).
 */
export async function getCandidates(
  actor: Actor,
  input: { projectId: number | null; officeIds: number[] },
): Promise<Candidate[]> {
  if (input.projectId !== null) {
    await assertProjectMeeting(actor, input.projectId);
    return candidatePool(input.projectId, null, actor.id);
  }
  const scope = generalOfficeScope(await actorContext(actor), input.officeIds[0] ?? null);
  if (!scope) throw new ForbiddenError('meeting.general');
  return candidatePool(null, scope.officeIds, actor.id);
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

/**
 * scope ِ جلسه = scope ِ پروژه‌اش.
 *
 * ⚠️ جلسه scope ِ پروژه‌اش را ارث می‌برد — وگرنه جلسهٔ یک پروژهٔ خصوصی در
 * فهرستِ عمومی دیده می‌شد (همان تلهٔ R-PROJ-30).
 */
async function resolveMeetingScope(
  actor: Actor,
  projectId: number | null,
): Promise<'company' | 'private'> {
  if (projectId === null) return 'company';
  const rows = await db.select({ scope: projects.scope })
    .from(projects).where(eq(projects.id, projectId));
  const project = rows[0];
  if (!project) throw new MeetingNotFoundError();
  const scope = project.scope as 'company' | 'private';
  if (!visibleScopes(actor).includes(scope)) throw new ForbiddenError('meeting.scope');
  return scope;
}

/**
 * دعوت‌شدگان ∩ استخرِ کاندیداها (R-MEET-02).
 *
 * ⚠️ فرم هر شناسه‌ای را می‌تواند بفرستد؛ نسخهٔ قبلی فهرستِ ارسالی را با
 * `candidates()` اشتراک می‌گیرد و بقیه را بی‌صدا می‌اندازد. بدونِ این، با
 * ویرایشِ فرم می‌شد هر کاربری را — از جمله غیرفعال‌ها و بیرونِ پروژه — دعوت کرد.
 */
async function allowedAttendees(
  attendeeIds: number[],
  projectId: number | null,
  officeIds: number[] | null,
): Promise<number[]> {
  const pool = new Set((await candidatePool(projectId, officeIds)).map((c) => c.userId));
  return [...new Set(attendeeIds)].filter((id) => pool.has(id));
}

/** ساختِ جلسه + ثبتِ دعوت‌شدگان. */
export async function createMeeting(actor: Actor, input: MeetingInput): Promise<number> {
  let officeId: number | null = null;
  let poolOffices: number[] | null = null;

  if (input.projectId !== null) {
    await assertProjectMeeting(actor, input.projectId);
  } else {
    const scope = generalOfficeScope(await actorContext(actor), input.officeId);
    if (!scope) throw new ForbiddenError('meeting.general');
    officeId = scope.officeId;
    poolOffices = scope.officeIds;
  }
  const scope = await resolveMeetingScope(actor, input.projectId);
  const attendeeIds = await allowedAttendees(input.attendeeIds, input.projectId, poolOffices);

  const id = await db.transaction(async (tx) => {
    const rows = await tx.insert(meetings).values({
      title: input.title,
      description: input.description,
      meetAt: input.meetAt,
      location: input.location,
      meetingScope: input.projectId !== null ? 'project' : 'general',
      projectId: input.projectId,
      officeId,
      createdBy: actor.id,
      scope,
    }).returning({ id: meetings.id });

    const meetingId = rows[0]!.id;
    if (attendeeIds.length > 0) {
      await tx.insert(meetingAttendees).values(attendeeIds.map((userId) => ({ meetingId, userId })));
    }
    return meetingId;
  });

  await audit(actor, 'meeting.create', id, null, input);

  // R-NOTIF-01 / R-MEET-03 — دعوت‌شدگان (جز خودِ سازنده) خبردار می‌شوند.
  const recipients = attendeeIds.filter((uid) => uid !== actor.id);
  if (recipients.length > 0) {
    await notify(recipients, {
      type: 'meeting.invited',
      title: 'جلسهٔ جدید: {title}',
      ...(await meetingBody(actor, input)),
      url: '/meetings',
    });
  }
  return id;
}

/**
 * بدنهٔ اعلانِ جلسه — پورتِ `Notifications::meeting_created()`:
 * زمان، و اگر بود مکان و پروژه. کلید بسته به ترکیب فرق می‌کند تا هر خط
 * ترجمه‌پذیر بماند؛ زمان به وقتِ خودِ سازنده نوشته می‌شود.
 */
async function meetingBody(
  actor: Actor,
  input: { title: string; meetAt: Date; location: string; projectId: number | null },
): Promise<{ body: string; params: Record<string, string> }> {
  const [tzRow, projectRow] = await Promise.all([
    db.select({ timezone: users.timezone }).from(users).where(eq(users.id, actor.id)),
    input.projectId !== null
      ? db.select({ title: projects.title }).from(projects).where(eq(projects.id, input.projectId))
      : Promise.resolve([] as Array<{ title: string }>),
  ]);
  const when = formatDateTime(input.meetAt, tzRow[0]?.timezone || undefined);
  const location = input.location.trim();
  const project = projectRow[0]?.title ?? '';
  const params = { title: input.title, when, location, project };
  // ⚠️ بدونِ شکستِ خط در کلید — استخراج‌گرِ ترجمه «\n» ِ کد را با خطِ واقعی جور نمی‌کند.
  if (location && project) return { body: 'زمان: {when} · مکان: {location} · پروژه: {project}', params };
  if (location) return { body: 'زمان: {when} · مکان: {location}', params };
  if (project) return { body: 'زمان: {when} · پروژه: {project}', params };
  return { body: 'زمان: {when}', params };
}

/**
 * ویرایشِ جلسه — عنوان/زمان/مکان/توضیح و جایگزینیِ دعوت‌شدگان.
 *
 * ⚠️ نوعِ جلسه و پروژه/دفترش **عوض نمی‌شود** (پورتِ `Meetings::update()`):
 * scope و استخرِ دعوت از همان پروژه/دفترِ ثبت‌شده می‌آید، پس جلسه‌ای که برای
 * پروژهٔ خصوصی ساخته شده با ویرایش عمومی نمی‌شود و برعکس.
 */
export async function updateMeeting(actor: Actor, meetingId: number, input: MeetingInput) {
  const before = await getMeeting(actor, meetingId);
  await assertCanEdit(actor, before);

  let poolOffices: number[] | null = null;
  if (before.projectId === null) {
    const scope = generalOfficeScope(await actorContext(actor), before.officeId);
    // سازنده‌ای که دیگر مدیرِ دفتری نیست، فقط از دفترِ ثبت‌شدهٔ خودِ جلسه دعوت می‌کند.
    poolOffices = scope ? scope.officeIds : [before.officeId ?? -1];
  }
  const attendeeIds = await allowedAttendees(input.attendeeIds, before.projectId, poolOffices);

  await db.transaction(async (tx) => {
    await tx.update(meetings).set({
      title: input.title,
      description: input.description,
      meetAt: input.meetAt,
      location: input.location,
      updatedAt: new Date(),
    }).where(eq(meetings.id, meetingId));

    await tx.delete(meetingAttendees).where(eq(meetingAttendees.meetingId, meetingId));
    if (attendeeIds.length > 0) {
      await tx.insert(meetingAttendees).values(attendeeIds.map((userId) => ({ meetingId, userId })));
    }
  });

  await audit(actor, 'meeting.update', meetingId, before, input);
}

/** حذفِ جلسه — دعوت‌ها با cascade می‌روند. */
export async function deleteMeeting(actor: Actor, meetingId: number) {
  const before = await getMeeting(actor, meetingId);
  await assertCanEdit(actor, before);
  await db.delete(meetings).where(eq(meetings.id, meetingId));
  await audit(actor, 'meeting.delete', meetingId, before, null);
}

/** ویرایش/حذف: سازنده، مدیرِ پروژه‌اش، یا مدیرِ سراسری. */
async function assertCanEdit(
  actor: Actor,
  meeting: { createdBy: number; projectId: number | null },
): Promise<void> {
  const ok = canManageMeeting({
    isCreator: meeting.createdBy === actor.id,
    hasGlobal: hasGlobal(actor),
    managesProject: meeting.projectId !== null && await canManageProject(actor, meeting.projectId),
  });
  if (!ok) throw new ForbiddenError('meetings.manage');
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
  const canManage = meeting.createdBy === actor.id || hasGlobal(actor);
  if (!isInvited && !canManage) return null;

  return meeting;
}
