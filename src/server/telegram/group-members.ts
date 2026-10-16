import { eq, inArray } from 'drizzle-orm';
import { db } from '@/db/client';
import { auditLog, projectMembers, projects, users } from '@/db/schema';
import type { Actor } from '@/domain/access/permissions';
import { createTranslator } from '@/i18n/translate';
import { loadMessages } from '@/i18n/server';
import { isLocale } from '@/i18n/config';
import { loadActor } from '@/server/auth';
import { canViewProject, isClientOnly } from '@/server/projects/authority';
import { notify } from '@/server/notifications/service';
import { getSystemConfig } from '@/server/settings/system-service';
import { telegramCredentials } from '@/server/settings/telegram-service';
import { bold, esc, HTML } from './format';

/**
 * اعضای گروهِ تلگرامِ پروژه (۲.۳۶.۰).
 *
 * ربات (که مدیرِ گروه است) یک لینکِ عضویت با «درخواستِ عضویت» می‌سازد و به
 * اعضای تیمِ پروژه پیامِ خصوصی می‌دهد. هر درخواست را خودش می‌سنجد: فقط کسی که
 * تلگرامش را در برنامه وصل کرده و عضوِ تیمِ همین پروژه است پذیرفته می‌شود — لینکِ
 * لورفته غریبه را به گروه نمی‌آورد. کسی که از پروژه برداشته شود یا دسترسی‌اش قطع
 * شود از گروه بیرون می‌رود.
 *
 * ⚠️ کارفرما دعوت نمی‌شود و درخواستش رد می‌شود: گروهِ تلگرام گفتگوی تیم است.
 * ⚠️ همه چیز جانبی است: شکستِ تلگرام کارِ اصلی (افزودن/حذفِ عضو) را نمی‌شکند.
 */

/** دسترسی‌هایی که لینکِ «افزودنِ ربات» از تلگرام می‌خواهد — بدونِ این‌ها دعوت و بیرون‌کردن نمی‌شود. */
export const BOT_ADMIN_RIGHTS = 'invite_users+restrict_members+delete_messages+pin_messages';

type TgResult = { ok?: boolean; result?: unknown; description?: string } | null;

async function tg(method: string, body: Record<string, unknown>): Promise<TgResult> {
  const { token } = await telegramCredentials();
  if (!token) return null;
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  }).catch(() => null);
  return res ? (await res.json().catch(() => null)) as TgResult : null;
}

async function groupRow(projectId: number) {
  const [row] = await db.select({
    id: projects.id, title: projects.title, chatId: projects.telegramGroupId, invite: projects.telegramGroupInvite,
  }).from(projects).where(eq(projects.id, projectId));
  return row?.chatId ? row : null;
}

/** پروژهٔ وصل به این گروه؛ گروهِ ناشناس ← null. */
export async function projectOfGroup(chatId: number | string) {
  const [row] = await db.select({ id: projects.id, title: projects.title }).from(projects)
    .where(eq(projects.telegramGroupId, String(chatId)));
  return row ?? null;
}

/**
 * این کاربر می‌تواند عضوِ گروهِ پروژه باشد؟ فعال، پروژه را می‌بیند (دسترسیِ قطع‌شده
 * نه) و فقط-کارفرما نیست. همان گاردِ خودِ برنامه — نه فهرستِ جدا.
 */
export async function mayJoinGroup(userId: number, projectId: number): Promise<boolean> {
  const loaded = await loadActor(userId);
  if (!loaded || loaded.user.memberState !== 'active') return false;
  return (await canViewProject(loaded.actor, projectId)) && !(await isClientOnly(loaded.actor, projectId));
}

/** لینکِ عضویت؛ اگر نیست می‌سازد. `fresh`: همین الان ساخته شد. ربات مدیر نیست ← null. */
async function ensureInvite(projectId: number): Promise<{ link: string; fresh: boolean } | null> {
  const row = await groupRow(projectId);
  if (!row) return null;
  if (row.invite) return { link: row.invite, fresh: false };
  const out = await tg('createChatInviteLink', { chat_id: row.chatId, name: 'Kabarza', creates_join_request: true });
  const link = (out?.result as { invite_link?: string } | undefined)?.invite_link ?? '';
  if (!out?.ok || !link) return null;
  await db.update(projects).set({ telegramGroupInvite: link }).where(eq(projects.id, projectId));
  return { link, fresh: true };
}

/** اعضای تیمِ پروژه (ردیفِ عضویتِ بازِ فعال) — دعوت‌شدگانِ پیش‌فرض. */
async function teamUserIds(projectId: number): Promise<number[]> {
  const rows = await db.select({ userId: projectMembers.userId }).from(projectMembers)
    .where(eq(projectMembers.projectId, projectId));
  return [...new Set(rows.map((r) => r.userId))];
}

async function translator(locale: string | null) {
  const fallback = (await getSystemConfig()).defaultLocale;
  const l = locale && isLocale(locale) ? locale : isLocale(fallback) ? fallback : 'fa';
  return createTranslator(await loadMessages(l), l);
}

/**
 * دعوت به گروه: اعلانِ برنامه (و ایمیل، طبقِ ترجیح) + پیامِ خصوصیِ تلگرام با دکمهٔ
 * «پیوستن». کسی که حق ندارد (کارفرما، قطع‌شده) دعوت نمی‌شود. برمی‌گرداند چند نفر.
 */
export async function inviteToGroup(projectId: number, userIds?: number[]): Promise<number> {
  const row = await groupRow(projectId);
  if (!row) return 0;
  const invite = await ensureInvite(projectId);
  if (!invite) return 0;
  const ids = userIds ?? await teamUserIds(projectId);
  if (ids.length === 0) return 0;
  const people = await db.select({
    id: users.id, chatId: users.telegramChatId, off: users.telegramOff, locale: users.locale,
  }).from(users).where(inArray(users.id, ids));

  let sent = 0;
  for (const p of people) {
    if (!(await mayJoinGroup(p.id, projectId))) continue;
    // ⚠️ نشانیِ اعلانِ برنامه صفحهٔ پروژه است، نه لینکِ تلگرام: دکمهٔ «پیوستن» آنجاست
    // و لینک فقط به کسی نشان داده می‌شود که حقش را دارد.
    await notify([p.id], {
      type: 'project.telegram_group',
      title: 'گروهِ تلگرامِ پروژه: {project}',
      body: 'برای پیوستن، در تبِ «گروهِ گفتگو» دکمهٔ «پیوستن در تلگرام» را بزنید؛ عضویتِ شما خودکار تأیید می‌شود.',
      params: { project: row.title },
      url: `/projects/${projectId}?tab=chat`,
      channels: { telegram: false },
    }).catch(() => 0);
    if (p.chatId && !p.off) {
      const tr = await translator(p.locale);
      await tg('sendMessage', {
        chat_id: p.chatId,
        parse_mode: HTML,
        text: [
          `👥 ${bold(tr('گروهِ تلگرامِ پروژهٔ «{project}»', { project: row.title }))}`,
          esc(tr('برای پیوستن دکمهٔ زیر را بزنید؛ ربات عضویتِ شما را خودکار تأیید می‌کند.')),
        ].join('\n'),
        reply_markup: { inline_keyboard: [[{ text: `➕ ${tr('پیوستن به گروه')}`, url: invite.link }]] },
      });
    }
    sent++;
  }
  return sent;
}

/**
 * بیرون‌کردن از گروه — فقط کسی که دیگر حق ندارد (شاید از راهِ دیگری هنوز عضو است،
 * مثلاً مدیرِ کل). «ban» و بلافاصله «unban»: بیرون می‌رود ولی برای همیشه بسته نمی‌شود.
 */
export async function removeFromGroup(projectId: number, userIds: number[]): Promise<number> {
  const row = await groupRow(projectId);
  if (!row || userIds.length === 0) return 0;
  const people = await db.select({ id: users.id, chatId: users.telegramChatId }).from(users).where(inArray(users.id, userIds));
  let removed = 0;
  for (const p of people) {
    if (!p.chatId || await mayJoinGroup(p.id, projectId)) continue;
    const out = await tg('banChatMember', { chat_id: row.chatId, user_id: Number(p.chatId), until_date: Math.floor(Date.now() / 1000) + 60 });
    await tg('unbanChatMember', { chat_id: row.chatId, user_id: Number(p.chatId), only_if_banned: true });
    if (out?.ok) removed++;
  }
  return removed;
}

/** همگام‌سازیِ پس از تغییرِ اعضای پروژه — بی‌انتظار صدا زده می‌شود. */
export async function syncGroupMembers(projectId: number, change: { invite?: number[]; remove?: number[] }): Promise<void> {
  try {
    if (!(await groupRow(projectId))) return;
    if (change.remove?.length) await removeFromGroup(projectId, change.remove);
    if (change.invite?.length) await inviteToGroup(projectId, change.invite);
  } catch {
    // جانبی.
  }
}

/**
 * پس از وصل شدنِ گروه یا مدیر شدنِ ربات: لینک بساز و همهٔ تیم را دعوت کن. ⚠️ فقط
 * وقتی لینک **تازه** ساخته شد — رویدادِ تکراریِ تلگرام دعوتِ دوباره نمی‌فرستد.
 * ربات هنوز مدیر نیست ← `'need_admin'`.
 */
export async function setupGroup(projectId: number): Promise<{ state: 'invited' | 'ready' | 'need_admin' | 'none'; sent: number }> {
  const row = await groupRow(projectId);
  if (!row) return { state: 'none', sent: 0 };
  const invite = await ensureInvite(projectId);
  if (!invite) return { state: 'need_admin', sent: 0 };
  if (!invite.fresh) return { state: 'ready', sent: 0 };
  const sent = await inviteToGroup(projectId);
  await db.insert(auditLog).values({
    actorType: 'system', actorId: null, action: 'project.telegram_group_invite', objectType: 'project', objectId: projectId, after: { sent },
  });
  return { state: 'invited', sent };
}

/**
 * درخواستِ عضویت در گروه: عضوِ تیمِ همین پروژه ← تأیید؛ بقیه ← رد. `user_chat_id`
 * تا ۵ دقیقه اجازهٔ یک پیامِ خصوصی می‌دهد — ردشده بداند چرا.
 */
export async function answerJoinRequest(chatId: number, telegramUserId: number, userChatId?: number): Promise<boolean> {
  const project = await projectOfGroup(chatId);
  if (!project) return false;
  const [u] = await db.select({ id: users.id, locale: users.locale }).from(users).where(eq(users.telegramChatId, String(telegramUserId)));
  const ok = u ? await mayJoinGroup(u.id, project.id) : false;
  await tg(ok ? 'approveChatJoinRequest' : 'declineChatJoinRequest', { chat_id: chatId, user_id: telegramUserId });
  if (!ok && userChatId) {
    const tr = await translator(u?.locale ?? null);
    await tg('sendMessage', {
      chat_id: userChatId,
      text: `⚠️ ${tr('عضویت در گروهِ «{project}» تأیید نشد: فقط اعضای تیمِ همین پروژه که تلگرامشان را در برنامه (پروفایل ← «اعلان‌ها و تلگرام») وصل کرده‌اند پذیرفته می‌شوند.', { project: project.title })}`,
    });
  }
  return ok;
}

/** ربات از گروه بیرون رفت یا گروه به سوپرگروه تبدیل شد. */
export async function forgetGroup(chatId: number): Promise<void> {
  await db.update(projects).set({ telegramGroupId: '', telegramGroupInvite: '' }).where(eq(projects.telegramGroupId, String(chatId)));
}

/** گروهِ عادی که سوپرگروه شد شناسهٔ تازه می‌گیرد؛ لینکِ قبلی دیگر کار نمی‌کند. */
export async function migrateGroup(fromChatId: number, toChatId: number): Promise<number | null> {
  const rows = await db.update(projects).set({ telegramGroupId: String(toChatId), telegramGroupInvite: '' })
    .where(eq(projects.telegramGroupId, String(fromChatId))).returning({ id: projects.id });
  return rows[0]?.id ?? null;
}

/** لینکِ «پیوستن» برای صفحهٔ پروژه — فقط برای کسی که حقِ عضویت دارد. */
export async function groupInviteFor(actor: Actor, projectId: number): Promise<string | null> {
  const row = await groupRow(projectId);
  if (!row?.invite) return null;
  return (await mayJoinGroup(actor.id, projectId)) ? row.invite : null;
}

/** لینکِ عضویت باطل می‌شود — گروه جدا شد یا به گروهِ دیگری وصل شد. */
export async function revokeInvite(projectId: number): Promise<void> {
  const [row] = await db.select({ chatId: projects.telegramGroupId, invite: projects.telegramGroupInvite }).from(projects).where(eq(projects.id, projectId));
  if (row?.chatId && row.invite) await tg('revokeChatInviteLink', { chat_id: row.chatId, invite_link: row.invite });
  await db.update(projects).set({ telegramGroupInvite: '' }).where(eq(projects.id, projectId));
}
