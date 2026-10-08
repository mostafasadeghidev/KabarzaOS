import { eq, inArray } from 'drizzle-orm';
import { db } from '@/db/client';
import { auditLog, projects, tasks, users } from '@/db/schema';
import type { Actor } from '@/domain/access/permissions';
import { isLocale, LOCALE_NAMES, type Locale } from '@/i18n/config';
import { createTranslator, type Translator } from '@/i18n/translate';
import { loadMessages } from '@/i18n/server';
import { loadActor } from '@/server/auth';
import { linkTelegramChat } from '@/server/people/profile-service';
import { myTasks } from '@/server/projects/service';
import { getSystemConfig } from '@/server/settings/system-service';
import { telegramCredentials } from '@/server/settings/telegram-service';
import {
  addOrMerge, canLogGeneral, loggableProjects, myLogs, myTotals, startTimer, stopTimer, timerState, TimerError,
} from '@/server/timelogs/service';
import { loadAiSecret, type AiConnectionView } from '@/server/ai/connections';
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
export interface TgMessage { message_id: number; text?: string; chat: TgChat; from?: TgUser; voice?: TgVoice; audio?: TgVoice }
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

function hm(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}

function todayIn(tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz || 'UTC' }).format(new Date());
}

async function send(chatId: number, text: string, keyboard?: Keyboard) {
  await api('sendMessage', {
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
    ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}),
  });
}

async function edit(chatId: number, messageId: number, text: string, keyboard?: Keyboard) {
  await api('editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    text,
    disable_web_page_preview: true,
    reply_markup: { inline_keyboard: keyboard ?? [] },
  });
}

interface Who {
  actor: Actor;
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
  const loaded = await loadActor(row.id);
  if (!loaded || loaded.user.memberState !== 'active') return null;
  const sys = await systemLocale();
  const locale = loaded.user.locale && isLocale(loaded.user.locale) ? loaded.user.locale : sys.locale;
  return {
    actor: loaded.actor, name: loaded.user.name, tr: await translatorFor(locale),
    locale, tz: sys.tz, weekStart: sys.weekStart,
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

function menu(tr: Translator): Keyboard {
  const app = appButton(tr);
  return [
    [{ text: `📋 ${tr('تسک‌های من')}`, callback_data: 'm:tasks' }, { text: `🕒 ${tr('ساعت‌های من')}`, callback_data: 'm:hours' }],
    [{ text: `▶️ ${tr('شروعِ تایمر')}`, callback_data: 't:p' }, { text: `⏹ ${tr('توقفِ تایمر')}`, callback_data: 't:x' }],
    [{ text: `➕ ${tr('ثبتِ ساعت')}`, callback_data: 'l:p' }, { text: `🤖 ${tr('هوشِ مصنوعی')}`, callback_data: 'm:ai' }],
    ...(app ? [[app]] : []),
  ];
}

/**
 * نوعِ دکمهٔ منوی تلگرام. ⚠️ ثابتِ جدا، نه رشتهٔ لفظی کنارِ کلیدِ type: تستِ
 * نگاشتِ اعلان (`gateway.test`) هر `type: '…'` ِ کد را نوعِ اعلان حساب می‌کند.
 */
const WEB_APP = 'web_app' as const;

/** خط‌شکنیِ پیامِ تلگرام. */
const NL = String.fromCharCode(10);

/** «DeepSeek — deepseek-chat» برای پیام‌ها. */
function aiLabel(provider: ProviderId, model: string): string {
  return `${PROVIDERS[provider]?.label ?? provider}${model ? ` — ${model}` : ''}`;
}

/** خطِ وضعیتِ هوشِ مصنوعی در منو (۲.۱۰.۰) — همیشه معلوم باشد وصل است یا نه. */
async function aiStatusLine(who: Who): Promise<string> {
  const secret = await loadAiSecret(who.actor.id);
  return secret
    ? `🤖 ${who.tr('هوشِ مصنوعی: {name}', { name: aiLabel(secret.provider, secret.model) })}${NL}${who.tr('می‌توانید سؤالتان را هم آزاد بنویسید؛ هوشِ مصنوعیِ شما جواب می‌دهد. /new گفت‌وگو را از نو شروع می‌کند.')}`
    : `🤖 ${who.tr('هوشِ مصنوعی وصل نیست.')} ${who.tr('با وصل‌کردنش می‌توانید آزاد بپرسید، مثلاً «امروز چه تسکی دارم؟». دکمهٔ «هوشِ مصنوعی» را بزنید.')}`;
}

/** صفحهٔ «هوشِ مصنوعی» در ربات: وضعیت + راهِ وصل/عوض‌کردن. */
async function showAi(chatId: number, who: Who, messageId?: number) {
  const secret = await loadAiSecret(who.actor.id);
  const lines = secret
    ? [
      `✅ ${who.tr('هوشِ مصنوعیِ شما وصل است: {name}', { name: aiLabel(secret.provider, secret.model) })}`,
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
    await api('sendMessage', { chat_id: Number(row.chatId), text, reply_markup: { inline_keyboard: menu(tr) } });
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

async function showMenu(chatId: number, who: Who) {
  const lines = [
    who.tr('سلام {name}! چه کاری انجام بدهم؟', { name: who.name }),
    '',
    '/tasks — ' + who.tr('تسک‌های من'),
    '/hours — ' + who.tr('ساعت‌های من'),
    '/timer — ' + who.tr('شروعِ تایمر'),
    '/stop — ' + who.tr('توقفِ تایمر'),
    '/log — ' + who.tr('ثبتِ ساعت'),
    '/ai — ' + who.tr('هوشِ مصنوعی'),
    '',
    await aiStatusLine(who),
  ];
  await send(chatId, lines.join('\n'), menu(who.tr));
}

async function showTasks(chatId: number, who: Who) {
  const inbox = await myTasks(who.actor);
  const line = (x: { title: string; projectTitle: string | null; dueDate: string | null }) =>
    `• ${x.title}${x.projectTitle ? ` — ${x.projectTitle}` : ''}${x.dueDate ? ` (${x.dueDate})` : ''}`;
  const parts: string[] = [];
  if (inbox.active.length > 0) {
    parts.push(`📋 ${who.tr('تسک‌های باز')} (${inbox.active.length})`, ...inbox.active.slice(0, 15).map(line));
    if (inbox.active.length > 15) parts.push(who.tr('و {n} مورد دیگر', { n: inbox.active.length - 15 }));
  }
  if (inbox.review.length > 0) {
    parts.push('', `🔍 ${who.tr('در انتظارِ بازبینیِ شما')} (${inbox.review.length})`, ...inbox.review.slice(0, 10).map(line));
  }
  if (inbox.waiting.length > 0) {
    parts.push('', `⏳ ${who.tr('قابلِ برداشتن')}: ${inbox.waiting.length}`);
  }
  await send(chatId, parts.length > 0 ? parts.join('\n') : who.tr('تسکِ بازی ندارید. 🎉'), menu(who.tr));
}

async function showHours(chatId: number, who: Who) {
  const today = todayIn(who.tz);
  const [totals, todayLogs, timer] = await Promise.all([
    myTotals(who.actor, new Date(), who.weekStart),
    myLogs(who.actor, { from: today, to: today, perPage: 50 }),
    timerState(who.actor),
  ]);
  const lines = [
    `🕒 ${who.tr('امروز')}: ${hm(todayLogs.rangeMinutes)}`,
    `${who.tr('این هفته')}: ${hm(totals.week)}`,
    `${who.tr('این ماه')}: ${hm(totals.month)}`,
  ];
  if (timer.running) {
    lines.push('', `▶️ ${who.tr('تایمر روشن است')}: ${timer.running.projectTitle ?? who.tr('کارِ عمومی')} — ${hm(timer.running.minutes)}`);
  }
  await send(chatId, lines.join('\n'), menu(who.tr));
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
    await send(chatId, who.tr('پروژه‌ای برای ثبتِ ساعت ندارید.'), menu(who.tr));
    return;
  }
  keyboard.push(backRow(who.tr));
  if (messageId) await edit(chatId, messageId, title, keyboard);
  else await send(chatId, title, keyboard);
}

async function timerStart(chatId: number, who: Who, messageId?: number) {
  const state = await timerState(who.actor);
  if (state.running) {
    await send(chatId, `▶️ ${who.tr('تایمر روشن است')}: ${state.running.projectTitle ?? who.tr('کارِ عمومی')} — ${hm(state.running.minutes)}`,
      [[{ text: `⏹ ${who.tr('توقفِ تایمر')}`, callback_data: 't:x' }], backRow(who.tr)]);
    return;
  }
  if (state.pending) {
    await send(chatId, who.tr('یک تایمرِ طولانی منتظرِ تأییدِ شماست؛ آن را در برنامه، صفحهٔ ساعت‌های کاری، تأیید کنید.'), menu(who.tr));
    return;
  }
  await pickProject(chatId, who, 't:s', who.tr('تایمر روی کدام پروژه شروع شود؟'), messageId);
}

async function timerStop(chatId: number, who: Who) {
  try {
    const result = await stopTimer(who.actor, '');
    await audit(who, 'timer.stop', { minutes: result.minutes });
    await send(chatId, result.parked
      ? who.tr('تایمر بیش از حد طولانی بود؛ مدتِ آن را در برنامه، صفحهٔ ساعت‌های کاری، تأیید کنید.')
      : `✅ ${who.tr('تایمر متوقف شد و {time} ثبت شد.', { time: hm(result.minutes) })}`, menu(who.tr));
  } catch (error) {
    if (error instanceof TimerError) {
      await send(chatId, who.tr('تایمری روشن نیست.'), menu(who.tr));
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
  if (!who) return;
  const data = update.data ?? '';
  const [kind, op, a, b] = data.split(':');

  try {
    if (kind === 'm' && op === 'menu') {
      await edit(chatId, msg.message_id, who.tr('چه کاری انجام بدهم؟'), menu(who.tr));
      return;
    }
    if (kind === 'm' && op === 'ai') return await showAi(chatId, who, msg.message_id);
    if (kind === 'm' && op === 'tasks') return await showTasks(chatId, who);
    if (kind === 'm' && op === 'hours') return await showHours(chatId, who);
    if (kind === 't' && op === 'p') return await timerStart(chatId, who, msg.message_id);
    if (kind === 't' && op === 'x') return await timerStop(chatId, who);
    if (kind === 't' && op === 's') {
      const projectId = projectArg(a);
      if (projectId === undefined) return;
      await startTimer(who.actor, projectId);
      await audit(who, 'timer.start', { projectId });
      const title = projectId ? (await projectTitle(projectId)) : who.tr('کارِ عمومی');
      await edit(chatId, msg.message_id, `▶️ ${who.tr('تایمر روشن شد')}: ${title}`, [[{ text: `⏹ ${who.tr('توقفِ تایمر')}`, callback_data: 't:x' }], backRow(who.tr)]);
      return;
    }
    if (kind === 'l' && op === 'p') return await pickProject(chatId, who, 'l:j', who.tr('ساعت روی کدام پروژه ثبت شود؟'), msg.message_id);
    if (kind === 'l' && op === 'j') {
      const parsed = projectArg(a);
      if (parsed === undefined) return;
      const pid = parsed ?? 0;
      const rows: Keyboard = [];
      for (let i = 0; i < DURATIONS.length; i += 4) {
        rows.push(DURATIONS.slice(i, i + 4).map((m) => ({ text: hm(m), callback_data: `l:m:${pid}:${m}` })));
      }
      rows.push(backRow(who.tr, 'l:p'));
      await edit(chatId, msg.message_id, who.tr('امروز چقدر کار کردید؟'), rows);
      return;
    }
    if (kind === 'l' && op === 'm') {
      const projectId = projectArg(a);
      const minutes = Number(b);
      if (projectId === undefined || !/^\d+$/.test(b ?? '') || !DURATIONS.includes(minutes)) return;
      const date = todayIn(who.tz);
      await addOrMerge(who.actor, { projectId, logDate: date, minutes, description: '' });
      await audit(who, 'timelog.add', { projectId, minutes, date });
      const title = projectId ? (await projectTitle(projectId)) : who.tr('کارِ عمومی');
      await edit(chatId, msg.message_id, `✅ ${who.tr('{time} برای «{project}» در تاریخِ {date} ثبت شد.', { time: hm(minutes), project: title, date })}`, menu(who.tr));
      return;
    }
    if (kind === 'p' && op && a) {
      const choice = projectArg(a);
      if (choice === undefined) return;
      const picked = choice === null ? null : await projectTitle(choice);
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
        await send(chatId, who.tr('این درخواست منقضی شده است؛ دوباره بپرسید.'));
        return;
      }
      if (op === 'y') await deliver(chatId, who, result);
      return;
    }
  } catch (error) {
    await send(chatId, explainError(who.tr, error), menu(who.tr));
  }
}

async function projectTitle(id: number): Promise<string> {
  const [row] = await db.select({ title: projects.title }).from(projects).where(eq(projects.id, id));
  return row?.title ?? `#${id}`;
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
};

/** نامِ خوانای آرگومان‌ها در پیامِ تأیید (۲.۱۱.۰) — به‌جای کلیدِ انگلیسیِ خام. */
const ARG_LABELS: Record<string, string> = {
  text: 'متن', title: 'عنوان', description: 'توضیح', hours: 'ساعت', minutes: 'دقیقه',
  date: 'تاریخ', due_date: 'مهلت', status: 'وضعیت',
};

async function describeArgs(tr: Translator, args: Record<string, unknown>): Promise<string[]> {
  const lines: string[] = [];
  const pid = typeof args.project_id === 'number' ? args.project_id : null;
  if (pid) lines.push(`• ${tr('پروژه')}: ${await projectTitle(pid)}`);
  if (typeof args.task_id === 'number') {
    const [t] = await db.select({ title: tasks.title }).from(tasks).where(eq(tasks.id, args.task_id));
    lines.push(`• ${tr('تسک')}: ${t?.title ?? `#${args.task_id}`}`);
  }
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
      if (result.text) await send(chatId, result.text);
      return;
    case 'confirm': {
      const lines = [
        ...(result.note ? [result.note, ''] : []),
        `❓ ${who.tr('این کار انجام شود؟')}`,
        `${who.tr(WRITE_TITLES[result.tool] ?? result.tool)}`,
        ...(await describeArgs(who.tr, result.args)),
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
      await send(chatId, who.tr('سهمیهٔ هوشِ مصنوعیِ شما فعلاً تمام شده است؛ تا آن موقع از دکمه‌ها استفاده کنید.'), menu(who.tr));
      return;
    case 'auth':
      await send(chatId, who.tr('کلیدِ هوشِ مصنوعیِ شما دیگر کار نمی‌کند؛ در پروفایل دوباره وصلش کنید.'), menu(who.tr));
      return;
    case 'busy':
      await send(chatId, who.tr('پیام‌ها زیاد شد؛ چند دقیقه صبر کنید. تا آن موقع دکمه‌ها کار می‌کنند.'), menu(who.tr));
      return;
    default:
      await send(chatId, who.tr('هوشِ مصنوعی جواب نداد؛ کمی بعد دوباره امتحان کنید یا از دکمه‌ها استفاده کنید.'), menu(who.tr));
  }
}

async function askAi(chatId: number, who: Who, text: string): Promise<boolean> {
  const secret = await loadAiSecret(who.actor.id);
  if (!secret || !secret.model) return false;
  await api('sendChatAction', { chat_id: chatId, action: 'typing' });
  const result = await askAgent({
    actor: who.actor, userName: who.name, secret,
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
  const secret = await loadAiSecret(who.actor.id);
  if (!secret) {
    await send(chatId, who.tr('برای فهمیدنِ پیامِ صوتی، اول یک هوشِ مصنوعی وصل کنید (Groq رایگان است). تا آن موقع بنویسید یا از دکمه‌ها استفاده کنید.'), menu(who.tr));
    return;
  }
  if (!transcriptionModel(secret.provider)) {
    await send(chatId, who.tr('هوشِ مصنوعیِ فعلیِ شما ({name}) صدا را به متن تبدیل نمی‌کند؛ برای ویس Groq (رایگان) یا OpenAI را وصل کنید. تا آن موقع بنویسید.', { name: PROVIDERS[secret.provider]?.label ?? secret.provider }), menu(who.tr));
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
        : who.tr('صدا به متن تبدیل نشد؛ لطفاً بنویسید.'), menu(who.tr));
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

async function onMessage(msg: TgMessage) {
  if (msg.chat.type && msg.chat.type !== 'private') return;
  const chatId = msg.chat.id;
  const text = (msg.text ?? '').trim();
  if (!text) {
    // ⚠️ پیامِ صوتی هنوز فهمیده نمی‌شود (۲.۱۰.۰)؛ بی‌جواب ماندنش گیج‌کننده بود.
    const voice = msg.voice ?? msg.audio;
    if (voice) {
      const who = await whoIs(msg.chat.id);
      if (who) await onVoice(msg.chat.id, who, voice);
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
      await send(chatId, (await translatorFor(sys.locale))('این حسابِ تلگرام به کاربرِ دیگری وصل است.'));
      return;
    }
    if (result === 'not_found') {
      await send(chatId, (await translatorFor(sys.locale))('این لینک معتبر نیست یا قبلاً استفاده شده؛ از پروفایل دوباره «اتصال» را بزنید.'));
      return;
    }
    const who = await whoIs(chatId);
    if (who) {
      await send(chatId, `✅ ${who.tr('تلگرامِ شما وصل شد. از این به بعد اعلان‌ها هم اینجا می‌آیند.')}`);
      await showMenu(chatId, who);
    }
    return;
  }

  const who = await whoIs(chatId);
  if (!who) {
    const tr = await translatorFor((await systemLocale()).locale);
    await send(chatId, tr('این چت به حسابی وصل نیست. در برنامه به پروفایل ← «اعلان‌ها و تلگرام» بروید و «اتصال به تلگرام» را بزنید.'));
    return;
  }

  try {
    switch (cmd) {
      case '/start':
      case '/help':
      case '/menu':
        return await showMenu(chatId, who);
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
      case '/new':
        forgetConversation(who.actor.id);
        await send(chatId, who.tr('گفت‌وگو از نو شروع شد.'));
        return;
    }
    if (cmd.startsWith('/')) return await showMenu(chatId, who);

    if (!(await askAi(chatId, who, text))) {
      await send(chatId, who.tr('برای جوابِ هوشمند به متنِ آزاد، در پروفایل ← «دستیارِ هوشِ مصنوعی» یک ارائه‌دهنده وصل کنید. تا آن موقع:'), menu(who.tr));
    }
  } catch (error) {
    await send(chatId, explainError(who.tr, error), menu(who.tr));
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
export async function registerCommands(): Promise<void> {
  const { locale } = await systemLocale();
  const tr = await translatorFor(locale);
  await api('setMyCommands', {
    commands: [
      { command: 'tasks', description: tr('تسک‌های من') },
      { command: 'hours', description: tr('ساعت‌های من') },
      { command: 'timer', description: tr('شروعِ تایمر') },
      { command: 'stop', description: tr('توقفِ تایمر') },
      { command: 'log', description: tr('ثبتِ ساعت') },
      { command: 'ai', description: tr('هوشِ مصنوعی') },
      { command: 'new', description: tr('گفت‌وگوی تازه با هوشِ مصنوعی') },
      { command: 'help', description: tr('راهنما') },
    ],
  });
  // دکمهٔ کنارِ جعبهٔ پیام: مینی‌اپ (فقط با HTTPS).
  const url = miniAppUrl('/');
  if (url) {
    await api('setChatMenuButton', { menu_button: { type: WEB_APP, text: tr('باز کردنِ برنامه'), web_app: { url } } });
  }
}

/** فقط برای تست. */
export function resetBotState() {
  seen.clear();
  commandsRegistered = true;
  translators.clear();
}

