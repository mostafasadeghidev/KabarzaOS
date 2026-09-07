import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db, sql } from '../client';
import {
  meetingAttendees, meetings, projectClients, projects, userRoles, users,
} from '../schema';
import { createMeeting, listMeetings } from '@/server/meetings/service';
import { ForbiddenError } from '@/domain/access/guard';
import type { Actor } from '@/domain/access/permissions';

/**
 * کارفرما و جلسات: می‌بیند به چه جلسه‌ای دعوت شده، ولی جلسه نمی‌سازد و کسی
 * را دعوت نمی‌کند.
 */

const OWNER = 1, CLIENT = 2, OUTSIDER = 3;
const owner = (): Actor => ({ id: OWNER, roles: ['owner'], permissions: [], privateAccess: false });
const client = (id = CLIENT): Actor => ({ id, roles: ['client'], permissions: [], privateAccess: false });

let project: number;

beforeAll(async () => {
  await sql`truncate table meeting_attendees, meetings, project_clients, projects, user_roles, users
    restart identity cascade`;

  await db.insert(users).values([
    { email: 'o@t', name: 'مالک' }, { email: 'c@t', name: 'کارفرما' }, { email: 'x@t', name: 'کارفرمای دیگر' },
  ]);
  await db.insert(userRoles).values([
    { userId: OWNER, role: 'owner' }, { userId: CLIENT, role: 'client' }, { userId: OUTSIDER, role: 'client' },
  ]);

  const [p] = await db.insert(projects).values({ title: 'پروژه', price: '0' }).returning({ id: projects.id });
  project = p!.id;
  await db.insert(projectClients).values({ projectId: project, userId: CLIENT });

  const soon = new Date(Date.now() + 3 * 86_400_000);
  const [invited] = await db.insert(meetings).values({
    title: 'بازبینی با کارفرما', meetAt: soon, projectId: project, createdBy: OWNER,
  }).returning({ id: meetings.id });
  await db.insert(meetingAttendees).values({ meetingId: invited!.id, userId: CLIENT });

  // جلسه‌ای که کارفرما دعوت نشده — نباید ببیند.
  await db.insert(meetings).values({
    title: 'جلسهٔ داخلیِ تیم', meetAt: soon, projectId: project, createdBy: OWNER,
  });
});

afterAll(async () => { await sql.end(); });

describe('کارفرما در صفحهٔ جلسات', () => {
  it('فقط جلسه‌ای را می‌بیند که دعوتش کرده‌اند', async () => {
    const view = await listMeetings(client());
    expect(view.meetings.map((m) => m.title)).toEqual(['بازبینی با کارفرما']);
  });

  it('دکمهٔ ساختِ جلسه برایش نمی‌آید', async () => {
    const view = await listMeetings(client());
    expect(view.canManage).toBe(false);
    expect(view.canCreateGeneral).toBe(false);
  });

  it('اگر هم فرم را دور بزند، سرور ساختِ جلسه را رد می‌کند', async () => {
    await expect(createMeeting(client(), {
      title: 'جلسه‌ای که نباید ساخته شود',
      meetAt: new Date(Date.now() + 86_400_000),
      projectId: project,
      attendeeIds: [OWNER],
      description: '',
      location: '',
      officeId: null,
    })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('کارفرمای بی‌دعوت هیچ جلسه‌ای نمی‌بیند', async () => {
    const view = await listMeetings(client(OUTSIDER));
    expect(view.meetings).toEqual([]);
  });

  it('مالک هر دو جلسه را می‌بیند', async () => {
    const view = await listMeetings(owner());
    expect(view.meetings).toHaveLength(2);
    expect(view.canManage).toBe(true);
  });
});
