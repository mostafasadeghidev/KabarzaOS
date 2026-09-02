import { tagName } from '@/db/tag-name';
import { currentLocale, getT } from '@/i18n/server';
import { notInArray, and, eq, inArray, isNull, asc, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  attachments, comments, ledger, paymentRequests, projectClients, projectMembers,
  projectPayments, projectQa, projects, tags, tagRelations, tasks, taskRoles,
  tenderBids, timelogs, auditLog, userOffices, users, currencies,
} from '@/db/schema';
import { canManageSection, canViewSection, type Actor } from '@/domain/access/permissions';
import { assertCanManage, assertCanView, canSeeScope, filterVisible, ForbiddenError, visibleScopes, assertOwner, filterVisibleFor } from '@/domain/access/guard';
import { diffMembers, planAddMember, type MemberInput } from '@/domain/projects/members';
import {
  assertCanLighten, canSetParent, impactState, planDelete,
  type LightenSummary, type ProjectImpact, isFrozenProject,
} from '@/domain/projects/lifecycle';
import { OPEN_STATUS, toggleStatus, type CommentType } from '@/domain/projects/comments';
import { assigneeOptions } from '@/domain/projects/assignees';
import { claimableRoleIds, canClaimTask } from '@/domain/projects/claim';
import { planQaApply, qaToggle, type QaAudience } from '@/domain/projects/qa';
import {
  openRolesForUser, planApproveBid, planTenderRoles, planWithdrawBid, tenderIsOpen,
  validateBid, type BidRejection, type TenderRoleRow,
} from '@/domain/projects/tender';
import { notify } from '@/server/notifications/service';
import {
  assertCanInteractWithProject, assertCanManageProject, assertCanViewProject, assertNotFrozen,
  canManageProject, canViewProject, membershipProjectIds, moneyAudience, projectRelation, canInteractWithProject, managedOfficeProjectIds,
} from './authority';
import { canSeeProjectFinance, canSeeProjectPrice } from '@/domain/access/project-money';
import { visiblePayments } from '@/domain/access/project-payments';
import { canManageProject as decideManage, PM_CAP } from '@/domain/access/project-scope';
import {
  assignableToPeople, FALLBACK_MEMBER_LABEL, nameForViewer, type ViewerContext, CLIENT_LABEL,
} from '@/domain/access/viewer-names';
import { resolveAssignment } from '@/domain/projects/assignment';
import {
  assignmentDelta, commentRecipients, reviewRecipients, taskDoerIds,
} from '@/server/notifications/audience';
import * as repo from './repository';
import { defaultProjectStatusId, defaultTaskStatusId } from '@/domain/projects/defaults';
import { removeFiles } from '@/server/files/service';
import { rowValueIn } from '@/domain/team-money/payments';
import { rateSource } from '@/server/finance/service';
import { matrixForIds, rowCells } from '@/server/availability/service';
import { weekOrder, weekdayIndex, WEEKDAYS } from '@/domain/availability/weekly';
import { getSystemConfig } from '@/server/settings/system-service';

/**
 * سرویسِ پروژه — تنها دروازه‌ای که UI و API از آن رد می‌شوند.
 *
 * ⚠️ R-ARCH-01 — هر گاردی اینجاست، نه در صفحه. درسِ نسخهٔ قبلی: گاردِ لایهٔ صفحه
 * را هر مسیرِ جدید (API، ایجنت، ایمپورت) دور می‌زند.
 */

/** فهرستِ پروژه‌ها — فقط scopeهایی که بازیگر اجازه دارد. */
export async function listProjects(actor: Actor) {
  if (canViewSection(actor, 'projects')) {
    return maskNames(actor, await maskPrices(actor, await repo.listProjects(visibleScopes(actor))));
  }
  /**
   * مسیرِ عضویتی — پورتِ «پروژه‌های من» ِ نسخهٔ قبلی: عضو/کارفرما فقط
   * پروژه‌های خودش را می‌بیند. scope اینجا هر دو است، چون عضویت بر آن
   * مقدم است (کسی که روی پروژهٔ خصوصی امضا شده، می‌بیندش).
   */
  // عضویت‌ها + پروژه‌های دفاترِ تحتِ مدیریت (پورتِ سه بخشِ «همهٔ پروژه‌ها»).
  const ids = [...new Set([
    ...(await membershipProjectIds(actor.id)),
    ...(await managedOfficeProjectIds(actor.id)),
  ])];
  return maskNames(actor, await maskPrices(actor, await repo.listProjects(['company', 'private'], ids)));
}

/**
 * ماسکِ نام روی **فهرست** — همان قاعدهٔ صفحهٔ پروژه، این‌بار روی چیپ‌های کارت.
 *
 * ⚠️ چرا نسخهٔ قبلی این را ندارد و ما لازمش داریم: آنجا کارتِ پروژه فقط در
 * پنلِ ادمین است و کارفرما هرگز نمی‌بیندش. اینجا یک شبکهٔ پروژه برای همه
 * است، پس بدونِ این ماسک، کارفرما نامِ اعضا را از روی کارت می‌خواند در
 * حالی که صفحهٔ خودِ پروژه آن را به «طراح» تبدیل می‌کند — یعنی نشتی از
 * راهِ فهرست، درست همان چیزی که ماسک برای جلوگیری از آن نوشته شد.
 *
 * ⚠️ دو کوئریِ ثابت برای کلِ فهرست، نه به‌ازای هر پروژه (R-PERF-01): چیپ‌ها
 * خودشان می‌گویند بیننده روی هر پروژه عضو است یا کارفرما، و فقط «مدیرِ
 * این پروژه بودن» است که باید پرسیده شود.
 */
async function maskNames<T extends repo.ProjectListRow>(actor: Actor, rows: T[]): Promise<T[]> {
  // مدیرِ سراسری هر نامی را همان‌طور که هست می‌بیند.
  if (rows.length === 0 || canManageSection(actor, 'projects')) return rows;

  /**
   * ⚠️ فقط پروژه‌هایی که بیننده رویشان امضا دارد ماسک می‌خورند: هر دو قاعدهٔ
   * `nameForViewer` به «بیننده عضو/کارفرمای همین پروژه است» مشروط‌اند، پس
   * برای بقیه کوئری زدن هم بی‌فایده است.
   */
  const involved = rows.some((r) =>
    r.members.some((m) => m.userId === actor.id) || r.clients.some((c) => c.userId === actor.id));
  if (!involved) return rows;

  const [pmRows, managedOffices] = await Promise.all([
    db.select({ projectId: projectMembers.projectId })
      .from(projectMembers)
      .innerJoin(tags, eq(tags.id, projectMembers.roleTagId))
      .where(and(eq(projectMembers.userId, actor.id), eq(tags.grantsCap, PM_CAP))),
    db.select({ officeId: userOffices.officeId })
      .from(userOffices)
      .where(and(eq(userOffices.userId, actor.id), eq(userOffices.manages, true))),
  ]);
  const pmOn = new Set(pmRows.map((r) => r.projectId));
  const managedOfficeIds = managedOffices.map((r) => r.officeId);

  return rows.map((r) => {
    const viewerIsMember = r.members.some((m) => m.userId === actor.id);
    const viewerIsClient = r.clients.some((c) => c.userId === actor.id);
    if (!viewerIsMember && !viewerIsClient) return r;

    const ctx: ViewerContext = {
      managesProject: decideManage({
        hasGlobalManage: false,
        isPmOnProject: pmOn.has(r.id),
        projectOfficeId: r.officeId,
        managedOfficeIds,
        isMemberOfProject: viewerIsMember,
      }),
      viewerIsClient,
      viewerIsMember,
      roleByUser: new Map(r.members.map((m) => [m.userId, m.roleName ?? FALLBACK_MEMBER_LABEL])),
      clientIds: new Set(r.clients.map((c) => c.userId)),
    };

    return {
      ...r,
      members: r.members.map((m) => ({ ...m, name: nameForViewer(m.userId, m.name, ctx) })),
      clients: r.clients.map((c) => ({ ...c, name: nameForViewer(c.userId, c.name, ctx) })),
    };
  });
}

/**
 * قیمت را از ردیف‌هایی که کاربر حقِ دیدنشان را ندارد **بیرون می‌کشد**.
 *
 * ⚠️ صفر کردنِ عدد، نه پنهان‌کردنش در UI: کارتِ پروژه کامپوننتِ کلاینت است
 * و هر چه به آن پاس شود در payload ِ صفحه می‌نشیند — پنهان‌کردن با شرطِ
 * رندر، قیمت را از View Source پاک نمی‌کند.
 *
 * ⚠️ یک کوئریِ ثابت برای کلِ فهرست، نه یکی به‌ازای هر پروژه: مدیرِ سراسری و
 * مدیرِ مالی اصلاً کوئری نمی‌خورند.
 */
/**
 * ردیفِ پروژه آن‌طور که به فهرست می‌رسد — با پرچمِ حقِ دیدنِ قیمت.
 * کارت باید بداند «قیمت را ندارم» با «قیمت صفر است» فرق دارد.
 */
export type VisibleProjectRow = repo.ProjectListRow & { canSeePrice: boolean };

async function maskPrices<T extends { id: number; price: string; billableExpenses: string }>(
  actor: Actor,
  rows: T[],
): Promise<Array<T & { canSeePrice: boolean }>> {
  if (canManageSection(actor, 'projects') || canManageSection(actor, 'finance')) {
    return rows.map((r) => ({ ...r, canSeePrice: true }));
  }
  if (rows.length === 0) return [];

  const clientOf = await repo.clientProjectIds(actor.id, rows.map((r) => r.id));
  return rows.map((r) => (clientOf.has(r.id)
    /**
     * ⚠️ پرچمِ صریح، نه حدس از روی «قیمت صفر است»: پروژه‌ای می‌تواند
     * واقعاً صفر باشد و آن‌وقت کارت بی‌دلیل مبلغ را پنهان می‌کرد.
     */
    ? { ...r, canSeePrice: true }
    : { ...r, price: '0', billableExpenses: '0', canSeePrice: false }));
}

export class NotFoundError extends Error {
  constructor() {
    super('not found');
    this.name = 'NotFoundError';
  }
}

/**
 * یک پروژه.
 * ⚠️ scope بعد از خواندن چک می‌شود — «یافت نشد» برمی‌گردد نه «ممنوع»،
 * تا وجودِ پروژهٔ خصوصی لو نرود.
 */
export async function getProject(actor: Actor, id: number) {
  const project = await repo.getProject(id);
  if (!project) throw new NotFoundError();

  // بینندهٔ مجوزی: گاردِ scope مثلِ قبل.
  if (canViewSection(actor, 'projects')) {
    if (!canSeeScope(actor, project.scope as 'company' | 'private')) throw new NotFoundError();
    return project;
  }

  /**
   * مسیرِ عضویتی (`user_can_access` نسخهٔ قبلی) — عضو/کارفرمای همین پروژه یا
   * مدیرِ دفترِ مالک. «یافت نشد»، نه «ممنوع»، تا وجودِ پروژه لو نرود.
   */
  if (await canViewProject(actor, id)) return project;
  throw new NotFoundError();
}

/** والدِ انتخاب‌شده قواعدِ سلسله‌مراتب را نقض می‌کند (R-PROJ-20). */
export class InvalidParentError extends Error {
  constructor() {
    super('invalid_parent');
    this.name = 'InvalidParentError';
  }
}

/** ثبتِ رویداد در لاگِ ممیزی — با نوعِ عامل (انسان یا ایجنت). */
async function audit(actor: Actor, action: string, objectId: number, before?: unknown, after?: unknown) {
  await db.insert(auditLog).values({
    actorType: 'user',
    actorId: actor.id,
    action,
    objectType: 'project',
    objectId,
    before: before ?? null,
    after: after ?? null,
  });
}

/**
 * به‌روزرسانیِ اعضا — diff-محور (R-PROJ-08/09/11).
 * فهرستِ `newlyAdded` برمی‌گردد تا لایهٔ بالاتر فقط به آن‌ها اعلان بدهد.
 */
/** نامِ تگ‌ها به زبانِ درخواست — برای بدنهٔ اعلان. */
async function roleNamesOf(ids: number[]): Promise<Map<number, string>> {
  if (ids.length === 0) return new Map();
  const rows = await db.select({ id: tags.id, name: tagName(await currentLocale()) })
    .from(tags).where(inArray(tags.id, ids));
  return new Map(rows.map((r) => [r.id, r.name ?? '']));
}

/**
 * اعلانِ «به پروژه اضافه شدید» — عضو با/بی نقش، یا کارفرما (پورتِ
 * `Notifications::project_signed()`). پیش از این بدنه فقط نامِ پروژه بود و
 * کارفرما اصلاً خبردار نمی‌شد.
 */
function signedNotice(
  projectId: number,
  projectTitle: string,
  who: { client: true } | { client: false; role: string },
) {
  const body = who.client
    ? 'شما به‌عنوان کارفرما به پروژهٔ «{project}» اضافه شدید.'
    : who.role
      ? 'شما به‌عنوان عضو با نقش ({role}) به پروژهٔ «{project}» اضافه شدید.'
      : 'شما به‌عنوان عضو به پروژهٔ «{project}» اضافه شدید.';
  return {
    type: 'project.signed',
    title: 'به پروژه اضافه شدید: {project}',
    body,
    params: { project: projectTitle, role: who.client ? '' : who.role },
    url: `/projects/${projectId}`,
  };
}

export async function setMembers(actor: Actor, projectId: number, desired: MemberInput[]) {
  await getProject(actor, projectId); // گاردِ scope
  await assertCanManageProject(actor, projectId);

  const [existing, inactive, owed] = await Promise.all([
    repo.listMembers(projectId),
    repo.inactiveUserIds(),
    repo.owedUserIds(projectId),
  ]);
  // R-PROJ-10 — نقشِ اصلی فقط برای کسانی لازم است که نقش انتخاب نکرده‌اند.
  const needRole = desired.filter((d) => !d.roleTagId).map((d) => d.userId);
  const primaryRoleOf = await repo.primaryRoleOf([...new Set(needRole)]);

  const diff = diffMembers(desired, existing, {
    inactiveUserIds: inactive,
    primaryRoleOf,
    owedUserIds: owed,
  });

  await db.transaction(async (tx) => {
    if (diff.toDelete.length) {
      await tx.delete(projectMembers).where(inArray(projectMembers.id, diff.toDelete));
    }
    for (const { id, input } of diff.toUpdate) {
      await tx.update(projectMembers)
        .set({
          agreedAmount: input.agreedAmount,
          unitRate: input.unitRate ?? '0',
          currencyId: input.currencyId ?? null,
          updatedAt: new Date(),
        })
        .where(eq(projectMembers.id, id));
    }
    if (diff.toInsert.length) {
      await tx.insert(projectMembers).values(
        diff.toInsert.map((m) => ({
          projectId,
          userId: m.userId,
          roleTagId: m.roleTagId,
          agreedAmount: m.agreedAmount,
          unitRate: m.unitRate ?? '0',
          currencyId: m.currencyId ?? null,
        })),
      );
    }
  });

  await audit(actor, 'members.set', projectId, existing, desired);

  /**
   * پورتِ `project_signed` — به **خودِ** کسی که تازه امضا شده، نه به همه.
   *
   * ⚠️ «تازه» یعنی پیش از این در **هیچ** نقشی روی پروژه نبوده. نسخهٔ قبلی هم
   * همین شرط را دارد؛ وگرنه تغییرِ نقشِ یک عضو برایش «به پروژه اضافه شدید»
   * می‌فرستاد.
   */
  const had = new Set(existing.map((m) => m.userId));
  const freshIds = [...new Set(
    diff.toInsert.map((m) => m.userId).filter((id) => !had.has(id) && id !== actor.id),
  )];
  if (freshIds.length > 0) {
    const project = await repo.getProject(projectId);
    // نقشِ هر تازه‌وارد در بدنه می‌آید — «با نقش (دولوپر)».
    const roleOfFresh = new Map<number, number | null>();
    for (const m of diff.toInsert) if (!roleOfFresh.has(m.userId)) roleOfFresh.set(m.userId, m.roleTagId);
    const roleNames = await roleNamesOf(
      [...new Set([...roleOfFresh.values()].filter((id): id is number => id !== null))],
    );
    for (const userId of freshIds) {
      const role = roleNames.get(roleOfFresh.get(userId) ?? -1) ?? '';
      await notify([userId], signedNotice(projectId, project?.title ?? '', { client: false, role }));
    }
  }

  /**
   * ⚠️ نامِ کسانی که به‌خاطرِ طلب ماندند، برای گفتن به کاربر. شناسه به‌تنهایی
   * در پیام بی‌فایده است و این تنها جایی است که نامشان در دسترس است.
   */
  const nameOf = (id: number) => existing.find((m) => m.userId === id)?.userName ?? `#${id}`;
  return {
    ...diff,
    keptOwedNames: diff.keptOwed.map(nameOf),
    keptFormerNames: diff.keptFormer.map(nameOf),
  };
}

/**
 * قطع/وصلِ دسترسیِ یک نفر به **این** پروژه — بدونِ برداشتنش.
 *
 * ⚠️ چرا لازم است: دو قاعده مانعِ حذفِ عضو می‌شوند (عضوِ سابق، و طلبِ
 * تسویه‌نشده) و هر دو درست‌اند — پول نباید با یک ویرایشِ گروهی ناپدید شود.
 * ولی راهِ سومی نبود: مدیر یا باید پول را رها می‌کرد یا دسترسی را. حالا
 * ردیف می‌ماند و فقط دیدن قطع می‌شود.
 *
 * ⚠️ همهٔ ردیف‌های آن فرد روی این پروژه با هم عوض می‌شوند: عضوِ دو-نقشه دو
 * ردیف دارد و قطع‌کردنِ یکی، دسترسی را از راهِ دیگری باز می‌گذاشت.
 */
export async function setProjectAccess(
  actor: Actor,
  projectId: number,
  userId: number,
  blocked: boolean,
) {
  await getProject(actor, projectId); // گاردِ scope
  await assertCanManageProject(actor, projectId);

  const [memberResult, clientResult] = await Promise.all([
    db.update(projectMembers)
      .set({ accessBlocked: blocked, updatedAt: new Date() })
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
      .returning({ id: projectMembers.id }),
    db.update(projectClients)
      .set({ accessBlocked: blocked, updatedAt: new Date() })
      .where(and(eq(projectClients.projectId, projectId), eq(projectClients.userId, userId)))
      .returning({ id: projectClients.id }),
  ]);

  const touched = memberResult.length + clientResult.length;
  if (touched === 0) throw new NotFoundError();

  await audit(
    actor,
    blocked ? 'project.access.block' : 'project.access.unblock',
    projectId,
    null,
    { userId },
  );
  return touched;
}

export interface DeleteInput {
  mode?: 'full' | 'detach';
  confirmTitle?: string;
}

/**
 * حذفِ پروژه — R-PROJ-01/03/04.
 * تصمیم در دامنه گرفته می‌شود؛ اینجا فقط اجرا می‌شود.
 */
export async function deleteProject(actor: Actor, projectId: number, input: DeleteInput) {
  // ⚠️ فقط مالک — پورتِ `manage_options` روی بخشِ حذف؛ مدیرِ پروژه‌ها هم نه.
  assertOwner(actor);
  const project = await getProject(actor, projectId);

  // ⚠️ ماندهٔ باز از خودِ داده — نه از فراخوان. با مقدارِ هاردکدِ false، قفل هرگز نمی‌افتاد.
  const impact: ProjectImpact = await repo.projectImpact(projectId, await repo.openBalances(projectId));
  const plan = planDelete(impact, {
    mode: input.mode,
    confirmTitle: input.confirmTitle,
    actualTitle: project.title,
  });

  const orphanFileIds: number[] = [];
  await db.transaction(async (tx) => {
    // ردیف‌های سبک همیشه می‌روند — فایل، تسک، کامنت، QA، پیشنهاد، اعضا، کارفرمایان.
    const taskIds = await tx.select({ id: tasks.id }).from(tasks).where(eq(tasks.projectId, projectId));
    if (taskIds.length > 0) {
      await tx.delete(taskRoles).where(inArray(taskRoles.taskId, taskIds.map((t) => t.id)));
    }
    await tx.delete(tasks).where(eq(tasks.projectId, projectId));
    await tx.delete(comments).where(eq(comments.projectId, projectId));
    await tx.delete(projectQa).where(eq(projectQa.projectId, projectId));
    // فایلِ فیزیکیِ پیوست‌ها هم می‌رود (`Attachments::delete`) — وگرنه در باکت یتیم می‌ماند.
    orphanFileIds.push(...(await tx.select({ fileId: attachments.fileId }).from(attachments)
      .where(eq(attachments.projectId, projectId))).map((a) => a.fileId).filter((id): id is number => id !== null));
    await tx.delete(attachments).where(eq(attachments.projectId, projectId));
    await tx.delete(tenderBids).where(eq(tenderBids.projectId, projectId));
    await tx.delete(timelogs).where(eq(timelogs.projectId, projectId));
    // زیرپروژه‌ها بی‌والد می‌مانند، نه یتیمِ یک ردیفِ حذف‌شده (`purge_subordinate`).
    await tx.update(projects).set({ parentId: null }).where(eq(projects.parentId, projectId));
    await tx.delete(projectMembers).where(eq(projectMembers.projectId, projectId));
    await tx.delete(projectClients).where(eq(projectClients.projectId, projectId));

    // درخواستِ پرداخت آیتمِ گردشِ کار است، نه پول — در هر دو حالت می‌رود.
    await tx.delete(paymentRequests).where(eq(paymentRequests.projectId, projectId));

    /**
     * ⚠️ R-PROJ-03 — سرنوشتِ تراکنش‌ها:
     *  purge  — «حذف کامل»: تراکنش‌ها هم می‌روند و ماندهٔ حساب بازمحاسبه می‌شود.
     *  detach — «جداسازی»: تراکنش‌ها می‌مانند ولی از پروژه جدا می‌شوند.
     */
    if (plan.financial === 'purge') {
      await tx.delete(projectPayments).where(eq(projectPayments.projectId, projectId));
      await tx.delete(ledger).where(eq(ledger.projectId, projectId));
    } else if (plan.financial === 'detach') {
      /**
       * ⚠️ عنوانِ پروژه در **شرحِ** تراکنش نوشته می‌شود پیش از قطعِ پیوند.
       * بدونِ آن، پولِ جداشده بی‌هویت می‌شد و کسی نمی‌فهمید بابتِ چه بوده.
       */
      const tag = `بابت پروژه: ${project.title}`;
      const rows = await tx.select({ id: projectPayments.id, note: projectPayments.note })
        .from(projectPayments).where(eq(projectPayments.projectId, projectId));

      for (const row of rows) {
        const note = row.note.trim();
        const next = note === '' ? tag : (note.includes(tag) ? note : `${note} — ${tag}`);
        await tx.update(projectPayments)
          .set({ note: next, projectId: null })
          .where(eq(projectPayments.id, row.id));
      }

      // ردیف‌های دفترکل فقط پیوندشان قطع می‌شود؛ برچسبِ طرف و شرحشان می‌ماند.
      await tx.update(ledger).set({ projectId: null }).where(eq(ledger.projectId, projectId));
    }

    // حذفِ نرم — سوابق برای ممیزی می‌مانند (G6).
    await tx.update(projects).set({ deletedAt: new Date() }).where(eq(projects.id, projectId));
  });

  await removeFiles(orphanFileIds);
  await audit(actor, `project.delete.${plan.financial}`, projectId, project, null);
  return plan;
}

/**
 * جزئیاتِ پروژه — پروژه، اعضا و تسک‌ها با یک گاردِ واحد.
 *
 * ⚠️ R-RBAC-12 — تسکِ خصوصی **قبل از رسیدن به UI** فیلتر می‌شود، نه در قالب.
 * وگرنه شمارنده‌ها و وضعیت‌ها اطلاعات لو می‌دهند (نشتیِ واقعیِ نسخهٔ قبلی).
 */
export async function getProjectDetail(actor: Actor, projectId: number) {
  const project = await getProject(actor, projectId); // گاردِ دسترسی + scope

  const [members, allTasks, clientRows] = await Promise.all([
    repo.listMembers(projectId),
    repo.listTasks(projectId),
    // کارفرمایان به ترتیبِ انتساب — اولی «کارفرمای اصلی» است.
    db.select({ userId: projectClients.userId, name: users.name })
      .from(projectClients)
      .innerJoin(users, eq(users.id, projectClients.userId))
      .where(eq(projectClients.projectId, projectId))
      .orderBy(asc(projectClients.id)),
  ]);

  // R-PROJ-14 با مدیریتِ پروژه‌محور: مدیرِ پروژه/دفتر تسکِ خصوصیِ پروژهٔ خودش را می‌بیند.
  const canManage = await canManageProject(actor, projectId);
  const visibleTasks = filterVisibleFor(actor, allTasks, canManage);
  const roles = await repo.taskRolesFor(visibleTasks.map((t) => t.id));

  const rolesByTask = new Map<number, typeof roles>();
  for (const r of roles) {
    const list = rolesByTask.get(r.taskId) ?? [];
    list.push(r);
    rolesByTask.set(r.taskId, list);
  }

  /**
   * ⚠️ ماسکِ نام **اینجا** اعمال می‌شود، نه در UI: کارفرما نباید نامِ اعضا
   * را ببیند و عضو نباید نامِ کارفرما را — `domain/access/viewer-names`.
   * اگر نامِ واقعی به کلاینت می‌رفت و آنجا پنهان می‌شد، در payload ِ همان
   * صفحه می‌ماند و با View Source خوانده می‌شد.
   */
  const viewer = await viewerContext(actor, projectId, canManage, members);

  return {
    project,
    members: members.map((m) => ({
      ...m,
      userName: m.userName === null ? null : nameForViewer(m.userId, m.userName, viewer),
    })),
    tasks: visibleTasks.map((t) => ({
      ...t,
      assigneeName: t.assigneeName === null || t.assignedTo === null
        ? t.assigneeName
        : nameForViewer(t.assignedTo, t.assigneeName, viewer),
      // ⚠️ نامِ صاحبِ نقش هم ماسک می‌شود — کارفرما نامِ واقعیِ عضوی که نقش را
      // ادعا کرده می‌دید، در حالی که نامِ همان عضو در جدولِ اعضا ماسک بود.
      roles: (rolesByTask.get(t.id) ?? []).map((r) => ({
        ...r,
        claimedByName: r.claimedBy === null || r.claimedByName === null
          ? r.claimedByName
          : nameForViewer(r.claimedBy, r.claimedByName, viewer),
      })),
    })),
    // ⚠️ نامِ کارفرما هم ماسک می‌شود: عضوِ خالص «کارفرما» می‌بیند، نه نام.
    clients: clientRows.map((c) => ({ userId: c.userId, name: nameForViewer(c.userId, c.name, viewer) })),
    canManage,
    viewer,
  };
}

/**
 * زمینهٔ ماسکِ نام برای این بیننده روی این پروژه.
 *
 * ⚠️ `roleByUser` از همان `members` ِ خوانده‌شده ساخته می‌شود تا کوئریِ
 * اضافه‌ای نخورد؛ فقط فهرستِ کارفرمایان جداگانه لازم است.
 */
async function viewerContext(
  actor: Actor,
  projectId: number,
  canManage: boolean,
  members: Array<{ userId: number; roleName: string | null }>,
): Promise<ViewerContext> {
  const [relation, clientIds] = await Promise.all([
    projectRelation(actor.id, projectId),
    repo.listClientIds(projectId),
  ]);
  // برچسب‌های ماسک به زبانِ بیننده — نامِ نقش از tagName() از قبل ترجمه‌شده است.
  const t = await getT();
  const labels = { member: t(FALLBACK_MEMBER_LABEL), client: t(CLIENT_LABEL) };
  const roleByUser = new Map<number, string>();
  for (const m of members) {
    if (!roleByUser.has(m.userId)) {
      roleByUser.set(m.userId, m.roleName ?? labels.member);
    }
  }
  return {
    managesProject: canManage,
    viewerIsClient: relation.isClient,
    viewerIsMember: relation.isMember,
    roleByUser,
    clientIds: new Set(clientIds),
    labels,
  };
}

export interface CreateProjectData {
  title: string;
  description: string;
  regDate: string | null;
  deadline: string | null;
  statusTagId: number | null;
  price: string;
  currencyId: number | null;
  officeId: number | null;
  parentId: number | null;
  isUnitBased: boolean;
  isTender: boolean;
  /** ردیف‌های جدولِ نقش/سقفِ مناقصه. */
  tenderRoles?: TenderRoleRow[];
  scope: 'company' | 'private';
}

/**
 * ذخیرهٔ جدولِ نقش‌های مناقصه + اعلامِ نقش‌های تازه.
 *
 * ⚠️ قاعده در `planTenderRoles` است: تیک بدونِ نقش مناقصه نیست، و اعلان
 * فقط برای نقش‌هایی می‌رود که تازه اضافه شده‌اند.
 */
async function saveTenderRoles(
  actor: Actor,
  projectId: number,
  input: { checked: boolean; rows: TenderRoleRow[]; previouslyAnnounced: number[] },
): Promise<boolean> {
  const plan = planTenderRoles(input);

  await db.update(projects).set({
    isTender: plan.isTender,
    tenderRoles: plan.isTender ? plan.roles : null,
    tenderAnnounced: plan.announced.length > 0 ? plan.announced : null,
    updatedAt: new Date(),
  }).where(eq(projects.id, projectId));

  if (plan.newlyAnnounced.length > 0) {
    // فقط دارندگانِ نقش‌های تازه خبر می‌شوند — **یک پیام به‌ازای هر نقش** با نامِ
    // همان نقش (پورتِ `tender_new()`): کسی که دو نقشِ بازشده دارد دو خبرِ روشن می‌گیرد.
    const [holders, project, roleNames] = await Promise.all([
      db.selectDistinct({ userId: tagRelations.objectId, tagId: tagRelations.tagId })
        .from(tagRelations)
        .where(and(
          eq(tagRelations.objectType, 'user'),
          inArray(tagRelations.tagId, plan.newlyAnnounced),
        )),
      db.select({ title: projects.title }).from(projects).where(eq(projects.id, projectId)),
      roleNamesOf(plan.newlyAnnounced),
    ]);
    for (const tagId of plan.newlyAnnounced) {
      const userIds = holders.filter((h) => h.tagId === tagId).map((h) => h.userId);
      if (userIds.length === 0) continue;
      await notify(userIds, {
        type: 'tender_opened',
        title: 'مناقصهٔ باز برای نقشِ شما: {role}',
        body: 'نقشِ «{role}» در پروژهٔ «{project}» به مناقصه گذاشته شد.',
        params: { role: roleNames.get(tagId) ?? '', project: project[0]?.title ?? '' },
        url: `/projects/${projectId}`,
      });
    }
    await audit(actor, 'tender.announce', projectId, null, plan.newlyAnnounced);
  }

  return plan.isTender;
}

/**
 * ساختِ پروژه.
 *
 * ⚠️ گاردها:
 *  - مجوزِ مدیریتِ پروژه (R-RBAC-05 لایهٔ سوم)
 *  - scope خصوصی فقط برای کسی که گرنتش را دارد — وگرنه کاربر می‌توانست
 *    پروژه‌ای بسازد که خودش هم نبیندش
 *  - R-PROJ-20: والد باید معتبر و خودش زیرپروژه نباشد
 */
/** پورتِ `Projects::currency_id()`: پروژهٔ بی‌ارز ارزِ پیش‌فرضِ شرکت را می‌گیرد، نه null. */
async function currencyOrDefault(currencyId: number | null): Promise<number | null> {
  if (currencyId !== null) return currencyId;
  const rows = await db.select({ id: currencies.id }).from(currencies).where(eq(currencies.isDefault, true)).limit(1);
  return rows[0]?.id ?? null;
}

export async function createProject(actor: Actor, input: CreateProjectData): Promise<number> {
  assertCanManage(actor, 'projects');

  if (input.scope === 'private' && !canSeeScope(actor, 'private')) {
    throw new ForbiddenError('scope.private');
  }

  if (input.parentId !== null) {
    const parent = await repo.getProject(input.parentId);
    // والدِ ناموجود، خارج از scope، یا خودش زیرپروژه → رد.
    if (!parent || !canSeeScope(actor, parent.scope as 'company' | 'private') || parent.parentId !== null) {
      throw new NotFoundError();
    }
  }

  // وضعیتِ پیش‌فرض — مناقصه «احتمالِ عقد قرارداد»، وگرنه «شروع نشده» (`default_status_id`).
  // پیش از این پروژهٔ بی‌وضعیت در هیچ تبِ پایپ‌لاین نبود و مناقصه بسته حساب می‌شد.
  const statusTagId = input.statusTagId ?? defaultProjectStatusId(await repo.statusTags(), input.isTender);
  const rows = await db.insert(projects).values({
    title: input.title,
    description: input.description,
    regDate: input.regDate,
    deadline: input.deadline,
    statusTagId,
    price: input.price,
    currencyId: await currencyOrDefault(input.currencyId),
    officeId: input.officeId,
    parentId: input.parentId,
    isUnitBased: input.isUnitBased,
    // ⚠️ پرچمِ نهایی را `saveTenderRoles` تعیین می‌کند (تیک بدونِ نقش، مناقصه نیست).
    isTender: false,
    scope: input.scope,
  }).returning({ id: projects.id });

  const id = rows[0]!.id;

  await saveTenderRoles(actor, id, {
    checked: input.isTender,
    rows: input.tenderRoles ?? [],
    previouslyAnnounced: [],
  });

  await audit(actor, 'project.create', id, null, input);
  return id;
}

/**
 * گزینه‌های فرم — وضعیت، ارز، دفتر، پروژهٔ والد.
 * با `excludeId` (حالتِ ویرایش) خودِ پروژه و فرزندانش از فهرستِ والد حذف می‌شوند.
 */
/**
 * ⚠️ بدونِ `projectId` فرمِ **ساخت** است و مجوزِ سراسری می‌خواهد (پروژه‌ای
 * نیست که کسی مدیرش باشد)؛ با `projectId` فرمِ ویرایش است و گاردِ پروژه‌ای
 * کافی است — همان قاعدهٔ `getMembersForm` و `getQaForm`.
 */
export async function getProjectFormOptions(actor: Actor, excludeId?: number) {
  if (excludeId === undefined) assertCanManage(actor, 'projects');
  else await assertCanManageProject(actor, excludeId);
  const [
    statuses, currencyRows, officeRows, parents, roleTagRows,
    people, clientPeople, priorities, qaRows, memberRoles,
  ] = await Promise.all([
    repo.statusTags(),
    repo.currencyOptions(),
    repo.officeOptions(),
    repo.parentOptions(visibleScopes(actor), excludeId),
    // تگ‌های نقشِ عضو — جدولِ نقشِ مناقصه از همین‌ها پر می‌شود.
    db.select({ id: tags.id, label: tagName(await currentLocale()) })
      .from(tags).where(eq(tags.type, 'member_role')).orderBy(tags.sortOrder, tags.id),
    // بخش‌های اولیهٔ فرمِ ساخت — اعضا، کارفرمایان، اولویت‌ها، کتابخانهٔ QA.
    repo.memberCandidates(),
    repo.clientCandidates(),
    repo.taskPriorityTags(),
    repo.qaLibrary(),
    repo.memberRoleMap(),
  ]);
  return {
    statuses,
    currencies: currencyRows,
    offices: officeRows,
    parents,
    roleTags: roleTagRows,
    canUsePrivate: canSeeScope(actor, 'private'),
    people,
    clientPeople,
    priorities,
    // ⚠️ فقط «خالی نبودن» مهم است؛ خودِ آیتم‌ها به مرورگر فرستاده نمی‌شوند.
    hasQaLibrary: qaRows.length > 0,
    /** نقش‌های هر عضو — فرم فقط همان‌ها را پیشنهاد می‌دهد. */
    memberRoles,
  };
}

/** دادهٔ فرمِ اعضا — ردیف‌های موجود + گزینه‌ها. */
export async function getMembersForm(actor: Actor, projectId: number) {
  const project = await getProject(actor, projectId); // گاردِ scope
  await assertCanManageProject(actor, projectId);

  const [rows, team, roles, currencyRows, owed] = await Promise.all([
    repo.listMembers(projectId),
    repo.memberCandidates(),
    repo.memberRoleTags(),
    repo.currencyOptions(),
    repo.owedUserIds(projectId),
  ]);

  // R-PROJ-11 — عضوِ غیرفعال در فهرستِ انتخاب نیست، ولی ردیفِ موجودش دیده می‌شود.
  const inactiveOnList = rows.filter((r) => !team.some((t) => t.id === r.userId));

  return {
    isUnitBased: project.isUnitBased,
    members: rows.map((r) => ({
      userId: r.userId,
      userName: r.userName,
      roleTagId: r.roleTagId,
      agreedAmount: r.agreedAmount,
      unitRate: r.unitRate,
      currencyId: r.currencyId,
      /** عضوِ سابق — ردیفش می‌ماند ولی دوباره انتخاب‌شدنی نیست. */
      isFormer: inactiveOnList.some((i) => i.userId === r.userId),
      /** هنوز طلب دارد — حذفِ دسته‌جمعی رویش اثر ندارد (R-PROJ-23). */
      isOwed: owed.has(r.userId),
    })),
    team,
    roles,
    currencies: currencyRows,
  };
}

/**
 * ویرایشِ پروژه — همان فیلدهای ساخت.
 *
 * ⚠️ گاردِ والد اینجا سخت‌گیرانه‌تر از ساخت است: پروژه‌ای که خودش زیرپروژه
 * دارد نمی‌تواند فرزند شود (R-PROJ-20، شرطِ چهارم).
 */
export async function updateProject(actor: Actor, id: number, input: CreateProjectData): Promise<void> {
  await assertCanManageProject(actor, id);
  const before = await getProject(actor, id); // گاردِ scope + «یافت نشد»

  if (input.scope === 'private' && !canSeeScope(actor, 'private')) {
    throw new ForbiddenError('scope.private');
  }

  let parentId: number | null = null;
  if (input.parentId !== null) {
    const [parent, childCount] = await Promise.all([
      repo.getProject(input.parentId),
      repo.childCount(id),
    ]);
    if (!parent || !canSeeScope(actor, parent.scope as 'company' | 'private')) {
      throw new NotFoundError();
    }
    if (!canSetParent(id, input.parentId, parent.parentId, childCount > 0)) {
      throw new InvalidParentError();
    }
    parentId = input.parentId;
  }

  await db.update(projects).set({
    title: input.title,
    description: input.description,
    regDate: input.regDate,
    deadline: input.deadline,
    statusTagId: input.statusTagId,
    price: input.price,
    currencyId: await currencyOrDefault(input.currencyId),
    officeId: input.officeId,
    parentId,
    isUnitBased: input.isUnitBased,
    scope: input.scope,
    updatedAt: new Date(),
  }).where(eq(projects.id, id));

  // پرچمِ مناقصه و اعلانِ نقش‌های تازه اینجا تعیین می‌شوند.
  await saveTenderRoles(actor, id, {
    checked: input.isTender,
    rows: input.tenderRoles ?? [],
    previouslyAnnounced: before.tenderAnnounced ?? [],
  });

  await audit(actor, 'project.update', id, before, input);
}

/**
 * تغییرِ وضعیت از خودِ کارت.
 *
 * ⚠️ تگ باید واقعاً از نوعِ `project_status` باشد. بدونِ این گارد، هر شناسهٔ
 * تگی (مثلاً یک نقشِ عضو) در فیلدِ وضعیت می‌نشست و کارت بی‌معنا می‌شد.
 * `null` یعنی «بدونِ وضعیت» و مجاز است.
 */
export async function setProjectStatus(actor: Actor, projectId: number, statusTagId: number | null) {
  const before = await getProject(actor, projectId); // گاردِ scope
  await assertCanManageProject(actor, projectId);

  if (statusTagId !== null) {
    const tag = await repo.getTag(statusTagId);
    if (!tag || tag.type !== 'project_status') throw new NotFoundError();
  }

  await db.update(projects)
    .set({ statusTagId, updatedAt: new Date() })
    .where(eq(projects.id, projectId));

  await audit(actor, 'project.status', projectId, before.statusTagId, statusTagId);
}

/** افزودنِ سریعِ عضو از کارت — قاعده‌هایش در `planAddMember` (R-PROJ-24). */
export async function addProjectMember(
  actor: Actor,
  projectId: number,
  input: { userId: number; roleTagId: number | null; agreedAmount: string; unitRate?: string | null; currencyId?: number | null },
) {
  const project = await getProject(actor, projectId); // گاردِ scope
  await assertCanManageProject(actor, projectId);

  const [existing, inactive, primaryRoleOf] = await Promise.all([
    repo.listMembers(projectId),
    repo.inactiveUserIds(),
    input.roleTagId ? Promise.resolve(new Map<number, number | null>()) : repo.primaryRoleOf([input.userId]),
  ]);

  const plan = planAddMember(input, existing, { inactiveUserIds: inactive, primaryRoleOf });
  if (!plan) throw new ForbiddenError('member.inactive');
  if (plan.action === 'keep') return plan;

  // پورتِ `add_member`: نرخِ واحد و ارزِ فراخوان؛ بی‌ارز = ارزِ پروژه. افزایش هم همین دو را می‌نویسد.
  const unitRate = input.unitRate ?? '0';
  const currencyId = input.currencyId ?? project.currencyId;
  if (plan.action === 'raise') {
    await db.update(projectMembers)
      .set({ agreedAmount: input.agreedAmount, unitRate, currencyId, updatedAt: new Date() })
      .where(eq(projectMembers.id, plan.existingId!));
  } else {
    await db.insert(projectMembers).values({
      projectId,
      userId: input.userId,
      roleTagId: plan.roleTagId,
      agreedAmount: input.agreedAmount,
      unitRate,
      currencyId,
    });
  }

  await audit(actor, 'member.add', projectId, null, { ...input, plan: plan.action });

  // تازه‌وارد (پیش از این در هیچ نقشی نبود) خبردار می‌شود — همان قاعدهٔ `setMembers`.
  if (plan.action !== 'raise' && input.userId !== actor.id
    && !existing.some((m) => m.userId === input.userId)) {
    const role = plan.roleTagId ? ((await roleNamesOf([plan.roleTagId])).get(plan.roleTagId) ?? '') : '';
    await notify([input.userId], signedNotice(projectId, project.title, { client: false, role }));
  }
  return plan;
}

/**
 * حذفِ صریحِ **یک ردیفِ** عضویت — پورتِ `remove_member()`: راهِ فرارِ مستندِ افزونه
 * برای عضوِ طلبکار یا سابق که ویرایشِ دسته‌جمعی (R-PROJ-23) حذفش نمی‌کند.
 * ⚠️ فقط مدیرِ پروژه، با ممیزی؛ طلبِ عضو با حذف از بین نمی‌رود (پرداخت‌ها می‌مانند).
 */
export async function removeProjectMember(actor: Actor, projectId: number, memberRowId: number) {
  await getProject(actor, projectId); // گاردِ scope
  await assertCanManageProject(actor, projectId);

  const rows = await db.select({
    id: projectMembers.id, userId: projectMembers.userId, roleTagId: projectMembers.roleTagId,
    agreedAmount: projectMembers.agreedAmount,
  })
    .from(projectMembers)
    .where(and(eq(projectMembers.id, memberRowId), eq(projectMembers.projectId, projectId)));
  const row = rows[0];
  if (!row) throw new NotFoundError();

  await db.delete(projectMembers).where(eq(projectMembers.id, row.id));
  await audit(actor, 'member.remove', projectId, row, null);
  return row.userId;
}

/**
 * افزودنِ کارفرما از کارت.
 * ⚠️ ایندکسِ یکتا در دیتابیس تکراری را می‌گیرد؛ اینجا هم پیش از نوشتن بررسی
 * می‌شود تا کاربر خطای دیتابیس نبیند.
 */
export async function addProjectClient(actor: Actor, projectId: number, userId: number) {
  const project = await getProject(actor, projectId); // گاردِ scope
  await assertCanManageProject(actor, projectId);

  const existing = await repo.listClientIds(projectId);
  if (existing.has(userId)) return;

  await db.insert(projectClients).values({ projectId, userId });
  await audit(actor, 'client.add', projectId, null, { userId });

  // «شما به‌عنوان کارفرما به پروژهٔ … اضافه شدید» — پیش از این کارفرما هیچ خبری نمی‌گرفت.
  if (userId !== actor.id) {
    await notify([userId], signedNotice(projectId, project.title, { client: true }));
  }
}

/** دادهٔ فرمِ کارفرمایان — کارفرمایانِ فعلی (به ترتیبِ انتساب) + کاندیداها. */
export async function getClientsForm(actor: Actor, projectId: number) {
  await getProject(actor, projectId);
  await assertCanManageProject(actor, projectId);
  const [current, candidates] = await Promise.all([
    db.select({ userId: projectClients.userId }).from(projectClients)
      .where(eq(projectClients.projectId, projectId)).orderBy(asc(projectClients.id)),
    repo.clientCandidates(),
  ]);
  return {
    clientIds: current.map((c) => c.userId),
    candidates: candidates.map((c) => ({ id: c.id, label: c.name })),
  };
}

/**
 * جایگزینیِ کارفرمایان — پورتِ `Projects::set_clients()`: diff، نه پاک‌کردن و
 * نوشتنِ دوباره، تا کارفرمای **اصلی** (قدیمی‌ترین انتساب) با هر ویرایش
 * جابه‌جا نشود؛ تازه‌واردها `project_signed` می‌گیرند.
 * ⚠️ پیش از این هیچ راهی برای حذفِ کارفرما از پروژه نبود.
 */
export async function setClients(actor: Actor, projectId: number, userIds: number[]) {
  const project = await getProject(actor, projectId);
  await assertCanManageProject(actor, projectId);

  const want = [...new Set(userIds.filter((id) => Number.isInteger(id) && id > 0))];
  const before = await repo.listClientIds(projectId);
  const toAdd = want.filter((id) => !before.has(id));
  const toRemove = [...before].filter((id) => !want.includes(id));

  if (toAdd.length > 0) {
    // فقط کاربرانِ فعالِ با نقشِ کارفرما — همان استخرِ افزودنِ سریع.
    const allowed = new Set((await repo.clientCandidates()).map((c) => c.id));
    if (toAdd.some((id) => !allowed.has(id))) throw new ForbiddenError('client.invalid');
  }

  await db.transaction(async (tx) => {
    if (toRemove.length > 0) {
      await tx.delete(projectClients)
        .where(and(eq(projectClients.projectId, projectId), inArray(projectClients.userId, toRemove)));
    }
    if (toAdd.length > 0) {
      await tx.insert(projectClients).values(toAdd.map((userId) => ({ projectId, userId })));
    }
  });

  await audit(actor, 'clients.set', projectId, [...before], want);
  for (const userId of toAdd) {
    if (userId !== actor.id) await notify([userId], signedNotice(projectId, project.title, { client: true }));
  }
  return { added: toAdd.length, removed: toRemove.length };
}

/** وضعیت‌های پروژه — چیپِ کارت برای همه لازمش دارد، حتی کاربرِ خواندنی. */
export async function getStatusOptions(actor: Actor) {
  assertCanView(actor, 'projects');
  return repo.statusTags();
}

/** گزینه‌های افزودنِ سریعِ کارت — عضو، نقش، کارفرما. */
export async function getCardOptions(actor: Actor) {
  assertCanManage(actor, 'projects');
  const [team, roles, clients, roleMap] = await Promise.all([
    repo.memberCandidates(),
    repo.memberRoleTags(),
    repo.clientCandidates(),
    /**
     * ⚠️ افزودنِ سریعِ کارت هم مثلِ فرمِ کاملِ اعضا باید فقط نقش‌های **خودِ
     * آن فرد** را پیشنهاد دهد. بدونِ این، فهرست همهٔ نقش‌های سامانه را
     * می‌داد و می‌شد کسی را با نقشی روی پروژه نشاند که اصلاً ندارد.
     */
    repo.memberRoleMap(),
  ]);
  return { team, roles, clients, roleMap };
}

/**
 * دادهٔ کاملِ صفحهٔ پروژه — هشت تبِ مودالِ نسخهٔ قبلی.
 *
 * ⚠️ همه‌چیز پشتِ همان گاردِ scope ِ خودِ پروژه است؛ اگر پروژه دیده نشود
 * هیچ‌کدام از این کوئری‌ها اجرا نمی‌شوند. تبِ مالی مجوزِ جداگانه دارد.
 */
export async function getProjectTabs(actor: Actor, projectId: number) {
  const detail = await getProjectDetail(actor, projectId);

  /**
   * ⚠️ دیدنِ پول با «مجوزِ بخشِ مالی» یکی نیست و همین‌جا اشتباه بود:
   * `canViewSection(actor, 'finance')` نه کارفرما را می‌دید (که باید
   * صورت‌حسابِ خودش را ببیند) و نه جلوی مدیرِ دفتر را می‌گرفت. قاعدهٔ
   * نسخهٔ قبلی در `domain/access/project-money` است.
   */
  const audience = await moneyAudience(actor, projectId);
  const canSeePrice = canSeeProjectPrice(audience);
  const canSeeFinance = canSeeProjectFinance(audience);

  const [commentRows, qa, files, bids, hours, finance, payments, statusGroup] = await Promise.all([
    repo.listComments(projectId),
    repo.listProjectQa(projectId),
    repo.listAttachments(projectId),
    /**
     * ⚠️ فقط مدیر — نه فقط در UI، در **داده**: پیش از این فهرستِ کاملِ
     * پیشنهادها (با مبلغِ رقبا) برای عضوِ عادی هم لود و به کلاینت پاس
     * می‌شد؛ تبش پنهان بود ولی مبالغ در payload ِ صفحه بودند. نسخهٔ قبلی به
     * عضو فقط پیشنهادِ خودِ او را می‌دهد (`getMemberTender`) — «دیدنِ
     * قیمتِ رقبا یعنی مناقصهٔ بی‌معنا».
     */
    detail.project.isTender && detail.canManage
      ? repo.listBids(projectId)
      : Promise.resolve([]),
    detail.canManage ? repo.memberHours(projectId) : Promise.resolve([]),
    canSeeFinance ? repo.financeSummary(projectId) : Promise.resolve(null),
    canSeeFinance ? repo.listPayments(projectId) : Promise.resolve([]),
    repo.projectStatusGroup(projectId),
  ]);

  /**
   * ⚠️ همان ماسکِ نامِ `getProjectDetail`، اینجا روی کامنت‌ها و چک‌لیستِ QA
   * هم اعمال می‌شود: کارفرمایی که رشتهٔ کامنت‌ها را می‌خواند نباید نامِ
   * نویسنده را ببیند، و عضو نباید نامِ کارفرما را — همان قاعده، همان جا.
   * ساعت‌های کاری فقط برای مدیر خوانده می‌شوند، پس ماسک نمی‌خواهند.
   */
  const mask = (id: number | null, name: string | null) =>
    (id === null || name === null ? name : nameForViewer(id, name, detail.viewer));

  const comments = commentRows.map((c) => ({
    ...c,
    userName: mask(c.userId, c.userName),
    closedByName: mask(c.closedBy, c.closedByName),
  }));
  const maskedQa = qa.map((q) => ({ ...q, doneByName: mask(q.doneBy, q.doneByName) }));
  /**
   * ⚠️ اول فیلترِ مخاطب، بعد ماسکِ نام: کارفرما «پرداخت به عضو» را اصلاً
   * نباید ببیند — نه با نامِ ماسک‌شده. قاعده در `domain/access/project-payments`.
   */
  const maskedPayments = visiblePayments(audience, actor.id, payments)
    .map((p) => ({ ...p, userName: mask(p.userId, p.userName) }));

  /**
   * سه‌حالتیِ حذف فقط برای مدیر خوانده می‌شود — کوئریِ سنگینی است و کاربرِ
   * خواندنی هم دکمه‌اش را نمی‌بیند.
   */
  // ⚠️ از دادهٔ واقعی — با false ِ هاردکد، بنر هرگز «قفل» نمی‌گفت در حالی که حذف رد می‌شد.
  const deleteState = detail.canManage
    ? impactState(await repo.projectImpact(projectId, await repo.openBalances(projectId)))
    : 'clean';

  // نقش ← دارندگانش؛ لازمِ قاعدهٔ «برداشتنِ تسک» در UI و سرور.
  const memberRoleRows = await db
    .select({ roleTagId: projectMembers.roleTagId, userId: projectMembers.userId })
    .from(projectMembers).where(eq(projectMembers.projectId, projectId));

  const roleHolders: Record<number, number[]> = {};
  for (const m of memberRoleRows) {
    if (m.roleTagId === null) continue;
    (roleHolders[m.roleTagId] ??= []).push(m.userId);
  }

  // پورتِ نوارِ «فقط‌خواندنی»: منجمد = بایگانی **یا** لغو/توقف — نه فقط بایگانی.
  const isFrozen = isFrozenProject({ isArchived: detail.project.isArchived, statusGroup });

  /**
   * پورتِ `qa_visible_items`: مدیر همه، عضو فقط آیتم‌های نقش‌های خودش، کارفرما
   * فقط آیتم‌های کارفرمایی (بی‌نقش). پیش از این کلِ چک‌لیست به هر بیننده می‌رفت.
   */
  const myRoleIds = new Set(
    detail.members.filter((m) => m.userId === actor.id && m.roleTagId !== null).map((m) => m.roleTagId!),
  );
  const visibleQa = detail.canManage
    ? maskedQa
    : maskedQa.filter((q) => (q.roleTagId === null ? audience.isClientOfProject : myRoleIds.has(q.roleTagId)));

  // متای جزئیات — پورتِ `kteam-detail-meta`: پیشرفت، ساعتِ من/تیم، والد، زیرپروژه‌ها.
  const [parentTitles, children, progress, myMinutes, teamMinutes] = await Promise.all([
    detail.project.parentId ? repo.projectTitles([detail.project.parentId]) : Promise.resolve(new Map<number, string>()),
    repo.childProjects(projectId),
    repo.taskProgressFor(projectId),
    audience.isMemberOfProject ? repo.userMinutesOn(actor.id, projectId) : Promise.resolve(0),
    detail.canManage ? repo.teamMinutesFor([projectId]) : Promise.resolve(new Map<number, number>()),
  ]);
  const meta = {
    doneTasks: progress.done,
    totalTasks: progress.total,
    /** «ساعت کاری شما» برای عضو؛ وگرنه «ساعت کاری تیم» برای مدیر (عضو مقدم است). */
    myMinutes: audience.isMemberOfProject ? myMinutes : null,
    teamMinutes: !audience.isMemberOfProject && detail.canManage ? (teamMinutes.get(projectId) ?? 0) : null,
    parent: detail.project.parentId
      ? { id: detail.project.parentId, title: parentTitles.get(detail.project.parentId) ?? '' }
      : null,
    children,
  };

  // «معادل (محاسبه)» — ارزشِ هر پرداخت در ارزِ پروژه (پورتِ `Payments::row_value_in`).
  const { source: rates } = await rateSource();
  const countedPayments = maskedPayments.map((p) => ({
    ...p,
    countedValue: detail.project.currencyId && p.currencyId
      ? rowValueIn(rates, {
        amount: p.amount, currencyId: p.currencyId, amountSettled: p.amountSettled, settledCurrencyId: p.settledCurrencyId,
      }, detail.project.currencyId)
      : null,
  }));

  // پورتِ تبِ تیم/مدیریت: ریزِ ثبت‌های ساعت (تازه‌تر اول، سقفِ ۵۰۰) و ماتریسِ دسترس‌پذیریِ اعضا — فقط مدیر.
  const memberPeople = [...new Map(
    detail.members.map((m) => [m.userId, { id: m.userId, name: m.userName ?? `#${m.userId}` }]),
  ).values()];
  const [logs, matrixRows, systemForMatrix] = await Promise.all([
    detail.canManage ? repo.projectLogs(projectId) : Promise.resolve([]),
    detail.canManage ? matrixForIds(memberPeople) : Promise.resolve([]),
    getSystemConfig(),
  ]);
  const order = weekOrder(systemForMatrix.weekStart);
  const todayIdx = weekdayIndex(new Date());
  const matrix = matrixRows.map((r) => ({ id: r.id, name: r.name, roles: r.roleNames, cells: rowCells(r, order, todayIdx) }));
  const dayLabels = order.map((d) => WEEKDAYS[d]!);

  // پورتِ `QA::project_tasks`: تسکِ ساخته‌شده از آیتمِ تسک‌ساز با عنوان پیدا می‌شود (مثلِ `find_task_item`).
  const qaWithTasks = visibleQa.map((q) => {
    if (q.isTask !== true) return { ...q, taskId: null, taskStatusName: null, taskStatusColor: null };
    const task = detail.tasks.find((t) => t.title === q.title);
    return { ...q, taskId: task?.id ?? null, taskStatusName: task?.statusName ?? null, taskStatusColor: task?.statusColor ?? null };
  });

  // کدِ ارزِ پروژه — تبِ مالی مبالغ را با واحد نشان می‌دهد (پورتِ `Money::format`).
  const currencyCode = detail.project.currencyId
    ? (await db.select({ code: currencies.code }).from(currencies).where(eq(currencies.id, detail.project.currencyId)))[0]?.code ?? null
    : null;

  // نام و گروهِ وضعیتِ پروژه برای کنترلِ وضعیتِ هدر (پورتِ `project_status_control`).
  const statusName = detail.project.statusTagId
    ? (await repo.statusTags()).find((tag) => tag.id === detail.project.statusTagId)?.name ?? null
    : null;

  return {
    ...detail,
    currencyCode,
    logs,
    matrix,
    dayLabels,
    isFrozen,
    statusGroup,
    statusName,
    meta,
    roleHolders,
    currentUserId: actor.id,
    comments,
    qa: qaWithTasks,
    files,
    bids,
    hours,
    finance,
    payments: countedPayments,
    canSeeFinance,
    /**
     * ⚠️ به کلاینت **پاس داده می‌شود تا رندر گارد شود**، ولی خودِ عدد هم
     * فقط وقتی می‌رود که حق دیدنش باشد: پنهان‌کردن با CSS یعنی قیمت در
     * payload ِ صفحه بماند و با View Source خوانده شود.
     */
    canSeePrice,
    tenderIsOpen: tenderIsOpen(detail.project.isTender, statusGroup),
    /** «کار کردن» روی پروژه — تیکِ کامنت و یادداشت برای عضو/کارفرما، نه بینندهٔ فقط‌خواندنی. */
    canInteract: await canInteractWithProject(actor, projectId),
    deleteState,
  };
}

/**
 * گزینه‌های وضعیتِ تسک برای هر کسی که روی پروژه «کار می‌کند» — پورتِ dropdown ِ
 * همهٔ بینندگان (عضو تسکش را به «نیاز به ریویو» می‌فرستد). بدونِ مجوزِ سراسری.
 */
export async function taskStatusOptionsFor(actor: Actor, projectId: number) {
  await getProject(actor, projectId);
  await assertCanInteractWithProject(actor, projectId);
  return repo.taskStatusTags();
}

/** تغییرِ وضعیتِ تسک از تبِ تسک‌ها — قرینهٔ `setProjectStatus`. */
export async function setTaskStatus(actor: Actor, taskId: number, statusTagId: number | null) {
  const task = await repo.getTask(taskId);
  if (!task) throw new NotFoundError();
  await getProject(actor, task.projectId); // گاردِ scope
  // ⚠️ «کار کردن» نه «دیدن»: همکارِ فقط‌خواندنی (projects.view) وضعیتِ تسک را عوض نمی‌کند.
  await assertCanInteractWithProject(actor, task.projectId);
  const managesTask = await canManageProject(actor, task.projectId);

  /**
   * ⚠️ پورتِ `ajax_task_status`: هر کسی که به پروژه دسترسی دارد می‌تواند
   * وضعیتِ تسکِ **دیدنی** را عوض کند — عضو تسکش را به ریویو می‌فرستد.
   * پیش از این `assertCanManageProject` بود، یعنی عضو حتی تسکِ خودش را هم
   * نمی‌توانست جابه‌جا کند و کلِ چرخهٔ ریویو فقط برای مدیر کار می‌کرد.
   * تسکِ خصوصی همان قاعدهٔ R-PROJ-14 را دارد: سازنده/مسئول/مدیرِ **همین پروژه**.
   */
  const [visible] = filterVisibleFor(actor, [task], managesTask);
  if (!visible) throw new NotFoundError();

  /**
   * ⚠️ این گارد **نبود**: پروژهٔ منجمد هر نوشتنِ دیگری را رد می‌کند، ولی
   * وضعیتِ تسک از کنارش رد می‌شد — و چون این مسیر عمداً فقط «دیدن» را
   * می‌خواهد، هر عضو یا کارفرمایی می‌توانست روی پروژهٔ بایگانی بنویسد.
   */
  await assertNotFrozen(task.projectId, actor);

  const nextTag = statusTagId === null ? null : await repo.getTag(statusTagId);
  if (statusTagId !== null) {
    // R-PROJ-25 (قرینه) — تگ باید از نوعِ وضعیتِ **تسک** باشد.
    if (!nextTag || nextTag.type !== 'task_status') throw new NotFoundError();
  }
  // پورتِ `is_done`: پرچمِ بسته یا گروهِ complete.
  const nextDone = nextTag !== null && (nextTag.isClosed || nextTag.statusGroup === 'complete');

  // پورتِ `set_status_tag`: `updated_by` هم مهر می‌خورد («آخرین ویرایش توسط» کهنه نماند).
  await db.update(tasks)
    .set({ statusTagId, updatedAt: new Date(), updatedBy: actor.id })
    .where(eq(tasks.id, taskId));

  await audit(actor, 'task.status', task.projectId, task.statusTagId, statusTagId);

  /**
   * دو اعلانِ قرینه — پورتِ `task_review` و `task_back`.
   *
   * ⚠️ ملاک **ورود به** و **خروج از** حالتِ ریویو است، نه خودِ تگ: تغییر بینِ
   * دو وضعیتِ ریویو اعلانِ تکراری نمی‌فرستد.
   */
  const [wasReview, isReview] = await Promise.all([
    task.statusTagId === null ? Promise.resolve(false) : repo.isReviewTag(task.statusTagId),
    statusTagId === null ? Promise.resolve(false) : repo.isReviewTag(statusTagId),
  ]);

  if (!wasReview && isReview) {
    await notify(await reviewRecipients(task.projectId, actor.id), {
      type: 'task.review',
      title: 'تسکی نیاز به بررسی دارد',
      body: task.title,
      url: `/projects/${task.projectId}`,
    });
  } else if (wasReview && !isReview && !nextDone) {
    // ⚠️ فقط وقتی کار **برمی‌گردد**؛ تأیید (ریویو → انجام‌شده) اعلانِ «برگشت» ندارد (پورتِ افزونه).
    // ⚠️ گیرنده «انجام‌دهنده» است، نه مدیر: کارِ برگشتی دستِ اوست.
    const doers = (await taskDoerIds(taskId)).filter((id) => id !== actor.id);
    await notify(doers, {
      type: 'task.back',
      title: 'تسکِ شما برای ادامهٔ کار برگشت',
      body: task.title,
      url: `/projects/${task.projectId}`,
    });
  }

  return task.projectId;
}

/**
 * تیکِ وضعیتِ کامنت — R-PROJ-27: حالتِ بسته به نوعِ رشته بستگی دارد و
 * «انجام شد توسط X» فقط هنگامِ بستن مهر می‌خورد.
 */
export async function toggleCommentStatus(actor: Actor, commentId: number) {
  const row = await repo.getComment(commentId);
  if (!row || row.projectId === null) throw new NotFoundError();
  await getProject(actor, row.projectId); // گاردِ scope
  // ⚠️ هر شرکت‌کننده (عضو/کارفرما/مدیر) تیک می‌زند — پورتِ `handle_comment_status`؛ و قفلِ انجماد.
  await assertCanInteractWithProject(actor, row.projectId);
  await assertNotFrozen(row.projectId, actor);

  const next = toggleStatus(row.type as CommentType, row.status);
  await db.update(comments)
    .set({
      status: next.status,
      closedBy: next.stampCloser ? actor.id : null,
      closedAt: next.stampCloser ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(comments.id, commentId));

  await audit(actor, 'comment.status', row.projectId, row.status, next.status);
  return row.projectId;
}

/** افزودنِ کامنت به پروژه. */
export async function addComment(
  actor: Actor,
  projectId: number,
  body: string,
  type: 'comment' | 'review' = 'comment',
  parentId: number | null = null,
) {
  // عضو و کارفرمای پروژه هم کامنت می‌گذارند (مخاطبِ comment_added ِ نسخهٔ قبلی).
  await assertCanInteractWithProject(actor, projectId);
  await getProject(actor, projectId); // گاردِ scope
  // ⚠️ پروژهٔ منجمد فقط-خواندنی است (`block_if_frozen`).
  await assertNotFrozen(projectId, actor);

  const text = body.trim();
  if (text === '') throw new ForbiddenError('comment.empty');

  // پاسخ (پورتِ `parent_id`): والد باید از همین پروژه و همین رشته باشد.
  if (parentId !== null) {
    const parent = await repo.getComment(parentId);
    if (!parent || parent.projectId !== projectId || parent.type !== type) throw new NotFoundError();
  }

  await db.insert(comments).values({
    projectId,
    userId: actor.id,
    parentId,
    // پورتِ `render_thread($type)`: رشتهٔ «بازبینی» جدا از «کامنت» است.
    type,
    // ⚠️ پاسخِ تازه با «نیازمند بررسی» می‌آید — وضعیتِ رشته از تازه‌ترین پیام است، پس رشتهٔ بسته باز می‌شود.
    status: OPEN_STATUS,
    body: text,
  });
  await audit(actor, 'comment.add', projectId, null, { length: text.length });

  /**
   * پورتِ `comment_added`: مدیران + مدیرانِ دفترِ پروژه + اعضا + کارفرمایان،
   * منهای نویسنده.
   *
   * ⚠️ کارفرما هم گیرنده است — کامنت گفت‌وگوی پروژه است، نه یادداشتِ داخلی.
   */
  const project = await repo.getProject(projectId);
  await notify(await commentRecipients(projectId, actor.id), {
    type: 'comment',
    // ⚠️ عنوان **ثابت** است تا کلیدِ ترجمه بماند؛ دادهٔ متغیر در بدنه
    // می‌نشیند (R-NOTIF-06). همین الگو در بقیهٔ اعلان‌ها هم هست.
    title: type === 'review' ? 'بازبینیِ جدید در پروژه' : 'کامنت جدید در پروژه',
    body: `«${project?.title ?? ''}» — ${text.slice(0, 140)}`,
    url: `/projects/${projectId}`,
  });
}

/** بایگانی/خروج از بایگانی — `ajax_archive_toggle`. */
export async function setArchived(actor: Actor, projectId: number, archived: boolean) {
  const before = await getProject(actor, projectId);
  await assertCanManageProject(actor, projectId);

  await db.update(projects)
    .set({ isArchived: archived, updatedAt: new Date() })
    .where(eq(projects.id, projectId));

  await audit(actor, 'project.archive', projectId, before.isArchived, archived);
}

/** وضعیت‌های تسک — انتخابگرِ تبِ تسک‌ها. */
/**
 * ⚠️ با `projectId` گاردِ **پروژه‌ای** است، نه سراسری: مدیرِ دفتر و مدیرِ پروژهٔ
 * تگ‌دار مجوزِ سراسریِ `projects.view` ندارند ولی صفحهٔ پروژه برایشان
 * گزینه‌های وضعیت را می‌خواند. با گاردِ سراسری، بازکردنِ هر پروژه‌ای که
 * مدیریتش می‌کردند صفحهٔ خطا می‌داد.
 */
export async function getTaskStatusOptions(actor: Actor, projectId?: number) {
  if (projectId === undefined) assertCanView(actor, 'projects');
  else await assertCanViewProject(actor, projectId);
  return repo.taskStatusTags();
}

export interface TaskInput {
  title: string;
  description: string;
  statusTagId: number | null;
  priorityTagId: number | null;
  assignedTo: number | null;
  dueDate: string | null;
  isPrivate: boolean;
  /** «وابسته به» — تسکِ دیگری از همین پروژه (پورتِ `depends_on`). */
  dependsOn?: number | null;
  /**
   * تسکِ **نقشی** — هر کس آن نقش را روی پروژه داشته باشد آن را می‌بیند.
   * ⚠️ مسئولِ مشخص ندارد تا کسی بتواند «برش دارد» (R-CLAIM).
   */
  roleTagIds?: number[];
}

/** «وابسته به» — فقط تسکِ همین پروژه و نه خودش (پورتِ انتخابگرِ `depends_on`). */
async function validDependency(projectId: number, dependsOn: number | null, selfId: number | null): Promise<number | null> {
  if (!dependsOn || dependsOn === selfId) return null;
  const dep = await repo.getTask(dependsOn);
  return dep && dep.projectId === projectId ? dep.id : null;
}

/** گزینه‌های فرمِ تسک — مسئول، وضعیت، اولویت. */
export async function getTaskFormOptions(actor: Actor, projectId: number, currentAssignee?: number | null) {
  await getProject(actor, projectId);
  /**
   * ⚠️ **دسترسی**، نه مدیریت — قرینهٔ `createTask`. اگر اینجا گاردِ مدیریت
   * می‌ماند و صفحه فرم را برای کارفرما می‌خواست، این پرتاب از یک کامپوننتِ
   * سرور **بیرونِ** try/catch ِ صفحه می‌آمد و کلِ صفحهٔ پروژه ۵۰۰ می‌شد،
   * نه اینکه فقط دکمه پنهان بماند. سه گارد باید با هم حرکت کنند.
   */
  await assertCanInteractWithProject(actor, projectId);

  const [members, clientIds, inactive, statuses, priorities, allTasks] = await Promise.all([
    repo.listMembers(projectId),
    repo.listClientIds(projectId),
    repo.inactiveUserIds(),
    repo.taskStatusTags(),
    repo.taskPriorityTags(),
    repo.listTasks(projectId),
  ]);
  // گزینه‌های «وابسته به» — فقط تسک‌هایی که خودِ بیننده می‌بیند.
  const dependencyOptions = filterVisibleFor(actor, allTasks, await canManageProject(actor, projectId))
    .map((t) => ({ id: t.id, title: t.title }));

  const clientNames = await repo.userNames([...clientIds]);

  /**
   * ⚠️ کارفرمای خالص تسک را فقط به **نقش** می‌دهد، نه به شخص — پورتِ
   * `if (! $client_view)` در `assign_options_html()`. نامِ اعضا اصلاً به او
   * نمی‌رسد، پس فهرستِ اشخاص هم نباید ساخته شود.
   */
  const viewer = await viewerContext(
    actor,
    projectId,
    await canManageProject(actor, projectId),
    members,
  );

  return {
    /**
     * نقش‌های این پروژه — تنها راهِ تخصیصِ کارفرما، و برای بقیه جایگزینِ
     * «به هرکس که این نقش را دارد».
     */
    roles: [...new Map(members
      .filter((m) => m.roleTagId !== null)
      .map((m) => [m.roleTagId!, { id: m.roleTagId!, name: m.roleName ?? FALLBACK_MEMBER_LABEL }]),
    ).values()],
    assignees: assignableToPeople(viewer)
      ? assigneeOptions(
        // ⚠️ ماسکِ نام اینجا هم لازم است: عضوِ خالص نامِ واقعیِ کارفرما را در
        // فهرستِ انتساب می‌دید — همان یک جایی که قاعدهٔ ماسک برایش نوشته شده.
        members.map((m) => ({ userId: m.userId, name: nameForViewer(m.userId, m.userName, viewer), roleName: m.roleName })),
        [...clientIds].map((id) => ({
          userId: id, name: nameForViewer(id, clientNames.get(id) ?? String(id), viewer), isClient: true,
        })),
        { inactiveUserIds: inactive, currentAssignee },
        await getT(),
      )
      : [],
    statuses,
    priorities,
    tasks: dependencyOptions,
  };
}

/**
 * افزودنِ تسک به پروژه.
 *
 * ⚠️ `silent` برای تسک‌های **اولیهٔ** هنگامِ ساختِ پروژه است: بدونِ آن، ساختنِ
 * یک پروژه با ده تسک، ده اعلانِ پشتِ‌سرِ هم می‌فرستد — همان چیزی که نسخهٔ قبلی
 * با پرچمِ `silent` جلویش را می‌گیرد.
 */
export async function createTask(
  actor: Actor,
  projectId: number,
  input: TaskInput,
  options: { silent?: boolean } = {},
): Promise<number> {
  const project = await getProject(actor, projectId);
  /**
   * ⚠️ گاردْ **دسترسی** است نه **مدیریت** — پورتِ `handle_add_task()` که فقط
   * `user_can_access()` را می‌خواهد. عضو و کارفرمای پروژه هم تسک می‌سازند؛
   * کارفرما آن را به یک نقش می‌دهد، نه به شخص.
   *
   * ⚠️ آنچه با بازشدنِ این گارد **باید** بسته می‌شد، پایین‌تر است: پیش از
   * این `assignedTo`، `priorityTagId` و `roleTagIds` خام درج می‌شدند. تا
   * وقتی فقط مدیر به فرم می‌رسید این بی‌دقتی بود؛ حالا راهِ سوءاستفاده بود.
   */
  await assertCanInteractWithProject(actor, projectId);
  await assertNotFrozen(projectId, actor);

  const canManage = await canManageProject(actor, projectId);
  await assertTaskTags(input);
  // وضعیتِ پیش‌فرض — اولین تگِ گروهِ `todo` (`default_status_tag_id`)؛ تسکِ بی‌وضعیت چیپِ خالی داشت.
  const statusTagId = input.statusTagId ?? defaultTaskStatusId(await repo.taskStatusTags());

  /**
   * ⚠️ تخصیص از دامنه می‌گذرد: شخص باید روی پروژه باشد، نقش باید تگِ
   * `member_role` باشد، و شخص نقش‌ها را پاک می‌کند. برای کارفرمای خالص
   * `rolesOnly` است — در UI فقط نقش می‌بیند، ولی درخواست را می‌شود دستی
   * ساخت و شناسهٔ یک عضوِ واقعی را گذاشت. نسخهٔ قبلی همین‌جا سوراخ است
   * (`parse_assignment` فقط عضویتِ **هدف** را می‌سنجد، نه نقشِ فرستنده).
   */
  const assignment = await resolveTaskAssignment(actor, projectId, canManage, input);

  const rows = await db.insert(tasks).values({
    projectId,
    title: input.title,
    description: input.description,
    statusTagId,
    priorityTagId: input.priorityTagId,
    assignedTo: assignment.assignedTo,
    dueDate: input.dueDate,
    dependsOn: await validDependency(projectId, input.dependsOn ?? null, null),
    /**
     * ⚠️ «خصوصی» فقط از مدیر پذیرفته می‌شود. `canSeePrivateRecord` به مجوزِ
     * **سراسری** برمی‌گردد، پس تسکی که کارفرما خصوصی کند حتی مدیرِ خودِ
     * پروژه هم نمی‌بیند — و چون سازنده‌اش هم نمی‌تواند پاکش کند، برای همیشه
     * می‌ماند.
     */
    isPrivate: canManage ? input.isPrivate : false,
    createdBy: actor.id,
    scope: project.scope,
  }).returning({ id: tasks.id });

  const id = rows[0]!.id;

  if (assignment.roleTagIds.length > 0) {
    await db.insert(taskRoles).values(
      assignment.roleTagIds.map((roleTagId: number) => ({ taskId: id, roleTagId })),
    ).onConflictDoNothing();
  }

  await audit(actor, 'task.create', projectId, null, input);

  /**
   * R-NOTIF-01 — مسئولِ مستقیم، و اگر تسک **نقشی** است دارندگانِ آن نقش.
   *
   * ⚠️ دارندگانِ نقش اضافه شدند چون بدونشان تسکی که کارفرما می‌سازد به
   * هیچ‌کس نمی‌رسید: کارفرما به شخص تخصیص نمی‌دهد، پس شرطِ `assignedTo`
   * هرگز برقرار نمی‌شد و کار در فهرست می‌ماند بی‌آنکه کسی خبردار شود.
   */
  if (!options.silent) {
    const targets = assignment.assignedTo !== null
      ? [assignment.assignedTo]
      : await repo.usersWithRolesOnProject(projectId, assignment.roleTagIds);

    const recipients = targets.filter((userId) => userId !== actor.id);
    if (recipients.length > 0) {
      await notify(recipients, {
        type: 'task.assigned',
        title: 'تسکِ تازه به شما تخصیص یافت',
        body: input.title,
        url: `/projects/${projectId}`,
      });
    }
  }
  return id;
}

/**
 * تگ‌های تسک از نوعِ درست‌اند؟
 *
 * ⚠️ `priorityTagId` پیش از این **هیچ** بررسی‌ای نداشت (فقط وضعیت داشت)، پس
 * هر شناسهٔ تگی — نقشِ عضو، دفتر، دستهٔ دفترکل — در جای اولویت می‌نشست و
 * نامش به‌عنوانِ اولویت به همهٔ بینندگان نشان داده می‌شد.
 */
async function assertTaskTags(input: TaskInput): Promise<void> {
  if (input.statusTagId !== null) {
    const tag = await repo.getTag(input.statusTagId);
    if (!tag || tag.type !== 'task_status') throw new NotFoundError();
  }
  if (input.priorityTagId !== null) {
    const tag = await repo.getTag(input.priorityTagId);
    if (!tag || tag.type !== 'task_priority') throw new NotFoundError();
  }
}

/** واقعیت‌های لازم برای `resolveAssignment`، از دیتابیس. */
async function resolveTaskAssignment(
  actor: Actor,
  projectId: number,
  canManage: boolean,
  input: TaskInput,
) {
  const [members, clientIds, roleTags] = await Promise.all([
    repo.listMembers(projectId),
    repo.listClientIds(projectId),
    repo.memberRoleTags(),
  ]);
  const viewer = await viewerContext(actor, projectId, canManage, members);

  return resolveAssignment(
    { assignedTo: input.assignedTo, roleTagIds: input.roleTagIds ?? [] },
    {
      projectUserIds: new Set([...members.map((m) => m.userId), ...clientIds]),
      memberRoleTagIds: new Set(roleTags.map((r) => r.id)),
      rolesOnly: !assignableToPeople(viewer),
    },
  );
}

/** ویرایشِ تسک. */
export async function updateTask(actor: Actor, taskId: number, input: TaskInput): Promise<number> {
  const before = await repo.getTask(taskId);
  if (!before) throw new NotFoundError();
  await getProject(actor, before.projectId);

  /**
   * ⚠️ «مدیرِ پروژه **یا** سازندهٔ تسک» — پورتِ `may_edit` ِ نسخهٔ قبلی.
   * بدونِ شاخهٔ دوم، کارفرمایی که تازه اجازهٔ ساختِ تسک گرفته نمی‌توانست
   * غلطِ تایپیِ خودش را هم درست کند و ردیف تا ابد می‌ماند.
   */
  const canManage = await canManageProject(actor, before.projectId);
  if (!canManage && before.createdBy !== actor.id) {
    throw new ForbiddenError('projects.manage');
  }
  // ⚠️ پروژهٔ منجمد ویرایش نمی‌شود — این گارد اینجا **نبود**، برخلافِ حذف.
  await assertNotFrozen(before.projectId, actor);
  await assertTaskTags(input);

  const assignment = await resolveTaskAssignment(actor, before.projectId, canManage, input);

  await db.update(tasks).set({
    title: input.title,
    description: input.description,
    statusTagId: input.statusTagId,
    priorityTagId: input.priorityTagId,
    /**
     * ⚠️ سازنده‌ای که مدیر نیست، مسئول و «خصوصی» را دست نمی‌زند: اینها
     * تصمیمِ مدیریتی‌اند و باز گذاشتنشان همان دو رخنه‌ای بود که در ساخت
     * بسته شد، فقط یک گام دیرتر.
     */
    assignedTo: canManage ? assignment.assignedTo : before.assignedTo,
    dueDate: input.dueDate,
    dependsOn: await validDependency(before.projectId, input.dependsOn ?? null, taskId),
    isPrivate: canManage ? input.isPrivate : before.isPrivate,
    updatedBy: actor.id,
    updatedAt: new Date(),
  }).where(eq(tasks.id, taskId));

  /**
   * نقش‌های تسک — پورتِ `Tasks::set_roles()`: مجموعه جایگزین می‌شود ولی
   * `claimed_by` ِ نقش‌هایی که می‌مانند حفظ می‌شود (فقط تازه‌ها درج و رفته‌ها
   * حذف می‌شوند). تا پیش از این ویرایش هرگز `task_roles` را نمی‌نوشت: نقشِ
   * تسک بعد از ساخت غیرقابلِ تغییر بود و هر تیکِ فرمِ ویرایش بی‌صدا می‌افتاد.
   * ⚠️ فقط مدیر — نقش‌دهی تصمیمِ مدیریتی است، مثلِ مسئولِ مستقیم.
   */
  if (canManage) {
    const next = assignment.roleTagIds;
    await db.transaction(async (tx) => {
      if (next.length === 0) {
        await tx.delete(taskRoles).where(eq(taskRoles.taskId, taskId));
      } else {
        await tx.delete(taskRoles).where(and(eq(taskRoles.taskId, taskId), notInArray(taskRoles.roleTagId, next)));
        await tx.insert(taskRoles).values(next.map((roleTagId) => ({ taskId, roleTagId }))).onConflictDoNothing();
      }
    });
  }

  await audit(actor, 'task.update', before.projectId, before, input);

  /**
   * پورتِ `task_assignment_changed` — فقط کسانی که **تازه** مسئول شده‌اند.
   *
   * ⚠️ محاسبه روی «انجام‌دهندگان» است نه فقط `assigned_to`: تسکِ نقشی مسئولِ
   * مستقیم ندارد و برداشتنِ مسئولِ مستقیم عملاً کار را به صاحبانِ نقش
   * می‌سپارد. خودِ ویرایش‌کننده هم کنار می‌رود.
   */
  const beforeDoers = before.assignedTo ? [before.assignedTo] : await taskDoerIds(taskId);
  const afterDoers = input.assignedTo ? [input.assignedTo] : await taskDoerIds(taskId);
  const fresh = assignmentDelta({
    after: afterDoers, before: beforeDoers, editorId: actor.id,
  });

  if (fresh.length > 0) {
    await notify(fresh, {
      type: 'task.assigned',
      title: 'تسک به شما محول شد',
      body: input.title,
      url: `/projects/${before.projectId}`,
    });
  }

  return before.projectId;
}

/**
 * حذفِ تسک — نرم، نه سخت.
 * گفتگو و ساعتِ کاریِ مرتبط می‌مانند؛ حذفِ سخت آن‌ها را هم می‌برد.
 */
export async function deleteTask(actor: Actor, taskId: number): Promise<number> {
  const task = await repo.getTask(taskId);
  if (!task) throw new NotFoundError();
  await getProject(actor, task.projectId);
  /**
   * ⚠️ «مدیرِ پروژه **یا** سازنده» — همان قاعدهٔ `updateTask`. اگر فقط
   * مدیر می‌ماند، کارفرمایی که تسکِ اشتباهی ساخته راهی برای پس‌گرفتنش
   * نداشت.
   */
  if (!(await canManageProject(actor, task.projectId)) && task.createdBy !== actor.id) {
    throw new ForbiddenError('projects.manage');
  }
  await assertNotFrozen(task.projectId, actor);

  await db.update(tasks)
    .set({ deletedAt: new Date(), updatedBy: actor.id })
    .where(eq(tasks.id, taskId));

  await audit(actor, 'task.delete', task.projectId, task, null);
  return task.projectId;
}

/** یادداشتِ گفتگوی تسک. */
export async function addTaskNote(actor: Actor, taskId: number, body: string): Promise<number> {
  const task = await repo.getTask(taskId);
  if (!task) throw new NotFoundError();
  await getProject(actor, task.projectId);
  // ⚠️ پورتِ گاردِ یادداشت: دسترسیِ کاری + دیدنِ تسکِ خصوصی — نه هر بیننده‌ای.
  await assertCanInteractWithProject(actor, task.projectId);
  const [noteVisible] = filterVisibleFor(actor, [task], await canManageProject(actor, task.projectId));
  if (!noteVisible) throw new NotFoundError();
  await assertNotFrozen(task.projectId, actor);

  const text = body.trim();
  if (text === '') throw new ForbiddenError('note.empty');

  await db.insert(comments).values({
    projectId: task.projectId,
    taskId,
    userId: actor.id,
    type: 'task_note',
    status: OPEN_STATUS,
    body: text,
  });
  await audit(actor, 'task.note', task.projectId, null, { taskId });
  return task.projectId;
}

/** جزئیاتِ یک تسک + گفتگویش — برای مودالِ تسک. */
export async function getTaskDetail(actor: Actor, taskId: number) {
  const task = await repo.getTaskFull(taskId);
  if (!task) throw new NotFoundError();
  await getProject(actor, task.projectId); // مجوزی یا عضویتی — هر دو راه.

  const canManage = await canManageProject(actor, task.projectId);
  // R-PROJ-14 — تسکِ خصوصی فقط برای سازنده، مسئول و مدیرانِ **همین پروژه**.
  const [visible] = filterVisibleFor(actor, [task], canManage);
  if (!visible) throw new NotFoundError();
  // یادداشت‌نویسی «کار کردن» است: همکارِ فقط‌خواندنی فرمش را نمی‌بیند.
  const canInteract = await canInteractWithProject(actor, task.projectId);
  const [notes, roles, members, dependency] = await Promise.all([
    repo.taskNotes(taskId),
    repo.taskRolesFor([taskId]),
    repo.listMembers(task.projectId),
    task.dependsOn ? repo.getTask(task.dependsOn) : Promise.resolve(null),
  ]);
  // «برمی‌دارم» در مودال (پورتِ `can_claim`): دارندگانِ هر نقش از اعضای پروژه.
  const holders = new Map<number, number[]>();
  for (const m of members) {
    if (m.roleTagId === null) continue;
    holders.set(m.roleTagId, [...(holders.get(m.roleTagId) ?? []), m.userId]);
  }
  const claimable = canClaimTask({
    assignedTo: task.assignedTo,
    roles: roles.filter((r) => r.roleTagId !== null).map((r) => ({ roleTagId: r.roleTagId!, claimedBy: r.claimedBy })),
    roleHolders: holders,
    userId: actor.id,
  });

  /**
   * ⚠️ این تنها مسیرِ خواندن بود که ماسکِ نام را **نداشت** — یعنی کارفرما
   * با بازکردنِ هر تسکی نامِ واقعیِ اعضا را می‌دید، دقیقاً همان چیزی که
   * `viewer-names` همه‌جای دیگر جلویش را می‌گیرد. مسئول، آخرین ویرایشگر و
   * نویسندهٔ هر یادداشت، هر سه.
   */
  const viewer = await viewerContext(actor, task.projectId, canManage, members);
  const mask = (id: number | null, name: string | null) =>
    (id === null || name === null ? name : nameForViewer(id, name, viewer));

  return {
    task: {
      ...task,
      assigneeName: mask(task.assignedTo, task.assigneeName),
      updatedByName: mask(task.updatedBy, task.updatedByName),
    },
    notes: notes.map((n) => ({ ...n, userName: mask(n.userId, n.userName) })),
    roles: roles.map((r) => ({ ...r, claimedByName: mask(r.claimedBy, r.claimedByName) })),
    /** عنوانِ تسکِ وابسته — فقط اگر خودِ بیننده آن را می‌بیند. */
    dependsOnTitle: dependency && filterVisibleFor(actor, [dependency], canManage).length > 0 ? dependency.title : null,
    claimable: claimable && canInteract,
    canManage,
    canInteract,
  };
}

/** کتابخانهٔ QA + آنچه روی این پروژه اعمال شده — فرمِ «افزودن چک‌لیست». */
export async function getQaForm(actor: Actor, projectId: number) {
  await getProject(actor, projectId);
  await assertCanManageProject(actor, projectId);

  const [library, applied, roles] = await Promise.all([
    repo.qaLibrary(),
    repo.appliedQaItemIds(projectId),
    repo.memberRoleTags(),
  ]);

  return { library, appliedIds: [...applied], roles };
}

/**
 * اعمالِ چک‌لیستِ QA بر نقش‌های انتخاب‌شده.
 * قاعده‌هایش در `planQaApply` است و تست دارد.
 */
export async function applyQa(actor: Actor, projectId: number, audiences: QaAudience[]) {
  const project = await getProject(actor, projectId);
  await assertCanManageProject(actor, projectId);

  const [library, applied, primaryClientId] = await Promise.all([
    repo.qaLibrary(),
    repo.appliedQaItemIds(projectId),
    // کارفرمای اصلی = قدیمی‌ترین انتساب — نه کوچک‌ترین شناسهٔ کاربر.
    repo.primaryClientId(projectId),
  ]);

  const plan = planQaApply(library, audiences, {
    appliedItemIds: applied,
    primaryClientId,
  });
  if (plan.entries.length === 0) return { added: 0 };

  await db.transaction(async (tx) => {
    for (const entry of plan.entries) {
      if (entry.kind === 'checklist') {
        await tx.insert(projectQa).values({
          projectId,
          qaItemId: entry.item.id,
          roleTagId: entry.item.roleTagId > 0 ? entry.item.roleTagId : null,
          title: entry.item.title,
          isDone: false,
        });
        continue;
      }

      const rows = await tx.insert(tasks).values({
        projectId,
        title: entry.item.title,
        description: entry.item.description,
        createdBy: actor.id,
        assignedTo: entry.kind === 'client_task' ? entry.assignUserId : null,
        scope: project.scope,
        // ⚠️ ردِ آیتمِ مبدأ — بدونِ آن، اعمالِ دوبارهٔ همین نقش تسکِ تکراری
        // می‌سازد، چون آیتمِ تسک‌ساز در «قبلاً اعمال‌شده» دیده نمی‌شود.
        qaItemId: entry.item.id,
      }).returning({ id: tasks.id });

      // تسکِ نقشی به **نقش** تخصیص می‌یابد، نه به شخص.
      if (entry.kind === 'task') {
        await tx.insert(taskRoles).values({ taskId: rows[0]!.id, roleTagId: entry.assignRoleTagId });
      }
    }
  });

  await audit(actor, 'qa.apply', projectId, null, { audiences, added: plan.entries.length });
  return { added: plan.entries.length };
}

/** تیکِ آیتمِ چک‌لیست — «انجام‌شده توسط X» فقط هنگامِ تیک‌زدن مهر می‌خورد. */
export async function toggleQaItem(actor: Actor, qaId: number) {
  const row = await repo.getProjectQa(qaId);
  if (!row) throw new NotFoundError();
  await getProject(actor, row.projectId);

  /**
   * پورتِ `handle_qa_toggle` — سه راه، به همان ترتیب:
   *   ۱. مدیرِ پروژه (سراسری یا پروژه‌محور)
   *   ۲. عضوی که **همان نقش** را روی این پروژه دارد
   *   ۳. آیتمِ کارفرمایی (سنتینلِ ۰) و کاربر کارفرمای همین پروژه است
   *
   * ⚠️ پیش از این فقط راهِ ۱ بود — یعنی نه عضو می‌توانست چک‌لیستِ نقشِ
   * خودش را تیک بزند نه کارفرما آیتمِ کارفرمایی را؛ کلِ قابلیتِ
   * «QA ِ کارفرما» (R-QA-02) عملاً خاموش بود.
   */
  const allowed = await canManageProject(actor, row.projectId)
    || await (async () => {
      const relation = await projectRelation(actor.id, row.projectId);
      // ⚠️ سنتینلِ کارفرما (۰) هنگامِ ذخیره به NULL نگاشت می‌شود — ردیفِ
      // بی‌نقش یعنی آیتمِ کارفرمایی، نه آیتمِ بی‌صاحب.
      if (row.roleTagId === null) return relation.isClient;
      return relation.roleTagIds.includes(row.roleTagId);
    })();
  if (!allowed) throw new ForbiddenError('qa.toggle');

  const next = qaToggle(row.isDone);
  await db.update(projectQa).set({
    isDone: next.isDone,
    doneBy: next.stampDoer ? actor.id : null,
    doneAt: next.stampDoer ? new Date() : null,
    updatedAt: new Date(),
  }).where(eq(projectQa.id, qaId));

  await audit(actor, 'qa.toggle', row.projectId, row.isDone, next.isDone);
  return row.projectId;
}

/**
 * تأییدِ پیشنهادِ مناقصه.
 * برندهٔ قبلیِ همان نقش کنار می‌رود و برندهٔ نو روی پروژه ساین می‌شود.
 */
export async function approveBid(actor: Actor, bidId: number) {
  const bid = await repo.getBid(bidId);
  if (!bid) throw new NotFoundError();
  const project = await getProject(actor, bid.projectId);
  await assertCanManageProject(actor, bid.projectId);

  const [allBids, statusGroup] = await Promise.all([
    repo.projectBids(bid.projectId),
    repo.projectStatusGroup(bid.projectId),
  ]);
  const plan = planApproveBid(bid, allBids, {
    isOpen: tenderIsOpen(project.isTender, statusGroup),
    projectCurrencyId: project.currencyId,
  });

  if (plan.action === 'locked') throw new ForbiddenError('tender.closed');
  if (plan.action === 'noop') return { changed: false };

  // پورتِ `approve` → `add_member`: عضوِ غیرفعال امضا نمی‌شود؛ تازه‌وارد خبردار می‌شود.
  const [inactive, membersBefore] = await Promise.all([repo.inactiveUserIds(), repo.listMembers(bid.projectId)]);
  if (inactive.has(plan.sign.userId)) throw new ForbiddenError('member.inactive');
  const wasMember = membersBefore.some((m) => m.userId === plan.sign.userId);

  await db.transaction(async (tx) => {
    if (plan.unseat) {
      await tx.delete(projectMembers).where(and(
        eq(projectMembers.projectId, bid.projectId),
        eq(projectMembers.userId, plan.unseat.userId),
        eq(projectMembers.roleTagId, bid.roleTagId),
      ));
      await tx.update(tenderBids)
        .set({ status: 'pending', updatedAt: new Date() })
        .where(eq(tenderBids.id, plan.unseat.bidId));
    }

    await tx.insert(projectMembers).values({
      projectId: bid.projectId,
      userId: plan.sign.userId,
      roleTagId: plan.sign.roleTagId,
      agreedAmount: plan.sign.amount,
      unitRate: '0',
      currencyId: plan.sign.currencyId,
    }).onConflictDoUpdate({
      target: [projectMembers.projectId, projectMembers.userId, projectMembers.roleTagId],
      // پورتِ `add_member`: همان (کاربر، نقش) ادغام می‌شود و فقط مبلغِ **بزرگ‌تر** می‌نشیند.
      set: {
        agreedAmount: sql`greatest(${projectMembers.agreedAmount}::numeric, excluded.agreed_amount::numeric)`,
        currencyId: plan.sign.currencyId,
        updatedAt: new Date(),
      },
    });

    await tx.update(tenderBids)
      .set({ status: 'approved', updatedAt: new Date() })
      .where(eq(tenderBids.id, bidId));
  });

  await audit(actor, 'bid.approve', bid.projectId, plan.unseat, plan.sign);

  // پورتِ `project_signed` در `add_member`: برندهٔ تازه‌وارد خبردار می‌شود.
  if (!wasMember && plan.sign.userId !== actor.id) {
    const role = (await roleNamesOf([plan.sign.roleTagId])).get(plan.sign.roleTagId) ?? '';
    await notify([plan.sign.userId], signedNotice(bid.projectId, project.title, { client: false, role }));
  }
  return { changed: true };
}

/** پس‌گرفتنِ پیشنهاد — اگر برنده بود، عضویتش هم برداشته می‌شود. */
export async function withdrawBid(actor: Actor, bidId: number) {
  const bid = await repo.getBid(bidId);
  if (!bid) throw new NotFoundError();
  await getProject(actor, bid.projectId);
  await assertCanManageProject(actor, bid.projectId);
  // ⚠️ مدیر فقط **برنده** را پس می‌گیرد («حذفِ برنده»)؛ پیشنهادِ در انتظارِ دیگران دستِ خودشان است.
  if (bid.status !== 'approved') throw new ForbiddenError('bid.not_winner');

  const plan = planWithdrawBid(bid);

  await db.transaction(async (tx) => {
    if (plan.unsign) {
      await tx.delete(projectMembers).where(and(
        eq(projectMembers.projectId, bid.projectId),
        eq(projectMembers.userId, bid.userId),
        eq(projectMembers.roleTagId, bid.roleTagId),
      ));
    }
    await tx.update(tenderBids)
      .set({ status: plan.nextStatus, updatedAt: new Date() })
      .where(eq(tenderBids.id, bidId));
  });

  await audit(actor, 'bid.withdraw', bid.projectId, bid.status, plan.nextStatus);
  return { unsigned: plan.unsign };
}

/**
 * سبک‌سازیِ پروژه.
 *
 * ⚠️ برگشت‌ناپذیر است و فقط روی پروژهٔ **بایگانی‌شده** اجازه دارد (R-PROJ-06).
 * جزئیات پاک می‌شود ولی **پول و پیوندهای انسانی می‌مانند** — و پیش از پاک‌کردن،
 * یک عکسِ لحظه‌ای از مجموع‌ها ثبت می‌شود.
 */
export async function lightenProject(actor: Actor, projectId: number) {
  assertCanManage(actor, 'projects');
  const project = await getProject(actor, projectId);

  assertCanLighten({ isArchived: project.isArchived, lightenSummary: project.lightenSummary });

  // ۱) عکسِ لحظه‌ای **پیش از** پاک‌شدنِ جزئیات — وگرنه ساعت صفر می‌افتاد.
  const totals = await repo.lightenTotals(projectId);
  const summary: LightenSummary = {
    minutes: totals.minutes,
    price: project.price,
    currencyId: project.currencyId,
    clientPaidEur: totals.clientPaidEur,
    memberPaidEur: totals.memberPaidEur,
    lightenedAt: new Date().toISOString(),
    wasTender: project.isTender,
  };

  const orphanFileIds: number[] = [];
  await db.transaction(async (tx) => {
    const taskIds = await tx.select({ id: tasks.id }).from(tasks).where(eq(tasks.projectId, projectId));
    if (taskIds.length > 0) {
      await tx.delete(taskRoles).where(inArray(taskRoles.taskId, taskIds.map((t) => t.id)));
    }
    await tx.delete(tasks).where(eq(tasks.projectId, projectId));
    await tx.delete(comments).where(eq(comments.projectId, projectId));
    await tx.delete(projectQa).where(eq(projectQa.projectId, projectId));
    // فایلِ فیزیکی هم می‌رود — سبک‌سازی وگرنه فضایی آزاد نمی‌کرد.
    orphanFileIds.push(...(await tx.select({ fileId: attachments.fileId }).from(attachments)
      .where(eq(attachments.projectId, projectId))).map((a) => a.fileId).filter((id): id is number => id !== null));
    await tx.delete(attachments).where(eq(attachments.projectId, projectId));
    await tx.delete(timelogs).where(eq(timelogs.projectId, projectId));
    await tx.delete(tenderBids).where(eq(tenderBids.projectId, projectId));

    // پرچمِ مناقصه و نقش‌ها/اعلام‌شده‌ها پاک می‌شوند تا پروژهٔ سبک‌شده نشان و تبِ
    // مناقصه نداشته باشد و مناقصهٔ دوباره از نو اعلام شود؛ خاطره‌اش در `wasTender` می‌ماند.
    await tx.update(projects)
      .set({ lightenSummary: summary, isTender: false, tenderRoles: null, tenderAnnounced: null, updatedAt: new Date() })
      .where(eq(projects.id, projectId));
  });

  await removeFiles(orphanFileIds);
  await audit(actor, 'project.lighten', projectId, null, summary);
  return summary;
}

/* ------------------------------------------------------------------ *
 * برداشتنِ تسک
 * ------------------------------------------------------------------ */

/**
 * برداشتنِ تسکِ نقشی.
 *
 * ⚠️ قاعده در `canClaimTask` است و ظرافتش این است: اگر تنها دارندهٔ آن نقش
 * شمایید، «برداشتن» بی‌معناست. اینجا فقط داده را جمع می‌کنیم و تصمیم را به
 * دامنه می‌سپاریم — تا گاردِ صفحه و گاردِ سرور یک منطق داشته باشند.
 */
export async function claimTask(actor: Actor, taskId: number) {
  const task = await repo.getTask(taskId);
  if (!task) throw new ForbiddenError('task.not_found');

  // گاردِ دسترسیِ پروژه، همان‌جا که بقیهٔ کارهای تسک گارد می‌شوند.
  await getProjectDetail(actor, task.projectId);

  const [roleRows, memberRows] = await Promise.all([
    db.select({ roleTagId: taskRoles.roleTagId, claimedBy: taskRoles.claimedBy })
      .from(taskRoles).where(eq(taskRoles.taskId, taskId)),
    db.select({ roleTagId: projectMembers.roleTagId, userId: projectMembers.userId })
      .from(projectMembers).where(eq(projectMembers.projectId, task.projectId)),
  ]);

  const roleHolders = new Map<number, number[]>();
  for (const m of memberRows) {
    if (m.roleTagId === null) continue;
    roleHolders.set(m.roleTagId, [...(roleHolders.get(m.roleTagId) ?? []), m.userId]);
  }

  // ⚠️ پروژهٔ منجمد برداشتن هم نمی‌پذیرد (`block_if_frozen` روی `ajax_claim_task`).
  await assertNotFrozen(task.projectId, actor);

  const roleTagIds = claimableRoleIds({
    assignedTo: task.assignedTo ?? null,
    roles: roleRows.map((r) => ({ roleTagId: r.roleTagId, claimedBy: r.claimedBy })),
    roleHolders,
    userId: actor.id,
  });

  if (roleTagIds.length === 0) throw new ForbiddenError('task.not_claimable');

  /**
   * ⚠️ **هر** نقشِ بازی که کاربر دارد برداشته می‌شود و تسک نقشی **می‌ماند**
   * (`assigned_to` دست نمی‌خورد) — پورتِ `Tasks::claim()`. پیش از این یک نقش
   * برداشته و `assignedTo` ست می‌شد: تسکِ چندنقشه یک‌نفره می‌شد و صاحبانِ
   * نقش‌های دیگر تسک و اعلانش را از دست می‌دادند.
   */
  await db.transaction(async (tx) => {
    await tx.update(taskRoles).set({ claimedBy: actor.id, updatedAt: new Date() })
      .where(and(eq(taskRoles.taskId, taskId), inArray(taskRoles.roleTagId, roleTagIds)));
    await tx.update(tasks).set({ updatedAt: new Date(), updatedBy: actor.id })
      .where(eq(tasks.id, taskId));
  });

  await audit(actor, 'task.claim', taskId, null, { roleTagIds });
  return roleTagIds[0]!;
}

/* ------------------------------------------------------------------ *
 * مناقصه از سمتِ عضو
 * ------------------------------------------------------------------ */

/**
 * نمای مناقصه برای عضو: نقش‌های بازِ او + پیشنهادِ فعلی‌اش.
 * ⚠️ فقط پیشنهادِ **خودش** را می‌بیند؛ دیدنِ قیمتِ رقبا یعنی مناقصهٔ بی‌معنا.
 */
export async function getMemberTender(actor: Actor, projectId: number) {
  const detail = await getProjectDetail(actor, projectId);
  const project = detail.project;
  if (!project.isTender) return null;

  const roles = (project.tenderRoles ?? {}) as Record<string, string | null>;
  const roleIds = Object.keys(roles).map(Number).filter(Number.isInteger);
  if (roleIds.length === 0) return null;

  const [myTags, bids, statusGroup] = await Promise.all([
    db.select({ tagId: tagRelations.tagId }).from(tagRelations)
      .where(and(eq(tagRelations.objectType, 'user'), eq(tagRelations.objectId, actor.id))),
    repo.listBids(projectId),
    repo.projectStatusGroup(projectId),
  ]);

  const awarded = bids.filter((b) => b.status === 'approved');
  const open = openRolesForUser({
    isTender: true,
    tenderRoleIds: roleIds,
    userRoleTagIds: myTags.map((t) => t.tagId),
    awardedRoleIds: awarded.map((b) => b.roleTagId).filter((r): r is number => r !== null),
  });

  const tagRows = roleIds.length === 0 ? [] : await db
    .select({ id: tags.id, name: tagName(await currentLocale()) }).from(tags).where(inArray(tags.id, roleIds));
  const roleNameOf = new Map(tagRows.map((t) => [t.id, t.name]));

  const mine = bids.filter((b) => b.userId === actor.id);

  return {
    isOpen: tenderIsOpen(true, statusGroup),
    /** نقش‌هایی که این کاربر برنده شده — پیامِ تبریک. */
    wonRoles: mine
      .filter((b) => b.status === 'approved')
      .map((b) => roleNameOf.get(b.roleTagId ?? 0) ?? `#${b.roleTagId}`),
    openRoles: open.map((rid) => {
      const own = mine.find((b) => b.roleTagId === rid);
      return {
        roleTagId: rid,
        roleName: roleNameOf.get(rid) ?? `#${rid}`,
        cap: roles[String(rid)] ?? null,
        myAmount: own?.amount ?? '',
        myNote: own?.note ?? '',
        hasBid: Boolean(own),
      };
    }),
    currencyId: project.currencyId,
  };
}

/**
 * ثبت یا به‌روزرسانیِ پیشنهاد.
 *
 * ⚠️ سقف و بازبودنِ مناقصه **سمتِ سرور** دوباره بررسی می‌شوند؛ `max` ِ فرم
 * فقط راهنمای کاربر است و با ابزارِ توسعه‌دهنده دور زده می‌شود.
 *
 * ⚠️ از مسیرِ **مناقصه‌گر** می‌خواند، نه مسیرِ عضو: پیشنهاددهنده معمولاً
 * عضوِ پروژه **نیست** و مسیرِ عضو گاردِ عضویت دارد. اولین نسخه همین را
 * اشتباه کرده بود و غیرعضو اصلاً نمی‌توانست پیشنهاد بدهد — یعنی خودِ
 * قابلیت کار نمی‌کرد.
 */
export async function submitBid(
  actor: Actor,
  input: { projectId: number; roleTagId: number; amount: string; note: string },
) {
  const bidder = await getBidderView(actor, input.projectId);
  if (!bidder) throw new ForbiddenError('tender.not_available');
  const view = bidder.bid;

  const role = view.openRoles.find((r) => r.roleTagId === input.roleTagId);
  if (!role) throw new BidError('role_closed');

  const rejection = validateBid({
    amount: input.amount,
    cap: role.cap,
    roleIsAwarded: false,
    tenderIsOpen: view.isOpen,
  });
  const currencyRows = await db.select({ currencyId: projects.currencyId, code: currencies.code })
    .from(projects)
    .leftJoin(currencies, eq(currencies.id, projects.currencyId))
    .where(eq(projects.id, input.projectId));
  // پورتِ افزونه: خطای سقف، خودِ سقف را می‌گوید («حداکثر قیمت مجاز … است»).
  if (rejection) throw new BidError(rejection, rejection === 'over_cap'
    ? { cap: String(role.cap), currencyCode: currencyRows[0]?.code ?? '' }
    : undefined);

  const existing = await db.select({ id: tenderBids.id }).from(tenderBids)
    .where(and(
      eq(tenderBids.projectId, input.projectId),
      eq(tenderBids.userId, actor.id),
      eq(tenderBids.roleTagId, input.roleTagId),
    ));

  if (existing[0]) {
    /**
     * ⚠️ ثبتِ دوباره = پیشنهادِ تازه: وضعیت به «در انتظار» برمی‌گردد — پورتِ
     * `Bids::submit()`. پیش از این فقط مبلغ و توضیح عوض می‌شد و پیشنهاددهنده‌ای
     * که پس گرفته بود، «پس‌گرفته» می‌ماند: نامرئی برای مدیر، ولی فرم می‌گفت
     * «ثبت شد».
     */
    await db.update(tenderBids)
      .set({ amount: input.amount, note: input.note.slice(0, 500), status: 'pending', updatedAt: new Date() })
      .where(eq(tenderBids.id, existing[0].id));
    await audit(actor, 'bid.update', existing[0].id, null, input);
    return existing[0].id;
  }

  const rows = await db.insert(tenderBids).values({
    projectId: input.projectId,
    userId: actor.id,
    roleTagId: input.roleTagId,
    amount: input.amount,
    currencyId: currencyRows[0]?.currencyId ?? null,
    note: input.note.slice(0, 500),
  }).returning({ id: tenderBids.id });

  await audit(actor, 'bid.submit', rows[0]!.id, null, input);
  return rows[0]!.id;
}

export class BidError extends Error {
  constructor(
    public readonly reason: BidRejection,
    /** سقفِ نقش برای پیامِ «حداکثر قیمت مجاز …». */
    public readonly detail?: { cap: string; currencyCode: string },
  ) {
    super(reason);
    this.name = 'BidError';
  }
}

/**
 * نمای **محدودِ** مناقصه‌گر — کسی که عضوِ پروژه نیست ولی نقشِ بازی دارد.
 *
 * ⚠️ این تنها راهی است که یک غیرعضو به پروژه دسترسی پیدا می‌کند، و عمداً
 * تنگ است: عنوان و توضیحِ پروژه، **فقط تسک‌های نقشِ خودش** (فقط‌خواندنی)،
 * فایل‌ها، و فرمِ پیشنهاد. نه کامنت، نه مالی، نه اعضا، نه تسکِ بقیه —
 * وگرنه هر کسی با یک تگِ نقش می‌توانست داخلِ پروژه‌های شرکت را ببیند.
 */
export async function getBidderView(actor: Actor, projectId: number) {
  const rows = await db
    .select({
      id: projects.id,
      title: projects.title,
      description: projects.description,
      scope: projects.scope,
      isTender: projects.isTender,
      tenderRoles: projects.tenderRoles,
      currencyId: projects.currencyId,
    })
    .from(projects)
    .where(and(eq(projects.id, projectId), isNull(projects.deletedAt)));

  const project = rows[0];
  if (!project || !project.isTender) return null;
  if (!canSeeScope(actor, project.scope)) return null;

  const roleIds = Object.keys((project.tenderRoles ?? {}) as Record<string, unknown>)
    .map(Number).filter(Number.isInteger);
  if (roleIds.length === 0) return null;

  const [myTags, bids, statusGroup] = await Promise.all([
    db.select({ tagId: tagRelations.tagId }).from(tagRelations)
      .where(and(eq(tagRelations.objectType, 'user'), eq(tagRelations.objectId, actor.id))),
    repo.listBids(projectId),
    repo.projectStatusGroup(projectId),
  ]);

  const open = openRolesForUser({
    isTender: true,
    tenderRoleIds: roleIds,
    userRoleTagIds: myTags.map((t) => t.tagId),
    awardedRoleIds: bids.filter((b) => b.status === 'approved')
      .map((b) => b.roleTagId).filter((r): r is number => r !== null),
  });

  const mine = bids.filter((b) => b.userId === actor.id);
  if (open.length === 0 && mine.length === 0) return null;

  // تسک‌هایی که نقششان با نقشِ بازِ این کاربر می‌خورد — نه بیشتر.
  const scopedTasks = open.length === 0 ? [] : await db
    .selectDistinct({
      id: tasks.id,
      title: tasks.title,
      description: tasks.description,
    })
    .from(tasks)
    .innerJoin(taskRoles, eq(taskRoles.taskId, tasks.id))
    .where(and(
      eq(tasks.projectId, projectId),
      isNull(tasks.deletedAt),
      // ⚠️ تسکِ خصوصی به مناقصه‌گر هم نشان داده نمی‌شود.
      eq(tasks.isPrivate, false),
      inArray(taskRoles.roleTagId, open),
    ));

  const tagRows = await db.select({ id: tags.id, name: tagName(await currentLocale()) })
    .from(tags).where(inArray(tags.id, roleIds));
  const roleNameOf = new Map(tagRows.map((t) => [t.id, t.name]));
  const roles = (project.tenderRoles ?? {}) as Record<string, string | null>;

  return {
    project: { id: project.id, title: project.title, description: project.description },
    tasks: scopedTasks,
    files: await repo.listAttachments(projectId),
    bid: {
      projectId,
      isOpen: tenderIsOpen(true, statusGroup),
      wonRoles: mine.filter((b) => b.status === 'approved')
        .map((b) => roleNameOf.get(b.roleTagId ?? 0) ?? `#${b.roleTagId}`),
      openRoles: open.map((rid) => {
        const own = mine.find((b) => b.roleTagId === rid);
        return {
          roleTagId: rid,
          roleName: roleNameOf.get(rid) ?? `#${rid}`,
          cap: roles[String(rid)] ?? null,
          myAmount: own?.amount ?? '',
          myNote: own?.note ?? '',
          hasBid: Boolean(own),
        };
      }),
    },
  };
}

/* ------------------------------------------------------------------ *
 * راه‌اندازیِ اولیهٔ پروژه — آنچه فرمِ ساخت یک‌جا می‌گیرد
 * ------------------------------------------------------------------ */

export interface InitialTask {
  title: string;
  roleTagIds: number[];
  /** ⚠️ توکنِ «کارفرما» — تسک به کارفرمای اصلیِ پروژه می‌رسد. */
  toClient: boolean;
  dueDate: string | null;
  priorityTagId: number | null;
}

export interface ProjectBootstrap {
  members: MemberInput[];
  clientIds: number[];
  tasks: InitialTask[];
  /** نقش‌هایی که چک‌لیستِ QAشان اعمال شود (`client` هم مجاز است). */
  qaAudiences: QaAudience[];
  links: Array<{ url: string; label: string }>;
  /**
   * فایل‌های محلی که همان فرمِ ساخت آورده — پیش از این فقط لینکِ بیرونی
   * ممکن بود و کاربر باید پروژه را می‌ساخت، بازش می‌کرد و از تبِ فایل‌ها
   * دوباره آپلود می‌کرد.
   */
  attachments: Array<{ name: string; mime: string; bytes: Uint8Array }>;
  /** تصویرِ شاخص، از همان فرم. */
  thumbnail: { name: string; mime: string; bytes: Uint8Array } | null;
}

/**
 * اعمالِ همهٔ چیزهایی که فرمِ ساخت جمع کرده — اعضا، کارفرمایان، تسک‌های
 * اولیه، چک‌لیستِ QA و لینک‌ها.
 *
 * ⚠️ **بعد از** ساختِ پروژه اجرا می‌شود، چون همه به شناسهٔ پروژه نیاز دارند.
 * ⚠️ هر بخش مستقل `try` می‌شود: خطای یک تسکِ اولیه نباید کلِ ساختِ پروژه را
 * باطل کند — پروژه ساخته شده و کاربر باید ببیندش.
 */
export async function bootstrapProject(
  actor: Actor,
  projectId: number,
  input: Partial<ProjectBootstrap>,
): Promise<void> {
  const step = async (name: string, run: () => Promise<unknown>) => {
    try {
      await run();
    } catch (error) {
      console.error(`[bootstrap] ${name}`, error);
    }
  };

  if (input.members?.length) {
    await step('members', () => setMembers(actor, projectId, input.members!));
  }

  if (input.clientIds?.length) {
    await step('clients', async () => {
      for (const userId of input.clientIds!) await addProjectClient(actor, projectId, userId);
    });
  }

  if (input.tasks?.length) {
    await step('tasks', async () => {
      // کارفرمای اصلی — برای تسک‌هایی که توکنِ «کارفرما» دارند.
      const primaryClient = input.clientIds?.[0] ?? null;

      for (const task of input.tasks!) {
        if (!task.title.trim()) continue;
        await createTask(actor, projectId, {
          title: task.title.trim(),
          description: '',
          statusTagId: null,
          priorityTagId: task.priorityTagId,
          assignedTo: task.toClient ? primaryClient : null,
          roleTagIds: task.roleTagIds,
          dueDate: task.dueDate,
          isPrivate: false,
        }, { silent: true });
      }
    });
  }

  if (input.qaAudiences?.length) {
    await step('qa', () => applyQa(actor, projectId, input.qaAudiences!));
  }

  if (input.links?.length) {
    await step('links', async () => {
      const { addLink } = await import('@/server/files/service');
      for (const link of input.links!) {
        if (link.url.trim()) await addLink(actor, projectId, link.url, link.label);
      }
    });
  }

  if (input.attachments?.length) {
    await step('attachments', async () => {
      const { addAttachment } = await import('@/server/files/service');
      for (const blob of input.attachments!) {
        await addAttachment(actor, projectId, blob, '');
      }
    });
  }

  if (input.thumbnail) {
    await step('thumbnail', async () => {
      const { setProjectThumbnail } = await import('@/server/files/service');
      await setProjectThumbnail(actor, projectId, input.thumbnail!);
    });
  }
}

/* ------------------------------------------------------------------ *
 * حذف‌ها — کامنت و آیتمِ QA
 * ------------------------------------------------------------------ */

/**
 * حذفِ کامنت یا ریویو.
 * ⚠️ فقط مدیرِ پروژه‌ها. نویسندهٔ کامنت هم نمی‌تواند پاکش کند: کامنت بخشی از
 * تاریخچهٔ گفتگوی پروژه است و پاک‌کردنش تصمیمِ مدیریتی است، نه شخصی.
 */
export async function deleteComment(actor: Actor, commentId: number): Promise<number> {
  const row = await repo.getComment(commentId);
  if (!row || row.projectId === null) throw new NotFoundError();
  await getProject(actor, row.projectId); // گاردِ scope
  await assertCanManageProject(actor, row.projectId);

  // پورتِ `Comments::delete`: گره و **همهٔ** پاسخ‌های زیرِ آن می‌روند، نه فقط یک ردیف.
  await db.execute(sql`with recursive sub as (
      select id from comments where id = ${commentId}
      union all
      select c.id from comments c join sub on c.parent_id = sub.id
    ) delete from comments where id in (select id from sub)`);
  await audit(actor, 'comment.delete', row.projectId, row, null);
  return row.projectId;
}

/** حذفِ یک آیتمِ چک‌لیستِ QA ِ اعمال‌شده. */
export async function deleteQaItem(actor: Actor, itemId: number): Promise<number> {
  const rows = await db.select({ id: projectQa.id, projectId: projectQa.projectId })
    .from(projectQa).where(eq(projectQa.id, itemId));
  const item = rows[0];
  if (!item) throw new NotFoundError();
  await getProject(actor, item.projectId);
  await assertCanManageProject(actor, item.projectId);

  await db.delete(projectQa).where(eq(projectQa.id, itemId));
  await audit(actor, 'qa.item_delete', item.projectId, item, null);
  return item.projectId;
}

/**
 * برداشتنِ همهٔ آیتم‌های QA ِ یک نقش.
 * ⚠️ نقشِ «کارفرما» با شناسهٔ صفر نمایش داده می‌شود (R-QA-02)، پس اینجا هم
 * `null` معنایش «کارفرما» است، نه «همه».
 */
export async function removeQaRole(
  actor: Actor,
  projectId: number,
  roleTagId: number | null,
): Promise<number> {
  await getProject(actor, projectId);
  await assertCanManageProject(actor, projectId);

  await db.delete(projectQa).where(and(
    eq(projectQa.projectId, projectId),
    roleTagId === null
      ? isNull(projectQa.roleTagId)
      : eq(projectQa.roleTagId, roleTagId),
  ));

  await audit(actor, 'qa.role_remove', projectId, null, { roleTagId });
  return projectId;
}

/* ------------------------------------------------------------------ *
 * تسک‌های خودِ کاربر
 * ------------------------------------------------------------------ */

/**
 * تسک‌های بازِ کاربرِ جاری — پورتِ نمای «تسک‌های شما» (`view_tasks()`).
 *
 * ⚠️ دو سطل، نه یک فهرست: «جاری» و «در انتظارِ بررسی». تسکی که کارِ تو
 * تمام شده و منتظرِ نظرِ دیگری است، در فهرستِ کارهای امروزت جا ندارد ولی
 * فراموش هم نباید شود.
 *
 * ⚠️ تسکِ **پروژهٔ خصوصی** فقط با دسترسیِ خصوصی دیده می‌شود؛ فیلترِ scope
 * همان جایی اعمال می‌شود که بقیهٔ کوئری‌ها (R-PROJ-17).
 */
export async function myTasks(actor: Actor) {
  const scopes = visibleScopes(actor);
  const isPureClient = actor.roles.includes('client') && !actor.roles.includes('member');

  /**
   * پورتِ صفحهٔ تسک‌های **کارفرما**: تسک‌های در انتظارِ بررسی روی پروژه‌های
   * (غیرِمنجمدِ) او — فراخوانِ اصلیِ کارفرما. پیش از این همان کوئریِ
   * «سپرده‌شده به من» را می‌دید که برای کارفرما همیشه خالی است.
   */
  if (isPureClient) {
    const ids = await repo.nonFrozenProjectIds(await membershipProjectIds(actor.id, ['client']));
    const review = await repo.reviewTasksForProjects(ids, scopes);
    return {
      kind: 'client' as const,
      active: [] as InboxTask[],
      waiting: [] as InboxTask[],
      review: review.map((t) => ({ ...t, roles: [] as InboxRole[], claimable: false })),
    };
  }

  const rows = await repo.openTasksForUser(actor.id, scopes);
  const [roles, holderRows] = await Promise.all([
    repo.taskRolesFor(rows.map((r) => r.id)),
    repo.roleHoldersFor([...new Set(rows.map((r) => r.projectId))]),
  ]);
  const rolesByTask = new Map<number, typeof roles>();
  for (const r of roles) rolesByTask.set(r.taskId, [...(rolesByTask.get(r.taskId) ?? []), r]);
  const holdersByProject = new Map<number, Map<number, number[]>>();
  for (const h of holderRows) {
    if (h.roleTagId === null) continue;
    const m = holdersByProject.get(h.projectId) ?? new Map<number, number[]>();
    m.set(h.roleTagId, [...(m.get(h.roleTagId) ?? []), h.userId]);
    holdersByProject.set(h.projectId, m);
  }

  const decorated: InboxTask[] = rows.map((t) => {
    const taskRolesList = rolesByTask.get(t.id) ?? [];
    return {
      ...t,
      roles: taskRolesList.map((r) => ({
        roleName: r.roleName,
        claimedBy: r.claimedBy,
        claimedByName: r.claimedBy === actor.id ? null : r.claimedByName,
      })),
      // پورتِ دکمهٔ «برمی‌دارم» روی ردیفِ صندوق.
      claimable: canClaimTask({
        assignedTo: t.assignedTo,
        roles: taskRolesList.filter((r) => r.roleTagId !== null).map((r) => ({ roleTagId: r.roleTagId!, claimedBy: r.claimedBy })),
        roleHolders: holdersByProject.get(t.projectId) ?? new Map(),
        userId: actor.id,
      }),
    };
  });

  return {
    kind: 'member' as const,
    active: decorated.filter((t) => !t.isReview),
    waiting: decorated.filter((t) => t.isReview),
    review: [] as InboxTask[],
  };
}

export interface InboxRole {
  roleName: string | null;
  claimedBy: number | null;
  /** null یعنی ادعانشده یا ادعای خودِ بیننده. */
  claimedByName: string | null;
}

export type InboxTask = Awaited<ReturnType<typeof repo.openTasksForUser>>[number] & {
  roles: InboxRole[];
  claimable: boolean;
};
