import { randomBytes } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db } from '@/db/client';
import { auditLog, projectMembers, projects, tags, taskRoles, tasks, userRoles, users } from '@/db/schema';
import { tagName } from '@/db/tag-name';
import * as repo from '@/server/projects/repository';
import {
  ASSISTANT_LABEL, CLIENT_LABEL, FALLBACK_MEMBER_LABEL, nameForViewer, type ViewerContext,
} from '@/domain/access/viewer-names';
import { createTranslator } from '@/i18n/translate';
import { loadMessages } from '@/i18n/server';
import { isLocale, type Locale } from '@/i18n/config';
import { getSystemConfig } from '@/server/settings/system-service';
import type { Actor } from '@/domain/access/permissions';
import { assertCanManageProject } from '@/server/projects/authority';
import { telegramCredentials } from '@/server/settings/telegram-service';
import { bold, esc, HTML, isParseError, quote, stripHtml } from './format';
import { miniAppDirectLink } from '@/domain/telegram/webapp';
import { BOT_ADMIN_RIGHTS, inviteToGroup, revokeInvite, setupGroup } from './group-members';

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
  const [row] = await db.select({ groupId: projects.telegramGroupId, invite: projects.telegramGroupInvite })
    .from(projects).where(eq(projects.id, projectId));
  const { username } = await telegramCredentials();
  // `inviteReady`: ربات مدیر است و لینکِ عضویت دارد (۲.۳۶.۰) — وگرنه پنل می‌گوید «ربات را مدیر کنید».
  return { connected: (row?.groupId ?? '') !== '', botReady: username !== '', inviteReady: (row?.invite ?? '') !== '' };
}

/** لینکِ «افزودنِ ربات به گروه» با توکنِ تازه. */
export async function createProjectGroupLink(actor: Actor, projectId: number): Promise<string | null> {
  await assertCanManageProject(actor, projectId);
  const { username, token } = await telegramCredentials();
  if (!username || !token) return null;
  const linkToken = randomBytes(18).toString('base64url');
  await db.update(projects).set({ telegramGroupToken: linkToken }).where(eq(projects.id, projectId));
  // ⚠️ `admin=`: تلگرام ربات را از همان اول **مدیر** اضافه می‌کند (۲.۳۶.۰) و پیش از آن
  // فهرستِ همین دسترسی‌ها را به کاربر نشان می‌دهد — دعوت و بیرون‌کردن بی آن نمی‌شود.
  return `https://t.me/${username}?startgroup=${linkToken}&admin=${BOT_ADMIN_RIGHTS}`;
}

/**
 * «دعوتِ دوبارهٔ اعضا» (۲.۳۶.۰) — مثلاً وقتی ربات بعداً مدیر شد. فقط مدیرِ پروژه.
 * ربات هنوز مدیر نیست ← `null`.
 */
export async function resendGroupInvites(actor: Actor, projectId: number): Promise<number | null> {
  await assertCanManageProject(actor, projectId);
  const { state, sent } = await setupGroup(projectId);
  if (state === 'need_admin' || state === 'none') return null;
  const n = state === 'invited' ? sent : await inviteToGroup(projectId);
  await audit(actor, 'project.telegram_group_invite', projectId, { sent: n });
  return n;
}

export async function disconnectProjectGroup(actor: Actor, projectId: number): Promise<void> {
  await assertCanManageProject(actor, projectId);
  // لینکِ عضویتِ گروهِ جداشده باطل می‌شود — دیگر کسی با آن نیاید.
  await revokeInvite(projectId).catch(() => {});
  await db.update(projects).set({ telegramGroupId: '', telegramGroupToken: null }).where(eq(projects.id, projectId));
  await audit(actor, 'project.telegram_group_off', projectId);
}

/** «/start <token>» در گروه ← گروه به پروژه بسته می‌شود. نامِ پروژه یا null. */
export async function linkProjectGroup(linkToken: string, chatId: number): Promise<string | null> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(linkToken)) return null;
  const [row] = await db.select({ id: projects.id, title: projects.title }).from(projects)
    .where(eq(projects.telegramGroupToken, linkToken));
  if (!row) return null;
  // گروهِ قبلیِ همین پروژه: لینکش باطل (۲.۳۶.۰).
  await revokeInvite(row.id).catch(() => {});
  await db.update(projects).set({ telegramGroupId: String(chatId), telegramGroupToken: null, telegramGroupInvite: '' }).where(eq(projects.id, row.id));
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
export async function openButton(path: string, label: string) {
  // ۲.۴۰.۰: با نامِ کوتاهِ مینی‌اپ، لینکِ مستقیم — داخلِ تلگرام باز می‌شود و همان صفحه را می‌آورد.
  const [{ telegramAppName }, { username }] = await Promise.all([getSystemConfig(), telegramCredentials()]);
  const direct = telegramAppName ? miniAppDirectLink(username, telegramAppName, path) : null;
  if (direct) return { inline_keyboard: [[{ text: `${label} ↗`, url: direct }]] };
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

/**
 * زبانِ گروه‌های تلگرام (۲.۴۰.۰): زبانِ **مدیرِ کل** (نخستین مالکِ فعال)، وگرنه زبانِ
 * پیش‌فرضِ سامانه. ⚠️ پیش از این فقط زبانِ پیش‌فرضِ سامانه بود؛ روی سرور «English» بود
 * و پیامِ گروه «✅ Done … by دولوپر» می‌شد — نیمی انگلیسی، نیمی فارسی.
 * پیامِ خصوصیِ ربات به هر کس همچنان به زبانِ پنلِ خودِ اوست.
 */
export async function groupLocale(): Promise<Locale> {
  const [owner] = await db.select({ locale: users.locale }).from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .where(and(eq(userRoles.role, 'owner'), eq(users.memberState, 'active'), isNull(users.deletedAt)))
    .orderBy(users.id).limit(1);
  if (owner?.locale && isLocale(owner.locale)) return owner.locale;
  const { defaultLocale } = await getSystemConfig();
  return isLocale(defaultLocale) ? defaultLocale : 'fa';
}

/** متنِ گروه به زبانِ گروه — گروه یک زبان دارد. */
export async function groupTr() {
  const locale = await groupLocale();
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
 * ⚠️ نامِ نقش به **زبانِ گروه** (۲.۴۰.۰)، نه زبانِ درخواستِ جاری.
 */
async function groupNamer(projectId: number, tr: (s: string) => string, locale: Locale) {
  const [members, clientIds, assistants] = await Promise.all([
    db.select({ userId: projectMembers.userId, roleName: tagName(locale) }).from(projectMembers)
      .leftJoin(tags, eq(tags.id, projectMembers.roleTagId))
      .where(eq(projectMembers.projectId, projectId)).orderBy(projectMembers.id),
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

/** نوارِ پیشرفت — «▰▰▰▱▱ ۶ از ۱۰». */
function progressBar(done: number, total: number): string {
  if (total <= 0) return '';
  const filled = Math.round((done / total) * 10);
  return `${'▰'.repeat(filled)}${'▱'.repeat(10 - filled)} ${done}/${total}`;
}

/** خطِ «برچسب: مقدار» با مقدارِ پررنگ. */
function field(icon: string, label: string, value: string): string {
  return `${icon} ${esc(label)}: ${bold(value)}`;
}

/**
 * تسکِ تازه یا انجام‌شده ← گروه (۲.۱۶.۲؛ ۲.۴۰.۰: قالبِ تازه — سرتیتر، عنوان، خلاصهٔ
 * توضیح، مسئول/مهلت/اولویت هر کدام در یک خط، و پیشرفتِ پروژه پس از انجام). ⚠️ تسکِ
 * خصوصی و «پنهان از کارفرما» هرگز؛ شمارهٔ تسک هم نه (کارفرما نمی‌بیندش). بی‌انتظار
 * صدا زده می‌شود؛ خطایش هیچ‌جا نمی‌رود.
 */
export async function announceTask(taskId: number, kind: 'new' | 'done', actorId?: number): Promise<void> {
  try {
    const { tr, locale } = await groupTr();
    const priority = alias(tags, 'group_priority');
    const [t] = await db.select({
      title: tasks.title, description: tasks.description, projectId: tasks.projectId, isPrivate: tasks.isPrivate,
      clientHidden: tasks.clientHidden, deletedAt: tasks.deletedAt, dueDate: tasks.dueDate, assignedTo: tasks.assignedTo,
      assigneeName: users.name, priority: tagName(locale, priority),
    }).from(tasks)
      .leftJoin(users, eq(users.id, tasks.assignedTo))
      .leftJoin(priority, eq(priority.id, tasks.priorityTagId))
      .where(eq(tasks.id, taskId));
    if (!t || t.isPrivate || t.clientHidden || t.deletedAt) return;
    if (!(await hasGroup(t.projectId))) return;
    const name = await groupNamer(t.projectId, tr, locale);
    const button = await openButton(`/projects/${t.projectId}?tab=tasks`, tr('مشاهده در Kabarza'));

    if (kind === 'done') {
      const [by] = actorId ? await db.select({ name: users.name }).from(users).where(eq(users.id, actorId)) : [];
      const who = by ? name(actorId!, by.name) : '';
      const progress = await repo.taskProgressFor(t.projectId);
      const bar = progressBar(progress.done, progress.total);
      await postToProjectGroup(t.projectId, [
        `✅ ${bold(tr('تسک انجام شد'))}`,
        '',
        `📌 ${bold(t.title)}`,
        ...(who ? [field('👤', tr('انجام‌دهنده'), who)] : []),
        ...(bar ? ['', `📊 ${esc(tr('پیشرفتِ پروژه'))}`, `<code>${esc(bar)}</code>`] : []),
      ].join('\n'), button);
      return;
    }

    // مسئول: شخص (با ماسک) یا نقش‌های تسک — هر دو به زبانِ گروه.
    let owner = name(t.assignedTo, t.assigneeName);
    if (!owner) {
      const roles = await db.select({ name: tagName(locale) }).from(taskRoles)
        .leftJoin(tags, eq(tags.id, taskRoles.roleTagId)).where(eq(taskRoles.taskId, taskId));
      owner = roles.map((r) => r.name).filter(Boolean).join('، ');
    }
    const summary = (t.description ?? '').replace(/\s+/g, ' ').trim();
    await postToProjectGroup(t.projectId, [
      `🆕 ${bold(tr('تسکِ تازه'))}`,
      '',
      `📌 ${bold(t.title)}`,
      ...(summary ? [quote(summary, 300)] : []),
      ...(owner ? [field('👤', tr('مسئول'), owner)] : []),
      ...(t.dueDate ? [field('📅', tr('مهلت'), t.dueDate)] : []),
      ...(t.priority ? [field('⚡', tr('اولویت'), t.priority)] : []),
    ].join('\n'), button);
  } catch {
    // جانبی.
  }
}

/** کامنتِ تازهٔ پروژه ← گروه (کامنت را کارفرما هم در برنامه می‌بیند). */
export async function announceComment(projectId: number, userId: number, text: string): Promise<void> {
  try {
    if (!text.trim() || !(await hasGroup(projectId))) return;
    const { tr, locale } = await groupTr();
    const [u] = await db.select({ name: users.name }).from(users).where(eq(users.id, userId));
    const who = (await groupNamer(projectId, tr, locale))(userId, u?.name ?? '') || tr(FALLBACK_MEMBER_LABEL);
    // نقل‌قولِ بلند در تلگرام جمع‌شده نشان داده می‌شود (۲.۲۳.۰).
    await postToProjectGroup(
      projectId,
      [`💬 ${bold(tr('کامنتِ تازه'))}`, field('👤', tr('از'), who), quote(text, 1500)].join('\n'),
      await openButton(`/projects/${projectId}?tab=comments`, tr('پاسخ در Kabarza')),
    );
  } catch {
    // جانبی.
  }
}
