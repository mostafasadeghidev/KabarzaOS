import { and, eq, isNull, ne, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { auditLog, projects, tasks } from '@/db/schema';
import type { Actor } from '@/domain/access/permissions';
import {
  normalizeProjectCode, parseTaskRef, projectCodeOf, suggestProjectCode, type ParsedTaskRef,
} from '@/domain/projects/task-ref';
import { assertCanManageProject, isClientOnly } from '@/server/projects/authority';
import { getTaskDetail } from '@/server/projects/service';

/**
 * شمارهٔ تسک و کدِ پروژه (۲.۱۶.۰) — بخشِ سرور.
 *
 * ⚠️ خودِ شماره را تریگرِ پایگاه‌داده می‌دهد (مهاجرتِ ۰۰۴۹)؛ اینجا فقط کدِ
 * پروژه و پیدا کردنِ تسک از روی ارجاع است. پیدا کردن همیشه از گاردِ
 * `getTaskDetail` می‌گذرد (خصوصی/پنهان از کارفرما/دسترسیِ پروژه)، و کسی که در آن
 * پروژه فقط کارفرماست اصلاً با شماره چیزی پیدا نمی‌کند — شماره را نمی‌بیند.
 */

/** کدِ آزادِ پیشنهادی برای پروژهٔ تازه — اگر گرفته شده بود، + شناسه. */
export async function assignDefaultProjectCode(projectId: number, title: string): Promise<string> {
  const wanted = suggestProjectCode(title, projectId);
  for (const code of [wanted, `${wanted.slice(0, 3)}${projectId}`, `P${projectId}`]) {
    const [taken] = await db.select({ id: projects.id }).from(projects)
      .where(and(sql`upper(${projects.code}) = ${code}`, ne(projects.id, projectId)));
    if (!taken) {
      await db.update(projects).set({ code }).where(eq(projects.id, projectId));
      return code;
    }
  }
  return '';
}

export async function getProjectCode(actor: Actor, projectId: number) {
  await assertCanManageProject(actor, projectId);
  const [row] = await db.select({ id: projects.id, code: projects.code }).from(projects).where(eq(projects.id, projectId));
  return { code: row ? projectCodeOf(row) : '' };
}

export type SetCodeResult = { ok: true; code: string } | { ok: false; error: string };

/**
 * عوض‌کردنِ کدِ پروژه — فقط مدیرِ همان پروژه. ⚠️ پیوندهای قدیمیِ «ALZ-325»
 * با کدِ تازه دیگر پیدا نمی‌شوند؛ پیوندِ مستقیم (`?task=`) سرِ جایش می‌ماند.
 */
export async function setProjectCode(actor: Actor, projectId: number, raw: string): Promise<SetCodeResult> {
  await assertCanManageProject(actor, projectId);
  const code = normalizeProjectCode(raw);
  if (!code) return { ok: false, error: 'کد باید ۲ تا ۶ حرف یا رقمِ انگلیسی باشد و با حرف شروع شود.' };
  const [taken] = await db.select({ id: projects.id }).from(projects)
    .where(and(sql`upper(${projects.code}) = ${code}`, ne(projects.id, projectId)));
  if (taken) return { ok: false, error: 'این کد مالِ پروژهٔ دیگری است.' };
  const [before] = await db.select({ code: projects.code }).from(projects).where(eq(projects.id, projectId));
  await db.update(projects).set({ code, updatedAt: new Date() }).where(eq(projects.id, projectId));
  await db.insert(auditLog).values({
    actorType: 'user', actorId: actor.id, action: 'project.code', objectType: 'project', objectId: projectId,
    before: { code: before?.code ?? '' }, after: { code },
  });
  return { ok: true, code };
}

/** پروژهٔ یک کد — «ALZ» یا پیش‌فرضِ «P12» برای پروژهٔ بی‌کد. */
async function projectIdByCode(code: string): Promise<number | null> {
  const [row] = await db.select({ id: projects.id }).from(projects)
    .where(and(sql`upper(${projects.code}) = ${code}`, isNull(projects.deletedAt)));
  if (row) return row.id;
  const fallback = /^P(\d{1,9})$/.exec(code);
  if (!fallback) return null;
  const [p] = await db.select({ id: projects.id, code: projects.code }).from(projects)
    .where(and(eq(projects.id, Number(fallback[1])), isNull(projects.deletedAt)));
  return p && p.code === '' ? p.id : null;
}

export interface FoundTask {
  taskId: number;
  projectId: number;
  number: number;
  title: string;
  ref: string;
}

/**
 * ارجاع ← تسک، فقط اگر همین بیننده آن را می‌بیند و در آن پروژه فقط کارفرما
 * نیست. «#325» پروژه می‌خواهد (`projectId`)؛ «ALZ-325» نه. ناپیدا ← null.
 */
export async function findTaskByRef(
  actor: Actor,
  input: string | ParsedTaskRef,
  projectId?: number,
): Promise<FoundTask | null> {
  const ref = typeof input === 'string' ? parseTaskRef(input) : input;
  if (!ref) return null;
  const pid = ref.kind === 'global' ? await projectIdByCode(ref.code) : projectId ?? null;
  if (!pid) return null;
  const [row] = await db.select({ id: tasks.id }).from(tasks)
    .where(and(eq(tasks.projectId, pid), eq(tasks.number, ref.number), isNull(tasks.deletedAt)));
  if (!row) return null;
  try {
    if (await isClientOnly(actor, pid)) return null;
    const detail = await getTaskDetail(actor, row.id);
    const [p] = await db.select({ id: projects.id, code: projects.code }).from(projects).where(eq(projects.id, pid));
    return {
      taskId: row.id,
      projectId: pid,
      number: ref.number,
      title: detail.task.title,
      ref: `${projectCodeOf(p ?? { id: pid })}-${ref.number}`,
    };
  } catch {
    // ⚠️ «ممنوع» و «یافت نشد» یکی‌اند — وجودِ تسکِ پنهان لو نمی‌رود.
    return null;
  }
}
