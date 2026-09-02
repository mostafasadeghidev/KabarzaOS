import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, sql } from '../client';
import {
  currencies, users, userRoles, tags, projects, projectMembers, projectClients, projectQa, qaItems,
  comments, projectPayments, accounts, ledger,
} from '../schema';
import { addComment, getProjectTabs } from '@/server/projects/service';
import { myRequests } from '@/server/finance/member-service';
import type { Actor } from '@/domain/access/permissions';

/** صفحهٔ پروژه — انجماد، متا، QA به‌ازای بیننده، رشتهٔ بازبینی، پولِ عضو. */

const OWNER = 1, DEV = 2, CLIENT = 3;
const actor = (id: number, roles: Actor['roles'], perms: Actor['permissions'] = []): Actor =>
  ({ id, roles, permissions: perms, privateAccess: false });
const owner = () => actor(OWNER, ['owner']);

let eur: number, devRole: number, project: number, onHold: number, parent: number;

beforeAll(async () => {
  await sql`truncate table audit_log, comments, project_qa, qa_items, ledger, accounts, project_payments,
    project_members, project_clients, projects, tags, users, currencies restart identity cascade`;

  const c = await db.insert(currencies).values({ code: 'EUR', name: 'یورو', symbol: '€', isDefault: true })
    .returning({ id: currencies.id });
  eur = c[0]!.id;
  await db.insert(users).values([
    { email: 'o@t', name: 'مالک' }, { email: 'd@t', name: 'دولوپر' }, { email: 'c@t', name: 'کارفرما' },
  ]);
  await db.insert(userRoles).values([
    { userId: OWNER, role: 'owner' }, { userId: DEV, role: 'member' }, { userId: CLIENT, role: 'client' },
  ]);
  const t = await db.insert(tags).values([
    { name: 'دولوپر', type: 'member_role' },
    { name: 'طراح', type: 'member_role' },
    { name: 'در حال انجام', type: 'project_status', statusGroup: 'in_progress' },
    { name: 'متوقف', type: 'project_status', statusGroup: 'on_hold' },
  ]).returning({ id: tags.id });
  devRole = t[0]!.id;
  const designRole = t[1]!.id;

  const p = await db.insert(projects).values([
    { title: 'والد', price: '0', currencyId: eur, statusTagId: t[2]!.id, regDate: '2026-08-01' },
    { title: 'وب‌سایت', price: '1000', currencyId: eur, statusTagId: t[2]!.id, regDate: '2026-08-10', deadline: '2026-12-31' },
    { title: 'متوقف‌شده', price: '0', currencyId: eur, statusTagId: t[3]!.id },
  ]).returning({ id: projects.id });
  parent = p[0]!.id; project = p[1]!.id; onHold = p[2]!.id;
  await db.update(projects).set({ parentId: parent }).where(eq(projects.id, project));

  await db.insert(projectMembers).values([
    { projectId: project, userId: DEV, roleTagId: devRole, agreedAmount: '500', currencyId: eur },
    { projectId: onHold, userId: DEV, roleTagId: devRole, agreedAmount: '0' },
  ]);
  await db.insert(projectClients).values({ projectId: project, userId: CLIENT });

  const q = await db.insert(qaItems).values([
    { title: 'تستِ واحد', roleTagId: devRole },
    { title: 'بازبینیِ طرح', roleTagId: designRole },
    { title: 'تأییدِ نهایی', roleTagId: null },
  ]).returning({ id: qaItems.id, roleTagId: qaItems.roleTagId, title: qaItems.title });
  await db.insert(projectQa).values(q.map((item) => ({ projectId: project, qaItemId: item.id, roleTagId: item.roleTagId, title: item.title })));

  const a = await db.insert(accounts).values({ name: 'حساب', currencyId: eur, openingBalance: '1000' }).returning({ id: accounts.id });
  const l = await db.insert(ledger).values({
    accountId: a[0]!.id, entryDate: '2026-08-20', direction: 'out', amount: '200', currencyId: eur, amountAccount: '200',
    receiverUserId: DEV, projectId: project, description: 'پرداختِ دستمزد',
  }).returning({ id: ledger.id });
  await db.insert(projectPayments).values({
    projectId: project, userId: DEV, ledgerId: l[0]!.id, direction: 'member_payout', amount: '200', currencyId: eur,
    paidAt: new Date('2026-08-20T00:00:00Z'), note: 'قسطِ اول',
  });
});

afterAll(async () => { await sql.end(); });

describe('انجماد و متای جزئیات', () => {
  it('پروژهٔ متوقف منجمد است؛ پروژهٔ در حال انجام نه', async () => {
    const frozen = await getProjectTabs(actor(DEV, ['member']), onHold);
    expect(frozen.isFrozen).toBe(true);
    const live = await getProjectTabs(actor(DEV, ['member']), project);
    expect(live.isFrozen).toBe(false);
  });

  it('متا: والد، ساعتِ من برای عضو، ساعتِ تیم برای مدیر', async () => {
    const asMember = await getProjectTabs(actor(DEV, ['member']), project);
    expect(asMember.meta.parent).toEqual({ id: parent, title: 'والد' });
    expect(asMember.meta.myMinutes).toBe(0);
    expect(asMember.meta.teamMinutes).toBeNull();
    const asOwner = await getProjectTabs(owner(), project);
    expect(asOwner.meta.myMinutes).toBeNull();
    expect(asOwner.meta.teamMinutes).toBe(0);
    const asParent = await getProjectTabs(owner(), parent);
    expect(asParent.meta.children.map((c) => c.id)).toEqual([project]);
  });
});

describe('QA به‌ازای بیننده — پورتِ qa_visible_items', () => {
  it('مدیر همه؛ عضو فقط نقشِ خودش؛ کارفرما فقط آیتمِ کارفرمایی', async () => {
    expect((await getProjectTabs(owner(), project)).qa).toHaveLength(3);
    const dev = await getProjectTabs(actor(DEV, ['member']), project);
    expect(dev.qa.map((q) => q.title)).toEqual(['تستِ واحد']);
    const client = await getProjectTabs(actor(CLIENT, ['client']), project);
    expect(client.qa.map((q) => q.title)).toEqual(['تأییدِ نهایی']);
  });
});

describe('رشتهٔ بازبینی و پولِ عضو', () => {
  it('کامنتِ نوعِ بازبینی جدا ذخیره می‌شود', async () => {
    await addComment(actor(DEV, ['member']), project, 'لطفاً بازبینی کنید', 'review');
    await addComment(actor(DEV, ['member']), project, 'یک یادداشت');
    const rows = await db.select().from(comments).where(eq(comments.projectId, project));
    expect(rows.map((r) => r.type).sort()).toEqual(['comment', 'review']);
  });

  it('توافقی / پرداخت‌شده / وضعیت / ردیف‌های پرداخت برای عضو', async () => {
    const mine = await myRequests(actor(DEV, ['member']), project);
    expect(Number(mine.agreed)).toBe(500);
    expect(Number(mine.paid)).toBe(200);
    expect(Number(mine.remaining)).toBe(300);
    expect(mine.status).toBe('partial');
    expect(mine.payouts).toHaveLength(1);
    expect(mine.payouts[0]).toMatchObject({ note: 'قسطِ اول', currencyCode: 'EUR' });
  });

  it('کارفرما «پرداخت به عضو» را نمی‌بیند ولی معادلِ محاسبه‌شده روی ردیف‌های خودش هست', async () => {
    const client = await getProjectTabs(actor(CLIENT, ['client']), project);
    expect(client.payments.every((p) => p.direction !== 'member_payout')).toBe(true);
    const asOwner = await getProjectTabs(owner(), project);
    expect(asOwner.payments[0]!.countedValue).toBe('200.0000');
  });
});
