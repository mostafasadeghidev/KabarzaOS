import Link from 'next/link';
import {
  AlertTriangle, CalendarClock, CalendarDays, Clock, Gauge, Hourglass, MessageSquareReply, TrendingDown, Users,
  FolderKanban, Wallet, UsersRound,
} from 'lucide-react';
import { t } from '@/i18n/server';
import { UserName } from '@/components/user-avatar';
import { Amount } from '@/components/amount-privacy';
import { MetricCard } from '@/components/ui/dash';
import { format } from '@/domain/money/money';
import { cn } from '@/lib/utils';
import { CardHelp } from '@/components/ui/card-help';
import { RecentActivity } from './recent-activity';
import { DashboardInbox, type InboxExpense } from './inbox';
import { QuickNote } from './quick-note';
import { DashboardGrid, type WidgetDef } from './dashboard-grid';
import { MemberHoursChart, StatusChart, WeeklyTrendChart } from './charts';
import type { getDashboard, RiskItem } from '@/server/dashboard';
import type { getDashboardInbox } from '@/server/dashboard-inbox';

/**
 * داشبوردِ تازه — «اول کار، بعد عدد» + چیدمانِ بنتوی سفارشی (نمونهٔ محلی).
 *
 * هر بخش یک ویجت است (dashboard-grid.tsx): کاربر انتخاب می‌کند کدام‌ها دیده شوند، ترتیب و اندازه.
 * صفِ «منتظرِ شما» سه کارت شد: کارهای پروژه، کارهای مالی، کارهای تیم. کارت‌های قدیمیِ داشبورد
 * (عددهای هفته، نمودارها، آنلاین/در دسترس) هم ویجت‌اند، پیش‌فرض خاموش.
 */

type Dash = Awaited<ReturnType<typeof getDashboard>>;
type Inbox = Awaited<ReturnType<typeof getDashboardInbox>>;

function Panel({ title, icon, action, children, className }: {
  title: string; icon?: React.ReactNode; action?: { href: string; label: string }; children: React.ReactNode; className?: string;
}) {
  return (
    <section className={cn('grid h-full content-start gap-3 rounded-2xl border bg-card p-4', className)}>
      <header className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-bold">{icon}{title}</h2>
        {action
          ? <span className="flex items-center gap-2"><Link href={action.href} className="text-xs text-muted-foreground hover:text-foreground hover:underline">{action.label}</Link><CardHelp /></span>
          : <CardHelp />}
      </header>
      {children}
    </section>
  );
}

function trendLine(delta: number, unit: string): string {
  if (delta > 0) return t('{n} {unit} بیشتر از هفتهٔ قبل', { n: delta, unit });
  if (delta < 0) return t('{n} {unit} کمتر از هفتهٔ قبل', { n: Math.abs(delta), unit });
  return t('بدون تغییر نسبت به هفتهٔ قبل');
}

export function DashboardV2({
  data, inbox, approveStatusId, returnStatusId, canReports, userId, extra = [],
}: {
  userId: number;
  /** کارت‌های تازهٔ مدیر (extra-widgets.tsx) — پول، حقوق، تمدید، QA، دسترسی، پشتیبان. */
  extra?: WidgetDef[];
  data: Dash;
  inbox: Inbox;
  approveStatusId: number | null;
  returnStatusId: number | null;
  canReports: boolean;
}) {
  const { today, risk, progress, stats, charts } = data;

  // پروژه‌های در خطر — یک فهرست، شدیدترین اول؛ هر پروژه فقط یک بار با جدی‌ترین دلیلش.
  const seen = new Set<number>();
  const atRisk: Array<RiskItem & { tone: 'red' | 'amber' | 'gray'; icon: React.ReactNode }> = [];
  const push = (items: RiskItem[], tone: 'red' | 'amber' | 'gray', icon: React.ReactNode) => {
    for (const it of items) { if (seen.has(it.id)) continue; seen.add(it.id); atRisk.push({ ...it, tone, icon }); }
  };
  push(risk.overdue, 'red', <AlertTriangle className="size-4" />);
  push(risk.soon, 'amber', <Hourglass className="size-4" />);
  push(risk.reviewStuck, 'amber', <Clock className="size-4" />);
  push(risk.stalled, 'gray', <TrendingDown className="size-4" />);

  const todayIso = new Date().toISOString().slice(0, 10);
  const byDay = new Map<string, typeof inbox.week>();
  for (const w of inbox.week) byDay.set(w.date, [...(byDay.get(w.date) ?? []), w]);
  const dayLabel = (d: string) => {
    if (d === todayIso) return t('امروز');
    const diff = Math.round((Date.parse(`${d}T00:00:00Z`) - Date.parse(`${todayIso}T00:00:00Z`)) / 86400000);
    if (diff === 1) return t('فردا');
    if (diff < 0) return t('{n} روز گذشته', { n: -diff });
    return t('{n} روز دیگر', { n: diff });
  };
  const maxOpen = Math.max(1, ...inbox.capacity.map((c) => c.openTasks));
  const maxMin = Math.max(1, ...inbox.capacity.map((c) => c.minutes));
  const expenses: InboxExpense[] = risk.expenseDues.map((e) => ({ ...e }));
  const tone = { red: 'bg-red-500/12 text-red-700 dark:text-red-400', amber: 'bg-amber-500/12 text-amber-700 dark:text-amber-400', gray: 'bg-muted text-muted-foreground' };

  const inboxProps = {
    review: inbox.review, requests: inbox.requests, comments: inbox.comments, expenses,
    units: inbox.units, tenders: inbox.tenders, unassigned: inbox.unassigned, noLog: inbox.noLog,
    approveStatusId, returnStatusId,
  };
  const units = [t('تسک'), t('کامنت'), t('ساعت')];
  const G_ACT = 'کارهای منتظر', G_GLANCE = 'نگاهِ سریع', G_TEAM = 'تیم', G_OLD = 'کارت‌های قبلی';

  const widgets: WidgetDef[] = [
    // ── صف‌ها
    {
      id: 'inbox-projects', hint: t('کارهای پروژه که منتظرِ تصمیمِ شماست: تسک‌های در بازبینی (تأیید یا برگشت)، تسک‌های بی‌مسئول، مناقصه‌های با پیشنهادِ تازه و کامنت‌های بی‌پاسخ. کلیدهای j و k بینِ ردیف‌ها می‌روند و a کنشِ اول را می‌زند.'), title: t('کارهای پروژه'), group: G_ACT, size: 'l', defaultOn: true,
      node: <DashboardInbox {...inboxProps} kinds={['review', 'unassigned', 'tenders', 'comments']} title={t('کارهای پروژه')} icon={<FolderKanban className="size-4 text-muted-foreground" />} empty="کارِ پروژه‌ای منتظرِ شما نیست." />,
    },
    {
      id: 'inbox-finance', hint: t('کارهای مالیِ منتظرِ شما: درخواست‌های پرداختِ اعضا (تأیید یا رد)، کارکردهای تعدادیِ پرداخت‌نشده و هزینه‌های سررسیدشده یا نزدیک.'), title: t('کارهای مالی'), group: G_ACT, size: 'm', defaultOn: true,
      node: <DashboardInbox {...inboxProps} kinds={['requests', 'units', 'expenses']} title={t('کارهای مالی')} icon={<Wallet className="size-4 text-muted-foreground" />} empty="کارِ مالی‌ای منتظرِ شما نیست." />,
    },
    {
      id: 'inbox-team', hint: t('اعضای فعالی که دیروز هیچ ساعتی ثبت نکرده‌اند؛ با «یادآوری» برایشان اعلان فرستاده می‌شود.'), title: t('کارهای تیم'), group: G_ACT, size: 'm', defaultOn: true,
      node: <DashboardInbox {...inboxProps} kinds={['nolog']} title={t('کارهای تیم')} icon={<UsersRound className="size-4 text-muted-foreground" />} empty="همه ساعتِ دیروز را ثبت کرده‌اند." />,
    },
    // ── نگاهِ سریع
    ...(inbox.money ? [{
      id: 'money', hint: t('خلاصهٔ پول در یک نگاه: طلب از کارفرماها، بدهی به اعضا و سودِ تخمینیِ پروژه‌های باز. مبلغ‌ها پوشیده‌اند و با کلیک دیده می‌شوند.'), title: t('پول در یک نگاه'), group: G_GLANCE, size: 's' as const, defaultOn: true,
      node: (
        <Panel title={t('پول در یک نگاه')} action={canReports ? { href: '/reports', label: t('گزارش‌ها') } : undefined}>
          <dl className="grid grid-cols-2 gap-2">
            {[
              { label: 'طلب از کارفرماها', value: inbox.money.clientDue, cls: '' },
              { label: 'بدهی به اعضا', value: inbox.money.memberDebt, cls: '' },
              { label: 'سودِ تخمینی', value: inbox.money.profit, cls: Number(inbox.money.profit) < 0 ? 'text-destructive' : 'text-emerald-700 dark:text-emerald-400' },
              { label: 'پروژه‌ها', value: String(inbox.money.projectCount), cls: '', plain: true },
            ].map((m) => (
              <div key={m.label} className="rounded-xl bg-muted/40 px-3 py-2">
                <dt className="text-[11px] text-muted-foreground">{t(m.label)}</dt>
                <dd className={cn('num text-base font-bold', m.cls)}>{'plain' in m && m.plain ? m.value : <Amount>{`${format(m.value)} €`}</Amount>}</dd>
              </div>
            ))}
          </dl>
        </Panel>
      ),
    }] : []),
    {
      id: 'week', hint: t('ددلاینِ پروژه‌ها و سررسیدِ تسک‌های باز از یک هفتهٔ گذشته تا هفت روزِ آینده، روز به روز. عقب‌افتاده‌ها قرمزند.'), title: t('این هفتهٔ من'), group: G_GLANCE, size: 'm', defaultOn: true,
      node: (
        <Panel title={t('این هفتهٔ من')} icon={<CalendarClock className="size-4 text-muted-foreground" />}>
          {inbox.week.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('ددلاینی در ۷ روزِ آینده نیست.')}</p>
          ) : (
            <div className="grid max-h-80 gap-3 overflow-y-auto">
              {[...byDay].map(([day, items]) => (
                <div key={day} className="grid content-start gap-1.5">
                  <h3 className={cn('flex items-center gap-2 text-xs font-semibold', day < todayIso ? 'text-destructive' : day === todayIso ? 'text-primary' : 'text-muted-foreground')}>
                    {dayLabel(day)}<span className="num font-normal opacity-70">{day}</span>
                  </h3>
                  <ul className="grid gap-1">
                    {items.map((w) => (
                      <li key={`${w.kind}${w.id}`} className="flex min-w-0 items-center gap-2 text-sm">
                        <span className={cn('shrink-0 rounded px-1.5 py-px text-[10px]', w.kind === 'project' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')}>{w.kind === 'project' ? t('پروژه') : t('تسک')}</span>
                        <Link href={w.kind === 'project' ? `/projects/${w.projectId}` : `/projects/${w.projectId}?tab=tasks`} className="min-w-0 truncate hover:underline">{w.title}</Link>
                        {w.projectTitle && <span className="shrink-0 truncate text-xs text-muted-foreground">· {w.projectTitle}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </Panel>
      ),
    },
    {
      id: 'risk', hint: t('پروژه‌هایی که نیازِ توجه دارند، هر کدام یک بار با جدی‌ترین دلیلش: ددلاینِ گذشته، ددلاینِ نزدیک، گیر کردن در بازبینی یا راکد ماندن.'), title: t('پروژه‌های در خطر'), group: G_GLANCE, size: 'm', defaultOn: true,
      node: (
        <Panel title={t('پروژه‌های در خطر')} icon={<AlertTriangle className="size-4 text-muted-foreground" />} action={{ href: '/projects', label: t('پروژه‌ها') }}>
          {atRisk.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('همهٔ پروژه‌ها روی روال‌اند.')}</p>
          ) : (
            <ul className="grid max-h-80 divide-y overflow-y-auto">
              {atRisk.map((p) => (
                <li key={p.id} className="flex items-center gap-3 py-2">
                  <span className={cn('grid size-7 shrink-0 place-items-center rounded-lg', tone[p.tone])}>{p.icon}</span>
                  <Link href={p.href ?? `/projects/${p.id}`} className="min-w-0 flex-1 truncate text-sm font-medium hover:underline">{p.title}</Link>
                  <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[11px]', tone[p.tone])}>{p.badge}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ),
    },
    {
      id: 'note', hint: t('یادداشتِ شخصیِ شما که خودکار ذخیره می‌شود و فقط خودتان می‌بینید (فعلاً فقط روی همین مرورگر).'), title: t('یادداشتِ من'), group: G_GLANCE, size: 's', defaultOn: true,
      node: <QuickNote userId={userId} />,
    },
    {
      id: 'meetings', hint: t('جلسه‌های ثبت‌شدهٔ این هفته با روز و ساعت.'), title: t('جلساتِ این هفته'), group: G_GLANCE, size: 's', defaultOn: true,
      node: (
        <Panel title={t('جلساتِ این هفته')} icon={<CalendarDays className="size-4 text-muted-foreground" />} action={{ href: '/meetings', label: t('جلسات') }}>
          {today.meetings.length === 0 ? <p className="text-sm text-muted-foreground">{t('جلسه‌ای ثبت نشده.')}</p> : (
            <ul className="grid gap-1.5 text-sm">
              {today.meetings.slice(0, 6).map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3">
                  <span className="truncate">{m.title}</span>
                  <span className="num shrink-0 text-xs text-muted-foreground">{m.meetAt.toISOString().slice(5, 16).replace('T', ' ')}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ),
    },
    {
      id: 'activity', hint: t('آخرین کارهایی که در برنامه انجام شده: ساختن، ویرایش، تغییرِ وضعیت و… .'), title: t('آخرین رویدادها'), group: G_GLANCE, size: 'm', defaultOn: true,
      node: (
        <Panel title={t('آخرین رویدادها')} action={{ href: '/activity', label: t('رویدادها') }}>
          {today.activity.length === 0 ? <p className="text-sm text-muted-foreground">{t('رویدادی ثبت نشده.')}</p>
            : <div className="max-h-96 overflow-y-auto"><RecentActivity events={today.activity.slice(0, 10).map((a) => ({ ...a, at: a.at.toISOString() }))} actorHref={canReports} /></div>}
        </Panel>
      ),
    },
    // ── تیم
    {
      id: 'team-today', hint: t('وضعیتِ تیم در همین لحظه: چند نفر آنلاین‌اند، چند تایمر روشن است و چه کسانی امروز مرخصی‌اند.'), title: t('تیمِ امروز'), group: G_TEAM, size: 's', defaultOn: true,
      node: (
        <Panel title={t('تیمِ امروز')} icon={<Users className="size-4 text-muted-foreground" />} action={{ href: '/availability', label: t('حضور و مرخصی') }}>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-emerald-500/10 py-2"><div className="num text-lg font-bold">{today.online.length}</div><div className="text-[11px] text-muted-foreground">{t('آنلاین')}</div></div>
            <div className="rounded-xl bg-sky-500/10 py-2"><div className="num text-lg font-bold">{today.timers.length}</div><div className="text-[11px] text-muted-foreground">{t('تایمر روشن')}</div></div>
            <div className="rounded-xl bg-amber-500/10 py-2"><div className="num text-lg font-bold">{today.away.length}</div><div className="text-[11px] text-muted-foreground">{t('مرخصی')}</div></div>
          </div>
          {today.timers.length > 0 && (
            <ul className="grid gap-1.5 text-sm">
              {today.timers.map((w) => (
                <li key={w.userId} className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1"><UserName userId={w.userId} name={w.name} size="sm" />{w.project && <span className="truncate text-xs text-muted-foreground">· {w.project}</span>}</span>
                  <span className="num shrink-0 text-xs text-muted-foreground">{Math.floor(w.minutes / 60)}:{String(w.minutes % 60).padStart(2, '0')}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ),
    },
    ...(inbox.capacity.length > 0 ? [{
      id: 'capacity', hint: t('بارِ کاریِ هر عضو: تعدادِ تسک‌های باز (نوارِ کهربایی) و ساعتِ ثبت‌شدهٔ هفت روزِ اخیر (نوارِ آبی). برای اینکه بدانید کار را به چه کسی بسپارید.'), title: t('ظرفیتِ تیم'), group: G_TEAM, size: 'm' as const, defaultOn: true,
      node: (
        <Panel title={t('ظرفیتِ تیم')} icon={<Gauge className="size-4 text-muted-foreground" />} action={{ href: '/team', label: t('تیمِ من') }}>
          <p className="-mt-1 text-[11px] text-muted-foreground">{t('تسکِ باز و ساعتِ ۷ روزِ اخیرِ هر عضو — پربارترها بالا.')}</p>
          <ul className="grid max-h-80 gap-2 overflow-y-auto">
            {inbox.capacity.map((c) => (
              <li key={c.userId} className="grid grid-cols-[minmax(0,9rem)_1fr] items-center gap-3 text-sm">
                <span className="min-w-0 truncate"><UserName userId={c.userId} name={c.name} size="sm" /></span>
                <span className="grid gap-1">
                  <span className="flex items-center gap-2"><span className="h-1.5 rounded-full bg-amber-500/70" style={{ width: `${Math.max(4, (c.openTasks / maxOpen) * 100)}%` }} /><span className="shrink-0 text-[11px] text-muted-foreground">{t('{n} تسک', { n: c.openTasks })}</span></span>
                  <span className="flex items-center gap-2"><span className="h-1.5 rounded-full bg-sky-500/70" style={{ width: `${Math.max(4, (c.minutes / maxMin) * 100)}%` }} /><span className="num shrink-0 text-[11px] text-muted-foreground">{Math.floor(c.minutes / 60)}:{String(c.minutes % 60).padStart(2, '0')}</span></span>
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      ),
    }] : []),
    {
      id: 'client-waiting', hint: t('رشته‌کامنت‌هایی که آخرین پیامشان از کارفرماست و هنوز کسی از تیم جواب نداده.'), title: t('کارفرماهای منتظرِ پاسخ'), group: G_TEAM, size: 's', defaultOn: true,
      node: (
        <Panel title={t('کارفرماهای منتظرِ پاسخ')} icon={<MessageSquareReply className="size-4 text-muted-foreground" />}>
          {inbox.clientWaiting.length === 0 ? <p className="text-sm text-muted-foreground">{t('کارفرمایی منتظرِ پاسخ نیست.')}</p> : (
            <ul className="grid divide-y">
              {inbox.clientWaiting.map((c) => (
                <li key={c.rootId} className="grid gap-0.5 py-2">
                  <Link href={`/projects/${c.projectId}?tab=comments`} className="truncate text-sm font-medium hover:underline">{c.excerpt}</Link>
                  <span className="truncate text-xs text-muted-foreground">{c.authorName} · {c.projectTitle}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ),
    },
    // ── کارت‌های قبلی (پیش‌فرض خاموش)
    ...progress.map((card, i) => ({
      id: `metric-${i}`, hint: t('عددِ این هفته در مقایسه با هفتهٔ قبل، با نمودارِ کوچکِ روند.'), title: t(card.label), group: G_OLD, size: 's' as const, defaultOn: false,
      node: <MetricCard label={t(card.label)} value={card.value} trend={card.delta} headline={trendLine(card.delta, units[i] ?? '')} hint={t('نسبت به هفتهٔ گذشته')} href={card.href} spark={card.spark} />,
    })),
    {
      id: 'metric-projects', hint: t('تعدادِ پروژه‌های در حالِ انجام، با شمارِ پروژه‌های در مذاکره و تسک‌های باز.'), title: t('پروژه‌های در حال انجام'), group: G_OLD, size: 's', defaultOn: false,
      node: <MetricCard label={t('پروژه‌های در حال انجام')} value={stats.inProgress} headline={t('{n} پروژه در مرحلهٔ مذاکره', { n: stats.lead })} hint={t('{n} تسکِ باز روی همهٔ پروژه‌ها', { n: stats.openTasks })} href="/projects" />,
    },
    {
      id: 'chart-trend', hint: t('مجموعِ ساعتِ کاریِ ثبت‌شدهٔ تیم در هفته‌های اخیر.'), title: t('روندِ ساعتِ کاریِ تیم'), group: G_OLD, size: 'm', defaultOn: false,
      node: <Panel title={t('روندِ ساعتِ کاریِ تیم')}>{charts.weeklyTrend.every((w) => w.hours === 0) ? <p className="text-sm text-muted-foreground">{t('ساعتِ کاری ثبت نشده.')}</p> : <WeeklyTrendChart data={charts.weeklyTrend} />}</Panel>,
    },
    {
      id: 'chart-status', hint: t('پروژه‌ها به تفکیکِ وضعیت (مذاکره، در حالِ انجام، تمام‌شده و…).'), title: t('وضعیتِ پروژه‌ها'), group: G_OLD, size: 'm', defaultOn: false,
      node: <Panel title={t('وضعیتِ پروژه‌ها')}>{charts.statusDistribution.length === 0 ? <p className="text-sm text-muted-foreground">{t('پروژه‌ای نیست.')}</p> : <StatusChart data={charts.statusDistribution} />}</Panel>,
    },
    {
      id: 'chart-members', hint: t('ساعتِ ثبت‌شدهٔ هر عضو در ۳۰ روزِ گذشته.'), title: t('ساعتِ کاریِ اعضا (۳۰ روزِ گذشته)'), group: G_OLD, size: 'm', defaultOn: false,
      node: <Panel title={t('ساعتِ کاریِ اعضا (۳۰ روزِ گذشته)')}>{charts.memberHours.length === 0 ? <p className="text-sm text-muted-foreground">{t('ساعتِ کاری ثبت نشده.')}</p> : <MemberHoursChart data={charts.memberHours} />}</Panel>,
    },
    {
      id: 'online', hint: t('اعضایی که همین حالا در برنامه‌اند؛ فعال یا بی‌کار.'), title: t('آنلاین اکنون'), group: G_OLD, size: 's', defaultOn: false,
      node: (
        <Panel title={t('آنلاین اکنون')}>
          {today.online.length === 0 ? <p className="text-sm text-muted-foreground">{t('کسی آنلاین نیست.')}</p> : (
            <ul className="space-y-1.5 text-sm">{today.online.map((u) => <li key={u.id}><UserName userId={u.id} name={u.name} size="sm" /></li>)}</ul>
          )}
        </Panel>
      ),
    },
    {
      id: 'available', hint: t('اعضایی که طبقِ برنامهٔ هفتگی امروز سرِ کارند و مرخصی نیستند.'), title: t('در دسترسِ امروز'), group: G_OLD, size: 's', defaultOn: false,
      node: (
        <Panel title={t('در دسترسِ امروز')}>
          {today.available.length === 0 ? <p className="text-sm text-muted-foreground">{t('هنوز کسی برنامهٔ هفتگی نداده.')}</p> : (
            <ul className="space-y-1.5 text-sm">{today.available.map((a) => <li key={a.userId}><UserName userId={a.userId} name={a.name} size="sm" /></li>)}</ul>
          )}
        </Panel>
      ),
    },
  ];

  return <DashboardGrid widgets={[...widgets, ...extra]} userId={userId} />;
}
