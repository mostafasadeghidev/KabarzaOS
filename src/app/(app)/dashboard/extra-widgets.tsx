import Link from 'next/link';
import {
  AtSign, CalendarDays, CalendarOff, CalendarSync, ClipboardCheck, DatabaseBackup, FileText, FolderKanban, HandCoins,
  KeyRound, ListChecks, MessageSquarePlus, PiggyBank, Play, Receipt, Sparkles, Target, Wallet,
} from 'lucide-react';
import { t } from '@/i18n/server';
import { formatDateTime } from '@/i18n/datetime';
import { format } from '@/domain/money/money';
import { cn } from '@/lib/utils';
import { ExpandableList } from '@/components/ui/expandable-list';
import { CardHelp } from '@/components/ui/card-help';
import { Amount } from '@/components/amount-privacy';
import { SecretAmount } from '@/components/secret-amount';
import { Thumb } from '@/components/thumb';
import { DashboardGrid, type DefaultLayout, type WidgetDef } from './dashboard-grid';

/**
 * چیدمانِ پیش‌فرضِ کارفرما — اول آنچه منتظرِ تأییدِ اوست و کنارش «پیام به تیم»؛ بعد پروژه‌ها تمام‌عرض؛
 * بعد چک‌لیستِ تحویل و تازه‌ها در یک ستون، صورتِ حساب و جلسات در ستونِ کناری.
 */
const CLIENT_LAYOUT: DefaultLayout = (() => {
  const plan: Array<[string, number]> = [
    ['c-review', 0], ['c-message', 3],
    ['c-projects', 0],
    // ⚠️ جلسات زیرِ صورتِ حساب، نه زیرِ «پیام به تیم»: آنجا ستونِ باریک از «منتظرِ تأیید» بلندتر می‌شد و
    // بالای «پروژه‌های من» حفره می‌ماند.
    ['c-qa', 0], ['c-statement', 2], ['c-updates', 0], ['c-meetings', 2],
    ['c-onboarding', 0],
  ];
  return { order: plan.map(([id]) => id), cols: Object.fromEntries(plan) };
})();
import { QuickNote } from './quick-note';
import { OnboardingCard } from './onboarding-card';
import { ClientQaList, ContactTeamForm, HoursGoal, PayRenewalButton, ResumeTimerButton } from './extras-client';
import type { getAdminExtras, getClientExtras, getMemberExtras } from '@/server/dashboard-extras';
import type { MemberDashboard } from '@/server/dashboard-member';
import type { InboxTask } from '@/server/projects/service';

/**
 * کارت‌های تازهٔ داشبورد (نمونهٔ محلی): مدیر ← پول و حقوق و تمدید و QA و دسترسی و پشتیبان؛
 * عضو ← ادامهٔ کار، منشن‌ها، مرخصی و برنامه، هدفِ ساعت، پولِ من؛ و **داشبوردِ تازهٔ کارفرما**.
 * کارتی که داده‌اش `null` است (بیننده حقش را ندارد) اصلاً ساخته نمی‌شود.
 */

type AdminX = Awaited<ReturnType<typeof getAdminExtras>>;
type MemberX = Awaited<ReturnType<typeof getMemberExtras>>;
type ClientX = Awaited<ReturnType<typeof getClientExtras>>;

function Panel({ title, icon, action, children }: {
  title: string; icon?: React.ReactNode; action?: { href: string; label: string }; children: React.ReactNode;
}) {
  return (
    <section className="flex h-full min-h-0 flex-col gap-3 rounded-2xl border bg-card p-4">
      <header className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-bold [&>svg]:size-4 [&>svg]:text-muted-foreground">{icon}{title}</h2>
        {action
          ? <span className="flex items-center gap-2"><Link href={action.href} className="text-xs text-muted-foreground hover:text-foreground hover:underline">{action.label}</Link><CardHelp /></span>
          : <CardHelp />}
      </header>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-2 text-sm text-muted-foreground">{children}</p>;
}

const money = (amount: string, code: string | null) => `${format(amount)} ${code ?? ''}`.trim();
const hm = (minutes: number) => `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
const day = (v: string | null) => (v ? formatDateTime(v, '').slice(0, 10) : '');

/* ─────────────────────────────── مدیر ─────────────────────────────── */

export function adminExtraWidgets(x: AdminX): WidgetDef[] {
  const out: WidgetDef[] = [];
  const G_MONEY = t('پول'), G_OPS = t('کارهای جاری');

  if (x.receivables) {
    out.push({
      id: 'a-receivables', title: t('طلب از کارفرماها'), group: G_MONEY, size: 'm', defaultOn: true,
      hint: t('کارفرماهایی که هنوز بدهکارند، بیشترین مانده اول، به تفکیکِ ارز. از گزارشِ کارفرمایان می‌آید؛ مبلغ‌ها پوشیده‌اند.'),
      node: (
        <Panel title={t('طلب از کارفرماها')} icon={<HandCoins />} action={{ href: '/reports?tab=clients', label: t('گزارش') }}>
          {x.receivables.length === 0 ? <Empty>{t('طلبِ بازی از کارفرماها نیست.')}</Empty> : (
            <ExpandableList inPlace className="grid divide-y">
              {x.receivables.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="grid min-w-0 gap-0.5">
                    <Link href={`/reports/client/${r.id}`} className="truncate text-sm font-medium hover:underline">{r.name}</Link>
                    <span className="text-xs text-muted-foreground">
                      {t('{n} پروژه', { n: r.projectCount })}{r.isFormer ? ` · ${t('کارفرمای سابق')}` : ''}
                    </span>
                  </span>
                  <span className="grid shrink-0 justify-items-end gap-0.5">
                    {r.lines.map((l) => (
                      <span key={l.code} className="num text-sm text-amber-700 dark:text-amber-400" dir="ltr"><Amount>{money(l.due, l.code)}</Amount></span>
                    ))}
                  </span>
                </li>
              ))}
            </ExpandableList>
          )}
        </Panel>
      ),
    });
  }

  if (x.payroll) {
    out.push({
      id: 'a-payroll', title: t('حقوق و قسط‌ها'), group: G_MONEY, size: 'm', defaultOn: true,
      hint: t('حقوق‌های ماهانهٔ پرداخت‌نشده (سررسیدگذشته‌ها قرمز) و اعضایی که قسطِ قرضشان عقب افتاده. قسط هنگامِ ثبتِ پرداختِ حقوق کم می‌شود.'),
      node: (
        <Panel title={t('حقوق و قسط‌ها')} icon={<Wallet />} action={{ href: '/finance?tab=salaries', label: t('حقوق‌ها') }}>
          {x.payroll.length === 0 && (x.loans?.length ?? 0) === 0 ? <Empty>{t('حقوقِ پرداخت‌نشده‌ای نیست.')}</Empty> : (
            <>
              <ExpandableList inPlace className="grid divide-y">
                {x.payroll.map((p) => (
                  <li key={`${p.salaryId}-${p.month}`} className="flex items-center justify-between gap-3 py-2">
                    <span className="grid min-w-0 gap-0.5">
                      <span className="truncate text-sm font-medium">{p.name}</span>
                      <span className={cn('num text-xs', p.overdue ? 'text-destructive' : 'text-muted-foreground')}>{p.month}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="num text-sm" dir="ltr"><Amount>{money(p.amount, p.currencyCode)}</Amount></span>
                      <Link href="/finance?tab=salaries" className="rounded-md border px-2 py-0.5 text-xs hover:border-primary/40 hover:text-primary">{t('ثبتِ پرداخت')}</Link>
                    </span>
                  </li>
                ))}
              </ExpandableList>
              {(x.loans?.length ?? 0) > 0 && (
                <p className="rounded-lg bg-amber-500/10 px-3 py-1.5 text-xs text-amber-800 dark:text-amber-300">
                  {t('قسطِ عقب‌افتاده: {names}', { names: x.loans!.map((l) => l.name).join(t('، ')) })}
                </p>
              )}
            </>
          )}
        </Panel>
      ),
    });
  }

  if (x.renewals) {
    out.push({
      id: 'a-renewals', title: t('تمدیدِ اشتراک‌ها'), group: G_MONEY, size: 'm', defaultOn: true,
      hint: t('اشتراک‌ها و هزینه‌های دوره‌ای که تا ۳۰ روزِ آینده تمدید می‌شوند (عقب‌افتاده‌ها قرمز). «ثبتِ پرداخت» با دو کلیک همان پرداختِ صفحهٔ هزینه‌ها را ثبت می‌کند.'),
      node: (
        <Panel title={t('تمدیدِ اشتراک‌ها')} icon={<CalendarSync />} action={{ href: '/finance?tab=expenses', label: t('هزینه‌ها') }}>
          {x.renewals.length === 0 ? <Empty>{t('تا یک ماهِ آینده تمدیدی نیست.')}</Empty> : (
            <ExpandableList inPlace className="grid divide-y">
              {x.renewals.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="grid min-w-0 gap-0.5">
                    <span className="truncate text-sm font-medium">{r.title}</span>
                    <span className="flex min-w-0 gap-1 text-xs text-muted-foreground">
                      <span className={cn('num shrink-0', r.overdue && 'text-destructive')}>{r.nextDueDate}</span>
                      {r.vendorName && <span className="truncate">· {r.vendorName}</span>}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="num text-sm" dir="ltr"><Amount>{money(r.amount, r.currencyCode)}</Amount></span>
                    <PayRenewalButton id={r.id} due={r.nextDueDate} />
                  </span>
                </li>
              ))}
            </ExpandableList>
          )}
        </Panel>
      ),
    });
  }

  if (x.qaTicks) {
    out.push({
      id: 'a-qa', title: t('تیک‌های تازهٔ کارفرما'), group: G_OPS, size: 'm', defaultOn: true,
      hint: t('آیتم‌هایی از چک‌لیستِ QA که کارفرما در ۱۴ روزِ اخیر تیک زده — تا کار را ببینید و بسنجید. با کلیک تبِ QA ِ پروژه باز می‌شود.'),
      node: (
        <Panel title={t('تیک‌های تازهٔ کارفرما')} icon={<ListChecks />}>
          {x.qaTicks.length === 0 ? <Empty>{t('کارفرما در دو هفتهٔ اخیر چیزی تیک نزده.')}</Empty> : (
            <ExpandableList inPlace className="grid divide-y">
              {x.qaTicks.map((q) => (
                <li key={q.id}>
                  <Link href={`/projects/${q.projectId}?tab=qa`} className="grid gap-0.5 py-2 hover:bg-muted/40">
                    <span className="truncate text-sm">{q.title}</span>
                    <span className="flex min-w-0 gap-1 text-xs text-muted-foreground">
                      <span className="truncate">{q.projectTitle} · {q.byName ?? '—'}</span>
                      <span className="num shrink-0">{day(q.doneAt)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ExpandableList>
          )}
        </Panel>
      ),
    });
  }

  if (x.access) {
    out.push({
      id: 'a-access', title: t('هشدارِ دسترسی'), group: G_OPS, size: 's', defaultOn: true,
      hint: t('عضوهای غیرفعال یا قفل‌شده‌ای که هنوز در دفترِ دسترسی‌ها دسترسیِ باز دارند. برای امنیت، این دسترسی‌ها را ببندید.'),
      node: (
        <Panel title={t('هشدارِ دسترسی')} icon={<KeyRound />} action={{ href: '/access', label: t('دسترسی‌ها') }}>
          {x.access.length === 0 ? <Empty>{t('عضوِ سابقی با دسترسیِ باز نیست.')}</Empty> : (
            <ExpandableList inPlace className="grid gap-1.5">
              {x.access.map((r) => (
                <li key={r.userId} className="flex items-center justify-between gap-2 rounded-lg bg-destructive/6 px-3 py-1.5 text-sm">
                  <span className="truncate">{r.name}</span>
                  <span className="shrink-0 text-xs text-destructive">{t('{n} دسترسیِ باز', { n: r.grants })}</span>
                </li>
              ))}
            </ExpandableList>
          )}
        </Panel>
      ),
    });
  }

  if (x.backup) {
    const b = x.backup;
    const stale = b.at ? Date.now() - Date.parse(b.at) > 3 * 86400000 : true;
    const bad = b.ok === false || stale;
    out.push({
      id: 'a-backup', title: t('سلامتِ سیستم'), group: G_OPS, size: 's', defaultOn: true,
      hint: t('آخرین پشتیبان‌گیری: موفق یا ناموفق و کِی. اگر پشتیبان شکست بخورد یا بیش از سه روز اجرا نشود، کارت قرمز می‌شود.'),
      node: (
        <Panel title={t('سلامتِ سیستم')} icon={<DatabaseBackup />} action={{ href: '/settings?tab=backup', label: t('پشتیبان') }}>
          <div className={cn('grid gap-1 rounded-xl px-3 py-2.5', bad ? 'bg-destructive/8' : 'bg-emerald-500/10')}>
            <span className={cn('text-sm font-bold', bad ? 'text-destructive' : 'text-emerald-700 dark:text-emerald-400')}>
              {b.running ? t('پشتیبان‌گیری در جریان است…')
                : b.ok === false ? t('آخرین پشتیبان ناموفق بود')
                : !b.at ? t('هنوز پشتیبانی گرفته نشده')
                : stale ? t('پشتیبانِ تازه‌ای نیست')
                : t('پشتیبان سالم است')}
            </span>
            {b.at && <span className="num text-xs text-muted-foreground">{formatDateTime(b.at, '')}</span>}
            {b.failsInRow > 1 && <span className="text-xs text-destructive">{t('{n} بارِ پشتِ هم ناموفق', { n: b.failsInRow })}</span>}
          </div>
        </Panel>
      ),
    });
  }
  return out;
}

/* ─────────────────────────────── عضو ─────────────────────────────── */

export function memberExtraWidgets(x: MemberX, userId: number): WidgetDef[] {
  const out: WidgetDef[] = [];
  const G_TIME = t('ساعت و برنامه'), G_WORK = t('کارهای من'), G_MORE = t('بیشتر');

  if (x.resume) {
    const r = x.resume;
    out.push({
      id: 'm-resume', title: t('ادامهٔ کارِ قبلی'), group: G_TIME, size: 's', defaultOn: true,
      hint: t('با یک کلیک تایمر را روی آخرین پروژه‌ای که رویش ساعت ثبت کرده‌اید روشن کنید. اگر تایمر روشن است، همین‌جا می‌بینید.'),
      node: (
        <Panel title={t('ادامهٔ کارِ قبلی')} icon={<Play />}>
          {r.running ? (
            <div className="grid gap-1 rounded-xl bg-emerald-500/10 px-3 py-2.5">
              <span className="text-xs text-emerald-700 dark:text-emerald-400">{t('تایمر روشن است')}</span>
              <span className="truncate text-sm font-medium">{r.running.projectTitle ?? t('ساعتِ عمومی')}</span>
              <Link href="/hours" className="num text-xs text-muted-foreground hover:underline">{hm(r.running.minutes)}</Link>
            </div>
          ) : r.last ? (
            <div className="grid gap-2">
              <span className="grid gap-0.5">
                <span className="truncate text-sm font-medium">{r.last.projectTitle ?? t('ساعتِ عمومی')}</span>
                <span className="text-xs text-muted-foreground">
                  {t('آخرین بار')} <span className="num">{r.last.logDate}</span> · <span className="num">{hm(r.last.minutes)}</span>
                </span>
              </span>
              <ResumeTimerButton target={r.last.target} />
            </div>
          ) : <Empty>{t('هنوز ساعتی ثبت نکرده‌اید.')}</Empty>}
        </Panel>
      ),
    });
  }

  if (x.weekMinutes !== null) {
    out.push({
      id: 'm-goal', title: t('هدفِ ساعتِ هفته'), group: G_TIME, size: 's', defaultOn: true,
      hint: t('چند ساعت از هدفِ این هفته را کار کرده‌اید. هدف را با مداد عوض کنید (فعلاً روی همین مرورگر ذخیره می‌شود).'),
      node: <Panel title={t('هدفِ ساعتِ هفته')} icon={<Target />}><HoursGoal minutes={x.weekMinutes} userId={userId} /></Panel>,
    });
  }

  if (x.mentions) {
    out.push({
      id: 'm-mentions', title: t('منشن‌های من'), group: G_WORK, size: 'm', defaultOn: true,
      hint: t('جاهایی در کانال‌ها و گروه‌ها که اسمِ شما آمده و هنوز اعلانش را ندیده‌اید. با کلیک همان پیام باز می‌شود.'),
      node: (
        <Panel title={t('منشن‌های من')} icon={<AtSign />} action={{ href: '/messages', label: t('پیام‌ها') }}>
          {x.mentions.length === 0 ? <Empty>{t('منشنِ تازه‌ای ندارید.')}</Empty> : (
            <ExpandableList inPlace className="grid divide-y">
              {x.mentions.map((m) => (
                <li key={m.id}>
                  <Link href={m.url || '/messages'} className="grid gap-0.5 py-2 hover:bg-muted/40">
                    <span className="truncate text-sm font-medium">{m.title}</span>
                    {m.body && <span className="line-clamp-2 text-xs text-muted-foreground">{m.body}</span>}
                  </Link>
                </li>
              ))}
            </ExpandableList>
          )}
        </Panel>
      ),
    });
  }

  if (x.leave || x.schedule) {
    const slots = (s: Array<{ from: string; to: string }>) => s.map((v) => `${v.from}–${v.to}`).join(t('، '));
    out.push({
      id: 'm-leave', title: t('مرخصی و برنامهٔ من'), group: G_TIME, size: 's', defaultOn: true,
      hint: t('ساعت‌های کاریِ امروز و فردا طبقِ برنامهٔ هفتگیِ شما، و مرخصی‌های پیشِ رو.'),
      node: (
        <Panel title={t('مرخصی و برنامهٔ من')} icon={<CalendarOff />} action={{ href: '/my-schedule', label: t('برنامه') }}>
          {x.schedule && (x.schedule.hasAny ? (
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
              <dt className="text-muted-foreground">{t('امروز')}</dt>
              <dd className="num" dir="ltr">{x.schedule.today.length ? slots(x.schedule.today) : '—'}</dd>
              <dt className="text-muted-foreground">{t('فردا')}</dt>
              <dd className="num" dir="ltr">{x.schedule.tomorrow.length ? slots(x.schedule.tomorrow) : '—'}</dd>
            </dl>
          ) : <Empty>{t('برنامهٔ هفتگی نداده‌اید.')}</Empty>)}
          {x.leave && (x.leave.length === 0
            ? <p className="text-xs text-muted-foreground">{t('مرخصیِ پیشِ رو ندارید.')}</p>
            : (
              <ExpandableList inPlace limit={3} className="grid gap-1">
                {x.leave.map((a) => (
                  <li key={a.id} className="flex items-center gap-2 rounded-lg bg-muted/50 px-2.5 py-1.5 text-xs">
                    <span className="num" dir="ltr">{a.fromDate === a.toDate ? a.fromDate : `${a.fromDate} → ${a.toDate}`}</span>
                    {a.note && <span className="truncate text-muted-foreground">{a.note}</span>}
                  </li>
                ))}
              </ExpandableList>
            ))}
        </Panel>
      ),
    });
  }

  if (x.money) {
    out.push({
      id: 'm-money', title: t('پولِ من'), group: G_MORE, size: 's', defaultOn: false,
      hint: t('ماندهٔ دریافتیِ شما از پروژه‌ها به تفکیکِ ارز. پیش‌فرض خاموش است تا جلوی چشمِ دیگران نباشد؛ مبلغ با کلیک دیده می‌شود.'),
      node: (
        <Panel title={t('پولِ من')} icon={<PiggyBank />} action={{ href: '/my-money', label: t('جزئیات') }}>
          {x.money.length === 0 ? <span className="text-lg font-bold"><SecretAmount value="0" /></span> : (
            <div className="grid gap-1">
              {x.money.map((l) => (
                <span key={l.currencyCode} className="num text-lg font-bold"><SecretAmount value={money(l.total, l.currencyCode)} /></span>
              ))}
            </div>
          )}
        </Panel>
      ),
    });
  }
  return out;
}

/* ─────────────────────────────── کارفرما ─────────────────────────────── */

const PAY_LABEL: Record<string, string> = { unpaid: 'پرداخت‌نشده', partial: 'پرداختِ جزئی', paid: 'تسویه‌شده' };

export function ClientDashboardV2({
  data, extras, review, userId,
}: {
  data: MemberDashboard;
  extras: ClientX;
  /** تسک‌های منتظرِ تأییدِ کارفرما (myTasks، بی‌تسکِ خصوصی و پنهان از کارفرما). */
  review: InboxTask[];
  userId: number;
}) {
  const widgets: WidgetDef[] = [];
  const G_ACT = t('منتظرِ شما'), G_PROJ = t('پروژه‌ها'), G_MORE = t('بیشتر');
  const rows = data.client?.rows ?? [];

  widgets.push({
    id: 'c-review', title: t('منتظرِ تأییدِ شما'), group: G_ACT, size: 'l', defaultOn: true,
    hint: t('کارهایی که تیم تمام کرده و برای دیدن و تأییدِ شما فرستاده. با کلیک تسک باز می‌شود تا نظرتان را بنویسید.'),
    node: (
      <Panel title={t('منتظرِ تأییدِ شما')} icon={<ClipboardCheck />} action={{ href: '/tasks', label: t('همه') }}>
        {review.length === 0 ? <Empty>{t('کاری منتظرِ تأییدِ شما نیست.')}</Empty> : (
          <ExpandableList inPlace className="grid divide-y">
            {review.map((tk) => (
              <li key={tk.id}>
                <Link href={`/projects/${tk.projectId}?tab=tasks`} className="flex items-center justify-between gap-3 py-2 hover:bg-muted/40">
                  <span className="grid min-w-0 gap-0.5">
                    <span className="truncate text-sm font-medium">{tk.title}</span>
                    <span className="truncate text-xs text-muted-foreground">{tk.projectTitle}</span>
                  </span>
                  <span className="shrink-0 rounded-md border px-2 py-0.5 text-xs">{t('بررسی')}</span>
                </Link>
              </li>
            ))}
          </ExpandableList>
        )}
      </Panel>
    ),
  });

  if (extras.qa) {
    widgets.push({
      id: 'c-qa', title: t('چک‌لیستِ تحویل'), group: G_ACT, size: 'm', defaultOn: true,
      hint: t('موردهایی از چک‌لیستِ کیفیت که باید خودتان بررسی و تأیید کنید. هر مورد را که دیدید و درست بود، تیک بزنید.'),
      node: <Panel title={t('چک‌لیستِ تحویل')} icon={<ListChecks />}><ClientQaList items={extras.qa} /></Panel>,
    });
  }

  widgets.push({
    id: 'c-projects', title: t('پروژه‌های من'), group: G_PROJ, size: 'xl', defaultOn: true,
    hint: t('پروژه‌های شما با مرحلهٔ فعلی، ددلاین، درصدِ پیشرفت (بر اساسِ تسک‌ها) و وضعیتِ پرداخت.'),
    node: (
      <Panel title={t('پروژه‌های من')} icon={<FolderKanban />} action={{ href: '/projects', label: t('پروژه‌ها') }}>
        {rows.length === 0 ? <Empty>{t('پروژه‌ای ندارید.')}</Empty> : (
          <ExpandableList inPlace limit={6} className="grid gap-2 @lg/kzcard:grid-cols-2 @4xl/kzcard:grid-cols-3">
            {rows.map((p) => (
              <li key={p.id}>
                <Link href={`/projects/${p.id}`} className="grid gap-2 rounded-xl border p-3 transition-colors hover:border-primary/40">
                  <span className="flex min-w-0 items-center gap-2">
                    <Thumb id={p.id} title={p.title} fileId={p.thumbnailFileId} size={32} />
                    <span className="grid min-w-0 gap-0.5">
                      <span className="truncate text-sm font-medium">{p.title}</span>
                      <span className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
                        {p.statusName && (
                          <span className="inline-flex shrink-0 items-center gap-1">
                            <span aria-hidden className="size-1.5 rounded-full" style={{ background: p.statusColor ?? 'currentColor' }} />{p.statusName}
                          </span>
                        )}
                        {p.deadline && <span className="truncate">· {t('ددلاین')} <span className="num">{p.deadline}</span></span>}
                      </span>
                    </span>
                  </span>
                  <span className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <span className="block h-full rounded-full bg-primary" style={{ width: `${p.percent}%` }} />
                  </span>
                  <span className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                    <span className={cn(
                      'rounded-full px-2 py-0.5',
                      p.paymentStatus === 'paid' ? 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-400'
                        : p.paymentStatus === 'partial' ? 'bg-amber-500/12 text-amber-700 dark:text-amber-400' : 'bg-muted',
                    )}>{t(PAY_LABEL[p.paymentStatus] ?? p.paymentStatus)}</span>
                    <span className="num">{p.percent}%</span>
                  </span>
                </Link>
              </li>
            ))}
          </ExpandableList>
        )}
      </Panel>
    ),
  });

  if (extras.statement) {
    widgets.push({
      id: 'c-statement', title: t('صورتِ حساب'), group: G_PROJ, size: 'm', defaultOn: true,
      hint: t('برای هر پروژه: کلِ مبلغ، پرداختی و مانده، با تاریخِ آخرین پرداخت. مبلغ‌ها پوشیده‌اند و با کلیک دیده می‌شوند.'),
      node: (
        <Panel title={t('صورتِ حساب')} icon={<Receipt />} action={{ href: '/my-money', label: t('جزئیات') }}>
          {extras.statement.length === 0 ? <Empty>{t('حسابی ثبت نشده.')}</Empty> : (
            <ExpandableList inPlace className="grid divide-y">
              {extras.statement.map((s) => (
                <li key={s.projectId} className="grid gap-1 py-2">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">{s.title}</span>
                    <span className={cn('num shrink-0 text-sm', Number(s.remaining) > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-emerald-700 dark:text-emerald-400')}>
                      <SecretAmount value={money(s.remaining, s.currencyCode)} />
                    </span>
                  </span>
                  <span className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>{t('مانده')}</span>
                    {s.lastPayment
                      ? <span>{t('آخرین پرداخت')} <span className="num">{s.lastPayment.paidAt}</span></span>
                      : <span>{t('پرداختی ثبت نشده')}</span>}
                  </span>
                </li>
              ))}
            </ExpandableList>
          )}
        </Panel>
      ),
    });
  }

  if (extras.updates) {
    widgets.push({
      id: 'c-updates', title: t('تازه‌های پروژه'), group: G_PROJ, size: 'm', defaultOn: true,
      hint: t('کارهایی که در ۳۰ روزِ اخیر تمام شده و فایل‌هایی که تیم به پروژه‌هایتان اضافه کرده.'),
      node: (
        <Panel title={t('تازه‌های پروژه')} icon={<Sparkles />}>
          {extras.updates.length === 0 ? <Empty>{t('در یک ماهِ اخیر خبرِ تازه‌ای نیست.')}</Empty> : (
            <ExpandableList inPlace className="grid divide-y">
              {extras.updates.map((u) => (
                <li key={`${u.kind}-${u.id}`}>
                  <Link href={`/projects/${u.projectId}?tab=${u.kind === 'file' ? 'files' : 'tasks'}`} className="flex items-center gap-2 py-2 hover:bg-muted/40">
                    {u.kind === 'file'
                      ? <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                      : <ClipboardCheck className="size-4 shrink-0 text-emerald-600" aria-hidden />}
                    <span className="grid min-w-0 flex-1 gap-0.5">
                      <span className="truncate text-sm">{u.title}</span>
                      <span className="truncate text-xs text-muted-foreground">{u.kind === 'file' ? t('فایلِ تازه') : t('تمام شد')} · {u.projectTitle}</span>
                    </span>
                    <span className="num shrink-0 text-xs text-muted-foreground">{day(u.at)}</span>
                  </Link>
                </li>
              ))}
            </ExpandableList>
          )}
        </Panel>
      ),
    });
  }

  widgets.push({
    id: 'c-meetings', title: t('جلساتِ پیشِ رو'), group: G_MORE, size: 's', defaultOn: true,
    hint: t('جلسه‌های هفت روزِ آیندهٔ شما با تیم.'),
    node: (
      <Panel title={t('جلساتِ پیشِ رو')} icon={<CalendarDays />} action={{ href: '/meetings', label: t('جلسات') }}>
        {data.meetings.length === 0 ? <Empty>{t('جلسه‌ای ثبت نشده.')}</Empty> : (
          <ExpandableList inPlace className="grid gap-2">
            {data.meetings.map((m) => (
              <li key={m.id} className="grid gap-0.5 rounded-lg bg-muted/40 px-3 py-2">
                <span className="truncate text-sm font-medium">{m.title}</span>
                <span className="num text-xs text-muted-foreground">{formatDateTime(m.meetAt, '')}</span>
              </li>
            ))}
          </ExpandableList>
        )}
      </Panel>
    ),
  });

  widgets.push({
    id: 'c-message', title: t('پیام به تیم'), group: G_MORE, size: 's', defaultOn: true,
    hint: t('سؤال یا درخواستتان را مستقیم برای مدیرانِ تیم بفرستید؛ پاسخ در «پیام‌ها» می‌آید.'),
    node: (
      <Panel title={t('پیام به تیم')} icon={<MessageSquarePlus />}>
        {data.unread > 0 && (
          <Link href="/messages" className="rounded-lg bg-primary/8 px-3 py-1.5 text-xs text-primary hover:underline">
            {t('{n} پیامِ خوانده‌نشده دارید', { n: data.unread })}
          </Link>
        )}
        <ContactTeamForm />
      </Panel>
    ),
  });

  if (data.onboarding) {
    widgets.push({
      id: 'c-onboarding', title: t('آنبوردینگ'), group: G_MORE, size: 'xl', defaultOn: true,
      hint: t('کارهای شروعِ همکاری که باید انجام دهید.'),
      node: <OnboardingCard data={data.onboarding} memberId={userId} />,
    });
  }

  widgets.push({
    id: 'c-note', title: t('یادداشتِ من'), group: G_MORE, size: 's', defaultOn: false,
    hint: t('یادداشتِ شخصیِ شما که خودکار ذخیره می‌شود و فقط خودتان می‌بینید.'),
    node: <QuickNote userId={userId} />,
  });

  return <DashboardGrid widgets={widgets} userId={userId} scope="client" defaults={CLIENT_LAYOUT} />;
}
