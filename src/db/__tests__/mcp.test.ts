import { describe, it, expect, beforeAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { db, sql } from '../client';
import { apiKeys, auditLog, projectMembers, projects, tags, userRoles, users } from '../schema';
import { authenticateToken, createToken, listTokens, revokeToken, type TokenSession } from '@/server/mcp/tokens';
import { buildMcpServer } from '@/server/mcp/server';
import type { Actor } from '@/domain/access/permissions';

/**
 * MCP (۲.۷.۰) — توکنِ شخصی و ابزارها، از راهِ خودِ کلاینتِ SDK.
 * ⚠️ قلبِ آزمون: توکن هیچ‌چیزی بیش از دسترسیِ صاحبش نمی‌دهد.
 */

let OWNER = 0, MEMBER = 0, PROJECT = 0;
const actorOf = (id: number, roles: Actor['roles']): Actor => ({ id, roles, permissions: [], privateAccess: false });

async function connect(session: TokenSession) {
  const server = buildMcpServer(session);
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '1' });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const r = await client.callTool({ name, arguments: args }) as { content: Array<{ text: string }>; isError?: boolean };
    return { error: r.isError === true, text: r.content[0]!.text };
  };
  return { client, call };
}

async function sessionFor(actor: Actor, scope: 'read' | 'write') {
  const { token } = await createToken(actor, { name: `t-${scope}`, scope });
  const auth = await authenticateToken(token);
  if (!auth.ok) throw new Error('auth failed');
  return { token, session: auth.session };
}

beforeAll(async () => {
  await sql`truncate table api_keys, tasks, project_members, projects, user_roles, tags, audit_log, users restart identity cascade`;
  const u = await db.insert(users).values([
    { email: 'own@m', name: 'مالک' }, { email: 'mem@m', name: 'عضو' },
  ]).returning({ id: users.id });
  [OWNER, MEMBER] = u.map((r) => r.id) as [number, number];
  await db.insert(userRoles).values([{ userId: OWNER, role: 'owner' }, { userId: MEMBER, role: 'member' }]);
  const [role] = await db.insert(tags).values({ name: 'دولوپر', type: 'member_role' }).returning({ id: tags.id });
  const [p] = await db.insert(projects).values({ title: 'پروژهٔ محرمانه‌قیمت', scope: 'company', price: '9999' })
    .returning({ id: projects.id });
  PROJECT = p!.id;
  await db.insert(projectMembers).values({
    projectId: PROJECT, userId: MEMBER, roleTagId: role!.id, agreedAmount: '4321',
  });
});

describe('توکنِ شخصی', () => {
  it('فقط هش ذخیره می‌شود و فهرست مالِ خودِ کاربر است', async () => {
    const { token } = await createToken(actorOf(MEMBER, ['member']), { name: 'لپ‌تاپ', scope: 'read' });
    const [row] = await db.select().from(apiKeys).where(eq(apiKeys.name, 'لپ‌تاپ'));
    expect(row!.hash).not.toContain(token);
    expect(row!.hash).toHaveLength(64);
    expect((await listTokens(actorOf(OWNER, ['owner']))).some((t) => t.name === 'لپ‌تاپ')).toBe(false);
  });

  it('باطل‌شده و عضوِ قطع‌شده پذیرفته نمی‌شوند؛ دیگری نمی‌تواند باطلش کند', async () => {
    const member = actorOf(MEMBER, ['member']);
    const { token, id } = await createToken(member, { name: 'موقت', scope: 'read' });
    await expect(revokeToken(actorOf(OWNER, ['owner']), id)).rejects.toThrow();
    await revokeToken(member, id);
    expect(await authenticateToken(token)).toEqual({ ok: false, reason: 'invalid' });

    const live = await createToken(member, { name: 'زنده', scope: 'read' });
    await db.update(users).set({ memberState: 'locked' }).where(eq(users.id, MEMBER));
    expect(await authenticateToken(live.token)).toEqual({ ok: false, reason: 'inactive' });
    await db.update(users).set({ memberState: 'active' }).where(eq(users.id, MEMBER));
  });
});

describe('ابزارها با دسترسیِ صاحبِ توکن', () => {
  it('عضو: نه قیمتِ پروژه، نه مبلغِ توافقی', async () => {
    const { session } = await sessionFor(actorOf(MEMBER, ['member']), 'read');
    const { call, client } = await connect(session);
    const list = await call('list_projects');
    expect(list.error).toBe(false);
    expect(list.text).toContain('پروژهٔ محرمانه‌قیمت');
    expect(list.text).not.toContain('9999');
    expect(list.text).not.toContain('price');
    const detail = await call('get_project', { project_id: PROJECT });
    expect(detail.text).not.toContain('4321');
    expect(detail.text).not.toMatch(/agreed|unitRate/i);
    await client.close();
  });

  it('مالک قیمت را می‌بیند (همان‌طور که در برنامه)', async () => {
    const { session } = await sessionFor(actorOf(OWNER, ['owner']), 'read');
    const { call, client } = await connect(session);
    expect((await call('list_projects')).text).toContain('9999');
    await client.close();
  });

  it('توکنِ فقط‌خواندنی نمی‌نویسد و ثبتی هم نمی‌سازد', async () => {
    const { session } = await sessionFor(actorOf(MEMBER, ['member']), 'read');
    const { call, client } = await connect(session);
    const before = await db.select().from(auditLog).where(eq(auditLog.action, 'mcp.call'));
    const r = await call('log_hours', { project_id: PROJECT, hours: 1 });
    expect(r.error).toBe(true);
    const after = await db.select().from(auditLog).where(eq(auditLog.action, 'mcp.call'));
    expect(after.length).toBe(before.length);
    await client.close();
  });

  it('توکنِ نوشتنی: فراخوان با نامِ ابزار در «رویدادها» ثبت می‌شود', async () => {
    const { session } = await sessionFor(actorOf(MEMBER, ['member']), 'write');
    const { call, client } = await connect(session);
    const r = await call('create_task', { project_id: PROJECT, title: 'از راهِ MCP' });
    expect(r.error).toBe(false);
    const [row] = await db.select().from(auditLog).where(eq(auditLog.action, 'mcp.call'));
    expect(row).toMatchObject({ actorType: 'api_key', actorId: MEMBER });
    expect((row!.after as { tool: string }).tool).toBe('create_task');
    await client.close();
  });

  it('عضو ماتریسِ تیم را نمی‌بیند', async () => {
    const { session } = await sessionFor(actorOf(MEMBER, ['member']), 'read');
    const { call, client } = await connect(session);
    expect((await call('team_availability')).error).toBe(true);
    await client.close();
  });
});
