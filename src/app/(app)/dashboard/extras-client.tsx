'use client';

import Link from 'next/link';
import { ExpandableList } from '@/components/ui/expandable-list';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Paperclip, Pencil, Play, Send } from 'lucide-react';
import { startTimerAction } from '../hours/_form/actions';
import { toggleQaAction } from '../projects/_form/qa-actions';
import { contactManagementAction } from '../messages/_form/actions';
import { addCommentAction } from '../projects/_form/tab-actions';
import { payRecurringAction } from '../finance/_form/payout-actions';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Hint } from '@/components/ui/tooltip';
import { useToast } from '@/components/ui/toast';
import { useLiveEvents } from '@/components/live';
import { useT } from '@/i18n/client';
import { cn } from '@/lib/utils';
import type { ClientQa, TalkProject, TalkThread } from '@/server/dashboard-extras';

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
    <ExpandableList inPlace className="grid content-start gap-1">
      {[...groups.entries()].flatMap(([pid, g]) => [
        <li key={`h${pid}`} data-group-head className="min-w-0 pt-2 first:pt-0">
          <Link href={`/projects/${pid}?tab=qa`} className="block truncate text-xs font-medium text-muted-foreground hover:underline">{g.title}</Link>
        </li>,
        ...g.rows.map((i) => (
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
        )),
      ])}
    </ExpandableList>
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
      className="kz-form grid gap-2"
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
        className="kz-grow"
        placeholder={t('سؤال یا درخواستتان را بنویسید…')}
        aria-label={t('متنِ پیام')}
      />
      <div className="flex items-center justify-between gap-2">
        <Link href="/messages" className="kz-fit-label text-xs text-muted-foreground hover:underline">{t('همهٔ پیام‌ها')}</Link>
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
          <span className="kz-num num text-2xl font-bold">{hours.toFixed(1).replace(/\.0$/, '')}</span>
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
      <p className="kz-fit-label text-xs text-muted-foreground">
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

/**
 * «پیام و نظر» ِ کارفرما — یک کارت به‌جای دو: پیامِ کلی به تیم (همان «پیام به مدیریت») یا کامنت روی یکی از
 * پروژه‌های بازش (همان addCommentAction ِ تبِ کامنت‌ها؛ گارد، منجمد بودن و اعلان همان‌جاست).
 * چند پروژه: انتخابگرِ دکمه‌ای (زیاد ← فهرستِ کشویی)، پیش‌فرض آخرین انتخاب روی همین مرورگر وگرنه
 * پروژه‌ای با تازه‌ترین گفتگو؛ نامِ پروژهٔ انتخاب‌شده بالای متن پررنگ است تا کامنت اشتباهی نرود.
 */
export function ClientTalkCard({ userId, projects, threads }: {
  userId: number;
  projects: TalkProject[];
  threads: TalkThread[];
}) {
  const t = useT();
  const router = useRouter();
  const { show } = useToast();
  const key = `kz-client-talk-${userId}`;
  const [target, setTarget] = useState<number | 'team'>(projects[0]?.id ?? 'team');
  useEffect(() => {
    try {
      const v = localStorage.getItem(key);
      if (v === 'team') setTarget('team');
      else if (v && projects.some((p) => p.id === Number(v))) setTarget(Number(v));
    } catch { /* خصوصی */ }
  }, [key, projects]);
  const pick = (v: number | 'team') => { setTarget(v); try { localStorage.setItem(key, String(v)); } catch { /* پر */ } };
  const [body, setBody] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const project = target === 'team' ? null : projects.find((p) => p.id === target) ?? null;
  const shownThreads = project ? threads.filter((x) => x.projectId === project.id) : [];

  const send = () => {
    if (!body.trim() && files.length === 0) return;
    start(async () => {
      const fd = new FormData();
      fd.set('body', body);
      let error: string | undefined;
      if (project) {
        fd.set('projectId', String(project.id));
        for (const f of files) fd.append('media', f);
        error = (await addCommentAction({}, fd)).error;
      } else {
        error = (await contactManagementAction({}, fd)).error;
      }
      if (error) { show(t(error), 'error'); return; }
      setBody('');
      setFiles([]);
      if (fileRef.current) fileRef.current.value = '';
      show(project ? t('نظرتان روی پروژه ثبت شد.') : t('پیام فرستاده شد.'), 'success');
      router.refresh();
    });
  };

  const options: Array<{ v: number | 'team'; label: string }> = [
    ...projects.map((p) => ({ v: p.id, label: p.title })),
    { v: 'team', label: t('پیامِ کلی به تیم') },
  ];
  return (
    <div className="kz-form grid gap-2">
      {/* انتخابِ «درباره»: یک پروژه ← دو دکمه؛ چند تا ← دکمه‌ها؛ زیاد ← فهرستِ کشویی. */}
      {projects.length > 0 && (options.length <= 4 ? (
        <div className="kz-chips flex flex-wrap gap-1" role="radiogroup" aria-label={t('درباره')}>
          {options.map((o) => (
            <button
              key={String(o.v)}
              type="button"
              role="radio"
              aria-checked={target === o.v}
              onClick={() => pick(o.v)}
              className={cn('max-w-full truncate rounded-full border px-2.5 py-0.5 text-xs transition-colors',
                target === o.v ? 'border-primary bg-primary text-primary-foreground' : 'hover:border-primary/40')}
            >
              {o.label}
            </button>
          ))}
        </div>
      ) : (
        <select
          value={String(target)}
          onChange={(e) => pick(e.target.value === 'team' ? 'team' : Number(e.target.value))}
          aria-label={t('درباره')}
          className="h-8 w-full rounded-md border bg-card px-2 text-sm"
        >
          {options.map((o) => <option key={String(o.v)} value={String(o.v)}>{o.label}</option>)}
        </select>
      ))}
      <p className="kz-fit-label truncate text-xs text-muted-foreground">
        {project
          ? <>{t('نظر روی پروژهٔ')} <b className="text-foreground">{project.title}</b></>
          : t('پیام به مدیرانِ تیم؛ پاسخ در «پیام‌ها» می‌آید.')}
      </p>
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        className="kz-grow"
        placeholder={project ? t('نظر، سؤال یا درخواستتان دربارهٔ این پروژه…') : t('سؤال یا درخواستتان را بنویسید…')}
        aria-label={t('متنِ پیام')}
      />
      <div className="flex items-center justify-between gap-2">
        {project ? (
          <label className="kz-fit-label flex min-w-0 cursor-pointer items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <Paperclip className="size-3.5 shrink-0" />
            <span className="truncate">{files.length ? t('{n} فایل', { n: files.length }) : t('پیوستِ فایل')}</span>
            <input ref={fileRef} type="file" multiple className="sr-only" onChange={(e) => setFiles([...(e.target.files ?? [])])} />
          </label>
        ) : (
          <Link href="/messages" className="kz-fit-label text-xs text-muted-foreground hover:underline">{t('همهٔ پیام‌ها')}</Link>
        )}
        <Button type="button" size="sm" onClick={send} disabled={pending || (!body.trim() && files.length === 0)}>
          <Send className="size-3.5" />{t('بفرست')}
        </Button>
      </div>
      {/* چند رشتهٔ آخرِ همین پروژه — تا ببیند قبلاً چه گفته و جواب آمده یا نه. */}
      {shownThreads.length > 0 && (
        <ul className="kz-fit-label grid gap-1 border-t pt-2">
          {shownThreads.map((x) => (
            <li key={x.rootId} className="min-w-0">
              <Link href={`/projects/${x.projectId}?tab=comments`} className="grid gap-0.5 rounded-md px-1 py-1 hover:bg-muted/40">
                <span className="truncate text-xs">{x.excerpt}</span>
                <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span>{x.mine ? t('خودِ شما') : t('تیم')}</span>
                  {x.replies > 0 && <span>· {t('{n} پاسخ', { n: x.replies })}</span>}
                  {x.done
                    ? <span className="text-emerald-700 dark:text-emerald-400">· {t('انجام شد')}</span>
                    : x.lastFromTeam && <span className="text-primary">· {t('پاسخِ تازه از تیم')}</span>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
