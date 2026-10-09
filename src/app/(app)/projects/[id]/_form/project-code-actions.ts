'use server';

import { requireActor } from '@/server/auth';
import { getProjectCode, setProjectCode } from '@/server/projects/task-numbers';

/** کدِ کوتاهِ پروژه (۲.۱۶.۰) — گارد در سرویس است (مدیرِ پروژه). */

export async function projectCodeAction(projectId: number): Promise<string | null> {
  try {
    return (await getProjectCode(await requireActor(), projectId)).code;
  } catch {
    return null;
  }
}

export async function saveProjectCodeAction(projectId: number, code: string): Promise<{ code?: string; error?: string }> {
  try {
    const r = await setProjectCode(await requireActor(), projectId, code);
    return r.ok ? { code: r.code } : { error: r.error };
  } catch {
    return { error: 'دسترسی ندارید.' };
  }
}
