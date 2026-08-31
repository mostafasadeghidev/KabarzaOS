import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { currencies, projectMembers, projectPayments, projects } from '@/db/schema';
import { type Actor } from '@/domain/access/permissions';

/**
 * تسویهٔ عضوِ سابق — دادهٔ نمای «فقط مالی».
 *
 * ⚠️ عمداً **همهٔ** عضویت‌های او را می‌آورد، نه فقط پروژه‌های جاری: پروژه‌های
 * یک عضوِ سابق معمولاً بسته‌اند و اگر فیلتر شوند، ماندهٔ طلبش ناپدید می‌شود.
 */
export async function getSettlement(actor: Actor) {
  const memberships = await db
    .selectDistinct({ projectId: projectMembers.projectId })
    .from(projectMembers)
    .where(eq(projectMembers.userId, actor.id));

  const projectIds = memberships.map((m) => m.projectId);
  if (projectIds.length === 0) return { rows: [], noProjectPayouts: [] };

  const [agreed, paid, titles, noProject] = await Promise.all([
    db.select({
      projectId: projectMembers.projectId,
      total: sql<string>`coalesce(sum(${projectMembers.agreedAmount}), 0)::text`,
      currencyCode: currencies.code,
    })
      .from(projectMembers)
      .leftJoin(currencies, eq(currencies.id, projectMembers.currencyId))
      .where(and(
        eq(projectMembers.userId, actor.id),
        inArray(projectMembers.projectId, projectIds),
      ))
      .groupBy(projectMembers.projectId, currencies.code),

    db.select({
      projectId: projectPayments.projectId,
      total: sql<string>`coalesce(sum(coalesce(${projectPayments.amountSettled}, ${projectPayments.amount})), 0)::text`,
    })
      .from(projectPayments)
      .where(and(
        eq(projectPayments.userId, actor.id),
        eq(projectPayments.direction, 'member_payout'),
        inArray(projectPayments.projectId, projectIds),
      ))
      .groupBy(projectPayments.projectId),

    db.select({ id: projects.id, title: projects.title })
      .from(projects).where(inArray(projects.id, projectIds)),

    // پرداخت‌های بدونِ پروژه — فقط‌خواندنی، و اگر نباشد اصلاً نمایش داده نمی‌شود.
    db.select({
      id: projectPayments.id,
      amount: projectPayments.amount,
      paidAt: projectPayments.paidAt,
      note: projectPayments.note,
    })
      .from(projectPayments)
      .where(and(
        eq(projectPayments.userId, actor.id),
        eq(projectPayments.direction, 'member_payout'),
        sql`${projectPayments.projectId} is null`,
      )),
  ]);

  const paidBy = new Map(paid.map((p) => [p.projectId, p.total]));
  const titleBy = new Map(titles.map((t) => [t.id, t.title]));

  return {
    rows: agreed.map((a) => {
      const paidTotal = Number(paidBy.get(a.projectId) ?? 0);
      const agreedTotal = Number(a.total);
      return {
        projectId: a.projectId,
        // ⚠️ نامِ پروژه برچسبِ ساده است، نه پیوند — عضوِ سابق نباید بتواند
        // داخلِ پروژه برود.
        title: titleBy.get(a.projectId) ?? `#${a.projectId}`,
        agreed: agreedTotal.toFixed(2),
        paid: paidTotal.toFixed(2),
        remaining: Math.max(0, agreedTotal - paidTotal).toFixed(2),
        currencyCode: a.currencyCode,
      };
    }),
    noProjectPayouts: noProject.map((p) => ({
      id: p.id,
      amount: Number(p.amount).toFixed(2),
      paidAt: p.paidAt ? p.paidAt.toISOString().slice(0, 10) : null,
      note: p.note,
    })),
  };
}
