import { eq, inArray } from 'drizzle-orm';
import { FileRejected, rejectMessage } from '@/domain/files/upload';
import { format as formatMoney } from '@/domain/money/money';
import { payoutLevel } from '@/server/finance/payouts';
import { parseTaskRef, taskRefGlobal, type ParsedTaskRef } from '@/domain/projects/task-ref';
import { findTaskByRef } from '@/server/projects/task-numbers';
import { taskCard } from '@/server/telegram/task-card';
import { db } from '@/db/client';
import { auditLog, projects, tasks, users } from '@/db/schema';
import type { Actor } from '@/domain/access/permissions';
import { isLocale, LOCALE_NAMES, type Locale } from '@/i18n/config';
import { createTranslator, type Translator } from '@/i18n/translate';
import { loadMessages } from '@/i18n/server';
import { loadActor } from '@/server/auth';
import { linkTelegramChat } from '@/server/people/profile-service';
import { addComment, listProjects, myTasks } from '@/server/projects/service';
import { reply as replyInThread } from '@/server/messaging/service';
import { addAttachment, type UploadBlob } from '@/server/files/service';
import { addTaskNote } from '@/server/projects/service';
import { hasTeamScope, teamTasks } from '@/server/team/service';
import { runningTimers } from '@/server/availability/service';
import { listAbsences as listTeamAbsences } from '@/server/activity/service';
import { decideRequest, listRequests } from '@/server/finance/payouts';
import { canManageSection, canViewSection } from '@/domain/access/permissions';
import { MUTABLE_REMINDERS } from '@/server/notifications/service';
import { linkProjectGroup } from './group';
import { canViewProject } from '@/server/projects/authority';
import { listMeetings, listReminders } from '@/server/meetings/service';
import { formatDateTime } from '@/i18n/datetime';
import { getSystemConfig } from '@/server/settings/system-service';
import { telegramCredentials } from '@/server/settings/telegram-service';
import {
  addOrMerge, canLogGeneral, canLogTime, loggableProjects, myLogs, myTotals, startTimer, stopTimer, timerState, TimerError,
} from '@/server/timelogs/service';
import { loadAiSecret, loadAiSecrets, type AiConnectionView } from '@/server/ai/connections';
import { PROVIDERS, type ProviderId } from '@/domain/ai/providers';
import { askAgent, forgetConversation, resolveChoice, resolvePending, type AgentResult } from '@/server/ai/agent';
import { MAX_VOICE_BYTES, MAX_VOICE_SECONDS, transcribe, transcriptionModel } from '@/server/ai/transcribe';

/**
 * ربات تلگرام (۲.۹.۰) — دستورها و دکمه‌ها، و «مغزِ» هوشمند برای متنِ آزاد.
 *
 * ⚠️ قاعده‌ها:
 *  1. فقط **چتِ خصوصی**؛ پیامِ گروه نادیده گرفته می‌شود — دادهٔ یک نفر نباید
 *     جلوی بقیهٔ اعضای گروه بیاید.
 *  2. کاربر از روی `users.telegram_chat_id` شناخته می‌شود (اتصال از پروفایل)
 *     و هر کار با **دسترسیِ خودِ او** و سرویس‌های موجود انجام می‌شود.
 *  3. عضوِ سابق یا قطع‌شده هیچ کاری نمی‌تواند (همان گاردِ MCP).
 *  4. متنِ آزاد فقط وقتی به هوشِ مصنوعی می‌رود که کاربر خودش ارائه‌دهنده‌اش
 *     را وصل کرده باشد؛ وگرنه، یا وقتی سهمیه‌اش تمام شد، دکمه‌های ثابت.
 */

/* ---------------- رابطِ تلگرام ---------------- */

export interface TgUser { id: number }
export interface TgChat { id: number; type?: string }
export interface TgVoice { file_id: string; duration?: number; file_size?: number; mime_type?: string }
export interface TgFile { file_id: string; file_size?: number; file_name?: string; mime_type?: string }
export interface TgMessage {
  message_id: number; text?: string; chat: TgChat; from?: TgUser; voice?: TgVoice; audio?: TgVoice;
  /** عکس (چند اندازه؛ آخری بزرگ‌ترین) و فایل (۲.۱۴.۰). */
  photo?: TgFile[]; document?: TgFile; caption?: string;
}
export interface TgUpdate {
  update_id: number;
  message?: TgMessage;
  callback_query?: { id: string; data?: string; from: TgUser; message?: TgMessage };
}

type Api = (method: string, payload: Record<string, unknown>) => Promise<unknown>;

async function callTelegram(method: string, payload: Record<string, unknown>): Promise<unknown> {
  const { token } = await telegramCredentials();
  if (!token) return null;
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(20_000),
  }).catch(() => null);
  return res ? res.json().catch(() => null) : null;
}

let api: Api = callTelegram;

/** فقط برای تست: جایگزینیِ تماس با تلگرام. */
export function setTelegramApi(fn: Api | null) {
  api = fn ?? callTelegram;
}

export { webhookSecret } from './secret';

/* ---------------- کمکی‌ها ---------------- */

interface Button { text: string; callback_data?: string; url?: string; web_app?: { url: string } }
type Keyboard = Button[][];

/** نشانهٔ راست‌به‌چپ — خطی که با حرفِ لاتین شروع می‌شود در فارسی چپ‌چین نشود. */
const RLM = '‏';
const RTL_LOCALES = new Set(['fa', 'ar', 'ckb']);

/**
 * یک ردیفِ فهرست (۲.۱۶.۲): «   • الف — ب · ج» — تکه‌های خالی حذف می‌شوند تا
 * «— » ِ آویزان نماند (پروژهٔ بی‌نام، تایمرِ کارِ عمومی).
 */
function bullet(head: string, ...rest: Array<string | null | undefined>): string {
  const parts = rest.filter((x): x is string => Boolean(x && x.trim()));
  if (parts.length === 0) return `   • ${head}`;
  const [first, ...more] = parts;
  return `   • ${head} — ${first}${more.length ? ` · ${more.join(' · ')}` : ''}`;
}

/** قالبِ فهرست — ثابتِ جدا، چون `gateway.test` هر «type: '…'» را نوعِ اعلان می‌شمارد. */
const CONJUNCTION = 'conjunction' as const;
const LIST_STYLE: Intl.ListFormatOptions = { style: 'long', type: CONJUNCTION };

/** فهرستِ نام‌ها به قاعدهٔ زبانِ کاربر («الف، ب و ج» / «A, B and C»). */
function joinList(who: Who, items: string[]): string {
  const list = items.filter(Boolean);
  try {
    return new Intl.ListFormat(who.locale, LIST_STYLE).format(list);
  } catch {
    return list.join(', ');
  }
}

/** مبلغ با جداکنندهٔ هزارگان و کدِ ارز. */
function moneyText(amount: string | number, code?: string | null): string {
  return `${formatMoney(String(amount))}${code ? ` ${code}` : ''}`;
}

function hm(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}

function todayIn(tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz || 'UTC' }).format(new Date());
}

/** سقفِ امنِ متنِ یک پیام (تلگرام ۴۰۹۶ نویسه می‌پذیرد). */
const MAX_TEXT = 3900;

/**
 * متنِ بلند ← چند تکه، از مرزِ خط (۲.۱۶.۲). ⚠️ پیش از این پیامِ بیش از ۴۰۹۶
 * نویسه (فهرستِ بلندِ تسک، جوابِ مفصلِ هوشِ مصنوعی) بی‌صدا رد می‌شد و کاربر هیچ
 * نمی‌دید.
 */
function chunks(text: string): string[] {
  if (text.length <= MAX_TEXT) return [text];
  const out: string[] = [];
  let cur = '';
  for (const line of text.split(NL)) {
    const piece = line.length > MAX_TEXT ? line.slice(0, MAX_TEXT - 1) + '…' : line;
    if (cur && cur.length + piece.length + 1 > MAX_TEXT) { out.push(cur); cur = ''; }
    cur = cur ? `${cur}${NL}${piece}` : piece;
  }
  if (cur) out.push(cur);
  return out;
}

async function send(chatId: number, text: string, keyboard?: Keyboard) {
  const parts = chunks(text);
  for (const [i, part] of parts.entries()) {
    const last = i === parts.length - 1;
    await api('sendMessage', {
      chat_id: chatId,
      text: part,
      disable_web_page_preview: true,
      // دکمه‌ها زیرِ تکهٔ آخر.
      ...(keyboard && last ? { reply_markup: { inline_keyboard: keyboard } } : {}),
    });
  }
}

async function edit(chatId: number, messageId: number, text: string, keyboard?: Keyboard) {
  await api('editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    text: text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT - 1)}…` : text,
    disable_web_page_preview: true,
    reply_markup: { inline_keyboard: keyboard ?? [] },
  });
}

interface Who {
  actor: Actor;
  /** مدیرِ تیم/پروژه‌ها؟ دکمهٔ «👥 تیم من» (۲.۱۴.۰). */
  manager: boolean;
  /** مدیرِ کل یا مالی؟ دکمهٔ «📊 وضعیتِ شرکت». */
  /** مالک (مدیرِ کل) — ساعت نمی‌زند؛ تایمر و ساعت برایش نیست (۲.۱۵.۱). */
  owner: boolean;
  /** «📊 وضعیتِ شرکت» — مالک یا بینندهٔ بخشِ مالی (۲.۱۶.۲: جدا از `owner`). */
  company: boolean;
  /** انواعِ بی‌صداشده در تلگرام. */
  muted: string[];
  /** اجازهٔ کارهای حساس به ربات (۲.۱۳.۰). */
  aiSensitive: boolean;
  name: string;
  tr: Translator;
  locale: Locale;
  tz: string;
  weekStart: number;
}

const translators = new Map<Locale, Translator>();
async function translatorFor(locale: Locale): Promise<Translator> {
  let tr = translators.get(locale);
  if (!tr) {
    tr = createTranslator(await loadMessages(locale), locale);
    translators.set(locale, tr);
  }
  return tr;
}

async function systemLocale(): Promise<{ locale: Locale; tz: string; weekStart: number }> {
  const system = await getSystemConfig();
  const locale = isLocale(system.defaultLocale) ? system.defaultLocale : 'fa';
  return { locale, tz: system.timezone || 'UTC', weekStart: system.weekStart };
}

/** چت ← کاربر. ⚠️ فقط عضوِ فعال؛ «فقط مالی» و قطع‌شده نه. */
async function whoIs(chatId: number): Promise<Who | null> {
  const [row] = await db.select({ id: users.id }).from(users).where(eq(users.telegramChatId, String(chatId)));
  if (!row) return null;
  return whoById(row.id);
}

async function whoById(userId: number): Promise<Who | null> {
  const loaded = await loadActor(userId);
  if (!loaded || loaded.user.memberState !== 'active') return null;
  const sys = await systemLocale();
  const locale = loaded.user.locale && isLocale(loaded.user.locale) ? loaded.user.locale : sys.locale;
  const actor = loaded.actor;
  return {
    actor, aiSensitive: loaded.user.aiSensitive, name: loaded.user.name, tr: await translatorFor(locale),
    // ⚠️ وقتِ خودِ کاربر (پروفایل)، وگرنه سامانه — «امروز» برای هر کس روزِ خودش.
    locale, tz: loaded.user.timezone || sys.tz, weekStart: sys.weekStart,
    manager: actor.roles.includes('owner') || canManageSection(actor, 'projects') || await hasTeamScope(actor),
    // ⚠️ دو پرچمِ جدا: حسابدار ساعت می‌زند ولی «وضعیتِ شرکت» را هم می‌بیند.
    owner: actor.roles.includes('owner'),
    company: actor.roles.includes('owner') || canViewSection(actor, 'finance'),
    muted: loaded.user.telegramMuted ?? [],
  };
}

async function audit(who: Who, action: string, detail: Record<string, unknown>) {
  await db.insert(auditLog).values({
    actorType: 'user', actorId: who.actor.id, action: 'telegram.bot_call',
    objectType: 'user', objectId: who.actor.id, after: { action, ...detail },
  });
}

/**
 * نشانیِ مینی‌اپ (۲.۱۰.۰) — فقط وقتی `APP_URL` ِ HTTPS هست؛ تلگرام مینی‌اپِ
 * بی‌HTTPS را باز نمی‌کند. `next` مسیرِ داخلی بعد از ورود است.
 */
export function miniAppUrl(next = '/'): string | null {
  const base = (process.env.APP_URL ?? '').trim().replace(/\/$/, '');
  if (!base.startsWith('https://')) return null;
  return `${base}/tg?next=${encodeURIComponent(next)}`;
}

/** دکمهٔ بازکردنِ برنامه داخلِ تلگرام؛ بی HTTPS ← هیچ. */
function appButton(tr: Translator, next = '/', label = 'باز کردنِ برنامه'): Button | null {
  const url = miniAppUrl(next);
  return url ? { text: `📱 ${tr(label)}`, web_app: { url } } : null;
}

/** وضعیتِ تایمر برای منو — روشن (با پروژه و مدت)، منتظرِ تأیید، یا خاموش. */
interface TimerView {
  running: { title: string; minutes: number } | null;
  pending: boolean;
}

/**
 * منوی اصلی (۲.۱۲.۰: وابسته به وضعیت). ⚠️ فقط دکمه‌ای که الان معنا دارد: تایمرِ
 * خاموش «شروع» دارد، تایمرِ روشن «توقف» با پروژه و مدت؛ پیش از این هر دو همیشه
 * بودند و «توقف» بی‌تایمر فقط می‌گفت «تایمری روشن نیست».
 * بی `timer` (مثلاً پیامِ جانبی) فقط «شروع» می‌آید.
 */
function menu(tr: Translator, timer?: TimerView, roles?: { manager: boolean; owner: boolean; company: boolean }): Keyboard {
  const app = appButton(tr);
  const timerButton: Button = timer?.running
    ? { text: `⏹ ${tr('توقفِ تایمر')} · ${hm(timer.running.minutes)}`, callback_data: 't:x' }
    : timer?.pending
      ? { text: `⏳ ${tr('تایمرِ منتظرِ تأیید')}`, callback_data: 't:p' }
      : { text: `▶️ ${tr('شروعِ تایمر')}`, callback_data: 't:p' };
  // ⚠️ مالک (مدیرِ کل) ساعت نمی‌زند: «ساعت‌های من»، تایمر و «ثبتِ ساعت» برایش نیست (۲.۱۵.۱).
  const work: Keyboard = roles?.owner
    ? [[{ text: `📋 ${tr('تسک‌های من')}`, callback_data: 'm:tasks' }]]
    : [
      [{ text: `📋 ${tr('تسک‌های من')}`, callback_data: 'm:tasks' }, { text: `🕒 ${tr('ساعت‌های من')}`, callback_data: 'm:hours' }],
      [timerButton, { text: `➕ ${tr('ثبتِ ساعت')}`, callback_data: 'l:p' }],
    ];
  return [
    ...work,
    [{ text: `📅 ${tr('جلسه‌ها و یادآورها')}`, callback_data: 'm:meet' }, { text: `🤖 ${tr('هوشِ مصنوعی')}`, callback_data: 'm:ai' }],
    ...(app ? [[app]] : []),
    ...(roles?.manager || roles?.company
      ? [[
        ...(roles.manager ? [{ text: `👥 ${tr('تیم من')}`, callback_data: 'm:team' }] : []),
        ...(roles.company ? [{ text: `📊 ${tr('وضعیتِ شرکت')}`, callback_data: 'm:co' }] : []),
      ]]
      : []),
  ];
}

async function timerView(who: Who): Promise<TimerView> {
  const state = await timerState(who.actor);
  return {
    running: state.running ? { title: state.running.projectTitle ?? who.tr('کارِ عمومی'), minutes: state.running.minutes } : null,
    pending: Boolean(state.pending),
  };
}

/** منوی اصلی با وضعیتِ همین لحظهٔ تایمرِ کاربر. */
async function menuFor(who: Who): Promise<Keyboard> {
  return menu(who.tr, await timerView(who), who);
}

/* ---------------- صفحه‌کلیدِ ثابت (۲.۱۴.۰) ---------------- */

/**
 * دکمه‌های میان‌بر **پایینِ صفحه** (جای صفحه‌کلیدِ گوشی) — همیشه در دسترس، حتی
 * وقتی پیامِ منو بالا رفته. متنِ هر دکمه همان چیزی است که ربات می‌گیرد؛ پس به
 * زبانِ خودِ کاربر ساخته و با همان مقایسه می‌شود.
 */
function shortcuts(who: Who) {
  const tr = who.tr;
  return {
    tasks: `📋 ${tr('تسک‌های من')}`,
    hours: `🕒 ${tr('ساعت‌های من')}`,
    timer: `⏱ ${tr('تایمر')}`,
    meetings: `📅 ${tr('جلسه‌ها')}`,
    menu: `🏠 ${tr('منوی اصلی')}`,
    team: `👥 ${tr('تیم من')}`,
    company: `📊 ${tr('وضعیتِ شرکت')}`,
  };
}

function replyKeyboard(who: Who) {
  const k = shortcuts(who);
  // مالک ساعت و تایمر ندارد — همان قاعدهٔ منوی اصلی.
  const rows = who.owner
    ? [[{ text: k.tasks }, { text: k.meetings }, { text: k.menu }]]
    : [[{ text: k.tasks }, { text: k.hours }], [{ text: k.timer }, { text: k.meetings }, { text: k.menu }]];
  const admin = [...(who.manager ? [{ text: k.team }] : []), ...(who.company ? [{ text: k.company }] : [])];
  if (admin.length > 0) rows.push(admin);
  return { keyboard: rows, resize_keyboard: true, is_persistent: true };
}

async function sendShortcuts(chatId: number, who: Who) {
  await api('sendMessage', { chat_id: chatId, text: `⌨️ ${who.tr('میان‌برها پایینِ صفحه‌اند.')}`, reply_markup: replyKeyboard(who) });
}

/* ---------------- مدیرِ تیم / پروژه (۲.۱۴.۰) ---------------- */

/** «👥 تیم من»: بازبینی‌های منتظر، دیرکردهای تیم، کارِ همین حالا، مرخصیِ امروز. */
async function showTeam(chatId: number, who: Who, messageId?: number) {
  if (!who.manager) return;
  const today = todayIn(who.tz);
  const [inbox, overdue, running, away] = await Promise.all([
    myTasks(who.actor),
    teamTasks(who.actor, { due: 'overdue' }).catch(() => ({ rows: [] as Array<{ title: string; projectTitle?: string | null; assigneeName?: string | null }> })),
    runningTimers(who.actor).catch(() => []),
    listTeamAbsences(who.actor, { from: today, to: today }).catch(() => []),
  ]);
  const overdueRows = ((overdue as { rows?: unknown[] }).rows ?? (Array.isArray(overdue) ? overdue : [])) as Array<{ title: string; projectTitle?: string | null; assigneeName?: string | null }>;
  // ⚠️ `teamTasks` صفحه‌بندی دارد؛ شمارِ واقعی `total` است، نه طولِ همین صفحه.
  const overdueTotal = (overdue as { total?: number }).total ?? overdueRows.length;
  const lines = [`👥 ${who.tr('تیم من')}`, ''];
  lines.push(`🔍 ${who.tr('در انتظارِ بازبینیِ شما')}: ${inbox.review.length}`);
  for (const t of inbox.review.slice(0, 6)) lines.push(bullet(t.title, t.projectTitle));
  lines.push('', `⚠️ ${who.tr('دیرکردهای تیم')}: ${overdueTotal}`);
  for (const t of overdueRows.slice(0, 6)) lines.push(bullet(t.title, t.assigneeName));
  lines.push('', `⏱ ${who.tr('الان مشغولِ کار')}: ${running.length}`);
  for (const r of running.slice(0, 8)) lines.push(bullet(r.name, r.project, hm(r.minutes)));
  const awayList = (away as Array<{ userName?: string; name?: string }>);
  if (awayList.length > 0) {
    lines.push('', `🌴 ${who.tr('مرخصیِ امروز')}: ${joinList(who, awayList.map((a) => a.userName ?? a.name ?? ''))}`);
  }
  const open = appButton(who.tr, '/team', 'باز کردن در برنامه');
  const keyboard: Keyboard = [...(open ? [[open]] : []), backRow(who.tr)];
  if (messageId) await edit(chatId, messageId, lines.join(NL), keyboard);
  else await send(chatId, lines.join(NL), keyboard);
}

/** «📊 وضعیتِ شرکت»: پروژه‌های باز، درخواست‌های پرداختِ منتظر با «تأیید/رد». */
async function showCompany(chatId: number, who: Who, messageId?: number) {
  if (!who.company) return;
  // ⚠️ درخواستِ «منتظر» را فقط سطحِ کاملِ مالی می‌بیند؛ حسابدار همیشه «۰» می‌دید.
  const seesPending = payoutLevel(who.actor) === 'full';
  const [projectsList, pending, running] = await Promise.all([
    listProjects(who.actor).catch(() => []),
    seesPending ? listRequests(who.actor, 'pending').catch(() => []) : Promise.resolve([]),
    runningTimers(who.actor).catch(() => []),
  ]);
  const open = projectsList.filter((p) => !p.isArchived && p.isClosed !== true);
  const overdueProjects = open.filter((p) => p.deadline && p.deadline < todayIn(who.tz));
  const lines = [
    `📊 ${who.tr('وضعیتِ شرکت')}`, '',
    `📁 ${who.tr('پروژه‌های باز')}: ${open.length}${overdueProjects.length > 0 ? ` · ⚠️ ${who.tr('{n} دیرکرد', { n: overdueProjects.length })}` : ''}`,
    `⏱ ${who.tr('الان مشغولِ کار')}: ${running.length}`,
    ...(seesPending ? [`💳 ${who.tr('درخواست‌های پرداختِ منتظر')}: ${pending.length}`] : []),
  ];
  const keyboard: Keyboard = [];
  for (const r of pending.slice(0, 5)) {
    const amount = moneyText(r.amount, r.currencyCode);
    lines.push(bullet(r.userName ?? '—', amount, r.projectTitle));
    // ⚠️ تأیید/رد فقط کارِ مالک است (همان گاردِ سرویس)؛ هر کدام یک پرسشِ دوباره دارد.
    // مبلغ روی دکمه — دو درخواستِ یک نفر از هم جدا شوند.
    if (who.actor.roles.includes('owner')) {
      keyboard.push([
        { text: `✅ ${r.userName} · ${amount}`.slice(0, 60), callback_data: `pr:a:${r.id}` },
        { text: `✖️ ${r.userName} · ${amount}`.slice(0, 60), callback_data: `pr:r:${r.id}` },
      ]);
    }
  }
  const app = appButton(who.tr, '/finance', 'باز کردن در برنامه');
  if (app) keyboard.push([app]);
  keyboard.push(backRow(who.tr));
  if (messageId) await edit(chatId, messageId, lines.join(NL), keyboard);
  else await send(chatId, lines.join(NL), keyboard);
}

/* ---------------- پاسخ از زیرِ اعلان (۲.۱۴.۰) ---------------- */

type ReplyTarget = { thread: number } | { projectId: number; commentId: number };
/** پاسخِ در انتظار به‌ازای چت — ۱۰ دقیقه. */
const pendingReplies = new Map<number, { target: ReplyTarget; at: number }>();

/* ---------------- فایل به ربات (۲.۱۴.۰) ---------------- */

const MAX_FILE_BYTES = 20 * 1024 * 1024;
/** فایلِ فرستاده‌شده تا کاربر بگوید کجا برود — ۱۰ دقیقه، فقط در حافظه. */
const pendingFiles = new Map<number, { file: TgFile; name: string; mime: string; caption: string; at: number }>();

async function downloadTelegramFile(fileId: string): Promise<Uint8Array | null> {
  const info = await api('getFile', { file_id: fileId }) as { ok?: boolean; result?: { file_path?: string; file_size?: number } } | null;
  const path = info?.result?.file_path;
  if (!info?.ok || !path || (info.result?.file_size ?? 0) > MAX_FILE_BYTES) return null;
  const { token } = await telegramCredentials();
  if (!token) return null;
  const res = await fetch(`https://api.telegram.org/file/bot${token}/${path}`, { signal: AbortSignal.timeout(60_000) }).catch(() => null);
  if (!res?.ok) return null;
  const bytes = new Uint8Array(await res.arrayBuffer());
  return bytes.length > 0 && bytes.length <= MAX_FILE_BYTES ? bytes : null;
}

async function onFile(chatId: number, who: Who, msg: TgMessage) {
  const photo = msg.photo?.at(-1);
  const file = photo ?? msg.document;
  if (!file) return;
  if ((file.file_size ?? 0) > MAX_FILE_BYTES) {
    await send(chatId, who.tr('فایل بزرگ‌تر از ۲۰ مگابایت است؛ از خودِ برنامه بارگذاری کنید.'));
    return;
  }
  const name = msg.document?.file_name || (photo ? `photo-${msg.message_id}.jpg` : 'file');
  const mime = msg.document?.mime_type || (photo ? 'image/jpeg' : 'application/octet-stream');
  pendingFiles.set(chatId, { file, name, mime, caption: (msg.caption ?? '').trim(), at: Date.now() });
  await send(chatId, `📎 ${who.tr('این فایل کجا برود؟')}`, [
    [{ text: `📁 ${who.tr('فایل‌های پروژه')}`, callback_data: 'f:p' }, { text: `📌 ${who.tr('پیوست به تسک')}`, callback_data: 'f:t' }],
    [{ text: `✖️ ${who.tr('لغو')}`, callback_data: 'f:x' }],
  ]);
}

/** پروژه‌های بازِ قابلِ‌دیدِ کاربر — برای فایل. */
async function fileProjects(who: Who) {
  return (await listProjects(who.actor)).filter((p) => !p.isArchived && p.isClosed !== true).slice(0, 12);
}

async function finishFile(chatId: number, who: Who, messageId: number, where: { projectId: number } | { taskId: number }) {
  const pending = pendingFiles.get(chatId);
  if (!pending || Date.now() - pending.at > 10 * 60_000) {
    pendingFiles.delete(chatId);
    await edit(chatId, messageId, who.tr('این درخواست منقضی شده است؛ دوباره بپرسید.'));
    return;
  }
  await edit(chatId, messageId, `⏳ ${who.tr('در حالِ انجام…')}`);
  // ⚠️ هر نتیجه همان پیامِ «⏳» را عوض می‌کند؛ پیش از این خطا ⏳ را آویزان می‌گذاشت.
  const bytes = await downloadTelegramFile(pending.file.file_id);
  if (!bytes) {
    await edit(chatId, messageId, `⚠️ ${who.tr('فایل از تلگرام گرفته نشد؛ دوباره بفرستید.')}`);
    return;
  }
  const blob: UploadBlob = { name: pending.name, mime: pending.mime, bytes };
  pendingFiles.delete(chatId);
  // ⚠️ گاردِ پروژه/تسک و نوع و اندازهٔ مجازِ فایل همان سرویسِ برنامه است.
  try {
    if ('projectId' in where) {
      await addAttachment(who.actor, where.projectId, blob, pending.caption);
      await audit(who, 'file.add', { projectId: where.projectId });
      await edit(chatId, messageId, `✅ ${who.tr('فایل به پروژه اضافه شد.')}`, [backRow(who.tr)]);
    } else {
      await addTaskNote(who.actor, where.taskId, pending.caption || '📎', [blob]);
      await audit(who, 'task.note', { taskId: where.taskId });
      await edit(chatId, messageId, `✅ ${who.tr('فایل به تسک پیوست شد.')}`, [backRow(who.tr)]);
    }
  } catch (error) {
    // نوع یا اندازهٔ نامجاز دلیلِ دقیقِ خودش را دارد؛ «شاید دسترسی ندارید» گمراه‌کننده بود.
    const reason = error instanceof FileRejected ? rejectMessage(error.reason) : null;
    await edit(chatId, messageId, `⚠️ ${who.tr(reason ?? 'این کار انجام نشد؛ شاید دسترسی ندارید.')}`);
  }
}

/**
 * نوعِ دکمهٔ منوی تلگرام. ⚠️ ثابتِ جدا، نه رشتهٔ لفظی کنارِ کلیدِ type: تستِ
 * نگاشتِ اعلان (`gateway.test`) هر `type: '…'` ِ کد را نوعِ اعلان حساب می‌کند.
 */
const WEB_APP = 'web_app' as const;

/** خط‌شکنیِ پیامِ تلگرام. */
const NL = String.fromCharCode(10);

/**
 * جلسه‌های پیشِ‌رو و یادآورهای خودِ کاربر (۲.۱۲.۰) — همان فهرستِ صفحهٔ جلسات،
 * با همان ماسکِ نام برای کارفرما. زمان در منطقهٔ زمانیِ خودِ کاربر.
 */
async function showMeetings(chatId: number, who: Who, messageId?: number) {
  const [row] = await db.select({ tz: users.timezone }).from(users).where(eq(users.id, who.actor.id));
  const tz = row?.tz || who.tz;
  const [{ meetings }, reminders] = await Promise.all([listMeetings(who.actor), listReminders(who.actor)]);
  const lines: string[] = [];
  if (meetings.length > 0) {
    lines.push(`📅 ${who.tr('جلسه‌های پیشِ‌رو')} (${meetings.length})`);
    for (const m of meetings.slice(0, 10)) {
      const where = [m.projectTitle, m.location].filter(Boolean).join(' — ');
      lines.push(`• ${formatDateTime(m.meetAt, tz)} — ${m.title}${where ? ` (${where})` : ''}`);
    }
  } else {
    lines.push(`📅 ${who.tr('جلسهٔ پیشِ‌رویی ندارید.')}`);
  }
  const open = reminders.filter((r) => !r.isSent);
  lines.push('');
  if (open.length > 0) {
    lines.push(`⏰ ${who.tr('یادآورهای من')} (${open.length})`);
    for (const r of open.slice(0, 10)) lines.push(`• ${formatDateTime(r.remindAt, tz)} — ${r.body.slice(0, 120)}`);
  } else {
    lines.push(`⏰ ${who.tr('یادآوری ندارید.')}`);
  }
  if (await loadAiSecret(who.actor.id)) {
    lines.push('', who.tr('برای یادآورِ تازه بنویسید، مثلاً «فردا ساعت ۱۰ یادم بنداز فاکتور را بفرستم».'));
  }
  const appBtn = appButton(who.tr, '/meetings', 'باز کردن در برنامه');
  const keyboard: Keyboard = [...(appBtn ? [[appBtn]] : []), backRow(who.tr)];
  const text = lines.join(NL);
  if (messageId) await edit(chatId, messageId, text, keyboard);
  else await send(chatId, text, keyboard);
}

/** «DeepSeek — deepseek-chat» برای پیام‌ها. */
function aiLabel(provider: ProviderId, model: string): string {
  return `${PROVIDERS[provider]?.label ?? provider}${model ? ` — ${model}` : ''}`;
}

/** خطِ وضعیتِ هوشِ مصنوعی در منو (۲.۱۰.۰) — همیشه معلوم باشد وصل است یا نه. */
async function aiStatusLine(who: Who): Promise<string> {
  const secrets = await loadAiSecrets(who.actor.id);
  const secret = secrets[0];
  const backups = secrets.length > 1 ? ` ${who.tr('(+{n} جایگزین)', { n: secrets.length - 1 })}` : '';
  return secret
    ? `🤖 ${who.tr('هوشِ مصنوعی: {name}', { name: aiLabel(secret.provider, secret.model) })}${backups}${NL}${who.tr('می‌توانید سؤالتان را هم آزاد بنویسید؛ هوشِ مصنوعیِ شما جواب می‌دهد. /new گفت‌وگو را از نو شروع می‌کند.')}`
    : `🤖 ${who.tr('هوشِ مصنوعی وصل نیست.')} ${who.tr('با وصل‌کردنش می‌توانید آزاد بپرسید، مثلاً «امروز چه تسکی دارم؟». دکمهٔ «هوشِ مصنوعی» را بزنید.')}`;
}

/** صفحهٔ «هوشِ مصنوعی» در ربات: وضعیت + راهِ وصل/عوض‌کردن. */
async function showAi(chatId: number, who: Who, messageId?: number) {
  const secrets = await loadAiSecrets(who.actor.id);
  const secret = secrets[0];
  const lines = secret
    ? [
      `✅ ${who.tr('هوشِ مصنوعیِ شما وصل است: {name}', { name: aiLabel(secret.provider, secret.model) })}`,
      // ترتیبِ جایگزین‌ها — اگر اولی به سقف خورد، ربات سراغِ بعدی می‌رود.
      ...(secrets.length > 1
        ? [who.tr('ترتیبِ امتحان:'), ...secrets.map((x, i) => `${i + 1}. ${aiLabel(x.provider, x.model)}`)]
        : []),
      '',
      who.tr('سؤالتان را آزاد بنویسید؛ مثلاً «امروز چه تسکی دارم؟» یا «۲ ساعت روی پروژهٔ آلفا ثبت کن». هر تغییری پیش از انجام از شما تأیید می‌گیرد.'),
      who.tr('برای عوض‌کردنِ مدل یا ارائه‌دهنده به پروفایل ← «دستیارِ هوشِ مصنوعی» بروید.'),
    ]
    : [
      `➕ ${who.tr('هنوز هوشِ مصنوعی وصل نکرده‌اید.')}`,
      '',
      who.tr('با وصل‌کردنِ هوشِ مصنوعیِ خودتان، ربات متنِ آزاد را می‌فهمد. راهِ رایگان: «ورود با OpenRouter» در پروفایل ← «دستیارِ هوشِ مصنوعی». DeepSeek، ChatGPT، Claude، Gemini و … هم با کلیدِ خودتان وصل می‌شوند.'),
    ];
  const open = appButton(who.tr, '/profile?tab=mcp', secret ? 'تنظیمِ هوشِ مصنوعی' : 'وصل‌کردنِ هوشِ مصنوعی');
  const keyboard: Keyboard = [...(open ? [[open]] : []), backRow(who.tr)];
  const text = lines.join(NL);
  if (messageId) await edit(chatId, messageId, text, keyboard);
  else await send(chatId, text, keyboard);
}

/**
 * خبرِ وصل/قطع‌شدنِ هوشِ مصنوعی به تلگرامِ خودِ کاربر (۲.۱۰.۰) — تا در ربات هم
 * معلوم باشد چه چیزی وصل است. بی‌اتصالِ تلگرام کاری نمی‌کند؛ خطای تلگرام هم
 * ذخیرهٔ پروفایل را نمی‌شکند.
 */
export async function notifyAiChange(userId: number, connection: AiConnectionView | null): Promise<void> {
  try {
    const [row] = await db.select({ chatId: users.telegramChatId, locale: users.locale }).from(users).where(eq(users.id, userId));
    if (!row?.chatId) return;
    const sys = await systemLocale();
    const tr = await translatorFor(row.locale && isLocale(row.locale) ? row.locale : sys.locale);
    const text = connection
      ? `✅ ${tr('هوشِ مصنوعیِ شما وصل است: {name}', { name: aiLabel(connection.provider, connection.model) })}${NL}${tr('حالا می‌توانید سؤالتان را همین‌جا آزاد بنویسید.')}`
      : `🤖 ${tr('هوشِ مصنوعیِ ربات قطع شد؛ دکمه‌ها مثلِ قبل کار می‌کنند.')}`;
    // ⚠️ منو با نقشِ همین نفر — پیش از این مالک دوباره دکمهٔ ساعت و تایمر می‌دید.
    const who = await whoById(userId);
    await api('sendMessage', { chat_id: Number(row.chatId), text, reply_markup: { inline_keyboard: who ? await menuFor(who) : menu(tr) } });
  } catch {
    // اعلانِ جانبی است.
  }
}

/* ---------------- دستورها ---------------- */

/**
 * ردیفِ «بازگشت» (۲.۹.۲) — هر زیرمنو یکی دارد؛ پیش از این از فهرستِ پروژه یا
 * مدت راهی به عقب نبود و باید دستور را دوباره تایپ می‌کردی.
 * پیش‌فرض: منوی اصلی؛ انتخابِ مدت به فهرستِ پروژه برمی‌گردد.
 */
function backRow(tr: Translator, data = 'm:menu'): Button[] {
  return [{ text: `↩️ ${tr('بازگشت')}`, callback_data: data }];
}

/**
 * صفحهٔ اصلی (۲.۱۲.۰): به‌جای فهرستِ دستورها، خلاصهٔ همین لحظه — تایمر، ساعتِ
 * امروز، تسک‌های باز و دیرکرد، و هوشِ مصنوعی. فهرستِ دستورها در /help است.
 */
async function showMenu(chatId: number, who: Who, messageId?: number) {
  const today = todayIn(who.tz);
  const [timer, todayLogs, inbox] = await Promise.all([
    timerView(who),
    myLogs(who.actor, { from: today, to: today, perPage: 1 }),
    myTasks(who.actor),
  ]);
  const overdue = inbox.active.filter((t) => t.dueDate && t.dueDate < today).length;
  const lines = [
    `👋 ${who.tr('سلام {name}!', { name: who.name })}`,
    '',
    // مالک ساعت نمی‌زند: خطِ تایمر و «امروز» برایش نیست (مگر تایمری واقعاً از وب روشن باشد).
    ...(who.owner && !timer.running && !timer.pending ? [] : [
      timer.running
        ? `⏱ ${who.tr('تایمر روشن است')}: ${timer.running.title} · ${hm(timer.running.minutes)}`
        : timer.pending
          ? `⏳ ${who.tr('یک تایمرِ طولانی منتظرِ تأییدِ شماست.')}`
          : `⏱ ${who.tr('تایمر خاموش است')}`,
      `🕒 ${who.tr('امروز')}: ${hm(todayLogs.rangeMinutes)}`,
    ]),
    `📋 ${who.tr('تسکِ باز')}: ${inbox.active.length}${overdue > 0 ? ` · ⚠️ ${who.tr('{n} دیرکرد', { n: overdue })}` : ''}`,
    ...(inbox.review.length > 0 ? [`🔍 ${who.tr('در انتظارِ بازبینیِ شما')}: ${inbox.review.length}`] : []),
    '',
    await aiStatusLine(who),
  ];
  const keyboard = menu(who.tr, timer, who);
  if (messageId) await edit(chatId, messageId, lines.join(NL), keyboard);
  else await send(chatId, lines.join(NL), keyboard);
}

/** /help — دستورها و چند نمونه. */
async function showHelp(chatId: number, who: Who) {
  // ⚠️ خطی که با «/menu» شروع شود در زبانِ راست‌به‌چپ چپ‌چین می‌شد؛ نشانهٔ RLM جهت را نگه می‌دارد.
  const lead = RTL_LOCALES.has(who.locale) ? RLM : '';
  const lines = [
    `ℹ️ ${who.tr('راهنما')}`,
    '',
    '/menu — ' + who.tr('منوی اصلی'),
    '/tasks — ' + who.tr('تسک‌های من'),
    // مالک ساعت نمی‌زند؛ راهنمایش هم این‌ها را نمی‌گوید.
    ...(who.owner ? [] : [
      '/hours — ' + who.tr('ساعت‌های من'),
      '/timer — ' + who.tr('شروعِ تایمر'),
      '/stop — ' + who.tr('توقفِ تایمر'),
      '/log — ' + who.tr('ثبتِ ساعت'),
    ]),
    '/meetings — ' + who.tr('جلسه‌ها و یادآورها'),
    '/ai — ' + who.tr('هوشِ مصنوعی'),
    '/new — ' + who.tr('گفت‌وگوی تازه با هوشِ مصنوعی'),
    '/keyboard — ' + who.tr('نمایشِ میان‌برها'),
    ...(who.manager ? ['/team — ' + who.tr('تیم من')] : []),
    '/cancel — ' + who.tr('لغو'),
  ].map((l) => (l.startsWith('/') ? lead + l : l));
  await send(chatId, lines.join(NL), await menuFor(who));
}

async function showTasks(chatId: number, who: Who) {
  const today = todayIn(who.tz);
  const inbox = await myTasks(who.actor);
  // دیرکردها اول، بعد به ترتیبِ ددلاین؛ بی‌ددلاین‌ها ته.
  const byDue = <T extends { dueDate: string | null }>(xs: T[]) =>
    [...xs].sort((a, b) => (a.dueDate ?? '9999') .localeCompare(b.dueDate ?? '9999'));
  const card = (
    x: { title: string; projectTitle: string | null; dueDate: string | null; number: number | null; projectId: number; projectCode: string },
    i: number,
  ) => {
    const due = x.dueDate
      ? x.dueDate < today
        ? ` · ⚠️ ${x.dueDate} (${who.tr('دیرکرد')})`
        : x.dueDate === today ? ` · 📅 ${who.tr('امروز')}` : ` · 📅 ${x.dueDate}`
      : '';
    // «ALZ-325 · عنوان» (۲.۱۶.۰) — همان شماره‌ای که مدیر می‌گوید؛ با فرستادنش کارت باز می‌شود.
    // ⚠️ همیشه «•» — پیش از این تسکِ بی‌شماره «1.» می‌گرفت و فهرست دو شکل داشت.
    const title = x.title.length > 90 ? `${x.title.slice(0, 89)}…` : x.title;
    const head = x.number ? `• ${title} · ${taskRefGlobal({ id: x.projectId, code: x.projectCode }, x.number)}` : `• ${title}`;
    void i;
    return `${head}${NL}    📁 ${x.projectTitle ?? '—'}${due}`;
  };
  const parts: string[] = [];
  if (inbox.active.length > 0) {
    parts.push(`📋 ${who.tr('تسک‌های باز')} (${inbox.active.length})`, '', ...byDue(inbox.active).slice(0, 15).map(card));
    if (inbox.active.length > 15) parts.push('', who.tr('و {n} مورد دیگر', { n: inbox.active.length - 15 }));
  }
  if (inbox.review.length > 0) {
    if (parts.length > 0) parts.push('');
    parts.push(`🔍 ${who.tr('در انتظارِ بازبینیِ شما')} (${inbox.review.length})`, '', ...byDue(inbox.review).slice(0, 10).map(card));
  }
  if (inbox.waiting.length > 0) {
    parts.push('', `⏳ ${who.tr('قابلِ برداشتن')}: ${inbox.waiting.length}`);
  }
  const open = appButton(who.tr, '/tasks', 'باز کردن در برنامه');
  const keyboard: Keyboard = [...(open ? [[open]] : []), backRow(who.tr)];
  await send(chatId, parts.length > 0 ? parts.join(NL) : `🎉 ${who.tr('تسکِ بازی ندارید.')}`, keyboard);
}

/**
 * کارتِ یک تسک از روی شماره (۲.۱۶.۰). «ALZ-325» مستقیم؛ «#325» بینِ تسک‌های
 * خودِ کاربر (صندوق) — چون بی‌کدِ پروژه معلوم نیست کدام پروژه. ⚠️ گاردِ دیدن
 * در `findTaskByRef`/`myTasks` است؛ ناپیدا و ممنوع یک جواب دارند.
 */
async function showTaskRef(chatId: number, who: Who, ref: ParsedTaskRef) {
  let found: { taskId: number; ref: string } | null = null;
  if (ref.kind === 'global') {
    const t = await findTaskByRef(who.actor, ref);
    if (t) found = { taskId: t.taskId, ref: t.ref };
  } else {
    const inbox = await myTasks(who.actor);
    const hits = [...inbox.active, ...inbox.waiting, ...inbox.review].filter((t) => t.number === ref.number);
    const unique = [...new Map(hits.map((t) => [t.id, t])).values()];
    if (unique.length > 1) {
      // چند پروژه تسکِ همین شماره را دارند ← کدِ کامل را نشان بده.
      const lines = unique.slice(0, 8).map((t) => `• ${taskRefGlobal({ id: t.projectId, code: t.projectCode }, ref.number)} · ${t.title}`);
      await send(chatId, [`🔢 ${who.tr('چند تسک با این شماره دارید؛ کدِ کامل را بفرستید:')}`, '', ...lines].join(NL));
      return;
    }
    const one = unique[0];
    if (one) found = { taskId: one.id, ref: taskRefGlobal({ id: one.projectId, code: one.projectCode }, ref.number) };
  }
  if (!found) {
    await send(chatId, `🔎 ${who.tr('تسکی با این شماره پیدا نشد. اگر در کارهای شما نیست، کدِ کاملش را بفرستید؛ مثلاً ALZ-325.')}`);
    return;
  }
  const card = await taskCard(found.taskId, who.locale, who.tr, who.actor.id);
  const open = appButton(who.tr, `/t/${found.ref}`, 'باز کردن در برنامه');
  await send(chatId, (card?.lines ?? [found.ref]).join(NL).slice(0, 4000), open ? [[open]] : []);
}

async function showHours(chatId: number, who: Who) {
  const today = todayIn(who.tz);
  const [totals, todayLogs, timer] = await Promise.all([
    myTotals(who.actor, new Date(), who.weekStart),
    myLogs(who.actor, { from: today, to: today, perPage: 20 }),
    timerView(who),
  ]);
  const lines = [
    `🕒 ${who.tr('ساعت‌های من')}`,
    '',
    `${who.tr('امروز')}: ${hm(todayLogs.rangeMinutes)}`,
    `${who.tr('این هفته')}: ${hm(totals.week)}`,
    `${who.tr('این ماه')}: ${hm(totals.month)}`,
  ];
  if (todayLogs.rows.length > 0) {
    lines.push('', `${who.tr('ثبت‌های امروز')}:`);
    for (const r of todayLogs.rows.slice(0, 8)) {
      lines.push(`• ${hm(r.minutes)} — ${r.projectTitle ?? who.tr('کارِ عمومی')}${r.description ? ` — ${r.description.slice(0, 60)}` : ''}`);
    }
  }
  if (timer.running) lines.push('', `⏱ ${who.tr('تایمر روشن است')}: ${timer.running.title} · ${hm(timer.running.minutes)}`);
  await send(chatId, lines.join(NL), menu(who.tr, timer, who));
}

/** پروژه‌های قابلِ ثبت: اخیراً کارشده‌ها اول. */
async function projectChoices(who: Who, limit = 12) {
  const all = await loggableProjects(who.actor);
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  const recent = await myLogs(who.actor, { from: since, to: todayIn(who.tz), perPage: 200 });
  const order = new Map<number, number>();
  recent.rows.forEach((r, i) => { if (r.projectId && !order.has(r.projectId)) order.set(r.projectId, i); });
  return [...all]
    .sort((a, b) => (order.get(a.id) ?? 1e9) - (order.get(b.id) ?? 1e9))
    .slice(0, limit);
}

async function pickProject(chatId: number, who: Who, prefix: 't:s' | 'l:j', title: string, messageId?: number) {
  const list = await projectChoices(who);
  const keyboard: Keyboard = list.map((p) => [{ text: p.title.slice(0, 60), callback_data: `${prefix}:${p.id}` }]);
  if (canLogGeneral(who.actor)) keyboard.push([{ text: who.tr('کارِ عمومی (بدونِ پروژه)'), callback_data: `${prefix}:0` }]);
  if (keyboard.length === 0) {
    await send(chatId, who.tr('پروژه‌ای برای ثبتِ ساعت ندارید.'), await menuFor(who));
    return;
  }
  keyboard.push(backRow(who.tr));
  if (messageId) await edit(chatId, messageId, title, keyboard);
  else await send(chatId, title, keyboard);
}

async function timerStart(chatId: number, who: Who, messageId?: number) {
  const state = await timerState(who.actor);
  if (state.running) {
    await send(chatId, `⏱ ${who.tr('تایمر روشن است')}: ${state.running.projectTitle ?? who.tr('کارِ عمومی')} · ${hm(state.running.minutes)}`,
      [[{ text: `⏹ ${who.tr('توقفِ تایمر')}`, callback_data: 't:x' }], backRow(who.tr)]);
    return;
  }
  if (state.pending) {
    await send(chatId, who.tr('یک تایمرِ طولانی منتظرِ تأییدِ شماست؛ آن را در برنامه، صفحهٔ ساعت‌های کاری، تأیید کنید.'), await menuFor(who));
    return;
  }
  await pickProject(chatId, who, 't:s', `▶️ ${who.tr('تایمر روی کدام پروژه شروع شود؟')}`, messageId);
}

async function timerStop(chatId: number, who: Who) {
  try {
    const before = await timerView(who);
    const result = await stopTimer(who.actor, '');
    await audit(who, 'timer.stop', { minutes: result.minutes });
    await send(chatId, result.parked
      ? `⏳ ${who.tr('تایمر بیش از حد طولانی بود؛ مدتِ آن را در برنامه، صفحهٔ ساعت‌های کاری، تأیید کنید.')}`
      : [
        `⏹ ${who.tr('تایمر متوقف شد')}`,
        `📁 ${before.running?.title ?? who.tr('کارِ عمومی')}`,
        `⏱ ${who.tr('{time} ثبت شد', { time: hm(result.minutes) })}`,
      ].join(NL), await menuFor(who));
  } catch (error) {
    if (error instanceof TimerError) {
      await send(chatId, `⏱ ${who.tr('تایمری روشن نیست.')}`, await menuFor(who));
      return;
    }
    throw error;
  }
}

/**
 * شناسهٔ پروژه از دادهٔ دکمه: `0` = کارِ عمومی (null)، عددِ مثبت = پروژه،
 * هر چیزِ دیگر (متن، منفی، اعشار) = undefined و **هیچ کاری**. ⚠️ دادهٔ دکمه را
 * هر کسی می‌تواند دستی بسازد؛ پیش از این `t:s:abc` به «کارِ عمومی» می‌افتاد.
 */
function projectArg(raw: string | undefined): number | null | undefined {
  if (!raw || !/^\d{1,10}$/.test(raw)) return undefined;
  const id = Number(raw);
  return id === 0 ? null : id;
}

const DURATIONS = [15, 30, 45, 60, 90, 120, 180, 240, 300, 360, 420, 480];

/* ---------------- دکمه‌ها ---------------- */

async function onCallback(update: NonNullable<TgUpdate['callback_query']>) {
  await api('answerCallbackQuery', { callback_query_id: update.id });
  const msg = update.message;
  if (!msg || (msg.chat.type && msg.chat.type !== 'private')) return;
  const chatId = msg.chat.id;
  const who = await whoIs(chatId);
  if (!who) { await sendNotLinked(chatId); return; }
  const data = update.data ?? '';
  const [kind, op, a, b] = data.split(':');

  try {
    if (kind === 'm' && op === 'menu') return await showMenu(chatId, who, msg.message_id);
    if (kind === 'm' && op === 'team') return await showTeam(chatId, who, msg.message_id);
    if (kind === 'm' && op === 'co') return await showCompany(chatId, who, msg.message_id);
    // 🔕 / بازگرداندن — فقط انواعِ یادآورِ خودکار و گزارشِ صبحگاهی.
    if ((kind === 'q' || kind === 'u') && op && [...MUTABLE_REMINDERS, 'brief'].includes(op)) {
      const next = kind === 'q' ? [...new Set([...who.muted, op])] : who.muted.filter((m) => m !== op);
      await db.update(users).set({ telegramMuted: next, updatedAt: new Date() }).where(eq(users.id, who.actor.id));
      await audit(who, kind === 'q' ? 'telegram.mute' : 'telegram.unmute', { type: op });
      await send(chatId, kind === 'q'
        ? `🔕 ${who.tr('باشد؛ این یادآوری دیگر در تلگرام نمی‌آید. (در برنامه می‌ماند.)')}`
        : `🔔 ${who.tr('این یادآوری دوباره در تلگرام می‌آید.')}`,
      kind === 'q' ? [[{ text: `↩️ ${who.tr('بازگرداندن')}`, callback_data: `u:${op}` }]] : undefined);
      return;
    }
    // ↩️ پاسخ از زیرِ اعلان: پرسشِ «پاسخ‌تان را بنویسید» با ForceReply.
    if (kind === 'r' && (op === 'm' || op === 'c')) {
      const target: ReplyTarget | null = op === 'm' && /^\d+$/.test(a ?? '')
        ? { thread: Number(a) }
        : op === 'c' && /^\d+$/.test(a ?? '') && /^\d+$/.test(b ?? '') ? { projectId: Number(a), commentId: Number(b) } : null;
      if (!target) return;
      pendingReplies.set(chatId, { target, at: Date.now() });
      await api('sendMessage', {
        chat_id: chatId, text: `✍️ ${who.tr('پاسخ‌تان را بنویسید (برای لغو: /cancel):')}`,
        reply_markup: { force_reply: true, input_field_placeholder: who.tr('پاسخ') },
      });
      return;
    }
    // درخواستِ پرداخت: دکمهٔ اول فقط می‌پرسد؛ «A»/«R» ِ بزرگ یعنی تأییدِ دوم.
    if (kind === 'pr' && op && a && /^\d+$/.test(a) && who.actor.roles.includes('owner')) {
      if (op === 'a' || op === 'r') {
        await send(chatId, op === 'a' ? `❓ ${who.tr('این درخواستِ پرداخت تأیید شود؟')}` : `❓ ${who.tr('این درخواستِ پرداخت رد شود؟')}`, [[
          { text: `✅ ${who.tr('بله')}`, callback_data: `pr:${op === 'a' ? 'A' : 'R'}:${a}` },
          { text: `✖️ ${who.tr('خیر')}`, callback_data: 'm:co' },
        ]]);
        return;
      }
      if (op === 'A' || op === 'R') {
        // ⚠️ نتیجه می‌گوید **کدام** درخواست — نه فقط «تأیید شد».
        const req = (await listRequests(who.actor, 'pending').catch(() => [])).find((r) => r.id === Number(a));
        await decideRequest(who.actor, Number(a), op === 'A' ? 'approved' : 'rejected', '');
        await audit(who, 'payment.decide', { requestId: Number(a), decision: op });
        const what = req ? ` ${req.userName} · ${moneyText(req.amount, req.currencyCode)}` : '';
        await edit(chatId, msg.message_id, op === 'A' ? `✅ ${who.tr('تأیید شد.')}${what}` : `✖️ ${who.tr('رد شد.')}${what}`);
        return await showCompany(chatId, who);
      }
    }
    // 📎 فایل: کجا برود؟
    if (kind === 'f') {
      if (op === 'x') { pendingFiles.delete(chatId); await edit(chatId, msg.message_id, `✖️ ${who.tr('لغو شد.')}`); return; }
      if (op === 'p' || op === 't') {
        const list = await fileProjects(who);
        const rows: Keyboard = list.map((pr) => [{ text: pr.title.slice(0, 60), callback_data: `f:${op === 'p' ? 'pp' : 'tp'}:${pr.id}` }]);
        rows.push([{ text: `✖️ ${who.tr('لغو')}`, callback_data: 'f:x' }]);
        await edit(chatId, msg.message_id, `📁 ${who.tr('کدام پروژه؟')}`, rows);
        return;
      }
      const id = projectArg(a);
      if (!id) return;
      if (op === 'pp') return await finishFile(chatId, who, msg.message_id, { projectId: id });
      if (op === 'tp') {
        // ⚠️ فقط تسک‌هایی که خودِ کاربر در صندوقش دارد؛ نه تسکِ دیگران.
        const inbox = await myTasks(who.actor);
        const tasksOf = [...inbox.active, ...inbox.review].filter((t) => t.projectId === id).slice(0, 12);
        if (tasksOf.length === 0) { await edit(chatId, msg.message_id, who.tr('در این پروژه تسکِ بازی ندارید.'), [[{ text: `📁 ${who.tr('فایل‌های پروژه')}`, callback_data: `f:pp:${id}` }]]); return; }
        await edit(chatId, msg.message_id, `📌 ${who.tr('کدام تسک؟')}`, [
          ...tasksOf.map((t) => [{ text: t.title.slice(0, 60), callback_data: `f:tt:${t.id}` }]),
          [{ text: `✖️ ${who.tr('لغو')}`, callback_data: 'f:x' }],
        ]);
        return;
      }
      if (op === 'tt') return await finishFile(chatId, who, msg.message_id, { taskId: id });
    }
    if (kind === 'm' && op === 'ai') return await showAi(chatId, who, msg.message_id);
    if (kind === 'm' && op === 'meet') return await showMeetings(chatId, who, msg.message_id);
    if (kind === 'm' && op === 'tasks') return await showTasks(chatId, who);
    if (kind === 'm' && op === 'hours') return await showHours(chatId, who);
    if (kind === 't' && op === 'p') return await timerStart(chatId, who, msg.message_id);
    if (kind === 't' && op === 'x') return await timerStop(chatId, who);
    if (kind === 't' && op === 's') {
      const projectId = projectArg(a);
      if (projectId === undefined) return;
      await startTimer(who.actor, projectId);
      await audit(who, 'timer.start', { projectId });
      const title = projectId ? (await projectTitle(who.actor, projectId)) : who.tr('کارِ عمومی');
      const at = new Intl.DateTimeFormat('en-GB', { timeZone: who.tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date());
      await edit(chatId, msg.message_id, [`▶️ ${who.tr('تایمر روشن شد')}`, `📁 ${title}`, `🕐 ${who.tr('شروع')}: ${at}`].join(NL),
        [[{ text: `⏹ ${who.tr('توقفِ تایمر')}`, callback_data: 't:x' }], backRow(who.tr)]);
      return;
    }
    if (kind === 'l' && op === 'p') return await pickProject(chatId, who, 'l:j', `➕ ${who.tr('ساعت روی کدام پروژه ثبت شود؟')}`, msg.message_id);
    if (kind === 'l' && op === 'j') {
      const parsed = projectArg(a);
      if (parsed === undefined) return;
      // ⚠️ دکمهٔ دست‌ساز برای پروژهٔ ممنوع حتی صفحهٔ انتخابِ مدت را هم نمی‌گیرد.
      if (!(await canLogTime(who.actor, parsed))) return;
      const pid = parsed ?? 0;
      const rows: Keyboard = [];
      for (let i = 0; i < DURATIONS.length; i += 4) {
        rows.push(DURATIONS.slice(i, i + 4).map((m) => ({ text: hm(m), callback_data: `l:m:${pid}:${m}` })));
      }
      rows.push(backRow(who.tr, 'l:p'));
      const title = parsed === null ? who.tr('کارِ عمومی') : await projectTitle(who.actor, parsed);
      await edit(chatId, msg.message_id, [`➕ ${who.tr('امروز چقدر کار کردید؟')}`, `📁 ${title}`].join(NL), rows);
      return;
    }
    if (kind === 'l' && op === 'm') {
      const projectId = projectArg(a);
      const minutes = Number(b);
      if (projectId === undefined || !/^\d+$/.test(b ?? '') || !DURATIONS.includes(minutes)) return;
      const date = todayIn(who.tz);
      await addOrMerge(who.actor, { projectId, logDate: date, minutes, description: '' });
      await audit(who, 'timelog.add', { projectId, minutes, date });
      const title = projectId ? (await projectTitle(who.actor, projectId)) : who.tr('کارِ عمومی');
      await edit(chatId, msg.message_id, [`✅ ${who.tr('ساعت ثبت شد')}`, `📁 ${title}`, `⏱ ${hm(minutes)} · 📅 ${date}`].join(NL), await menuFor(who));
      return;
    }
    if (kind === 'p' && op && a) {
      const choice = projectArg(a);
      if (choice === undefined) return;
      const picked = choice === null ? null : await projectTitle(who.actor, choice);
      await edit(chatId, msg.message_id, picked ? `📁 ${picked}` : `✖️ ${who.tr('هیچ‌کدام')}`);
      await api('sendChatAction', { chat_id: chatId, action: 'typing' });
      const result = await resolveChoice(who.actor.id, op, choice ?? 0);
      if (!result) {
        await send(chatId, who.tr('این درخواست منقضی شده است؛ دوباره بپرسید.'));
        return;
      }
      await deliver(chatId, who, result);
      return;
    }
    if (kind === 'a' && (op === 'y' || op === 'n') && a) {
      await edit(chatId, msg.message_id, op === 'y' ? `⏳ ${who.tr('در حالِ انجام…')}` : `✖️ ${who.tr('لغو شد.')}`);
      await api('sendChatAction', { chat_id: chatId, action: 'typing' });
      const result = await resolvePending(who.actor.id, a, op === 'y');
      if (!result) {
        await edit(chatId, msg.message_id, `⚠️ ${who.tr('این درخواست منقضی شده است؛ دوباره بپرسید.')}`);
        return;
      }
      // ⚠️ «⏳ در حالِ انجام…» آویزان نماند — همان پیام «✅ انجام شد» می‌شود.
      if (op === 'y') {
        await edit(chatId, msg.message_id, `✅ ${who.tr('انجام شد')}`);
        await deliver(chatId, who, result);
      }
      return;
    }
  } catch (error) {
    await send(chatId, explainError(who.tr, error), await menuFor(who));
  }
}

/**
 * نامِ پروژه برای پیام — ⚠️ فقط اگر کاربر آن پروژه را در برنامه می‌بیند؛ وگرنه
 * `#id`. شناسه از دکمهٔ دست‌ساز یا از مدلِ هوشِ مصنوعی می‌آید و نباید نامِ
 * پروژهٔ دیگران را لو بدهد (یافتهٔ ممیزیِ ۲.۱۲.۰).
 */
async function projectTitle(actor: Actor, id: number): Promise<string> {
  if (!(await canViewProject(actor, id))) return `#${id}`;
  const [row] = await db.select({ title: projects.title }).from(projects).where(eq(projects.id, id));
  return row?.title ?? `#${id}`;
}

/** نامِ تسک با همان احتیاط: پروژه‌اش دیده شود و اگر خصوصی است مالِ خودِ کاربر باشد. */
async function taskTitle(actor: Actor, id: number): Promise<string> {
  const [t] = await db.select({ title: tasks.title, projectId: tasks.projectId, isPrivate: tasks.isPrivate, assignedTo: tasks.assignedTo, createdBy: tasks.createdBy })
    .from(tasks).where(eq(tasks.id, id));
  if (!t || !(await canViewProject(actor, t.projectId))) return `#${id}`;
  if (t.isPrivate && t.assignedTo !== actor.id && t.createdBy !== actor.id && !actor.privateAccess) return `#${id}`;
  return t.title;
}

function explainError(tr: Translator, error: unknown): string {
  if (error instanceof TimerError) {
    return error.code === 'already_running' ? tr('یک تایمر از قبل روشن است.') : tr('تایمری روشن نیست.');
  }
  return tr('این کار انجام نشد؛ شاید دسترسی ندارید.');
}

/* ---------------- هوشِ مصنوعی ---------------- */

/** نامِ خوانای ابزارِ نوشتنی برای پیامِ تأیید. */
const WRITE_TITLES: Record<string, string> = {
  log_hours: 'ثبتِ ساعتِ کار',
  start_timer: 'شروعِ تایمر',
  stop_timer: 'توقفِ تایمر',
  create_task: 'ساختنِ تسک',
  set_task_status: 'تغییرِ وضعیتِ تسک',
  add_comment: 'نوشتنِ کامنت در پروژه',
  send_message: 'فرستادنِ پیامِ مستقیم',
  message_management: 'پیام به مدیریت',
  create_reminder: 'ساختنِ یادآور',
  delete_reminder: 'حذفِ یادآور',
  // ۲.۱۳.۰ — همهٔ کارهای سایت
  update_task: 'ویرایشِ تسک',
  refer_task: 'ارجاعِ تسک',
  claim_task: 'برداشتنِ تسک',
  add_task_note: 'یادداشت روی تسک',
  toggle_comment_done: 'انجام/باز کردنِ کامنت',
  apply_qa: 'اعمالِ چک‌لیستِ QA',
  toggle_qa_item: 'تیکِ آیتمِ QA',
  create_review: 'ساختنِ بازبینی',
  update_review: 'ویرایشِ بازبینی',
  add_review_item: 'افزودنِ مورد به بازبینی',
  add_project_link: 'افزودنِ پیوند به پروژه',
  pin_file: 'سنجاقِ فایل',
  reply_message: 'پاسخ در گفتگو',
  mute_conversation: 'بی‌صدا کردنِ گفتگو',
  create_channel: 'ساختنِ کانال',
  create_project_group: 'گروهِ گفتگوی پروژه',
  mark_notification_read: 'خوانده‌شدنِ اعلان',
  create_meeting: 'ساختنِ جلسه',
  update_meeting: 'ویرایشِ جلسه',
  record_leave: 'ثبتِ مرخصی',
  set_weekly_schedule: 'برنامهٔ هفتگی',
  onboarding_toggle: 'تیکِ آنبوردینگ',
  onboarding_start: 'شروعِ آنبوردینگ',
  onboarding_add_task: 'افزودنِ کارِ آنبوردینگ',
  update_time_log: 'ویرایشِ ساعتِ ثبت‌شده',
  resolve_long_timer: 'تکلیفِ تایمرِ طولانی',
  update_my_profile: 'ویرایشِ پروفایلِ من',
  set_my_timezone: 'منطقهٔ زمانیِ من',
  set_notification_prefs: 'تنظیمِ اعلان‌ها',
  delete_task: 'حذفِ تسک',
  delete_comment: 'حذفِ کامنت',
  delete_project_file: 'حذفِ فایلِ پروژه',
  delete_review: 'حذفِ بازبینی',
  delete_meeting: 'حذفِ جلسه',
  delete_conversation: 'حذفِ گفتگو',
  leave_conversation: 'خروج از گفتگو',
  delete_group_message: 'حذفِ پیامِ گروه',
  delete_leave: 'حذفِ مرخصی',
  delete_time_log: 'حذفِ ساعتِ ثبت‌شده',
  delete_onboarding_task: 'حذفِ کارِ آنبوردینگ',
  delete_qa_item: 'حذفِ آیتمِ QA',
  create_project: 'ساختنِ پروژه',
  update_project: 'ویرایشِ پروژه',
  set_project_status: 'تغییرِ وضعیتِ پروژه',
  archive_project: 'بایگانیِ پروژه',
  delete_project: 'حذفِ پروژه',
  add_project_member: 'افزودنِ عضو به پروژه',
  remove_project_member: 'برداشتنِ عضو از پروژه',
  set_project_access: 'قطع/وصلِ دسترسی به پروژه',
  set_project_clients: 'کارفرمایانِ پروژه',
  remove_qa_role: 'برداشتنِ نقشِ QA',
  tender_bid: 'پیشنهادِ مناقصه',
  project_units: 'کارکردِ تعدادی',
  my_payment_request: 'درخواستِ پرداختِ من',
  create_ledger_entry: 'ثبتِ درآمد یا هزینه',
  update_ledger_entry: 'ویرایشِ ردیفِ دفتر',
  delete_ledger_entry: 'حذفِ ردیفِ دفتر',
  transfer_money: 'انتقالِ پول بینِ حساب‌ها',
  decide_payment_request: 'تأیید/ردِ درخواستِ پرداخت',
  pay: 'پرداخت',
  recurring_payment: 'پرداختِ دوره‌ای',
  finance_account: 'حسابِ مالی',
  fiscal_period: 'بستن/بازکردنِ دورهٔ مالی',
  create_person: 'افزودنِ عضو یا کارفرما',
  update_person: 'ویرایشِ عضو یا کارفرما',
  set_member_state: 'وضعیتِ عضو (فعال/سابق/قفل)',
  remove_person: 'حذفِ عضو یا کارفرما',
  staff_access: 'دسترسیِ همکارِ ادمین',
  access_register: 'دفترِ دسترسی‌ها',
  settings_catalog: 'تنظیماتِ پایه (ارز، تگ، دفتر، …)',
  system_settings: 'تنظیماتِ سامانه',
  company_info: 'مشخصاتِ شرکت',
  daily_report: 'گزارشِ روزانه',
};

/** نامِ خوانای آرگومان‌ها در پیامِ تأیید (۲.۱۱.۰) — به‌جای کلیدِ انگلیسیِ خام. */
const ARG_LABELS: Record<string, string> = {
  text: 'متن', title: 'عنوان', description: 'توضیح', hours: 'ساعت', minutes: 'دقیقه',
  date: 'تاریخ', due_date: 'مهلت', status: 'وضعیت', at: 'زمان', reminder_id: 'یادآور',
  amount: 'مبلغ', direction: 'نوع', account_id: 'حساب', user_id: 'شخص', state: 'وضعیت', role: 'نقش', note: 'یادداشت', name: 'نام', decision: 'تصمیم', confirm_title: 'تأییدِ نام', action: 'کار', archived: 'بایگانی', blocked: 'قطعِ دسترسی',
};

async function describeArgs(actor: Actor, tr: Translator, args: Record<string, unknown>): Promise<string[]> {
  const lines: string[] = [];
  const pid = typeof args.project_id === 'number' ? args.project_id : null;
  if (pid) lines.push(`• ${tr('پروژه')}: ${await projectTitle(actor, pid)}`);
  if (typeof args.task_id === 'number') lines.push(`• ${tr('تسک')}: ${await taskTitle(actor, args.task_id)}`);
  // ⚠️ گیرنده‌ها با نام، نه شناسه — کاربر باید بداند پیام به دستِ چه کسی می‌رسد.
  const ids = Array.isArray(args.recipient_user_ids) ? args.recipient_user_ids.filter((x): x is number => typeof x === 'number') : [];
  if (ids.length > 0) {
    const rows = await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, ids));
    lines.push(`• ${tr('به')}: ${ids.map((id) => rows.find((r) => r.id === id)?.name ?? `#${id}`).join('، ')}`);
  }
  if (typeof args.assignee_user_id === 'number') {
    const [u] = await db.select({ name: users.name }).from(users).where(eq(users.id, args.assignee_user_id));
    lines.push(`• ${tr('مسئول')}: ${u?.name ?? `#${args.assignee_user_id}`}`);
  }
  const skip = new Set(['project_id', 'task_id', 'recipient_user_ids', 'assignee_user_id']);
  for (const [k, v] of Object.entries(args)) {
    if (skip.has(k) || v === '' || v === null || v === undefined || v === 0) continue;
    const label = ARG_LABELS[k] ? tr(ARG_LABELS[k]!) : k;
    lines.push(`• ${label}: ${String(typeof v === 'object' ? JSON.stringify(v) : v).slice(0, 300)}`);
  }
  return lines;
}

async function deliver(chatId: number, who: Who, result: AgentResult) {
  switch (result.kind) {
    case 'reply':
      // ⚠️ وقتی اولی جواب نداد، کاربر ببیند کدام جایگزین جواب داد.
      // ⚠️ جوابِ خالی ← کاربر پس از «در حالِ نوشتن…» بی‌پاسخ نماند.
      if (!result.text?.trim()) { await send(chatId, `⚠️ ${who.tr('هوشِ مصنوعی جوابی نداد؛ دوباره بپرسید.')}`); return; }
      await send(chatId, result.via ? `${result.text}${NL}${NL}↪️ ${who.tr('با {name}', { name: result.via })}` : result.text);
      return;
    case 'confirm': {
      const lines = [
        ...(result.note ? [result.note, ''] : []),
        // ⚠️ کارِ حساس (پول، حذف، دسترسی، تنظیمات) پیش از پرسش هشدارِ جدا می‌گیرد.
        ...(result.sensitive ? [`⚠️ ${who.tr('کارِ حساس — پیش از «بله» دقیق بخوانید.')}`, ''] : []),
        `❓ ${who.tr('این کار انجام شود؟')}`,
        `${who.tr(WRITE_TITLES[result.tool] ?? result.tool)}`,
        ...(await describeArgs(who.actor, who.tr, result.args)),
      ];
      await send(chatId, lines.join('\n'), [[
        { text: `✅ ${who.tr('بله')}`, callback_data: `a:y:${result.id}` },
        { text: `✖️ ${who.tr('خیر')}`, callback_data: `a:n:${result.id}` },
      ]]);
      return;
    }
    case 'choose': {
      // ⚠️ دکمه‌ها همان پروژه‌هایی‌اند که کاربر در برنامه می‌بیند؛ سرور دوباره می‌سنجد.
      const rows: Keyboard = result.options.map((o) => [{ text: o.title.slice(0, 60), callback_data: `p:${result.id}:${o.id}` }]);
      rows.push([{ text: `✖️ ${who.tr('هیچ‌کدام')}`, callback_data: `p:${result.id}:0` }]);
      await send(chatId, `📁 ${result.question || who.tr('کدام پروژه؟')}`, rows);
      return;
    }
    case 'quota':
      await send(chatId, who.tr('سهمیهٔ هوشِ مصنوعیِ شما فعلاً تمام شده است؛ تا آن موقع از دکمه‌ها استفاده کنید.'), await menuFor(who));
      return;
    case 'auth':
      await send(chatId, who.tr('کلیدِ هوشِ مصنوعیِ شما دیگر کار نمی‌کند؛ در پروفایل دوباره وصلش کنید.'), await menuFor(who));
      return;
    case 'busy':
      await send(chatId, who.tr('پیام‌ها زیاد شد؛ چند دقیقه صبر کنید. تا آن موقع دکمه‌ها کار می‌کنند.'), await menuFor(who));
      return;
    default:
      await send(chatId, who.tr('هوشِ مصنوعی جواب نداد؛ کمی بعد دوباره امتحان کنید یا از دکمه‌ها استفاده کنید.'), await menuFor(who));
  }
}

async function askAi(chatId: number, who: Who, text: string): Promise<boolean> {
  const secrets = (await loadAiSecrets(who.actor.id)).filter((x) => x.model);
  if (secrets.length === 0) return false;
  await api('sendChatAction', { chat_id: chatId, action: 'typing' });
  const result = await askAgent({
    actor: who.actor, userName: who.name, secrets, sensitive: who.aiSensitive,
    language: LOCALE_NAMES[who.locale], today: todayIn(who.tz), timezone: who.tz,
  }, text);
  await deliver(chatId, who, result);
  return true;
}

/**
 * پیامِ صوتی (۲.۱۱.۰): فایل از تلگرام ← متن با همان کلیدِ هوشِ مصنوعیِ کاربر ←
 * همان مسیرِ متنِ آزاد. ⚠️ ویسِ بلند یا بزرگ رد می‌شود؛ فایل فقط در حافظه است و
 * جایی ذخیره نمی‌شود.
 */
async function onVoice(chatId: number, who: Who, voice: TgVoice) {
  const all = await loadAiSecrets(who.actor.id);
  // اولین اتصالی که صدا می‌فهمد — DeepSeek برای متن و Groq برای ویس کنارِ هم کار می‌کنند.
  const secret = all.find((x) => transcriptionModel(x.provider)) ?? all[0];
  if (!secret) {
    await send(chatId, who.tr('برای فهمیدنِ پیامِ صوتی، اول یک هوشِ مصنوعی وصل کنید (Groq رایگان است). تا آن موقع بنویسید یا از دکمه‌ها استفاده کنید.'), await menuFor(who));
    return;
  }
  if (!transcriptionModel(secret.provider)) {
    await send(chatId, who.tr('هوشِ مصنوعیِ فعلیِ شما ({name}) صدا را به متن تبدیل نمی‌کند؛ برای ویس Groq (رایگان) یا OpenAI را وصل کنید. تا آن موقع بنویسید.', { name: PROVIDERS[secret.provider]?.label ?? secret.provider }), await menuFor(who));
    return;
  }
  if ((voice.duration ?? 0) > MAX_VOICE_SECONDS || (voice.file_size ?? 0) > MAX_VOICE_BYTES) {
    await send(chatId, who.tr('پیامِ صوتی بیش از ۳ دقیقه است؛ کوتاه‌تر بفرستید یا بنویسید.'));
    return;
  }
  await api('sendChatAction', { chat_id: chatId, action: 'typing' });
  const audio = await downloadVoice(voice.file_id);
  if (!audio) {
    await send(chatId, who.tr('فایلِ صوتی از تلگرام گرفته نشد؛ دوباره بفرستید.'));
    return;
  }
  const out = await transcribe(secret, audio, 'voice.ogg');
  if (!out.ok) {
    await send(chatId, out.reason === 'quota'
      ? who.tr('سهمیهٔ هوشِ مصنوعیِ شما فعلاً تمام شده است؛ تا آن موقع از دکمه‌ها استفاده کنید.')
      : out.reason === 'auth'
        ? who.tr('کلیدِ هوشِ مصنوعیِ شما دیگر کار نمی‌کند؛ در پروفایل دوباره وصلش کنید.')
        : who.tr('صدا به متن تبدیل نشد؛ لطفاً بنویسید.'), await menuFor(who));
    return;
  }
  // کاربر ببیند ربات چه شنیده — اگر اشتباه فهمید، همین‌جا معلوم است.
  await send(chatId, `🎤 «${out.text.slice(0, 1000)}»`);
  await askAi(chatId, who, out.text);
}

/** دانلودِ فایلِ صوتی از تلگرام — فقط در حافظه. */
async function downloadVoice(fileId: string): Promise<Blob | null> {
  const info = await api('getFile', { file_id: fileId }) as { ok?: boolean; result?: { file_path?: string; file_size?: number } } | null;
  const path = info?.result?.file_path;
  if (!info?.ok || !path || (info.result?.file_size ?? 0) > MAX_VOICE_BYTES) return null;
  const { token } = await telegramCredentials();
  if (!token) return null;
  const res = await fetch(`https://api.telegram.org/file/bot${token}/${path}`, { signal: AbortSignal.timeout(30_000) }).catch(() => null);
  if (!res?.ok) return null;
  const blob = await res.blob();
  return blob.size > 0 && blob.size <= MAX_VOICE_BYTES ? blob : null;
}

/* ---------------- پیام ---------------- */

/**
 * «به حسابی وصل نیستید» — یک متن برای همهٔ راه‌ها (متن، عکس، ویس، دکمه).
 * ⚠️ پیش از این عکس/ویس/دکمه از چتِ ناشناس بی‌جواب می‌ماند.
 */
async function sendNotLinked(chatId: number) {
  const tr = await translatorFor((await systemLocale()).locale);
  await send(chatId, `⚠️ ${tr('این چت به حسابِ فعالی وصل نیست. در برنامه به پروفایل ← «اعلان‌ها و تلگرام» بروید و «اتصال به تلگرام» را بزنید.')}`);
}

async function onMessage(msg: TgMessage) {
  // ⚠️ در گروه فقط «/start <token>» ِ وصل‌کردنِ گروهِ پروژه (۲.۱۴.۰)؛ هیچ دادهٔ دیگری.
  if (msg.chat.type === 'group' || msg.chat.type === 'supergroup') {
    const [c, token] = (msg.text ?? '').trim().split(/\s+/);
    if ((c ?? '').toLowerCase().replace(/@.*$/, '') === '/start' && token) {
      const title = await linkProjectGroup(token, msg.chat.id);
      const tr = await translatorFor((await systemLocale()).locale);
      await send(msg.chat.id, title
        ? `✅ ${tr('این گروه به پروژهٔ «{project}» وصل شد؛ کامنت‌ها و تسک‌های تازه و انجام‌شده اینجا هم می‌آیند.', { project: title })}`
        // ⚠️ لینکِ گروه از صفحهٔ پروژه می‌آید، نه از پروفایل.
        : `⚠️ ${tr('این لینک معتبر نیست یا قبلاً استفاده شده؛ از تبِ «مدیریت» ِ پروژه دوباره «افزودنِ ربات به گروه» را بزنید.')}`);
    }
    return;
  }
  if (msg.chat.type && msg.chat.type !== 'private') return;
  const chatId = msg.chat.id;
  const text = (msg.text ?? '').trim();
  if (!text && (msg.photo || msg.document)) {
    const who = await whoIs(chatId);
    if (who) await onFile(chatId, who, msg);
    else await sendNotLinked(chatId);
    return;
  }
  if (!text) {
    // ⚠️ پیامِ صوتی هنوز فهمیده نمی‌شود (۲.۱۰.۰)؛ بی‌جواب ماندنش گیج‌کننده بود.
    const voice = msg.voice ?? msg.audio;
    if (voice) {
      const who = await whoIs(msg.chat.id);
      if (who) await onVoice(msg.chat.id, who, voice);
      else await sendNotLinked(chatId);
    }
    return;
  }
  const [command, ...rest] = text.split(/\s+/);
  const cmd = (command ?? '').toLowerCase().replace(/@.*$/, '');

  // اتصال از لینکِ پروفایل: «/start <token>».
  if (cmd === '/start' && rest[0]) {
    const result = await linkTelegramChat(rest[0], String(chatId));
    const sys = await systemLocale();
    if (result === 'taken') {
      await send(chatId, `⚠️ ${(await translatorFor(sys.locale))('این حسابِ تلگرام به کاربرِ دیگری وصل است.')}`);
      return;
    }
    if (result === 'not_found') {
      await send(chatId, `⚠️ ${(await translatorFor(sys.locale))('این لینک معتبر نیست یا قبلاً استفاده شده؛ از پروفایل دوباره «اتصال» را بزنید.')}`);
      return;
    }
    const who = await whoIs(chatId);
    if (who) {
      await localizeChatMenu(chatId, who);
      // یک پیام با صفحه‌کلیدِ پایین، بعد منو — پیش از این سه پیامِ پشتِ‌هم بود.
      await api('sendMessage', {
        chat_id: chatId,
        text: `✅ ${who.tr('تلگرامِ شما وصل شد. از این به بعد اعلان‌ها هم اینجا می‌آیند.')}`,
        reply_markup: replyKeyboard(who),
      });
      await showMenu(chatId, who);
    } else {
      // ⚠️ وصل شد ولی حساب فعال نیست (مثلاً «فقط مالی») — بی‌جواب نماند.
      await sendNotLinked(chatId);
    }
    return;
  }

  const who = await whoIs(chatId);
  if (!who) {
    await sendNotLinked(chatId);
    return;
  }

  try {
    // ↩️ پاسخِ در انتظار: متنِ بعدی (نه دستور) همان پاسخ است.
    const pendingReply = pendingReplies.get(chatId);
    // ⚠️ دکمهٔ میان‌برِ پایین پاسخ نیست: پیش از این «📋 تسک‌های من» به‌عنوانِ
    // پاسخ (شاید به کارفرما) فرستاده می‌شد. میان‌بر پاسخِ در انتظار را لغو می‌کند.
    const isShortcut = (Object.values(shortcuts(who)) as string[]).includes(text);
    if (pendingReply) {
      pendingReplies.delete(chatId);
      if (!text.startsWith('/') && !isShortcut && Date.now() - pendingReply.at < 10 * 60_000) {
        if ('thread' in pendingReply.target) await replyInThread(who.actor, pendingReply.target.thread, text);
        else await addComment(who.actor, pendingReply.target.projectId, text, pendingReply.target.commentId);
        await audit(who, 'reply', { target: pendingReply.target });
        await send(chatId, `✅ ${who.tr('پاسخ فرستاده شد.')}`);
        return;
      }
      if (cmd === '/cancel') { await send(chatId, `✖️ ${who.tr('لغو شد.')}`); return; }
    }

    // ⌨️ دکمه‌های میان‌برِ پایینِ صفحه — متن‌شان به زبانِ همین کاربر است.
    const k = shortcuts(who);
    // صفحه‌کلیدِ قدیمیِ مالک هنوز «ساعت»/«تایمر» دارد ← صفحه‌کلیدِ تازه جایش می‌نشیند.
    if (who.owner && (text === k.hours || text === k.timer)) return await sendShortcuts(chatId, who);
    if (text === k.tasks) return await showTasks(chatId, who);
    if (text === k.hours) return await showHours(chatId, who);
    // تایمرِ روشن ← همان پیامِ «روشن است · توقف»؛ خاموش ← انتخابِ پروژه.
    if (text === k.timer) return await timerStart(chatId, who);
    if (text === k.meetings) return await showMeetings(chatId, who);
    if (text === k.menu) return await showMenu(chatId, who);
    if (text === k.team && who.manager) return await showTeam(chatId, who);
    if (text === k.company && who.company) return await showCompany(chatId, who);

    // «#325» یا «ALZ-325» (۲.۱۶.۰) ← کارتِ همان تسک.
    const ref = cmd.startsWith('/') ? null : parseTaskRef(text);
    if (ref) return await showTaskRef(chatId, who, ref);

    switch (cmd) {
      case '/start':
        await localizeChatMenu(chatId, who);
        await sendShortcuts(chatId, who);
        return await showMenu(chatId, who);
      case '/keyboard':
        return await sendShortcuts(chatId, who);
      case '/team':
        if (who.manager) return await showTeam(chatId, who);
        break;
      case '/cancel':
        pendingFiles.delete(chatId);
        await send(chatId, `✖️ ${who.tr('لغو شد.')}`);
        return;
      case '/menu':
        return await showMenu(chatId, who);
      case '/help':
        return await showHelp(chatId, who);
      case '/tasks':
        return await showTasks(chatId, who);
      case '/hours':
        return await showHours(chatId, who);
      case '/timer':
        return await timerStart(chatId, who);
      case '/stop':
        return await timerStop(chatId, who);
      case '/log':
        return await pickProject(chatId, who, 'l:j', who.tr('ساعت روی کدام پروژه ثبت شود؟'));
      case '/ai':
        return await showAi(chatId, who);
      case '/meetings':
        return await showMeetings(chatId, who);
      case '/new':
        forgetConversation(who.actor.id);
        await send(chatId, who.tr('گفت‌وگو از نو شروع شد.'));
        return;
    }
    if (cmd.startsWith('/')) return await showMenu(chatId, who);

    if (!(await askAi(chatId, who, text))) {
      await send(chatId, who.tr('برای جوابِ هوشمند به متنِ آزاد، در پروفایل ← «دستیارِ هوشِ مصنوعی» یک ارائه‌دهنده وصل کنید. تا آن موقع:'), await menuFor(who));
    }
  } catch (error) {
    await send(chatId, explainError(who.tr, error), await menuFor(who));
  }
}

/* ---------------- ورودی ---------------- */

/** به‌روزرسانی‌های دیده‌شده — تلگرام در خطا دوباره می‌فرستد. */
const seen = new Set<number>();

let commandsRegistered = false;

export async function handleUpdate(update: TgUpdate): Promise<void> {
  if (typeof update?.update_id !== 'number' || seen.has(update.update_id)) return;
  if (!commandsRegistered) {
    // یک بار در هر فرایند — منوی «/» ِ تلگرام به زبانِ پیش‌فرضِ سامانه.
    commandsRegistered = true;
    await registerCommands().catch(() => {});
  }
  seen.add(update.update_id);
  if (seen.size > 2000) seen.delete(seen.values().next().value as number);
  try {
    if (update.message) await onMessage(update.message);
    else if (update.callback_query) await onCallback(update.callback_query);
  } catch (error) {
    console.error('[telegram] update failed', error instanceof Error ? error.message : error);
  }
}

/** فهرستِ دستورها در منوی تلگرام. */
/** فهرستِ دستورهای منوی «/» ِ تلگرام به یک زبان. */
function commandList(tr: Translator, roles?: { owner: boolean; manager: boolean }) {
  return [
    { command: 'menu', description: tr('منوی اصلی') },
    { command: 'tasks', description: tr('تسک‌های من') },
    // مالک ساعت نمی‌زند — منوی «/» ِ چتِ خودش هم این‌ها را ندارد.
    ...(roles?.owner ? [] : [
      { command: 'hours', description: tr('ساعت‌های من') },
      { command: 'timer', description: tr('شروعِ تایمر') },
      { command: 'stop', description: tr('توقفِ تایمر') },
      { command: 'log', description: tr('ثبتِ ساعت') },
    ]),
    ...(roles?.manager ? [{ command: 'team', description: tr('تیم من') }] : []),
    { command: 'meetings', description: tr('جلسه‌ها و یادآورها') },
    { command: 'ai', description: tr('هوشِ مصنوعی') },
    { command: 'new', description: tr('گفت‌وگوی تازه با هوشِ مصنوعی') },
    { command: 'keyboard', description: tr('نمایشِ میان‌برها') },
    { command: 'help', description: tr('راهنما') },
  ];
}

/** توضیحِ ربات (پیش از Start) و توضیحِ کوتاهِ پروفایلش — به هر زبان (۲.۱۴.۰). */
function botDescriptions(tr: Translator) {
  return {
    description: tr('دستیارِ Kabarza: تسک‌ها، ساعتِ کار، تایمر، جلسه‌ها و پیام‌هایتان را همین‌جا ببینید و انجام دهید. برای شروع، در Kabarza از پروفایل ← «اعلان‌ها و تلگرام» روی «اتصال به تلگرام» بزنید.'),
    short: tr('تسک، ساعت، تایمر و جلسه‌های Kabarza در تلگرام.'),
  };
}

/**
 * کدِ زبانِ تلگرام (ISO 639-1) برای هر زبانِ برنامه. ⚠️ کردیِ سورانی کدِ دوحرفیِ
 * جدا ندارد؛ کاربرانش فهرستِ پیش‌فرض (زبانِ سامانه) را می‌بینند.
 */
const TELEGRAM_LANG: Partial<Record<Locale, string>> = {
  fa: 'fa', en: 'en', ar: 'ar', de: 'de', es: 'es', fr: 'fr', pt: 'pt', tr: 'tr',
};

/**
 * منوی «/» ِ تلگرام (۲.۱۳.۰: چندزبانه) — پیش‌فرض به زبانِ سامانه، و برای هر زبانِ
 * برنامه یک نسخه با `language_code`؛ تلگرام به هر کاربر نسخهٔ زبانِ خودش را نشان می‌دهد.
 */
export async function registerCommands(): Promise<void> {
  const { locale } = await systemLocale();
  const tr = await translatorFor(locale);
  await api('setMyCommands', { commands: commandList(tr) });
  const base = botDescriptions(tr);
  await api('setMyDescription', { description: base.description });
  await api('setMyShortDescription', { short_description: base.short });
  for (const [appLocale, code] of Object.entries(TELEGRAM_LANG) as Array<[Locale, string]>) {
    const ltr = await translatorFor(appLocale);
    await api('setMyCommands', { commands: commandList(ltr), language_code: code });
    const d = botDescriptions(ltr);
    await api('setMyDescription', { description: d.description, language_code: code });
    await api('setMyShortDescription', { short_description: d.short, language_code: code });
  }
  // دکمهٔ کنارِ جعبهٔ پیام: مینی‌اپ (فقط با HTTPS) — پیش‌فرض؛ هر چت در /start به زبانِ خودش.
  const url = miniAppUrl('/');
  if (url) {
    await api('setChatMenuButton', { menu_button: { type: WEB_APP, text: tr('باز کردنِ برنامه'), web_app: { url } } });
  }
}

/** دکمهٔ مینی‌اپِ کنارِ جعبهٔ پیامِ همین چت، به زبانِ خودِ کاربر. */
async function localizeChatMenu(chatId: number, who: Who) {
  const url = miniAppUrl('/');
  if (url) await api('setChatMenuButton', { chat_id: chatId, menu_button: { type: WEB_APP, text: who.tr('باز کردنِ برنامه'), web_app: { url } } });
  // منوی «/» ِ همین چت به زبان و نقشِ همین نفر (۲.۱۶.۲).
  await api('setMyCommands', { commands: commandList(who.tr, who), scope: { type: CHAT_SCOPE, chat_id: chatId } }).catch(() => {});
}

/** دامنهٔ «فقط همین چت» برای منوی دستورها — ثابتِ جدا (قاعدهٔ `gateway.test`). */
const CHAT_SCOPE = 'chat';

/** فقط برای تست. */
export function resetBotState() {
  seen.clear();
  commandsRegistered = true;
  translators.clear();
}


/* ---------------- گزارشِ صبحگاهی (۲.۱۴.۰) ---------------- */

/**
 * گزارشِ صبحگاهیِ یک نفر. ⚠️ اگر چیزی برای گفتن نیست **هیچ نمی‌فرستد** (false)؛
 * گزارشِ خالی همان آزاری است که نمی‌خواهیم. زمان‌بند کی‌بودنش را می‌سنجد
 * (`briefDue`)؛ اینجا فقط محتوا.
 */
export async function sendMorningBrief(userId: number): Promise<boolean> {
  const [row] = await db.select({ chatId: users.telegramChatId }).from(users).where(eq(users.id, userId));
  if (!row?.chatId) return false;
  const who = await whoById(userId);
  if (!who) return false;
  const today = todayIn(who.tz);
  const [inbox, meetingsList, reminderList] = await Promise.all([
    myTasks(who.actor),
    listMeetings(who.actor).then((r) => r.meetings).catch(() => []),
    listReminders(who.actor).catch(() => []),
  ]);
  const dayOf = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: who.tz }).format(d);
  const timeOf = (d: Date) => new Intl.DateTimeFormat('en-GB', { timeZone: who.tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);
  const meetingsToday = meetingsList.filter((m) => dayOf(new Date(m.meetAt)) === today);
  const remindersToday = reminderList.filter((r) => !r.isSent && dayOf(new Date(r.remindAt)) === today);
  const overdue = inbox.active.filter((t) => t.dueDate && t.dueDate < today);
  const dueToday = inbox.active.filter((t) => t.dueDate === today);
  const reviews = who.manager ? inbox.review : [];

  if (meetingsToday.length + remindersToday.length + overdue.length + dueToday.length + reviews.length === 0) return false;

  // سرتیترِ هر بخش «آیکون عنوان (شمار)»، یک خطِ خالی میانِ بخش‌ها — همان قالبِ «تیم من».
  const lines = [`☀️ ${who.tr('صبح بخیر {name}!', { name: who.name })}`];
  const section = (head: string, count: number) => lines.push('', `${head} (${count})`);
  if (meetingsToday.length > 0) {
    section(`📅 ${who.tr('جلسه‌های امروز')}`, meetingsToday.length);
    for (const m of meetingsToday.slice(0, 6)) lines.push(bullet(timeOf(new Date(m.meetAt)), m.title));
  }
  if (dueToday.length > 0) {
    section(`📌 ${who.tr('ددلاینِ امروز')}`, dueToday.length);
    for (const t of dueToday.slice(0, 6)) lines.push(bullet(t.title, t.projectTitle));
  }
  if (overdue.length > 0) {
    section(`⚠️ ${who.tr('دیرکرد')}`, overdue.length);
    for (const t of overdue.slice(0, 5)) lines.push(bullet(t.title, t.projectTitle, t.dueDate));
  }
  if (remindersToday.length > 0) {
    section(`⏰ ${who.tr('یادآورهای امروز')}`, remindersToday.length);
    for (const r of remindersToday.slice(0, 5)) lines.push(bullet(timeOf(new Date(r.remindAt)), r.body.slice(0, 100)));
  }
  if (reviews.length > 0) section(`🔍 ${who.tr('در انتظارِ بازبینیِ شما')}`, reviews.length);

  // ⚠️ دکمه‌های کوتاه، نه کلِ منو: صفحه‌کلیدِ پایین ناوبری را دارد.
  const open = appButton(who.tr, '/tasks', 'باز کردن در برنامه');
  const keyboard: Keyboard = [
    [{ text: `📋 ${who.tr('تسک‌های من')}`, callback_data: 'm:tasks' }, ...(open ? [open] : [])],
    // ⚠️ همیشه یک ضربه تا خاموشی؛ در پروفایل هم ساعتش عوض یا خاموش می‌شود.
    [{ text: `🔕 ${who.tr('گزارشِ صبحگاهی را نفرست')}`, callback_data: 'q:brief' }],
  ];
  await send(Number(row.chatId), lines.join(NL), keyboard);
  return true;
}
