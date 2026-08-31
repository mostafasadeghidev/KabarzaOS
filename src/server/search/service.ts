import { and, eq, ilike, isNull, inArray, or, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { accounts, projects, userRoles, users } from '@/db/schema';
import { can, canViewSection, type Actor } from '@/domain/access/permissions';
import { visibleScopes } from '@/domain/access/guard';

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
  kind: 'project' | 'member' | 'client' | 'account';
  id: number;
  label: string;
  href: string;
}

export async function search(actor: Actor, rawQuery: string): Promise<SearchHit[]> {
  const q = rawQuery.trim();
  if (q.length < MIN_QUERY_LENGTH) return [];
  const pattern = `%${q}%`;

  const tasks: Array<Promise<SearchHit[]>> = [];

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
