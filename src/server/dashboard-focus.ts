import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db } from '@/db/client';
import { comments, projects, tags, tasks, tenderBids, users } from '@/db/schema';
import { tagName } from '@/db/tag-name';
import { currentLocale, getT } from '@/i18n/server';
import { assertCanView, visibleScopes } from '@/domain/access/guard';
import type { Actor } from '@/domain/access/permissions';
import { isDeadlineSoon } from '@/domain/projects/lifecycle';
import {
  daysUntil, deadlineBadge, excerptWords, groupByProject, openThreads, type FocusView,
} from '@/domain/dashboard/focus';

/**
 * فهرست‌های متمرکزِ داشبورد — پورتِ `Focus_Page::render` / `render_review`.
 *
 * ⚠️ همان دامنهٔ داشبورد: پروژه‌های scope ِ مجاز و **بایگانی‌نشده**؛ کارت و
 * فهرست باید یک عدد بدهند (R-RBAC-12).
 */

export interface FocusProject {
  id: number;
  title: string;
  statusName: string | null;
  statusGroup: string | null;
  badge: string;
}

export interface FocusGroup {
  id: number;
  title: string;
  statusName: string | null;
  statusGroup: string | null;
  items: Array<{ label: string; who: string }>;
}

export interface FocusData {
  view: FocusView;
  /** فهرست‌های پروژه‌محور (مناقصه / ددلاین). */
  projects: FocusProject[];
  /** فهرست‌های موردمحور (تسک / کامنت)، گروه‌بندی به‌ازای پروژه. */
  groups: FocusGroup[];
}

export async function getFocusList(
  actor: Actor,
  view: FocusView,
  today: string = new Date().toISOString().slice(0, 10),
): Promise<FocusData> {
  assertCanView(actor, 'projects');
  const [t, locale] = await Promise.all([getT(), currentLocale()]);

  const rows = await db
    .select({
      id: projects.id,
      title: projects.title,
      deadline: projects.deadline,
      isArchived: projects.isArchived,
      isTender: projects.isTender,
      statusGroup: tags.statusGroup,
      statusName: tagName(locale),
    })
    .from(projects)
    .leftJoin(tags, eq(tags.id, projects.statusTagId))
    .where(and(isNull(projects.deletedAt), inArray(projects.scope, visibleScopes(actor))))
    .orderBy(projects.title);

  const active = rows.filter((p) => !p.isArchived);
  const ids = active.map((p) => p.id);
  const byId = new Map(active.map((p) => [p.id, p]));
  if (ids.length === 0) return { view, projects: [], groups: [] };
  const chip = (p: (typeof active)[number]) => ({
    id: p.id, title: p.title, statusName: p.statusName, statusGroup: p.statusGroup,
  });

  if (view === 'bids_pending') {
    const bids = await db.select({ projectId: tenderBids.projectId, status: tenderBids.status })
      .from(tenderBids).where(inArray(tenderBids.projectId, ids));
    const count = new Map<number, number>();
    const pending = new Set<number>();
    const approved = new Set<number>();
    for (const b of bids) {
      count.set(b.projectId, (count.get(b.projectId) ?? 0) + 1);
      if (b.status === 'pending') pending.add(b.projectId);
      if (b.status === 'approved') approved.add(b.projectId);
    }
    // پورتِ `bids_pending_ids`: مناقصهٔ **باز** (گروهِ lead) با پیشنهادِ در انتظار و بدونِ برنده.
    const list = active.filter((p) => p.isTender && p.statusGroup === 'lead' && pending.has(p.id) && !approved.has(p.id));
    return {
      view,
      groups: [],
      projects: list.map((p) => ({ ...chip(p), badge: t('{n} پیشنهاد', { n: count.get(p.id) ?? 0 }) })),
    };
  }

  if (view === 'deadline_soon') {
    // پورتِ `deadline_soon_ids`: ۷ روزِ آینده، منجمد بیرون، نزدیک‌تر اول.
    const list = active
      .filter((p) => isDeadlineSoon(p, today))
      .map((p) => ({ p, days: daysUntil(today, p.deadline!) }))
      .sort((a, b) => a.days - b.days);
    return {
      view,
      groups: [],
      projects: list.map(({ p, days }) => ({ ...chip(p), badge: deadlineBadge(days, t) })),
    };
  }

  if (view === 'tasks_review') {
    const status = alias(tags, 'status_tag');
    const priority = alias(tags, 'priority_tag');
    const list = await db
      .select({ projectId: tasks.projectId, label: tasks.title, who: users.name })
      .from(tasks)
      .innerJoin(status, eq(status.id, tasks.statusTagId))
      .leftJoin(priority, eq(priority.id, tasks.priorityTagId))
      .leftJoin(users, eq(users.id, tasks.assignedTo))
      .where(and(inArray(tasks.projectId, ids), isNull(tasks.deletedAt), eq(status.isReview, true)))
      // پورتِ `order_priority`: اولویتِ بالا اول (sort_order صعودی، بی‌اولویت آخر)، تازه‌تر اول.
      .orderBy(sql`(${priority.sortOrder} is null)`, asc(priority.sortOrder), desc(tasks.id));
    return { view, projects: [], groups: toGroups(list.map((r) => ({ projectId: r.projectId, label: r.label, who: r.who ?? t('بدون مسئول') }))) };
  }

  // comments_review — پورتِ `threads_for_projects` + وضعیتِ باز.
  const all = await db
    .select({
      id: comments.id, projectId: comments.projectId, parentId: comments.parentId,
      status: comments.status, body: comments.body, userId: comments.userId, userName: users.name,
    })
    .from(comments)
    .leftJoin(users, eq(users.id, comments.userId))
    .where(and(inArray(comments.projectId, ids), eq(comments.type, 'comment')))
    .orderBy(asc(comments.id));
  const threads = openThreads(all).map(({ root, latest }) => ({
    projectId: root.projectId!,
    label: excerptWords(latest.body) || t('(بدون متن)'),
    who: latest.userName ?? `#${latest.userId ?? 0}`,
  }));
  return { view, projects: [], groups: toGroups(threads) };

  function toGroups(items: Array<{ projectId: number; label: string; who: string }>): FocusGroup[] {
    return [...groupByProject(items)].flatMap(([projectId, list]) => {
      const p = byId.get(projectId);
      return p ? [{ ...chip(p), items: list.map(({ label, who }) => ({ label, who })) }] : [];
    });
  }
}
