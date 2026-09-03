import { and, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm';
import { getSystemConfig } from '@/server/settings/system-service';
import type { Locale } from '@/i18n/config';
import { loadMessages } from '@/i18n/server';
import { createTranslator, type Translator } from '@/i18n/translate';
import type { Actor } from '@/domain/access/permissions';
import { ForbiddenError } from '@/domain/access/guard';
import { db } from '@/db/client';
import {
  absences, currencies, meetings, projectPayments, projects, schedulerStamps,
  tags, tasks, timelogs, userRoles, users,
} from '@/db/schema';
import {
  buildReport, chunkText, DEFAULT_CONFIG, DISCORD_CHUNK, hasDestination, hoursLine, meetingLine,
  paymentLine, projectLabel, reportDate, shouldSendNow, type ReportConfig, type ReportSections,
} from '@/domain/scheduler/daily-report';
import { hoursLabel } from '@/domain/timelogs/timer';
import { dayWindow, localParts } from '@/domain/scheduler/tick';
import { format, type Currency } from '@/domain/money/money';
import { telegramCredentials } from '@/server/settings/telegram-service';

/**
 * گزارشِ روزانه — خلاصهٔ گروهیِ یک روز به کانالِ تیم.
 *
 * ⚠️ از فرستندهٔ اعلان‌ها جداست: این پیامِ **گروهی** است، نه اعلانِ شخصی.
 */

const CONFIG_KEY = 'daily_report:config';
const SENT_KEY = 'daily_report:last_sent';

async function botToken(): Promise<string> {
  return (await telegramCredentials()).token;
}

export async function getReportConfig(): Promise<ReportConfig> {
  const rows = await db.select({ value: schedulerStamps.value })
    .from(schedulerStamps).where(eq(schedulerStamps.key, CONFIG_KEY));

  if (!rows[0]) return DEFAULT_CONFIG;
  try {
    return { ...DEFAULT_CONFIG, ...JSON.parse(rows[0].value) as Partial<ReportConfig> };
  } catch {
    // ⚠️ پیکربندیِ خراب گزارش را نمی‌خواباند؛ به پیش‌فرض برمی‌گردد.
    return DEFAULT_CONFIG;
  }
}

/** ⚠️ فقط مالک — R-ARCH-01: گارد اینجا، نه فقط در اکشن. */
export async function saveReportConfig(actor: Actor, config: ReportConfig): Promise<void> {
  if (!actor.roles.includes('owner')) throw new ForbiddenError('owner_only');
  await db.insert(schedulerStamps)
    .values({ key: CONFIG_KEY, value: JSON.stringify(config) })
    .onConflictDoUpdate({
      target: schedulerStamps.key,
      set: { value: JSON.stringify(config), updatedAt: new Date() },
    });
}

/* ------------------------------------------------------------------ *
 * جمع‌آوریِ خطوط
 * ------------------------------------------------------------------ */

/**
 * مترجمِ گزارش — زبانِ پیش‌فرضِ سامانه، چون کرون درخواستی ندارد که زبانش را
 * بخواند. پیش‌نمایش و «ارسالِ آزمایشی» هم همین را می‌گیرند تا یک متن باشد.
 */
async function reportTranslator(): Promise<Translator> {
  const locale = (await getSystemConfig()).defaultLocale as Locale;
  return createTranslator(await loadMessages(locale), locale);
}

async function collect(date: string, t: Translator): Promise<ReportSections> {
  // پورتِ افزونه: «همان روز» به وقتِ **سامانه**، نه UTC — پرداختِ نزدیکِ نیمه‌شب به روزِ درست می‌افتد.
  const timezone = (await getSystemConfig()).timezone || 'UTC';
  const { start: dayStart, end: dayEnd } = dayWindow(date, timezone);
  const pad = (n: number) => String(n).padStart(2, '0');

  const [hours, payments, doneTasks, newTasks, dayMeetings, onLeave] = await Promise.all([
    // ریزِ هر پروژه به‌ازای هر نفر (پورتِ `Timelogs::for_date`).
    db.select({
      userId: timelogs.userId,
      name: users.name,
      projectTitle: projects.title,
      minutes: sql<number>`coalesce(sum(${timelogs.minutes}), 0)::int`,
    })
      .from(timelogs)
      .leftJoin(users, eq(users.id, timelogs.userId))
      .leftJoin(projects, eq(projects.id, timelogs.projectId))
      .where(eq(timelogs.logDate, date))
      .groupBy(timelogs.userId, users.name, projects.title)
      .orderBy(timelogs.userId),

    db.select({
      direction: projectPayments.direction,
      amount: projectPayments.amount,
      currencyCode: currencies.code,
      currencyDecimals: currencies.decimals,
      userName: users.name,
      projectTitle: projects.title,
    })
      .from(projectPayments)
      .leftJoin(users, eq(users.id, projectPayments.userId))
      .leftJoin(projects, eq(projects.id, projectPayments.projectId))
      .leftJoin(currencies, eq(currencies.id, projectPayments.currencyId))
      // paidAt روزِ پرداخت است (مهاجرت ۰۰۲۴) — همان روزِ گزارش.
      .where(eq(projectPayments.paidAt, date))
      .orderBy(projectPayments.id),

    db.select({ title: tasks.title, projectTitle: projects.title })
      .from(tasks)
      .leftJoin(projects, eq(projects.id, tasks.projectId))
      .leftJoin(tags, eq(tags.id, tasks.statusTagId))
      .where(and(
        eq(tags.statusGroup, 'complete'),
        gte(tasks.updatedAt, dayStart),
        lte(tasks.updatedAt, dayEnd),
      )),

    db.select({ title: tasks.title, projectTitle: projects.title })
      .from(tasks)
      .leftJoin(projects, eq(projects.id, tasks.projectId))
      .where(and(gte(tasks.createdAt, dayStart), lte(tasks.createdAt, dayEnd))),

    db.select({ title: meetings.title, meetAt: meetings.meetAt, projectTitle: projects.title })
      .from(meetings)
      .leftJoin(projects, eq(projects.id, meetings.projectId))
      .where(and(gte(meetings.meetAt, dayStart), lte(meetings.meetAt, dayEnd)))
      .orderBy(meetings.meetAt),

    db.select({ name: users.name, from: absences.fromDate, to: absences.toDate, note: absences.note })
      .from(absences)
      .leftJoin(users, eq(users.id, absences.userId))
      .where(and(lte(absences.fromDate, date), gte(absences.toDate, date))),
  ]);

  const byUser = new Map<number, { name: string; parts: Array<{ minutes: number; project: string }> }>();
  for (const h of hours) {
    if (h.minutes <= 0) continue;
    const row = byUser.get(h.userId) ?? { name: h.name ?? `#${h.userId}`, parts: [] };
    row.parts.push({ minutes: h.minutes, project: projectLabel(h.projectTitle, t) });
    byUser.set(h.userId, row);
  }

  // پورتِ `payment_lines`: مبلغ در ارزِ خودِ ردیف با اعشارِ همان ارز، نه یوروی بی‌واحد.
  const money = (direction: string, withMember: boolean) =>
    payments
      .filter((p) => p.direction === direction)
      .map((p) => paymentLine({
        member: withMember ? (p.userName ?? t('عضو')) : null,
        project: projectLabel(p.projectTitle, t),
        amount: format(p.amount, p.currencyCode
          ? { id: 0, code: p.currencyCode, symbol: '', decimals: p.currencyDecimals ?? 2 } as Currency
          : undefined),
        code: p.currencyCode ?? '',
      }));

  return {
    hours: [...byUser.values()].map((u) => hoursLine(u.name, u.parts, hoursLabel)),
    incoming: money('incoming', false),
    payouts: money('member_payout', true),
    expenses: money('project_expense', false),
    tasks_done: doneTasks.map((r) => `• ${r.title}${r.projectTitle ? ` (${r.projectTitle})` : ''}`),
    tasks_new: newTasks.map((r) => `• ${r.title}${r.projectTitle ? ` (${r.projectTitle})` : ''}`),
    // پورتِ `meeting_lines`: ساعتِ محلی + پروژه.
    meetings: dayMeetings.map((m) => {
      const lp = localParts(m.meetAt, timezone);
      return meetingLine({ time: `${pad(lp.hour)}:${pad(lp.minute)}`, title: m.title, project: m.projectTitle });
    }),
    absences: onLeave.map((a) => `• ${a.name ?? '—'}: ${t('{from} تا {to}', { from: a.from, to: a.to })}${a.note ? ` — ${a.note}` : ''}`),
  };
}

/* ------------------------------------------------------------------ *
 * ارسال
 * ------------------------------------------------------------------ */

/**
 * پورتِ `post_to_webhook`: متن روی مرزِ خط به تکه‌های ≤۱۹۰۰ نویسه می‌شکند و
 * هر تکه یک POST با ۱۵ ثانیه مهلت است؛ فقط وقتی همه 2xx بودند true.
 * ⚠️ پیش از این یک POST ِ بریده در ۲۰۰۰ نویسه می‌رفت و دنبالهٔ گزارشِ بلند
 * گم می‌شد؛ وضعیتِ پاسخ هم خوانده نمی‌شد و شکست بی‌صدا بود.
 */
async function postToDiscord(webhook: string, text: string): Promise<boolean> {
  let ok = true;
  for (const part of chunkText(text, DISCORD_CHUNK)) {
    const res = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: part }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) ok = false;
  }
  return ok;
}

/**
 * تلگرام → هر مدیری (مالک یا همکارِ ادمین) که چتی وصل کرده **و** کانالش روشن
 * است — پورتِ `send_telegram_admins()`. متن روی مرزِ خط تکه می‌شود، وگرنه
 * گزارشِ بلندتر از ۴۰۹۶ نویسه بی‌صدا رد می‌شد.
 */
/**
 * ارسالِ گزارشِ یک روز به **یک** چتِ تلگرام — پورتِ «ارسالِ گزارش به چتِ من»:
 * مالک پیش از روشن‌کردنِ ارسالِ روزانه، خودش خروجی را می‌بیند. تکه‌تکه مثلِ
 * ارسالِ عادی. false = باتی نیست، گزارش خالی است، یا تلگرام نپذیرفت.
 */
export async function sendReportToChat(chatId: string, date: string): Promise<boolean> {
  const token = await botToken();
  if (!token || chatId === '') return false;
  const text = await previewReport(date);
  if (text === '') return false;
  for (const part of chunkText(text)) {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: part }),
      signal: AbortSignal.timeout(15_000),
    });
    const data = await res.json().catch(() => ({})) as { ok?: boolean };
    if (!data.ok) return false;
  }
  return true;
}

async function sendToAdmins(text: string): Promise<void> {
  const admins = await db
    .selectDistinct({ chatId: users.telegramChatId })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .where(and(
      inArray(userRoles.role, ['owner', 'admin']),
      isNull(users.deletedAt),
      eq(users.telegramOff, false),
      sql`${users.telegramChatId} <> ''`,
    ));

  const token = await botToken();
  const parts = chunkText(text);
  for (const admin of admins) {
    if (!admin.chatId) continue;
    for (const part of parts) {
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: admin.chatId, text: part }),
        // ⚠️ تلگرامِ گیرکرده نباید تیک را نگه دارد (نسخهٔ قبلی: ۱۵ ثانیه).
        signal: AbortSignal.timeout(15_000),
      });
    }
  }
}

/** ساختِ متنِ گزارشِ یک روز — برای پیش‌نمایش و «ارسالِ آزمایشی». */
export async function previewReport(date: string): Promise<string> {
  const config = await getReportConfig();
  const t = await reportTranslator();
  return buildReport({ date, sections: config.sections, data: await collect(date, t) }, t);
}

/** فرستادنِ گزارشِ یک روز به همهٔ مقصدهای فعال. */
export async function dispatchReport(date: string): Promise<boolean> {
  const config = await getReportConfig();
  const text = await previewReport(date);
  if (text === '') return false;

  // ⚠️ هر مقصد جداگانه try می‌شود: قطعیِ دیسکورد نباید تلگرام را هم ببرد.
  if (config.discord && config.webhook) {
    try {
      if (!await postToDiscord(config.webhook, text)) console.error('[daily-report] discord: non-2xx response');
    } catch (error) {
      console.error('[daily-report] discord', error);
    }
  }
  if (config.telegram && await botToken()) {
    try {
      await sendToAdmins(text);
    } catch (error) {
      console.error('[daily-report] telegram', error);
    }
  }
  return true;
}

/**
 * کارِ تیک.
 * ⚠️ مهرِ «امروز فرستاده شد» **پیش از** ارسال زده می‌شود تا شکستِ میانه
 * باعثِ ارسالِ دوباره در تیکِ بعدی نشود.
 */
export async function runDailyReport(now: Date): Promise<boolean> {
  const config = await getReportConfig();
  // ⚠️ منطقهٔ زمانیِ **سامانه** (تنظیمات؛ در نبودش APP_TIMEZONE) و دقیقهٔ **محلی**:
  // پیش از این ساعتِ محلی با دقیقهٔ UTC می‌چسبید و در ‎+03:30 نیم ساعت خطا داشت.
  const local = localParts(now, (await getSystemConfig()).timezone || 'UTC');
  const localTime = `${String(local.hour).padStart(2, '0')}:${String(local.minute).padStart(2, '0')}`;

  const rows = await db.select({ value: schedulerStamps.value })
    .from(schedulerStamps).where(eq(schedulerStamps.key, SENT_KEY));

  const ready = shouldSendNow({
    config,
    botConfigured: Boolean(await botToken()),
    lastSentDate: rows[0]?.value ?? null,
    localDate: local.date,
    localTime,
  });
  if (!ready) return false;

  await db.insert(schedulerStamps)
    .values({ key: SENT_KEY, value: local.date })
    .onConflictDoUpdate({
      target: schedulerStamps.key,
      set: { value: local.date, updatedAt: new Date() },
    });

  return dispatchReport(reportDate(local.date, config.offset));
}

export { hasDestination, inArray };

/** پورتِ دکمهٔ «تستِ اتصال»: یک پیامِ آزمایشی به وب‌هوک؛ true فقط با پاسخِ 2xx. */
export async function testDiscordWebhook(webhook: string): Promise<boolean> {
  const t = await reportTranslator();
  return postToDiscord(webhook, t('✅ اتصالِ دیسکوردِ کبرزا برقرار است.'));
}
