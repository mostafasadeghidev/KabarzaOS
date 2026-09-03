'use server';

import { requireActor } from '@/server/auth';
import { getTaskFormOptions } from '@/server/projects/service';

/**
 * گزینه‌های فرمِ «افزودنِ سریع» برای یک پروژه.
 *
 * ⚠️ همان `getTaskFormOptions` ِ صفحهٔ پروژه — با همان گاردها؛ اینجا فقط
 * تکه‌های موردِ نیازِ فرمِ کوتاه برداشته می‌شوند. پروژه‌ای که کاربر حقِ
 * تعامل با آن را ندارد، همان‌جا پرتاب می‌کند و ما فهرستِ خالی می‌دهیم.
 */
export interface QuickTaskOptions {
  roles: Array<{ id: number; name: string }>;
  assignees: Array<{ id: number; label: string }>;
  priorities: Array<{ id: number; name: string }>;
}

const EMPTY: QuickTaskOptions = { roles: [], assignees: [], priorities: [] };

export async function loadQuickTaskOptionsAction(projectId: number): Promise<QuickTaskOptions> {
  if (!Number.isInteger(projectId) || projectId <= 0) return EMPTY;
  try {
    const actor = await requireActor();
    const options = await getTaskFormOptions(actor, projectId);
    return {
      roles: options.roles,
      assignees: options.assignees.map((a) => ({ id: a.userId, label: a.label })),
      priorities: options.priorities.map((p) => ({ id: p.id, name: p.name })),
    };
  } catch {
    return EMPTY;
  }
}
