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
import { ExpandableList } from '@/components/ui/expandable-list';
import { CardHelp } from '@/components/ui/card-help';
import { RecentActivity } from './recent-activity';
import { DashboardInbox, type InboxExpense } from './inbox';
import { QuickNote } from './quick-note';
import { DashboardGrid, type DefaultLayout, type WidgetDef } from './dashboard-grid';

/**
 * چیدمانِ پیش‌فرضِ مدیر — همان چیدمانی که مالک در ویرایشِ زنده ساخت (۲۰۲۶-۱۱-۱۸)، عیناً: ترتیب، ستون،
 * اندازه، کارت‌های پنهان/نمایش‌داده و قد و شروعِ دستی (heights به پیکسل، offsets به ردیف).
 * کارتی که اینجا نیست (کارتِ تازه) پس از این‌ها و در جای خودکار می‌آید.
 */
const ADMIN_LAYOUT: DefaultLayout = {
  order: ['inbox-projects', 'team-today', 'available', 'online', 'inbox-finance', 'client-waiting', 'meetings', 'a-renewals', 'week', 'risk', 'capacity', 'inbox-team', 'a-qa', 'activity', 'note', 'chart-trend', 'chart-members', 'a-payroll', 'a-receivables', 'money', 'a-access', 'a-backup', 'metric-0', 'metric-1', 'metric-2', 'metric-projects', 'chart-status'],
  hidden: ['a-backup', 'a-access', 'a-receivables', 'money', 'a-payroll'],
  shown: ['chart-trend', 'online', 'available', 'chart-members'],
  sizes: { 'inbox-finance': 'm', 'a-receivables': 's', 'a-qa': 's', 'inbox-team': 's', week: 's', risk: 's', note: 'm' },
  cols: {
    'inbox-projects': 0, 'team-today': 3, 'a-backup': 2, 'a-access': 3, 'inbox-finance': 0, 'a-payroll': 2, 'a-renewals': 2,
    'a-receivables': 0, money: 1, 'client-waiting': 2, meetings: 3, week: 0, capacity: 2, 'inbox-team': 2, risk: 1, 'a-qa': 3,
    activity: 0, note: 2, 'chart-trend': 0, online: 3, available: 3, 'chart-members': 2,
  },
  heights: { meetings: 86, risk: 296, week: 296, 'inbox-team': 261, 'a-qa': 261 },
  // جفت‌هایی که مالک لبهٔ بالایشان را هم‌تراز کرده بود — هم‌ردیف، تا با دادهٔ زیاد از هم جدا نشوند.
  rows: [['client-waiting', 'meetings'], ['week', 'risk'], ['inbox-team', 'a-qa'], ['chart-trend', 'chart-members']],
};
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
    <section className={cn('flex h-full min-h-0 flex-col gap-3 rounded-2xl border bg-card p-4', className)}>
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
          <div className="kz-fit"><dl className="grid grid-cols-2 gap-2">
            {[
              { label: 'طلب از کارفرماها', value: inbox.money.clientDue, cls: '' },
              { label: 'بدهی به اعضا', value: inbox.money.memberDebt, cls: '' },
              { label: 'سودِ تخمینی', value: inbox.money.profit, cls: Number(inbox.money.profit) < 0 ? 'text-destructive' : 'text-emerald-700 dark:text-emerald-400' },
              { label: 'پروژه‌ها', value: String(inbox.money.projectCount), cls: '', plain: true },
            ].map((m) => (
              <div key={m.label} className="grid content-center rounded-xl bg-muted/40 px-3 py-2">
                <dt className="kz-fit-label truncate text-[11px] text-muted-foreground">{t(m.label)}</dt>
                <dd className={cn('kz-fit-value num text-base font-bold', m.cls)}>{'plain' in m && m.plain ? m.value : <Amount>{`${format(m.value)} €`}</Amount>}</dd>
              </div>
            ))}
          </dl></div>
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
            <ExpandableList inPlace className="grid content-start gap-1">
              {[...byDay].flatMap(([day, items]) => [
                <li key={`h${day}`} data-group-head className={cn('flex items-center gap-2 pt-2 text-xs font-semibold first:pt-0', day < todayIso ? 'text-destructive' : day === todayIso ? 'text-primary' : 'text-muted-foreground')}>
                  {dayLabel(day)}<span className="num font-normal opacity-70">{day}</span>
                </li>,
                ...items.map((w) => (
                      <li key={`${w.kind}${w.id}`} className="flex min-w-0 items-center gap-2 text-sm">
                        <span className={cn('shrink-0 rounded px-1.5 py-px text-[10px]', w.kind === 'project' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')}>{w.kind === 'project' ? t('پروژه') : t('تسک')}</span>
                        <Link href={w.kind === 'project' ? `/projects/${w.projectId}` : `/projects/${w.projectId}?tab=tasks`} data-open-task={w.kind === 'task' ? w.id : undefined} className="min-w-0 truncate hover:underline">{w.title}</Link>
                        {w.projectTitle && <span className="shrink-0 truncate text-xs text-muted-foreground">· {w.projectTitle}</span>}
                      </li>
                )),
              ])}
            </ExpandableList>
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
            <ExpandableList inPlace className="grid divide-y">
              {atRisk.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                  <span className={cn('grid size-7 shrink-0 place-items-center rounded-lg', tone[p.tone])}>{p.icon}</span>
                  <Link href={p.href ?? `/projects/${p.id}`} className="min-w-0 flex-1 basis-28 truncate text-sm font-medium hover:underline">{p.title}</Link>
                  <span className={cn('ms-auto shrink-0 rounded-full px-2 py-0.5 text-[11px]', tone[p.tone])}>{p.badge}</span>
                </li>
              ))}
            </ExpandableList>
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
            <ExpandableList inPlace className="grid gap-1.5 text-sm">
              {today.meetings.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3">
                  <span className="truncate">{m.title}</span>
                  <span className="num shrink-0 text-xs text-muted-foreground">{m.meetAt.toISOString().slice(5, 16).replace('T', ' ')}</span>
                </li>
              ))}
            </ExpandableList>
          )}
        </Panel>
      ),
    },
    {
      id: 'activity', hint: t('آخرین کارهایی که در برنامه انجام شده: ساختن، ویرایش، تغییرِ وضعیت و… .'), title: t('آخرین رویدادها'), group: G_GLANCE, size: 'm', defaultOn: true,
      node: (
        <Panel title={t('آخرین رویدادها')} action={{ href: '/activity', label: t('رویدادها') }}>
          {today.activity.length === 0 ? <p className="text-sm text-muted-foreground">{t('رویدادی ثبت نشده.')}</p>
            : <RecentActivity expandable events={today.activity.slice(0, 10).map((a) => ({ ...a, at: a.at.toISOString() }))} actorHref={canReports} />}
        </Panel>
      ),
    },
    // ── تیم
    {
      id: 'team-today', hint: t('وضعیتِ تیم در همین لحظه: چند نفر آنلاین‌اند، چند تایمر روشن است و چه کسانی امروز مرخصی‌اند.'), title: t('تیمِ امروز'), group: G_TEAM, size: 's', defaultOn: true,
      node: (
        <Panel title={t('تیمِ امروز')} icon={<Users className="size-4 text-muted-foreground" />} action={{ href: '/availability', label: t('حضور و مرخصی') }}>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="kz-tile rounded-xl bg-emerald-500/10 py-2"><div className="kz-num-sm num text-lg font-bold">{today.online.length}</div><div className="kz-fit-label text-[11px] text-muted-foreground">{t('آنلاین')}</div></div>
            <div className="kz-tile rounded-xl bg-sky-500/10 py-2"><div className="kz-num-sm num text-lg font-bold">{today.timers.length}</div><div className="kz-fit-label text-[11px] text-muted-foreground">{t('تایمر روشن')}</div></div>
            <div className="kz-tile rounded-xl bg-amber-500/10 py-2"><div className="kz-num-sm num text-lg font-bold">{today.away.length}</div><div className="kz-fit-label text-[11px] text-muted-foreground">{t('مرخصی')}</div></div>
          </div>
          {today.timers.length > 0 && (
            <ExpandableList inPlace className="grid gap-1.5 text-sm">
              {today.timers.map((w) => (
                <li key={w.userId} className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1"><UserName userId={w.userId} name={w.name} size="sm" />{w.project && <span className="truncate text-xs text-muted-foreground">· {w.project}</span>}</span>
                  <span className="num shrink-0 text-xs text-muted-foreground">{Math.floor(w.minutes / 60)}:{String(w.minutes % 60).padStart(2, '0')}</span>
                </li>
              ))}
            </ExpandableList>
          )}
        </Panel>
      ),
    },
    ...(inbox.capacity.length > 0 ? [{
      id: 'capacity', hint: t('بارِ کاریِ هر عضو: تعدادِ تسک‌های باز (نوارِ کهربایی) و ساعتِ ثبت‌شدهٔ هفت روزِ اخیر (نوارِ آبی). برای اینکه بدانید کار را به چه کسی بسپارید.'), title: t('ظرفیتِ تیم'), group: G_TEAM, size: 'm' as const, defaultOn: true,
      node: (
        <Panel title={t('ظرفیتِ تیم')} icon={<Gauge className="size-4 text-muted-foreground" />} action={{ href: '/team', label: t('تیمِ من') }}>
          <p className="-mt-1 text-[11px] text-muted-foreground">{t('تسکِ باز و ساعتِ ۷ روزِ اخیرِ هر عضو — پربارترها بالا.')}</p>
          <ExpandableList inPlace className="grid gap-2">
            {inbox.capacity.map((c) => (
              <li key={c.userId} className="grid grid-cols-[minmax(0,8rem)_minmax(0,1fr)] items-center gap-3 text-sm">
                <span className="min-w-0 truncate"><UserName userId={c.userId} name={c.name} size="sm" /></span>
                <span className="grid gap-1">
                  <span className="flex items-center gap-2"><span className="h-1.5 min-w-0 flex-1"><span className="block h-full rounded-full bg-amber-500/70" style={{ width: `${Math.max(4, (c.openTasks / maxOpen) * 100)}%` }} /></span><span className="shrink-0 text-[11px] text-muted-foreground">{t('{n} تسک', { n: c.openTasks })}</span></span>
                  <span className="flex items-center gap-2"><span className="h-1.5 min-w-0 flex-1"><span className="block h-full rounded-full bg-sky-500/70" style={{ width: `${Math.max(4, (c.minutes / maxMin) * 100)}%` }} /></span><span className="num shrink-0 text-[11px] text-muted-foreground">{Math.floor(c.minutes / 60)}:{String(c.minutes % 60).padStart(2, '0')}</span></span>
                </span>
              </li>
            ))}
          </ExpandableList>
        </Panel>
      ),
    }] : []),
    {
      id: 'client-waiting', hint: t('رشته‌کامنت‌هایی که آخرین پیامشان از کارفرماست و هنوز کسی از تیم جواب نداده.'), title: t('کارفرماهای منتظرِ پاسخ'), group: G_TEAM, size: 's', defaultOn: true,
      node: (
        <Panel title={t('کارفرماهای منتظرِ پاسخ')} icon={<MessageSquareReply className="size-4 text-muted-foreground" />}>
          {inbox.clientWaiting.length === 0 ? <p className="text-sm text-muted-foreground">{t('کارفرمایی منتظرِ پاسخ نیست.')}</p> : (
            <ExpandableList inPlace className="grid divide-y">
              {inbox.clientWaiting.map((c) => (
                <li key={c.rootId} className="grid gap-0.5 py-2">
                  <Link href={`/projects/${c.projectId}?tab=comments`} className="truncate text-sm font-medium hover:underline">{c.excerpt}</Link>
                  <span className="truncate text-xs text-muted-foreground">{c.authorName} · {c.projectTitle}</span>
                </li>
              ))}
            </ExpandableList>
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
            <ExpandableList inPlace className="grid gap-1.5 text-sm">{today.online.map((u) => <li key={u.id}><UserName userId={u.id} name={u.name} size="sm" /></li>)}</ExpandableList>
          )}
        </Panel>
      ),
    },
    {
      id: 'available', hint: t('اعضایی که طبقِ برنامهٔ هفتگی امروز سرِ کارند و مرخصی نیستند.'), title: t('در دسترسِ امروز'), group: G_OLD, size: 's', defaultOn: false,
      node: (
        <Panel title={t('در دسترسِ امروز')}>
          {today.available.length === 0 ? <p className="text-sm text-muted-foreground">{t('هنوز کسی برنامهٔ هفتگی نداده.')}</p> : (
            <ExpandableList inPlace className="grid gap-1.5 text-sm">{today.available.map((a) => <li key={a.userId}><UserName userId={a.userId} name={a.name} size="sm" /></li>)}</ExpandableList>
          )}
        </Panel>
      ),
    },
  ];

  return <DashboardGrid widgets={[...widgets, ...extra]} userId={userId} defaults={ADMIN_LAYOUT} />;
}
