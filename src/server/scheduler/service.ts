import { and, eq, gte, inArray, isNotNull, lt, lte, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  absences, auditLog, availabilitySlots, meetingAttendees, meetings, reminders, schedulerStamps, timelogs, userRoles, users, workTimers,
} from '@/db/schema';
import { notify, purgeOld } from '@/server/notifications/service';
import { purgeMessages } from '@/server/messaging/service';
import { getSystemConfig } from '@/server/settings/system-service';
import {
  dueNudges, dueOffsets, elapsedFor, localParts, needsTimerReminder,
  previousDay, RETENTION_DAYS, retentionCutoff, shouldRunCleanup,
} from '@/domain/scheduler/tick';
import { runDailyReport } from './daily-report';
import { formatDateTime } from '@/i18n/datetime';

/**
 * تیکِ زمان‌بند — پورتِ `Core\.
 *
 * ⚠️ هر کار **خودبسنده و idempotent** است: تیکِ دیر رسیده باز هم تحویل
 * می‌دهد و تیکِ تکراری چیزی را دوباره نمی‌فرستد. زمان‌بند از بیرون تیک می‌خورد، پس
 * یک زمان‌بندِ بیرونی مسیرِ `/api/cron/tick` را صدا می‌زند.
 */

/* ------------------------------------------------------------------ *
 * مهرها
 * ------------------------------------------------------------------ */

async function readStamp(key: string): Promise<string | null> {
  const rows = await db.select({ value: schedulerStamps.value })
    .from(schedulerStamps).where(eq(schedulerStamps.key, key));
  return rows[0]?.value ?? null;
}

async function writeStamp(key: string, value: string): Promise<void> {
  await db.insert(schedulerStamps).values({ key, value })
    .onConflictDoUpdate({
      target: schedulerStamps.key,
      set: { value, updatedAt: new Date() },
    });
}

export interface TickReport {
  reminders: number;
  meetings: number;
  timers: number;
  nudges: number;
  cleaned: boolean;
  dailyReport: boolean;
}

/* ------------------------------------------------------------------ *
 * یادآورهای شخصی
 * ------------------------------------------------------------------ */

/** کلیدِ بدنهٔ یادآور به‌ازای پیش‌آگاهی — هر گزینه کلیدِ خودش را دارد تا ترجمه‌پذیر بماند. */
function reminderBody(lead: number): string {
  // ⚠️ بدونِ شکستِ خط در کلید — استخراج‌گرِ ترجمه «\n» ِ کد را با خطِ واقعی جور نمی‌کند.
  if (lead === 0) return '{body} — موعد: {when}';
  if (lead === 10) return '{body} — موعد: {when} (۱۰ دقیقه قبل)';
  if (lead === 60) return '{body} — موعد: {when} (۱ ساعت قبل)';
  if (lead === 1440) return '{body} — موعد: {when} (۱ روز قبل)';
  return '{body} — موعد: {when} ({n} دقیقه قبل)';
}

async function runReminders(now: Date): Promise<number> {
  const rows = await db
    .select({
      id: reminders.id,
      userId: reminders.userId,
      body: reminders.body,
      remindAt: reminders.remindAt,
      leadMinutes: reminders.leadMinutes,
      sentOffsets: reminders.sentOffsets,
      timezone: users.timezone,
    })
    .from(reminders)
    .leftJoin(users, eq(users.id, reminders.userId))
    .where(eq(reminders.isSent, false));

  let sent = 0;
  for (const row of rows) {
    const due = dueOffsets(row, now);
    if (due.length === 0) continue;

    for (const lead of due) {
      await notify([row.userId], {
        type: 'reminder',
        title: 'یادآور',
        // ⚠️ کلید + پارامتر، نه متنِ آماده — هر گیرنده به زبانِ خودش می‌گیرد.
        // بدنه: متن + «موعد: …» به وقتِ خودِ کاربر + برچسبِ پیش‌آگاهی (پورتِ `reminder_due()`).
        body: reminderBody(lead),
        params: { body: row.body, when: formatDateTime(row.remindAt, row.timezone || undefined), n: lead },
        url: '/meetings?tab=reminders',
      });
      sent += 1;
    }

    // ⚠️ فهرستِ فرستاده‌شده‌ها در همان پاس به‌روز می‌شود، وگرنه دو فاصله که
    // هم‌زمان سررسیده‌اند در تیکِ بعدی دوباره می‌سوزند.
    const merged = [...new Set([...(row.sentOffsets ?? []), ...due])];
    const allLeads = row.leadMinutes?.length ? row.leadMinutes : [0];
    await db.update(reminders)
      .set({
        sentOffsets: merged,
        isSent: allLeads.every((l) => merged.includes(l)),
        updatedAt: new Date(),
      })
      .where(eq(reminders.id, row.id));
  }
  return sent;
}

/* ------------------------------------------------------------------ *
 * جلسه‌های نزدیک
 * ------------------------------------------------------------------ */

async function runMeetingSoon(now: Date): Promise<number> {
  const soon = new Date(now.getTime() + 60 * 60_000);
  // ⚠️ ۳۰ دقیقه مهلت زیرِ «اکنون» (پورتِ `due_soon()`): اگر تیکی از دست رفت و
  // شروع کمی گذشت، دعوت‌شده باز هم — کمی دیر — خبردار می‌شود، نه هیچ‌وقت.
  // `reminded` یک‌بار‌بودن را تضمین می‌کند.
  const grace = new Date(now.getTime() - 30 * 60_000);
  const timeZone = (await getSystemConfig()).timezone || undefined;

  const rows = await db
    .select({
      id: meetings.id, title: meetings.title, meetAt: meetings.meetAt,
      location: meetings.location, createdBy: meetings.createdBy,
    })
    .from(meetings)
    .where(and(
      eq(meetings.reminded, false),
      gte(meetings.meetAt, grace),
      lte(meetings.meetAt, soon),
    ));

  let sent = 0;
  for (const meeting of rows) {
    const attendees = await db.select({ userId: meetingAttendees.userId })
      .from(meetingAttendees).where(eq(meetingAttendees.meetingId, meeting.id));
    // R-MEET-04 — سازنده هم یادآوری می‌گیرد؛ او هم باید حاضر شود.
    const recipients = [...new Set([...attendees.map((a) => a.userId), meeting.createdBy])];

    if (recipients.length > 0) {
      const location = meeting.location.trim();
      await notify(recipients, {
        type: 'meeting_soon',
        title: 'یادآوری جلسه: {title}',
        body: location ? 'زمان: {when} · مکان: {location}' : 'زمان: {when}',
        params: { title: meeting.title, when: formatDateTime(meeting.meetAt, timeZone), location },
        url: '/meetings',
      });
      sent += 1;
    }

    // ⚠️ مهر حتی وقتی شرکت‌کننده‌ای نیست هم زده می‌شود، وگرنه هر تیک
    // دوباره همین جلسه را وارسی می‌کند.
    await db.update(meetings).set({ reminded: true, updatedAt: new Date() })
      .where(eq(meetings.id, meeting.id));
  }
  return sent;
}

/* ------------------------------------------------------------------ *
 * تایمرِ رهاشده
 * ------------------------------------------------------------------ */

async function runTimerWatch(now: Date): Promise<number> {
  const rows = await db
    .select({
      userId: workTimers.userId,
      startedAt: workTimers.startedAt,
      remindedAt: workTimers.remindedAt,
    })
    .from(workTimers)
    .where(isNotNull(workTimers.startedAt));

  let sent = 0;
  for (const timer of rows) {
    const minutes = elapsedFor(timer.startedAt!, now);
    if (!needsTimerReminder({ minutes, alreadyReminded: timer.remindedAt !== null })) continue;

    await notify([timer.userId], {
      type: 'timer_running',
      title: 'تایمرِ کار روشن مانده',
      // ساعت **و** دقیقه — پیش از این دقیقه‌ها دور ریخته می‌شد (`hس mد` ِ نسخهٔ قبلی).
      body: 'تایمرتان {h} ساعت و {m} دقیقه است که روشن مانده.',
      params: { h: Math.floor(minutes / 60), m: Math.floor(minutes % 60) },
      url: '/hours',
    });
    await db.update(workTimers).set({ remindedAt: now })
      .where(eq(workTimers.userId, timer.userId));
    sent += 1;
  }
  return sent;
}

/* ------------------------------------------------------------------ *
 * تلنگرِ ثبتِ ساعت
 * ------------------------------------------------------------------ */

async function runTimelogNudges(now: Date): Promise<number> {
  // ⚠️ فقط اعضای **فعال** — عضوِ سابق هرگز تلنگرِ ثبتِ ساعت نمی‌گیرد.
  const members = await db
    .selectDistinct({
      id: users.id,
      timezone: users.timezone,
      memberState: users.memberState,
      deletedAt: users.deletedAt,
    })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .where(eq(userRoles.role, 'member'));

  let sent = 0;
  for (const member of members) {
    // ⚠️ «فعال» — نه «می‌تواند وارد شود»: عضوِ «فقط مالی» وارد می‌شود ولی دیگر
    // ساعت نمی‌زند، پس «ساعتِ امروز را ثبت نکرده‌اید» برای او بی‌معناست.
    if (member.memberState !== 'active' || member.deletedAt !== null) continue;

    const slots = await db.selectDistinct({ weekday: availabilitySlots.weekday })
      .from(availabilitySlots).where(eq(availabilitySlots.userId, member.id));
    // بدونِ برنامهٔ هفتگی معیاری برای «در دسترس بودن» نیست.
    if (slots.length === 0) continue;

    const local = localParts(now, member.timezone);
    const yesterday = previousDay(local.date);

    const [stampToday, stampYesterday, absent, logged] = await Promise.all([
      readStamp(`nudge:today:${member.id}`),
      readStamp(`nudge:yesterday:${member.id}`),
      db.select({ from: absences.fromDate, to: absences.toDate }).from(absences)
        .where(and(
          eq(absences.userId, member.id),
          lte(absences.fromDate, local.date),
          gte(absences.toDate, yesterday),
        )),
      db.selectDistinct({ logDate: timelogs.logDate }).from(timelogs)
        .where(and(
          eq(timelogs.userId, member.id),
          inArray(timelogs.logDate, [local.date, yesterday]),
        )),
    ]);

    const absentDates = [local.date, yesterday]
      .filter((d) => absent.some((a) => a.from <= d && a.to >= d));

    const due = dueNudges({
      local,
      availableWeekdays: slots.map((s) => s.weekday),
      lastTodayStamp: stampToday,
      lastYesterdayStamp: stampYesterday,
      absentDates,
      loggedDates: logged.map((l) => l.logDate),
    });

    for (const kind of due) {
      const date = kind === 'today' ? local.date : yesterday;
      await notify([member.id], {
        type: 'no_timelog',
        title: kind === 'today' ? 'ساعتِ امروز را ثبت نکرده‌اید' : 'ساعتِ دیروز ثبت نشد',
        body: 'برای {date} ساعتی ثبت نشده است.',
        params: { date },
        url: '/hours',
      });
      await writeStamp(`nudge:${kind}:${member.id}`, date);
      sent += 1;
    }
  }
  return sent;
}

/* ------------------------------------------------------------------ *
 * پاک‌سازیِ روزانه
 * ------------------------------------------------------------------ */

async function runCleanup(now: Date): Promise<boolean> {
  const today = now.toISOString().slice(0, 10);
  if (!shouldRunCleanup(await readStamp('cleanup'), today)) return false;

  // ⚠️ مهر **پیش از** اجرا زده می‌شود تا خطای وسطِ کار حلقه نسازد.
  await writeStamp('cleanup', today);

  await db.delete(reminders).where(and(
    eq(reminders.isSent, true),
    lt(reminders.remindAt, new Date(`${retentionCutoff(now, RETENTION_DAYS.reminders)}T00:00:00Z`)),
  ));
  await db.delete(meetings).where(
    lt(meetings.meetAt, new Date(`${retentionCutoff(now, RETENTION_DAYS.meetings)}T00:00:00Z`)),
  );
  await db.delete(absences).where(
    lt(absences.toDate, retentionCutoff(now, RETENTION_DAYS.absences)),
  );
  await purgeOld(RETENTION_DAYS.notifications);

  /**
   * لاگِ ممیزیِ کهنه.(90)`.
   *
   * ⚠️ این تا امروز **جا افتاده بود**: ثابتِ `RETENTION_DAYS.activity` تعریف
   * شده بود ولی هیچ‌کس مصرفش نمی‌کرد، پس جدول بی‌مرز رشد می‌کرد. یک ثابتِ
   * مرده بدتر از نبودنش است: خواننده فکر می‌کند کار انجام می‌شود.
   *
   * ⚠️ فقط `audit_log` — دادهٔ مالی و پروژه دست نمی‌خورد.
   */
  await db.delete(auditLog).where(
    lt(auditLog.createdAt, new Date(`${retentionCutoff(now, RETENTION_DAYS.activity)}T00:00:00Z`)),
  );

  // ⚠️ پنجرهٔ پیام‌ها **پیکربندی‌پذیر** است و پیش‌فرضش «هرگز»؛ برخلافِ
  // بقیه که ثابت‌اند. مالک باید آگاهانه انتخابش کند.
  const { msgPurgeDays } = await getSystemConfig();
  await purgeMessages(msgPurgeDays);

  return true;
}

/* ------------------------------------------------------------------ *
 * تیک
 * ------------------------------------------------------------------ */

/** یک تیکِ کامل. هر کار مستقل است؛ خطای یکی بقیه را نمی‌خواباند. */
export async function runTick(now = new Date()): Promise<TickReport> {
  const report: TickReport = {
    reminders: 0, meetings: 0, timers: 0, nudges: 0, cleaned: false, dailyReport: false,
  };

  const jobs: Array<[keyof TickReport, () => Promise<number | boolean>]> = [
    ['reminders', () => runReminders(now)],
    ['meetings', () => runMeetingSoon(now)],
    ['timers', () => runTimerWatch(now)],
    ['nudges', () => runTimelogNudges(now)],
    ['dailyReport', () => runDailyReport(now)],
    ['cleaned', () => runCleanup(now)],
  ];

  for (const [key, job] of jobs) {
    try {
      // @ts-expect-error — هر کار نوعِ خودش را برمی‌گرداند (شمارش یا پرچم).
      report[key] = await job();
    } catch (error) {
      // ⚠️ شکستِ یک کار نباید بقیه را از تیک بیندازد.
      console.error(`[cron] ${key}`, error);
    }
  }

  await writeStamp('last_tick', now.toISOString());
  return report;
}

/** آخرین تیکِ موفق — نشانگرِ سلامتِ زمان‌بند. */
export async function lastTickAt(): Promise<string | null> {
  return readStamp('last_tick');
}

export { sql };
