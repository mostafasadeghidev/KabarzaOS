import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, sql } from '../client';
import {
  currencies, meetingAttendees, meetings, offices, projectClients, projectMembers, projects,
  tags, userOffices, userRoles, users,
} from '../schema';
import * as service from '@/server/meetings/service';
import { ForbiddenError } from '@/domain/access/guard';
import { PM_CAP } from '@/domain/access/project-scope';
import type { Actor } from '@/domain/access/permissions';

/**
 * اختیارِ جلسه و ماسکِ نام — پورتِ `can_manage_project()` / `can_create_general()` /
 * `general_office_scope()` / `attendee_labels()`.
 *
 * ⚠️ پیش از این تنها کلید `meetings.manage` بود که هیچ عضوی ندارد: مدیرِ پروژه و
 * مدیرِ دفتر — که در نسخهٔ قبلی برای پروژه/دفترِ خودشان جلسه می‌ساختند — اصلاً
 * دکمهٔ «جلسهٔ جدید» را نمی‌دیدند؛ و کارتِ جلسه نامِ همه را به همه نشان می‌داد.
 */

const actor = (id: number, over: Partial<Actor> = {}): Actor => ({
  id, roles: ['member'], permissions: [], privateAccess: false, ...over,
});

let owner: number, sara: number, reza: number, ali: number, client: number, outsider: number;
let office: number, otherOffice: number, project: number, otherProject: number;

beforeAll(async () => {
  await sql`truncate table audit_log, notifications, meeting_attendees, meetings, project_clients,
    project_members, projects, tags, user_offices, offices, user_roles, users, currencies
    restart identity cascade`;

  const c = await db.insert(currencies)
    .values({ code: 'EUR', name: 'یورو', symbol: '€', isDefault: true })
    .returning({ id: currencies.id });

  const u = await db.insert(users).values([
    { email: 'o@t', name: 'مالک' },
    { email: 's@t', name: 'سارا' },
    { email: 'r@t', name: 'رضا' },
    { email: 'a@t', name: 'علی' },
    { email: 'c@t', name: 'شرکتِ الف' },
    { email: 'x@t', name: 'بیرونی' },
  ]).returning({ id: users.id });
  [owner, sara, reza, ali, client, outsider] =
    u.map((r) => r.id) as [number, number, number, number, number, number];

  await db.insert(userRoles).values([
    { userId: owner, role: 'owner' },
    { userId: sara, role: 'member' },
    { userId: reza, role: 'member' },
    { userId: ali, role: 'member' },
    { userId: client, role: 'client' },
    { userId: outsider, role: 'member' },
  ]);

  const o = await db.insert(offices).values([{ name: 'تهران' }, { name: 'برلین' }])
    .returning({ id: offices.id });
  office = o[0]!.id; otherOffice = o[1]!.id;
  await db.insert(userOffices).values([
    { userId: reza, officeId: office, manages: true },
    { userId: ali, officeId: office, manages: false },
    { userId: outsider, officeId: otherOffice, manages: false },
  ]);

  const t = await db.insert(tags).values([
    { name: 'مدیر پروژه', type: 'member_role', grantsCap: PM_CAP },
    { name: 'دولوپر', type: 'member_role' },
  ]).returning({ id: tags.id });

  const p = await db.insert(projects).values([
    { title: 'آلفا', price: '0', currencyId: c[0]!.id, officeId: office },
    { title: 'بتا', price: '0', currencyId: c[0]!.id, officeId: otherOffice },
  ]).returning({ id: projects.id });
  project = p[0]!.id; otherProject = p[1]!.id;

  await db.insert(projectMembers).values([
    { projectId: project, userId: sara, roleTagId: t[0]!.id, agreedAmount: '0', unitRate: '0' },
    { projectId: project, userId: ali, roleTagId: t[1]!.id, agreedAmount: '0', unitRate: '0' },
  ]);
  await db.insert(projectClients).values({ projectId: project, userId: client });
});

afterAll(async () => { await sql.end(); });

const input = (over: Partial<service.MeetingInput> = {}): service.MeetingInput => ({
  title: 'جلسه', description: '', meetAt: new Date(Date.now() + 86400000),
  location: '', projectId: null, officeId: null, attendeeIds: [], ...over,
});

const attendeesOf = async (id: number) =>
  (await db.select().from(meetingAttendees).where(eq(meetingAttendees.meetingId, id)))
    .map((r) => r.userId).sort((a, b) => a - b);

describe('چه کسی جلسه می‌سازد', () => {
  it('⚠️ مدیرِ پروژه (با تگ) برای پروژهٔ خودش جلسه می‌سازد — پیش از این هیچ عضوی نمی‌توانست', async () => {
    const id = await service.createMeeting(
      actor(sara), input({ projectId: project, attendeeIds: [ali, client, outsider] }),
    );
    // بیرونی در استخرِ پروژه نیست و بی‌صدا می‌افتد (R-MEET-02).
    expect(await attendeesOf(id)).toEqual([ali, client].sort((a, b) => a - b));

    const list = await service.listMeetings(actor(sara));
    expect(list.canManage).toBe(true);
    expect(list.canCreateGeneral).toBe(false);
    expect(list.meetings.find((m) => m.id === id)?.canEdit).toBe(true);
  });

  it('… ولی نه برای پروژه‌ای که مدیرش نیست، و نه جلسهٔ عمومی', async () => {
    await expect(service.createMeeting(actor(sara), input({ projectId: otherProject })))
      .rejects.toThrow(ForbiddenError);
    await expect(service.createMeeting(actor(sara), input())).rejects.toThrow(ForbiddenError);
  });

  it('مدیرِ دفتر: جلسهٔ عمومی فقط از دفترِ خودش؛ دفترِ غریبه به دفاترِ خودش می‌افتد', async () => {
    const id = await service.createMeeting(
      actor(reza), input({ officeId: office, attendeeIds: [ali, outsider] }),
    );
    const row = (await db.select().from(meetings).where(eq(meetings.id, id)))[0]!;
    expect(row.officeId).toBe(office);
    expect(row.meetingScope).toBe('general');
    expect(await attendeesOf(id)).toEqual([ali]);

    // ⚠️ دفترِ درخواستی مالِ او نیست → بی‌صدا به دفاترِ خودش؛ بیرونی دعوت نمی‌شود.
    const id2 = await service.createMeeting(
      actor(reza), input({ officeId: otherOffice, attendeeIds: [outsider] }),
    );
    const row2 = (await db.select().from(meetings).where(eq(meetings.id, id2)))[0]!;
    expect(row2.officeId).toBeNull();
    expect(await attendeesOf(id2)).toEqual([]);

    // پروژهٔ دفترِ خودش را هم مدیریت می‌کند → جلسهٔ پروژه‌ای هم می‌سازد.
    await expect(service.createMeeting(actor(reza), input({ projectId: project })))
      .resolves.toBeGreaterThan(0);
    expect((await service.listMeetings(actor(reza))).canCreateGeneral).toBe(true);
  });

  it('⚠️ عضوِ عادی هیچ جلسه‌ای نمی‌سازد و دکمه را هم نمی‌بیند', async () => {
    await expect(service.createMeeting(actor(ali), input({ projectId: project })))
      .rejects.toThrow(ForbiddenError);
    await expect(service.createMeeting(actor(ali), input())).rejects.toThrow(ForbiddenError);
    expect((await service.listMeetings(actor(ali))).canManage).toBe(false);
    await expect(service.getMeetingFormOptions(actor(ali))).rejects.toThrow(ForbiddenError);
  });

  it('گزینه‌های فرم برای مدیرِ پروژه فقط پروژه‌های خودش است؛ برای مدیرِ دفتر دفتر و پروژه‌های دفترش', async () => {
    const pm = await service.getMeetingFormOptions(actor(sara));
    expect(pm.projects.map((p) => p.id)).toEqual([project]);
    expect(pm.offices).toEqual([]);

    const boss = await service.getMeetingFormOptions(actor(reza));
    expect(boss.projects.map((p) => p.id)).toEqual([project]);
    expect(boss.offices.map((o) => o.id)).toEqual([office]);
  });
});

describe('R-MEET-08 — ماسکِ نام روی کارتِ جلسه', () => {
  let id: number;
  beforeAll(async () => {
    id = await service.createMeeting(
      actor(owner, { roles: ['owner'] }), input({ projectId: project, attendeeIds: [sara, ali, client] }),
    );
  });
  const labelsFor = async (a: Actor) =>
    (await service.listMeetings(a)).meetings.find((m) => m.id === id)!.attendees
      .map((x) => x.name).sort();

  it('مالک همه را با نام و نقش می‌بیند', async () => {
    expect(await labelsFor(actor(owner, { roles: ['owner'] })))
      .toEqual(['سارا (مدیر پروژه)', 'شرکتِ الف (کارفرما)', 'علی (دولوپر)'].sort());
  });

  it('⚠️ کارفرما نامِ اعضا را نمی‌بیند — فقط نقششان', async () => {
    expect(await labelsFor(actor(client, { roles: ['client'] })))
      .toEqual(['مدیر پروژه', 'دولوپر', 'شرکتِ الف (کارفرما)'].sort());
  });

  it('⚠️ عضو نامِ کارفرما را نمی‌بیند — فقط «کارفرما»', async () => {
    expect(await labelsFor(actor(ali)))
      .toEqual(['سارا (مدیر پروژه)', 'علی (دولوپر)', 'کارفرما'].sort());
  });
});

describe('ویرایش/حذف و ثباتِ نوعِ جلسه', () => {
  it('سازنده ویرایش می‌کند؛ پروژه عوض نمی‌شود؛ عضوِ عادی نه؛ مدیرِ دفترِ پروژه چرا', async () => {
    const id = await service.createMeeting(actor(sara), input({ projectId: project, attendeeIds: [ali] }));
    await service.updateMeeting(
      actor(sara), id, input({ title: 'ویرایش‌شده', projectId: otherProject, attendeeIds: [ali, client] }),
    );
    const row = (await db.select().from(meetings).where(eq(meetings.id, id)))[0]!;
    expect(row.title).toBe('ویرایش‌شده');
    // ⚠️ پروژه از ورودی نادیده گرفته شد — جلسه روی پروژهٔ خودش ماند.
    expect(row.projectId).toBe(project);
    expect(await attendeesOf(id)).toEqual([ali, client].sort((a, b) => a - b));

    await expect(service.updateMeeting(actor(ali), id, input({ title: 'x' }))).rejects.toThrow(ForbiddenError);
    await expect(service.deleteMeeting(actor(ali), id)).rejects.toThrow(ForbiddenError);

    await service.deleteMeeting(actor(reza), id);
    expect(await db.select().from(meetings).where(eq(meetings.id, id))).toHaveLength(0);
  });

  it('سازنده‌ای که خودش را دعوت نکرده، جلسهٔ خودش را در فهرست می‌بیند', async () => {
    const id = await service.createMeeting(actor(sara), input({ projectId: project, attendeeIds: [ali] }));
    expect((await service.listMeetings(actor(sara))).meetings.map((m) => m.id)).toContain(id);
  });
});
