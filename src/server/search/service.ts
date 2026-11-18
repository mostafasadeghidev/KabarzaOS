import { and, eq, ilike, isNull, inArray, or, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { accounts, projectMembers, projects, tasks as tasksTable, unitEntries, userRoles, users } from '@/db/schema';
import { entryLabel } from '@/domain/projects/unit-entry-name';
import { can, canViewSection, type Actor } from '@/domain/access/permissions';
import { visibleScopes } from '@/domain/access/guard';
import { parseTaskRef } from '@/domain/projects/task-ref';
import { ltr } from '@/i18n/bidi';
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

/** «#12» — تسک با شماره، بی کدِ پروژه (۳.۱۳.۰). فقط با «#»: عددِ تنها می‌تواند بخشی از نام باشد. */
const LOCAL_REF = /^#\s*[0-9۰-۹٠-٩]{1,7}$/;

/** حداکثرِ نتیجه برای «#12» — برای مدیرِ کل که روی همهٔ پروژه‌هاست شلوغ نشود. */
const LOCAL_REF_LIMIT = 8;

/**
 * «#12» در همهٔ پروژه‌هایی که بیننده می‌بیند (۳.۱۳.۰). ترتیب: تسک‌هایی که مسئولش خودِ اوست، بعد
 * پروژه‌هایی که عضوشان است، بعد بقیه (تازه‌ترین پروژه اول). ⚠️ هر نامزد از همان گاردِ
 * `findTaskByRef` می‌گذرد — تسکِ خصوصی، پنهان از کارفرما یا پروژهٔ بی‌دسترسی پیدا نمی‌شود.
 */
async function findLocalRefs(actor: Actor, number: number): Promise<SearchHit[]> {
  const candidates = await db
    .select({ projectId: tasksTable.projectId, title: projects.title })
    .from(tasksTable)
    .innerJoin(projects, eq(projects.id, tasksTable.projectId))
    .leftJoin(projectMembers, and(eq(projectMembers.projectId, projects.id), eq(projectMembers.userId, actor.id)))
    .where(and(
      eq(tasksTable.number, number), isNull(tasksTable.deletedAt), isNull(projects.deletedAt),
      inArray(projects.scope, visibleScopes(actor)),
    ))
    .orderBy(
      sql`(${tasksTable.assignedTo} = ${actor.id}) desc nulls last`,
      sql`(${projectMembers.userId} is not null) desc`,
      sql`${projects.id} desc`,
    )
    .limit(LOCAL_REF_LIMIT * 2);
  const out: SearchHit[] = [];
  for (const c of candidates) {
    if (out.length >= LOCAL_REF_LIMIT) break;
    const t = await findTaskByRef(actor, { kind: 'local', number }, c.projectId);
    if (t) out.push({ kind: 'task', id: t.taskId, label: `${ltr(t.ref)} · ${t.title} — ${c.title}`, href: `/t/${t.ref}` });
  }
  return out;
}

export async function search(actor: Actor, rawQuery: string): Promise<SearchHit[]> {
  const q = rawQuery.trim();
  // «#5» کوتاه‌تر از سه حرف است ولی دقیق — فقط تسک‌ها، بی جستجوی نام.
  if (LOCAL_REF.test(q)) {
    const ref = parseTaskRef(q);
    return ref?.kind === 'local' ? findLocalRefs(actor, ref.number) : [];
  }
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
      kind: 'task' as const, id: t.taskId, label: `${ltr(t.ref)} · ${t.title}`, href: `/t/${t.ref}`,
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
