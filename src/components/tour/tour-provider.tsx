'use client';

import * as React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { saveTourStateAction } from '@/app/(app)/_actions/tours';
import { useT } from '@/i18n/client';
import { arrivedAt, onPath, type Tour, type TourCtx, type TourMeta, type TourPatch, type TourState, type TourStep } from '@/tours/types';
import { RELOCALE_KEY, TourOverlay } from './tour-overlay';
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
  /** راهنماهای این کاربر (بر اساسِ نقش) — فهرستِ سبکِ سرور. */
  available: TourMeta[];
  start: (id: string) => void;
  openPicker: () => void;
  disabled: boolean;
}
const TourCtxReact = React.createContext<TourApi | null>(null);
export function useTour() {
  return React.useContext(TourCtxReact);
}

const now = () => new Date().toISOString();

const LAYERS = '[role="dialog"][data-state="open"],[role="alertdialog"][data-state="open"],[role="menu"][data-state="open"]';
/** عنصرِ این برچسب همین الان دیده می‌شود (نه نسخهٔ پنهان، نه دیالوگِ در حالِ بسته شدن). */
function onScreen(name: string): HTMLElement | null {
  return [...document.querySelectorAll<HTMLElement>(`[data-tour="${CSS.escape(name)}"]`)].find((e) => {
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && !e.closest('[data-state="closed"]') && !e.closest('.kz-tour');
  }) ?? null;
}
/**
 * «جلو بردن» ِ راهنمای **پشتِ سرِ هم** (۳.۱۹.۰، خواستِ مالک): از قدمِ `from`، کلیک‌های آماده‌سازی (باز کردنِ
 * منو، تب، پنجره، رفتن به صفحه) که نتیجه‌شان همین الان روی صفحه است رد می‌شوند — اگر عنصرِ قدمی جلوتر در همین
 * رشتهٔ کلیک‌ها (یا قدمِ بعد از آن) دیده می‌شود، کلیک‌های پیش از آن لازم نیست.
 * مثال: «QA» ← «بازبینی‌ها» داخلِ پروژه؛ «پنجرهٔ تسک» ← «یادداشت‌ها» با پنجرهٔ باز؛ تبِ تنظیماتی که باز است.
 * ⚠️ قدمِ جلوتر باید «مسیرِ مؤثر» داشته باشد (مسیرِ خودش یا نزدیک‌ترین قدمِ قبلی — بیشترِ قدم‌ها مسیر را از
 * قدمِ قبل به ارث می‌برند) و در همان مسیر باشیم. قدمِ ناوبری (پیوندِ منو) نشانه نیست: همیشه دیده می‌شود و
 * دیده شدنش چیزی دربارهٔ کلیک‌های قبلی نمی‌گوید.
 */
function fastForward(steps: readonly TourStep[], from: number, pathname: string): number {
  let end = from;
  while (end < steps.length && steps[end]!.kind === 'click') end++;
  let best = from;
  let path: string | undefined;
  for (let k = 0; k <= from; k++) path = steps[k]!.path ?? path;
  for (let j = from + 1; j <= end && j < steps.length; j++) {
    const s = steps[j]!;
    path = s.path ?? path;
    const nav = !!s.advanceOnPath && !s.path;
    if (s.target && !nav && path && onPath(pathname, path) && onScreen(s.target)) best = j;
  }
  // تبی که همین الان انتخاب شده («روی تبِ دفترکل بزنید» وقتی دفترکل باز است) — حتی اگر محتوای تب هنوز چیزی
  // برای قدمِ بعد نشان ندهد (فهرستِ خالی).
  while (best < steps.length - 1 && steps[best]!.kind === 'click' && !steps[best]!.advanceOnPath && steps[best]!.target) {
    const e = onScreen(steps[best]!.target!);
    const on = e && (e.getAttribute('aria-selected') === 'true' || e.getAttribute('data-state') === 'active' || e.getAttribute('aria-current') === 'page');
    if (!on) break;
    best++;
  }
  return best;
}


/**
 * دادهٔ کاملِ راهنماها با import ِ پویا (۳.۱۹.۰): ~۳۳۰KB متنِ قدم‌ها پیش از این در بستهٔ JS ِ **هر** صفحه بود،
 * حتی برای کسی که هرگز راهنما باز نمی‌کند. حالا فقط هنگامِ شروعِ یکی — یک بار برای کلِ نشست.
 */
type Lib = typeof import('@/tours');
let libP: Promise<Lib> | null = null;
const loadLib = () => (libP ??= import('@/tours').catch((e) => { libP = null; throw e; }));

export function TourProvider({ ctx, catalog, initial, disabled, children }: {
  ctx: TourCtx;
  /** `catalogFor(ctx)` ِ سرور — همان `toursFor`، بی قدم‌ها. */
  catalog: TourMeta[];
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
  const [lib, setLib] = React.useState<Lib | null>(null);
  const stepsOf = React.useCallback((t: Tour) => t.steps.filter((s) => !s.when || s.when(ctx)), [ctx]);
  const available = catalog;
  const known = React.useCallback((id: string) => catalog.some((m) => m.id === id), [catalog]);
  // «راهنمای برنامه» باز شد: داده را از همین حالا بگیر تا «شروع» بی‌درنگ باشد.
  React.useEffect(() => { if (picker) loadLib().then(setLib, () => {}); }, [picker]);

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
    if (disabled) return;
    /*
     * ⚠️ جابه‌جاییِ قدم (فقط `active`) با تأخیرِ کوتاه و فقط آخرینش: هر «بعدی» یک server action بود و صفِ
     * مسیریابِ Next آن‌ها را پشتِ سرِ هم اجرا می‌کند — روی شبکهٔ کند کلیکِ ناوبری در قدمِ «کلیک» معطل می‌ماند.
     * تمام/رد/«بعداً» بی‌تأخیر می‌روند و قدمِ معلق را هم با خود می‌برند.
     */
    const onlyStep = Object.keys(patch).length === 1 && 'active' in patch && !!patch.active;
    if (pendingStep.current) clearTimeout(pendingStep.current.timer);
    if (onlyStep) {
      pendingStep.current = { patch, timer: setTimeout(() => { pendingStep.current = null; void saveTourStateAction(patch); }, 400) };
      return;
    }
    pendingStep.current = null;
    void saveTourStateAction(patch);
  }, [disabled]);
  const pendingStep = React.useRef<{ patch: TourPatch; timer: ReturnType<typeof setTimeout> } | null>(null);
  // بستنِ صفحه پیش از رسیدنِ تأخیر: قدمِ معلق گم نشود.
  React.useEffect(() => {
    const flush = () => { const p = pendingStep.current; if (p) { clearTimeout(p.timer); pendingStep.current = null; void saveTourStateAction(p.patch); } };
    window.addEventListener('pagehide', flush);
    return () => { window.removeEventListener('pagehide', flush); flush(); };
  }, []);

  /** آخرین درخواستِ شروع — اگر کاربر پیش از رسیدنِ داده راهنمای دیگری زد، فقط آخری باز شود. */
  const wantRef = React.useRef(0);
  /**
   * راهنمای در جریان «پشتِ سرِ هم» شروع شده (از «راهنمای بعدی» ِ کارتِ پایان)؟ فقط آن وقت قدم‌های تکراری رد
   * می‌شوند. ⚠️ شروع از «راهنمای برنامه» یا خودکار = از اول و کامل (خواستِ مالک: کسی که چند روز بعد برمی‌گردد
   * باید همهٔ راه را دوباره ببیند).
   */
  const chainRef = React.useRef(false);
  /**
   * `rewind`: زبان از روی کارت عوض شد وقتی پنجره/منویی باز بود (مثلاً قدمِ «بستن» ِ پنجرهٔ جستجو). با بارگذاریِ
   * دوباره آن پنجره بسته است و قدم‌های داخلش ناپیدا — پیش از این همه رد می‌شدند و راهنما یک‌راست «تمام» می‌شد.
   * حالا از آخرین قدمِ کلیکی که آن را باز می‌کند ادامه می‌دهد.
   */
  const start = React.useCallback(async (id: string, fromStep?: string, chain = false, rewind = false) => {
    if (!known(id)) return;
    const want = ++wantRef.current;
    let m: Lib;
    try { m = await loadLib(); } catch { return; }
    if (want !== wantRef.current) return;
    setLib(m);
    const t = m.tourById(id);
    if (!t) return;
    const steps = stepsOf(t);
    if (steps.length === 0) return;
    const here = window.location.pathname;
    let idx = fromStep ? Math.max(0, steps.findIndex((s) => s.id === fromStep))
      : chain ? fastForward(steps, arrivedAt(steps, here), here) : 0;
    if (rewind) {
      let j = idx;
      while (j > 0 && steps[j]!.kind !== 'click') j--;
      if (steps[j]!.kind === 'click') idx = j;
    }
    chainRef.current = chain;
    setFinished(null);
    setPicker(false);
    setActive({ id, idx });
    persist({ active: { id, step: steps[idx]!.id } });
  }, [known, stepsOf, persist]);

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
      if (s.active && known(s.active.id)) {
        let rewind = false;
        try { rewind = sessionStorage.getItem(RELOCALE_KEY) === '1'; sessionStorage.removeItem(RELOCALE_KEY); } catch { /* نه */ }
        void start(s.active.id, s.active.step, false, rewind);
        return;
      }
      // ⚠️ «بعداً» پیش از راهنمای فرستاده‌شده: وگرنه راهنمای مدیر با هر بارگذاری دوباره باز می‌شد و «تا فردا
      // باز نمی‌شود» دروغ بود. (فرستادنِ تازهٔ مدیر خودش «بعداً» را پاک می‌کند.)
      if (s.snoozeUntil && Date.parse(s.snoozeUntil) > Date.now()) return;
      const assigned = (s.assigned ?? []).find(known);
      if (assigned) { void start(assigned); return; }
      const welcome = available.find((t) => t.autoStart && !s.done?.[t.id]);
      if (welcome) void start(welcome.id);
    }, 1200);
    return () => clearTimeout(id);
  }, [disabled, initial, known, available, start]);

  const tour = active && lib ? lib.tourById(active.id) : null;
  const steps = tour ? stepsOf(tour) : [];
  const step: TourStep | null = active && steps[active.idx] ? steps[active.idx]! : null;

  const finish = React.useCallback((t: Tour, completed: boolean) => {
    setActive(null);
    persist({ done: { [t.id]: completed ? now() : `skipped:${now()}` }, unassign: t.id, active: null });
    if (completed) setFinished(t);
  }, [persist]);

  /** جهتِ آخرین جابه‌جایی — ردِ قدمِ ناپیدا هم همان سو برود. */
  const dirRef = React.useRef(1);
  const go = React.useCallback((delta: number) => {
    if (!active || !tour) return;
    dirRef.current = delta < 0 ? -1 : 1;
    let idx = active.idx + delta;
    if (idx < 0) return;
    // پشتِ سرِ هم: رسیدن به رشتهٔ کلیک‌های آماده‌سازی که نتیجه‌شان روی صفحه است (مثلاً بعد از کارتِ معرفی).
    if (delta > 0 && chainRef.current && idx < steps.length && steps[idx]!.kind === 'click') idx = fastForward(steps, idx, pathname);
    if (idx >= steps.length) { finish(tour, true); return; }
    setActive({ id: active.id, idx });
    persist({ active: { id: active.id, step: steps[idx]!.id } });
  }, [active, tour, steps, pathname, finish, persist]);

  /**
   * ردِ قدمِ اختیاریِ ناپیدا، همراهِ قدم‌های اختیاریِ پشتِ سرش که عنصرشان هم الان روی صفحه نیست — یک‌جا.
   * ⚠️ پیش از این هر کدام جدا صبر می‌کرد: تبِ «بازبینی‌ها» ِ پروژهٔ بی‌بازبینی ده قدمِ پشتِ سرِ هم داشت و کاربر
   * چند ثانیه صفحهٔ خالی می‌دید. قدمی که مسیرِ دیگری دارد یا هدف ندارد (کارتِ وسط) زنجیر را می‌شکند.
   */
  const skipMissing = React.useCallback(() => {
    if (!active || !tour) return;
    /*
     * ⚠️ «قبلی» روی قدمِ اختیاریِ ناپیدا (مثلاً «فهرستِ اعلان‌ها» وقتی منو بسته است): پیش از این رو به **جلو** رد
     * می‌شد و کاربر دوباره به همان قدمی برمی‌گشت که از آن «قبلی» زده بود — عقب رفتن ناممکن بود.
     */
    if (dirRef.current < 0) { go(active.idx > 0 ? -1 : 1); return; }
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
  // ⚠️ با «قبلی» روی قدمِ ناوبری‌ای که مسیرش همین صفحه است: رو به عقب ادامه — وگرنه فوراً دوباره جلو می‌رفت و
  // عقب رفتن از آن ممکن نبود.
  React.useEffect(() => {
    if (!active || step?.kind !== 'click' || !step.advanceOnPath || !onPath(pathname, step.advanceOnPath)) return;
    go(dirRef.current < 0 && active.idx > 0 ? -1 : 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, step, go]);

  /** «بعداً»: راهنما بسته می‌شود و تا فردا خودکار باز نمی‌شود؛ از فهرست همیشه در دسترس است. */
  const later = React.useCallback(() => {
    setActive(null);
    persist({ active: null, snoozeUntil: new Date(Date.now() + 86400000).toISOString() });
  }, [persist]);

  const api = React.useMemo<TourApi>(() => ({
    ctx, state, available, start: (id) => { void start(id); }, openPicker: () => setPicker(true), disabled,
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

  const suggestions = React.useMemo<TourMeta[]>(() => {
    if (!finished) return [];
    // فهرستِ سبکِ سرور همان مخاطبانِ این کاربر است؛ `next` ِ راهنمایی که برایش نیست خودبه‌خود کنار می‌رود.
    const fresh = (t: TourMeta | undefined): t is TourMeta => !!t && t.id !== finished.id && !state.done?.[t.id];
    const listed = (finished.next ?? []).map((id) => available.find((m) => m.id === id)).filter(fresh);
    if (listed.length) return listed;
    // راهنمایی که `next` ندارد هم به بعدی برسد: اولین راهنمای دیده‌نشدهٔ همین کاربر، به ترتیبِ فهرست —
    // وگرنه کارتِ پایان فقط «تمام» داشت و کاربر راهِ ادامه را نمی‌دید.
    const i = available.findIndex((t) => t.id === finished.id);
    const after = [...available.slice(i + 1), ...available.slice(0, Math.max(0, i))].find(fresh);
    return after ? [after] : [];
  }, [finished, state.done, available]);

  /*
   * صفحه‌خوان (۳.۱۹.۰): ناحیهٔ «زنده» ِ **ثابت** که هر قدم را می‌خواند. ⚠️ کارتِ راهنما برای هر قدم از نو ساخته
   * می‌شود و ناحیهٔ زنده‌ای که همراهِ محتوایش تازه به صفحه می‌آید را صفحه‌خوان‌ها معمولاً نمی‌خوانند.
   */
  const t = useT();
  const announce = tour && step
    ? `${t(tour.title)} — ${t('{n} از {total}', { n: active!.idx + 1, total: steps.length })}: ${t(step.title)}. ${t(step.body)}`
    : finished ? t('آفرین! این راهنما تمام شد.') : '';

  return (
    <TourCtxReact.Provider value={api}>
      {children}
      <div aria-live="polite" aria-atomic="true" className="sr-only">{announce}</div>
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
          onStart={(id) => {
            /*
             * ⚠️ راهنمای قبلی اغلب داخلِ یک دیالوگ (پنجرهٔ تسک…) تمام می‌شود. اگر راهنمای بعدی همان پنجره را لازم
             * دارد (عنصرش داخلِ آن دیده می‌شود)، باز می‌ماند و قدم‌های «بازش کنید» رد می‌شوند؛ وگرنه پنجره‌های باز
             * بسته می‌شوند (Esc ِ Radix) تا راهنمای بعدی «منتظر است» نماند.
             */
            const next = lib?.tourById(id);
            const ns = next ? stepsOf(next) : [];
            const here = window.location.pathname;
            const j = ns.length ? fastForward(ns, arrivedAt(ns, here), here) : 0;
            const keep = !!ns[j]?.target && !!onScreen(ns[j]!.target!)?.closest(LAYERS);
            if (!keep) for (let i = 0; i < 3; i++) document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
            void start(id, undefined, true);
          }}
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
