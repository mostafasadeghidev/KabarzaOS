'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, useTransition } from 'react';
import { BellRing, Check, Clock, CornerUpLeft, Gavel, MessageSquare, Package, Receipt, ListChecks, UserX, Wallet, X, PartyPopper } from 'lucide-react';
import { setTaskStatusAction } from '../projects/_form/tab-actions';
import { decideRequestAction } from '../finance/_form/payout-actions';
import { remindTimelogAction } from './_actions';
import { TaskDialog } from '../projects/[id]/task-dialog';
import { Button } from '@/components/ui/button';
import { CardHelp } from '@/components/ui/card-help';
import { TaskNumber } from '@/components/task-number';
import { UserName } from '@/components/user-avatar';
import { Amount } from '@/components/amount-privacy';
import { useToast } from '@/components/ui/toast';
import { useT } from '@/i18n/client';
import { formatIn } from '@/domain/money/money';
import { agoLabel } from '@/domain/people/last-online';
import { cn } from '@/lib/utils';
import { ExpandableList } from '@/components/ui/expandable-list';
import type { InboxComment, InboxNoLog, InboxRequest, InboxReviewTask, InboxTender, InboxUnassigned, InboxUnit } from '@/server/dashboard-inbox';

/**
 * صفِ کارهای امروز (نمونهٔ محلی ِ داشبوردِ تازه) — هر مورد با کارِ خودش در همان‌جا:
 * بازبینیِ تسک ← تأیید/برگشت، درخواستِ پرداخت ← تأیید/رد، کامنت ← رفتن، هزینهٔ سررسید ← رفتن.
 * موردِ انجام‌شده بی‌درنگ از صف کنار می‌رود (خوش‌بینانه) و اگر سرور رد کرد برمی‌گردد.
 */

export interface InboxExpense { id: number; title: string; amount: string; due: string; overdue: boolean }

export type InboxKind = 'review' | 'requests' | 'comments' | 'expenses' | 'units' | 'tenders' | 'unassigned' | 'nolog';
type Kind = 'all' | InboxKind;

export function DashboardInbox({
  review, requests, comments, expenses, units, tenders, unassigned, noLog, approveStatusId, returnStatusId,
  kinds, title, icon, empty,
}: {
  /** کدام نوع‌ها در این کارت (۳.۱۸ نمونه): «کارهای پروژه»، «کارهای مالی»، «کارهای تیم». */
  kinds: InboxKind[];
  title: string;
  icon?: React.ReactNode;
  empty: string;
  review: InboxReviewTask[];
  requests: InboxRequest[];
  comments: InboxComment[];
  expenses: InboxExpense[];
  units: InboxUnit[];
  tenders: InboxTender[];
  unassigned: InboxUnassigned[];
  noLog: InboxNoLog[];
  approveStatusId: number | null;
  returnStatusId: number | null;
}) {
  const t = useT();
  // کارت با قدِ ثابتِ کاربر: فهرست جای باقی‌مانده را می‌گیرد و داخلِ خودش اسکرول می‌خورد (بی سقفِ 28rem).
  const { show } = useToast();
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState<Set<string>>(new Set());
  const [kind, setKind] = useState<Kind>('all');
  const [openTask, setOpenTask] = useState<number | null>(null);

  const hide = (key: string, on: boolean) => setDone((s) => { const n = new Set(s); if (on) n.add(key); else n.delete(key); return n; });
  const act = (key: string, run: () => Promise<{ error?: string }>, ok: string) => {
    hide(key, true);
    startTransition(async () => {
      const r = await run();
      if (r.error) { hide(key, false); show(t(r.error), 'error'); } else show(t(ok), 'success');
    });
  };

  const R = review.filter((r) => !done.has(`t${r.id}`));
  const Q = requests.filter((r) => !done.has(`r${r.id}`));
  const C = comments;
  const E = expenses;
  const U = units;
  const T = tenders;
  const A = unassigned;
  const N = noLog.filter((m) => !done.has(`n${m.userId}`));
  const per = {
    review: R.length, requests: Q.length, comments: C.length, expenses: E.length,
    units: U.length, tenders: T.length, unassigned: A.length, nolog: N.length,
  };
  const counts: Record<Kind, number> = { ...per, all: kinds.reduce((sum, k) => sum + per[k], 0) };

  /*
   * میان‌بُرهای صفحه‌کلید (مثلِ صندوقِ Linear/Gmail): j/k ردیفِ بعد/قبل، a یا Enter اولین کنشِ ردیف.
   * فقط وقتی تمرکز در فیلدِ تایپ نیست و پنجره‌ای باز نیست.
   */
  const listRef = useRef<HTMLUListElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (e.ctrlKey || e.metaKey || e.altKey || el?.closest('input, textarea, select, [contenteditable=true], [role=dialog]')) return;
      const mine = listRef.current;
      if (!mine) return;
      // ⚠️ چند کارتِ صف روی صفحه است: فقط کارتی که تمرکز در آن است؛ اگر هیچ، اولین کارتِ صفحه.
      const focusedList = (document.activeElement as HTMLElement | null)?.closest('[data-inbox-list]');
      if (focusedList ? focusedList !== mine : document.querySelector('[data-inbox-list]') !== mine) return;
      const rows = [...mine.querySelectorAll<HTMLElement>('[data-inbox-row]')];
      if (rows.length === 0) return;
      const at = rows.indexOf(document.activeElement as HTMLElement);
      if (e.key === 'j' || e.key === 'k') {
        e.preventDefault();
        const next = e.key === 'j' ? Math.min(rows.length - 1, at + 1) : Math.max(0, at === -1 ? 0 : at - 1);
        rows[next]?.focus();
      } else if ((e.key === 'a' || e.key === 'Enter') && at !== -1) {
        e.preventDefault();
        rows[at]?.querySelector<HTMLElement>('[data-row-actions] button, [data-row-actions] a')?.click();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const tabs: Array<{ key: Kind; label: string; icon: React.ReactNode }> = [
    { key: 'all', label: 'همه', icon: null },
    { key: 'review', label: 'بازبینی', icon: <ListChecks className="size-3.5" /> },
    { key: 'requests', label: 'پرداخت', icon: <Wallet className="size-3.5" /> },
    { key: 'comments', label: 'کامنت', icon: <MessageSquare className="size-3.5" /> },
    { key: 'expenses', label: 'هزینه', icon: <Receipt className="size-3.5" /> },
    { key: 'units', label: 'کارکرد', icon: <Package className="size-3.5" /> },
    { key: 'tenders', label: 'مناقصه', icon: <Gavel className="size-3.5" /> },
    { key: 'unassigned', label: 'بی‌مسئول', icon: <UserX className="size-3.5" /> },
    { key: 'nolog', label: 'ساعت', icon: <Clock className="size-3.5" /> },
  ];
  const show_ = (k: InboxKind) => kinds.includes(k) && (kind === 'all' || kind === k);

  return (
    <section className="flex h-full min-h-0 flex-col gap-3 rounded-2xl border bg-card p-4">
      {/*
        راهنما در ردیفِ عنوان، گوشهٔ انتهایی (بالا-چپ در فارسی). ⚠️ پیش از این کنارِ فیلترها بود و وقتی
        فیلترها در کارتِ باریک به خطِ بعد می‌شکستند، علامتِ سؤال هم با آن‌ها پایین می‌رفت.
      */}
      <header className="grid gap-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-bold">
            {icon}{title}
            {counts.all > 0 && <span className="num rounded-full bg-primary/12 px-1.5 text-[11px] text-primary">{counts.all}</span>}
          </h2>
          <CardHelp />
        </div>
        <div className="kz-chips flex flex-wrap items-center gap-1 empty:hidden">
          {/* فیلترِ نوع فقط وقتی کارت بیش از یک نوعِ پُر دارد. */}
          {kinds.filter((k) => counts[k] > 0).length > 1 && tabs.filter((x) => x.key === 'all' || (kinds.includes(x.key as InboxKind) && counts[x.key] > 0)).map((x) => (
            <button
              key={x.key}
              type="button"
              onClick={() => setKind(x.key)}
              aria-pressed={kind === x.key}
              className={cn('flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs transition-colors',
                kind === x.key ? 'border-primary bg-primary text-primary-foreground' : 'hover:border-primary/40')}
            >
              {x.icon}{t(x.label)}
              <span className={cn('num', kind === x.key ? 'text-primary-foreground/80' : 'text-muted-foreground')}>{counts[x.key]}</span>
            </button>
          ))}
        </div>
      </header>

      {counts.all === 0 ? (
        <div className="grid place-items-center gap-2 py-6 text-center text-muted-foreground">
          <PartyPopper className="size-8 text-primary/70" />
          <p className="text-sm font-medium text-foreground">{t(empty)}</p>
        </div>
      ) : (
        <ExpandableList inPlace listRef={listRef} listProps={{ 'data-inbox-list': true }} className="grid content-start divide-y">
          {show_('review') && R.map((r) => (
            <Row
              key={`t${r.id}`}
              icon={<ListChecks className="size-4" />}
              tone="amber"
              title={<button type="button" onClick={() => setOpenTask(r.id)} className="flex min-w-0 items-center gap-1.5 text-start hover:underline"><TaskNumber number={r.number} /><span className="truncate">{r.title}</span></button>}
              meta={<>{t('بازبینی')} · <Link href={`/projects/${r.projectId}?tab=tasks&view=review`} className="hover:underline">{r.projectTitle}</Link>{r.assigneeName ? <> · {r.assigneeName}</> : null}{r.since ? <> · <span suppressHydrationWarning>{agoLabel(r.since, t)}</span></> : null}</>}
              actions={<>
                {approveStatusId && (
                  <Button size="xs" disabled={pending} onClick={() => act(`t${r.id}`, () => setTaskStatusAction(r.id, approveStatusId), 'تسک تأیید شد.')}>
                    <Check className="size-3.5" />{t('تأیید')}
                  </Button>
                )}
                {returnStatusId && (
                  <Button size="xs" variant="outline" disabled={pending} onClick={() => act(`t${r.id}`, () => setTaskStatusAction(r.id, returnStatusId), 'تسک برگشت خورد.')}>
                    <CornerUpLeft className="size-3.5" />{t('برگشت')}
                  </Button>
                )}
              </>}
            />
          ))}
          {show_('requests') && Q.map((q) => (
            <Row
              key={`r${q.id}`}
              icon={<Wallet className="size-4" />}
              tone="blue"
              title={<span className="flex min-w-0 items-center gap-1.5"><UserName userId={q.userId} name={q.userName ?? '—'} size="sm" /><span className="text-muted-foreground">·</span><Amount><span className="num">{formatIn(q.amount, q.currencyCode)} {q.currencyCode ?? ''}</span></Amount></span>}
              meta={<>{t('درخواستِ پرداخت')}{q.projectTitle ? <> · {q.projectTitle}</> : null}{q.createdAt ? <> · <span suppressHydrationWarning>{agoLabel(q.createdAt, t)}</span></> : null}</>}
              actions={<>
                <Button size="xs" disabled={pending} onClick={() => act(`r${q.id}`, () => decideRequestAction(q.id, 'approved'), 'درخواست تأیید شد.')}>
                  <Check className="size-3.5" />{t('تأیید')}
                </Button>
                <Button size="xs" variant="outline" disabled={pending} onClick={() => act(`r${q.id}`, () => decideRequestAction(q.id, 'rejected'), 'درخواست رد شد.')}>
                  <X className="size-3.5" />{t('رد')}
                </Button>
              </>}
            />
          ))}
          {show_('comments') && C.map((c) => (
            <Row
              key={`c${c.rootId}`}
              icon={<MessageSquare className="size-4" />}
              tone="violet"
              title={<span className="truncate">{c.excerpt}</span>}
              meta={<>{t('کامنتِ باز')} · {c.projectTitle}{c.authorName ? <> · {c.authorName}</> : null}{c.createdAt ? <> · <span suppressHydrationWarning>{agoLabel(c.createdAt, t)}</span></> : null}</>}
              actions={<Button asChild size="xs" variant="outline"><Link href={`/projects/${c.projectId}?tab=comments`}>{t('پاسخ')}</Link></Button>}
            />
          ))}
          {show_('units') && U.map((u) => (
            <Row
              key={`u${u.id}`}
              icon={<Package className="size-4" />}
              tone="blue"
              title={<span className="flex min-w-0 items-center gap-1.5"><UserName userId={u.userId} name={u.userName ?? '—'} size="sm" /><span className="text-muted-foreground">·</span><Amount><span className="num">{formatIn(u.amount, u.currencyCode)} {u.currencyCode ?? ''}</span></Amount></span>}
              meta={<>{t('کارکردِ پرداخت‌نشده')}{u.projectTitle ? <> · {u.projectTitle}</> : null} · <span className="num">{u.date}</span></>}
              actions={<Button asChild size="xs" variant="outline"><Link href="/finance?tab=members">{t('ثبت در حسابداری')}</Link></Button>}
            />
          ))}
          {show_('tenders') && T.map((x) => (
            <Row
              key={`d${x.projectId}`}
              icon={<Gavel className="size-4" />}
              tone="violet"
              title={<span className="truncate">{x.title}</span>}
              meta={<>{t('مناقصه')} · {t('{n} پیشنهادِ در انتظار', { n: x.bids })}</>}
              actions={<Button asChild size="xs" variant="outline"><Link href={`/projects/${x.projectId}?tab=bids`}>{t('بررسیِ پیشنهادها')}</Link></Button>}
            />
          ))}
          {show_('unassigned') && A.map((a) => (
            <Row
              key={`a${a.id}`}
              icon={<UserX className="size-4" />}
              tone="gray"
              title={<button type="button" onClick={() => setOpenTask(a.id)} className="flex min-w-0 items-center gap-1.5 text-start hover:underline"><TaskNumber number={a.number} /><span className="truncate">{a.title}</span></button>}
              meta={<>{t('تسکِ بی‌مسئول')} · {a.projectTitle}{a.dueDate ? <> · {t('ددلاین')} <span className="num">{a.dueDate}</span></> : null}</>}
              actions={<Button size="xs" variant="outline" onClick={() => setOpenTask(a.id)}>{t('سپردن')}</Button>}
            />
          ))}
          {show_('nolog') && N.map((m) => (
            <Row
              key={`n${m.userId}`}
              icon={<Clock className="size-4" />}
              tone="amber"
              title={<UserName userId={m.userId} name={m.name} size="sm" />}
              meta={t('دیروز ساعتی ثبت نکرده')}
              actions={<Button size="xs" variant="outline" disabled={pending} onClick={() => act(`n${m.userId}`, () => remindTimelogAction(m.userId), 'یادآوری فرستاده شد.')}><BellRing className="size-3.5" />{t('یادآوری')}</Button>}
            />
          ))}
          {show_('expenses') && E.map((e) => (
            <Row
              key={`e${e.id}`}
              icon={<Receipt className="size-4" />}
              tone={e.overdue ? 'red' : 'gray'}
              title={<span className="flex min-w-0 items-center gap-1.5"><span className="truncate">{e.title}</span><span className="text-muted-foreground">·</span><Amount><span className="num" dir="ltr">{e.amount}</span></Amount></span>}
              meta={<>{e.overdue ? t('هزینهٔ سررسیدگذشته') : t('هزینهٔ سررسیدِ نزدیک')} · <span className="num">{e.due}</span></>}
              actions={<Button asChild size="xs" variant="outline"><Link href="/finance?tab=expenses">{t('ثبت پرداخت')}</Link></Button>}
            />
          ))}
        </ExpandableList>
      )}

      <TaskDialog taskId={openTask} open={openTask !== null} onOpenChange={(o) => !o && setOpenTask(null)} />
    </section>
  );
}

const TONES: Record<string, string> = {
  amber: 'bg-amber-500/12 text-amber-700 dark:text-amber-400',
  blue: 'bg-sky-500/12 text-sky-700 dark:text-sky-400',
  violet: 'bg-violet-500/12 text-violet-700 dark:text-violet-400',
  red: 'bg-red-500/12 text-red-700 dark:text-red-400',
  gray: 'bg-muted text-muted-foreground',
};

function Row({ icon, tone, title, meta, actions }: {
  icon: React.ReactNode; tone: keyof typeof TONES; title: React.ReactNode; meta: React.ReactNode; actions: React.ReactNode;
}) {
  return (
    <li data-inbox-row tabIndex={-1} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg px-2 py-2.5 outline-none focus-visible:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/40">
      <span className={cn('grid size-8 shrink-0 place-items-center rounded-lg', TONES[tone])}>{icon}</span>
      {/* basis: در کارتِ باریک متن حداقلِ جایی دارد و دکمه‌ها به خطِ بعد می‌روند، نه روی نام. */}
      <span className="grid min-w-0 flex-1 basis-36 gap-0.5">
        <span className="min-w-0 truncate text-sm font-medium">{title}</span>
        <span className="truncate text-xs text-muted-foreground">{meta}</span>
      </span>
      <span data-row-actions className="ms-auto flex shrink-0 items-center gap-1.5 max-sm:w-full max-sm:justify-end">{actions}</span>
    </li>
  );
}
