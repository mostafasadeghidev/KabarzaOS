import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, sql } from '../client';
import {
  currencies, exchangeRates, projectMembers, projectPayments, projects, tags, tasks, unitEntries,
  userRoles, users,
} from '../schema';
import {
  addProjectMember, createProject, createTask, getTaskDetail, setMembers, updateProject,
} from '@/server/projects/service';
import { owedUserIds } from '@/server/projects/repository';
import {
  addUnitEntry, contractSummary, MemberMoneyError, requestForUnit,
} from '@/server/finance/member-service';
import { getProjectsReport } from '@/server/reports/service';
import type { Actor } from '@/domain/access/permissions';

/**
 * بستنِ ردیف‌های بازِ ممیزیِ سپتامبر — گاردها و پولِ چندارزی.
 *
 * ⚠️ هر تست یک ردیفِ مشخصِ ممیزی را قفل می‌کند؛ نامِ تست همان ردیف است.
 */

const OWNER = 1, PM = 2, DEV = 3;
const owner = (): Actor => ({ id: OWNER, roles: ['owner'], permissions: [], privateAccess: false });
const member = (id: number): Actor => ({ id, roles: ['member'], permissions: [], privateAccess: false });

let EUR = 0, USD = 0, PM_ROLE = 0, DEV_ROLE = 0, STATUS = 0, TODO = 0;
let project = 0;

async function newProject(title: string, extra: Partial<{ isUnitBased: boolean; price: string }> = {}) {
  return createProject(owner(), {
    title, description: '', regDate: '2026-09-01', deadline: null, statusTagId: STATUS,
    price: extra.price ?? '1000', currencyId: EUR, officeId: null, parentId: null,
    isUnitBased: extra.isUnitBased ?? false, isTender: false, scope: 'company',
  } as Parameters<typeof createProject>[1]);
}

beforeAll(async () => {
  await sql`truncate table audit_log, notifications, comments, task_roles, tasks, timelogs, unit_entries,
    payment_requests, project_payments, project_members, project_clients, projects, tags, user_roles, users,
    exchange_rates, currencies restart identity cascade`;

  const c = await db.insert(currencies).values([
    { code: 'EUR', name: 'یورو', symbol: '€', isDefault: true },
    { code: 'USD', name: 'دلار', symbol: '$' },
  ]).returning({ id: currencies.id });
  [EUR, USD] = [c[0]!.id, c[1]!.id];
  await db.insert(exchangeRates).values({
    fromCurrencyId: USD, toCurrencyId: EUR, rate: '0.9', effectiveDate: '2026-01-01',
  });

  await db.insert(users).values([
    { email: 'o@t', name: 'مالک' }, { email: 'pm@t', name: 'مدیرِ پروژه' }, { email: 'dev@t', name: 'سارا' },
  ]);
  await db.insert(userRoles).values([
    { userId: OWNER, role: 'owner' }, { userId: PM, role: 'member' }, { userId: DEV, role: 'member' },
  ]);

  const tg = await db.insert(tags).values([
    { name: 'مدیر پروژه', type: 'member_role', grantsCap: 'pm' },
    { name: 'دولوپر', type: 'member_role' },
    { name: 'در حال انجام', type: 'project_status', statusGroup: 'in_progress' },
    { name: 'شروع نشده', type: 'task_status', statusGroup: 'todo' },
  ]).returning({ id: tags.id });
  [PM_ROLE, DEV_ROLE, STATUS, TODO] = tg.map((t) => t.id) as [number, number, number, number];

  project = await newProject('آلفا');
  await addProjectMember(owner(), project, { userId: PM, roleTagId: PM_ROLE, agreedAmount: '0' });
  await addProjectMember(owner(), project, { userId: DEV, roleTagId: DEV_ROLE, agreedAmount: '100', currencyId: EUR });
});

afterAll(async () => { await sql.end(); });

describe('گاردها', () => {
  it('D#50 — نقشِ عضو باید تگِ member_role باشد، نه وضعیت یا هر تگِ دیگر', async () => {
    await expect(addProjectMember(owner(), project, { userId: DEV, roleTagId: STATUS, agreedAmount: '0' }))
      .rejects.toThrow();
    await expect(setMembers(owner(), project, [
      { userId: DEV, roleTagId: TODO, agreedAmount: '0' },
    ] as Parameters<typeof setMembers>[2])).rejects.toThrow();
  });

  it('D#94 — مدیرِ پروژهٔ تگ‌دار قیمت و ارز را عوض نمی‌کند؛ عنوان را چرا', async () => {
    await updateProject(member(PM), project, {
      title: 'آلفا (تازه)', description: '', regDate: '2026-09-01', deadline: null, statusTagId: STATUS,
      price: '1', currencyId: USD, officeId: null, parentId: null, isUnitBased: false, isTender: false,
      scope: 'company',
    });
    const [row] = await db.select().from(projects).where(eq(projects.id, project));
    expect(row!.title).toBe('آلفا (تازه)');
    expect([row!.price, row!.currencyId]).toEqual(['1000.0000', EUR]);
  });

  it('B#49 — مدیرِ پروژه تسک را به مالکی می‌دهد که عضوِ پروژه نیست', async () => {
    const id = await createTask(member(PM), project, {
      title: 'امضای قرارداد', description: '', statusTagId: TODO, priorityTagId: null,
      assignedTo: OWNER, dueDate: null, isPrivate: false, roleTagIds: [],
    });
    const [task] = await db.select({ assignedTo: tasks.assignedTo }).from(tasks).where(eq(tasks.id, id));
    expect(task!.assignedTo).toBe(OWNER);
  });

  it('D#132 — روی پروژهٔ منجمد، مودالِ تسک به مدیرِ پروژه دکمهٔ ویرایش نمی‌دهد؛ به مالک چرا', async () => {
    const id = await createTask(owner(), project, {
      title: 'تسکِ منجمد', description: '', statusTagId: TODO, priorityTagId: null,
      assignedTo: DEV, dueDate: null, isPrivate: false, roleTagIds: [],
    });
    await db.update(projects).set({ isArchived: true }).where(eq(projects.id, project));
    try {
      const asPm = await getTaskDetail(member(PM), id);
      expect([asPm.canManage, asPm.canInteract]).toEqual([false, false]);
      const asOwner = await getTaskDetail(owner(), id);
      expect(asOwner.canManage).toBe(true);
    } finally {
      await db.update(projects).set({ isArchived: false }).where(eq(projects.id, project));
    }
  });
});

describe('پولِ چندارزی', () => {
  it('B#83 — کارکردِ بی‌مبلغ درخواستِ پرداختِ صفر نمی‌سازد', async () => {
    const unitProject = await newProject('تعدادی', { isUnitBased: true });
    await addProjectMember(owner(), unitProject, { userId: DEV, roleTagId: DEV_ROLE, agreedAmount: '0' });
    const entryId = await addUnitEntry(member(DEV), {
      projectId: unitProject, userId: DEV, entryDate: '2026-09-10', quantity: 3, note: '',
    });
    const [entry] = await db.select({ amount: unitEntries.amount }).from(unitEntries).where(eq(unitEntries.id, entryId));
    expect(Number(entry!.amount)).toBe(0);
    await expect(requestForUnit(member(DEV), entryId)).rejects.toThrow(MemberMoneyError);
  });

  it('A#33 — پرداختیِ دلاری روی قراردادِ یورویی تبدیل می‌شود', async () => {
    await db.insert(projectPayments).values({
      projectId: project, userId: DEV, direction: 'member_payout', amount: '50', currencyId: USD,
      paidAt: '2026-09-15', amountEur: '45',
    });
    const s = await contractSummary(DEV, project);
    expect(s.currencyId).toBe(EUR);
    expect(Number(s.paid)).toBeCloseTo(45);
    expect(Number(s.remaining)).toBeCloseTo(55);
  });

  it('D#183 — طلب در ارزِ قرارداد سنجیده می‌شود', async () => {
    // تا اینجا ۴۵ یورو از ۱۰۰ پرداخت شده → طلبکار.
    expect((await owedUserIds(project)).has(DEV)).toBe(true);
    // ۶۲ دلار = ۵۵.۸ یورو → تسویه (با عددِ خام، ۱۱۲ «دلار» بیش از ۱۰۰ بود و تصادفاً درست درمی‌آمد).
    await db.insert(projectPayments).values({
      projectId: project, userId: DEV, direction: 'member_payout', amount: '62', currencyId: USD,
      paidAt: '2026-09-16', amountEur: '55.8',
    });
    expect((await owedUserIds(project)).has(DEV)).toBe(false);
  });

  it('C#79/#80 — هزینهٔ تیم = تعهد، سودِ تخمینی = قیمت − تعهد', async () => {
    const report = await getProjectsReport(owner());
    const row = report.find((r) => r.id === project)!;
    expect(Number(row.memberCost)).toBeCloseTo(100);
    expect(Number(row.profit)).toBeCloseTo(900);
  });

  it('ردیفِ عضوِ تازه در قراردادِ یورویی ارزِ پروژه را می‌گیرد', async () => {
    const [m] = await db.select({ currencyId: projectMembers.currencyId })
      .from(projectMembers)
      .where(eq(projectMembers.userId, PM));
    expect(m!.currencyId).toBe(EUR);
  });
});
