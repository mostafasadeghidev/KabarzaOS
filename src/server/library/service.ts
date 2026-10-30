import { and, asc, desc, eq, inArray, isNotNull, isNull, ne, or, sql, type SQL } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  attachments, auditLog, files, libraryBlocks, libraryEntries, libraryOptions, libraryProjects, libraryRelations,
  libraryRevisions, librarySuggestions, projectClients, projects, users,
} from '@/db/schema';
import { canManageSection, canViewSection, type Actor } from '@/domain/access/permissions';
import { visibleScopes } from '@/domain/access/guard';
import {
  canDeleteEntry, canEditEntry, canSuggestEdit, canUseLibrary, changedParts, cleanEntry, contentOf, ENTRY_ERRORS,
  isKind, isPlatform, SUGGESTION_NOTE_LIMIT,
  type CleanBlock, type CleanEntry, type CleanOption, type EntryError, type EntryInput, type LibraryKind,
  type LibraryLanguage, type LibraryOptionKind, type LibraryPlacement, type LibraryPlatform, type LibraryStatus,
  type LibrarySuggestionStatus, type SuggestedContent, type SuggestionPart,
} from '@/domain/library/model';
import {
  canInteractWithProject, canViewProject, managedOfficeProjectIds, membershipProjectIds,
} from '@/server/projects/authority';
import { discardUploads, removeFiles, storeUploads, type UploadBlob } from '@/server/files/service';
import { notify } from '@/server/notifications/service';
import { ownerIds } from '@/server/notifications/audience';

/**
 * کتابخانهٔ کد و راهنما (۲.۳۷.۰) — تنها دروازهٔ UI، اکشن‌ها و ابزارها.
 *
 * ⚠️ R-ARCH-01 — هر گاردی اینجاست. قاعده‌ها در `domain/library/model`:
 *  · دیدن و ساختن: تیم (مالک، همکارِ ادمین، عضو) — `canUseLibrary`؛
 *  · ویرایش: نویسنده یا مدیرِ سراسریِ پروژه‌ها — `canEditEntry`؛
 *  · نصب روی پروژه: هر کسی که روی **همان پروژه** کار می‌کند — `canInteractWithProject`؛
 *  · کارفرما: فقط راهنمای «کارفرما ببیند» ِ پروژهٔ خودش، فقط‌خواندنی.
 *  · پیشنهادِ ویرایش (۲.۴۶.۰): بقیهٔ تیم — `canSuggestEdit`؛ پذیرفتن با ویرایشگر.
 */

export class LibraryError extends Error {
  constructor(readonly code:
    | 'not_found' | 'forbidden' | 'installed' | 'bad_project' | 'archived'
    | 'can_edit' | 'note_required' | 'no_change' | 'decided' | EntryError) {
    super(`library: ${code}`);
    this.name = 'LibraryError';
  }
}

export const LIBRARY_MESSAGES: Record<LibraryError['code'], string> = {
  ...ENTRY_ERRORS,
  not_found: 'پیدا نشد.',
  forbidden: 'اجازهٔ این کار را ندارید.',
  installed: 'این مورد روی پروژه‌هایی نصب است؛ به‌جای حذف، بایگانی‌اش کنید.',
  bad_project: 'به این پروژه دسترسی ندارید.',
  archived: 'این مورد بایگانی شده است؛ اول از بایگانی درش بیاورید.',
  can_edit: 'این مورد را خودتان می‌توانید مستقیم ویرایش کنید.',
  note_required: 'بنویسید چه چیزی را بهتر کردید.',
  no_change: 'چیزی عوض نشده است.',
  decided: 'این پیشنهاد پیش از این بررسی شده است.',
};

function assertUse(actor: Actor): void {
  if (!canUseLibrary(actor)) throw new LibraryError('forbidden');
}

async function audit(actor: Actor, action: string, objectId: number, before?: unknown, after?: unknown) {
  await db.insert(auditLog).values({
    actorType: 'user', actorId: actor.id, action, objectType: 'library_entry', objectId,
    before: before ?? null, after: after ?? null,
  });
}

/* ------------------------------------------------------------------ *
 * شکل‌ها
 * ------------------------------------------------------------------ */

export interface EntryCard {
  id: number;
  kind: LibraryKind;
  title: string;
  summary: string;
  platform: LibraryPlatform;
  status: LibraryStatus;
  topics: string[];
  authorId: number | null;
  authorName: string | null;
  updatedAt: Date;
  installs: number;
  languages: LibraryLanguage[];
  clientVisible: boolean;
  archived: boolean;
  /** پیشنهادهای ویرایشِ منتظرِ بررسی (۲.۴۶.۰). */
  pendingSuggestions: number;
}

export interface BlockView {
  id: number;
  label: string;
  language: LibraryLanguage;
  placement: LibraryPlacement;
  placementNote: string;
  code: string;
}

export interface OptionView {
  id: number;
  name: string;
  kind: LibraryOptionKind;
  description: string;
  defaultValue: string;
}

export interface InstallView {
  id: number;
  projectId: number;
  projectTitle: string;
  projectCode: string;
  note: string;
  valuesNote: string;
  installedByName: string | null;
  createdAt: Date;
  /** بیننده روی این پروژه کار می‌کند — ویرایش و برداشتنِ نصب. */
  canChange: boolean;
}

export interface LibraryMedia {
  id: number;
  fileId: number;
  kind: string;
  mime: string;
  size: number;
  name: string;
  canDelete: boolean;
}

export interface EntryLink { id: number; title: string; kind: LibraryKind; archived: boolean }

export interface RevisionView { id: number; authorName: string | null; createdAt: Date }

export interface SuggestionView {
  id: number;
  authorId: number | null;
  authorName: string | null;
  note: string;
  status: LibrarySuggestionStatus;
  createdAt: Date;
  updatedAt: Date;
  reviewedByName: string | null;
  reviewedAt: Date | null;
  reviewNote: string;
  /** بخش‌هایی که با نسخهٔ **فعلی** فرق دارند — فقط برای پیشنهادِ باز. */
  parts: SuggestionPart[];
  /** مورد پس از فرستادنِ پیشنهاد ویرایش شده است. */
  stale: boolean;
  canReview: boolean;
  canWithdraw: boolean;
}

export interface EntryDetail extends EntryCard {
  body: string;
  steps: string;
  warnings: string;
  dependencies: string;
  demoUrl: string;
  createdAt: Date;
  updatedByName: string | null;
  blocks: BlockView[];
  options: OptionView[];
  installs: number;
  installList: InstallView[];
  /** نصب‌هایی که بیننده اجازهٔ دیدنِ پروژه‌شان را ندارد — فقط شمارش. */
  hiddenInstalls: number;
  related: EntryLink[];
  origin: { id: number; title: string } | null;
  forkedFrom: EntryLink | null;
  forks: EntryLink[];
  media: LibraryMedia[];
  revisions: RevisionView[];
  /** پیشنهادهای باز اول، بعد سی‌تای آخرِ بررسی‌شده. */
  suggestions: SuggestionView[];
  canEdit: boolean;
  /** بیننده نویسنده نیست ولی می‌تواند تغییر پیشنهاد دهد. */
  canSuggest: boolean;
  canDelete: boolean;
}

/** عکسِ یک نسخه — همان چیزی که در تاریخچه ذخیره و بازگردانده می‌شود. */
export interface Snapshot {
  entry: Omit<CleanEntry, 'blocks' | 'options' | 'relatedIds'>;
  blocks: CleanBlock[];
  options: CleanOption[];
}

export interface LibraryFilter {
  q?: string;
  kind?: string;
  platform?: string;
  topic?: string;
  /** فقط موردهای نصب‌شده روی این پروژه. */
  projectId?: number;
  mine?: boolean;
  archived?: boolean;
  /** فقط موردهایی که پیشنهادِ بازی دارند و بیننده بررسی‌شان می‌کند. */
  review?: boolean;
}

/* ------------------------------------------------------------------ *
 * فهرست
 * ------------------------------------------------------------------ */

const installsCount = sql<number>`(select count(*)::int from library_projects lp where lp.entry_id = ${libraryEntries.id})`;
const pendingCount = sql<number>`(select count(*)::int from library_suggestions ls where ls.entry_id = ${libraryEntries.id} and ls.status = 'pending')`;
const languagesOf = sql<LibraryLanguage[]>`coalesce((select array_agg(distinct lb.language) from library_blocks lb where lb.entry_id = ${libraryEntries.id}), '{}'::text[])`;

const cardColumns = {
  id: libraryEntries.id,
  kind: libraryEntries.kind,
  title: libraryEntries.title,
  summary: libraryEntries.summary,
  platform: libraryEntries.platform,
  status: libraryEntries.status,
  topics: libraryEntries.topics,
  authorId: libraryEntries.authorId,
  authorName: users.name,
  updatedAt: libraryEntries.updatedAt,
  installs: installsCount,
  languages: languagesOf,
  clientVisible: libraryEntries.clientVisible,
  archivedAt: libraryEntries.archivedAt,
  pendingSuggestions: pendingCount,
};

interface CardRow {
  id: number; kind: LibraryKind; title: string; summary: string; platform: LibraryPlatform; status: LibraryStatus;
  topics: string[]; authorId: number | null; authorName: string | null; updatedAt: Date; installs: number;
  languages: LibraryLanguage[] | null; clientVisible: boolean; archivedAt: Date | null; pendingSuggestions: number;
}

function toCard(r: CardRow): EntryCard {
  return {
    id: r.id, kind: r.kind, title: r.title, summary: r.summary, platform: r.platform, status: r.status,
    topics: r.topics ?? [], authorId: r.authorId, authorName: r.authorName, updatedAt: r.updatedAt,
    installs: Number(r.installs), languages: r.languages ?? [], clientVisible: r.clientVisible,
    archived: r.archivedAt !== null, pendingSuggestions: Number(r.pendingSuggestions),
  };
}

/** `%` و `_` ِ کاربر حرفِ معمولی‌اند، نه الگو. */
function likePattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

export async function listEntries(actor: Actor, filter: LibraryFilter = {}): Promise<EntryCard[]> {
  assertUse(actor);
  const where: SQL[] = [filter.archived ? isNotNull(libraryEntries.archivedAt) : isNull(libraryEntries.archivedAt)];
  if (filter.kind && isKind(filter.kind)) where.push(eq(libraryEntries.kind, filter.kind));
  if (filter.platform && isPlatform(filter.platform)) where.push(eq(libraryEntries.platform, filter.platform));
  if (filter.topic) where.push(sql`${filter.topic} = any(${libraryEntries.topics})`);
  if (filter.mine) where.push(eq(libraryEntries.authorId, actor.id));
  if (filter.review) {
    where.push(sql`${pendingCount} > 0`);
    // ⚠️ همان قاعدهٔ `canEditEntry`: نویسنده، یا مدیرِ سراسریِ پروژه‌ها همه را.
    if (!canManageSection(actor, 'projects')) where.push(eq(libraryEntries.authorId, actor.id));
  }
  if (filter.projectId) {
    where.push(sql`exists (select 1 from library_projects lp where lp.entry_id = ${libraryEntries.id} and lp.project_id = ${filter.projectId})`);
  }
  const q = filter.q?.trim();
  if (q) {
    /**
     * ⚠️ جستجو داخلِ **کد** و نامِ گزینه‌ها هم می‌گردد: کسی که دنبالِ
     * «macy» یا «data-flow-price» است، عنوانِ موردی را که آن را دارد بلد نیست.
     */
    const like = likePattern(q);
    where.push(or(
      sql`${libraryEntries.title} ilike ${like}`,
      sql`${libraryEntries.summary} ilike ${like}`,
      sql`${libraryEntries.body} ilike ${like}`,
      sql`${libraryEntries.steps} ilike ${like}`,
      sql`${libraryEntries.dependencies} ilike ${like}`,
      sql`array_to_string(${libraryEntries.topics}, ' ') ilike ${like}`,
      sql`exists (select 1 from library_blocks lb where lb.entry_id = ${libraryEntries.id} and (lb.code ilike ${like} or lb.label ilike ${like}))`,
      sql`exists (select 1 from library_options lo where lo.entry_id = ${libraryEntries.id} and (lo.name ilike ${like} or lo.description ilike ${like}))`,
    )!);
  }
  const rows = await db.select(cardColumns).from(libraryEntries)
    .leftJoin(users, eq(users.id, libraryEntries.authorId))
    .where(and(...where))
    .orderBy(desc(libraryEntries.updatedAt))
    .limit(500);
  return rows.map((r) => toCard(r as CardRow));
}

/** برچسب‌های در حالِ استفاده — پیشنهادِ فرم و فیلترِ فهرست. */
export async function libraryTopics(actor: Actor): Promise<string[]> {
  assertUse(actor);
  const rows = await db.execute<{ topic: string }>(sql`
    select distinct unnest(topics) as topic from library_entries where archived_at is null order by 1`);
  return rows.map((r) => r.topic);
}

/** همهٔ موردهای فعال — انتخابگرِ «مرتبط» و «افزودن از کتابخانه». */
export async function entryOptions(actor: Actor): Promise<EntryLink[]> {
  assertUse(actor);
  const rows = await db.select({ id: libraryEntries.id, title: libraryEntries.title, kind: libraryEntries.kind })
    .from(libraryEntries).where(isNull(libraryEntries.archivedAt)).orderBy(asc(libraryEntries.title));
  return rows.map((r) => ({ ...r, archived: false }));
}

/* ------------------------------------------------------------------ *
 * پروژه‌ها
 * ------------------------------------------------------------------ */

/**
 * پروژه‌هایی که بیننده **روی آن‌ها کار می‌کند** — همان گاردِ نصب.
 * ⚠️ دیدنِ سراسری (`projects.view`) کافی نیست: بینندهٔ فقط‌خواندنی چیزی روی
 * پروژه نصب نمی‌کند (`canInteractWithProject`).
 */
async function workableProjectIds(actor: Actor): Promise<number[] | 'all'> {
  if (canManageSection(actor, 'projects')) return 'all';
  const [asMember, managed] = await Promise.all([
    membershipProjectIds(actor.id, ['member']),
    managedOfficeProjectIds(actor.id),
  ]);
  return [...new Set([...asMember, ...managed])];
}

/** پروژه‌هایی که بیننده **نامشان** را می‌بیند — فهرستِ «نصب روی». */
async function viewableProjectIds(actor: Actor): Promise<number[] | 'all'> {
  if (canViewSection(actor, 'projects')) return 'all';
  return workableProjectIds(actor);
}

export interface ProjectOption { id: number; title: string; code: string }

/** انتخابگرِ «نصب روی پروژه» و «پروژهٔ مبدأ». */
export async function projectOptions(actor: Actor): Promise<ProjectOption[]> {
  assertUse(actor);
  const ids = await workableProjectIds(actor);
  if (ids !== 'all' && ids.length === 0) return [];
  return db.select({ id: projects.id, title: projects.title, code: projects.code }).from(projects)
    .where(and(
      isNull(projects.deletedAt),
      eq(projects.isArchived, false),
      ids === 'all' ? inArray(projects.scope, visibleScopes(actor)) : inArray(projects.id, ids),
    ))
    .orderBy(asc(projects.title));
}

/* ------------------------------------------------------------------ *
 * جزئیات
 * ------------------------------------------------------------------ */

async function loadEntry(id: number) {
  const [row] = await db.select().from(libraryEntries).where(eq(libraryEntries.id, id));
  if (!row) throw new LibraryError('not_found');
  return row;
}

async function blocksOf(id: number): Promise<BlockView[]> {
  return db.select({
    id: libraryBlocks.id, label: libraryBlocks.label, language: libraryBlocks.language,
    placement: libraryBlocks.placement, placementNote: libraryBlocks.placementNote, code: libraryBlocks.code,
  }).from(libraryBlocks).where(eq(libraryBlocks.entryId, id)).orderBy(asc(libraryBlocks.sortOrder), asc(libraryBlocks.id));
}

async function optionsOf(id: number): Promise<OptionView[]> {
  return db.select({
    id: libraryOptions.id, name: libraryOptions.name, kind: libraryOptions.kind,
    description: libraryOptions.description, defaultValue: libraryOptions.defaultValue,
  }).from(libraryOptions).where(eq(libraryOptions.entryId, id)).orderBy(asc(libraryOptions.sortOrder), asc(libraryOptions.id));
}

async function mediaOf(ids: readonly number[], canDelete: (entryId: number) => boolean): Promise<Map<number, LibraryMedia[]>> {
  const map = new Map<number, LibraryMedia[]>();
  if (ids.length === 0) return map;
  const rows = await db.select({
    id: attachments.id, entryId: attachments.libraryEntryId, fileId: attachments.fileId, kind: attachments.kind,
    mime: files.mime, size: files.size, name: files.originalName,
  }).from(attachments)
    .innerJoin(files, eq(files.id, attachments.fileId))
    .where(inArray(attachments.libraryEntryId, [...ids]))
    .orderBy(asc(attachments.id));
  for (const r of rows) {
    if (r.entryId === null || r.fileId === null) continue;
    map.set(r.entryId, [...(map.get(r.entryId) ?? []), {
      id: r.id, fileId: r.fileId, kind: r.kind, mime: r.mime, size: Number(r.size), name: r.name,
      canDelete: canDelete(r.entryId),
    }]);
  }
  return map;
}

async function relatedOf(id: number): Promise<EntryLink[]> {
  const rows = await db.select({
    id: libraryEntries.id, title: libraryEntries.title, kind: libraryEntries.kind, archivedAt: libraryEntries.archivedAt,
  }).from(libraryRelations)
    .innerJoin(libraryEntries, or(
      and(eq(libraryRelations.entryId, id), eq(libraryEntries.id, libraryRelations.relatedId)),
      and(eq(libraryRelations.relatedId, id), eq(libraryEntries.id, libraryRelations.entryId)),
    ))
    .where(or(eq(libraryRelations.entryId, id), eq(libraryRelations.relatedId, id)))
    .orderBy(asc(libraryEntries.title));
  return rows.map((r) => ({ id: r.id, title: r.title, kind: r.kind, archived: r.archivedAt !== null }));
}

export async function getEntry(actor: Actor, id: number): Promise<EntryDetail> {
  assertUse(actor);
  const [row] = await db.select({ ...cardColumns }).from(libraryEntries)
    .leftJoin(users, eq(users.id, libraryEntries.authorId))
    .where(eq(libraryEntries.id, id));
  if (!row) throw new LibraryError('not_found');
  const entry = await loadEntry(id);
  const card = toCard(row as CardRow);
  const editable = canEditEntry(actor, entry);

  const [blocks, options, installRows, related, forks, revisions, updater, viewable, workable, suggestionRows] = await Promise.all([
    blocksOf(id),
    optionsOf(id),
    db.select({
      id: libraryProjects.id, projectId: libraryProjects.projectId, projectTitle: projects.title,
      projectCode: projects.code, note: libraryProjects.note, valuesNote: libraryProjects.valuesNote,
      installedByName: users.name, createdAt: libraryProjects.createdAt,
    }).from(libraryProjects)
      .innerJoin(projects, eq(projects.id, libraryProjects.projectId))
      .leftJoin(users, eq(users.id, libraryProjects.installedBy))
      .where(and(eq(libraryProjects.entryId, id), isNull(projects.deletedAt)))
      .orderBy(asc(projects.title)),
    relatedOf(id),
    db.select({ id: libraryEntries.id, title: libraryEntries.title, kind: libraryEntries.kind, archivedAt: libraryEntries.archivedAt })
      .from(libraryEntries).where(eq(libraryEntries.forkedFromId, id)).orderBy(asc(libraryEntries.title)),
    db.select({ id: libraryRevisions.id, authorName: users.name, createdAt: libraryRevisions.createdAt })
      .from(libraryRevisions).leftJoin(users, eq(users.id, libraryRevisions.authorId))
      .where(eq(libraryRevisions.entryId, id)).orderBy(desc(libraryRevisions.createdAt)).limit(50),
    entry.updatedBy ? db.select({ name: users.name }).from(users).where(eq(users.id, entry.updatedBy)) : Promise.resolve([]),
    viewableProjectIds(actor),
    workableProjectIds(actor),
    db.select().from(librarySuggestions).where(eq(librarySuggestions.entryId, id))
      .orderBy(desc(librarySuggestions.updatedAt)).limit(60),
  ]);
  // پیشنهادهای باز همه، بسته‌ها سی‌تای آخر.
  const shownSuggestions = [
    ...suggestionRows.filter((s) => s.status === 'pending'),
    ...suggestionRows.filter((s) => s.status !== 'pending').slice(0, 30),
  ];
  const suggestions = await suggestionViews(actor, entry, shownSuggestions, contentOf({ ...entry, blocks, options }));

  const canSee = (pid: number) => viewable === 'all' || viewable.includes(pid);
  const canWork = (pid: number) => workable === 'all' || workable.includes(pid);
  const visibleInstalls = installRows.filter((r) => canSee(r.projectId));

  const [origin, forkedFrom, media] = await Promise.all([
    entry.originProjectId && canSee(entry.originProjectId)
      ? db.select({ id: projects.id, title: projects.title }).from(projects)
        .where(and(eq(projects.id, entry.originProjectId), isNull(projects.deletedAt)))
      : Promise.resolve([]),
    entry.forkedFromId
      ? db.select({ id: libraryEntries.id, title: libraryEntries.title, kind: libraryEntries.kind, archivedAt: libraryEntries.archivedAt })
        .from(libraryEntries).where(eq(libraryEntries.id, entry.forkedFromId))
      : Promise.resolve([]),
    mediaOf([id], () => editable),
  ]);

  return {
    ...card,
    body: entry.body,
    steps: entry.steps,
    warnings: entry.warnings,
    dependencies: entry.dependencies,
    demoUrl: entry.demoUrl,
    createdAt: entry.createdAt,
    updatedByName: updater[0]?.name ?? null,
    blocks,
    options,
    installList: visibleInstalls.map((r) => ({ ...r, canChange: canWork(r.projectId) || editable })),
    hiddenInstalls: installRows.length - visibleInstalls.length,
    related,
    origin: origin[0] ?? null,
    forkedFrom: forkedFrom[0]
      ? { id: forkedFrom[0].id, title: forkedFrom[0].title, kind: forkedFrom[0].kind, archived: forkedFrom[0].archivedAt !== null }
      : null,
    forks: forks.map((f) => ({ id: f.id, title: f.title, kind: f.kind, archived: f.archivedAt !== null })),
    media: media.get(id) ?? [],
    revisions,
    suggestions,
    canEdit: editable,
    canSuggest: canSuggestEdit(actor, entry),
    canDelete: canDeleteEntry(actor, entry, installRows.length),
  };
}

/** ردیف‌های پیشنهاد → شکلِ صفحه؛ بخش‌های عوض‌شده نسبت به نسخهٔ فعلی. */
async function suggestionViews(
  actor: Actor,
  entry: typeof libraryEntries.$inferSelect,
  rows: Array<typeof librarySuggestions.$inferSelect>,
  current: SuggestedContent,
): Promise<SuggestionView[]> {
  if (rows.length === 0) return [];
  const ids = [...new Set(rows.flatMap((r) => [r.authorId, r.reviewedBy]).filter((v): v is number => v !== null))];
  const names = ids.length > 0
    ? new Map((await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, ids))).map((u) => [u.id, u.name]))
    : new Map<number, string>();
  const editable = canEditEntry(actor, entry);
  return rows.map((r) => {
    const open = r.status === 'pending';
    return {
      id: r.id,
      authorId: r.authorId,
      authorName: r.authorId ? names.get(r.authorId) ?? null : null,
      note: r.note,
      status: r.status,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      reviewedByName: r.reviewedBy ? names.get(r.reviewedBy) ?? null : null,
      reviewedAt: r.reviewedAt,
      reviewNote: r.reviewNote,
      parts: open ? changedParts(current, r.proposed as SuggestedContent) : [],
      stale: open && entry.updatedAt.getTime() > r.baseUpdatedAt.getTime(),
      canReview: open && editable,
      canWithdraw: open && r.authorId === actor.id,
    };
  });
}

/** فرمِ ویرایش — همان جزئیات، فقط برای ویرایشگر. */
export async function getEntryForEdit(actor: Actor, id: number): Promise<EntryDetail> {
  const detail = await getEntry(actor, id);
  if (!detail.canEdit) throw new LibraryError('forbidden');
  return detail;
}

/* ------------------------------------------------------------------ *
 * نوشتن
 * ------------------------------------------------------------------ */

function snapshotOf(entry: typeof libraryEntries.$inferSelect, blocks: BlockView[], options: OptionView[]): Snapshot {
  return {
    entry: {
      kind: entry.kind, title: entry.title, summary: entry.summary, platform: entry.platform, status: entry.status,
      topics: entry.topics, body: entry.body, steps: entry.steps, warnings: entry.warnings,
      dependencies: entry.dependencies, demoUrl: entry.demoUrl, clientVisible: entry.clientVisible,
      originProjectId: entry.originProjectId,
    },
    blocks: blocks.map(({ label, language, placement, placementNote, code }) => ({ label, language, placement, placementNote, code })),
    options: options.map(({ name, kind, description, defaultValue }) => ({ name, kind, description, defaultValue })),
  };
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function writeContent(tx: Tx, id: number, blocks: readonly CleanBlock[], options: readonly CleanOption[]) {
  await tx.delete(libraryBlocks).where(eq(libraryBlocks.entryId, id));
  await tx.delete(libraryOptions).where(eq(libraryOptions.entryId, id));
  if (blocks.length > 0) {
    await tx.insert(libraryBlocks).values(blocks.map((b, i) => ({ ...b, entryId: id, sortOrder: i })));
  }
  if (options.length > 0) {
    await tx.insert(libraryOptions).values(options.map((o, i) => ({ ...o, entryId: id, sortOrder: i })));
  }
}

async function writeRelations(tx: Tx, id: number, relatedIds: readonly number[]) {
  await tx.delete(libraryRelations).where(or(eq(libraryRelations.entryId, id), eq(libraryRelations.relatedId, id)));
  const others = relatedIds.filter((r) => r !== id);
  if (others.length === 0) return;
  const existing = await tx.select({ id: libraryEntries.id }).from(libraryEntries).where(inArray(libraryEntries.id, others));
  const pairs = existing.map((e) => (e.id < id ? { entryId: e.id, relatedId: id } : { entryId: id, relatedId: e.id }));
  if (pairs.length > 0) await tx.insert(libraryRelations).values(pairs).onConflictDoNothing();
}

/**
 * ساختن یا ویرایش.
 *
 * ⚠️ پیش از هر ویرایش عکسِ نسخهٔ فعلی در تاریخچه می‌نشیند — کدِ قبلی‌ای که
 * روی سایتِ یک کارفرما کار می‌کرد نباید با یک «ذخیره» گم شود.
 * ⚠️ موردِ تازه‌ای که پروژهٔ مبدأ دارد خودبه‌خود روی همان پروژه نصب‌شده
 * ثبت می‌شود؛ برای همین مبدأ همان گاردِ نصب را دارد.
 */
export async function saveEntry(
  actor: Actor,
  id: number | null,
  input: EntryInput,
  media: readonly UploadBlob[] = [],
): Promise<number> {
  assertUse(actor);
  const cleaned = cleanEntry(input);
  if (!cleaned.ok) throw new LibraryError(cleaned.error);
  const clean = cleaned.entry;

  const existing = id ? await loadEntry(id) : null;
  if (existing && !canEditEntry(actor, existing)) throw new LibraryError('forbidden');
  // مبدأ فقط وقتی عوض شده سنجیده می‌شود — ویرایشگری که روی مبدأ کار نمی‌کند هنوز می‌تواند متن را اصلاح کند.
  if (clean.originProjectId && clean.originProjectId !== existing?.originProjectId
    && !(await canInteractWithProject(actor, clean.originProjectId))) {
    throw new LibraryError('bad_project');
  }

  const { blocks, options, relatedIds, ...fields } = clean;
  const stored = await storeUploads(actor, media);
  try {
    const entryId = await db.transaction(async (tx) => {
      let entryId: number;
      if (existing) {
        const before = snapshotOf(existing, await blocksOf(existing.id), await optionsOf(existing.id));
        await tx.insert(libraryRevisions).values({ entryId: existing.id, authorId: actor.id, snapshot: before });
        await tx.update(libraryEntries).set({ ...fields, updatedBy: actor.id, updatedAt: new Date() })
          .where(eq(libraryEntries.id, existing.id));
        entryId = existing.id;
      } else {
        const [row] = await tx.insert(libraryEntries)
          .values({ ...fields, authorId: actor.id, updatedBy: actor.id })
          .returning({ id: libraryEntries.id });
        entryId = row!.id;
        if (fields.originProjectId) {
          await tx.insert(libraryProjects)
            .values({ entryId, projectId: fields.originProjectId, installedBy: actor.id })
            .onConflictDoNothing();
        }
      }
      await writeContent(tx, entryId, blocks, options);
      await writeRelations(tx, entryId, relatedIds);
      if (stored.length > 0) {
        await tx.insert(attachments).values(stored.map((f) => ({
          fileId: f.fileId, kind: f.kind, userId: actor.id, libraryEntryId: entryId,
        })));
      }
      return entryId;
    });
    await audit(actor, existing ? 'library.update' : 'library.create', entryId, null, {
      kind: fields.kind, title: fields.title, blocks: blocks.length, options: options.length, media: stored.length,
    });
    return entryId;
  } catch (error) {
    await discardUploads(stored);
    throw error;
  }
}

export async function setEntryArchived(actor: Actor, id: number, archived: boolean): Promise<void> {
  assertUse(actor);
  const entry = await loadEntry(id);
  if (!canEditEntry(actor, entry)) throw new LibraryError('forbidden');
  await db.update(libraryEntries).set({ archivedAt: archived ? new Date() : null, updatedAt: new Date() })
    .where(eq(libraryEntries.id, id));
  await audit(actor, archived ? 'library.archive' : 'library.unarchive', id);
}

export async function deleteEntry(actor: Actor, id: number): Promise<void> {
  assertUse(actor);
  const entry = await loadEntry(id);
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(libraryProjects)
    .where(eq(libraryProjects.entryId, id)) as [{ n: number }];
  if (!canEditEntry(actor, entry)) throw new LibraryError('forbidden');
  if (!canDeleteEntry(actor, entry, Number(n))) throw new LibraryError('installed');
  // ⚠️ ردیف‌های پیوست با cascade می‌روند، ولی خودِ فایل‌ها (ردیفِ files و شیء) نه.
  const own = await db.select({ fileId: attachments.fileId }).from(attachments).where(eq(attachments.libraryEntryId, id));
  await db.delete(libraryEntries).where(eq(libraryEntries.id, id));
  await removeFiles(own.map((o) => o.fileId).filter((f): f is number => f !== null));
  await audit(actor, 'library.delete', id, { title: entry.title, kind: entry.kind }, null);
}

export async function deleteLibraryMedia(actor: Actor, attachmentId: number): Promise<void> {
  assertUse(actor);
  const [row] = await db.select({ fileId: attachments.fileId, entryId: attachments.libraryEntryId })
    .from(attachments).where(eq(attachments.id, attachmentId));
  if (!row || row.entryId === null) throw new LibraryError('not_found');
  const entry = await loadEntry(row.entryId);
  if (!canEditEntry(actor, entry)) throw new LibraryError('forbidden');
  await db.delete(attachments).where(eq(attachments.id, attachmentId));
  if (row.fileId) await removeFiles([row.fileId]);
  await audit(actor, 'library.media_delete', row.entryId, { attachmentId }, null);
}

/* ------------------------------------------------------------------ *
 * تاریخچه
 * ------------------------------------------------------------------ */

export async function getRevision(actor: Actor, entryId: number, revisionId: number): Promise<Snapshot> {
  assertUse(actor);
  const [row] = await db.select({ snapshot: libraryRevisions.snapshot }).from(libraryRevisions)
    .where(and(eq(libraryRevisions.id, revisionId), eq(libraryRevisions.entryId, entryId)));
  if (!row) throw new LibraryError('not_found');
  return row.snapshot as Snapshot;
}

/** بازگرداندنِ یک نسخه — خودِ نسخهٔ فعلی هم پیش از آن در تاریخچه می‌نشیند. */
export async function restoreRevision(actor: Actor, entryId: number, revisionId: number): Promise<void> {
  const snap = await getRevision(actor, entryId, revisionId);
  const entry = await loadEntry(entryId);
  if (!canEditEntry(actor, entry)) throw new LibraryError('forbidden');
  const current = snapshotOf(entry, await blocksOf(entryId), await optionsOf(entryId));
  await db.transaction(async (tx) => {
    await tx.insert(libraryRevisions).values({ entryId, authorId: actor.id, snapshot: current });
    await tx.update(libraryEntries).set({
      ...snap.entry,
      // ⚠️ «کارفرما ببیند» فقط برای راهنما — همان قاعدهٔ `cleanEntry`، حتی در عکسِ قدیمی.
      clientVisible: snap.entry.kind === 'guide' && snap.entry.clientVisible,
      updatedBy: actor.id,
      updatedAt: new Date(),
    }).where(eq(libraryEntries.id, entryId));
    await writeContent(tx, entryId, snap.blocks, snap.options);
  });
  await audit(actor, 'library.restore', entryId, null, { revisionId });
}

/* ------------------------------------------------------------------ *
 * پیشنهادِ ویرایش (۲.۴۶.۰)
 * ------------------------------------------------------------------ */

/**
 * ⚠️ چرا: عضوی که نویسنده نیست تا امروز فقط می‌توانست «نسخهٔ جدا» بسازد؛
 * اصلاحِ یک باگ در کدِ همکار به‌جای اینکه به همهٔ پروژه‌ها برسد، یک نسخهٔ
 * موازی می‌ساخت. حالا تغییر را پیشنهاد می‌دهد، نویسنده (یا مدیرِ پروژه‌ها)
 * تفاوت را می‌بیند و با یک کلیک می‌پذیرد — هیچ چیز بی‌تأیید جا نمی‌افتد.
 */

/** محتوای فعلیِ یک مورد — پایهٔ مقایسه. */
async function currentContent(entry: typeof libraryEntries.$inferSelect): Promise<SuggestedContent> {
  const [blocks, options] = await Promise.all([blocksOf(entry.id), optionsOf(entry.id)]);
  return contentOf({ ...entry, blocks, options });
}

/**
 * پاک‌سازیِ محتوای پیشنهادی با قاعده‌های **خودِ مورد**: نوع، وضعیت و بقیه از
 * موردِ فعلی می‌آیند تا مثلاً «کد» بی‌تکه‌کد پذیرفته نشود.
 */
function cleanProposal(
  entry: typeof libraryEntries.$inferSelect,
  input: Pick<EntryInput, 'title' | 'summary' | 'topics' | 'body' | 'steps' | 'warnings' | 'dependencies' | 'demoUrl' | 'blocks' | 'options'>,
): SuggestedContent {
  const cleaned = cleanEntry({
    ...input,
    kind: entry.kind,
    platform: entry.platform,
    status: entry.status,
    clientVisible: entry.clientVisible,
    originProjectId: entry.originProjectId,
    relatedIds: [],
  });
  if (!cleaned.ok) throw new LibraryError(cleaned.error);
  return contentOf(cleaned.entry);
}

async function loadSuggestion(id: number) {
  const [row] = await db.select().from(librarySuggestions).where(eq(librarySuggestions.id, id));
  if (!row) throw new LibraryError('not_found');
  return row;
}

/** چه کسی پیشنهاد را بررسی می‌کند: نویسنده؛ اگر نویسنده‌ای نمانده، مالک‌ها. */
async function reviewerIds(entry: typeof libraryEntries.$inferSelect): Promise<number[]> {
  if (entry.authorId) {
    const [author] = await db.select({ id: users.id }).from(users)
      .where(and(eq(users.id, entry.authorId), isNull(users.deletedAt)));
    if (author) return [author.id];
  }
  return ownerIds();
}

/** فرمِ پیشنهاد — جزئیاتِ مورد، و اگر پیشنهادِ بازی از خودِ کاربر هست، همان. */
export async function getEntryForSuggest(
  actor: Actor,
  id: number,
): Promise<{ entry: EntryDetail; draft: { content: SuggestedContent; note: string } | null }> {
  const entry = await getEntry(actor, id);
  if (!entry.canSuggest) throw new LibraryError(entry.canEdit ? 'can_edit' : 'forbidden');
  const [mine] = await db.select({ proposed: librarySuggestions.proposed, note: librarySuggestions.note })
    .from(librarySuggestions)
    .where(and(
      eq(librarySuggestions.entryId, id),
      eq(librarySuggestions.authorId, actor.id),
      eq(librarySuggestions.status, 'pending'),
    ));
  return { entry, draft: mine ? { content: mine.proposed as SuggestedContent, note: mine.note } : null };
}

/**
 * فرستادنِ پیشنهاد. ⚠️ هر نفر روی هر مورد **یک** پیشنهادِ باز دارد —
 * فرستادنِ دوباره همان را تازه می‌کند، نه اینکه صفِ بررسی را پر کند.
 */
export async function suggestEdit(actor: Actor, entryId: number, input: EntryInput, note: string): Promise<number> {
  assertUse(actor);
  const entry = await loadEntry(entryId);
  if (!canSuggestEdit(actor, entry)) throw new LibraryError('can_edit');
  if (entry.archivedAt) throw new LibraryError('archived');
  const why = note.trim().slice(0, SUGGESTION_NOTE_LIMIT);
  if (!why) throw new LibraryError('note_required');

  const proposed = cleanProposal(entry, input);
  if (changedParts(await currentContent(entry), proposed).length === 0) throw new LibraryError('no_change');

  const [open] = await db.select({ id: librarySuggestions.id }).from(librarySuggestions)
    .where(and(
      eq(librarySuggestions.entryId, entryId),
      eq(librarySuggestions.authorId, actor.id),
      eq(librarySuggestions.status, 'pending'),
    ));
  let id: number;
  if (open) {
    await db.update(librarySuggestions)
      .set({ proposed, note: why, baseUpdatedAt: entry.updatedAt, updatedAt: new Date() })
      .where(eq(librarySuggestions.id, open.id));
    id = open.id;
  } else {
    const [row] = await db.insert(librarySuggestions)
      .values({ entryId, authorId: actor.id, proposed, note: why, baseUpdatedAt: entry.updatedAt })
      .returning({ id: librarySuggestions.id });
    id = row!.id;
  }
  await audit(actor, 'library.suggest', entryId, null, { suggestionId: id });
  const [me] = await db.select({ name: users.name }).from(users).where(eq(users.id, actor.id));
  await notify((await reviewerIds(entry)).filter((u) => u !== actor.id), {
    type: 'library.suggestion',
    title: '{name} برای «{entry}» پیشنهادِ ویرایش فرستاد',
    body: '{note}',
    params: { name: me?.name ?? '', entry: entry.title, note: why },
    url: `/library/${entryId}?suggestion=${id}`,
  });
  return id;
}

export interface SuggestionDiff {
  suggestion: SuggestionView;
  /** نسخهٔ **فعلیِ** مورد — نه نسخه‌ای که پیشنهاد رویش نوشته شد. */
  before: SuggestedContent;
  after: SuggestedContent;
}

/** تفاوتِ یک پیشنهاد با نسخهٔ فعلی — هر کسی که کتابخانه را دارد می‌بیند. */
export async function getSuggestionDiff(actor: Actor, suggestionId: number): Promise<SuggestionDiff> {
  assertUse(actor);
  const row = await loadSuggestion(suggestionId);
  const entry = await loadEntry(row.entryId);
  const before = await currentContent(entry);
  const after = row.proposed as SuggestedContent;
  const [view] = await suggestionViews(actor, entry, [row], before);
  return { suggestion: view!, before, after };
}

/**
 * پذیرفتن یا رد — فقط کسی که مورد را ویرایش می‌کند.
 *
 * ⚠️ پذیرفتن همان مسیرِ «ذخیره» است: نسخهٔ فعلی اول در تاریخچه می‌نشیند و
 * با «بازگرداندن» برمی‌گردد. «آخرین ویرایش» به نامِ پیشنهاددهنده ثبت می‌شود.
 * ⚠️ وضعیت با شرطِ `pending` عوض می‌شود: دو بررسی‌کنندهٔ هم‌زمان یک پیشنهاد
 * را دو بار اعمال نمی‌کنند.
 */
export async function reviewSuggestion(
  actor: Actor,
  suggestionId: number,
  decision: 'accept' | 'reject',
  reviewNote = '',
): Promise<number> {
  assertUse(actor);
  const row = await loadSuggestion(suggestionId);
  if (row.status !== 'pending') throw new LibraryError('decided');
  const entry = await loadEntry(row.entryId);
  if (!canEditEntry(actor, entry)) throw new LibraryError('forbidden');
  const note = reviewNote.trim().slice(0, SUGGESTION_NOTE_LIMIT);
  const decided = { reviewedBy: actor.id, reviewedAt: new Date(), reviewNote: note, updatedAt: new Date() };

  if (decision === 'accept') {
    if (entry.archivedAt) throw new LibraryError('archived');
    const content = cleanProposal(entry, row.proposed as SuggestedContent);
    const before = snapshotOf(entry, await blocksOf(entry.id), await optionsOf(entry.id));
    await db.transaction(async (tx) => {
      const done = await tx.update(librarySuggestions).set({ ...decided, status: 'accepted' })
        .where(and(eq(librarySuggestions.id, suggestionId), eq(librarySuggestions.status, 'pending')))
        .returning({ id: librarySuggestions.id });
      if (done.length === 0) throw new LibraryError('decided');
      await tx.insert(libraryRevisions).values({ entryId: entry.id, authorId: row.authorId ?? actor.id, snapshot: before });
      const { blocks, options, ...fields } = content;
      await tx.update(libraryEntries).set({ ...fields, updatedBy: row.authorId ?? actor.id, updatedAt: new Date() })
        .where(eq(libraryEntries.id, entry.id));
      await writeContent(tx, entry.id, blocks, options);
    });
  } else {
    const done = await db.update(librarySuggestions).set({ ...decided, status: 'rejected' })
      .where(and(eq(librarySuggestions.id, suggestionId), eq(librarySuggestions.status, 'pending')))
      .returning({ id: librarySuggestions.id });
    if (done.length === 0) throw new LibraryError('decided');
  }

  await audit(actor, decision === 'accept' ? 'library.suggestion_accept' : 'library.suggestion_reject', entry.id, null, { suggestionId });
  if (row.authorId && row.authorId !== actor.id) {
    await notify([row.authorId], {
      type: decision === 'accept' ? 'library.suggestion_accepted' : 'library.suggestion_rejected',
      title: decision === 'accept' ? 'پیشنهادِ شما برای «{entry}» پذیرفته شد' : 'پیشنهادِ شما برای «{entry}» رد شد',
      body: note ? '{note}' : undefined,
      params: { entry: entry.title, note },
      url: `/library/${entry.id}?suggestion=${suggestionId}`,
    });
  }
  return entry.id;
}

/** پس‌گرفتنِ پیشنهادِ بازِ خود. */
export async function withdrawSuggestion(actor: Actor, suggestionId: number): Promise<number> {
  assertUse(actor);
  const row = await loadSuggestion(suggestionId);
  if (row.authorId !== actor.id) throw new LibraryError('forbidden');
  const done = await db.update(librarySuggestions).set({ status: 'withdrawn', updatedAt: new Date() })
    .where(and(eq(librarySuggestions.id, suggestionId), eq(librarySuggestions.status, 'pending')))
    .returning({ id: librarySuggestions.id });
  if (done.length === 0) throw new LibraryError('decided');
  await audit(actor, 'library.suggestion_withdraw', row.entryId, null, { suggestionId });
  return row.entryId;
}

/* ------------------------------------------------------------------ *
 * نصب روی پروژه
 * ------------------------------------------------------------------ */

async function assertWorkOn(actor: Actor, projectId: number): Promise<void> {
  if (!(await canInteractWithProject(actor, projectId))) throw new LibraryError('bad_project');
  // ⚠️ کارفرما روی پروژه «کار می‌کند» ولی کتابخانه مالِ او نیست.
  assertUse(actor);
}

export async function installOnProject(
  actor: Actor,
  entryId: number,
  projectId: number,
  note = '',
  valuesNote = '',
): Promise<void> {
  await assertWorkOn(actor, projectId);
  const entry = await loadEntry(entryId);
  if (entry.archivedAt) throw new LibraryError('archived');
  await db.insert(libraryProjects).values({
    entryId, projectId, installedBy: actor.id,
    note: note.trim().slice(0, 500), valuesNote: valuesNote.trim().slice(0, 2000),
  }).onConflictDoUpdate({
    target: [libraryProjects.entryId, libraryProjects.projectId],
    set: { note: note.trim().slice(0, 500), valuesNote: valuesNote.trim().slice(0, 2000), updatedAt: new Date() },
  });
  await audit(actor, 'library.install', entryId, null, { projectId });
}

async function loadInstall(installId: number) {
  const [row] = await db.select().from(libraryProjects).where(eq(libraryProjects.id, installId));
  if (!row) throw new LibraryError('not_found');
  return row;
}

/** کسی که روی پروژه کار می‌کند، یا ویرایشگرِ خودِ مورد. */
async function assertChangeInstall(actor: Actor, install: { entryId: number; projectId: number }) {
  assertUse(actor);
  if (await canInteractWithProject(actor, install.projectId)) return;
  if (canEditEntry(actor, await loadEntry(install.entryId))) return;
  throw new LibraryError('forbidden');
}

export async function updateInstall(actor: Actor, installId: number, note: string, valuesNote: string): Promise<void> {
  const install = await loadInstall(installId);
  await assertChangeInstall(actor, install);
  await db.update(libraryProjects).set({
    note: note.trim().slice(0, 500), valuesNote: valuesNote.trim().slice(0, 2000), updatedAt: new Date(),
  }).where(eq(libraryProjects.id, installId));
}

export async function removeInstall(actor: Actor, installId: number): Promise<void> {
  const install = await loadInstall(installId);
  await assertChangeInstall(actor, install);
  await db.delete(libraryProjects).where(eq(libraryProjects.id, installId));
  await audit(actor, 'library.uninstall', install.entryId, { projectId: install.projectId }, null);
}

/**
 * «نسخهٔ این پروژه» — کپیِ جدا برای وقتی که پروژه کمی فرق می‌خواهد.
 *
 * ⚠️ نصبِ اصلی روی همین پروژه با نصبِ نسخهٔ تازه جابه‌جا می‌شود؛ وگرنه
 * پروژه دو نسخه از یک کد را «نصب‌شده» نشان می‌داد.
 * ⚠️ تصویرها کپی نمی‌شوند: فایل یک صاحب دارد و حذفِ یکی نباید دیگری را بشکند.
 */
export async function forkForProject(actor: Actor, entryId: number, projectId: number): Promise<number> {
  await assertWorkOn(actor, projectId);
  const source = await loadEntry(entryId);
  const [project] = await db.select({ title: projects.title }).from(projects).where(eq(projects.id, projectId));
  if (!project) throw new LibraryError('not_found');
  const [blocks, options, oldInstall] = await Promise.all([
    blocksOf(entryId),
    optionsOf(entryId),
    db.select().from(libraryProjects)
      .where(and(eq(libraryProjects.entryId, entryId), eq(libraryProjects.projectId, projectId))),
  ]);

  const id = await db.transaction(async (tx) => {
    const [row] = await tx.insert(libraryEntries).values({
      kind: source.kind,
      title: `${source.title} — ${project.title}`.slice(0, 200),
      summary: source.summary,
      platform: source.platform,
      status: source.status === 'deprecated' ? 'ready' : source.status,
      topics: source.topics,
      body: source.body,
      steps: source.steps,
      warnings: source.warnings,
      dependencies: source.dependencies,
      demoUrl: source.demoUrl,
      clientVisible: source.clientVisible,
      originProjectId: projectId,
      forkedFromId: source.id,
      authorId: actor.id,
      updatedBy: actor.id,
    }).returning({ id: libraryEntries.id });
    const forkId = row!.id;
    await writeContent(
      tx, forkId,
      blocks.map(({ label, language, placement, placementNote, code }) => ({ label, language, placement, placementNote, code })),
      options.map(({ name, kind, description, defaultValue }) => ({ name, kind, description, defaultValue })),
    );
    await tx.delete(libraryProjects).where(and(eq(libraryProjects.entryId, entryId), eq(libraryProjects.projectId, projectId)));
    await tx.insert(libraryProjects).values({
      entryId: forkId, projectId, installedBy: actor.id,
      note: oldInstall[0]?.note ?? '', valuesNote: oldInstall[0]?.valuesNote ?? '',
    });
    return forkId;
  });
  await audit(actor, 'library.fork', id, { from: entryId }, { projectId });
  return id;
}

/* ------------------------------------------------------------------ *
 * تبِ پروژه
 * ------------------------------------------------------------------ */

export interface ProjectLibraryItem extends EntryCard {
  installId: number;
  note: string;
  valuesNote: string;
  installedByName: string | null;
  installedAt: Date;
}

export interface ClientGuide {
  id: number;
  title: string;
  summary: string;
  body: string;
  steps: string;
  warnings: string;
  options: OptionView[];
  media: LibraryMedia[];
  note: string;
  valuesNote: string;
  updatedAt: Date;
}

/** نصب‌های یک پروژه برای تیم — `null` یعنی بیننده تیم نیست. */
export async function projectLibrary(actor: Actor, projectId: number): Promise<ProjectLibraryItem[] | null> {
  if (!canUseLibrary(actor) || !(await canViewProject(actor, projectId))) return null;
  const rows = await db.select({
    ...cardColumns,
    installId: libraryProjects.id,
    note: libraryProjects.note,
    valuesNote: libraryProjects.valuesNote,
    installedBy: libraryProjects.installedBy,
    installedAt: libraryProjects.createdAt,
  }).from(libraryProjects)
    .innerJoin(libraryEntries, eq(libraryEntries.id, libraryProjects.entryId))
    .leftJoin(users, eq(users.id, libraryEntries.authorId))
    .where(eq(libraryProjects.projectId, projectId))
    .orderBy(asc(libraryEntries.kind), asc(libraryEntries.title));
  const installerIds = [...new Set(rows.map((r) => r.installedBy).filter((v): v is number => v !== null))];
  const installers = installerIds.length > 0
    ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, installerIds))
    : [];
  const nameOf = new Map(installers.map((u) => [u.id, u.name]));
  return rows.map((r) => ({
    ...toCard(r as CardRow),
    installId: r.installId,
    note: r.note,
    valuesNote: r.valuesNote,
    installedByName: r.installedBy ? nameOf.get(r.installedBy) ?? null : null,
    installedAt: r.installedAt,
  }));
}

/** آیا بیننده کارفرمای (نامسدودِ) این پروژه است؟ */
async function isActiveClient(actor: Actor, projectId: number): Promise<boolean> {
  if (!actor.roles.includes('client')) return false;
  const rows = await db.select({ blocked: projectClients.accessBlocked }).from(projectClients)
    .where(and(eq(projectClients.projectId, projectId), eq(projectClients.userId, actor.id)));
  return rows.some((r) => !r.blocked);
}

const clientGuideWhere = (projectId: number) => and(
  eq(libraryProjects.projectId, projectId),
  eq(libraryEntries.kind, 'guide'),
  eq(libraryEntries.clientVisible, true),
  ne(libraryEntries.status, 'draft'),
  isNull(libraryEntries.archivedAt),
);

/**
 * راهنماهای کارفرما برای **کارفرمای همین پروژه** — کامل، چون او صفحهٔ
 * کتابخانه را ندارد. پیش‌نویس، بایگانی و هر چیزِ غیرِ راهنما بیرون می‌ماند.
 */
export async function clientGuidesFor(actor: Actor, projectId: number): Promise<ClientGuide[] | null> {
  if (canUseLibrary(actor) || !(await isActiveClient(actor, projectId))) return null;
  const rows = await db.select({
    id: libraryEntries.id, title: libraryEntries.title, summary: libraryEntries.summary, body: libraryEntries.body,
    steps: libraryEntries.steps, warnings: libraryEntries.warnings, updatedAt: libraryEntries.updatedAt,
    note: libraryProjects.note, valuesNote: libraryProjects.valuesNote,
  }).from(libraryProjects)
    .innerJoin(libraryEntries, eq(libraryEntries.id, libraryProjects.entryId))
    .where(clientGuideWhere(projectId))
    .orderBy(asc(libraryEntries.title));
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const [opts, media] = await Promise.all([
    db.select({
      entryId: libraryOptions.entryId, id: libraryOptions.id, name: libraryOptions.name, kind: libraryOptions.kind,
      description: libraryOptions.description, defaultValue: libraryOptions.defaultValue,
    }).from(libraryOptions).where(inArray(libraryOptions.entryId, ids))
      .orderBy(asc(libraryOptions.sortOrder), asc(libraryOptions.id)),
    mediaOf(ids, () => false),
  ]);
  return rows.map((r) => ({
    ...r,
    options: opts.filter((o) => o.entryId === r.id).map(({ entryId: _e, ...o }) => o),
    media: media.get(r.id) ?? [],
  }));
}

/** گاردِ تصویرهای کتابخانه — از `canViewFile`. */
export async function canSeeLibraryMedia(actor: Actor, entryId: number): Promise<boolean> {
  if (canUseLibrary(actor)) return true;
  if (!actor.roles.includes('client')) return false;
  const rows = await db.select({ projectId: libraryProjects.projectId }).from(libraryProjects)
    .innerJoin(libraryEntries, eq(libraryEntries.id, libraryProjects.entryId))
    .innerJoin(projectClients, and(
      eq(projectClients.projectId, libraryProjects.projectId),
      eq(projectClients.userId, actor.id),
      eq(projectClients.accessBlocked, false),
    ))
    .where(and(
      eq(libraryEntries.id, entryId),
      eq(libraryEntries.kind, 'guide'),
      eq(libraryEntries.clientVisible, true),
      ne(libraryEntries.status, 'draft'),
      isNull(libraryEntries.archivedAt),
    ))
    .limit(1);
  return rows.length > 0;
}
