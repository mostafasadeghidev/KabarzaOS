'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Pencil, Play, Send } from 'lucide-react';
import { startTimerAction } from '../hours/_form/actions';
import { toggleQaAction } from '../projects/_form/qa-actions';
import { contactManagementAction } from '../messages/_form/actions';
import { payRecurringAction } from '../finance/_form/payout-actions';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Hint } from '@/components/ui/tooltip';
import { useToast } from '@/components/ui/toast';
import { useLiveEvents } from '@/components/live';
import { useT } from '@/i18n/client';
import { cn } from '@/lib/utils';
import type { ClientQa } from '@/server/dashboard-extras';

/**
 * تکه‌های کلاینتیِ کارت‌های تازهٔ داشبورد (نمونهٔ محلی). هر کدام **همان کنشِ سرورِ صفحهٔ اصلی‌اش**
 * را صدا می‌زند (تایمر ← startTimerAction، QA ← toggleQaAction، …) — گارد همان‌جاست، نه اینجا.
 */

/** «ادامهٔ کارِ قبلی» — تایمر را با یک کلیک روی آخرین پروژه‌ای که ساعت ثبت کرده روشن می‌کند. */
export function ResumeTimerButton({ target }: { target: string }) {
  const t = useT();
  const router = useRouter();
  const { show } = useToast();
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      disabled={pending}
      onClick={() => start(async () => {
        const fd = new FormData();
        fd.set('projectId', target);
        const r = await startTimerAction({}, fd);
        if (r.error) show(t(r.error), 'error');
        else { show(t('تایمر شروع شد.'), 'success'); router.refresh(); }
      })}
    >
      <Play className="size-3.5" />{t('ادامهٔ کار')}
    </Button>
  );
}

/** چک‌لیستِ QA ِ کارفرما — تیک همان‌جا؛ موردِ تیک‌خورده بی‌درنگ کنار می‌رود و اگر سرور رد کرد برمی‌گردد. */
export function ClientQaList({ items }: { items: ClientQa[] }) {
  const t = useT();
  const { show } = useToast();
  const [done, setDone] = useState<Set<number>>(new Set());
  const [, start] = useTransition();
  const left = items.filter((i) => !done.has(i.id));
  if (left.length === 0) return <p className="py-2 text-sm text-muted-foreground">{t('موردی برای بررسیِ شما نمانده است.')}</p>;
  // گروه به تفکیکِ پروژه.
  const groups = new Map<number, { title: string; rows: ClientQa[] }>();
  for (const i of left) {
    const g = groups.get(i.projectId) ?? { title: i.projectTitle, rows: [] };
    g.rows.push(i);
    groups.set(i.projectId, g);
  }
  return (
    <div className="grid max-h-[26rem] gap-3 overflow-y-auto overscroll-contain">
      {[...groups.entries()].map(([pid, g]) => (
        <div key={pid} className="grid gap-1">
          <Link href={`/projects/${pid}?tab=qa`} className="truncate text-xs font-medium text-muted-foreground hover:underline">{g.title}</Link>
          <ul className="grid gap-1">
            {g.rows.map((i) => (
              <li key={i.id} className="flex items-start gap-2 rounded-lg px-1 py-1 hover:bg-muted/40">
                <button
                  type="button"
                  aria-label={t('تأیید شد')}
                  className="mt-0.5 grid size-4 shrink-0 place-items-center rounded border border-input hover:border-primary"
                  onClick={() => {
                    setDone((s) => new Set(s).add(i.id));
                    start(async () => {
                      const r = await toggleQaAction(i.id);
                      if (r.error) {
                        setDone((s) => { const n = new Set(s); n.delete(i.id); return n; });
                        show(t(r.error), 'error');
                      } else show(t('ثبت شد.'), 'success');
                    });
                  }}
                />
                <span className="grid min-w-0 gap-0.5">
                  <span className="text-sm">{i.title}</span>
                  {i.description && <span className="line-clamp-2 text-xs text-muted-foreground">{i.description}</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** پیام به تیم — همان «پیام به مدیریت» ِ صفحهٔ پیام‌ها (یک رشتهٔ مشترک با مدیران). */
export function ContactTeamForm() {
  const t = useT();
  const { show } = useToast();
  const [body, setBody] = useState('');
  const [pending, start] = useTransition();
  return (
    <form
      className="grid gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!body.trim()) return;
        start(async () => {
          const fd = new FormData();
          fd.set('body', body);
          const r = await contactManagementAction({}, fd);
          if (r.error) show(t(r.error), 'error');
          else { setBody(''); show(t('پیام فرستاده شد.'), 'success'); }
        });
      }}
    >
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        placeholder={t('سؤال یا درخواستتان را بنویسید…')}
        aria-label={t('متنِ پیام')}
      />
      <div className="flex items-center justify-between gap-2">
        <Link href="/messages" className="text-xs text-muted-foreground hover:underline">{t('همهٔ پیام‌ها')}</Link>
        <Button type="submit" size="sm" disabled={pending || !body.trim()}><Send className="size-3.5" />{t('بفرست')}</Button>
      </div>
    </form>
  );
}

/** «پرداخت شد» برای تمدیدِ اشتراک/هزینهٔ دوره‌ای — دومرحله‌ای تا با یک کلیکِ اشتباه ثبت نشود. */
export function PayRenewalButton({ id, due }: { id: number; due: string }) {
  const t = useT();
  const router = useRouter();
  const { show } = useToast();
  const [armed, setArmed] = useState(false);
  const [pending, start] = useTransition();
  useEffect(() => {
    if (!armed) return;
    const h = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(h);
  }, [armed]);
  return (
    <Button
      size="xs"
      variant={armed ? 'default' : 'outline'}
      disabled={pending}
      onClick={() => {
        if (!armed) { setArmed(true); return; }
        start(async () => {
          const r = await payRecurringAction(id, due);
          setArmed(false);
          if (r.error) show(t(r.error), 'error');
          else { show(t('پرداخت ثبت شد.'), 'success'); router.refresh(); }
        });
      }}
    >
      {armed ? <><Check className="size-3" />{t('مطمئنم')}</> : t('ثبتِ پرداخت')}
    </Button>
  );
}

/**
 * هدفِ ساعتِ هفته — نوارِ پیشرفت. ⚠️ هدف فعلاً روی همین مرورگر ذخیره می‌شود (مثلِ یادداشت)؛
 * پیش از انتقال باید به پایگاه‌داده برود.
 */
export function HoursGoal({ minutes, userId }: { minutes: number; userId: number }) {
  const t = useT();
  const key = `kz-hours-goal-${userId}`;
  const [goal, setGoal] = useState(40);
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    try { const v = Number(localStorage.getItem(key)); if (v > 0) setGoal(v); } catch { /* بی‌حافظه */ }
  }, [key]);
  const save = (v: number) => {
    const n = Math.min(80, Math.max(1, Math.round(v) || 40));
    setGoal(n);
    try { localStorage.setItem(key, String(n)); } catch { /* بی‌حافظه */ }
  };
  const hours = minutes / 60;
  const pct = Math.min(100, Math.round((hours / goal) * 100));
  return (
    <div className="grid gap-2">
      <div className="flex items-end justify-between gap-2">
        <span className="flex items-baseline gap-1">
          <span className="num text-2xl font-bold">{hours.toFixed(1).replace(/\.0$/, '')}</span>
          <span className="text-sm text-muted-foreground">{t('از')}</span>
          {editing ? (
            <Input
              type="number" min={1} max={80} defaultValue={goal} autoFocus
              aria-label={t('هدفِ ساعتِ هفته')}
              className="h-7 w-16 text-sm"
              onBlur={(e) => { save(Number(e.target.value)); setEditing(false); }}
              onKeyDown={(e) => { if (e.key === 'Enter') { save(Number((e.target as HTMLInputElement).value)); setEditing(false); } }}
            />
          ) : <span className="num text-sm text-muted-foreground">{goal}</span>}
          <span className="text-sm text-muted-foreground">{t('ساعت')}</span>
        </span>
        <Hint label={t('تغییرِ هدف')}>
          <button type="button" aria-label={t('تغییرِ هدف')} onClick={() => setEditing(true)} className="rounded p-1 text-muted-foreground hover:text-foreground">
            <Pencil className="size-3.5" />
          </button>
        </Hint>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className={cn('h-full rounded-full transition-all', pct >= 100 ? 'bg-emerald-500' : 'bg-primary')} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-muted-foreground">
        {pct >= 100 ? t('هدفِ این هفته کامل شد.') : t('{n} ساعت مانده تا هدف.', { n: Math.max(0, goal - hours).toFixed(1).replace(/\.0$/, '') })}
      </p>
    </div>
  );
}

/**
 * تازه‌سازیِ زندهٔ داشبورد — با خبرِ لحظه‌ای (SSE) داده‌های سرور دوباره خوانده می‌شود، بی‌بارگذاریِ صفحه.
 * ⚠️ خبرها محتوا ندارند (فقط «چیزی عوض شد»)؛ چند خبرِ پشتِ‌هم یک تازه‌سازی می‌شوند (۱.۵ ثانیه).
 * در حالِ کشیدنِ کارت تازه نمی‌کند تا چیدمان زیرِ دستِ کاربر جابه‌جا نشود.
 */
export function LiveRefresh() {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useLiveEvents((kind) => {
    if (kind === 'ready') return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (document.querySelector('[data-dash-editing="1"]')) return;
      router.refresh();
    }, 1500);
  });
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return null;
}
