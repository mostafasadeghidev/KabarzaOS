import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db } from '@/db/client';
import { auditLog, projects, tags, tasks, users } from '@/db/schema';
import { tagName } from '@/db/tag-name';
import * as repo from '@/server/projects/repository';
import {
  ASSISTANT_LABEL, CLIENT_LABEL, FALLBACK_MEMBER_LABEL, nameForViewer, type ViewerContext,
} from '@/domain/access/viewer-names';
import { createTranslator } from '@/i18n/translate';
import { loadMessages } from '@/i18n/server';
import { isLocale } from '@/i18n/config';
import { getSystemConfig } from '@/server/settings/system-service';
import type { Actor } from '@/domain/access/permissions';
import { assertCanManageProject } from '@/server/projects/authority';
import { telegramCredentials } from '@/server/settings/telegram-service';
import { bold, esc, HTML, isParseError, quote, stripHtml } from './format';

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

/**
 * دکمهٔ «مشاهده در Kabarza». ⚠️ تلگرام دکمهٔ مینی‌اپ را در گروه نمی‌پذیرد، پس
 * پیوندِ معمولی؛ و فقط با `APP_URL` ِ HTTPS (پیوندِ http/localhost را رد می‌کند).
 * ⚠️ بی شمارهٔ تسک در نشانی — کارفرما ممکن است عضوِ گروه باشد.
 */
function openButton(path: string, label: string) {
  const base = (process.env.APP_URL ?? '').trim().replace(/\/$/, '');
  if (!base.startsWith('https://')) return undefined;
  return { inline_keyboard: [[{ text: `${label} ↗`, url: `${base}${path}` }]] };
}

/** پست در گروهِ پروژه — اگر وصل باشد. شکست بی‌صداست؛ کارِ اصلی را نمی‌شکند. */
export async function postToProjectGroup(
  projectId: number,
  html: string,
  replyMarkup?: { inline_keyboard: Array<Array<{ text: string; url: string }>> },
): Promise<void> {
  try {
    const [row] = await db.select({ groupId: projects.telegramGroupId }).from(projects).where(eq(projects.id, projectId));
    if (!row?.groupId) return;
    const { token } = await telegramCredentials();
    if (!token) return;
    const post = (body: Record<string, unknown>) => fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: row.groupId,
        disable_web_page_preview: true,
        ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
        ...body,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    // قالبِ ناپذیرفته ← همان متن بی‌قالب (۲.۲۳.۰)؛ پست گم نشود.
    const res = await post({ text: html, parse_mode: HTML });
    if (res?.ok === false && isParseError(await res.json().catch(() => null))) await post({ text: stripHtml(html) });
  } catch {
    // پستِ گروه جانبی است.
  }
}

/** متنِ رویداد به زبانِ پیش‌فرضِ سامانه — گروه یک زبان دارد. */
async function groupTr() {
  const { defaultLocale } = await getSystemConfig();
  const locale = isLocale(defaultLocale) ? defaultLocale : 'fa';
  return { tr: createTranslator(await loadMessages(locale), locale), locale };
}

async function hasGroup(projectId: number): Promise<boolean> {
  const [row] = await db.select({ groupId: projects.telegramGroupId }).from(projects).where(eq(projects.id, projectId));
  return Boolean(row?.groupId);
}

/**
 * نام در گروه — **همان چیزی که کارفرما در برنامه می‌بیند**، چون کارفرما ممکن
 * است عضوِ گروه باشد: عضو با نامِ نقشش («دولوپر»)، دستیارِ مدیر با همین عنوان.
 * و چون اعضا هم در گروه‌اند، نامِ کارفرما هم «کارفرما» می‌شود (قاعدهٔ عضو).
 */
async function groupNamer(projectId: number, tr: (s: string) => string) {
  const [members, clientIds, assistants] = await Promise.all([
    repo.listMembers(projectId),
    repo.listClientIds(projectId),
    repo.assistantUserIds(),
  ]);
  const roleByUser = new Map<number, string>();
  for (const m of members) if (!roleByUser.has(m.userId)) roleByUser.set(m.userId, m.roleName ?? tr(FALLBACK_MEMBER_LABEL));
  const ctx: ViewerContext = {
    managesProject: false, viewerIsClient: true, viewerIsMember: false,
    roleByUser, clientIds, assistantIds: new Set(assistants),
    labels: { member: tr(FALLBACK_MEMBER_LABEL), client: tr(CLIENT_LABEL), assistant: tr(ASSISTANT_LABEL) },
  };
  return (userId: number | null, name: string | null): string => {
    if (userId === null || !name) return '';
    if (clientIds.has(userId) && !roleByUser.has(userId)) return tr(CLIENT_LABEL);
    return nameForViewer(userId, name, ctx);
  };
}

/**
 * تسکِ تازه یا انجام‌شده ← گروه (۲.۱۶.۲: سبکِ تازه). ⚠️ تسکِ خصوصی و «پنهان
 * از کارفرما» هرگز؛ شمارهٔ تسک هم نه (کارفرما نمی‌بیندش). بی‌انتظار صدا زده
 * می‌شود؛ خطایش هیچ‌جا نمی‌رود.
 */
export async function announceTask(taskId: number, kind: 'new' | 'done', actorId?: number): Promise<void> {
  try {
    const { tr, locale } = await groupTr();
    const priority = alias(tags, 'group_priority');
    const [t] = await db.select({
      title: tasks.title, projectId: tasks.projectId, isPrivate: tasks.isPrivate, clientHidden: tasks.clientHidden,
      deletedAt: tasks.deletedAt, dueDate: tasks.dueDate, assignedTo: tasks.assignedTo, assigneeName: users.name,
      priority: tagName(locale, priority),
    }).from(tasks)
      .leftJoin(users, eq(users.id, tasks.assignedTo))
      .leftJoin(priority, eq(priority.id, tasks.priorityTagId))
      .where(eq(tasks.id, taskId));
    if (!t || t.isPrivate || t.clientHidden || t.deletedAt) return;
    if (!(await hasGroup(t.projectId))) return;
    const name = await groupNamer(t.projectId, tr);

    if (kind === 'done') {
      const [by] = actorId ? await db.select({ name: users.name }).from(users).where(eq(users.id, actorId)) : [];
      const who = by ? name(actorId!, by.name) : '';
      // ۲.۲۳.۰: همان قالبِ «تسکِ تازه» — سرتیتر، عنوانِ پررنگ، و دکمهٔ «مشاهده».
      await postToProjectGroup(
        t.projectId,
        [`✅ ${bold(tr('انجام شد'))}`, bold(t.title), ...(who ? [`<i>${esc(tr('توسطِ {name}', { name: who }))}</i>`] : [])].join('\n'),
        openButton(`/projects/${t.projectId}?tab=tasks`, tr('مشاهده در Kabarza')),
      );
      return;
    }

    // مسئول: شخص (با ماسک) یا نقش‌های تسک.
    let owner = name(t.assignedTo, t.assigneeName);
    if (!owner) {
      const roles = await repo.taskRolesFor([taskId]);
      owner = roles.map((r) => r.roleName).filter(Boolean).join('، ');
    }
    const meta = [
      owner && `👤 ${esc(owner)}`,
      t.dueDate && `📅 ${esc(t.dueDate)}`,
      t.priority && `⚡ ${esc(t.priority)}`,
    ].filter(Boolean).join(' · ');
    await postToProjectGroup(
      t.projectId,
      [`🆕 ${bold(tr('تسکِ تازه'))}`, bold(t.title), ...(meta ? [meta] : [])].join('\n'),
      openButton(`/projects/${t.projectId}?tab=tasks`, tr('مشاهده در Kabarza')),
    );
  } catch {
    // جانبی.
  }
}

/** کامنتِ تازهٔ پروژه ← گروه (کامنت را کارفرما هم در برنامه می‌بیند). */
export async function announceComment(projectId: number, userId: number, text: string): Promise<void> {
  try {
    if (!text.trim() || !(await hasGroup(projectId))) return;
    const { tr } = await groupTr();
    const [u] = await db.select({ name: users.name }).from(users).where(eq(users.id, userId));
    const who = (await groupNamer(projectId, tr))(userId, u?.name ?? '') || tr(FALLBACK_MEMBER_LABEL);
    // نقل‌قولِ بلند در تلگرام جمع‌شده نشان داده می‌شود (۲.۲۳.۰).
    await postToProjectGroup(
      projectId,
      `💬 ${bold(who)}\n${quote(text, 1500)}`,
      openButton(`/projects/${projectId}?tab=comments`, tr('پاسخ در Kabarza')),
    );
  } catch {
    // جانبی.
  }
}
