import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/db/client';
import { projectClients, projectMembers, projects, tagRelations, tags, userOffices } from '@/db/schema';
import { canManageSection, canViewSection, type Actor } from '@/domain/access/permissions';
import { ForbiddenError } from '@/domain/access/guard';
import { canManageProject as decide, PM_CAP } from '@/domain/access/project-scope';
import { isFrozenProject } from '@/domain/projects/lifecycle';

/**
 * اختیارِ پروژه‌محور روی دیتابیس — تصمیم در
 * `src/domain/access/project-scope.ts` گرفته می‌شود.
 *
 * ⚠️ سه کوئریِ ثابت، و فقط وقتی لازم است: اگر کاربر مجوزِ سراسری داشته باشد
 * هیچ کوئری‌ای زده نمی‌شود. این تابع در مسیرِ داغِ هر عملِ پروژه است.
 */
export async function canManageProject(actor: Actor, projectId: number): Promise<boolean> {
  // میان‌بُر — مالک و مدیرِ پروژه‌ها نیازی به کوئری ندارند.
  if (canManageSection(actor, 'projects')) return true;

  const [project, memberships, managed] = await Promise.all([
    db.select({ officeId: projects.officeId })
      .from(projects).where(eq(projects.id, projectId)),
    /**
     * ⚠️ همهٔ ردیف‌های عضویتِ کاربر روی این پروژه، نه یکی: یک نفر می‌تواند با
     * چند نقش امضا شده باشد و «مدیرِ پروژه» ممکن است دومی باشد.
     */
    db.select({ grantsCap: tags.grantsCap })
      .from(projectMembers)
      .leftJoin(tags, eq(tags.id, projectMembers.roleTagId))
      .where(and(
        eq(projectMembers.projectId, projectId),
        eq(projectMembers.userId, actor.id),
      )),
    db.select({ officeId: userOffices.officeId })
      .from(userOffices)
      .where(and(eq(userOffices.userId, actor.id), eq(userOffices.manages, true))),
  ]);

  return decide({
    hasGlobalManage: false,
    isPmOnProject: memberships.some((m) => m.grantsCap === PM_CAP),
    projectOfficeId: project[0]?.officeId ?? null,
    managedOfficeIds: managed.map((r) => r.officeId),
    isMemberOfProject: memberships.length > 0,
  });
}

/**
 * گاردِ پروژه‌محور — جایگزینِ `assertCanManage(actor, 'projects')` در هر جایی
 * که عمل روی یک پروژهٔ **مشخص** است.
 *
 * ⚠️ برای عمل‌هایی که پروژهٔ مشخصی ندارند (ساختِ پروژه، فهرستِ کلی) همان
 * گاردِ سراسری درست است: آنجا پروژه‌ای وجود ندارد که کسی مدیرش باشد.
 */
export async function assertCanManageProject(actor: Actor, projectId: number): Promise<void> {
  if (!(await canManageProject(actor, projectId))) throw new ForbiddenError('projects.manage');
}

/**
 * پروژهٔ **منجمد** — بایگانی‌شده، لغوشده یا متوقف.
 *.
 *
 * ⚠️ کدام کارها مسدود می‌شوند، دقیقاً از نسخهٔ قبلی آمده: ثبت و حذفِ ساعت،
 * کامنت، تسک، پیوست، لینک، کارکردِ تعدادی، و شروعِ تایمر.
 *
 * ⚠️ و کدام‌ها **نه**: درخواستِ پرداخت. نسخهٔ قبلی عمداً آن را آزاد گذاشته —
 * عضوی که روی پروژهٔ لغوشده کارِ انجام‌شده دارد، هنوز باید بتواند پولش را
 * بخواهد. اینجا هم همان تفکیک حفظ شده.
 */
export async function isProjectFrozen(projectId: number): Promise<boolean> {
  const [row] = await db
    .select({ isArchived: projects.isArchived, statusGroup: tags.statusGroup })
    .from(projects)
    .leftJoin(tags, eq(tags.id, projects.statusTagId))
    .where(eq(projects.id, projectId));

  return row ? isFrozenProject(row) : false;
}

export class FrozenProjectError extends Error {
  constructor() {
    super('project.frozen');
    this.name = 'FrozenProjectError';
  }
}

export async function assertNotFrozen(projectId: number): Promise<void> {
  if (await isProjectFrozen(projectId)) throw new FrozenProjectError();
}

/** نسبتِ کاربر با پروژه — یک رفت‌وبرگشت برای هر دو جدول. */
export async function projectRelation(
  userId: number,
  projectId: number,
): Promise<{ isMember: boolean; isClient: boolean; roleTagIds: number[] }> {
  const [memberRows, clientRows] = await Promise.all([
    db.select({ roleTagId: projectMembers.roleTagId })
      .from(projectMembers)
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId))),
    db.select({ userId: projectClients.userId })
      .from(projectClients)
      .where(and(eq(projectClients.projectId, projectId), eq(projectClients.userId, userId))),
  ]);
  return {
    isMember: memberRows.length > 0,
    isClient: clientRows.length > 0,
    roleTagIds: memberRows.map((r) => r.roleTagId).filter((id): id is number => id !== null),
  };
}

/**
 * دیدِ پروژه.:
 * مجوزِ سراسری ∨ عضوِ پروژه ∨ کارفرمای پروژه ∨ مدیرِ دفترِ مالک.
 *
 * ⚠️ این تابع بود که وجود نداشت و **کلِ سمتِ عضو را قفل کرده بود**: هر
 * صفحهٔ پروژه فقط مجوزِ سراسریِ `projects.view` را می‌شناخت، که عضو و
 * کارفرما ندارند. لاگینِ موفقِ عضو به `/login` برمی‌گشت.
 *
 * ⚠️ عضویت بر scope مقدم است: کسی که روی پروژهٔ خصوصی **امضا شده** آن را
 * می‌بیند — نسخهٔ قبلی هم در `user_can_access` هیچ چکِ scope ندارد. گاردِ scope
 * فقط برای بینندهٔ مجوزی است.
 */
export async function canViewProject(actor: Actor, projectId: number): Promise<boolean> {
  if (canViewSection(actor, 'projects')) return true;

  const relation = await projectRelation(actor.id, projectId);
  if (relation.isMember || relation.isClient) return true;

  // مدیرِ دفترِ مالک — بدونِ امضا هم می‌بیند.
  return canManageProject(actor, projectId);
}

/** «یافت نشد»، نه «ممنوع» — وجودِ پروژه لو نمی‌رود. */
export async function assertCanViewProject(actor: Actor, projectId: number): Promise<void> {
  if (!(await canViewProject(actor, projectId))) {
    throw new ForbiddenError('projects.view');
  }
}

/**
 * شناسهٔ پروژه‌هایی که کاربر رویشان امضا شده یا کارفرمایشان است —
 * پورتِ `ids_for_member` + `ids_for_client` — به‌علاوهٔ مناقصه‌هایی که
 * تگِ نقشِ او در نقش‌های اعلام‌شده است.
 *
 * ⚠️ چرا مناقصه هم: نسخهٔ قبلی مناقصه‌های باز را در داشبوردِ عضوِ نقش‌دار
 * فهرست می‌کند (`tender_open_roles_for_user`) تا بدونِ اعلان هم پیدایشان
 * کند؛ بدونِ این، تنها راهِ رسیدن به مناقصه کلیکِ روی اعلانِ
 * `tender_opened` بود و اگر کسی اعلانش را پاک می‌کرد راهی نمی‌ماند.
 * باز/بسته‌بودنِ هر نقش را خودِ صفحهٔ پروژه (نمای پیشنهاددهنده) می‌سنجد.
 */
export async function membershipProjectIds(userId: number): Promise<number[]> {
  const [memberRows, clientRows, myTags] = await Promise.all([
    db.select({ id: projectMembers.projectId })
      .from(projectMembers).where(eq(projectMembers.userId, userId)),
    db.select({ id: projectClients.projectId })
      .from(projectClients).where(eq(projectClients.userId, userId)),
    db.select({ tagId: tagRelations.tagId }).from(tagRelations)
      .where(and(eq(tagRelations.objectType, 'user'), eq(tagRelations.objectId, userId))),
  ]);

  const tenderRows = myTags.length === 0 ? [] : await db
    .select({ id: projects.id, tenderRoles: projects.tenderRoles })
    .from(projects)
    .where(and(eq(projects.isTender, true), isNull(projects.deletedAt)));

  const mine = new Set(myTags.map((t) => t.tagId));
  const tenderIds = tenderRows
    .filter((p) => Object.keys((p.tenderRoles ?? {}) as Record<string, unknown>)
      .map(Number).some((roleId) => mine.has(roleId)))
    .map((p) => p.id);

  return [...new Set([...memberRows.map((r) => r.id), ...clientRows.map((r) => r.id), ...tenderIds])];
}

