import { alias } from 'drizzle-orm/pg-core';
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { attachments, auditLog, reviewRoles, reviews, tags, tasks, users, type ReviewSource } from '@/db/schema';
import { tagName } from '@/db/tag-name';
import { currentLocale } from '@/i18n/server';
import type { Actor } from '@/domain/access/permissions';
import { filterVisibleFor, ForbiddenError } from '@/domain/access/guard';
import { nameForViewer } from '@/domain/access/viewer-names';
import { normalizeExternalUrl } from '@/domain/files/upload';
import {
  canSeeReview, detectSource, normalizeTiming, reviewProgress, seesClientHidden, withoutClientHidden,
  type ReviewViewer,
} from '@/domain/projects/reviews';
import { discardUploads, removeFiles, storeUploads, type UploadBlob } from '@/server/files/service';
import { notify } from '@/server/notifications/service';
import { assertNotFrozen, canInteractWithProject, canManageProject, isProjectFrozen, projectRelation } from './authority';
import * as repo from './repository';
import { createTask, getProject, NotFoundError, viewerContext, type TaskInput } from './service';
import { canManageSection } from '@/domain/access/permissions';

/**
 * بازبینی‌های پروژه (۱.۱۱۶.۰).
 *
 * ⚠️ همهٔ گاردها اینجاست (R-ARCH-01): دیدن با `canSeeReview` (مخاطب‌نقش و
 * «برای کارفرما»)، ساختن و ویرایش فقط مدیرِ همین پروژه، و هر موردِ بازبینی
 * یک تسکِ معمولی است که از `createTask` می‌گذرد — همان اعلان، همان قفلِ
 * انجماد و همان گاردِ نقش.
 */

export interface ReviewInput {
  title: string;
  videoUrl: string;
  source: ReviewSource | null;
  notes: string;
  roleTagIds: number[];
  clientVisible: boolean;
}

export interface ReviewItemInput extends TaskInput {
  start: number | null;
  end: number | null;
  area: string;
  /** فقط وقتی بازبینی برای کارفرما نمایش داده می‌شود معنا دارد. */
  clientHidden: boolean;
}

/* ------------------------------------------------------------------ *
 * بیننده
 * ------------------------------------------------------------------ */

/** رابطهٔ بیننده با پروژه — ⚠️ رابطهٔ قطع‌دسترسی رابطه حساب نمی‌شود. */
export async function reviewViewer(actor: Actor, projectId: number): Promise<ReviewViewer> {
  const [manages, relation] = await Promise.all([
    canManageProject(actor, projectId),
    projectRelation(actor.id, projectId),
  ]);
  const open = !relation.accessBlocked;
  return {
    userId: actor.id,
    manages,
    isMember: relation.isMember && open,
    isClient: relation.isClient && open,
    roleTagIds: open ? relation.roleTagIds : [],
  };
}

async function rolesOf(reviewIds: number[]) {
  if (reviewIds.length === 0) return new Map<number, Array<{ id: number; name: string; color: string | null }>>();
  const rows = await db
    .select({ reviewId: reviewRoles.reviewId, id: tags.id, name: tagName(await currentLocale()), color: tags.color })
    .from(reviewRoles)
    .innerJoin(tags, eq(tags.id, reviewRoles.roleTagId))
    .where(inArray(reviewRoles.reviewId, reviewIds))
    .orderBy(asc(tags.sortOrder), asc(tags.id));
  const map = new Map<number, Array<{ id: number; name: string; color: string | null }>>();
  for (const r of rows) map.set(r.reviewId, [...(map.get(r.reviewId) ?? []), { id: r.id, name: r.name, color: r.color }]);
  return map;
}

/**
 * یک بازبینی، به شرطِ دیدن. «یافت نشد» — نه «ممنوع» — تا وجودش لو نرود.
 */
async function loadVisibleReview(actor: Actor, reviewId: number) {
  const [review] = await db.select().from(reviews).where(eq(reviews.id, reviewId));
  if (!review) throw new NotFoundError();
  await getProject(actor, review.projectId);
  const viewer = await reviewViewer(actor, review.projectId);
  const roles = (await rolesOf([review.id])).get(review.id) ?? [];
  if (!canSeeReview(viewer, { createdBy: review.createdBy, roleTagIds: roles.map((r) => r.id), clientVisible: review.clientVisible })) {
    throw new NotFoundError();
  }
  return { review, roles, viewer };
}

/** گاردِ فایلِ بازبینی — `canViewFile` از راهِ پیوستِ `review_id` به اینجا می‌رسد. */
export async function canSeeReviewById(actor: Actor, reviewId: number): Promise<boolean> {
  try {
    await loadVisibleReview(actor, reviewId);
    return true;
  } catch {
    return false;
  }
}

/** مدیریتِ بازبینی: مدیرِ همین پروژه، یا سازندهٔ خودش. */
async function assertCanManageReview(actor: Actor, review: { projectId: number; createdBy: number }) {
  if (review.createdBy === actor.id) return;
  if (!await canManageProject(actor, review.projectId)) throw new ForbiddenError('projects.manage');
}

async function audit(actor: Actor, action: string, projectId: number, before: unknown, after: unknown) {
  await db.insert(auditLog).values({
    actorType: 'user', actorId: actor.id, action, objectType: 'project', objectId: projectId,
    before: before ?? null, after: after ?? null,
  });
}

/* ------------------------------------------------------------------ *
 * خواندن
 * ------------------------------------------------------------------ */

/** موردهای دیدنیِ چند بازبینی — تسکِ خصوصی و «پنهان از کارفرما» فیلتر می‌شوند. */
async function itemsOf(actor: Actor, viewer: ReviewViewer, reviewIds: number[]) {
  if (reviewIds.length === 0) return [];
  const status = alias(tags, 'review_item_status');
  const priority = alias(tags, 'review_item_priority');
  const assignee = alias(users, 'review_item_assignee');
  const locale = await currentLocale();
  const rows = await db
    .select({
      id: tasks.id,
      projectId: tasks.projectId,
      reviewId: tasks.reviewId,
      title: tasks.title,
      description: tasks.description,
      start: tasks.reviewStart,
      end: tasks.reviewEnd,
      area: tasks.area,
      isPrivate: tasks.isPrivate,
      clientHidden: tasks.clientHidden,
      createdBy: tasks.createdBy,
      assignedTo: tasks.assignedTo,
      assigneeName: assignee.name,
      statusTagId: tasks.statusTagId,
      statusName: tagName(locale, status),
      statusColor: status.color,
      statusGroup: status.statusGroup,
      statusClosed: status.isClosed,
      priorityName: tagName(locale, priority),
      priorityColor: priority.color,
      notesCount: sql<number>`(select count(*) from comments c where c.task_id = ${tasks.id})::int`,
      mediaCount: sql<number>`(select count(*) from attachments a where a.task_id = ${tasks.id})::int`,
    })
    .from(tasks)
    .leftJoin(status, eq(status.id, tasks.statusTagId))
    .leftJoin(priority, eq(priority.id, tasks.priorityTagId))
    .leftJoin(assignee, eq(assignee.id, tasks.assignedTo))
    .where(and(inArray(tasks.reviewId, reviewIds), isNull(tasks.deletedAt)))
    // ترتیبِ ویدئو: موردِ زمان‌دار به ترتیبِ زمان، بی‌زمان‌ها در آخر به ترتیبِ ثبت.
    .orderBy(sql`${tasks.reviewStart} asc nulls last`, asc(tasks.id));
  return withoutClientHidden(filterVisibleFor(actor, rows, viewer.manages), viewer)
    .map((r) => ({ ...r, done: r.statusClosed === true || r.statusGroup === 'complete' }));
}

/** فهرستِ بازبینی‌های دیدنیِ این بیننده — تبِ «بازبینی‌ها». */
export async function listReviews(actor: Actor, projectId: number) {
  await getProject(actor, projectId);
  const viewer = await reviewViewer(actor, projectId);
  const rows = await db
    .select({
      id: reviews.id, title: reviews.title, source: reviews.source, videoUrl: reviews.videoUrl,
      notes: reviews.notes, clientVisible: reviews.clientVisible, createdBy: reviews.createdBy,
      createdByName: users.name, createdAt: reviews.createdAt,
    })
    .from(reviews)
    .innerJoin(users, eq(users.id, reviews.createdBy))
    .where(eq(reviews.projectId, projectId))
    .orderBy(desc(reviews.id));
  const roles = await rolesOf(rows.map((r) => r.id));
  const visible = rows.filter((r) => canSeeReview(viewer, {
    createdBy: r.createdBy, roleTagIds: (roles.get(r.id) ?? []).map((x) => x.id), clientVisible: r.clientVisible,
  }));
  const ids = visible.map((r) => r.id);
  const [items, media] = await Promise.all([itemsOf(actor, viewer, ids), repo.mediaFor({ reviewIds: ids })]);
  const ctx = await viewerContext(actor, projectId, viewer.manages, await repo.listMembers(projectId));
  return visible.map((r) => ({
    ...r,
    createdByName: nameForViewer(r.createdBy, r.createdByName, ctx),
    roles: roles.get(r.id) ?? [],
    progress: reviewProgress(items.filter((i) => i.reviewId === r.id)),
    mediaCount: media.filter((m) => m.reviewId === r.id).length,
  }));
}

/** جزئیاتِ یک بازبینی — پخش‌کننده، یادداشت، پیوست‌ها و موردها. */
export async function getReview(actor: Actor, reviewId: number) {
  const { review, roles, viewer } = await loadVisibleReview(actor, reviewId);
  const [items, media, members, frozenForViewer, canInteract] = await Promise.all([
    itemsOf(actor, viewer, [reviewId]),
    repo.mediaFor({ reviewIds: [reviewId] }),
    repo.listMembers(review.projectId),
    isProjectFrozen(review.projectId).then((f) => f && !canManageSection(actor, 'projects')),
    canInteractWithProject(actor, review.projectId),
  ]);
  const ctx = await viewerContext(actor, review.projectId, viewer.manages, members);
  const mask = (id: number | null, name: string | null) => (id === null || name === null ? name : nameForViewer(id, name, ctx));
  const itemRoles = await repo.taskRolesFor(items.map((i) => i.id));
  const [creator] = await db.select({ name: users.name }).from(users).where(eq(users.id, review.createdBy));
  const manager = canManageSection(actor, 'projects');
  const canManage = !frozenForViewer && (viewer.manages || review.createdBy === actor.id);

  return {
    review: {
      id: review.id,
      projectId: review.projectId,
      title: review.title,
      source: review.source,
      videoUrl: review.videoUrl,
      notes: review.notes,
      clientVisible: review.clientVisible,
      createdAt: review.createdAt,
      createdByName: mask(review.createdBy, creator?.name ?? null),
      roles,
    },
    media: media.map((m) => ({
      id: m.id, fileId: m.fileId, kind: m.kind, mime: m.mime, size: m.size, name: m.name,
      canDelete: !frozenForViewer && (m.userId === actor.id || manager),
    })),
    items: items.map((i) => ({
      id: i.id,
      title: i.title,
      description: i.description,
      start: i.start,
      end: i.end,
      area: i.area,
      isPrivate: i.isPrivate,
      clientHidden: i.clientHidden,
      assigneeName: mask(i.assignedTo, i.assigneeName),
      statusTagId: i.statusTagId,
      statusName: i.statusName,
      statusColor: i.statusColor,
      statusGroup: i.statusGroup,
      priorityName: i.priorityName,
      priorityColor: i.priorityColor,
      notesCount: i.notesCount,
      mediaCount: i.mediaCount,
      done: i.done,
      roles: itemRoles.filter((r) => r.taskId === i.id).map((r) => r.roleName ?? ''),
    })),
    progress: reviewProgress(items),
    canManage,
    /** تغییرِ وضعیتِ مورد — هر شرکت‌کننده، مثلِ تبِ تسک‌ها. */
    canInteract: canInteract && !frozenForViewer,
    /** «پنهان از کارفرما» فقط برای کسی معنا دارد که تسکِ پنهان را می‌بیند. */
    seesClientHidden: seesClientHidden(viewer),
  };
}

/* ------------------------------------------------------------------ *
 * نوشتن
 * ------------------------------------------------------------------ */

async function cleanInput(input: ReviewInput, hasUploadedVideo: boolean) {
  const title = input.title.trim().slice(0, 200);
  if (title === '') throw new ForbiddenError('review.title');
  const raw = input.videoUrl.trim();
  const videoUrl = raw === '' ? null : normalizeExternalUrl(raw);
  if (raw !== '' && !videoUrl) throw new ForbiddenError('link.invalid');
  // ⚠️ فقط نقشِ عضو — شناسهٔ تگِ دلخواه (مثلاً یک برچسبِ مالی) مخاطب نمی‌شود.
  const roleTagIds = [...new Set(input.roleTagIds)];
  if (roleTagIds.length > 0) {
    const ok = await db.select({ id: tags.id }).from(tags)
      .where(and(inArray(tags.id, roleTagIds), eq(tags.type, 'member_role')));
    if (ok.length !== roleTagIds.length) throw new ForbiddenError('review.roles');
  }
  return {
    title,
    videoUrl,
    notes: input.notes.trim().slice(0, 10000),
    roleTagIds,
    clientVisible: input.clientVisible,
    source: detectSource(input.source, videoUrl, hasUploadedVideo),
  };
}

/** گیرندگانِ اعلانِ «بازبینیِ تازه»: مخاطبِ نقشی (یا کلِ تیم) و کارفرما اگر می‌بیند. */
async function audienceOf(projectId: number, roleTagIds: number[], clientVisible: boolean, exclude: number) {
  const members = await repo.listMembers(projectId);
  const team = members
    .filter((m) => !m.accessBlocked && (roleTagIds.length === 0 || (m.roleTagId !== null && roleTagIds.includes(m.roleTagId))))
    .map((m) => m.userId);
  const clients = clientVisible ? await repo.listClientIds(projectId) : [];
  return [...new Set([...team, ...clients])].filter((id) => id !== exclude);
}

export async function createReview(actor: Actor, projectId: number, input: ReviewInput, media: readonly UploadBlob[] = []) {
  await getProject(actor, projectId);
  if (!await canManageProject(actor, projectId)) throw new ForbiddenError('projects.manage');
  await assertNotFrozen(projectId, actor);
  const clean = await cleanInput(input, media.some((m) => m.mime.startsWith('video/')));

  const uploads = await storeUploads(actor, media);
  const reviewId = await db.transaction(async (tx) => {
    const [row] = await tx.insert(reviews).values({
      projectId, title: clean.title, source: clean.source, videoUrl: clean.videoUrl,
      notes: clean.notes, clientVisible: clean.clientVisible, createdBy: actor.id,
    }).returning({ id: reviews.id });
    if (clean.roleTagIds.length > 0) {
      await tx.insert(reviewRoles).values(clean.roleTagIds.map((roleTagId) => ({ reviewId: row!.id, roleTagId })));
    }
    if (uploads.length > 0) {
      await tx.insert(attachments).values(uploads.map((u) => ({
        projectId, reviewId: row!.id, fileId: u.fileId, kind: u.kind, userId: actor.id,
      })));
    }
    return row!.id;
  }).catch(async (error: unknown) => {
    await discardUploads(uploads);
    throw error;
  });

  await audit(actor, 'review.create', projectId, null, { reviewId, title: clean.title, roleTagIds: clean.roleTagIds, clientVisible: clean.clientVisible });

  const project = await repo.getProject(projectId);
  await notify(await audienceOf(projectId, clean.roleTagIds, clean.clientVisible, actor.id), {
    type: 'review.posted',
    title: 'بازبینیِ تازه در پروژه',
    body: `«${project?.title ?? ''}» — ${clean.title}`,
    url: `/projects/${projectId}?tab=reviews&review=${reviewId}`,
  });
  return reviewId;
}

export async function updateReview(actor: Actor, reviewId: number, input: ReviewInput, media: readonly UploadBlob[] = []) {
  const { review, roles } = await loadVisibleReview(actor, reviewId);
  await assertCanManageReview(actor, review);
  await assertNotFrozen(review.projectId, actor);
  const clean = await cleanInput(input, media.some((m) => m.mime.startsWith('video/')));
  // منبعِ بارگذاری‌شده با ویدئوی قبلی هم بارگذاری‌شده می‌ماند.
  const hadUpload = (await repo.mediaFor({ reviewIds: [reviewId] })).some((m) => m.kind === 'video');
  const source = detectSource(input.source, clean.videoUrl, hadUpload || media.some((m) => m.mime.startsWith('video/')));

  const uploads = await storeUploads(actor, media);
  await db.transaction(async (tx) => {
    await tx.update(reviews).set({
      title: clean.title, source, videoUrl: clean.videoUrl, notes: clean.notes,
      clientVisible: clean.clientVisible, updatedAt: new Date(),
    }).where(eq(reviews.id, reviewId));
    await tx.delete(reviewRoles).where(eq(reviewRoles.reviewId, reviewId));
    if (clean.roleTagIds.length > 0) {
      await tx.insert(reviewRoles).values(clean.roleTagIds.map((roleTagId) => ({ reviewId, roleTagId })));
    }
    /**
     * ⚠️ «برای کارفرما» که عوض شد، موردها هم با آن عوض می‌شوند: بازبینیِ
     * پنهان نباید موردِ آشکار داشته باشد، و بازبینی‌ای که آشکار شد موردهایش
     * را هم نشان می‌دهد. پنهان‌کردنِ تک‌مورد پس از آن از خودِ مورد است.
     */
    if (clean.clientVisible !== review.clientVisible) {
      await tx.update(tasks).set({ clientHidden: !clean.clientVisible, updatedAt: new Date() })
        .where(eq(tasks.reviewId, reviewId));
    }
    if (uploads.length > 0) {
      await tx.insert(attachments).values(uploads.map((u) => ({
        projectId: review.projectId, reviewId, fileId: u.fileId, kind: u.kind, userId: actor.id,
      })));
    }
  }).catch(async (error: unknown) => {
    await discardUploads(uploads);
    throw error;
  });

  await audit(actor, 'review.update', review.projectId,
    { reviewId, title: review.title, roleTagIds: roles.map((r) => r.id), clientVisible: review.clientVisible },
    { reviewId, title: clean.title, roleTagIds: clean.roleTagIds, clientVisible: clean.clientVisible });

  // مخاطبِ تازه (نقشِ اضافه‌شده یا کارفرمایی که تازه می‌بیند) خبردار می‌شود.
  const before = new Set(await audienceOf(review.projectId, roles.map((r) => r.id), review.clientVisible, actor.id));
  const fresh = (await audienceOf(review.projectId, clean.roleTagIds, clean.clientVisible, actor.id)).filter((id) => !before.has(id));
  if (fresh.length > 0) {
    const project = await repo.getProject(review.projectId);
    await notify(fresh, {
      type: 'review.posted',
      title: 'بازبینیِ تازه در پروژه',
      body: `«${project?.title ?? ''}» — ${clean.title}`,
      url: `/projects/${review.projectId}?tab=reviews&review=${reviewId}`,
    });
  }
  return review.projectId;
}

/**
 * حذفِ بازبینی. ⚠️ موردها (تسک‌ها) می‌مانند — کارِ ثبت‌شده است و شاید نیمه‌کاره؛
 * فقط پیوندشان می‌رود و «پنهان از کارفرما» سرِ جایش می‌ماند. پیوست‌ها می‌روند.
 */
export async function deleteReview(actor: Actor, reviewId: number) {
  const { review } = await loadVisibleReview(actor, reviewId);
  await assertCanManageReview(actor, review);
  await assertNotFrozen(review.projectId, actor);
  const fileIds = (await repo.mediaFor({ reviewIds: [reviewId] })).map((m) => m.fileId);
  await db.delete(reviews).where(eq(reviews.id, reviewId));
  await removeFiles(fileIds);
  await audit(actor, 'review.delete', review.projectId, { reviewId, title: review.title }, null);
  return review.projectId;
}

/**
 * افزودنِ مورد ← تسک. نقش‌ها اگر خالی بمانند از بازبینی به ارث می‌رسند، و
 * بازبینیِ پنهان از کارفرما موردِ پنهان می‌سازد — بی‌استثنا.
 */
export async function addReviewItem(actor: Actor, reviewId: number, input: ReviewItemInput, media: readonly UploadBlob[] = []) {
  const { review, roles } = await loadVisibleReview(actor, reviewId);
  await assertCanManageReview(actor, review);
  const timing = normalizeTiming(input.start, input.end);
  const inherit = input.assignedTo === null && (input.roleTagIds ?? []).length === 0;
  return {
    projectId: review.projectId,
    taskId: await createTask(actor, review.projectId, {
      ...input,
      roleTagIds: inherit ? roles.map((r) => r.id) : input.roleTagIds,
    }, {
      media,
      review: {
        id: reviewId,
        start: timing.start,
        end: timing.end,
        area: input.area.trim().slice(0, 120),
        clientHidden: !review.clientVisible || input.clientHidden,
      },
    }),
  };
}
