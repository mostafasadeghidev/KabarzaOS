import { randomUUID } from 'node:crypto';
import { assertNotFrozen, canManageProject, projectRelation } from '@/server/projects/authority';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  attachments, company, files, ledger, projectClients, projectMembers, projectPayments, projects, userAvatars, users,
} from '@/db/schema';
import { can, canManageSection, type Actor } from '@/domain/access/permissions';
import { ForbiddenError, visibleScopes } from '@/domain/access/guard';
import {
  assertAcceptable, disposition, FileRejected, kindOf, normalizeExternalUrl,
  safeDownloadName, storageKey, type Purpose,
} from '@/domain/files/upload';
import { deleteObject, ensureBucket, getObject, putObject } from './storage';
import { canPreview, makePreview, PREVIEW_MIME } from './preview';
import * as projectRepo from '@/server/projects/repository';

/**
 * سرویسِ فایل.
 * ⚠️ همهٔ گاردها اینجا هستند، نه در مسیر یا صفحه (R-ARCH-01).
 */

export class FileNotFoundError extends Error {
  constructor() {
    super('file_not_found');
    this.name = 'FileNotFoundError';
  }
}

/* ------------------------------------------------------------------ *
 * ذخیره
 * ------------------------------------------------------------------ */

/**
 * ⚠️ R-FILE-02 — ترتیب حیاتی است: **اول** شیء در S3، **بعد** ردیفِ دیتابیس.
 * اگر نوشتنِ ردیف شکست بخورد، شیء پاک می‌شود. هیچ‌وقت نه ردیفِ بدونِ فایل
 * می‌ماند، نه فایلِ بی‌صاحب.
 */
async function storeFile(
  actor: Actor,
  blob: { name: string; mime: string; bytes: Uint8Array },
  purpose: Purpose,
): Promise<number> {
  // نوعِ اعلام‌شده و بایت‌های واقعی هر دو بررسی می‌شوند (R-FILE-05).
  const mime = blob.mime.toLowerCase().split(';')[0]!.trim();
  assertAcceptable(
    { name: blob.name, mime, size: blob.bytes.byteLength, head: blob.bytes.subarray(0, 32) },
    purpose,
  );

  await ensureBucket();
  const key = storageKey(purpose, mime, randomUUID().replace(/-/g, ''));
  await putObject(key, blob.bytes, mime);

  /**
   * نسخهٔ کوچکِ ۴۰۰ پیکسلی برای فهرست‌ها و آواتارها (R-FILE-16).
   * ⚠️ نساختنش خطا نیست — فایل بدونِ پیش‌نمایش هم کاملاً سالم است و
   * نمایش‌دهنده به اصلِ فایل برمی‌گردد.
   */
  let previewKey: string | null = null;
  if (canPreview(mime)) {
    const preview = await makePreview(blob.bytes, mime);
    if (preview) {
      previewKey = `${key}.thumb.webp`;
      try {
        await putObject(previewKey, preview, PREVIEW_MIME);
      } catch {
        previewKey = null;
      }
    }
  }

  try {
    const rows = await db.insert(files).values({
      storageKey: key,
      previewKey,
      mime,
      size: blob.bytes.byteLength,
      originalName: blob.name.slice(0, 200),
      purpose,
      uploadedBy: actor.id,
    }).returning({ id: files.id });
    return rows[0]!.id;
  } catch (error) {
    // ردیف ثبت نشد ← هیچ شیئی نباید بماند، نه اصل و نه پیش‌نمایش.
    await deleteObject(key).catch(() => {});
    if (previewKey) await deleteObject(previewKey).catch(() => {});
    throw error;
  }
}

/* ------------------------------------------------------------------ *
 * خواندنِ گیت‌شده
 * ------------------------------------------------------------------ */

export interface ServedFile {
  bytes: Uint8Array;
  mime: string;
  downloadName: string;
  disposition: 'inline' | 'attachment';
}

/**
 * ⚠️ R-FILE-03 — «کاربرِ واردشده» گارد نیست. این تابع می‌گوید *کدام* کاربر
 * *کدام* فایل را می‌بیند — پورتِ مستقیمِ `can_view_attachment()`.
 */
export async function canViewFile(actor: Actor, fileId: number): Promise<boolean> {
  // مالک و کاربرانِ مالی همیشه.
  if (actor.roles.includes('owner') || can(actor, 'finance.view')) return true;

  /**
   * لوگوی شرکت — برای **هر کاربرِ واردشده**.
   *
   * ⚠️ این شاخه نبود و دو جا را می‌شکست: فاکتورِ پروژه (که کارفرما حق
   * دیدنش را دارد) لوگو را با ۴۰۳ خالی نشان می‌داد، و سایدبار هم نمی‌توانست
   * لوگو را برای عضو و کارفرما بیاورد. لوگو نشانِ عمومیِ شرکت است؛ همان
   * کسی که وارد شده، روی سربرگِ فاکتورش هم می‌بیندش.
   */
  const logo = await db.select({ fileId: company.logoFileId })
    .from(company).where(eq(company.id, 1));
  if (logo[0]?.fileId === fileId) return true;

  // بارگذارندهٔ خودِ فایل.
  const own = await db.select({ id: files.id }).from(files)
    .where(and(eq(files.id, fileId), eq(files.uploadedBy, actor.id)));
  if (own.length > 0) return true;

  // پیوستِ پروژه ← هر کس به آن پروژه دسترسی دارد.
  const attached = await db.select({ projectId: attachments.projectId })
    .from(attachments).where(eq(attachments.fileId, fileId));
  for (const row of attached) {
    if (row.projectId && await canAccessProject(actor, row.projectId)) return true;
  }

  // تصویرِ شاخصِ پروژه ← همان قاعده.
  const cover = await db.select({ id: projects.id }).from(projects)
    .where(eq(projects.thumbnailFileId, fileId));
  for (const row of cover) {
    if (await canAccessProject(actor, row.id)) return true;
  }

  // آواتار ← هر کسی که اعضا را می‌بیند، و خودِ صاحبِ آواتار.
  const avatar = await db.select({ userId: userAvatars.userId })
    .from(userAvatars).where(eq(userAvatars.fileId, fileId));
  if (avatar.length > 0) {
    if (avatar.some((a) => a.userId === actor.id)) return true;
    if (can(actor, 'members.view')) return true;
  }

  // رسیدِ حسابداری ← نام‌بردهٔ روی تراکنش، یا عضوی که پرداخت به او بوده،
  // یا کارفرمای پروژه‌ای که رسید به آن مربوط است.
  return receiptVisible(actor, fileId);
}

async function receiptVisible(actor: Actor, fileId: number): Promise<boolean> {
  const rows = await db
    .select({
      id: ledger.id,
      payerUserId: ledger.payerUserId,
      receiverUserId: ledger.receiverUserId,
    })
    .from(ledger)
    .where(sql`${fileId} = any(${ledger.receiptIds})`);

  if (rows.length === 0) return false;

  for (const row of rows) {
    if (row.payerUserId === actor.id || row.receiverUserId === actor.id) return true;
  }

  const payments = await db
    .select({
      direction: projectPayments.direction,
      userId: projectPayments.userId,
      projectId: projectPayments.projectId,
    })
    .from(projectPayments)
    .where(inArray(projectPayments.ledgerId, rows.map((r) => r.id)));

  for (const pay of payments) {
    if (pay.direction === 'member_payout' && pay.userId === actor.id) return true;
    if ((pay.direction === 'incoming' || pay.direction === 'project_expense') && pay.projectId) {
      const isClient = await db.select({ id: projectClients.id }).from(projectClients)
        // ⚠️ کارفرمای قطع‌دسترسی (access_blocked) رسید را هم نمی‌بیند — همان قاعدهٔ صفحهٔ پروژه.
        .where(and(eq(projectClients.projectId, pay.projectId), eq(projectClients.userId, actor.id), eq(projectClients.accessBlocked, false)));
      if (isClient.length > 0) return true;
    }
  }
  return false;
}

/**
 * آیا این کاربر به این پروژه دسترسی دارد؟
 *
 * ⚠️ همان تصمیمِ `canViewProject` — نه یک نسخهٔ دوباره‌نویسی‌شده. نسخهٔ
 * قبلیِ این تابع عضویت را مستقیم می‌خواند و دو چیز را نمی‌دید: قطعِ دسترسی
 * (`access_blocked`) و دامنهٔ مدیرِ دفتر/مدیرِ پروژهٔ تگ‌دار. نتیجه: عضوی که
 * دسترسی‌اش قطع شده بود هنوز هر فایلِ پروژه را دانلود می‌کرد، و مدیرِ دفتر
 * روی فایل‌های دفترِ خودش ۴۰۳ می‌گرفت.
 *
 * ⚠️ برای غیرعضو، معیار **مدیریت** است نه دیدن: مجوزِ سراسریِ `projects.view`
 * کارتِ پروژه را باز می‌کند، فایل‌هایش را نه (R-FILE-03 — «گیت یعنی این
 * فایل، این کاربر»). `canManageProject` مدیرِ سراسری، مدیرِ دفترِ مالک و
 * مدیرِ پروژهٔ تگ‌دار را پوشش می‌دهد.
 *
 * ⚠️ scope ِ خصوصی فقط برای بینندهٔ **مجوزی** سنجیده می‌شود — عضو و کارفرمای
 * امضاشده پروژهٔ خصوصی‌شان را می‌بینند.
 */
async function canAccessProject(actor: Actor, projectId: number): Promise<boolean> {
  const rows = await db.select({ id: projects.id, scope: projects.scope })
    .from(projects)
    .where(and(eq(projects.id, projectId), isNull(projects.deletedAt)));
  const project = rows[0];
  if (!project) return false;

  const relation = await projectRelation(actor.id, projectId);
  if (relation.isMember || relation.isClient) return !relation.accessBlocked;

  if (!visibleScopes(actor).includes(project.scope)) return false;
  return canManageProject(actor, projectId);
}

/** فایل را برای سرو کردن آماده می‌کند — یا ۴۰۳ می‌دهد. */
export async function serveFile(
  actor: Actor,
  fileId: number,
  forceDownload = false,
  /**
   * نسخهٔ کوچک خواسته شده؟ اگر پیش‌نمایشی نباشد، بی‌سروصدا اصلِ فایل
   * برگردانده می‌شود — نه خطا؛ نبودنِ پیش‌نمایش نقص نیست.
   */
  wantPreview = false,
): Promise<ServedFile> {
  const rows = await db.select().from(files).where(eq(files.id, fileId));
  const file = rows[0];
  if (!file) throw new FileNotFoundError();

  if (!await canViewFile(actor, fileId)) throw new ForbiddenError('file.forbidden');

  /**
   * ⚠️ دانلودِ اجباری همیشه **اصلِ** فایل را می‌دهد: کاربری که «دانلود» را
   * می‌زند نسخهٔ فشرده‌شده نمی‌خواهد.
   */
  const usePreview = wantPreview && !forceDownload && file.previewKey !== null;

  return {
    bytes: await getObject(usePreview ? file.previewKey! : file.storageKey),
    mime: usePreview ? PREVIEW_MIME : file.mime,
    downloadName: safeDownloadName(file.originalName, file.mime),
    // ⚠️ R-FILE-04 — SVG/HTML هرگز inline باز نمی‌شوند.
    disposition: disposition(file.mime, forceDownload),
  };
}

/* ------------------------------------------------------------------ *
 * پیوستِ پروژه
 * ------------------------------------------------------------------ */

async function assertProjectAccess(actor: Actor, projectId: number) {
  if (!await canAccessProject(actor, projectId)) throw new ForbiddenError('project.forbidden');
}

export async function listAttachments(actor: Actor, projectId: number) {
  await assertProjectAccess(actor, projectId);
  // ⚠️ همان شکل‌دهندهٔ صفحهٔ پروژه — دو مسیرِ موازی نمی‌سازیم.
  return projectRepo.listAttachments(projectId);
}

export async function addAttachment(
  actor: Actor,
  projectId: number,
  blob: { name: string; mime: string; bytes: Uint8Array },
  label: string,
) {
  await assertProjectAccess(actor, projectId);
  // ⚠️ پروژهٔ منجمد فایلِ تازه نمی‌گیرد (`handle_add_attachment`).
  await assertNotFrozen(projectId, actor);

  const fileId = await storeFile(actor, blob, 'attachment');
  await db.insert(attachments).values({
    projectId,
    fileId,
    userId: actor.id,
    kind: kindOf(blob.mime),
    label: label.trim().slice(0, 200),
  });
  return fileId;
}

/** ⚠️ R-FILE-08 — هیچ فایلی گرفته نمی‌شود؛ فقط نشانی. پس SSRF ندارد. */
export async function addLink(actor: Actor, projectId: number, rawUrl: string, label: string) {
  // ⚠️ پروژهٔ منجمد پیوستِ تازه نمی‌گیرد (`handle_add_link`).
  await assertNotFrozen(projectId, actor);
  await assertProjectAccess(actor, projectId);

  const url = normalizeExternalUrl(rawUrl);
  if (!url) throw new ForbiddenError('link.invalid');

  await db.insert(attachments).values({
    projectId,
    externalUrl: url,
    userId: actor.id,
    kind: 'link',
    label: label.trim().slice(0, 200),
  });
}

/**
 * ⚠️ R-FILE-09 — بارگذارنده یا مدیر. و R-FILE-10 — ردیف که رفت، فایل هم برود؛
 * ولی لینکِ بیرونی فایلی ندارد.
 */
export async function deleteAttachment(actor: Actor, attachmentId: number) {
  const rows = await db.select().from(attachments).where(eq(attachments.id, attachmentId));
  const row = rows[0];
  if (!row) throw new FileNotFoundError();

  if (row.projectId) await assertProjectAccess(actor, row.projectId);
  // ⚠️ پروژهٔ منجمد پیوستش هم حذف نمی‌شود — همان قفلی که افزودن دارد (`block_if_frozen`).
  if (row.projectId) await assertNotFrozen(row.projectId, actor);
  if (row.userId !== actor.id && !canManageSection(actor, 'projects')) {
    throw new ForbiddenError('attachment.not_yours');
  }

  await db.delete(attachments).where(eq(attachments.id, attachmentId));
  if (row.fileId) await removeFile(row.fileId);
}

/* ------------------------------------------------------------------ *
 * تصویرِ شاخص و آواتار
 * ------------------------------------------------------------------ */

export async function setProjectThumbnail(
  actor: Actor,
  projectId: number,
  blob: { name: string; mime: string; bytes: Uint8Array },
) {
  if (!canManageSection(actor, 'projects')) throw new ForbiddenError('projects.manage');
  await assertProjectAccess(actor, projectId);

  const previous = await db.select({ fileId: projects.thumbnailFileId })
    .from(projects).where(eq(projects.id, projectId));

  const fileId = await storeFile(actor, blob, 'avatar');
  await db.update(projects).set({ thumbnailFileId: fileId, updatedAt: new Date() })
    .where(eq(projects.id, projectId));

  // تصویرِ قبلی دیگر به کسی وصل نیست.
  const old = previous[0]?.fileId;
  if (old) await removeFile(old);
  return fileId;
}

export async function setAvatar(
  actor: Actor,
  userId: number,
  blob: { name: string; mime: string; bytes: Uint8Array },
) {
  // آدم می‌تواند آواتارِ خودش را عوض کند؛ آواتارِ دیگری فقط با مدیریتِ اعضا.
  if (userId !== actor.id && !canManageSection(actor, 'members')) {
    throw new ForbiddenError('members.manage');
  }

  const previous = await db.select({ fileId: userAvatars.fileId })
    .from(userAvatars).where(eq(userAvatars.userId, userId));

  const fileId = await storeFile(actor, blob, 'avatar');
  await db.insert(userAvatars).values({ userId, fileId })
    .onConflictDoUpdate({
      target: userAvatars.userId,
      set: { fileId, updatedAt: new Date() },
    });

  const old = previous[0]?.fileId;
  if (old) await removeFile(old);
  return fileId;
}

/**
 * حذفِ تصویرِ پروفایل و برگشت به تک‌نگار — پورتِ `kteam_avatar_remove` →
 * `set_avatar_id(0)`. پیش از این کاربر فقط می‌توانست عکس را **عوض** کند.
 */
export async function removeAvatar(actor: Actor, userId: number): Promise<void> {
  if (userId !== actor.id && !canManageSection(actor, 'members')) {
    throw new ForbiddenError('members.manage');
  }
  const previous = await db.select({ fileId: userAvatars.fileId })
    .from(userAvatars).where(eq(userAvatars.userId, userId));
  await db.delete(userAvatars).where(eq(userAvatars.userId, userId));
  const old = previous[0]?.fileId;
  if (old) await removeFile(old);
}

/** شناسهٔ آواتارِ چند کاربر — یک کوئری، نه یکی به‌ازای هر نفر (R-PERF-01). */
export async function avatarsFor(userIds: number[]): Promise<Map<number, number>> {
  if (userIds.length === 0) return new Map();
  const rows = await db.select({ userId: userAvatars.userId, fileId: userAvatars.fileId })
    .from(userAvatars).where(inArray(userAvatars.userId, userIds));
  return new Map(rows.map((r) => [r.userId, r.fileId]));
}

/* ------------------------------------------------------------------ *
 * حذفِ فایل
 * ------------------------------------------------------------------ */

/**
 * حذفِ ردیف و شیء.
 * ⚠️ اول شیء پاک می‌شود بعد ردیف؛ اگر برعکس بود و ردیف می‌رفت ولی شیء نه،
 * دیگر هیچ‌وقت نمی‌فهمیدیم آن شیء مالِ چه بوده و برای همیشه می‌ماند.
 */
async function removeFile(fileId: number) {
  const rows = await db.select({ storageKey: files.storageKey, previewKey: files.previewKey })
    .from(files).where(eq(files.id, fileId));
  const row = rows[0];
  if (!row?.storageKey) return;

  await deleteObject(row.storageKey).catch(() => {});
  // ⚠️ پیش‌نمایش هم باید برود، وگرنه در باکت یتیم می‌ماند (R-FILE-10).
  if (row.previewKey) await deleteObject(row.previewKey).catch(() => {});
  await db.delete(files).where(eq(files.id, fileId));
}

export { FileRejected };

/* ------------------------------------------------------------------ *
 * رسیدهای ردیفِ دفتر
 * ------------------------------------------------------------------ */

/**
 * ذخیرهٔ فایلِ رسید.
 * ⚠️ گاردش مالی است، نه پروژه — رسید سندِ مالی است و فهرستِ نوعِ
 * محدودتری دارد (فقط تصویر و PDF).
 */
export async function storeReceipt(
  actor: Actor,
  blob: { name: string; mime: string; bytes: Uint8Array },
): Promise<number> {
  if (!canManageSection(actor, 'finance')) throw new ForbiddenError('finance.manage');
  return storeFile(actor, blob, 'receipt');
}

/** حذفِ فایل‌هایی که دیگر به هیچ ردیفی وصل نیستند (R-FILE-10). */
export async function removeFiles(fileIds: readonly number[]): Promise<void> {
  for (const id of fileIds) await removeFile(id);
}

/** اطلاعاتِ نمایشیِ چند فایل — یک کوئری (R-PERF-01). */
export async function fileSummaries(fileIds: readonly number[]) {
  if (fileIds.length === 0) return [];
  const rows = await db
    .select({
      id: files.id,
      mime: files.mime,
      size: files.size,
      originalName: files.originalName,
    })
    .from(files)
    .where(inArray(files.id, [...fileIds]));

  // ترتیبِ ذخیره‌شده حفظ می‌شود، نه ترتیبِ دلخواهِ دیتابیس.
  const byId = new Map(rows.map((r) => [r.id, r]));
  return fileIds
    .map((id) => byId.get(id))
    .filter((r): r is NonNullable<typeof r> => Boolean(r))
    .map((r) => ({ ...r, href: `/api/files/${r.id}`, kind: kindOf(r.mime) }));
}

/**
 * لوگوی شرکت.
 *
 * ⚠️ فقط مالک: لوگو روی هر فاکتوری که بیرون می‌رود می‌نشیند، یعنی هویتِ
 * حقوقیِ شرکت. همان گاردِ `saveCompany`.
 *
 * ⚠️ فایلِ قبلی پاک می‌شود، مثلِ آواتار: لوگوی جایگزین‌شده به هیچ ردیفی وصل
 * نیست و فقط فضا می‌گیرد.
 */
/** حذفِ لوگوی شرکت — پورتِ «حذفِ لوگو» ِ تبِ اطلاعاتِ شرکت: فقط مالک؛ فایل هم آزاد می‌شود. */
export async function removeCompanyLogo(actor: Actor): Promise<void> {
  if (!actor.roles.includes('owner')) throw new ForbiddenError('company.owner_only');
  const previous = await db.select({ fileId: company.logoFileId })
    .from(company).where(eq(company.id, 1));
  await db.insert(company).values({ id: 1, logoFileId: null })
    .onConflictDoUpdate({ target: company.id, set: { logoFileId: null, updatedAt: new Date() } });
  const old = previous[0]?.fileId;
  if (old) await removeFile(old);
}

export async function setCompanyLogo(
  actor: Actor,
  blob: { name: string; mime: string; bytes: Uint8Array },
) {
  if (!actor.roles.includes('owner')) throw new ForbiddenError('company.owner_only');

  const previous = await db.select({ fileId: company.logoFileId })
    .from(company).where(eq(company.id, 1));

  const fileId = await storeFile(actor, blob, 'avatar');
  await db.insert(company).values({ id: 1, logoFileId: fileId })
    .onConflictDoUpdate({
      target: company.id,
      set: { logoFileId: fileId, updatedAt: new Date() },
    });

  const old = previous[0]?.fileId;
  if (old) await removeFile(old);
  return fileId;
}
