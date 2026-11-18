import Link from 'next/link';
import { AlertTriangle, CalendarClock, CalendarDays, Clock, Gauge, Hourglass, MessageSquareReply, TrendingDown, Users } from 'lucide-react';
import { t } from '@/i18n/server';
import { UserName } from '@/components/user-avatar';
import { Amount } from '@/components/amount-privacy';
import { format } from '@/domain/money/money';
import { cn } from '@/lib/utils';
import { RecentActivity } from './recent-activity';
import { DashboardInbox, type InboxExpense } from './inbox';
import { QuickNote } from './quick-note';
import type { getDashboard, RiskItem } from '@/server/dashboard';
import type { getDashboardInbox } from '@/server/dashboard-inbox';

/**
 * داشبوردِ تازه — «اول کار، بعد عدد» (نمونهٔ محلی، ۳.۱۸ ِ پیشنهادی).
 *
 *  ۱) منتظرِ شما — صفِ کارها با تأیید/رد/برگشت در همان‌جا (inbox.tsx).
 *  ۲) پول در یک نگاه — فقط برای کسی که گزارش‌ها را می‌بیند.
 *  ۳) تیمِ امروز — آنلاین، تایمرِ روشن، مرخصی.
 *  ۴) پروژه‌های در خطر — فقط پروژهٔ مشکل‌دار، هر کدام با دلیل؛ پروژهٔ سالم نمی‌آید.
 *  ۵) آخرین رویدادها و جلساتِ هفته.
 * نمودارها به «گزارش‌ها» رفته‌اند.
 */

type Dash = Awaited<ReturnType<typeof getDashboard>>;
type Inbox = Awaited<ReturnType<typeof getDashboardInbox>>;

function Panel({ title, icon, action, children, className }: {
  title: string; icon?: React.ReactNode; action?: { href: string; label: string }; children: React.ReactNode; className?: string;
}) {
  return (
    <section className={cn('grid content-start gap-3 rounded-2xl border bg-card p-4', className)}>
      <header className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-bold">{icon}{title}</h2>
        {action && <Link href={action.href} className="text-xs text-muted-foreground hover:text-foreground hover:underline">{action.label}</Link>}
      </header>
      {children}
    </section>
  );
}

export function DashboardV2({
  data, inbox, approveStatusId, returnStatusId, canReports, userId,
}: {
  userId: number;
  data: Dash;
  inbox: Inbox;
  approveStatusId: number | null;
  returnStatusId: number | null;
  canReports: boolean;
}) {
  const { today, risk } = data;

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

  // «این هفتهٔ من» — گروه‌بندی بر پایهٔ روز؛ گذشته‌های باز اول (قرمز).
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

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 @5xl/main:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <DashboardInbox
          review={inbox.review}
          requests={inbox.requests}
          comments={inbox.comments}
          expenses={expenses}
          units={inbox.units}
          tenders={inbox.tenders}
          unassigned={inbox.unassigned}
          noLog={inbox.noLog}
          approveStatusId={approveStatusId}
          returnStatusId={returnStatusId}
        />

        <div className="grid content-start gap-4">
          {inbox.money && (
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
                    <dd className={cn('num text-base font-bold', m.cls)}>
                      {'plain' in m && m.plain ? m.value : <Amount>{`${format(m.value)} €`}</Amount>}
                    </dd>
                  </div>
                ))}
              </dl>
            </Panel>
          )}

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
            {today.away.length > 0 && (
              <p className="text-xs text-muted-foreground">{t('مرخصی')}: {today.away.map((a) => a.name).join(t('، '))}</p>
            )}
          </Panel>

          <Panel title={t('جلساتِ این هفته')} icon={<CalendarDays className="size-4 text-muted-foreground" />} action={{ href: '/meetings', label: t('جلسات') }}>
            {today.meetings.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('جلسه‌ای ثبت نشده.')}</p>
            ) : (
              <ul className="grid gap-1.5 text-sm">
                {today.meetings.slice(0, 5).map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-3">
                    <span className="truncate">{m.title}</span>
                    <span className="num shrink-0 text-xs text-muted-foreground">{m.meetAt.toISOString().slice(5, 16).replace('T', ' ')}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>

      <div className="grid gap-4 @5xl/main:grid-cols-3">
        <Panel title={t('این هفتهٔ من')} icon={<CalendarClock className="size-4 text-muted-foreground" />} className="@5xl/main:col-span-2">
          {inbox.week.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('ددلاینی در ۷ روزِ آینده نیست.')}</p>
          ) : (
            <div className="grid gap-3 @3xl/main:grid-cols-2">
              {[...byDay].map(([day, items]) => (
                <div key={day} className="grid content-start gap-1.5">
                  <h3 className={cn('flex items-center gap-2 text-xs font-semibold', day < todayIso ? 'text-destructive' : day === todayIso ? 'text-primary' : 'text-muted-foreground')}>
                    {dayLabel(day)}<span className="num font-normal opacity-70">{day}</span>
                  </h3>
                  <ul className="grid gap-1">
                    {items.map((w) => (
                      <li key={`${w.kind}${w.id}`} className="flex min-w-0 items-center gap-2 text-sm">
                        <span className={cn('shrink-0 rounded px-1.5 py-px text-[10px]', w.kind === 'project' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')}>
                          {w.kind === 'project' ? t('پروژه') : t('تسک')}
                        </span>
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

        <QuickNote userId={userId} />
      </div>

      <div className="grid gap-4 @5xl/main:grid-cols-2">
        {inbox.capacity.length > 0 && (
          <Panel title={t('ظرفیتِ تیم')} icon={<Gauge className="size-4 text-muted-foreground" />} action={{ href: '/team', label: t('تیمِ من') }}>
            <p className="-mt-1 text-[11px] text-muted-foreground">{t('تسکِ باز و ساعتِ ۷ روزِ اخیرِ هر عضو — پربارترها بالا.')}</p>
            <ul className="grid gap-2">
              {inbox.capacity.slice(0, 10).map((c) => (
                <li key={c.userId} className="grid grid-cols-[minmax(0,9rem)_1fr] items-center gap-3 text-sm">
                  <span className="min-w-0 truncate"><UserName userId={c.userId} name={c.name} size="sm" /></span>
                  <span className="grid gap-1">
                    <span className="flex items-center gap-2">
                      <span className="h-1.5 rounded-full bg-amber-500/70" style={{ width: `${Math.max(4, (c.openTasks / maxOpen) * 100)}%` }} />
                      <span className="num shrink-0 text-[11px] text-muted-foreground">{t('{n} تسک', { n: c.openTasks })}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="h-1.5 rounded-full bg-sky-500/70" style={{ width: `${Math.max(4, (c.minutes / maxMin) * 100)}%` }} />
                      <span className="num shrink-0 text-[11px] text-muted-foreground">{Math.floor(c.minutes / 60)}:{String(c.minutes % 60).padStart(2, '0')}</span>
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        )}

        <Panel title={t('کارفرماهای منتظرِ پاسخ')} icon={<MessageSquareReply className="size-4 text-muted-foreground" />}>
          {inbox.clientWaiting.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('کارفرمایی منتظرِ پاسخ نیست.')}</p>
          ) : (
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
      </div>

      <div className="grid gap-4 @5xl/main:grid-cols-2">
        <Panel title={t('پروژه‌های در خطر')} icon={<AlertTriangle className="size-4 text-muted-foreground" />} action={{ href: '/projects', label: t('پروژه‌ها') }}>
          {atRisk.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('همهٔ پروژه‌ها روی روال‌اند.')}</p>
          ) : (
            <ul className="grid divide-y">
              {atRisk.slice(0, 10).map((p) => (
                <li key={p.id} className="flex items-center gap-3 py-2">
                  <span className={cn('grid size-7 shrink-0 place-items-center rounded-lg', tone[p.tone])}>{p.icon}</span>
                  <Link href={p.href ?? `/projects/${p.id}`} className="min-w-0 flex-1 truncate text-sm font-medium hover:underline">{p.title}</Link>
                  <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[11px]', tone[p.tone])}>{p.badge}</span>
                </li>
              ))}
            </ul>
          )}
          {atRisk.length > 10 && <p className="text-xs text-muted-foreground">{t('+{n} موردِ دیگر', { n: atRisk.length - 10 })}</p>}
        </Panel>

        <Panel title={t('آخرین رویدادها')} action={{ href: '/activity', label: t('رویدادها') }}>
          {today.activity.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('رویدادی ثبت نشده.')}</p>
          ) : (
            <RecentActivity events={today.activity.slice(0, 8).map((a) => ({ ...a, at: a.at.toISOString() }))} actorHref={canReports} />
          )}
        </Panel>
      </div>
    </div>
  );
}
