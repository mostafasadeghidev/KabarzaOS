import { and, eq, isNull, inArray } from 'drizzle-orm';
import { db } from '@/db/client';
import { projectClients, projectMembers, projects, tagRelations, tags, userOffices } from '@/db/schema';
import { canManageSection, canViewSection, type Actor } from '@/domain/access/permissions';
import { ForbiddenError } from '@/domain/access/guard';
import { canManageProject as decide, PM_CAP } from '@/domain/access/project-scope';
import type { MoneyAudience } from '@/domain/access/project-money';
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

/**
 * ⚠️ مالک/مدیرِ سراسریِ پروژه‌ها مستثناست — پورتِ کامنتِ `Projects::is_frozen()`:
 * «The owner is unaffected (they manage from the admin card view)». مدیرِ
 * پروژهٔ تگ‌دار و مدیرِ دفتر مثلِ عضو قفل می‌مانند (مسیرِ front-end ِ نسخهٔ قبلی).
 * پیش از این مالک هم نمی‌توانست به پروژهٔ نگه‌داشته/کنسل‌شده تسک یا فایل بدهد.
 */
export async function assertNotFrozen(projectId: number, actor?: Actor): Promise<void> {
  if (actor && canManageSection(actor, 'projects')) return;
  if (await isProjectFrozen(projectId)) throw new FrozenProjectError();
}

/** نسبتِ کاربر با پروژه — یک رفت‌وبرگشت برای هر دو جدول. */
export async function projectRelation(
  userId: number,
  projectId: number,
): Promise<{
  isMember: boolean;
  isClient: boolean;
  roleTagIds: number[];
  /**
   * ⚠️ «رابطه دارد» و «اجازهٔ دیدن دارد» دو چیزند. عضوی که دسترسی‌اش به این
   * پروژه قطع شده هنوز عضو است — پولش و سابقه‌اش سرِ جاست و ماسکِ نام هم
   * باید همان‌طور رفتار کند — ولی صفحهٔ پروژه را نمی‌بیند. اگر یکی‌شان
   * می‌کردیم، قطعِ دسترسی نامِ او را هم از دیدِ بقیه عوض می‌کرد.
   */
  accessBlocked: boolean;
}> {
  const [memberRows, clientRows] = await Promise.all([
    db.select({ roleTagId: projectMembers.roleTagId, blocked: projectMembers.accessBlocked })
      .from(projectMembers)
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId))),
    db.select({ userId: projectClients.userId, blocked: projectClients.accessBlocked })
      .from(projectClients)
      .where(and(eq(projectClients.projectId, projectId), eq(projectClients.userId, userId))),
  ]);
  const rows = [...memberRows, ...clientRows];
  return {
    isMember: memberRows.length > 0,
    isClient: clientRows.length > 0,
    roleTagIds: memberRows.map((r) => r.roleTagId).filter((id): id is number => id !== null),
    /**
     * ⚠️ «هر رابطه‌ای مسدود است» — نه «یکی مسدود است». عضوی که با دو نقش
     * امضا شده و فقط یکی مسدود شده، هنوز از راهِ نقشِ دیگر دسترسی دارد.
     */
    accessBlocked: rows.length > 0 && rows.every((r) => r.blocked),
  };
}

/**
 * مخاطبِ پولِ این پروژه — ورودیِ `domain/access/project-money`.
 *
 * ⚠️ یک کوئری (`projectRelation`) و دو چکِ مجوز. تصمیم اینجا گرفته نمی‌شود؛
 * قاعده در دامنه است و تست دارد.
 */
export async function moneyAudience(actor: Actor, projectId: number): Promise<MoneyAudience> {
  const relation = await projectRelation(actor.id, projectId);
  return {
    hasGlobalProjectManage: canManageSection(actor, 'projects'),
    hasGlobalFinanceManage: canManageSection(actor, 'finance'),
    isClientOfProject: relation.isClient,
    isMemberOfProject: relation.isMember,
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
  // ⚠️ عضویت دسترسی می‌دهد، مگر آنکه صریحاً قطع شده باشد.
  if ((relation.isMember || relation.isClient) && !relation.accessBlocked) return true;

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
 * **کار کردن** روی پروژه — پورتِ دقیقِ `Frontend::user_can_access()`.
 *
 * ⚠️ این با `canViewProject` یکی نیست و نباید بشود. آن یکی یک شاخهٔ اضافه
 * دارد: مجوزِ **سراسریِ دیدن**. برای خواندن درست است، برای نوشتن فاجعه —
 * «بینندهٔ فقط‌خواندنی» (کسی که `projects.view` دارد و `projects.manage`
 * ندارد) با آن گارد می‌توانست تسک بسازد و کامنت بنویسد. کلِ فایدهٔ تفکیکِ
 * دیدن از مدیریت در RBAC ِ همکارِ ادمین همین‌جا از بین می‌رفت.
 *
 * نسخهٔ قبلی چهار شاخه دارد و هیچ‌کدام «دیدن» نیست:
 * مدیریتِ سراسری ∨ عضوِ پروژه ∨ کارفرمای پروژه ∨ مدیرِ دفترِ مالک.
 */
export async function canInteractWithProject(actor: Actor, projectId: number): Promise<boolean> {
  if (canManageSection(actor, 'projects')) return true;

  const relation = await projectRelation(actor.id, projectId);
  if ((relation.isMember || relation.isClient) && !relation.accessBlocked) return true;

  // مدیرِ پروژه (تگِ pm) و مدیرِ دفترِ مالک — هر دو در همین تصمیم‌اند.
  return canManageProject(actor, projectId);
}

export async function assertCanInteractWithProject(
  actor: Actor,
  projectId: number,
): Promise<void> {
  if (!(await canInteractWithProject(actor, projectId))) {
    throw new ForbiddenError('projects.access');
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
export type MembershipKind = 'member' | 'client' | 'tender';

export async function membershipProjectIds(
  userId: number,
  /** کدام رابطه‌ها — داشبورد عضو/کارفرما و مناقصه را جدا می‌خواهد (پورتِ `current_projects(role)`). */
  kinds: readonly MembershipKind[] = ['member', 'client', 'tender'],
): Promise<number[]> {
  const [memberRows, clientRows, myTags] = await Promise.all([
    /**
     * ⚠️ عضویتِ مسدود پروژه را در فهرست هم نمی‌آورد. بدونِ این، کاربر
     * پروژه‌اش را در «پروژه‌های من» می‌دید و کلیک روی آن به «یافت نشد»
     * می‌خورد — همان الگوی گیج‌کننده‌ای که پیش‌تر با خطای دسترسی داشتیم.
     */
    db.select({ id: projectMembers.projectId })
      .from(projectMembers).where(and(
        eq(projectMembers.userId, userId),
        eq(projectMembers.accessBlocked, false),
      )),
    db.select({ id: projectClients.projectId })
      .from(projectClients).where(and(
        eq(projectClients.userId, userId),
        eq(projectClients.accessBlocked, false),
      )),
    db.select({ tagId: tagRelations.tagId }).from(tagRelations)
      .where(and(eq(tagRelations.objectType, 'user'), eq(tagRelations.objectId, userId))),
  ]);

  const tenderRows = myTags.length === 0 || !kinds.includes('tender') ? [] : await db
    .select({ id: projects.id, tenderRoles: projects.tenderRoles })
    .from(projects)
    .where(and(eq(projects.isTender, true), isNull(projects.deletedAt)));

  const mine = new Set(myTags.map((t) => t.tagId));
  const tenderIds = tenderRows
    .filter((p) => Object.keys((p.tenderRoles ?? {}) as Record<string, unknown>)
      .map(Number).some((roleId) => mine.has(roleId)))
    .map((p) => p.id);

  return [...new Set([
    ...(kinds.includes('member') ? memberRows.map((r) => r.id) : []),
    ...(kinds.includes('client') ? clientRows.map((r) => r.id) : []),
    ...tenderIds,
  ])];
}

/**
 * پروژه‌های دفاترِ تحتِ مدیریتِ کاربر — پورتِ بخشِ «دفاترِ من» ِ فهرستِ پروژه‌ها.
 * ⚠️ `canViewProject` این‌ها را باز می‌کرد ولی فهرست نشانشان نمی‌داد: مدیرِ دفترِ
 * بی‌مجوزِ سراسری پروژه‌های دفترش را فقط با آدرسِ مستقیم می‌دید.
 */
export async function managedOfficeProjectIds(userId: number): Promise<number[]> {
  const managed = await db.select({ officeId: userOffices.officeId })
    .from(userOffices)
    .where(and(eq(userOffices.userId, userId), eq(userOffices.manages, true)));
  if (managed.length === 0) return [];
  const rows = await db.select({ id: projects.id }).from(projects)
    .where(and(inArray(projects.officeId, managed.map((m) => m.officeId)), isNull(projects.deletedAt)));
  return rows.map((r) => r.id);
}

