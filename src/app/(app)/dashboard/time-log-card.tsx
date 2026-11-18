import Link from 'next/link';
import { CalendarDays, Clock } from 'lucide-react';
import type { Actor } from '@/domain/access/permissions';
import { canLogGeneral, loggableTargets, myWeek, timerState } from '@/server/timelogs/service';
import { getSystemConfig } from '@/server/settings/system-service';
import { toDateString } from '@/domain/timelogs/timer';
import { hhmm, type WeekDay } from '@/domain/timelogs/week';
import { WEEKDAYS, weekdayOfDate } from '@/domain/availability/weekly';
import { Panel } from '@/components/page-shell';
import { ManualLogForm, StartTimerForm } from '../hours/hours-view';
import { activeLocale, t } from '@/i18n/server';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * کارتِ «ثبتِ ساعت» روی داشبوردِ عضو — پورتِ `time_logging_section()` که
 * نسخهٔ قبلی زیرِ مناقصه‌ها می‌گذاشت. عضو برای زدنِ تایمر لازم نیست به صفحهٔ
 * ساعت برود.
 *
 * ⚠️ وقتی تایمری روشن یا پارک‌شده است، کارت نیست: نوارِ تایمرِ بالای صفحه
 * (layout) همان را با توقف/تأیید نشان می‌دهد و دو کنترل برای یک تایمر گیج‌کننده بود.
 *
 * ۳.۹.۰ — کارت دیگر تمام‌عرض نیست: کنارش «هفتهٔ من» (ساعتِ امروز و این هفته + هفت ستونِ
 * روزها) می‌نشیند؛ همان پرسشی که هنگامِ زدنِ تایمر پیش می‌آید: «امروز/این هفته چقدر کار کرده‌ام؟».
 * وقتی تایمر روشن است، «هفتهٔ من» تنها می‌ماند.
 */
export async function DashboardTimeLog({ actor, part = 'both' }: {
  actor: Actor;
  /** داشبوردِ بنتو (نمونهٔ محلی): «ثبتِ ساعت» و «هفتهٔ من» دو کارتِ جدا. */
  part?: 'both' | 'log' | 'week';
}) {
  const now = new Date();
  const [projects, state, config] = await Promise.all([loggableTargets(actor), timerState(actor, now), getSystemConfig()]);
  const general = canLogGeneral(actor);
  if (!general && projects.length === 0) return null;
  const week = await myWeek(actor, now, config.weekStart);
  const showLog = !(state.running || state.pending) && part !== 'week';
  if (part === 'log' && !showLog) return null;

  return (
    // ۳.۱۵.۲ — دو کارت هم‌عرض (۱:۱)؛ پیش از این «ثبتِ ساعت» دو سوم بود و «هفتهٔ من» یک سوم.
    <div className={cn('kz-tl grid gap-4', showLog && part === 'both' && '@3xl/main:grid-cols-2')}>
      {showLog && (
        <div className="grid">
          <Panel
            icon={<Clock />}
            title={t('ثبتِ ساعت')}
            actions={<Button asChild size="sm" variant="outline"><Link href="/hours">{t('همهٔ ثبت‌ها')}</Link></Button>}
          >
            <StartTimerForm projects={projects} canLogGeneral={general} />
            <details className="group">
              <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
                {t('ثبتِ دستی')}
              </summary>
              <div className="mt-3">
                <ManualLogForm projects={projects} canLogGeneral={general} today={toDateString(now)} />
              </div>
            </details>
          </Panel>
        </div>
      )}
      {part !== 'log' && <MyWeek days={week.days} todayMinutes={week.todayMinutes} weekMinutes={week.weekMinutes} />}
    </div>
  );
}

/** نامِ کوتاهِ روز به زبانِ کاربر (فارسی: ش ی د س چ پ ج). */
function shortDay(date: string): string {
  try {
    return new Intl.DateTimeFormat(activeLocale(), { weekday: 'narrow', timeZone: 'UTC' })
      .format(new Date(`${date}T12:00:00Z`));
  } catch {
    const i = weekdayOfDate(date);
    return i === null ? '' : t(WEEKDAYS[i]!).slice(0, 1);
  }
}

function MyWeek({ days, todayMinutes, weekMinutes }: { days: WeekDay[]; todayMinutes: number; weekMinutes: number }) {
  // ستونِ پُرترین روز = تمام‌قد؛ کمترین ارتفاعِ دیدنی برای روزی که کمی کار دارد.
  const max = Math.max(60, ...days.map((d) => d.minutes));
  return (
    <Panel
      icon={<CalendarDays />}
      title={t('هفتهٔ من')}
      actions={<Link href="/hours" className="text-xs text-muted-foreground hover:text-foreground">{t('ساعت‌ها')}</Link>}
    >
      <div className="flex items-end justify-between gap-4">
        <div className="grid gap-0.5">
          <span className="text-xs text-muted-foreground">{t('امروز')}</span>
          <span className="num text-2xl font-bold tabular-nums">{hhmm(todayMinutes)}</span>
        </div>
        <div className="grid gap-0.5 text-end">
          <span className="text-xs text-muted-foreground">{t('این هفته')}</span>
          <span className="num text-lg font-semibold tabular-nums">{hhmm(weekMinutes)}</span>
        </div>
      </div>
      {/* هفت ستون: ارتفاع = سهمِ هر روز از پُرترین روز. امروز با رنگِ اصلی، روزهای آینده نقطه‌چین. */}
      <ul className="kz-bars grid grid-cols-7 items-end gap-1.5" aria-label={t('ساعتِ هر روزِ این هفته')}>
        {days.map((d) => {
          const i = weekdayOfDate(d.date);
          const full = i === null ? d.date : t(WEEKDAYS[i]!);
          return (
            <li key={d.date} className="grid justify-items-center gap-1">
              <span className="sr-only">{full}: {hhmm(d.minutes)}</span>
              <span aria-hidden className="kz-bar-track flex h-16 w-full items-end">
                <span
                  className={cn(
                    'block w-full rounded-md',
                    d.future
                      ? 'h-1 border border-dashed border-border bg-transparent'
                      : d.minutes === 0
                        ? cn('h-1', d.today ? 'bg-primary' : 'bg-muted')
                        : d.today ? 'bg-primary' : 'bg-primary/35',
                  )}
                  style={!d.future && d.minutes > 0 ? { height: `${Math.max(8, Math.round((d.minutes / max) * 100))}%` } : undefined}
                />
              </span>
              <span aria-hidden className={cn('text-[11px] text-muted-foreground', d.today && 'font-bold text-foreground')}>
                {shortDay(d.date)}
              </span>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
