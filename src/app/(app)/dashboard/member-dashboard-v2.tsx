import Link from 'next/link';
import {
  CalendarClock, CalendarDays, CheckCircle2, ClipboardCheck, FolderKanban, Gavel, Hourglass, MessageSquareReply,
  UsersRound, Hash, Hand,
} from 'lucide-react';
import { ClaimTaskButton } from '../tasks/inbox-claim';
import { t } from '@/i18n/server';
import { formatDateTime } from '@/i18n/datetime';
import { cn } from '@/lib/utils';
import { ExpandableList } from '@/components/ui/expandable-list';
import { CardHelp } from '@/components/ui/card-help';
import { Thumb } from '@/components/thumb';
import { DashboardGrid, type DefaultLayout, type WidgetDef } from './dashboard-grid';

/**
 * چیدمانِ پیش‌فرضِ عضو — شروعِ روز اول: «کارهای من» بزرگ، و کنارش ستونِ باریکِ «ادامهٔ کار / هدفِ ساعت /
 * منتظرِ بررسی». بعد ساعت و برنامه، بعد گفت‌وگوها (کامنت و منشن) و بازبینی، و پروژه‌ها تمام‌عرض در پایین.
 * ستون‌ها روی شبکهٔ چهارستونه (۰ = اولین ستون از سمتِ شروع). کارتی که برای این عضو ساخته نشده (مثلاً
 * «بازبینی‌های تیم» برای عضوِ ساده) فقط کنار می‌رود و بقیه جای خود را دارند.
 */
/* چیدمانِ مالک (۲۰۲۶-۱۱-۱۸، از localStorage ِ خودش) — ستون‌ها روی پایهٔ ۱۲. */
const MEMBER_LAYOUT: DefaultLayout = {"order": ["m-log", "m-hours", "m-resume", "m-waiting", "m-goal", "m-tasks", "m-meetings", "m-leave", "m-comments", "m-stats", "m-mentions", "m-week", "m-team-review", "m-projects", "m-tenders", "m-note", "m-money"], "sizes": {"m-tasks": "m"}, "cols": {"m-tasks": 0, "m-resume": 9, "m-hours": 6, "m-goal": 9, "m-waiting": 6, "m-meetings": 9, "m-leave": 6, "m-log": 0, "m-comments": 0, "m-mentions": 0, "m-week": 0, "m-team-review": 0, "m-stats": 6, "m-projects": 0, "m-tenders": 0, "m-onboarding": 0, "m-team": 0, "m-client": 0}, "basis": 12 as const, "heights": {"m-hours": 144, "m-log": 168, "m-goal": 145}};
import { QuickNote } from './quick-note';
import { OnboardingCard } from './onboarding-card';
import { ClientBlock } from './member-dashboard';
import type { MemberDashboard } from '@/server/dashboard-member';
import type { InboxTask } from '@/server/projects/service';

/**
 * داشبوردِ تازهٔ **عضو** (نمونهٔ محلی) — همان شبکهٔ بنتوی قابلِ ویرایشِ داشبوردِ مدیر، با کارت‌هایی که
 * فقط از دسترسیِ خودِ عضو می‌آیند: کارهای خودش، کامنت‌های پروژه‌های خودش، ساعتِ خودش و…
 * کارتی که داده‌اش برای این کاربر معنا ندارد (مثلاً «بازبینی‌های تیم» برای عضوِ ساده) اصلاً ساخته نمی‌شود.
 */

export interface MemberTasks {
  active: InboxTask[];
  waiting: InboxTask[];
  review: InboxTask[];
}
interface CommentRow { rootId: number; projectId: number; projectTitle: string | null; authorName: string | null; excerpt: string; createdAt: Date | string | null }

function Panel({ title, icon, action, children, className }: {
  title: string; icon?: React.ReactNode; action?: { href: string; label: string }; children: React.ReactNode; className?: string;
}) {
  return (
    <section className={cn('flex h-full min-h-0 flex-col gap-3 rounded-2xl border bg-card p-4', className)}>
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
  return <p className="kz-empty py-2 text-sm text-muted-foreground">{children}</p>;
}

const taskHref = (tk: InboxTask) =>
  tk.projectCode && tk.number ? `/t/${tk.projectCode}-${tk.number}` : `/projects/${tk.projectId}?tab=tasks`;

function hours(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? String(h) : `${h}:${String(m).padStart(2, '0')}`;
}

/** ردیفِ تسک: شماره، عنوان، پروژه، وضعیت و سررسید (گذشته قرمز، امروز/فردا کهربایی). */
function TaskRow({ tk, todayIso }: { tk: InboxTask; todayIso: string }) {
  const due = tk.dueDate;
  const late = !!due && due < todayIso;
  const soon = !!due && !late && due <= new Date(Date.parse(`${todayIso}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
  return (
    <li>
      <Link href={taskHref(tk)} data-open-task={tk.id} className="flex items-center gap-3 py-2 hover:bg-muted/40">
        {tk.priorityColor
          ? <span className="size-2 shrink-0 rounded-full" style={{ background: tk.priorityColor }} role="img" aria-label={tk.priorityName ?? ''} />
          : <span aria-hidden className="size-2 shrink-0 rounded-full bg-muted" />}
        <span className="grid min-w-0 flex-1 gap-0.5">
          <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium">
            {tk.number != null && <span className="num shrink-0 text-[11px] text-muted-foreground">#{tk.number}</span>}
            <span className="truncate">{tk.title}</span>
          </span>
          <span className="truncate text-xs text-muted-foreground">
            {tk.projectTitle}{tk.statusName ? ` · ${tk.statusName}` : ''}
          </span>
        </span>
        {due && (
          <span className={cn(
            'num shrink-0 rounded-full px-2 py-0.5 text-[11px]',
            late ? 'bg-destructive/10 text-destructive' : soon ? 'bg-amber-500/12 text-amber-700 dark:text-amber-400' : 'bg-muted text-muted-foreground',
          )}>
            {due}
          </span>
        )}
      </Link>
    </li>
  );
}

function TaskList({ items, todayIso, empty }: { items: InboxTask[]; todayIso: string; empty: string }) {
  if (items.length === 0) return <Empty>{empty}</Empty>;
  return (
    <ExpandableList inPlace className="grid divide-y">
      {items.map((tk) => <TaskRow key={tk.id} tk={tk} todayIso={todayIso} />)}
    </ExpandableList>
  );
}

function MiniStat({ value, label, href, tone }: { value: number; label: string; href: string; tone?: 'warn' }) {
  return (
    <Link href={href} className="grid content-center gap-0.5 rounded-xl bg-muted/50 px-3 py-2.5 transition-colors hover:bg-muted">
      <span className={cn('kz-fit-value num text-xl font-bold', tone === 'warn' && value > 0 && 'text-amber-700 dark:text-amber-400')}>{value}</span>
      <span className="kz-fit-label truncate text-xs text-muted-foreground">{label}</span>
    </Link>
  );
}

export function MemberDashboardV2({
  data, tasks, comments, userId, timeLog, myWeek, teamCards, extra = [],
}: {
  /** کارت‌های تازهٔ عضو (extra-widgets.tsx) — ادامهٔ کار، منشن، مرخصی، هدفِ ساعت، پولِ من. */
  extra?: WidgetDef[];
  data: MemberDashboard;
  tasks: MemberTasks | null;
  comments: CommentRow[];
  userId: number;
  timeLog: React.ReactNode;
  myWeek: React.ReactNode;
  teamCards: React.ReactNode;
}) {
  const todayIso = new Date().toISOString().slice(0, 10);
  const in7 = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

  // کارهای من: سررسیدِ گذشته اول، بعد نزدیک‌ترین سررسید، بعد بی‌سررسیدها.
  const active = [...(tasks?.active ?? [])].sort((a, b) => {
    if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
    if (a.dueDate) return -1;
    if (b.dueDate) return 1;
    return (a.prioritySort ?? 99) - (b.prioritySort ?? 99);
  });
  const overdue = active.filter((tk) => tk.dueDate && tk.dueDate < todayIso).length;

  // این هفتهٔ من: سررسیدِ تسک‌های خودم و ددلاینِ پروژه‌های بازِ خودم تا ۷ روزِ آینده (و عقب‌افتاده‌ها).
  type WeekItem = { date: string; title: string; sub?: string; href: string; kind: 'task' | 'project'; taskId?: number };
  const week: WeekItem[] = [
    ...active.filter((tk) => tk.dueDate && tk.dueDate <= in7)
      .map((tk) => ({ date: tk.dueDate!, title: tk.title, sub: tk.projectTitle ?? undefined, href: taskHref(tk), kind: 'task' as const, taskId: tk.id })),
    ...(data.member?.rows ?? []).filter((p) => p.deadline && p.deadline <= in7)
      .map((p) => ({ date: p.deadline!, title: p.title, href: `/projects/${p.id}`, kind: 'project' as const })),
  ].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 12);

  const stats = data.member?.stats;
  const widgets: WidgetDef[] = [];
  const G_WORK = t('کارهای من');
  const G_TIME = t('ساعت و برنامه');
  const G_MORE = t('بیشتر');

  if (tasks) {
    widgets.push({
      id: 'm-tasks', hint: t('تسک‌های بازی که به شما سپرده شده یا نقشش را برداشته‌اید. سررسیدگذشته‌ها اول و قرمزند، نزدیک‌ها کهربایی. با کلیک خودِ تسک باز می‌شود.'), title: t('کارهای من'), group: G_WORK, size: 'l', defaultOn: true,
      node: (
        <Panel
          title={t('کارهای من')}
          icon={<ClipboardCheck />}
          action={{ href: '/tasks', label: t('همهٔ تسک‌ها') }}
        >
          {overdue > 0 && (
            <p className="kz-fit-label rounded-lg bg-destructive/8 px-3 py-1.5 text-xs text-destructive">
              {t('{n} تسک از سررسیدش گذشته است.', { n: overdue })}
            </p>
          )}
          <TaskList items={active} todayIso={todayIso} empty={t('کارِ بازی ندارید.')} />
        </Panel>
      ),
    });
    widgets.push({
      id: 'm-waiting', hint: t('کارهایی که تمام کرده و برای بررسی فرستاده‌اید و منتظرِ تأییدِ مدیر یا کارفرما هستند.'), title: t('منتظرِ بررسی'), group: G_WORK, size: 's', defaultOn: true,
      node: (
        <Panel title={t('منتظرِ بررسی')} icon={<Hourglass />}>
          <p className="kz-fit-label -mt-1 text-xs text-muted-foreground">{t('کارهایی که فرستاده‌اید و منتظرِ نظرِ دیگری‌اند.')}</p>
          <TaskList items={tasks.waiting} todayIso={todayIso} empty={t('چیزی در صف نیست.')} />
        </Panel>
      ),
    });
    /*
     * «کارهای قابلِ برداشتن» — تسک‌های بی‌مسئولی که نقشِ من را می‌خواهند و می‌توانم برشان دارم (claimable از
     * myTasks؛ همان قاعدهٔ canClaimTask). دکمه همان ClaimTaskButton ِ صندوقِ تسک‌هاست (claimTaskAction).
     */
    const claimable = tasks.active.filter((tk) => tk.claimable);
    if (claimable.length > 0) {
      widgets.push({
        id: 'm-claim', hint: t('تسک‌هایی که هنوز مسئول ندارند و نقشِ شما را می‌خواهند. با «برمی‌دارم» به نامِ شما می‌شوند.'), title: t('کارهای قابلِ برداشتن'), group: G_WORK, size: 'm', defaultOn: true,
        node: (
          <Panel title={t('کارهای قابلِ برداشتن')} icon={<Hand />} action={{ href: '/tasks', label: t('همهٔ تسک‌ها') }}>
            <ExpandableList inPlace className="grid divide-y">
              {claimable.map((tk) => (
                <li key={tk.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                  <Link href={taskHref(tk)} data-open-task={tk.id} className="grid min-w-0 basis-36 flex-1 gap-0.5 hover:underline">
                    <span className="truncate text-sm">{tk.title}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {tk.projectTitle}{tk.roles.length ? <> · {tk.roles.map((r) => r.roleName).join(t('، '))}</> : null}{tk.dueDate ? <> · <span className="num">{tk.dueDate}</span></> : null}
                    </span>
                  </Link>
                  <span className="ms-auto"><ClaimTaskButton taskId={tk.id} projectId={tk.projectId} /></span>
                </li>
              ))}
            </ExpandableList>
          </Panel>
        ),
      });
    }
    // فقط مدیرِ پروژه یا دفتر این دسته را دارد (myTasks برای عضوِ ساده خالی برمی‌گرداند).
    if (tasks.review.length > 0) {
      widgets.push({
        id: 'm-team-review', hint: t('کارهایی که اعضای تیم روی پروژه‌های تحتِ مدیریتِ شما برای بررسی فرستاده‌اند.'), title: t('بازبینی‌های تیم'), group: G_WORK, size: 'm', defaultOn: true,
        node: (
          <Panel title={t('بازبینی‌های تیم')} icon={<CheckCircle2 />} action={{ href: '/tasks', label: t('تسک‌ها') }}>
            <p className="kz-fit-label -mt-1 text-xs text-muted-foreground">{t('کارهای تیم روی پروژه‌های تحتِ مدیریتِ شما که منتظرِ تأییدند.')}</p>
            <TaskList items={tasks.review} todayIso={todayIso} empty={t('چیزی منتظرِ تأیید نیست.')} />
          </Panel>
        ),
      });
    }
  }

  widgets.push({
    id: 'm-comments', hint: t('رشته‌کامنت‌های بازِ پروژه‌هایی که در آن‌ها هستید و هنوز بسته نشده‌اند.'), title: t('کامنت‌های باز'), group: G_WORK, size: 'm', defaultOn: true,
    node: (
      <Panel title={t('کامنت‌های باز')} icon={<MessageSquareReply />} action={{ href: '/comments', label: t('همه') }}>
        {comments.length === 0 ? <Empty>{t('کامنتِ بازی روی پروژه‌های شما نیست.')}</Empty> : (
          <ExpandableList inPlace className="grid divide-y">
            {comments.slice(0, 12).map((c) => (
              <li key={c.rootId}>
                <Link href={`/projects/${c.projectId}?tab=comments#c-${c.rootId}`} className="grid gap-0.5 py-2 hover:bg-muted/40">
                  <span className="line-clamp-2 text-sm">{c.excerpt}</span>
                  <span className="truncate text-xs text-muted-foreground">{c.authorName ?? '—'} · {c.projectTitle}</span>
                </Link>
              </li>
            ))}
          </ExpandableList>
        )}
      </Panel>
    ),
  });

  widgets.push({
    id: 'm-week', hint: t('سررسیدِ تسک‌های شما و ددلاینِ پروژه‌هایتان تا هفت روزِ آینده، به‌اضافهٔ عقب‌افتاده‌ها.'), title: t('این هفتهٔ من'), group: G_WORK, size: 'm', defaultOn: true,
    node: (
      <Panel title={t('این هفتهٔ من')} icon={<CalendarClock />}>
        {week.length === 0 ? <Empty>{t('سررسیدی در این هفته ندارید.')}</Empty> : (
          <ExpandableList inPlace className="grid gap-1.5">
            {week.map((w, i) => (
              <li key={`${w.kind}-${w.href}-${i}`}>
                <Link href={w.href} data-open-task={w.taskId} className="flex items-center gap-2 rounded-lg px-1 py-1 text-sm hover:bg-muted/40">
                  {w.date === todayIso
                    ? <span className="w-20 shrink-0 text-xs font-bold">{t('امروز')}</span>
                    : <span className={cn('num w-20 shrink-0 text-xs', w.date < todayIso ? 'text-destructive' : 'text-muted-foreground')}>{w.date}</span>}
                  <span className="shrink-0 rounded bg-muted px-1.5 text-[10px] text-muted-foreground">{w.kind === 'task' ? t('تسک') : t('پروژه')}</span>
                  <span className="truncate">{w.title}</span>
                </Link>
              </li>
            ))}
          </ExpandableList>
        )}
      </Panel>
    ),
  });

  if (stats) {
    widgets.push({
      id: 'm-stats', hint: t('شمارِ پروژه‌ها، تسک‌های باز، کامنت‌های نیازمندِ بررسی و پیام‌های خوانده‌نشدهٔ شما. هر کدام به صفحهٔ خودش می‌رود.'), title: t('عددهای من'), group: G_MORE, size: 'm', defaultOn: true,
      node: (
        <Panel title={t('عددهای من')} icon={<Hash />}>
          <div className="kz-fit"><div className="grid grid-cols-2 gap-2">
            <MiniStat value={stats.projects} label={t('پروژه‌ها')} href="/projects" />
            <MiniStat value={stats.openTasks} label={t('تسک‌های باز')} href="/tasks" />
            <MiniStat value={stats.commentsToReview} label={t('کامنت‌های نیازمند بررسی')} href="/comments" tone="warn" />
            <MiniStat value={data.unread} label={t('پیام‌های خوانده‌نشده')} href="/messages" tone="warn" />
          </div></div>
        </Panel>
      ),
    });
  }

  if (timeLog) widgets.push({ id: 'm-log', hint: t('تایمر را روی یک پروژه روشن کنید یا ساعتِ کار را دستی ثبت کنید.'), title: t('ثبتِ ساعت'), group: G_TIME, size: 'm', defaultOn: true, node: timeLog });
  if (myWeek) widgets.push({ id: 'm-hours', hint: t('ساعتِ کارِ امروز و این هفتهٔ شما، با ستونِ هر روز.'), title: t('هفتهٔ من'), group: G_TIME, size: 's', defaultOn: true, node: myWeek });

  widgets.push({
    id: 'm-meetings', hint: t('جلسه‌های این هفتهٔ شما با روز و ساعت.'), title: t('جلساتِ این هفته'), group: G_TIME, size: 's', defaultOn: true,
    node: (
      <Panel title={t('جلساتِ این هفته')} icon={<CalendarDays />} action={{ href: '/meetings', label: t('جلسات') }}>
        {data.meetings.length === 0 ? <Empty>{t('جلسه‌ای ثبت نشده.')}</Empty> : (
          <ExpandableList inPlace limit={4} className="grid gap-2">
            {data.meetings.map((m) => (
              <li key={m.id} className="grid gap-0.5 rounded-lg bg-muted/40 px-3 py-2">
                <span className="truncate text-sm font-medium">{m.title}</span>
                <span className="num text-xs text-muted-foreground">{formatDateTime(m.meetAt, '')}</span>
                {m.projectTitle && <span className="truncate text-xs text-muted-foreground">{m.projectTitle}</span>}
              </li>
            ))}
          </ExpandableList>
        )}
      </Panel>
    ),
  });

  if (data.member) {
    widgets.push({
      id: 'm-projects', hint: t('پروژه‌های بازی که در آن‌ها نقش دارید: نقشِ شما، ددلاین، درصدِ پیشرفت، تسک‌های بازِ شما و ساعتی که رویش کار کرده‌اید.'), title: t('پروژه‌های باز من'), group: G_MORE, size: 'xl', defaultOn: true,
      node: (
        <Panel title={t('پروژه‌های باز من')} icon={<FolderKanban />} action={{ href: '/projects', label: t('پروژه‌ها') }}>
          {data.member.rows.length === 0 ? <Empty>{t('پروژهٔ بازی ندارید.')}</Empty> : (
            <ExpandableList inPlace limit={6} className="grid gap-2 @lg/kzcard:grid-cols-2 @4xl/kzcard:grid-cols-3">
              {data.member.rows.map((p) => (
                <li key={p.id}>
                  <Link href={`/projects/${p.id}`} className="grid gap-2 rounded-xl border p-3 transition-colors hover:border-primary/40">
                    <span className="flex min-w-0 items-center gap-2">
                      <Thumb id={p.id} title={p.title} fileId={p.thumbnailFileId} size={32} />
                      <span className="grid min-w-0 gap-0.5">
                        <span className="truncate text-sm font-medium">{p.title}</span>
                        <span className="truncate text-xs text-muted-foreground">
                          {p.myRoles.join(t('، ')) || '—'}{p.deadline ? ` · ${t('ددلاین')} ${p.deadline}` : ''}
                        </span>
                      </span>
                    </span>
                    <span className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <span className="block h-full rounded-full bg-primary" style={{ width: `${p.percent}%` }} />
                    </span>
                    <span className="flex justify-between text-[11px] text-muted-foreground">
                      <span>{t('{n} تسکِ باز', { n: p.myOpenTasks })} · {t('{h} ساعت', { h: hours(p.myMinutes) })}</span>
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
  }

  if (data.tenders.length > 0) {
    widgets.push({
      id: 'm-tenders', hint: t('پروژه‌هایی در مرحلهٔ مناقصه که با نقش‌های شما جور است و می‌توانید برایشان پیشنهادِ قیمت بدهید.'), title: t('مناقصه‌ها'), group: G_MORE, size: 'm', defaultOn: true,
      node: (
        <Panel title={t('مناقصه‌ها')} icon={<Gavel />}>
          <ExpandableList inPlace className="grid divide-y">
            {data.tenders.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 py-2">
                <span className="grid min-w-0 gap-0.5">
                  <span className="truncate text-sm font-medium">{p.title}</span>
                  <span className="truncate text-xs text-muted-foreground">{p.roleNames.join(t('، '))}</span>
                </span>
                <Link href={`/projects/${p.id}?tab=my-bid`} className="shrink-0 rounded-lg border px-2.5 py-1 text-xs hover:border-primary/40 hover:text-primary">
                  {p.myBids > 0 ? t('ویرایش پیشنهاد') : t('پیشنهاد بده')}
                </Link>
              </li>
            ))}
          </ExpandableList>
        </Panel>
      ),
    });
  }

  if (data.onboarding) {
    widgets.push({
      id: 'm-onboarding', hint: t('کارهای شروعِ همکاری که باید در روزهای اول انجام دهید.'), title: t('آنبوردینگ'), group: G_MORE, size: 'xl', defaultOn: true,
      node: <OnboardingCard data={data.onboarding} memberId={userId} />,
    });
  }

  if (teamCards) {
    widgets.push({
      id: 'm-team', hint: t('خلاصهٔ تیم‌ها یا دفترهایی که مدیرشان هستید.'), title: t('تیمِ من'), group: G_MORE, size: 'xl', defaultOn: true,
      node: <Panel title={t('تیمِ تحتِ مدیریتِ شما')} icon={<UsersRound />}>{teamCards}</Panel>,
    });
  }

  if (data.client) {
    widgets.push({
      id: 'm-client', hint: t('پروژه‌هایی که در آن‌ها کارفرما هستید، با وضعیتِ پرداخت و پیشرفت.'), title: t('پروژه‌های من به‌عنوان کارفرما'), group: G_MORE, size: 'xl', defaultOn: true,
      node: (
        <div className="grid gap-4">
          <ClientBlock data={data.client} unread={data.unread} showUnread={false} money={data.money?.client ?? []} />
        </div>
      ),
    });
  }

  widgets.push({
    id: 'm-note', hint: t('یادداشتِ شخصیِ شما که خودکار ذخیره می‌شود و فقط خودتان می‌بینید.'), title: t('یادداشتِ من'), group: G_MORE, size: 's', defaultOn: false,
    node: <QuickNote userId={userId} />,
  });

  return <DashboardGrid widgets={[...widgets, ...extra]} userId={userId} scope="member" defaults={MEMBER_LAYOUT} />;
}
