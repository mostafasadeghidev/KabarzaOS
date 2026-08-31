import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, sql } from '../client';
import { projects, projectMembers, timelogs, users, userRoles, workTimers } from '../schema';
import {
  addOrMerge, canLogTime, canUseTimesheet, confirmPending, discardPending, myLogs,
  resumePending, startTimer, stopTimer, timerState, updateLog,
} from '@/server/timelogs/service';
import { ForbiddenError } from '@/domain/access/guard';
import type { Actor } from '@/domain/access/permissions';

/** تایمر روی دیتابیسِ واقعی — قیدِ حالت هم آزموده می‌شود. */

let ownerId: number;
let memberId: number;
let outsiderId: number;
let projectId: number;
let archivedId: number;

const actorOf = (id: number, roles: Actor['roles'], permissions: string[] = []): Actor =>
  ({ id, roles, permissions: permissions as Actor['permissions'], privateAccess: false });

let owner: Actor;
let member: Actor;
let outsider: Actor;

const at = (iso: string) => new Date(iso);

beforeAll(async () => {
  await sql`truncate table work_timers, timelogs, project_members, projects, user_roles, users restart identity cascade`;

  const people = await db.insert(users).values([
    { email: 'o@t', name: 'مالک' },
    { email: 'm@t', name: 'عضو' },
    { email: 'x@t', name: 'بیگانه' },
  ]).returning({ id: users.id });
  [ownerId, memberId, outsiderId] = people.map((p) => p.id) as [number, number, number];

  await db.insert(userRoles).values([
    { userId: ownerId, role: 'owner' },
    { userId: memberId, role: 'member' },
    { userId: outsiderId, role: 'member' },
  ]);

  const rows = await db.insert(projects).values([
    { title: 'پروژهٔ فعال' },
    { title: 'پروژهٔ بایگانی', isArchived: true },
  ]).returning({ id: projects.id });
  [projectId, archivedId] = rows.map((r) => r.id) as [number, number];

  await db.insert(projectMembers).values([
    { projectId, userId: memberId },
    { projectId: archivedId, userId: memberId },
  ]);

  owner = actorOf(ownerId, ['owner']);
  member = actorOf(memberId, ['member']);
  outsider = actorOf(outsiderId, ['member']);
});

beforeEach(async () => {
  await sql`truncate table work_timers, timelogs restart identity cascade`;
});

afterAll(async () => {
  await sql.end();
});

describe('گاردِ ثبتِ ساعت', () => {
  it('⚠️ کسی که عضوِ پروژه نیست تایمر نمی‌زند', async () => {
    await expect(startTimer(outsider, projectId)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('⚠️ پروژهٔ بایگانی‌شده ساعتِ تازه نمی‌گیرد', async () => {
    await expect(startTimer(member, archivedId)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('عضوِ پروژه می‌تواند', async () => {
    await startTimer(member, projectId, at('2026-05-01T09:00:00'));
    const state = await timerState(member, at('2026-05-01T09:30:00'));
    expect(state.running?.minutes).toBe(30);
  });

  it('ساعتِ عمومی (بدونِ پروژه) برای کارکنان مجاز است', async () => {
    await startTimer(member, null, at('2026-05-01T09:00:00'));
    expect((await timerState(member)).running?.projectId).toBeNull();
  });
});

describe('چرخهٔ تایمر', () => {
  it('توقفِ زیرِ سقف ثبت می‌کند', async () => {
    await startTimer(member, projectId, at('2026-05-01T09:00:00'));
    const out = await stopTimer(member, 'طراحیِ صفحه', at('2026-05-01T12:00:00'));

    expect(out).toEqual({ parked: false, minutes: 180 });
    const logs = await myLogs(member);
    expect(logs[0]!.minutes).toBe(180);
    expect(logs[0]!.description).toBe('طراحیِ صفحه');

    // ردیفِ تایمر پاک شده.
    expect(await db.select().from(workTimers).where(eq(workTimers.userId, memberId))).toHaveLength(0);
  });

  it('⚠️ توقفِ بالای ۵ ساعت هیچ ساعتی ثبت نمی‌کند', async () => {
    await startTimer(member, projectId, at('2026-05-01T09:00:00'));
    const out = await stopTimer(member, '', at('2026-05-01T18:00:00'));

    expect(out).toEqual({ parked: true, minutes: 540 });
    expect(await myLogs(member)).toHaveLength(0);

    const state = await timerState(member);
    expect(state.running).toBeNull();
    expect(state.pending?.minutes).toBe(540);
  });

  it('تأییدِ پارک‌شده با دقیقهٔ اصلاح‌شده ثبت می‌کند', async () => {
    await startTimer(member, projectId, at('2026-05-01T09:00:00'));
    await stopTimer(member, '', at('2026-05-01T18:00:00'));

    await confirmPending(member, 240);
    const logs = await myLogs(member);
    expect(logs[0]!.minutes).toBe(240); // نه ۵۴۰
    expect((await timerState(member)).pending).toBeNull();
  });

  it('ازسرگیری زمانِ شمرده‌شده را نگه می‌دارد', async () => {
    await startTimer(member, projectId, at('2026-05-01T09:00:00'));
    await stopTimer(member, '', at('2026-05-01T18:00:00'));

    await resumePending(member, at('2026-05-01T18:00:00'));
    const state = await timerState(member, at('2026-05-01T18:10:00'));
    expect(state.running?.minutes).toBe(550); // ۵۴۰ + ۱۰
  });

  it('دور انداختنِ پارک‌شده چیزی ثبت نمی‌کند', async () => {
    await startTimer(member, projectId, at('2026-05-01T09:00:00'));
    await stopTimer(member, '', at('2026-05-01T18:00:00'));

    await discardPending(member);
    expect(await myLogs(member)).toHaveLength(0);
    expect((await timerState(member)).pending).toBeNull();
  });

  it('⚠️ دو تایمرِ هم‌زمان ممکن نیست', async () => {
    await startTimer(member, projectId, at('2026-05-01T09:00:00'));
    await expect(startTimer(member, projectId)).rejects.toThrow();
  });

  it('⚠️ تایمرِ پارک‌شده باید اول تعیینِ تکلیف شود', async () => {
    await startTimer(member, projectId, at('2026-05-01T09:00:00'));
    await stopTimer(member, '', at('2026-05-01T18:00:00'));
    await expect(startTimer(member, projectId)).rejects.toThrow();
  });
});

describe('⚠️ ادغامِ ثبتِ یک روز', () => {
  it('دو تایمر در یک روز و یک پروژه، یک ردیف می‌مانند', async () => {
    await startTimer(member, projectId, at('2026-05-01T09:00:00'));
    await stopTimer(member, 'صبح', at('2026-05-01T11:00:00'));

    await startTimer(member, projectId, at('2026-05-01T13:00:00'));
    await stopTimer(member, 'بعدازظهر', at('2026-05-01T15:00:00'));

    const logs = await myLogs(member);
    expect(logs).toHaveLength(1);
    expect(logs[0]!.minutes).toBe(240);
    expect(logs[0]!.description).toBe('صبح · بعدازظهر');
  });

  it('روزِ دیگر ردیفِ جدا می‌سازد', async () => {
    await addOrMerge(member, { projectId, logDate: '2026-05-01', minutes: 60, description: '' });
    await addOrMerge(member, { projectId, logDate: '2026-05-02', minutes: 60, description: '' });
    expect(await myLogs(member)).toHaveLength(2);
  });

  it('ساعتِ عمومی با ساعتِ پروژه ادغام نمی‌شود', async () => {
    await addOrMerge(member, { projectId, logDate: '2026-05-01', minutes: 60, description: '' });
    await addOrMerge(member, { projectId: null, logDate: '2026-05-01', minutes: 30, description: '' });

    const logs = await myLogs(member);
    expect(logs).toHaveLength(2);
    expect(logs.find((l) => l.projectId === null)!.minutes).toBe(30);
  });
});

describe('پنجرهٔ ویرایش', () => {
  it('⚠️ ثبتِ دیگری ویرایش نمی‌شود — حتی توسطِ مالک', async () => {
    const id = await addOrMerge(member, {
      projectId, logDate: '2026-05-01', minutes: 60, description: '',
    });
    await expect(updateLog(owner, id, { minutes: 999, description: '' }))
      .rejects.toBeInstanceOf(ForbiddenError);
  });

  it('بعد از دو هفته بسته می‌شود', async () => {
    const id = await addOrMerge(member, {
      projectId, logDate: '2026-05-01', minutes: 60, description: '',
    });
    // مهرِ ساخت را به عقب می‌بریم.
    await db.update(timelogs)
      .set({ createdAt: new Date('2026-04-01T00:00:00Z') })
      .where(eq(timelogs.id, id));

    await expect(updateLog(member, id, { minutes: 30, description: '' }, new Date('2026-05-01T00:00:00Z')))
      .rejects.toBeInstanceOf(ForbiddenError);
  });

  it('داخلِ پنجره ویرایش می‌شود', async () => {
    const id = await addOrMerge(member, {
      projectId, logDate: '2026-05-01', minutes: 60, description: '',
    });
    await updateLog(member, id, { minutes: 90, description: 'اصلاح' });

    const rows = await db.select().from(timelogs).where(eq(timelogs.id, id));
    expect(rows[0]!.minutes).toBe(90);
  });
});

/**
 * ساعت فقط برای اعضای تیم — تصمیمِ محصولی، و واگراییِ آگاهانه از نسخهٔ قبلی
 * (آنجا مالک و حسابدار هم می‌توانستند ساعتِ عمومی بزنند).
 */
describe('ثبتِ ساعت فقط برای عضوِ تیم', () => {
  it('⚠️ مدیرِ کل ساعت ثبت نمی‌کند — نه عمومی نه پروژه‌ای', async () => {
    const owner = actorOf(ownerId, ['owner']);
    expect(canUseTimesheet(owner)).toBe(false);
    expect(await canLogTime(owner, null)).toBe(false);
    expect(await canLogTime(owner, projectId)).toBe(false);
  });

  it('عضوِ تیم هم ساعتِ عمومی می‌زند هم روی پروژهٔ خودش', async () => {
    const member = actorOf(memberId, ['member']);
    expect(canUseTimesheet(member)).toBe(true);
    expect(await canLogTime(member, null)).toBe(true);
  });

  it('حسابدار هم ساعت ثبت نمی‌کند', async () => {
    expect(await canLogTime(actorOf(ownerId, ['finance']), null)).toBe(false);
  });
});

