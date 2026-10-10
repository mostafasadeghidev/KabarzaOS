import { and, eq, ilike, isNull, inArray, or, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { accounts, projects, unitEntries, userRoles, users } from '@/db/schema';
import { entryLabel } from '@/domain/projects/unit-entry-name';
import { can, canViewSection, type Actor } from '@/domain/access/permissions';
import { visibleScopes } from '@/domain/access/guard';
import { parseTaskRef } from '@/domain/projects/task-ref';
import { findTaskByRef } from '@/server/projects/task-numbers';

/**
 * جستجوی سراسری — پالتِ فرمان (Ctrl+K).
 *
 * ⚠️ دو قاعده:
 *  ۱. **حداقل سه حرف** — با یک یا دو حرف، نتیجه آن‌قدر زیاد است که بی‌فایده
 *     می‌شود و کوئری هم بی‌دلیل سنگین.
 *  ۲. **هر دسته پشتِ مجوزِ خودش** — جستجو یک درِ پشتی نیست: کسی که پروژه‌ها
 *     را نمی‌بیند، نامِ پروژه را در نتایج هم نمی‌بیند.
 */

export const MIN_QUERY_LENGTH = 3;

export interface SearchHit {
  kind: 'project' | 'member' | 'client' | 'account' | 'task' | 'unit';
  id: number;
  label: string;
  href: string;
}

export async function search(actor: Actor, rawQuery: string): Promise<SearchHit[]> {
  const q = rawQuery.trim();
  if (q.length < MIN_QUERY_LENGTH) return [];
  const pattern = `%${q}%`;

  const tasks: Array<Promise<SearchHit[]>> = [];

  /**
   * «ALZ-325» (۲.۱۶.۰) — تسک با شمارهٔ کامل. ⚠️ گاردِ دیدنِ تسک در
   * `findTaskByRef` است (خصوصی، پنهان از کارفرما، کارفرمای همان پروژه).
   */
  const ref = parseTaskRef(q);
  if (ref?.kind === 'global') {
    tasks.push(findTaskByRef(actor, ref).then((t) => (t ? [{
      kind: 'task' as const, id: t.taskId, label: `${t.ref} · ${t.title}`, href: `/t/${t.ref}`,
    }] : [])));
  }

  if (canViewSection(actor, 'projects')) {
    tasks.push(
      db.select({ id: projects.id, title: projects.title })
        .from(projects)
        .where(and(
          isNull(projects.deletedAt),
          inArray(projects.scope, visibleScopes(actor)),
          ilike(projects.title, pattern),
        ))
        .orderBy(projects.title)
        .limit(6)
        .then((rows) => rows.map((r): SearchHit => ({
          kind: 'project', id: r.id, label: r.title, href: `/projects/${r.id}`,
        }))),
    );
  }

  /**
   * ردیف‌های کارکردِ نام‌دار (۲.۲۱.۰) — «Simon Zickert media - CAT». مدیرِ سراسریِ
   * پروژه‌ها همه را می‌بیند؛ بقیه فقط ردیف‌های **خودشان** را (مبلغ و ساعتِ کارکرد
   * حقوقِ عضو است، پس نامِ ردیفِ دیگران هم از راهِ جستجو لو نمی‌رود).
   * پیوند به همان ردیف در تبِ «اطلاعات» می‌رود.
   */
  tasks.push(
    db.select({ id: unitEntries.id, projectId: unitEntries.projectId, name: unitEntries.name, title: projects.title })
      .from(unitEntries)
      .innerJoin(projects, eq(projects.id, unitEntries.projectId))
      .where(and(
        isNull(projects.deletedAt),
        inArray(projects.scope, visibleScopes(actor)),
        sql`${unitEntries.name} <> ''`,
        or(ilike(unitEntries.name, pattern), ilike(projects.title, pattern)),
        canViewSection(actor, 'projects') ? sql`true` : eq(unitEntries.userId, actor.id),
      ))
      .orderBy(projects.title, unitEntries.name)
      .limit(6)
      .then((rows) => rows.map((r): SearchHit => ({
        kind: 'unit', id: r.id, label: entryLabel(r.title, r.name), href: `/projects/${r.projectId}#unit-${r.id}`,
      }))),
  );

  if (canViewSection(actor, 'members')) {
    tasks.push(
      db.selectDistinct({ id: users.id, name: users.name, role: userRoles.role })
        .from(users)
        .innerJoin(userRoles, eq(userRoles.userId, users.id))
        .where(and(
          isNull(users.deletedAt),
          inArray(userRoles.role, ['member', 'client']),
          or(ilike(users.name, pattern), ilike(users.email, pattern)),
        ))
        .orderBy(users.name)
        .limit(6)
        .then((rows) => rows.map((r): SearchHit => ({
          kind: r.role === 'client' ? 'client' : 'member',
          id: r.id,
          label: r.name,
          href: r.role === 'client' ? '/clients' : '/members',
        }))),
    );
  }

  if (can(actor, 'finance.view')) {
    tasks.push(
      db.select({ id: accounts.id, name: accounts.name })
        .from(accounts)
        .where(and(inArray(accounts.scope, visibleScopes(actor)), ilike(accounts.name, pattern)))
        .orderBy(accounts.name)
        .limit(4)
        .then((rows) => rows.map((r): SearchHit => ({
          kind: 'account', id: r.id, label: r.name, href: `/finance?account=${r.id}`,
        }))),
    );
  }

  const groups = await Promise.all(tasks);
  return groups.flat();
}

export { sql };
