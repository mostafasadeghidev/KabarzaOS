import { describe, it, expect, beforeAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { db, sql } from '../client';
import { currencies, projectMembers, tags, timelogs, unitEntries, userRoles, users } from '../schema';
import { addUnitEntry, listUnitEntries, MemberMoneyError, renameUnitEntry } from '@/server/finance/member-service';
import { createProject } from '@/server/projects/service';
import {
  addOrMerge, loggableTargets, myLogs, startTimer, stopTimer, timerState, updateLog,
} from '@/server/timelogs/service';
import { search } from '@/server/search/service';
import type { Actor } from '@/domain/access/permissions';

/**
 * نامِ یکتای ردیفِ کارکرد و ساعتِ هر ردیف (۲.۲۱.۰): نام داخلِ پروژه یکتاست (بی‌توجه به
 * حرف)، ساعت و تایمر می‌توانند روی ردیفِ خودِ کاربر ثبت شوند، و فهرست، جستجو و
 * پالت «پروژه - نام» نشان می‌دهند.
 */

let OWNER = 0, ALI = 0, BOB = 0, ROLE = 0, EUR = 0, P = 0, Q = 0;
const as = (id: number, roles: Actor['roles']): Actor => ({ id, roles, permissions: [], privateAccess: false });
const owner = () => as(OWNER, ['owner']);
const ali = () => as(ALI, ['member']);
const bob = () => as(BOB, ['member']);

const base = {
  description: '', regDate: null, deadline: null, statusTagId: null, price: '0', currencyId: null,
  officeId: null, parentId: null, isTender: false, scope: 'company' as const,
};

const add = (projectId: number, userId: number, name?: string, actor = owner()) =>
  addUnitEntry(actor, { projectId, userId, entryDate: '2026-10-10', quantity: 1, note: '', name });
const reason = async (p: Promise<unknown>) => {
  try { await p; return null; } catch (e) { return e instanceof MemberMoneyError ? e.reason : (e as { required?: string }).required ?? 'other'; }
};

beforeAll(async () => {
  await sql`truncate table timelogs, work_timers, unit_entries, project_members, projects, user_roles, tags, currencies, audit_log, users restart identity cascade`;
  const u = await db.insert(users).values([
    { email: 'o@n', name: 'مالک' }, { email: 'a@n', name: 'علی' }, { email: 'b@n', name: 'بابک' },
  ]).returning({ id: users.id });
  [OWNER, ALI, BOB] = u.map((r) => r.id) as [number, number, number];
  await db.insert(userRoles).values([
    { userId: OWNER, role: 'owner' }, { userId: ALI, role: 'member' }, { userId: BOB, role: 'member' },
  ]);
  const [c] = await db.insert(currencies).values({ code: 'EUR', name: 'Euro', isDefault: true }).returning({ id: currencies.id });
  EUR = c!.id;
  const [r] = await db.insert(tags).values({ name: 'دولوپر', type: 'member_role' }).returning({ id: tags.id });
  ROLE = r!.id;

  P = await createProject(owner(), { ...base, title: 'Simon Zickert media', isUnitBased: true });
  Q = await createProject(owner(), { ...base, title: 'Other', isUnitBased: true });
  for (const p of [P, Q]) {
    await db.insert(projectMembers).values([
      { projectId: p, userId: ALI, roleTagId: ROLE, unitRate: '10', currencyId: EUR },
      { projectId: p, userId: BOB, roleTagId: ROLE, unitRate: '10', currencyId: EUR },
    ]);
  }
});

describe('نامِ ردیف', () => {
  it('نام یکتا داخلِ پروژه است، بی‌توجه به حرف و فاصله', async () => {
    await add(P, ALI, 'CAT');
    expect(await reason(add(P, ALI, 'cat'))).toBe('name_taken');
    expect(await reason(add(P, BOB, '  CAT '))).toBe('name_taken');
    // پروژهٔ دیگر آزاد است؛ بی‌نام‌ها هرچند تا بخواهند.
    await add(Q, ALI, 'CAT');
    await add(P, ALI, '');
    await add(P, ALI, '');
  });

  it('نامِ بیش از سقف رد می‌شود و فاصله‌ها یکی می‌شوند', async () => {
    expect(await reason(add(P, ALI, 'x'.repeat(81)))).toBe('name_invalid');
    const id = await add(P, ALI, 'two   words');
    const [row] = await db.select({ n: unitEntries.name }).from(unitEntries).where(eq(unitEntries.id, id));
    expect(row!.n).toBe('two words');
  });

  it('ایندکسِ دیتابیس هم یکتایی را نگه می‌دارد', async () => {
    await expect(db.insert(unitEntries).values({
      projectId: P, userId: ALI, entryDate: '2026-10-10', quantity: '1', name: 'Cat', currencyId: EUR,
    })).rejects.toThrow();
  });
});

describe('تغییرِ نام', () => {
  it('مسئولِ پروژه و صاحبِ ردیف می‌توانند؛ دیگران نه', async () => {
    const id = await add(P, ALI, 'GSH');
    await renameUnitEntry(owner(), id, 'GSH 2');
    await renameUnitEntry(ali(), id, 'GSH 3');
    expect(await reason(renameUnitEntry(bob(), id, 'X'))).toBe('not_yours');
    expect((await db.select({ n: unitEntries.name }).from(unitEntries).where(eq(unitEntries.id, id)))[0]!.n).toBe('GSH 3');
  });

  it('نامِ تکراری رد می‌شود و نامِ خودِ همان ردیف مشکلی ندارد؛ خالی بی‌نامش می‌کند', async () => {
    const id = await add(P, ALI, 'LTH');
    expect(await reason(renameUnitEntry(owner(), id, 'cat'))).toBe('name_taken');
    await renameUnitEntry(owner(), id, 'lth');
    await renameUnitEntry(owner(), id, '');
    expect((await db.select({ n: unitEntries.name }).from(unitEntries).where(eq(unitEntries.id, id)))[0]!.n).toBe('');
  });
});

describe('ساعتِ کاری روی ردیف', () => {
  let catId = 0, dhwId = 0, bobId = 0;
  beforeAll(async () => {
    const [cat] = await db.select({ id: unitEntries.id }).from(unitEntries)
      .where(and(eq(unitEntries.projectId, P), eq(unitEntries.name, 'CAT')));
    catId = cat!.id;
    dhwId = await add(P, ALI, 'DHW');
    bobId = await add(P, BOB, 'BOBS');
  });

  it('گزینه‌ها: پروژه و ردیف‌های نام‌دارِ خودِ کاربر با برچسبِ «پروژه - نام»', async () => {
    const targets = await loggableTargets(ali());
    const labels = targets.map((t) => t.title);
    expect(labels).toContain('Simon Zickert media');
    expect(labels).toContain('Simon Zickert media - CAT');
    expect(labels).toContain('Simon Zickert media - DHW');
    // ردیفِ بابک به علی پیشنهاد نمی‌شود.
    expect(labels).not.toContain('Simon Zickert media - BOBS');
    const entryOption = targets.find((t) => t.title === 'Simon Zickert media - CAT')!;
    expect(entryOption).toMatchObject({ id: P, unitEntryId: catId });
  });

  it('ساعت روی ردیفِ خود ثبت و در همان روز ادغام می‌شود؛ ردیفِ دیگر جداست', async () => {
    await addOrMerge(ali(), { projectId: P, unitEntryId: catId, logDate: '2026-10-10', minutes: 60, description: 'a' });
    await addOrMerge(ali(), { projectId: P, unitEntryId: catId, logDate: '2026-10-10', minutes: 30, description: 'b' });
    await addOrMerge(ali(), { projectId: P, unitEntryId: dhwId, logDate: '2026-10-10', minutes: 15, description: '' });
    await addOrMerge(ali(), { projectId: P, logDate: '2026-10-10', minutes: 45, description: '' });

    const rows = await db.select({ e: timelogs.unitEntryId, m: timelogs.minutes }).from(timelogs).where(eq(timelogs.userId, ALI));
    expect(rows.find((r) => r.e === catId)!.m).toBe(90);
    expect(rows.find((r) => r.e === dhwId)!.m).toBe(15);
    expect(rows.find((r) => r.e === null)!.m).toBe(45);
    expect(rows).toHaveLength(3);
  });

  it('ردیفِ دیگران یا ردیفِ پروژهٔ دیگر یا ردیف بی‌پروژه رد می‌شود', async () => {
    expect(await reason(addOrMerge(ali(), { projectId: P, unitEntryId: bobId, logDate: '2026-10-10', minutes: 5, description: '' }))).toBe('timelog.entry');
    expect(await reason(addOrMerge(ali(), { projectId: Q, unitEntryId: catId, logDate: '2026-10-10', minutes: 5, description: '' }))).toBe('timelog.entry');
    expect(await reason(addOrMerge(ali(), { projectId: null, unitEntryId: catId, logDate: '2026-10-10', minutes: 5, description: '' }))).toBe('timelog.entry');
  });

  it('فهرستِ ساعت «پروژه - نام» نشان می‌دهد و با نامِ ردیف فیلتر می‌شود', async () => {
    const all = await myLogs(ali());
    expect(all.rows.map((r) => r.projectTitle).sort()).toEqual([
      'Simon Zickert media', 'Simon Zickert media - CAT', 'Simon Zickert media - DHW',
    ]);
    const byEntry = await myLogs(ali(), { project: 'DHW' });
    expect(byEntry.rows.map((r) => r.projectTitle)).toEqual(['Simon Zickert media - DHW']);
  });

  it('کارکردها جمعِ ساعتِ هر ردیف را نشان می‌دهند', async () => {
    const rows = await listUnitEntries(owner(), P);
    expect(rows.find((r) => r.id === catId)!.minutes).toBe(90);
    expect(rows.find((r) => r.id === dhwId)!.minutes).toBe(15);
    expect(rows.find((r) => r.id === bobId)!.minutes).toBe(0);
  });

  it('تایمر روی ردیف شروع می‌شود، برچسب دارد و هنگامِ توقف روی همان ردیف ثبت می‌کند', async () => {
    const start = new Date('2026-10-11T09:00:00');
    await startTimer(ali(), P, start, catId);
    const state = await timerState(ali(), new Date('2026-10-11T09:20:00'));
    expect(state.running!.projectTitle).toBe('Simon Zickert media - CAT');
    expect(state.running!.unitEntryId).toBe(catId);
    await stopTimer(ali(), 'timer', new Date('2026-10-11T09:20:00'));
    const [row] = await db.select({ e: timelogs.unitEntryId, m: timelogs.minutes }).from(timelogs)
      .where(eq(timelogs.logDate, '2026-10-11'));
    expect(row).toEqual({ e: catId, m: 20 });
  });

  it('ویرایش: عوض‌شدنِ پروژه ردیف را پاک می‌کند؛ انتخابِ ردیف آن را می‌گذارد', async () => {
    const [log] = await db.select({ id: timelogs.id }).from(timelogs).where(eq(timelogs.logDate, '2026-10-11'));
    await updateLog(ali(), log!.id, { minutes: 20, description: '', projectId: Q });
    expect((await db.select({ e: timelogs.unitEntryId }).from(timelogs).where(eq(timelogs.id, log!.id)))[0]!.e).toBeNull();
    await updateLog(ali(), log!.id, { minutes: 20, description: '', projectId: P, unitEntryId: dhwId });
    expect((await db.select({ e: timelogs.unitEntryId }).from(timelogs).where(eq(timelogs.id, log!.id)))[0]!.e).toBe(dhwId);
  });

  it('حذفِ ردیف ساعت را نگه می‌دارد و فقط پیوند را پاک می‌کند', async () => {
    const before = await db.select({ id: timelogs.id }).from(timelogs).where(eq(timelogs.unitEntryId, dhwId));
    expect(before.length).toBeGreaterThan(0);
    await db.delete(unitEntries).where(eq(unitEntries.id, dhwId));
    const after = await db.select({ id: timelogs.id, e: timelogs.unitEntryId }).from(timelogs);
    expect(after.filter((r) => before.some((b) => b.id === r.id)).every((r) => r.e === null)).toBe(true);
  });
});

describe('جستجو و پالتِ فرمان', () => {
  it('مدیرِ سراسری همهٔ ردیف‌ها را با برچسبِ «پروژه - نام» پیدا می‌کند', async () => {
    const hits = (await search(owner(), 'BOBS')).filter((h) => h.kind === 'unit');
    expect(hits.map((h) => h.label)).toEqual(['Simon Zickert media - BOBS']);
    expect(hits[0]!.href).toBe(`/projects/${P}#unit-${hits[0]!.id}`);
  });

  it('جستجو با نامِ پروژه هم ردیف‌ها را می‌آورد', async () => {
    const hits = (await search(owner(), 'Simon Zickert')).filter((h) => h.kind === 'unit');
    expect(hits.length).toBeGreaterThan(1);
  });

  it('عضو فقط ردیف‌های خودش را می‌بیند', async () => {
    expect((await search(ali(), 'BOBS')).filter((h) => h.kind === 'unit')).toEqual([]);
    expect((await search(bob(), 'BOBS')).filter((h) => h.kind === 'unit').map((h) => h.label)).toEqual(['Simon Zickert media - BOBS']);
  });
});
