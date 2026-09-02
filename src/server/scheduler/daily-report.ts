import { and, eq, gte, inArray, isNotNull, lte, sql } from 'drizzle-orm';
import { getSystemConfig } from '@/server/settings/system-service';
import type { Locale } from '@/i18n/config';
import { loadMessages } from '@/i18n/server';
import { createTranslator, type Translator } from '@/i18n/translate';
import type { Actor } from '@/domain/access/permissions';
import { ForbiddenError } from '@/domain/access/guard';
import { db } from '@/db/client';
import {
  absences, meetings, projectPayments, projects, schedulerStamps,
  tags, tasks, timelogs, userRoles, users,
} from '@/db/schema';
import {
  buildReport, DEFAULT_CONFIG, fitForDiscord, hasDestination, reportDate,
  shouldSendNow, type ReportConfig, type ReportSections,
} from '@/domain/scheduler/daily-report';
import { hoursLabel } from '@/domain/timelogs/timer';
import { localParts } from '@/domain/scheduler/tick';
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
  const dayStart = new Date(`${date}T00:00:00Z`);
  const dayEnd = new Date(`${date}T23:59:59Z`);

  const [hours, payments, doneTasks, newTasks, dayMeetings, onLeave] = await Promise.all([
    db.select({
      name: users.name,
      minutes: sql<number>`coalesce(sum(${timelogs.minutes}), 0)::int`,
    })
      .from(timelogs)
      .leftJoin(users, eq(users.id, timelogs.userId))
      .where(eq(timelogs.logDate, date))
      .groupBy(users.name),

    db.select({
      direction: projectPayments.direction,
      amount: projectPayments.amount,
      note: projectPayments.note,
      userName: users.name,
      projectTitle: projects.title,
    })
      .from(projectPayments)
      .leftJoin(users, eq(users.id, projectPayments.userId))
      .leftJoin(projects, eq(projects.id, projectPayments.projectId))
      // paidAt مهرِ زمانی است، نه تاریخ — پس بازهٔ همان روز.
      .where(and(gte(projectPayments.paidAt, dayStart), lte(projectPayments.paidAt, dayEnd))),

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

    db.select({ title: meetings.title, meetAt: meetings.meetAt })
      .from(meetings)
      .where(and(gte(meetings.meetAt, dayStart), lte(meetings.meetAt, dayEnd))),

    db.select({ name: users.name, from: absences.fromDate, to: absences.toDate, note: absences.note })
      .from(absences)
      .leftJoin(users, eq(users.id, absences.userId))
      .where(and(lte(absences.fromDate, date), gte(absences.toDate, date))),
  ]);

  const money = (direction: string, withMember: boolean) =>
    payments
      .filter((p) => p.direction === direction)
      .map((p) => {
        const who = withMember && p.userName ? ` — ${p.userName}` : '';
        const what = p.note || p.projectTitle || '';
        return `• ${Number(p.amount).toFixed(2)}${who}${what ? ` (${what})` : ''}`;
      });

  return {
    hours: hours.filter((h) => h.minutes > 0)
      .map((h) => `• ${h.name ?? '—'}: ${hoursLabel(h.minutes)}`),
    incoming: money('incoming', false),
    payouts: money('member_payout', true),
    expenses: money('project_expense', false),
    tasks_done: doneTasks.map((t) => `• ${t.title}${t.projectTitle ? ` (${t.projectTitle})` : ''}`),
    tasks_new: newTasks.map((t) => `• ${t.title}${t.projectTitle ? ` (${t.projectTitle})` : ''}`),
    meetings: dayMeetings.map((m) => `• ${m.title}`),
    absences: onLeave.map((a) => `• ${a.name ?? '—'}: ${t('{from} تا {to}', { from: a.from, to: a.to })}${a.note ? ` — ${a.note}` : ''}`),
  };
}

/* ------------------------------------------------------------------ *
 * ارسال
 * ------------------------------------------------------------------ */

async function postToDiscord(webhook: string, text: string): Promise<void> {
  await fetch(webhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: fitForDiscord(text) }),
  });
}

async function sendToOwners(text: string): Promise<void> {
  const owners = await db
    .selectDistinct({ chatId: users.telegramChatId })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .where(and(eq(userRoles.role, 'owner'), isNotNull(users.telegramChatId)));

  for (const owner of owners) {
    if (!owner.chatId) continue;
    await fetch(`https://api.telegram.org/bot${await botToken()}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: owner.chatId, text }),
    });
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
      await postToDiscord(config.webhook, text);
    } catch (error) {
      console.error('[daily-report] discord', error);
    }
  }
  if (config.telegram && await botToken()) {
    try {
      await sendToOwners(text);
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
  const local = localParts(now, process.env.APP_TIMEZONE ?? 'UTC');
  const localTime = `${String(local.hour).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')}`;

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
