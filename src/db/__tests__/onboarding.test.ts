import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq, isNull } from 'drizzle-orm';
import { db, sql } from '../client';
import {
  attachments, files, notifications, offices, onboardingTasks, serviceGrants, services, tagRelations, tags, userOffices,
  userRoles, users,
} from '../schema';
import { canViewFile } from '@/server/files/service';
import {
  notifyOverdueOnboarding, OnboardingError, saveLibraryItem, startOnboarding, toggleTask,
} from '@/server/onboarding/service';
import { saveSystemConfig } from '@/server/settings/system-service';
import { ForbiddenError } from '@/domain/access/guard';
import type { Actor } from '@/domain/access/permissions';

/**
 * آنبوردینگِ نقش‌محور — شروع از کتابخانه، مسئولِ هر کار، تیک و سیاههٔ
 * دسترسی، و یادآوریِ یک‌بارهٔ عقب‌افتاده.
 */

const OWNER = 1, MANAGER = 2, DEV = 3, KEEPER = 4, CLIENT = 5;
const owner = (): Actor => ({ id: OWNER, roles: ['owner'], permissions: [], privateAccess: false });
const member = (id: number): Actor => ({ id, roles: ['member'], permissions: [], privateAccess: false });

let DEV_ROLE = 0, DESIGN_ROLE = 0, GITHUB = 0, CODE_GUIDE = 0, DEV_ENV = 0;
const today = () => new Date().toISOString().slice(0, 10);
const addDays = (n: number) => new Date(Date.parse(`${today()}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

const lib = (over: Partial<Parameters<typeof saveLibraryItem>[1]>) => saveLibraryItem(owner(), {
  roleTagId: null, title: 'آیتم', description: '', kind: 'task', assignee: 'member',
  assigneeUserId: null, serviceId: null, link: '', dueDay: 1, sortOrder: 0, ...over,
});

beforeAll(async () => {
  await sql`truncate table onboarding_tasks, onboarding_items, service_grants, services, tag_relations,
    user_offices, offices, audit_log, notifications, tags, user_roles, users restart identity cascade`;

  await db.insert(users).values([
    { email: 'o@t', name: 'مالک' }, { email: 'm@t', name: 'مدیرِ دفتر' }, { email: 'd@t', name: 'سارا' },
    { email: 'k@t', name: 'علی' }, { email: 'c@t', name: 'کارفرما' },
  ]);
  await db.insert(userRoles).values([
    { userId: OWNER, role: 'owner' }, { userId: MANAGER, role: 'member' }, { userId: DEV, role: 'member' },
    { userId: KEEPER, role: 'member' }, { userId: CLIENT, role: 'client' },
  ]);
  const [office] = await db.insert(offices).values({ name: 'تهران' }).returning({ id: offices.id });
  await db.insert(userOffices).values([
    { userId: MANAGER, officeId: office!.id, manages: true },
    { userId: DEV, officeId: office!.id },
  ]);
  const tg = await db.insert(tags).values([
    { name: 'دولوپر', type: 'member_role' }, { name: 'دیزاینر', type: 'member_role' },
  ]).returning({ id: tags.id });
  [DEV_ROLE, DESIGN_ROLE] = tg.map((t) => t.id) as [number, number];
  await db.insert(tagRelations).values({ tagId: DEV_ROLE, objectId: DEV, objectType: 'user' });
  const [svc] = await db.insert(services).values({ name: 'GitHub', ownerUserId: KEEPER }).returning({ id: services.id });
  GITHUB = svc!.id;

  CODE_GUIDE = await lib({ title: 'راهنمای کدنویسی', kind: 'learn', dueDay: 1 });
  await lib({ title: 'دسترسیِ گیت‌هاب', roleTagId: DEV_ROLE, kind: 'access', assignee: 'service_owner', serviceId: GITHUB });
  DEV_ENV = await lib({ title: 'محیطِ توسعه', roleTagId: DEV_ROLE, assignee: 'office_manager', dueDay: 2 });
  await lib({ title: 'فایلِ طراحی', roleTagId: DESIGN_ROLE });
  await lib({ title: 'قرارداد', kind: 'document', assignee: 'user', assigneeUserId: OWNER, dueDay: 3 });
});

afterAll(async () => {
  // ⚠️ تنظیمِ سامانه بینِ فایل‌های تست مشترک است — خاموش برمی‌گردد.
  await saveSystemConfig(owner(), { onboardingEnabled: false });
  await sql.end();
});

describe('روشن/خاموش', () => {
  it('وقتی خاموش است چک‌لیستی ساخته نمی‌شود', async () => {
    await saveSystemConfig(owner(), { onboardingEnabled: false });
    await expect(startOnboarding(owner(), DEV)).rejects.toBeInstanceOf(OnboardingError);
    await saveSystemConfig(owner(), { onboardingEnabled: true });
  });
});

describe('شروع از کتابخانه', () => {
  it('همهٔ نقش‌ها + نقشِ خودش؛ نه نقشِ دیگر — با مسئولِ واقعیِ هر کار', async () => {
    expect(await startOnboarding(owner(), DEV)).toEqual({ added: 4, updated: 0 });
    const rows = await db.select().from(onboardingTasks).where(eq(onboardingTasks.userId, DEV));
    const by = new Map(rows.map((r) => [r.title, r]));
    expect(by.has('فایلِ طراحی')).toBe(false);
    expect(by.get('راهنمای کدنویسی')!.assigneeUserId).toBe(DEV);
    expect(by.get('دسترسیِ گیت‌هاب')!.assigneeUserId).toBe(KEEPER);
    expect(by.get('محیطِ توسعه')!.assigneeUserId).toBe(MANAGER);
    expect(by.get('قرارداد')!.assigneeUserId).toBe(OWNER);
    expect(by.get('محیطِ توسعه')!.dueDate).toBe(addDays(1));
  });

  it('دوباره‌زدن تکراری نمی‌سازد؛ آیتمِ تازهٔ کتابخانه با همگام‌سازی می‌آید', async () => {
    expect(await startOnboarding(owner(), DEV)).toEqual({ added: 0, updated: 0 });
    await lib({ title: 'آشنایی با تیم', roleTagId: DEV_ROLE, kind: 'meeting' });
    expect(await startOnboarding(owner(), DEV)).toEqual({ added: 1, updated: 0 });
  });

  it('مسئول اعلانِ جمع‌بسته می‌گیرد', async () => {
    const rows = await db.select().from(notifications)
      .where(and(eq(notifications.userId, KEEPER), eq(notifications.type, 'onboarding.assigned')));
    expect(rows.length).toBe(1);
  });

  it('کارفرما آنبوردینگ ندارد', async () => {
    await expect(startOnboarding(owner(), CLIENT)).rejects.toMatchObject({ code: 'not_member' });
  });

  it('فقط مدیرِ اعضا شروع می‌کند', async () => {
    await expect(startOnboarding(member(MANAGER), DEV)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('تیک و سیاههٔ دسترسی', () => {
  it('عضو کارِ دیگری را تیک نمی‌زند', async () => {
    const [task] = await db.select().from(onboardingTasks)
      .where(and(eq(onboardingTasks.userId, DEV), eq(onboardingTasks.title, 'دسترسیِ گیت‌هاب')));
    await expect(toggleTask(member(DEV), task!.id, true)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('مسئولِ سرویس تیک می‌زند و دسترسی در سیاهه ثبت می‌شود — بی‌تکرار، و برداشتنِ تیک نمی‌بندد', async () => {
    const [task] = await db.select().from(onboardingTasks)
      .where(and(eq(onboardingTasks.userId, DEV), eq(onboardingTasks.title, 'دسترسیِ گیت‌هاب')));
    await toggleTask(member(KEEPER), task!.id, true);
    const open = await db.select().from(serviceGrants)
      .where(and(eq(serviceGrants.userId, DEV), eq(serviceGrants.serviceId, GITHUB), isNull(serviceGrants.revokedAt)));
    expect(open.length).toBe(1);
    const [after] = await db.select().from(onboardingTasks).where(eq(onboardingTasks.id, task!.id));
    expect(after!.grantId).toBe(open[0]!.id);
    expect(after!.doneBy).toBe(KEEPER);

    await toggleTask(member(KEEPER), task!.id, false);
    await toggleTask(member(KEEPER), task!.id, true);
    const again = await db.select().from(serviceGrants)
      .where(and(eq(serviceGrants.userId, DEV), eq(serviceGrants.serviceId, GITHUB), isNull(serviceGrants.revokedAt)));
    expect(again.length).toBe(1);
  });

  it('عضو کارِ خودش را تیک می‌زند', async () => {
    const [task] = await db.select().from(onboardingTasks)
      .where(and(eq(onboardingTasks.userId, DEV), eq(onboardingTasks.title, 'راهنمای کدنویسی')));
    await toggleTask(member(DEV), task!.id, true);
    const [row] = await db.select().from(onboardingTasks).where(eq(onboardingTasks.id, task!.id));
    expect(row!.doneAt).not.toBeNull();
  });
});

describe('کتابخانه', () => {
  it('آیتمِ «دسترسی» بی‌سرویس پذیرفته نمی‌شود', async () => {
    await expect(lib({ title: 'بی‌سرویس', kind: 'access' })).rejects.toMatchObject({ code: 'service_required' });
  });

  it('نقش باید تگِ member_role باشد', async () => {
    const [other] = await db.insert(tags).values({ name: 'وضعیت', type: 'project_status', statusGroup: 'todo' })
      .returning({ id: tags.id });
    await expect(lib({ title: 'نقشِ نادرست', roleTagId: other!.id })).rejects.toMatchObject({ code: 'bad_role' });
  });
});

describe('یادآوریِ عقب‌افتاده', () => {
  it('هر کار فقط یک بار', async () => {
    await db.update(onboardingTasks).set({ dueDate: addDays(-2) })
      .where(and(eq(onboardingTasks.userId, DEV), eq(onboardingTasks.title, 'محیطِ توسعه')));
    expect(await notifyOverdueOnboarding()).toBe(1);
    expect(await notifyOverdueOnboarding()).toBe(0);
    const rows = await db.select().from(notifications)
      .where(and(eq(notifications.userId, MANAGER), eq(notifications.type, 'onboarding.overdue')));
    expect(rows.length).toBe(1);
  });
});

describe('ساختنِ سرویس از داخلِ کتابخانه', () => {
  it('آیتمِ «دسترسی» با نامِ سرویسِ تازه: سرویس ساخته و به آیتم وصل می‌شود', async () => {
    const id = await lib({ kind: 'access', title: 'دسترسیِ Linear', newServiceName: 'Linear' });
    const [svc] = await db.select({ id: services.id }).from(services).where(eq(services.name, 'Linear'));
    const { onboardingItems } = await import('../schema');
    const [item] = await db.select({ serviceId: onboardingItems.serviceId }).from(onboardingItems)
      .where(eq(onboardingItems.id, id));
    expect(item?.serviceId).toBe(svc!.id);
    // نامِ موجود دوباره ساخته نمی‌شود.
    await lib({ kind: 'access', title: 'دوباره', newServiceName: 'linear' });
    expect((await db.select().from(services).where(eq(services.name, 'Linear'))).length).toBe(1);
  });

  it('⚠️ مدیرِ تنظیمات بی‌حقِ دفترِ دسترسی‌ها، از این راه سرویس نمی‌سازد', async () => {
    const settingsOnly: Actor = { id: OWNER, roles: [], permissions: ['settings.manage'], privateAccess: false };
    await expect(saveLibraryItem(settingsOnly, {
      roleTagId: null, title: 'x', description: '', kind: 'access', assignee: 'member',
      assigneeUserId: null, serviceId: null, newServiceName: 'Jira', link: '', dueDay: 1, sortOrder: 0,
    })).rejects.toBeInstanceOf(ForbiddenError);
    expect((await db.select().from(services).where(eq(services.name, 'Jira'))).length).toBe(0);
  });

  it('برای آیتمِ بی‌نیاز به سرویس، نامِ تازه نادیده گرفته می‌شود', async () => {
    await lib({ kind: 'task', title: 'خواندنِ راهنما', newServiceName: 'Ghost' });
    expect((await db.select().from(services).where(eq(services.name, 'Ghost'))).length).toBe(0);
  });
});

describe('همگام‌سازی ویرایشِ کتابخانه را می‌برد (۲.۶.۰)', () => {
  it('کارِ باز ویرایش را می‌گیرد؛ کارِ انجام‌شده دست نمی‌خورد', async () => {
    // «راهنمای کدنویسی» بالاتر تیک خورده؛ «محیطِ توسعه» هنوز باز است.
    await lib({ id: DEV_ENV, title: 'محیطِ توسعه (نسخهٔ تازه)', description: 'مرحله‌به‌مرحله', roleTagId: DEV_ROLE, assignee: 'office_manager', dueDay: 3, link: 'https://example.com/setup' });
    await lib({ id: CODE_GUIDE, title: 'راهنمای کدنویسی (ویرایش)', kind: 'learn', dueDay: 1 });

    // ⚠️ تست‌های بالاتر آیتمِ تازه هم به کتابخانه افزوده‌اند؛ اینجا فقط «به‌روز» مهم است.
    expect(await startOnboarding(owner(), DEV)).toMatchObject({ updated: 1 });
    const rows = await db.select().from(onboardingTasks).where(eq(onboardingTasks.userId, DEV));
    const env = rows.find((r) => r.itemId === DEV_ENV)!;
    expect(env).toMatchObject({ title: 'محیطِ توسعه (نسخهٔ تازه)', description: 'مرحله‌به‌مرحله', link: 'https://example.com/setup' });
    expect(env.dueDate).toBe(addDays(2));
    expect(env.assigneeUserId).toBe(MANAGER);
    expect(rows.find((r) => r.itemId === CODE_GUIDE)!.title).toBe('راهنمای کدنویسی');

    // دوباره‌زدن بی‌تغییر چیزی را به‌روز نمی‌کند.
    expect(await startOnboarding(owner(), DEV)).toEqual({ added: 0, updated: 0 });
  });
});

describe('فایلِ راهنما فقط برای مخاطبِ همان آیتم (۲.۶.۰)', () => {
  it('عضوِ تازه و انجام‌دهنده می‌بینند؛ عضوِ دیگر نه', async () => {
    const [file] = await db.insert(files).values({
      storageKey: 'test/onboarding-guide.pdf', mime: 'application/pdf', size: 10, originalName: 'guide.pdf',
      purpose: 'attachment', uploadedBy: OWNER,
    }).returning({ id: files.id });
    await db.insert(attachments).values({ fileId: file!.id, kind: 'file', userId: OWNER, onboardingItemId: DEV_ENV });

    expect(await canViewFile(member(DEV), file!.id)).toBe(true);
    expect(await canViewFile(member(MANAGER), file!.id)).toBe(true); // انجام‌دهندهٔ «محیطِ توسعه»
    expect(await canViewFile(member(KEEPER), file!.id)).toBe(false);

    await db.delete(attachments).where(eq(attachments.fileId, file!.id));
    await db.delete(files).where(eq(files.id, file!.id));
  });
});
