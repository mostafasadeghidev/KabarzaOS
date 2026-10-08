import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { auditLog, projects, tasks, users } from '@/db/schema';
import { createTranslator } from '@/i18n/translate';
import { loadMessages } from '@/i18n/server';
import { isLocale } from '@/i18n/config';
import { getSystemConfig } from '@/server/settings/system-service';
import type { Actor } from '@/domain/access/permissions';
import { assertCanManageProject } from '@/server/projects/authority';
import { telegramCredentials } from '@/server/settings/telegram-service';

/**
 * گروهِ تلگرامِ پروژه (۲.۱۴.۰).
 *
 * مدیرِ پروژه در برنامه «وصل‌کردنِ گروه» می‌زند ← لینکِ `t.me/<bot>?startgroup=<token>`
 * ← ربات را به گروهِ تلگرامیِ خودشان اضافه می‌کند ← ربات `/start <token>` را در همان
 * گروه می‌گیرد و گروه را به پروژه می‌بندد. از آن به بعد رویدادهای پروژه (کامنتِ
 * تازه، تسکِ تازه، تسکِ انجام‌شده) آنجا هم پست می‌شوند.
 *
 * ⚠️ حریم: فقط رویدادهایی که **همهٔ اعضای پروژه، کارفرما هم،** در برنامه می‌بینند —
 * تسکِ خصوصی و «پنهان از کارفرما» هرگز به گروه نمی‌رود. ربات در گروه به هیچ
 * دستوری جز همان `/start <token>` جواب نمی‌دهد؛ دادهٔ کسی را آنجا نمی‌پرسد.
 * ⚠️ توکن یک‌بارمصرف است؛ وصلِ دوباره لینکِ تازه می‌خواهد.
 */

async function audit(actor: Actor, action: string, projectId: number, after: Record<string, unknown> = {}) {
  await db.insert(auditLog).values({
    actorType: 'user', actorId: actor.id, action, objectType: 'project', objectId: projectId, after,
  });
}

export async function projectGroupStatus(actor: Actor, projectId: number) {
  await assertCanManageProject(actor, projectId);
  const [row] = await db.select({ groupId: projects.telegramGroupId }).from(projects).where(eq(projects.id, projectId));
  const { username } = await telegramCredentials();
  return { connected: (row?.groupId ?? '') !== '', botReady: username !== '' };
}

/** لینکِ «افزودنِ ربات به گروه» با توکنِ تازه. */
export async function createProjectGroupLink(actor: Actor, projectId: number): Promise<string | null> {
  await assertCanManageProject(actor, projectId);
  const { username, token } = await telegramCredentials();
  if (!username || !token) return null;
  const linkToken = randomBytes(18).toString('base64url');
  await db.update(projects).set({ telegramGroupToken: linkToken }).where(eq(projects.id, projectId));
  return `https://t.me/${username}?startgroup=${linkToken}`;
}

export async function disconnectProjectGroup(actor: Actor, projectId: number): Promise<void> {
  await assertCanManageProject(actor, projectId);
  await db.update(projects).set({ telegramGroupId: '', telegramGroupToken: null }).where(eq(projects.id, projectId));
  await audit(actor, 'project.telegram_group_off', projectId);
}

/** «/start <token>» در گروه ← گروه به پروژه بسته می‌شود. نامِ پروژه یا null. */
export async function linkProjectGroup(linkToken: string, chatId: number): Promise<string | null> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(linkToken)) return null;
  const [row] = await db.select({ id: projects.id, title: projects.title }).from(projects)
    .where(eq(projects.telegramGroupToken, linkToken));
  if (!row) return null;
  await db.update(projects).set({ telegramGroupId: String(chatId), telegramGroupToken: null }).where(eq(projects.id, row.id));
  await db.insert(auditLog).values({
    actorType: 'system', actorId: null, action: 'project.telegram_group_on', objectType: 'project', objectId: row.id, after: { chatId },
  });
  return row.title;
}

/** پست در گروهِ پروژه — اگر وصل باشد. شکست بی‌صداست؛ کارِ اصلی را نمی‌شکند. */
export async function postToProjectGroup(projectId: number, text: string): Promise<void> {
  try {
    const [row] = await db.select({ groupId: projects.telegramGroupId }).from(projects).where(eq(projects.id, projectId));
    if (!row?.groupId) return;
    const { token } = await telegramCredentials();
    if (!token) return;
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: row.groupId, text: text.slice(0, 3900), disable_web_page_preview: true }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    // پستِ گروه جانبی است.
  }
}

/** متنِ رویداد به زبانِ پیش‌فرضِ سامانه — گروه یک زبان دارد. */
async function groupTr() {
  const { defaultLocale } = await getSystemConfig();
  const locale = isLocale(defaultLocale) ? defaultLocale : 'fa';
  return createTranslator(await loadMessages(locale), locale);
}

async function hasGroup(projectId: number): Promise<string | null> {
  const [row] = await db.select({ groupId: projects.telegramGroupId, title: projects.title }).from(projects).where(eq(projects.id, projectId));
  return row?.groupId ? row.title : null;
}

/**
 * تسکِ تازه یا انجام‌شده ← گروه. ⚠️ تسکِ خصوصی و «پنهان از کارفرما» هرگز.
 * بی‌انتظار صدا زده می‌شود؛ خطایش هیچ‌جا نمی‌رود.
 */
export async function announceTask(taskId: number, kind: 'new' | 'done'): Promise<void> {
  try {
    const [t] = await db.select({
      title: tasks.title, projectId: tasks.projectId, isPrivate: tasks.isPrivate, clientHidden: tasks.clientHidden, deletedAt: tasks.deletedAt,
    }).from(tasks).where(eq(tasks.id, taskId));
    if (!t || t.isPrivate || t.clientHidden || t.deletedAt) return;
    const project = await hasGroup(t.projectId);
    if (!project) return;
    const tr = await groupTr();
    const head = kind === 'new' ? `🆕 ${tr('تسکِ تازه در «{project}»:', { project })}` : `✅ ${tr('انجام شد در «{project}»:', { project })}`;
    await postToProjectGroup(t.projectId, `${head}
${t.title}`);
  } catch {
    // جانبی.
  }
}

/** کامنتِ تازهٔ پروژه ← گروه (کامنت را کارفرما هم در برنامه می‌بیند). */
export async function announceComment(projectId: number, userId: number, text: string): Promise<void> {
  try {
    const project = await hasGroup(projectId);
    if (!project || !text.trim()) return;
    const [u] = await db.select({ name: users.name }).from(users).where(eq(users.id, userId));
    const tr = await groupTr();
    await postToProjectGroup(projectId, `💬 ${tr('{name} در «{project}» نوشت:', { name: u?.name ?? '', project })}
${text.slice(0, 1500)}`);
  } catch {
    // جانبی.
  }
}
