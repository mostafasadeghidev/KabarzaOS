import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, sql } from '../client';
import { libraryProjects, libraryRevisions, projectClients, projectMembers, projects, userRoles, users } from '../schema';
import {
  clientGuidesFor, deleteEntry, forkForProject, getEntry, installOnProject, LibraryError, listEntries,
  projectLibrary, removeInstall, restoreRevision, saveEntry, setEntryArchived,
} from '@/server/library/service';
import type { EntryInput } from '@/domain/library/model';
import type { Actor } from '@/domain/access/permissions';

/**
 * کتابخانهٔ کد و راهنما (۲.۳۷.۰) — گاردهای ویرایش و نصب، تاریخچه، نسخهٔ جدا،
 * و مرزِ کارفرما: فقط راهنمای «کارفرما ببیند» ِ پروژهٔ خودش، هرگز کد.
 */

const OWNER = 1, DEV = 2, OTHER = 3, CLIENT = 4, FIN = 5;
const actor = (id: number, roles: Actor['roles']): Actor => ({ id, roles, permissions: [], privateAccess: false });
const owner = () => actor(OWNER, ['owner']);
const dev = () => actor(DEV, ['member']);
const other = () => actor(OTHER, ['member']);
const client = () => actor(CLIENT, ['client']);
const fin = () => actor(FIN, ['finance']);

let P1 = 0, P2 = 0;

const input = (patch: Partial<EntryInput> = {}): EntryInput => ({
  kind: 'code', title: 'Masonry', summary: '', platform: 'webflow', status: 'ready', topics: ['CMS'],
  body: '', steps: '', warnings: '', dependencies: '', demoUrl: '', clientVisible: false, originProjectId: null,
  blocks: [{ label: 'init', language: 'js', placement: 'site_body_end', placementNote: '', code: 'Macy({ container: "#macy" })' }],
  options: [], relatedIds: [],
  ...patch,
});

beforeAll(async () => {
  await sql`truncate table library_revisions, library_relations, library_projects, library_options, library_blocks,
    library_entries, project_clients, project_members, projects, audit_log, user_roles, users restart identity cascade`;
  await db.insert(users).values([
    { email: 'o@l', name: 'مالک' }, { email: 'd@l', name: 'سارا' }, { email: 'x@l', name: 'علی' },
    { email: 'c@l', name: 'کارفرما' }, { email: 'f@l', name: 'مالی' },
  ]);
  await db.insert(userRoles).values([
    { userId: OWNER, role: 'owner' }, { userId: DEV, role: 'member' }, { userId: OTHER, role: 'member' },
    { userId: CLIENT, role: 'client' }, { userId: FIN, role: 'finance' },
  ]);
  const ps = await db.insert(projects).values([{ title: 'آلفا' }, { title: 'بتا' }]).returning({ id: projects.id });
  [P1, P2] = ps.map((p) => p.id) as [number, number];
  await db.insert(projectMembers).values([{ projectId: P1, userId: DEV }, { projectId: P2, userId: OTHER }]);
  await db.insert(projectClients).values({ projectId: P1, userId: CLIENT });
});

afterAll(async () => {
  await sql.end();
});

describe('ساختن و ویرایش', () => {
  it('عضو می‌سازد؛ با مبدأ، روی همان پروژه نصب‌شده ثبت می‌شود', async () => {
    const id = await saveEntry(dev(), null, input({ originProjectId: P1 }));
    const entry = await getEntry(dev(), id);
    expect(entry.authorId).toBe(DEV);
    expect(entry.installList.map((i) => i.projectId)).toEqual([P1]);
    expect(entry.blocks).toHaveLength(1);
  });

  it('⚠️ مبدأ فقط پروژه‌ای که سازنده رویش کار می‌کند', async () => {
    await expect(saveEntry(dev(), null, input({ originProjectId: P2 }))).rejects.toMatchObject({ code: 'bad_project' });
  });

  it('⚠️ عضوِ دیگر کدِ همکارش را ویرایش نمی‌کند؛ مالک می‌کند', async () => {
    const id = await saveEntry(dev(), null, input({ title: 'Mine' }));
    await expect(saveEntry(other(), id, input({ title: 'Hijack' }))).rejects.toMatchObject({ code: 'forbidden' });
    await saveEntry(owner(), id, input({ title: 'Fixed by owner' }));
    expect((await getEntry(dev(), id)).title).toBe('Fixed by owner');
  });

  it('⚠️ مالی و کارفرما به کتابخانه راه ندارند', async () => {
    await expect(listEntries(fin())).rejects.toBeInstanceOf(LibraryError);
    await expect(listEntries(client())).rejects.toBeInstanceOf(LibraryError);
    await expect(saveEntry(client(), null, input())).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('جستجو داخلِ خودِ کد هم می‌گردد', async () => {
    const hits = await listEntries(other(), { q: 'macy' });
    expect(hits.length).toBeGreaterThan(0);
    expect(await listEntries(other(), { q: 'no-such-thing-xyz' })).toEqual([]);
  });
});

describe('تاریخچه', () => {
  it('هر ویرایش نسخهٔ قبلی را نگه می‌دارد و بازگرداندن کار می‌کند', async () => {
    const id = await saveEntry(dev(), null, input({ title: 'v1' }));
    await saveEntry(dev(), id, input({
      title: 'v2', blocks: [{ label: '', language: 'css', placement: 'site_head', placementNote: '', code: '.a{}' }],
    }));
    const revs = await db.select().from(libraryRevisions).where(eq(libraryRevisions.entryId, id));
    expect(revs).toHaveLength(1);
    await restoreRevision(dev(), id, revs[0]!.id);
    const back = await getEntry(dev(), id);
    expect(back.title).toBe('v1');
    expect(back.blocks[0]!.language).toBe('js');
    // نسخهٔ v2 هم پیش از بازگرداندن در تاریخچه نشست.
    expect(back.revisions).toHaveLength(2);
  });
});

describe('نصب روی پروژه', () => {
  it('⚠️ فقط روی پروژه‌ای که بیننده رویش کار می‌کند', async () => {
    const id = await saveEntry(dev(), null, input({ title: 'Shared' }));
    await expect(installOnProject(dev(), id, P2)).rejects.toMatchObject({ code: 'bad_project' });
    await installOnProject(other(), id, P2, 'صفحهٔ اصلی');
    const entry = await getEntry(owner(), id);
    expect(entry.installList.map((i) => i.projectId)).toEqual([P2]);
    // ⚠️ سازنده پروژهٔ بتا را نمی‌بیند — فقط شمارِ نصب‌های پنهان.
    const asDev = await getEntry(dev(), id);
    expect(asDev.installList).toEqual([]);
    expect(asDev.hiddenInstalls).toBe(1);
  });

  it('⚠️ بایگانی‌شده روی پروژهٔ تازه نصب نمی‌شود', async () => {
    const id = await saveEntry(dev(), null, input({ title: 'Old' }));
    await setEntryArchived(dev(), id, true);
    await expect(installOnProject(dev(), id, P1)).rejects.toMatchObject({ code: 'archived' });
  });

  it('⚠️ حذفِ کامل فقط وقتی نصب نیست', async () => {
    const id = await saveEntry(dev(), null, input({ title: 'Del', originProjectId: P1 }));
    await expect(deleteEntry(dev(), id)).rejects.toMatchObject({ code: 'installed' });
    const [inst] = await db.select().from(libraryProjects).where(eq(libraryProjects.entryId, id));
    await removeInstall(dev(), inst!.id);
    await deleteEntry(dev(), id);
    await expect(getEntry(dev(), id)).rejects.toMatchObject({ code: 'not_found' });
  });

  it('«نسخهٔ این پروژه» نصبِ اصلی را با نسخهٔ تازه عوض می‌کند', async () => {
    const id = await saveEntry(owner(), null, input({ title: 'Base' }));
    await installOnProject(dev(), id, P1, 'فرمِ سفارش');
    const fork = await forkForProject(dev(), id, P1);
    const forked = await getEntry(dev(), fork);
    expect(forked.authorId).toBe(DEV);
    expect(forked.forkedFrom?.id).toBe(id);
    expect(forked.installList.map((i) => [i.projectId, i.note])).toEqual([[P1, 'فرمِ سفارش']]);
    expect((await getEntry(dev(), id)).installList).toEqual([]);
    // ⚠️ نسخهٔ جدا مالِ سازنده‌اش است — خودش ویرایشش می‌کند.
    await saveEntry(dev(), fork, input({ title: 'Base — آلفا (edited)' }));
  });
});

describe('مرزِ کارفرما', () => {
  it('⚠️ فقط راهنمای «کارفرما ببیند» ِ پروژهٔ خودش — نه کد، نه پیش‌نویس', async () => {
    const guide = await saveEntry(dev(), null, input({
      kind: 'guide', title: 'تغییرِ قیمت‌ها', blocks: [], clientVisible: true, originProjectId: P1, steps: 'Designer\nPublish',
      options: [{ name: 'data-flow-price', kind: 'attribute', description: 'قیمتِ پایه', defaultValue: '130' }],
    }));
    await saveEntry(dev(), null, input({ kind: 'guide', title: 'پیش‌نویس', blocks: [], clientVisible: true, status: 'draft', originProjectId: P1 }));
    await saveEntry(dev(), null, input({ kind: 'guide', title: 'داخلی', blocks: [], clientVisible: false, originProjectId: P1 }));
    // ⚠️ کدی که «کارفرما ببیند» خورده باشد هم برای کارفرما نیست.
    await saveEntry(dev(), null, input({ title: 'کد', clientVisible: true, originProjectId: P1 }));

    const guides = await clientGuidesFor(client(), P1);
    expect(guides?.map((g) => g.id)).toEqual([guide]);
    expect(guides?.[0]?.options[0]?.name).toBe('data-flow-price');
    // پروژهٔ دیگر هیچ.
    expect(await clientGuidesFor(client(), P2)).toBeNull();
    // ⚠️ تیم نمای کارفرما را نمی‌گیرد و کارفرما نمای تیم را.
    expect(await clientGuidesFor(dev(), P1)).toBeNull();
    expect(await projectLibrary(client(), P1)).toBeNull();
  });

  it('⚠️ کارفرما از راهِ نصب هم وارد نمی‌شود', async () => {
    const [any] = await listEntries(owner());
    await expect(installOnProject(client(), any!.id, P1)).rejects.toBeInstanceOf(LibraryError);
  });
});
