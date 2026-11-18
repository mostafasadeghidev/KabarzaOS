import Link from 'next/link';
import { AlertTriangle, CalendarDays, Clock, Hourglass, TrendingDown, Users } from 'lucide-react';
import { t } from '@/i18n/server';
import { UserName } from '@/components/user-avatar';
import { Amount } from '@/components/amount-privacy';
import { format } from '@/domain/money/money';
import { cn } from '@/lib/utils';
import { RecentActivity } from './recent-activity';
import { DashboardInbox, type InboxExpense } from './inbox';
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
  data, inbox, approveStatusId, returnStatusId, canReports,
}: {
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
