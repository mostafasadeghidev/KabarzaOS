import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db, sql } from '../client';
import { currencies, projects, userRoles, users } from '../schema';
import { getInvoice } from '@/server/finance/invoice-service';
import { ForbiddenError } from '@/domain/access/guard';
import type { Actor } from '@/domain/access/permissions';

/** فاکتور — پورتِ گاردِ افزونه: `manage_projects` **یا** `manage_finance`، به‌علاوهٔ کارفرمای پروژه. */

const OWNER = 1, PM = 2, MEMBER = 3;
let project = 0;

beforeAll(async () => {
  await sql`truncate table audit_log, project_payments, project_clients, projects, user_roles, users, currencies
    restart identity cascade`;
  const [eur] = await db.insert(currencies).values({ code: 'EUR', name: 'یورو', symbol: '€', isDefault: true })
    .returning({ id: currencies.id });
  await db.insert(users).values([
    { email: 'o@t', name: 'مالک' }, { email: 'pm@t', name: 'مدیرِ پروژه' }, { email: 'm@t', name: 'عضو' },
  ]);
  await db.insert(userRoles).values([
    { userId: OWNER, role: 'owner' }, { userId: PM, role: 'member' }, { userId: MEMBER, role: 'member' },
  ]);
  const [p] = await db.insert(projects).values({ title: 'پروژه', price: '1000', currencyId: eur!.id })
    .returning({ id: projects.id });
  project = p!.id;
});

afterAll(async () => { await sql.end(); });

describe('دسترسیِ فاکتور', () => {
  it('مدیرِ پروژه بدونِ مجوزِ مالی هم فاکتور را می‌بیند؛ عضوِ عادی نه', async () => {
    const pm: Actor = { id: PM, roles: ['member'], permissions: ['projects.manage'], privateAccess: false };
    const inv = await getInvoice(pm, project);
    expect(inv.project.title).toBe('پروژه');

    const member: Actor = { id: MEMBER, roles: ['member'], permissions: [], privateAccess: false };
    await expect(getInvoice(member, project)).rejects.toBeInstanceOf(ForbiddenError);
  });
});
