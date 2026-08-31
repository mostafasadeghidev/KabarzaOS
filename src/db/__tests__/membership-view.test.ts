import { eq } from 'drizzle-orm';
import { describe, it, expect, beforeAll } from 'vitest';
import { db, sql } from '../client';
import {
  offices, projectClients, projectMembers, projectQa, projects, tagRelations, tags, tasks,
  users, userRoles, meetings, meetingAttendees,
} from '../schema';
import {
  addComment, getProject, getTaskDetail, listProjects, NotFoundError,
  setTaskStatus, toggleQaItem,
} from '@/server/projects/service';
import { canViewProject, membershipProjectIds } from '@/server/projects/authority';
import { listMeetings } from '@/server/meetings/service';
import type { Actor } from '@/domain/access/permissions';

/**
 * دیدِ عضویت‌محور.
 *
 * ⚠️ چرا این پرونده مهم است: تا پیش از این، عضو و کارفرما — دو نقش از پنج
 * نقش — **اصلاً نمی‌توانستند واردِ اپ شوند**. لاگینِ موفق به `/login`
 * برمی‌گشت چون هیچ بخشی برایشان مجاز نبود. هر تستِ اینجا یکی از درهایی است
 * که باید باز می‌بود و نبود.
 */

const actor = (over: Partial<Actor> = {}): Actor => ({
  id: 1, roles: [], permissions: [], privateAccess: false, ...over,
});

let sara: number, reza: number, goli: number; // عضوها + کارفرما
let alpha: number, beta: number; // پروژه‌ها
let devTag: number, designTag: number; // نقش‌ها
let alphaTask: number, alphaPrivateTask: number;
let qaDev: number, qaClient: number;
let statusDone: number;

beforeAll(async () => {
  await sql`truncate table meetings, meeting_attendees, project_qa, tasks, task_roles,
    project_members, project_clients, projects, tags, user_offices, offices,
    user_roles, audit_log, notifications, users restart identity cascade`;

  const u = await db.insert(users).values([
    { email: 's@t', name: 'سارا' },
    { email: 'r@t', name: 'رضا' },
    { email: 'g@t', name: 'گلی (کارفرما)' },
  ]).returning({ id: users.id });
  [sara, reza, goli] = u.map((r) => r.id) as [number, number, number];

  await db.insert(userRoles).values([
    { userId: sara, role: 'member' },
    { userId: reza, role: 'member' },
    { userId: goli, role: 'client' },
  ]);

  const t = await db.insert(tags).values([
    { name: 'دولوپر', type: 'member_role' },
    { name: 'طراح', type: 'member_role' },
    { name: 'انجام شد', type: 'task_status', statusGroup: 'complete', isClosed: true },
  ]).returning({ id: tags.id });
  devTag = t[0]!.id; designTag = t[1]!.id; statusDone = t[2]!.id;

  const p = await db.insert(projects).values([
    { title: 'آلفا', scope: 'company' },
    { title: 'بتا', scope: 'company' },
  ]).returning({ id: projects.id });
  alpha = p[0]!.id; beta = p[1]!.id;

  // سارا با نقشِ دولوپر روی آلفا؛ گلی کارفرمای آلفا. رضا هیچ‌جا نیست.
  await db.insert(projectMembers).values({ projectId: alpha, userId: sara, roleTagId: devTag });
  await db.insert(projectClients).values({ projectId: alpha, userId: goli });

  const tk = await db.insert(tasks).values([
    { projectId: alpha, title: 'تسکِ سارا', assignedTo: sara, scope: 'company' },
    { projectId: alpha, title: 'تسکِ خصوصیِ دیگری', assignedTo: reza, isPrivate: true, createdBy: reza, scope: 'company' },
  ]).returning({ id: tasks.id });
  alphaTask = tk[0]!.id; alphaPrivateTask = tk[1]!.id;

  const qa = await db.insert(projectQa).values([
    { projectId: alpha, title: 'چکِ دولوپر', roleTagId: devTag },
    // ⚠️ آیتمِ کارفرمایی در دیتابیس roleTagId=NULL دارد (سنتینلِ ۰ فقط در دامنه است).
    { projectId: alpha, title: 'تأییدِ کارفرما', roleTagId: null },
  ]).returning({ id: projectQa.id });
  qaDev = qa[0]!.id; qaClient = qa[1]!.id;

  const m = await db.insert(meetings).values([
    { title: 'جلسهٔ آلفا', meetAt: new Date(Date.now() + 86400000), scope: 'company', createdBy: reza },
    { title: 'جلسهٔ مدیران', meetAt: new Date(Date.now() + 86400000), scope: 'company', createdBy: reza },
  ]).returning({ id: meetings.id });
  await db.insert(meetingAttendees).values({ meetingId: m[0]!.id, userId: sara });
});

describe('فهرستِ پروژه‌ها', () => {
  it('عضو فقط پروژه‌های خودش را می‌بیند', async () => {
    const rows = await listProjects(actor({ id: sara, roles: ['member'] }));
    expect(rows.map((r) => r.title)).toEqual(['آلفا']);
  });

  it('کارفرما فقط پروژه‌های خودش را می‌بیند', async () => {
    const rows = await listProjects(actor({ id: goli, roles: ['client'] }));
    expect(rows.map((r) => r.title)).toEqual(['آلفا']);
  });

  it('عضوِ بی‌پروژه فهرستِ خالی می‌گیرد، نه خطا', async () => {
    expect(await listProjects(actor({ id: reza, roles: ['member'] }))).toEqual([]);
  });

  it('بینندهٔ مجوزی همه را می‌بیند (مثلِ قبل)', async () => {
    const rows = await listProjects(actor({ id: reza, permissions: ['projects.view'] }));
    expect(rows).toHaveLength(2);
  });

  it('membershipProjectIds عضویت و کارفرمایی را جمع می‌زند', async () => {
    expect(await membershipProjectIds(sara)).toEqual([alpha]);
    expect(await membershipProjectIds(goli)).toEqual([alpha]);
    expect(await membershipProjectIds(reza)).toEqual([]);
  });
});

describe('دیدِ تک‌پروژه', () => {
  it('عضو پروژهٔ خودش را باز می‌کند', async () => {
    const p = await getProject(actor({ id: sara, roles: ['member'] }), alpha);
    expect(p.title).toBe('آلفا');
  });

  it('⚠️ عضو پروژهٔ غریبه را «یافت نشد» می‌گیرد — نه ممنوع', async () => {
    await expect(getProject(actor({ id: sara, roles: ['member'] }), beta))
      .rejects.toBeInstanceOf(NotFoundError);
  });

  it('کارفرما پروژهٔ خودش را می‌بیند و غریبه را نه', async () => {
    await expect(getProject(actor({ id: goli, roles: ['client'] }), alpha)).resolves.toBeTruthy();
    await expect(getProject(actor({ id: goli, roles: ['client'] }), beta))
      .rejects.toBeInstanceOf(NotFoundError);
  });

  it('canViewProject سه مسیر را می‌شناسد', async () => {
    expect(await canViewProject(actor({ id: sara, roles: ['member'] }), alpha)).toBe(true);
    expect(await canViewProject(actor({ id: reza, roles: ['member'] }), alpha)).toBe(false);
    expect(await canViewProject(actor({ id: reza, permissions: ['projects.view'] }), alpha)).toBe(true);
  });
});

describe('کارهای عضو روی پروژهٔ خودش', () => {
  it('عضو کامنت می‌گذارد', async () => {
    await expect(addComment(actor({ id: sara, roles: ['member'] }), alpha, 'گزارشِ پیشرفت'))
      .resolves.not.toThrow();
  });

  it('⚠️ غیرعضو کامنت نمی‌گذارد', async () => {
    await expect(addComment(actor({ id: reza, roles: ['member'] }), alpha, 'فضولی'))
      .rejects.toThrow();
  });

  it('⚠️ عضو وضعیتِ تسکِ دیدنی را عوض می‌کند — چرخهٔ ریویو', async () => {
    await expect(setTaskStatus(actor({ id: sara, roles: ['member'] }), alphaTask, statusDone))
      .resolves.not.toThrow();
  });

  it('⚠️ عضو تسکِ خصوصیِ دیگری را نه می‌بیند نه جابه‌جا می‌کند', async () => {
    await expect(setTaskStatus(actor({ id: sara, roles: ['member'] }), alphaPrivateTask, statusDone))
      .rejects.toBeInstanceOf(NotFoundError);
    await expect(getTaskDetail(actor({ id: sara, roles: ['member'] }), alphaPrivateTask))
      .rejects.toBeInstanceOf(NotFoundError);
  });

  it('عضو جزئیاتِ تسکِ عادی را می‌بیند', async () => {
    const d = await getTaskDetail(actor({ id: sara, roles: ['member'] }), alphaTask);
    expect(d.task.title).toBe('تسکِ سارا');
  });
});

describe('تیکِ QA — سه‌شرطیِ نسخهٔ قبلی', () => {
  it('عضو آیتمِ نقشِ خودش را تیک می‌زند', async () => {
    await expect(toggleQaItem(actor({ id: sara, roles: ['member'] }), qaDev))
      .resolves.toBe(alpha);
  });

  it('⚠️ عضو آیتمِ کارفرمایی را تیک نمی‌زند', async () => {
    await expect(toggleQaItem(actor({ id: sara, roles: ['member'] }), qaClient))
      .rejects.toThrow();
  });

  it('⚠️ کارفرما آیتمِ کارفرمایی را تیک می‌زند — R-QA-02 بالاخره روشن شد', async () => {
    await expect(toggleQaItem(actor({ id: goli, roles: ['client'] }), qaClient))
      .resolves.toBe(alpha);
  });

  it('کارفرما آیتمِ نقشِ اعضا را تیک نمی‌زند', async () => {
    await expect(toggleQaItem(actor({ id: goli, roles: ['client'] }), qaDev))
      .rejects.toThrow();
  });
});

describe('جلساتِ عضو', () => {
  it('عضو فقط جلساتی را می‌بیند که دعوت است', async () => {
    const { meetings: rows } = await listMeetings(actor({ id: sara, roles: ['member'] }));
    expect(rows.map((m) => m.title)).toEqual(['جلسهٔ آلفا']);
  });

  it('عضوِ دعوت‌نشده فهرستِ خالی می‌گیرد، نه خطا', async () => {
    const { meetings: rows } = await listMeetings(actor({ id: goli, roles: ['client'] }));
    expect(rows).toEqual([]);
  });

  it('بینندهٔ مجوزی هر دو جلسه را می‌بیند', async () => {
    const { meetings: rows } = await listMeetings(actor({ id: reza, permissions: ['meetings.view'] }));
    expect(rows).toHaveLength(2);
  });
});

describe('مناقصه از چشمِ عضو', () => {
  it('⚠️ مناقصهٔ باز با نقشِ کاربر در فهرستش می‌آید — بدونِ عضویت', async () => {
    // پروژهٔ مناقصه با نقشِ دولوپر اعلام می‌شود؛ سارا دولوپر است.
    const [tender] = await db.insert(projects).values({
      title: 'مناقصهٔ گاما', scope: 'company', isTender: true,
      tenderRoles: { [String(devTag)]: null },
    }).returning({ id: projects.id });
    await db.insert(tagRelations).values({
      objectType: 'user', objectId: sara, tagId: devTag,
    });

    const rows = await listProjects(actor({ id: sara, roles: ['member'] }));
    expect(rows.map((r) => r.title)).toContain('مناقصهٔ گاما');

    // رضا (طراح نیست، دولوپر نیست — تگی ندارد) نمی‌بیندش.
    const rezaRows = await listProjects(actor({ id: reza, roles: ['member'] }));
    expect(rezaRows.map((r) => r.title)).not.toContain('مناقصهٔ گاما');
    void tender;
  });

  it('⚠️ مبلغِ پیشنهادِ رقبا به عضوِ غیرمدیرِ پروژه نمی‌رسد', async () => {
    const { getProjectTabs } = await import('@/server/projects/service');
    const [gamma] = await db.select({ id: projects.id }).from(projects)
      .where(eq(projects.title, 'مناقصهٔ گاما'));

    // نقش‌دارِ غیرعضو اصلاً به تب‌ها نمی‌رسد — نمای تنگِ پیشنهاددهنده می‌گیرد.
    await expect(getProjectTabs(actor({ id: sara, roles: ['member'] }), gamma!.id))
      .rejects.toBeInstanceOf(NotFoundError);

    // عضوِ خودِ پروژهٔ مناقصه: تب‌ها را می‌گیرد ولی فهرستِ پیشنهادها خالی است.
    await db.insert(projectMembers).values({ projectId: gamma!.id, userId: sara, roleTagId: devTag });
    const tabs = await getProjectTabs(actor({ id: sara, roles: ['member'] }), gamma!.id);
    expect(tabs.bids).toEqual([]);

    // مدیر همچنان همه را می‌بیند.
    const managerTabs = await getProjectTabs(
      actor({ id: reza, permissions: ['projects.view', 'projects.manage'] }),
      gamma!.id,
    );
    expect(Array.isArray(managerTabs.bids)).toBe(true);
  });
});

