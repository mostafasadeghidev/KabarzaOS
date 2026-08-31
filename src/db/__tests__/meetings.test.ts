import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, sql } from '../client';
import { currencies, users, userRoles, projects, meetings, meetingAttendees, reminders } from '../schema';
import * as service from '@/server/meetings/service';
import { ForbiddenError } from '@/domain/access/guard';
import type { Actor, Permission } from '@/domain/access/permissions';

/** جلسات و یادآورها از انتها تا انتها. */

const actor = (over: Partial<Actor> = {}): Actor => ({
  id: 1, roles: [], permissions: [], privateAccess: false, ...over,
});
const manager = () => actor({ id: 1, permissions: ['meetings.manage', 'meetings.view'] as Permission[] });
const viewer = () => actor({ id: 2, permissions: ['meetings.view'] as Permission[] });
const owner = () => actor({ id: 3, roles: ['owner'] });

let companyProject: number, privateProject: number, alice: number;

beforeAll(async () => {
  await sql`truncate table audit_log, reminders, meeting_attendees, meetings,
    projects, user_roles, users, currencies restart identity cascade`;

  const c = await db.insert(currencies)
    .values({ code: 'EUR', name: 'یورو', symbol: '€', isDefault: true })
    .returning({ id: currencies.id });

  const u = await db.insert(users).values([
    { email: 'a@t', name: 'آلیس' },
    { email: 'b@t', name: 'باب' },
    { email: 'o@t', name: 'مالک' },
  ]).returning({ id: users.id });
  alice = u[0]!.id;
  await db.insert(userRoles).values([
    { userId: u[0]!.id, role: 'member' },
    { userId: u[2]!.id, role: 'owner' },
  ]);

  const p = await db.insert(projects).values([
    { title: 'شرکتی', price: '0', currencyId: c[0]!.id },
    { title: 'خصوصی', price: '0', currencyId: c[0]!.id, scope: 'private' },
  ]).returning({ id: projects.id });
  companyProject = p[0]!.id; privateProject = p[1]!.id;
});

afterAll(async () => { await sql.end(); });

const input = (over: Partial<service.MeetingInput> = {}): service.MeetingInput => ({
  title: 'جلسه', description: '', meetAt: new Date(Date.now() + 86400000),
  location: '', projectId: null, officeId: null, attendeeIds: [], ...over,
});

describe('گاردِ دسترسی', () => {
  it('بدونِ مجوز، فهرست به «جلساتِ خودم» می‌افتد — دیدِ عضویت‌محور', async () => {
    // ⚠️ قراردادِ قدیم «خطا» بود و همین عضوها را از اپ بیرون گذاشته بود؛
    // حالا مثلِ نسخهٔ قبلی، بی‌مجوز یعنی فقط جلساتی که دعوتی.
    const data = await service.listMeetings(actor());
    expect(data.meetings).toEqual([]);
    expect(data.canManage).toBe(false);
  });

  it('کاربرِ خواندنی می‌بیند ولی نمی‌سازد', async () => {
    const data = await service.listMeetings(viewer());
    expect(data.canManage).toBe(false);
    await expect(service.createMeeting(viewer(), input())).rejects.toThrow(ForbiddenError);
  });
});

describe('⚠️ جلسه scope ِ پروژه‌اش را ارث می‌برد', () => {
  it('جلسهٔ پروژهٔ شرکتی، شرکتی است', async () => {
    const id = await service.createMeeting(manager(), input({ projectId: companyProject }));
    const row = (await db.select().from(meetings).where(eq(meetings.id, id)))[0]!;
    expect(row.scope).toBe('company');
    expect(row.meetingScope).toBe('project');
  });

  it('جلسهٔ پروژهٔ خصوصی، خصوصی می‌شود', async () => {
    // وگرنه جلسهٔ یک پروژهٔ خصوصی در فهرستِ عمومی دیده می‌شد.
    const id = await service.createMeeting(owner(), input({ projectId: privateProject }));
    const row = (await db.select().from(meetings).where(eq(meetings.id, id)))[0]!;
    expect(row.scope).toBe('private');
  });

  it('کسی که دسترسیِ خصوصی ندارد نمی‌تواند جلسهٔ پروژهٔ خصوصی بسازد', async () => {
    await expect(service.createMeeting(manager(), input({ projectId: privateProject })))
      .rejects.toThrow(ForbiddenError);
  });

  it('جلسهٔ خصوصی در فهرستِ کاربرِ بی‌دسترسی نیست', async () => {
    const seen = await service.listMeetings(manager());
    expect(seen.meetings.every((m) => m.scope === 'company')).toBe(true);
    const all = await service.listMeetings(owner());
    expect(all.meetings.some((m) => m.scope === 'private')).toBe(true);
  });
});

describe('دعوت‌شدگان', () => {
  it('ثبت و جایگزینی', async () => {
    const id = await service.createMeeting(manager(), input({ attendeeIds: [alice, alice] }));
    // شناسهٔ تکراری یک ردیف می‌شود.
    expect(await db.select().from(meetingAttendees).where(eq(meetingAttendees.meetingId, id)))
      .toHaveLength(1);

    await service.updateMeeting(manager(), id, input({ attendeeIds: [] }));
    expect(await db.select().from(meetingAttendees).where(eq(meetingAttendees.meetingId, id)))
      .toHaveLength(0);
  });

  it('حذفِ جلسه دعوت‌ها را هم می‌برد', async () => {
    const id = await service.createMeeting(manager(), input({ attendeeIds: [alice] }));
    await service.deleteMeeting(manager(), id);
    expect(await db.select().from(meetings).where(eq(meetings.id, id))).toHaveLength(0);
    expect(await db.select().from(meetingAttendees).where(eq(meetingAttendees.meetingId, id)))
      .toHaveLength(0);
  });
});

describe('⚠️ یادآور شخصی است', () => {
  it('بدونِ مجوزِ بخش هم ثبت می‌شود', async () => {
    // ⚠️ شناسه باید کاربرِ واقعی باشد؛ کلیدِ خارجی شناسهٔ ساختگی را رد می‌کند.
    const id = await service.createReminder(actor({ id: alice }), {
      remindAt: new Date(Date.now() + 3600000), body: 'یادداشت', leads: [0, 60],
    });
    const row = (await db.select().from(reminders).where(eq(reminders.id, id)))[0]!;
    expect(row.userId).toBe(alice);
    expect(row.leadMinutes).toEqual([0, 60]);
  });

  it('متنِ خالی رد می‌شود', async () => {
    await expect(service.createReminder(actor({ id: alice }), {
      remindAt: new Date(), body: '  ', leads: [],
    })).rejects.toThrow(ForbiddenError);
  });

  it('هر کس فقط یادآورهای خودش را می‌بیند', async () => {
    const mine = await service.listReminders(actor({ id: alice }));
    const others = await service.listReminders(owner());
    expect(mine).toHaveLength(1);
    expect(others).toHaveLength(0);
  });

  it('⚠️ کاربرِ دیگر نمی‌تواند یادآورِ من را حذف کند — حتی مالک', async () => {
    const id = (await service.listReminders(actor({ id: alice })))[0]!.id;
    await service.deleteReminder(owner(), id);
    expect(await service.listReminders(actor({ id: alice }))).toHaveLength(1);

    await service.deleteReminder(actor({ id: alice }), id);
    expect(await service.listReminders(actor({ id: alice }))).toHaveLength(0);
  });
});
