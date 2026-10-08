'use server';

import { requireActor } from '@/server/auth';
import { createProjectGroupLink, disconnectProjectGroup, projectGroupStatus } from '@/server/telegram/group';

/** گروهِ تلگرامِ پروژه (۲.۱۴.۰) — گارد در سرویس است (مدیرِ پروژه). */

export async function projectGroupStatusAction(projectId: number) {
  try {
    return await projectGroupStatus(await requireActor(), projectId);
  } catch {
    return null;
  }
}

export async function projectGroupLinkAction(projectId: number): Promise<{ link?: string; error?: string }> {
  try {
    const link = await createProjectGroupLink(await requireActor(), projectId);
    return link ? { link } : { error: 'ربات تلگرام هنوز راه‌اندازی نشده (تنظیمات ← تلگرام).' };
  } catch {
    return { error: 'دسترسی ندارید.' };
  }
}

export async function projectGroupDisconnectAction(projectId: number): Promise<{ error?: string }> {
  try {
    await disconnectProjectGroup(await requireActor(), projectId);
    return {};
  } catch {
    return { error: 'دسترسی ندارید.' };
  }
}
