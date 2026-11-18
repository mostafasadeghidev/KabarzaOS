'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { Check, CornerUpLeft, MessageSquare, Receipt, ListChecks, Wallet, X, PartyPopper } from 'lucide-react';
import { setTaskStatusAction } from '../projects/_form/tab-actions';
import { decideRequestAction } from '../finance/_form/payout-actions';
import { TaskDialog } from '../projects/[id]/task-dialog';
import { Button } from '@/components/ui/button';
import { TaskNumber } from '@/components/task-number';
import { UserName } from '@/components/user-avatar';
import { Amount } from '@/components/amount-privacy';
import { useToast } from '@/components/ui/toast';
import { useT } from '@/i18n/client';
import { formatIn } from '@/domain/money/money';
import { agoLabel } from '@/domain/people/last-online';
import { cn } from '@/lib/utils';
import type { InboxComment, InboxRequest, InboxReviewTask } from '@/server/dashboard-inbox';

/**
 * صفِ کارهای امروز (نمونهٔ محلی ِ داشبوردِ تازه) — هر مورد با کارِ خودش در همان‌جا:
 * بازبینیِ تسک ← تأیید/برگشت، درخواستِ پرداخت ← تأیید/رد، کامنت ← رفتن، هزینهٔ سررسید ← رفتن.
 * موردِ انجام‌شده بی‌درنگ از صف کنار می‌رود (خوش‌بینانه) و اگر سرور رد کرد برمی‌گردد.
 */

export interface InboxExpense { id: number; title: string; amount: string; due: string; overdue: boolean }

type Kind = 'all' | 'review' | 'requests' | 'comments' | 'expenses';

export function DashboardInbox({
  review, requests, comments, expenses, approveStatusId, returnStatusId,
}: {
  review: InboxReviewTask[];
  requests: InboxRequest[];
  comments: InboxComment[];
  expenses: InboxExpense[];
  approveStatusId: number | null;
  returnStatusId: number | null;
}) {
  const t = useT();
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
  const counts = { all: R.length + Q.length + C.length + E.length, review: R.length, requests: Q.length, comments: C.length, expenses: E.length };
  const tabs: Array<{ key: Kind; label: string; icon: React.ReactNode }> = [
    { key: 'all', label: 'همه', icon: null },
    { key: 'review', label: 'بازبینی', icon: <ListChecks className="size-3.5" /> },
    { key: 'requests', label: 'پرداخت', icon: <Wallet className="size-3.5" /> },
    { key: 'comments', label: 'کامنت', icon: <MessageSquare className="size-3.5" /> },
    { key: 'expenses', label: 'هزینه', icon: <Receipt className="size-3.5" /> },
  ];
  const show_ = (k: Exclude<Kind, 'all'>) => kind === 'all' || kind === k;

  return (
    <section className="grid gap-3 rounded-2xl border bg-card p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-bold">{t('منتظرِ شما')}</h2>
        <div className="flex flex-wrap gap-1">
          {tabs.filter((x) => x.key === 'all' || counts[x.key] > 0).map((x) => (
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
        <div className="grid place-items-center gap-2 py-10 text-center text-muted-foreground">
          <PartyPopper className="size-8 text-primary/70" />
          <p className="text-sm font-medium text-foreground">{t('کاری منتظرِ شما نیست.')}</p>
          <p className="text-xs">{t('هر وقت بازبینی، درخواستِ پرداخت یا کامنتی برسد همین‌جا می‌آید.')}</p>
        </div>
      ) : (
        <ul className="grid divide-y">
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
        </ul>
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
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5">
      <span className={cn('grid size-8 shrink-0 place-items-center rounded-lg', TONES[tone])}>{icon}</span>
      <span className="grid min-w-0 flex-1 gap-0.5">
        <span className="min-w-0 text-sm font-medium">{title}</span>
        <span className="truncate text-xs text-muted-foreground">{meta}</span>
      </span>
      <span className="flex shrink-0 items-center gap-1.5 max-sm:w-full max-sm:justify-end">{actions}</span>
    </li>
  );
}
