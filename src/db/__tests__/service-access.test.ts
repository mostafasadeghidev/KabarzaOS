import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, sql } from '../client';
import { serviceGrants, services, userRoles, users } from '../schema';
import * as access from '@/server/access/service';
import { ForbiddenError } from '@/domain/access/guard';
import { AccessError } from '@/domain/access/service-grants';
import type { Actor, Permission } from '@/domain/access/permissions';

/**
 * دفترِ دسترسی‌های بیرونی — قواعدی که فقط با دیتابیسِ واقعی ثابت می‌شوند:
 * شاخصِ یکتای **جزئی**، ماندنِ ردیفِ قطع‌شده، و غیرفعال‌سازیِ سرویس.
 */

const actor = (over: Partial<Actor> = {}): Actor => ({
  id: 1, roles: [], permissions: [], privateAccess: false, ...over,
});
const viewer = () => actor({ id: 1, permissions: ['members.view'] as Permission[] });
const manager = () => actor({ id: 1, permissions: ['members.manage'] as Permission[] });

let boss: number, dev: number, gone: number, buyer: number;
let ai: number, voip: number;

beforeAll(async () => {
  await sql`truncate table audit_log, service_grants, services, user_roles, users
    restart identity cascade`;

  const rows = await db.insert(users).values([
    { email: 'boss@t', name: 'مدیر' },
    { email: 'dev@t', name: 'برنامه‌نویس' },
    { email: 'gone@t', name: 'رفته', memberState: 'locked' },
    { email: 'buyer@t', name: 'کارفرما' },
  ]).returning({ id: users.id });
  [boss, dev, gone, buyer] = rows.map((r) => r.id) as [number, number, number, number];

  await db.insert(userRoles).values([
    { userId: boss, role: 'owner' },
    { userId: dev, role: 'member' },
    { userId: gone, role: 'member' },
    { userId: buyer, role: 'client' },
  ]);

  ai = await access.saveService(manager(), {
    id: null, name: 'ChatGPT', kind: 'ai', ownerUserId: boss,
    adminUrl: 'https://chat.example', note: '', isActive: true,
  });
  voip = await access.saveService(manager(), {
    id: null, name: 'VoIP', kind: 'voip', ownerUserId: null,
    adminUrl: '', note: '', isActive: true,
  });
});

afterAll(async () => { await sql.end(); });

describe('گاردِ دسترسی', () => {
  it('بدونِ members.view دفتر باز نمی‌شود', async () => {
    await expect(access.accessBoard(actor())).rejects.toThrow(ForbiddenError);
  });

  it('⚠️ دیدن کافی نیست — نوشتن members.manage می‌خواهد', async () => {
    await expect(access.saveService(viewer(), {
      id: null, name: 'X', kind: 'other', ownerUserId: null,
      adminUrl: '', note: '', isActive: true,
    })).rejects.toThrow(ForbiddenError);
    await expect(access.grantAccess(viewer(), {
      serviceId: ai, userId: dev, accountRef: '', level: 'member', vaultRef: '', note: '',
    })).rejects.toThrow(ForbiddenError);
    await expect(access.revokeAccess(viewer(), 1)).rejects.toThrow(ForbiddenError);
  });
});

describe('اعطای دسترسی', () => {
  it('ردیفِ تازه ساخته می‌شود و در دفتر دیده می‌شود', async () => {
    await access.grantAccess(manager(), {
      serviceId: ai, userId: dev, accountRef: 'dev@t', level: 'member',
      vaultRef: 'vault/chatgpt', note: '',
    });

    const board = await access.accessBoard(viewer());
    expect(board.grants).toHaveLength(1);
    expect(board.grants[0]!.userName).toBe('برنامه‌نویس');
    expect(board.services.find((s) => s.id === ai)!.openCount).toBe(1);
  });

  it('⚠️ اعطای دوباره ردیفِ تکراری نمی‌سازد — همان را به‌روز می‌کند', async () => {
    // شاخصِ یکتای جزئی درجِ دوم را رد می‌کرد؛ سرویس پیش از درج تصمیم می‌گیرد.
    await access.grantAccess(manager(), {
      serviceId: ai, userId: dev, accountRef: 'dev@t', level: 'admin',
      vaultRef: '', note: 'ارتقا',
    });

    const rows = await db.select().from(serviceGrants).where(eq(serviceGrants.userId, dev));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.level).toBe('admin');
  });

  it('⚠️ به عضوِ سابق دسترسیِ تازه داده نمی‌شود', async () => {
    await expect(access.grantAccess(manager(), {
      serviceId: ai, userId: gone, accountRef: '', level: 'member', vaultRef: '', note: '',
    })).rejects.toThrow(AccessError);
  });

  it('سرویسِ غیرفعال دسترسیِ تازه نمی‌دهد', async () => {
    const dead = await access.saveService(manager(), {
      id: null, name: 'مرده', kind: 'other', ownerUserId: null,
      adminUrl: '', note: '', isActive: false,
    });
    await expect(access.grantAccess(manager(), {
      serviceId: dead, userId: dev, accountRef: '', level: 'member', vaultRef: '', note: '',
    })).rejects.toThrow(AccessError);
  });

  it('کاربرِ ناموجود رد می‌شود', async () => {
    await expect(access.grantAccess(manager(), {
      serviceId: ai, userId: 9999, accountRef: '', level: 'member', vaultRef: '', note: '',
    })).rejects.toThrow(AccessError);
  });
});

describe('R-ACCESS-01 — قطع یعنی مهرِ زمان، نه حذف', () => {
  it('ردیف می‌ماند و تاریخِ قطع می‌خورد', async () => {
    const [grant] = await db.select().from(serviceGrants).where(eq(serviceGrants.userId, dev));
    await access.revokeAccess(manager(), grant!.id);

    const [after] = await db.select().from(serviceGrants).where(eq(serviceGrants.id, grant!.id));
    expect(after).toBeDefined();
    expect(after!.revokedAt).not.toBeNull();
    expect(after!.revokedBy).toBe(1);
  });

  it('قطعِ دوباره خطاست — تاریخِ قطع بازنویسی نمی‌شود', async () => {
    const [grant] = await db.select().from(serviceGrants).where(eq(serviceGrants.userId, dev));
    await expect(access.revokeAccess(manager(), grant!.id)).rejects.toThrow(AccessError);
  });

  it('⚠️ بعد از قطع می‌شود دوباره دسترسی داد — یکتایی فقط روی بازهاست', async () => {
    // با یکتاییِ کامل، کسی که رفت و برگشت دیگر نمی‌توانست دسترسی بگیرد.
    await access.grantAccess(manager(), {
      serviceId: ai, userId: dev, accountRef: 'dev@t', level: 'viewer', vaultRef: '', note: '',
    });

    const rows = await db.select().from(serviceGrants).where(eq(serviceGrants.userId, dev));
    expect(rows).toHaveLength(2);
    expect(rows.filter((r) => r.revokedAt === null)).toHaveLength(1);
  });
});

describe('سرویس‌ها', () => {
  it('⚠️ حذف نمی‌شود، غیرفعال می‌شود — تاریخچه با cascade نمی‌رود', async () => {
    await access.deleteService(manager(), voip);

    const [row] = await db.select().from(services).where(eq(services.id, voip));
    expect(row).toBeDefined();
    expect(row!.isActive).toBe(false);
  });
});

describe('دفتر', () => {
  it('کارفرما در فهرستِ افراد نیست', async () => {
    const board = await access.accessBoard(viewer());
    expect(board.people.map((p) => p.id)).not.toContain(buyer);
    expect(board.people.map((p) => p.id)).toContain(dev);
  });

  it('⚠️ عضوی که سابق شد و دسترسیِ باز دارد، ریسک می‌شود', async () => {
    // همان کارِ نیمه‌تمامِ off-boarding: حسابِ KabarzaOS بسته، سرویسِ بیرونی باز.
    await db.update(users).set({ memberState: 'locked' }).where(eq(users.id, dev));

    const board = await access.accessBoard(viewer());
    expect(board.risks.map((r) => r.userId)).toContain(dev);
    expect(board.risks.find((r) => r.userId === dev)!.grantIds).toHaveLength(1);

    await db.update(users).set({ memberState: 'active' }).where(eq(users.id, dev));
  });

  it('«دسترسی‌های من» فقط بازهای خودِ کاربر را می‌دهد', async () => {
    const mine = await access.myGrants(actor({ id: dev }));
    expect(mine).toHaveLength(1);
    expect(mine[0]!.serviceName).toBe('ChatGPT');
    expect(mine[0]!.level).toBe('viewer');

    expect(await access.myGrants(actor({ id: boss }))).toHaveLength(0);
  });
});
