'use client';

import * as React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { saveTourStateAction } from '@/app/(app)/_actions/tours';
import { tourById, toursFor } from '@/tours';
import { onPath, type Tour, type TourCtx, type TourPatch, type TourState, type TourStep } from '@/tours/types';
import { TourOverlay } from './tour-overlay';
import { TourPicker } from './tour-picker';

/**
 * موتورِ راهنمای تعاملی (۳.۱۹.۰).
 *
 *  · راهنما داده است (src/tours)؛ قدم‌ها با `data-tour` به عنصرِ صفحه اشاره می‌کنند.
 *  · پیشرفت روی سرور است (`users.tour_state`): بعد از رفتن به صفحهٔ دیگر یا بستنِ مرورگر از همان قدم ادامه می‌یابد.
 *  · بارِ اولِ ورود، راهنمای «خوش‌آمد» ِ نقشِ کاربر (یا راهنمایی که مدیر فرستاده) خودکار شروع می‌شود.
 *  · ⚠️ در «دیدن به‌جای کاربر» (`disabled`) هیچ راهنمایی خودکار باز نمی‌شود و چیزی ذخیره نمی‌شود.
 */
interface TourApi {
  ctx: TourCtx;
  state: TourState;
  /** راهنماهای این کاربر (بر اساسِ نقش). */
  available: Tour[];
  start: (id: string) => void;
  openPicker: () => void;
  disabled: boolean;
}
const TourCtxReact = React.createContext<TourApi | null>(null);
export function useTour() {
  return React.useContext(TourCtxReact);
}

const now = () => new Date().toISOString();

export function TourProvider({ ctx, initial, disabled, children }: {
  ctx: TourCtx;
  initial: TourState;
  disabled: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname() ?? '/';
  const [state, setState] = React.useState<TourState>(initial);
  const [active, setActive] = React.useState<{ id: string; idx: number } | null>(null);
  const [finished, setFinished] = React.useState<Tour | null>(null);
  const [picker, setPicker] = React.useState(false);
  const stepsOf = React.useCallback((t: Tour) => t.steps.filter((s) => !s.when || s.when(ctx)), [ctx]);
  // ⚠️ راهنمایی که همهٔ قدم‌هایش برای این کاربر با `when` کنار رفته‌اند در فهرست نیاید — «شروع» بی‌صدا کاری نمی‌کرد.
  const available = React.useMemo(() => toursFor(ctx).filter((t) => stepsOf(t).length > 0), [ctx, stepsOf]);

  /**
   * فقط تغییر فرستاده می‌شود (TourPatch) و سرور آن را اتمی روی مقدارِ پایگاه‌داده ادغام می‌کند؛ اینجا هم
   * همان ادغام روی state ِ محلی. ⚠️ پیش از این کلِ `done`/`assigned` ِ کهنه فرستاده و جایگزین می‌شد.
   */
  const persist = React.useCallback((patch: TourPatch) => {
    setState((s) => ({
      ...s,
      ...('active' in patch ? { active: patch.active ?? null } : {}),
      ...(patch.snoozeUntil !== undefined ? { snoozeUntil: patch.snoozeUntil } : {}),
      done: patch.done ? { ...(s.done ?? {}), ...patch.done } : s.done,
      assigned: patch.unassign ? (s.assigned ?? []).filter((x) => x !== patch.unassign) : s.assigned,
    }));
    if (!disabled) void saveTourStateAction(patch);
  }, [disabled]);

  const start = React.useCallback((id: string, fromStep?: string) => {
    const t = tourById(id);
    if (!t || !t.audience(ctx)) return;
    const steps = stepsOf(t);
    if (steps.length === 0) return;
    const idx = Math.max(0, fromStep ? steps.findIndex((s) => s.id === fromStep) : 0);
    setFinished(null);
    setPicker(false);
    setActive({ id, idx });
    persist({ active: { id, step: steps[idx]!.id } });
  }, [ctx, stepsOf, persist]);

  // شروعِ خودکار — یک بار، کمی بعد از بارگذاری تا صفحه سرِ جایش بنشیند.
  const autoTried = React.useRef(false);
  React.useEffect(() => {
    if (disabled || autoTried.current) return;
    // ⚠️ پرچم داخلِ زمان‌سنج: در حالتِ Strict افکت یک بار بسته و دوباره باز می‌شود؛ پرچمِ بیرونی زمان‌سنجِ
    // لغوشده را «انجام‌شده» حساب می‌کرد و راهنما هرگز باز نمی‌شد.
    const id = setTimeout(() => {
      if (autoTried.current) return;
      autoTried.current = true;
      const s = initial;
      if (s.active && tourById(s.active.id)?.audience(ctx)) { start(s.active.id, s.active.step); return; }
      // ⚠️ «بعداً» پیش از راهنمای فرستاده‌شده: وگرنه راهنمای مدیر با هر بارگذاری دوباره باز می‌شد و «تا فردا
      // باز نمی‌شود» دروغ بود. (فرستادنِ تازهٔ مدیر خودش «بعداً» را پاک می‌کند.)
      if (s.snoozeUntil && Date.parse(s.snoozeUntil) > Date.now()) return;
      const assigned = (s.assigned ?? []).find((t) => tourById(t)?.audience(ctx));
      if (assigned) { start(assigned); return; }
      const welcome = available.find((t) => t.autoStart && !s.done?.[t.id]);
      if (welcome) start(welcome.id);
    }, 1200);
    return () => clearTimeout(id);
  }, [disabled, initial, ctx, available, start]);

  const tour = active ? tourById(active.id) : null;
  const steps = tour ? stepsOf(tour) : [];
  const step: TourStep | null = active && steps[active.idx] ? steps[active.idx]! : null;

  const finish = React.useCallback((t: Tour, completed: boolean) => {
    setActive(null);
    persist({ done: { [t.id]: completed ? now() : `skipped:${now()}` }, unassign: t.id, active: null });
    if (completed) setFinished(t);
  }, [persist]);

  const go = React.useCallback((delta: number) => {
    if (!active || !tour) return;
    const idx = active.idx + delta;
    if (idx < 0) return;
    if (idx >= steps.length) { finish(tour, true); return; }
    setActive({ id: active.id, idx });
    persist({ active: { id: active.id, step: steps[idx]!.id } });
  }, [active, tour, steps, finish, persist]);

  /**
   * ردِ قدمِ اختیاریِ ناپیدا، همراهِ قدم‌های اختیاریِ پشتِ سرش که عنصرشان هم الان روی صفحه نیست — یک‌جا.
   * ⚠️ پیش از این هر کدام جدا صبر می‌کرد: تبِ «بازبینی‌ها» ِ پروژهٔ بی‌بازبینی ده قدمِ پشتِ سرِ هم داشت و کاربر
   * چند ثانیه صفحهٔ خالی می‌دید. قدمی که مسیرِ دیگری دارد یا هدف ندارد (کارتِ وسط) زنجیر را می‌شکند.
   */
  const skipMissing = React.useCallback(() => {
    if (!active || !tour) return;
    // «دیده می‌شود» یا زیرِ «بیشتر»/کشوی منو نگه داشته شده (آن هم یعنی قدم معنا دارد).
    const shown = (name: string) => [...document.querySelectorAll<HTMLElement>(`[data-tour="${CSS.escape(name)}"]`)]
      .some((e) => e.getBoundingClientRect().width > 0)
      || [...document.querySelectorAll<HTMLElement>('[data-tour-holds]')].some((e) => (e.dataset.tourHolds ?? '').split(' ').includes(name))
      || [...document.querySelectorAll<HTMLElement>('[data-tour-holds-prefix]')]
        .some((e) => e.getBoundingClientRect().width > 0 && (e.dataset.tourHoldsPrefix ?? '').split(' ').some((p) => p && name.startsWith(p)));
    let idx = active.idx + 1;
    while (idx < steps.length) {
      const s = steps[idx]!;
      if (!s.optional || !s.target || (s.path && !onPath(pathname, s.path)) || shown(s.target)) break;
      idx++;
    }
    go(idx - active.idx);
  }, [active, tour, steps, pathname, go]);

  /**
   * ⚠️ تابعِ پایدار برای «بعدی»: arrow ِ تازه در هر رندر listener ِ قدمِ «کلیک» را از نو می‌ساخت و اگر رندر بینِ
   * pointerdown و سنجشِ ۲۵۰ میلی‌ثانیه‌ای می‌افتاد، جلو رفتن گم می‌شد.
   */
  const goRef = React.useRef(go);
  goRef.current = go;
  const nextStable = React.useCallback(() => goRef.current(1), []);

  // قدمِ «کلیک» ِ ناوبری: با رسیدن به مسیرِ خواسته‌شده جلو می‌رود.
  React.useEffect(() => {
    if (step?.kind === 'click' && step.advanceOnPath && onPath(pathname, step.advanceOnPath)) go(1);
  }, [pathname, step, go]);

  /** «بعداً»: راهنما بسته می‌شود و تا فردا خودکار باز نمی‌شود؛ از فهرست همیشه در دسترس است. */
  const later = React.useCallback(() => {
    setActive(null);
    persist({ active: null, snoozeUntil: new Date(Date.now() + 86400000).toISOString() });
  }, [persist]);

  const api = React.useMemo<TourApi>(() => ({
    ctx, state, available, start: (id) => start(id), openPicker: () => setPicker(true), disabled,
  }), [ctx, state, available, start, disabled]);

  // فقط در توسعه: دسترسیِ اسکریپتِ آزمون به موتور (اجرای پشتِ سرِ همِ همهٔ راهنماها در مرورگر).
  React.useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    (window as unknown as { __kzTour?: unknown }).__kzTour = {
      ids: available.map((t) => t.id),
      start,
      active: () => (active ? { id: active.id, idx: active.idx } : null),
    };
  }, [available, start, active]);

  const suggestions = React.useMemo(() => {
    if (!finished) return [];
    const fresh = (t: Tour | null | undefined): t is Tour => !!t && t.id !== finished.id && t.audience(ctx) && !state.done?.[t.id];
    const listed = (finished.next ?? []).map(tourById).filter(fresh);
    if (listed.length) return listed;
    // راهنمایی که `next` ندارد هم به بعدی برسد: اولین راهنمای دیده‌نشدهٔ همین کاربر، به ترتیبِ فهرست —
    // وگرنه کارتِ پایان فقط «تمام» داشت و کاربر راهِ ادامه را نمی‌دید.
    const i = available.findIndex((t) => t.id === finished.id);
    const after = [...available.slice(i + 1), ...available.slice(0, Math.max(0, i))].find(fresh);
    return after ? [after] : [];
  }, [finished, ctx, state.done, available]);

  return (
    <TourCtxReact.Provider value={api}>
      {children}
      {tour && step && (
        <TourOverlay
          key={`${tour.id}:${step.id}`}
          tour={tour}
          step={step}
          index={active!.idx}
          total={steps.length}
          pathname={pathname}
          onNext={nextStable}
          onSkip={skipMissing}
          onBack={() => go(-1)}
          onClose={() => finish(tour, false)}
          onLater={later}
          onGo={(p) => router.push(p)}
        />
      )}
      {finished && (
        <TourOverlay
          key={`done:${finished.id}`}
          tour={finished}
          step={null}
          index={0}
          total={0}
          pathname={pathname}
          suggestions={suggestions}
          onStart={(id) => start(id)}
          onNext={() => setFinished(null)}
          onBack={() => {}}
          onClose={() => setFinished(null)}
          onLater={() => setFinished(null)}
          onGo={(p) => router.push(p)}
        />
      )}
      <TourPicker open={picker} onOpenChange={setPicker} />
    </TourCtxReact.Provider>
  );
}
