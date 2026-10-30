import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, sql } from '../client';
import {
  libraryProjects, libraryRevisions, librarySuggestions, notifications, projectClients, projectMembers,
  projects, userRoles, users,
} from '../schema';
import {
  clientGuidesFor, deleteEntry, deleteLibraryMedia, forkForProject, getEntry, getEntryForSuggest, getRevision,
  getSuggestionDiff, installOnProject, LibraryError, listEntries, projectCombinedCode, projectLibrary, removeInstall,
  restoreRevision, reviewSuggestion, saveEntry, setEntryArchived, suggestEdit, withdrawSuggestion,
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
  body: '', steps: [], warnings: '', dependencies: '', demoUrl: '', clientVisible: false, originProjectId: null,
  blocks: [{ label: 'init', language: 'js', placement: 'site_body_end', placementNote: '', code: 'Macy({ container: "#macy" })' }],
  options: [], related: [],
  ...patch,
});

const titled = (...titles: string[]) => titles.map((title) => ({ title, body: '', blockIndexes: [], optionNames: [], mediaIds: [] }));

const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ...Array.from({ length: 40 }, (_, i) => i % 256),
]);
const shot = (name = 'shot.png') => ({ name, mime: 'image/png', bytes: PNG });

beforeAll(async () => {
  await sql`truncate table library_suggestions, notifications, library_revisions, library_relations, library_requires, library_steps,
    library_projects, library_options, library_blocks, library_entries, project_clients, project_members, projects, audit_log,
    user_roles, users restart identity cascade`;
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
      kind: 'guide', title: 'تغییرِ قیمت‌ها', blocks: [], clientVisible: true, originProjectId: P1, steps: titled('Designer', 'Publish'),
      options: [{ name: 'data-flow-price', kind: 'attribute', description: 'قیمتِ پایه', defaultValue: '130' }],
    }));
    await saveEntry(dev(), null, input({ kind: 'guide', title: 'پیش‌نویس', blocks: [], clientVisible: true, status: 'draft', originProjectId: P1 }));
    await saveEntry(dev(), null, input({ kind: 'guide', title: 'داخلی', blocks: [], clientVisible: false, originProjectId: P1 }));
    // ⚠️ کدی که «کارفرما ببیند» خورده باشد هم برای کارفرما نیست.
    await saveEntry(dev(), null, input({ title: 'کد', clientVisible: true, originProjectId: P1 }));

    const guides = await clientGuidesFor(client(), P1);
    expect(guides?.map((g) => g.id)).toEqual([guide]);
    expect(guides?.[0]?.options[0]?.name).toBe('data-flow-price');
    expect(guides?.[0]?.steps.map((s) => s.title)).toEqual(['Designer', 'Publish']);
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

describe('پیشنهادِ ویرایش (۲.۴۶.۰)', () => {
  const better = (title: string) => input({
    title,
    blocks: [{ label: 'init', language: 'js', placement: 'site_body_end', placementNote: '', code: 'Macy({ container: "#macy", columns: 3 })' }],
  });

  it('عضوِ دیگر پیشنهاد می‌دهد؛ نویسنده اعلان می‌گیرد؛ چیزی هنوز عوض نشده', async () => {
    const id = await saveEntry(dev(), null, input({ title: 'Grid' }));
    const sid = await suggestEdit(other(), id, better('Grid'), 'ستون‌ها روی موبایل');
    expect((await getEntry(dev(), id)).blocks[0]!.code).toBe('Macy({ container: "#macy" })');
    const note = await db.select().from(notifications).where(eq(notifications.userId, DEV));
    expect(note.some((n) => n.type === 'library.suggestion')).toBe(true);

    const asAuthor = await getEntry(dev(), id);
    expect(asAuthor.pendingSuggestions).toBe(1);
    expect(asAuthor.suggestions[0]).toMatchObject({ id: sid, canReview: true, canWithdraw: false, parts: ['blocks'] });
    const asOther = await getEntry(other(), id);
    expect(asOther.canSuggest).toBe(true);
    expect(asOther.suggestions[0]).toMatchObject({ canReview: false, canWithdraw: true });
    // «منتظرِ من» برای نویسنده، نه برای پیشنهاددهنده.
    expect((await listEntries(dev(), { review: true })).map((e) => e.id)).toContain(id);
    expect((await listEntries(other(), { review: true })).map((e) => e.id)).not.toContain(id);
  });

  it('⚠️ نویسنده و مدیر پیشنهاد نمی‌دهند — خودشان ویرایش می‌کنند؛ کارفرما و مالی هیچ', async () => {
    const id = await saveEntry(dev(), null, input({ title: 'Own' }));
    await expect(suggestEdit(dev(), id, better('Own'), 'x')).rejects.toMatchObject({ code: 'can_edit' });
    await expect(suggestEdit(owner(), id, better('Own'), 'x')).rejects.toMatchObject({ code: 'can_edit' });
    await expect(suggestEdit(client(), id, better('Own'), 'x')).rejects.toMatchObject({ code: 'forbidden' });
    await expect(suggestEdit(fin(), id, better('Own'), 'x')).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('⚠️ بی‌توضیح یا بی‌تغییر پذیرفته نمی‌شود', async () => {
    const id = await saveEntry(dev(), null, input({ title: 'Same' }));
    await expect(suggestEdit(other(), id, better('Same'), '  ')).rejects.toMatchObject({ code: 'note_required' });
    await expect(suggestEdit(other(), id, input({ title: 'Same' }), 'هیچ')).rejects.toMatchObject({ code: 'no_change' });
  });

  it('⚠️ پیشنهاد نوع، «کارفرما ببیند»، وضعیت و مبدأ را عوض نمی‌کند', async () => {
    const id = await saveEntry(dev(), null, input({ title: 'Locked', originProjectId: P1 }));
    const sid = await suggestEdit(other(), id, {
      ...better('Locked v2'), kind: 'guide', clientVisible: true, status: 'draft', originProjectId: P2,
    }, 'عنوان');
    await reviewSuggestion(dev(), sid, 'accept');
    const after = await getEntry(dev(), id);
    expect(after.title).toBe('Locked v2');
    expect([after.kind, after.clientVisible, after.status, after.origin?.id]).toEqual(['code', false, 'ready', P1]);
  });

  it('پیشنهادِ دوباره همان پیشنهادِ باز را تازه می‌کند', async () => {
    const id = await saveEntry(dev(), null, input({ title: 'Once' }));
    const a = await suggestEdit(other(), id, better('Once'), 'اول');
    const b = await suggestEdit(other(), id, better('Once!'), 'دوم');
    expect(b).toBe(a);
    const { draft } = await getEntryForSuggest(other(), id);
    expect([draft?.note, draft?.content.title]).toEqual(['دوم', 'Once!']);
  });

  it('پذیرفتن: اعمال، نسخهٔ قبلی در تاریخچه، «آخرین ویرایش» به نامِ پیشنهاددهنده، اعلانِ او', async () => {
    const id = await saveEntry(dev(), null, input({ title: 'Accept' }));
    const sid = await suggestEdit(other(), id, better('Accept'), 'ستون');
    await expect(reviewSuggestion(other(), sid, 'accept')).rejects.toMatchObject({ code: 'forbidden' });
    await reviewSuggestion(dev(), sid, 'accept', 'ممنون');
    const after = await getEntry(dev(), id);
    expect(after.blocks[0]!.code).toContain('columns: 3');
    expect(after.updatedByName).toBe('علی');
    expect(after.revisions).toHaveLength(1);
    expect(after.suggestions[0]).toMatchObject({ status: 'accepted', reviewedByName: 'سارا', reviewNote: 'ممنون' });
    const notes = await db.select().from(notifications).where(eq(notifications.userId, OTHER));
    expect(notes.some((n) => n.type === 'library.suggestion_accepted')).toBe(true);
    // ⚠️ دو بار اعمال نمی‌شود.
    await expect(reviewSuggestion(dev(), sid, 'accept')).rejects.toMatchObject({ code: 'decided' });
    // بازگرداندن مثلِ هر ویرایشِ دیگر.
    await restoreRevision(dev(), id, after.revisions[0]!.id);
    expect((await getEntry(dev(), id)).blocks[0]!.code).toBe('Macy({ container: "#macy" })');
  });

  it('مدیرِ پروژه‌ها هم بررسی می‌کند؛ رد چیزی را عوض نمی‌کند', async () => {
    const id = await saveEntry(dev(), null, input({ title: 'Reject' }));
    const sid = await suggestEdit(other(), id, better('Reject'), 'x');
    await reviewSuggestion(owner(), sid, 'reject', 'Safari');
    const after = await getEntry(dev(), id);
    expect(after.title).toBe('Reject');
    expect(after.revisions).toHaveLength(0);
    expect(after.suggestions[0]).toMatchObject({ status: 'rejected', reviewedByName: 'مالک' });
  });

  it('⚠️ تفاوت با نسخهٔ فعلی است و پس از ویرایشِ نویسنده «کهنه» نشان داده می‌شود', async () => {
    const id = await saveEntry(dev(), null, input({ title: 'Stale' }));
    const sid = await suggestEdit(other(), id, better('Stale'), 'x');
    expect((await getSuggestionDiff(other(), sid)).suggestion.stale).toBe(false);
    await new Promise((r) => setTimeout(r, 5));
    await saveEntry(dev(), id, input({ title: 'Stale (author edit)' }));
    const diff = await getSuggestionDiff(other(), sid);
    expect(diff.suggestion.stale).toBe(true);
    expect(diff.before.title).toBe('Stale (author edit)');
    expect(diff.suggestion.parts).toEqual(['title', 'blocks']);
  });

  it('پس‌گرفتن فقط مالِ خودِ پیشنهاددهنده', async () => {
    const id = await saveEntry(dev(), null, input({ title: 'Withdraw' }));
    const sid = await suggestEdit(other(), id, better('Withdraw'), 'x');
    await expect(withdrawSuggestion(dev(), sid)).rejects.toMatchObject({ code: 'forbidden' });
    await withdrawSuggestion(other(), sid);
    await expect(reviewSuggestion(dev(), sid, 'accept')).rejects.toMatchObject({ code: 'decided' });
    expect((await getEntry(dev(), id)).pendingSuggestions).toBe(0);
  });

  it('⚠️ روی موردِ بایگانی‌شده پیشنهاد نمی‌شود', async () => {
    const id = await saveEntry(dev(), null, input({ title: 'Arch' }));
    await setEntryArchived(dev(), id, true);
    await expect(suggestEdit(other(), id, better('Arch'), 'x')).rejects.toMatchObject({ code: 'archived' });
  });
});

describe('ساختارِ تازه (۲.۴۷.۰)', () => {
  it('گام با تصویرِ تازهٔ خودش، تکه‌کد و گزینه ذخیره و خوانده می‌شود؛ تصویرِ شاخص اختیاری', async () => {
    const id = await saveEntry(dev(), null, input({
      title: 'Range', category: 'form', versionLabel: 'v2.0', videoUrl: 'https://www.loom.com/share/0123456789abcdef0123456789abcdef',
      options: [{ name: 'fs-rangeslider-element', kind: 'attribute', role: 'required', value: 'wrapper', description: '', defaultValue: '' }],
      steps: [
        { key: '11', title: 'اسکریپت', body: '', blockIndexes: [0], optionNames: [], mediaIds: [] },
        { key: '12', title: 'المنت‌ها', body: 'به `wrapper` بدهید', blockIndexes: [], optionNames: ['fs-rangeslider-element=wrapper'], mediaIds: [] },
      ],
    }), [shot('general.png')], { 12: [shot('step.png')] });
    const e = await getEntry(dev(), id);
    expect([e.category, e.versionLabel, e.videoUrl]).toEqual(['form', 'v2.0', 'https://www.loom.com/share/0123456789abcdef0123456789abcdef']);
    expect(e.media).toHaveLength(2);
    const stepImage = e.media.find((m) => m.name === 'step.png')!;
    expect(e.steps.map((s) => [s.title, s.blockIndexes, s.optionNames, s.mediaIds])).toEqual([
      ['اسکریپت', [0], [], []],
      ['المنت‌ها', [], ['fs-rangeslider-element=wrapper'], [stepImage.id]],
    ]);
    expect(e.options[0]).toMatchObject({ role: 'required', value: 'wrapper' });
    // بی‌انتخاب، شاخص اولین تصویر است.
    const [card] = (await listEntries(dev(), { q: 'Range' })).filter((c) => c.id === id);
    expect(card?.coverFileId).toBe(e.media[0]!.fileId);

    // انتخابِ شاخص + ⚠️ تصویرِ موردِ دیگر به گام یا شاخص وصل نمی‌شود.
    const otherId = await saveEntry(dev(), null, input({ title: 'Other' }), [shot('x.png')]);
    const foreign = (await getEntry(dev(), otherId)).media[0]!.id;
    await saveEntry(dev(), id, input({
      ...e, steps: e.steps.map((s, i) => ({ ...s, mediaIds: i === 0 ? [foreign, stepImage.id] : s.mediaIds })),
      related: [], coverMediaId: stepImage.id,
    }));
    const after = await getEntry(dev(), id);
    expect(after.steps[0]!.mediaIds).toEqual([stepImage.id]);
    expect(after.coverAttachmentId).toBe(stepImage.id);
    await saveEntry(dev(), id, input({ ...after, related: [], coverMediaId: foreign }));
    expect((await getEntry(dev(), id)).coverAttachmentId).toBeNull();

    // حذفِ تصویر ارجاعِ گام را بی‌اثر می‌کند.
    await deleteLibraryMedia(dev(), stepImage.id);
    expect((await getEntry(dev(), id)).steps.flatMap((s) => s.mediaIds)).toEqual([]);
  });

  it('«چه چیزی عوض شد» فقط هنگامِ ویرایش، و در عکسِ تاریخچه می‌ماند', async () => {
    const id = await saveEntry(dev(), null, input({ title: 'Notes', changeNote: 'نه' }));
    expect((await getEntry(dev(), id)).changeNote).toBe('');
    await saveEntry(dev(), id, input({ title: 'Notes', changeNote: 'باگِ موبایل رفع شد' }));
    expect((await getEntry(dev(), id)).changeNote).toBe('باگِ موبایل رفع شد');
    await saveEntry(dev(), id, input({ title: 'Notes 2', changeNote: '' }));
    const [latest] = (await getEntry(dev(), id)).revisions;
    expect((await getRevision(dev(), id, latest!.id)).entry.changeNote).toBe('باگِ موبایل رفع شد');
  });

  it('⚠️ نسخه‌ها: قدیمی منسوخ و در فهرست زیرِ تازه جمع؛ در جستجو پیدا؛ دور ممنوع؛ فقط ویرایشگرِ قدیمی', async () => {
    const v1 = await saveEntry(dev(), null, input({ title: 'Swiper', versionLabel: 'v1' }));
    const v2 = await saveEntry(dev(), null, input({ title: 'Swiper', versionLabel: 'v2', replacesId: v1 }));
    const v3 = await saveEntry(dev(), null, input({ title: 'Swiper', versionLabel: 'v3', replacesId: v2 }));
    const old = await getEntry(dev(), v1);
    expect([old.status, old.supersededBy?.id]).toEqual(['deprecated', v2]);
    const top = await getEntry(dev(), v3);
    expect(top.olderVersionList.map((v) => v.id)).toEqual([v2, v1]);
    expect(top.olderVersions).toBe(1);

    const listed = (await listEntries(dev())).map((c) => c.id);
    expect(listed).toContain(v3);
    expect(listed).not.toContain(v1);
    expect((await listEntries(dev(), { q: 'Swiper' })).map((c) => c.id)).toEqual(expect.arrayContaining([v1, v2, v3]));

    // ⚠️ v1 نمی‌تواند نسخهٔ تازهٔ v3 باشد (دور).
    await expect(saveEntry(dev(), v1, input({ title: 'Swiper', replacesId: v3 }))).rejects.toMatchObject({ code: 'bad_version' });
    // ⚠️ کدِ همکار را منسوخ نمی‌کند.
    const mine = await saveEntry(other(), null, input({ title: 'Mine' }));
    await expect(saveEntry(dev(), null, input({ title: 'Hijack', replacesId: mine }))).rejects.toMatchObject({ code: 'forbidden' });
    expect((await getEntry(other(), mine)).status).toBe('ready');

    // برداشتنِ «نسخهٔ تازهٔ…» پیوند را برمی‌دارد.
    await saveEntry(dev(), v3, input({ title: 'Swiper', versionLabel: 'v3', replacesId: null }));
    expect((await getEntry(dev(), v2)).supersededBy).toBeNull();
  });

  it('پیش‌نیاز همراهِ مورد نصب می‌شود و کدِ یک‌جای پروژه اول آن را دارد، بی‌تکرار', async () => {
    const [p3] = await db.insert(projects).values({ title: 'گاما' }).returning({ id: projects.id });
    await db.insert(projectMembers).values({ projectId: p3!.id, userId: DEV });
    const gsap = await saveEntry(dev(), null, input({
      title: 'GSAP', blocks: [{ label: 'cdn', language: 'html', placement: 'site_head', placementNote: '', code: '<script src="gsap.js"></script>' }],
    }));
    const anim = await saveEntry(dev(), null, input({
      title: 'Fade', requiresIds: [gsap],
      blocks: [
        { label: 'cdn', language: 'html', placement: 'site_head', placementNote: '', code: '<script src="gsap.js"></script>' },
        { label: 'init', language: 'js', placement: 'site_body_end', placementNote: '', code: 'fade()' },
      ],
    }));
    expect((await getEntry(dev(), anim)).requires.map((r) => r.id)).toEqual([gsap]);
    expect((await getEntry(dev(), gsap)).requiredBy.map((r) => r.id)).toEqual([anim]);

    expect(await installOnProject(dev(), anim, p3!.id)).toBe(1);
    const installed = (await projectLibrary(dev(), p3!.id))!.map((i) => i.id).sort();
    expect(installed).toEqual([gsap, anim].sort());
    // دوباره: چیزی تازه نصب نمی‌شود.
    expect(await installOnProject(dev(), anim, p3!.id)).toBe(0);

    const groups = (await projectCombinedCode(dev(), p3!.id))!;
    const head = groups.find((g) => g.placement === 'site_head')!;
    expect(head.parts.map((x) => x.entryId)).toEqual([gsap]);
    expect(groups.find((g) => g.placement === 'site_body_end')!.code).toContain('<script>\nfade()\n</script>');
    // ⚠️ کارفرما این را نمی‌گیرد.
    expect(await projectCombinedCode(client(), p3!.id)).toBeNull();
  });

  it('مرتبط با «چطور با هم» از هر دو طرف', async () => {
    const a = await saveEntry(dev(), null, input({ title: 'Range slider' }));
    const b = await saveEntry(dev(), null, input({ title: 'List filter', related: [{ id: a, note: 'مقدار فیلتر را می‌سازد' }] }));
    expect((await getEntry(dev(), a)).related).toEqual([expect.objectContaining({ id: b, note: 'مقدار فیلتر را می‌سازد' })]);
  });

  it('⚠️ پیشنهاد: گام‌ها را عوض می‌کند، تصویرِ موردِ دیگر را نه؛ پذیرفتن «چه چیزی عوض شد» را از توضیحِ او می‌گیرد', async () => {
    const id = await saveEntry(dev(), null, input({ title: 'Guide', steps: titled('یک') }), [shot('own.png')]);
    const own = (await getEntry(dev(), id)).media[0]!.id;
    const strangerId = await saveEntry(other(), null, input({ title: 'Foreign' }), [shot('f.png')]);
    const foreign = (await getEntry(other(), strangerId)).media[0]!.id;
    const sid = await suggestEdit(other(), id, input({
      title: 'Guide',
      steps: [{ title: 'یک', body: 'دقیق‌تر', blockIndexes: [0], optionNames: [], mediaIds: [own, foreign] }],
    }), 'گامِ اول دقیق‌تر شد');
    const diff = await getSuggestionDiff(dev(), sid);
    expect(diff.suggestion.parts).toEqual(['steps']);
    expect(diff.after.steps[0]!.mediaIds).toEqual([own]);
    await reviewSuggestion(dev(), sid, 'accept');
    const e = await getEntry(dev(), id);
    expect(e.steps[0]).toMatchObject({ body: 'دقیق‌تر', blockIndexes: [0], mediaIds: [own] });
    expect(e.changeNote).toBe('گامِ اول دقیق‌تر شد');
  });

  it('⚠️ پیشنهاد و نسخهٔ ذخیره‌شده پیش از ۲.۴۷.۰ (گام‌ها متن) هنوز خوانده و بازگردانده می‌شوند', async () => {
    const id = await saveEntry(dev(), null, input({ title: 'Legacy', category: 'cms', steps: titled('تازه') }));
    const [rev] = await db.insert(libraryRevisions).values({
      entryId: id, authorId: DEV,
      snapshot: {
        entry: { kind: 'code', title: 'Legacy old', summary: '', platform: 'webflow', status: 'ready', topics: [], body: '',
          steps: 'قدیم ۱\nقدیم ۲', warnings: '', dependencies: '', demoUrl: '', clientVisible: false, originProjectId: null },
        blocks: [{ label: '', language: 'js', placement: 'site_body_end', placementNote: '', code: 'old()' }],
        options: [{ name: 'data-old', kind: 'attribute', description: '', defaultValue: '' }],
      },
    }).returning({ id: libraryRevisions.id });
    const snap = await getRevision(dev(), id, rev!.id);
    expect(snap.steps.map((s) => s.title)).toEqual(['قدیم ۱', 'قدیم ۲']);
    await restoreRevision(dev(), id, rev!.id);
    const e = await getEntry(dev(), id);
    expect(e.steps.map((s) => s.title)).toEqual(['قدیم ۱', 'قدیم ۲']);
    expect(e.options[0]).toMatchObject({ name: 'data-old', role: 'setting' });
    // ⚠️ دسته‌ای که بعداً اضافه شد با بازگرداندنِ نسخهٔ قدیمی پاک نمی‌شود.
    expect(e.category).toBe('cms');

    await db.insert(librarySuggestions).values({
      entryId: id, authorId: OTHER, note: 'old', baseUpdatedAt: new Date(),
      proposed: { title: 'Legacy', summary: '', topics: [], body: '', steps: 'الف\nب', warnings: '', dependencies: '', demoUrl: '',
        blocks: [{ label: '', language: 'js', placement: 'site_body_end', placementNote: '', code: 'old()' }], options: [] },
    });
    const legacy = (await getEntry(dev(), id)).suggestions.find((s) => s.note === 'old')!;
    expect(legacy.parts).toContain('steps');
    expect((await getSuggestionDiff(dev(), legacy.id)).after.steps.map((s) => s.title)).toEqual(['الف', 'ب']);
  });

  it('نسخهٔ جدا برای پروژه گام‌ها و پیش‌نیازها را می‌برد، بی‌ارجاع به تصویرها', async () => {
    const base = await saveEntry(dev(), null, input({ title: 'Base dep' }));
    const id = await saveEntry(dev(), null, input({
      title: 'Forkable', requiresIds: [base], steps: [{ key: '1', title: 'با تصویر', body: '', blockIndexes: [0], optionNames: [], mediaIds: [] }],
    }), [], { 1: [shot()] });
    await installOnProject(dev(), id, P1);
    const fork = await forkForProject(dev(), id, P1);
    const f = await getEntry(dev(), fork);
    expect(f.steps).toEqual([expect.objectContaining({ title: 'با تصویر', blockIndexes: [0], mediaIds: [] })]);
    expect(f.requires.map((r) => r.id)).toEqual([base]);
    expect(f.media).toEqual([]);
  });
});
