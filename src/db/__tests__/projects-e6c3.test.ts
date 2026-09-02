import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db, sql } from '../client';
import {
  currencies, projectMembers, projectQa, projects, qaItems, tagRelations, tags, tasks, timelogs, userRoles, users,
} from '../schema';
import { getProjectTabs } from '@/server/projects/service';
import type { Actor } from '@/domain/access/permissions';

/** تبِ مدیریت/QA — ریزِ ثبت‌ها، ماتریسِ اعضا، رنگِ نقش، تسکِ ساخته‌شده از QA. */

const OWNER = 1, M1 = 2;
const owner = (): Actor => ({ id: OWNER, roles: ['owner'], permissions: [], privateAccess: false });
let P = 0;

beforeAll(async () => {
  await sql`truncate table audit_log, project_qa, qa_items, tag_relations, timelogs, tasks, project_members,
    project_clients, projects, tags, user_roles, users, currencies restart identity cascade`;
  const [eur] = await db.insert(currencies).values({ code: 'EUR', name: 'یورو', symbol: '€', isDefault: true }).returning({ id: currencies.id });
  await db.insert(users).values([{ email: 'o@t', name: 'مالک' }, { email: 'm1@t', name: 'سارا' }]);
  await db.insert(userRoles).values([{ userId: OWNER, role: 'owner' }, { userId: M1, role: 'member' }]);
  const tg = await db.insert(tags).values([
    { name: 'دولوپر', type: 'member_role', color: '#123456' },
    { name: 'در حال انجام', type: 'project_status', statusGroup: 'in_progress' },
    { name: 'شروع نشده', type: 'task_status', statusGroup: 'todo', color: '#abcdef' },
  ]).returning({ id: tags.id });
  const [dev, inp, todo] = [tg[0]!.id, tg[1]!.id, tg[2]!.id];
  await db.insert(tagRelations).values({ objectType: 'user', objectId: M1, tagId: dev });
  const [p] = await db.insert(projects).values({ title: 'پروژه', price: '0', currencyId: eur!.id, statusTagId: inp }).returning({ id: projects.id });
  P = p!.id;
  await db.insert(projectMembers).values({ projectId: P, userId: M1, roleTagId: dev, agreedAmount: '0' });
  await db.insert(timelogs).values([
    { projectId: P, userId: M1, logDate: '2026-09-01', minutes: 30, description: 'اول' },
    { projectId: P, userId: M1, logDate: '2026-09-02', minutes: 45, description: 'دوم' },
  ]);
  const [item] = await db.insert(qaItems).values({ title: 'تستِ نهایی', roleTagId: dev, isTask: true }).returning({ id: qaItems.id });
  await db.insert(projectQa).values({ projectId: P, qaItemId: item!.id, roleTagId: dev, title: 'تستِ نهایی' });
  await db.insert(tasks).values({ projectId: P, title: 'تستِ نهایی', statusTagId: todo, createdBy: OWNER });
});

afterAll(async () => { await sql.end(); });

describe('تبِ مدیریت و QA (پورتِ تبِ تیم)', () => {
  it('ریزِ ثبت‌ها تازه‌تر اول؛ ماتریسِ اعضا ۷ خانه؛ رنگِ نقش؛ تسکِ QA با وضعیت', async () => {
    const tabs = await getProjectTabs(owner(), P);
    expect(tabs.logs.map((l) => l.description)).toEqual(['دوم', 'اول']);
    expect(tabs.matrix).toHaveLength(1);
    expect(tabs.matrix[0]!.cells).toHaveLength(7);
    expect(tabs.matrix[0]!.roles).toEqual(['دولوپر']);
    expect(tabs.dayLabels).toHaveLength(7);
    expect(tabs.members[0]!.roleColor).toBe('#123456');
    const qa = tabs.qa.find((q) => q.title === 'تستِ نهایی')!;
    expect(qa.taskId).not.toBeNull();
    expect(qa.taskStatusName).toBe('شروع نشده');
    expect(qa.taskStatusColor).toBe('#abcdef');
  });
});
