'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowRight, MousePointerClick, Pointer, Sparkles, X } from 'lucide-react';
import { useT } from '@/i18n/client';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { onPath, type Tour, type TourStep } from '@/tours/types';
import { LocaleSwitcher } from '@/components/locale-switcher';

/**
 * لایهٔ راهنما (۳.۱۹.۰): همه‌جا تار و تیره می‌شود جز عنصرِ قدم، با حلقهٔ روشن دورش و کارتِ توضیح کنارش.
 *
 * ⚠️ چهار مستطیلِ تار دورِ عنصر (نه یک لایه با سوراخ): backdrop-filter روی ماسک در همهٔ مرورگرها
 * درست کار نمی‌کند. همین مستطیل‌ها کلیکِ بیرون را هم می‌گیرند؛ پس در قدمِ «کلیک» کاربر فقط می‌تواند
 * روی بخشِ روشن بزند، و در قدمِ «دیدن» روی آن هم یک لایهٔ شفاف است تا ناخواسته جایی نرود.
 * ⚠️ کارت و مستطیل‌ها pointerdown را بالا نمی‌فرستند: دیالوگ‌های Radix با کلیکِ «بیرون» بسته می‌شوند و
 * زدنِ «بعدی» دیالوگی را که خودِ راهنما باز کرده بود می‌بست.
 */
const Z = 2147483000;
const PAD = 6;
const GAP = 12;

const visible = (e: HTMLElement) => {
  const r = e.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden';
};
function findTarget(name: string): HTMLElement | null {
  return [...document.querySelectorAll<HTMLElement>(`[data-tour="${CSS.escape(name)}"]`)].find(visible) ?? null;
}
/**
 * عنصری که هدف را «در خود دارد» ولی هنوز نشانش نمی‌دهد — مثلاً دکمهٔ «بیشتر» ِ نوارِ تب که تبِ پنهان را
 * در منویش دارد (`data-tour-holds`). موتور اول این را روشن می‌کند؛ با باز شدنش هدفِ واقعی پیدا می‌شود.
 */
function findHolder(name: string): HTMLElement | null {
  const exact = [...document.querySelectorAll<HTMLElement>('[data-tour-holds]')]
    .find((e) => (e.dataset.tourHolds ?? '').split(' ').includes(name) && visible(e));
  if (exact) return exact;
  // کشوی منوی گوشی: هر هدفی با این پیشوندها (nav-، sidebar-، user-menu…) داخلِ آن است.
  return [...document.querySelectorAll<HTMLElement>('[data-tour-holds-prefix]')]
    .find((e) => (e.dataset.tourHoldsPrefix ?? '').split(' ').some((p) => p && name.startsWith(p)) && visible(e)) ?? null;
}

/** لایه‌های رویِ صفحه: دیالوگ، منو، فهرستِ انتخاب (Radix همه را با data-state=open نشان می‌دهد). */
const LAYERS = '[role="dialog"][data-state="open"],[role="alertdialog"][data-state="open"],[role="menu"][data-state="open"],[role="listbox"][data-state="open"]';
/**
 * پنجره یا منویی باز است که به این قدم ربطی ندارد و **رویِ** هدف است؟ (۳.۱۹.۰)
 * ⚠️ پیش از این راهنما بی‌توجه ادامه می‌داد: سایهٔ دیالوگ کارتِ روشن را کم‌رنگ می‌کرد و فهرستِ دیالوگ وسطِ قابِ
 * روشن می‌افتاد (کارتِ «ظرفیتِ تیم» با «جزئیاتِ رویداد» ِ باز).
 * «رویِ هدف» = لایه‌ای که هدف را در خود ندارد و در DOM بعد از لایهٔ خودِ هدف آمده (پورتال‌ها به ترتیبِ باز شدن
 * به انتهای body اضافه می‌شوند)؛ پس دیالوگِ پدر در دیالوگ‌های تودرتو «بیگانه» حساب نمی‌شود.
 */
function foreignLayer(target: HTMLElement): HTMLElement | null {
  const own = target.closest<HTMLElement>(LAYERS);
  return [...document.querySelectorAll<HTMLElement>(LAYERS)].find((l) =>
    !l.closest('.kz-tour, .kz-tour-layer') && !l.contains(target) && visible(l)
    && (!own || !!(own.compareDocumentPosition(l) & Node.DOCUMENT_POSITION_FOLLOWING))) ?? null;
}

/**
 * جای قابِ روشنِ قدمِ قبلی — تا قاب از آنجا به جای تازه **بلغزد** (۳.۱۹.۰، خواستِ مالک: «انیمیشنِ کوچک برای
 * نشان دادنِ راهنما و منوها»). بیرونِ کامپوننت چون لایه برای هر قدم از نو ساخته می‌شود.
 */
let lastHole: { top: number; left: number; width: number; height: number } | null = null;
/** پویانمایی‌ها؛ با «کاهشِ حرکت» ِ سیستم خاموش می‌شوند. */
const TOUR_CSS = `
@keyframes kz-tour-glow { 0%,100% { box-shadow: 0 0 0 4px color-mix(in oklab, var(--primary) 30%, transparent), 0 0 18px 2px color-mix(in oklab, var(--primary) 45%, transparent); } 50% { box-shadow: 0 0 0 7px color-mix(in oklab, var(--primary) 18%, transparent), 0 0 28px 6px color-mix(in oklab, var(--primary) 60%, transparent); } }
@keyframes kz-tour-tap { 0%,100% { transform: translate(-30%, -10%) scale(1); } 50% { transform: translate(-30%, -10%) scale(.82); } }
@keyframes kz-tour-ripple { 0% { transform: translate(-50%,-50%) scale(.4); opacity: .7; } 100% { transform: translate(-50%,-50%) scale(2.2); opacity: 0; } }
@keyframes kz-tour-in { from { opacity: 0; transform: translateY(8px) scale(.97); } to { opacity: 1; transform: none; } }
.kz-tour-glow { animation: kz-tour-glow 1.6s ease-in-out infinite; }
.kz-tour-tap { animation: kz-tour-tap 1.1s ease-in-out infinite; }
.kz-tour-ripple { animation: kz-tour-ripple 1.1s ease-out infinite; }
.kz-tour-in { animation: kz-tour-in .28s cubic-bezier(.2,.8,.2,1) both; }
.kz-tour-glide { transition: top .38s cubic-bezier(.2,.8,.2,1), left .38s cubic-bezier(.2,.8,.2,1), width .38s cubic-bezier(.2,.8,.2,1), height .38s cubic-bezier(.2,.8,.2,1); }
@media (prefers-reduced-motion: reduce) { .kz-tour-glow, .kz-tour-tap, .kz-tour-ripple, .kz-tour-in { animation: none; } .kz-tour-glide { transition: none; } }
`;

/** زمانِ آخرین عوض شدنِ مسیر — بیرونِ کامپوننت، چون لایه برای هر قدم از نو ساخته می‌شود. */
const lastNav = { path: '', at: 0, click: 0 };
/** «کاهشِ حرکت» ِ سیستم — اسکرولِ نرم هم مثلِ پویانمایی‌های CSS خاموش شود. */
const smooth = (): ScrollBehavior =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
// کلیکِ تازه هم یعنی «صفحه هنوز ننشسته» (دیالوگی که با کلیک باز شد شاید هنوز داده می‌گیرد).
if (typeof document !== 'undefined') document.addEventListener('pointerdown', () => { lastNav.click = Date.now(); }, true);

type Rect = { top: number; left: number; width: number; height: number };
const stop = (e: React.SyntheticEvent) => { e.stopPropagation(); };
const block = (e: React.SyntheticEvent) => { e.stopPropagation(); e.preventDefault(); };

export function TourOverlay({
  tour, step, index, total, pathname, suggestions = [], onStart, onNext, onSkip, onBack, onClose, onLater, onGo,
}: {
  tour: Tour;
  /** null = کارتِ پایانِ راهنما. */
  step: TourStep | null;
  index: number;
  total: number;
  pathname: string;
  suggestions?: Tour[];
  onStart?: (id: string) => void;
  onNext: () => void;
  /** ردِ قدمِ اختیاریِ ناپیدا (و اختیاری‌های ناپیدای پشتِ سرش، یک‌جا) — نبودن = همان onNext. */
  onSkip?: () => void;
  onBack: () => void;
  onClose: () => void;
  onLater: () => void;
  onGo: (path: string) => void;
}) {
  const t = useT();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  if (lastNav.path !== pathname) { lastNav.path = pathname; lastNav.at = Date.now(); }
  const wrongPath = !!(step?.path && !onPath(pathname, step.path));
  /**
   * قدمِ «صفحهٔ یک مورد» ('/library/') و کاربر آنجا نیست: نشانیِ مشخصی برای «برو به آنجا» نداریم
   * (مثلاً فهرست خالی بود و قدمِ اختیاریِ «یکی را باز کنید» رد شد). ⚠️ پیش از این «برو به آنجا» به
   * '/library/' می‌رفت، Next آن را به فهرست برمی‌گرداند و راهنما برای همیشه گیر می‌کرد.
   */
  const noDest = wrongPath && step!.path!.endsWith('/');
  // قدمِ اختیاری بی‌صدا رد می‌شود — با کمی مکث، چون ممکن است صفحه هنوز در حالِ عوض شدن باشد.
  React.useEffect(() => {
    if (!noDest || !step?.optional) return;
    const id = setTimeout(onSkip ?? onNext, 1500);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noDest, step?.id]);
  const [el, setEl] = React.useState<HTMLElement | null>(null);
  /** el فقط نگهدارنده است (مثلاً «بیشتر»)، نه خودِ هدف. */
  const [viaHolder, setViaHolder] = React.useState(false);
  const [missing, setMissing] = React.useState(false);
  const [rect, setRect] = React.useState<Rect | null>(null);
  const cardRef = React.useRef<HTMLDivElement>(null);
  const [cardSize, setCardSize] = React.useState({ w: 340, h: 180 });

  // پیدا کردنِ عنصر — صفحه یا دیالوگ ممکن است هنوز در حالِ باز شدن باشد، پس تا ۶ ثانیه صبر.
  React.useEffect(() => {
    setEl(null); setMissing(false); setRect(null); setViaHolder(false);
    if (!step?.target || wrongPath) return;
    let alive = true;
    let holding: HTMLElement | null = null;
    const t0 = Date.now();
    const tick = () => {
      if (!alive) return;
      const found = findTarget(step.target!);
      if (found) {
        // ⚠️ عنصرِ داخلِ منو/دیالوگ (لایهٔ ثابت) صفحه را اسکرول نکند: منوی «بیشتر» به دکمه‌اش چسبیده است و با
        // اسکرولِ صفحه بالا می‌رفت و از دید بیرون می‌شد — کاربر منو را گم می‌کرد و کلیکش جای دیگری می‌نشست.
        // در لایه فقط «nearest»: اگر در دیدِ صفحه است چیزی تکان نمی‌خورد، و اگر پایینِ اسکرولِ خودِ دیالوگ است همان جلو می‌آید.
        found.scrollIntoView(found.closest(LAYERS)
          ? { block: 'nearest', inline: 'nearest' }
          : { block: 'center', inline: 'nearest', behavior: smooth() });
        setViaHolder(false);
        setEl(found);
        return;
      }
      const holder = findHolder(step.target!);
      if (holder) {
        // هدف زیرِ «بیشتر» است: آن را روشن کن و منتظرِ باز شدنش بمان (بی‌سقفِ زمان).
        if (holder !== holding) { holding = holder; holder.scrollIntoView({ block: 'center', inline: 'nearest', behavior: smooth() }); setViaHolder(true); setEl(holder); }
        setTimeout(tick, 200);
        return;
      }
      // هدف‌های اختیاری زودتر رها می‌شوند تا کاربری که آن بخش را ندارد منتظر نماند.
      // ⚠️ اگر صفحه از قبل نشسته است (قدمِ قبلی هم همین‌جا بود)، فقط کمی صبر: چند قدمِ اختیاریِ پشتِ سرِ هم روی
      // فهرستِ خالی (مثلاً «جلسات» بی جلسه) هر کدام ۲٫۵ ثانیه صفحهٔ خالی نشان می‌داد — ۱۵ ثانیه انتظارِ بی‌نشان.
      const settled = Date.now() - Math.max(lastNav.at, lastNav.click) > 2000;
      if (Date.now() - t0 > (step.optional ? (settled ? 700 : 2500) : 6000)) {
        if (step.optional) (onSkip ?? onNext)(); else setMissing(true);
        return;
      }
      setTimeout(tick, 150);
    };
    tick();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step?.id, step?.target, wrongPath]);

  // دنبال کردنِ جای عنصر (اسکرول، باز شدنِ دیالوگ، تغییرِ اندازه).
  React.useEffect(() => {
    if (!el) return;
    let raf = 0;
    const loop = () => {
      // عنصر رفت (با کلیک صفحه عوض شد) یا دیگر دیده نمی‌شود — دوباره بگرد.
      // ⚠️ «دیده نمی‌شود» هم: با عوض شدنِ پهنای پنجره (چرخاندنِ گوشی) منوی پایینِ گوشی پنهان و سایدبار پیدا
      // می‌شود؛ راهنما به نسخهٔ پنهان (اندازهٔ صفر) چسبیده می‌ماند و قاب و دست گوشهٔ بالای صفحه می‌نشستند.
      if (!el.isConnected || !visible(el)) {
        const again = step?.target ? findTarget(step.target) : null;
        if (again && again !== el) { setEl(again); return; }
      }
      const r = el.getBoundingClientRect();
      setRect((p) => (p && p.top === r.top && p.left === r.left && p.width === r.width && p.height === r.height
        ? p : { top: r.top, left: r.left, width: r.width, height: r.height }));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    // ⚠️ در زبانهٔ پنهان requestAnimationFrame متوقف است؛ زمان‌سنجِ پشتیبان جای عنصر را باز هم به‌روز می‌کند.
    const iv = setInterval(() => {
      if (!el.isConnected || !visible(el)) {
        const again = step?.target ? findTarget(step.target) : null;
        if (again && again !== el) setEl(again);
        return;
      }
      const r = el.getBoundingClientRect();
      setRect((p) => (p && p.top === r.top && p.left === r.left && p.width === r.width && p.height === r.height
        ? p : { top: r.top, left: r.left, width: r.width, height: r.height }));
    }, 250);
    return () => { cancelAnimationFrame(raf); clearInterval(iv); };
  }, [el, step?.target]);

  /*
   * قدمِ «کلیک»: کلیکِ کاربر روی خودِ عنصر راهنما را جلو می‌برد (مگر قدم با رسیدن به مسیر جلو برود).
   * ⚠️ منوهای کشوییِ Radix با **pointerdown** باز می‌شوند و بلافاصله pointer-events ِ body را می‌بندند؛
   * پس رویدادِ click اغلب به خودِ دکمه نمی‌رسد و راهنما گیر می‌کرد (زنگولهٔ اعلان‌ها). حالا پس از
   * pointerdown اگر دکمه «باز» شد (aria-expanded / data-state=open) هم جلو می‌رود؛ `done` جلوی دوبار رفتن را می‌گیرد.
   */
  React.useEffect(() => {
    if (!el || viaHolder || step?.kind !== 'click' || step.advanceOnPath) return;
    let done = false;
    const advance = () => { if (!done) { done = true; setTimeout(onNext, 80); } };
    // ⚠️ با خودِ برچسب، نه فقط `el`: React ممکن است دکمه را دوباره بسازد و `el` گرهٔ کهنهٔ جداشده بماند —
    // کلیکِ کاربر روی دکمهٔ تازه دیده نمی‌شد و راهنما گیر می‌کرد («فهرستِ کارت‌ها»).
    const sel = `[data-tour="${CSS.escape(step.target!)}"]`;
    const inside = (e: Event) => e.target instanceof Element && (el.contains(e.target) || !!e.target.closest(sel));
    const onClick = (e: MouseEvent) => { if (inside(e)) advance(); };
    const onDown = (e: PointerEvent) => {
      if (!inside(e)) return;
      setTimeout(() => {
        const cur = el.isConnected ? el : (document.querySelector<HTMLElement>(sel) ?? el);
        const opened = cur.getAttribute('aria-expanded') === 'true' || cur.getAttribute('data-state') === 'open'
          || !!cur.querySelector('[aria-expanded="true"],[data-state="open"]');
        if (opened) advance();
      }, 250);
    };
    document.addEventListener('click', onClick, true);
    document.addEventListener('pointerdown', onDown, true);
    return () => {
      done = true;
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('pointerdown', onDown, true);
    };
  }, [el, viaHolder, step, onNext]);

  /**
   * لغزیدنِ قاب: تا عنصر پیدا شد، یک فریم با جای قبلی کشیده می‌شود و بعد به جای تازه می‌رود (با transition).
   * ⚠️ transition فقط در همین ۴۵۰ میلی‌ثانیه — وگرنه قاب هنگامِ اسکرول از عنصر عقب می‌ماند.
   */
  const [glide, setGlide] = React.useState<'from' | 'moving' | 'done'>(lastHole ? 'from' : 'done');
  const hasRect = !!rect;
  React.useEffect(() => {
    if (!hasRect || glide !== 'from') return;
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => setGlide('moving')));
    // پشتیبان: در زبانهٔ پنهان rAF نمی‌چرخد.
    const t1 = setTimeout(() => setGlide((g) => (g === 'from' ? 'moving' : g)), 60);
    const t2 = setTimeout(() => setGlide('done'), 450);
    return () => { cancelAnimationFrame(raf); clearTimeout(t1); clearTimeout(t2); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasRect]);

  // پنجرهٔ بی‌ربطِ باز: راهنما کنار می‌رود و با بسته شدنش از همان قدم ادامه می‌دهد (خودکار نمی‌بندیم — شاید
  // کاربر وسطِ نوشتن باشد).
  const [paused, setPaused] = React.useState(false);
  React.useEffect(() => {
    if (!el) { setPaused(false); return; }
    const check = () => setPaused(!!foreignLayer(el.isConnected ? el : (step?.target ? findTarget(step.target) ?? el : el)));
    check();
    const iv = setInterval(check, 250);
    return () => clearInterval(iv);
  }, [el, step?.target]);

  /**
   * کیبورد (بازبینیِ ۳.۱۹.۰): Esc = «بعداً»، و فوکوس روی دکمهٔ اصلیِ کارت تا Enter/Space جلو ببرد.
   * ⚠️ وقتی دیالوگ یا منویی باز است هیچ‌کدام: Esc مالِ همان پنجره است، و بردنِ فوکوس بیرون از دیالوگِ Radix
   * آن را می‌بندد (دیالوگی که خودِ راهنما باز کرده بود).
   */
  const laterRef = React.useRef(onLater);
  laterRef.current = onLater;
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || document.querySelector(LAYERS)) return;
      e.preventDefault();
      laterRef.current();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  const cardShown = !!cardRef.current;
  React.useEffect(() => {
    if (!cardShown || document.querySelector(LAYERS)) return;
    const b = cardRef.current?.querySelector<HTMLElement>('[data-tour-primary]');
    b?.focus({ preventScroll: true });
  }, [cardShown, step?.id]);

  React.useLayoutEffect(() => {
    const c = cardRef.current;
    // ⚠️ فقط با تغییرِ واقعی — شیءِ تازه در هر رندر حلقهٔ بی‌پایانِ رندر می‌ساخت.
    if (c) setCardSize((p) => (p.w === c.offsetWidth && p.h === c.offsetHeight ? p : { w: c.offsetWidth, h: c.offsetHeight }));
  });

  if (!mounted) return null;
  if (noDest && step?.optional) return null;
  // در حالِ پیدا کردنِ عنصر (صفحه یا دیالوگ هنوز باز نشده): چیزی نکش — صفحهٔ تار بی‌کارت گیج‌کننده بود.
  if (step?.target && !wrongPath && !missing && !rect) return null;
  if (paused && !wrongPath && !missing) {
    // ⚠️ بی stopPropagation: کلیک روی این نوار «بیرونِ» دیالوگ است و Radix آن را می‌بندد — همان چیزی که می‌خواهیم.
    return createPortal(
      <div
        className="kz-tour fixed inset-x-0 bottom-4 flex justify-center px-4"
        style={{ zIndex: Z, pointerEvents: 'none' }}
      >
        <div role="status" className="flex items-center gap-2 rounded-full border bg-card px-4 py-2 text-xs text-muted-foreground shadow-lg" style={{ pointerEvents: 'auto' }}>
          <Sparkles className="size-3.5 shrink-0 text-primary" />
          {t('راهنما منتظر است؛ این پنجره را ببندید تا ادامه دهیم.')}
        </div>
      </div>,
      document.body,
    );
  }

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const realHole = rect && !wrongPath && !missing
    ? { top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 }
    : null;
  // فریمِ اولِ قدم با جای قبلی، بعد جای واقعی (لغزیدن).
  const hole = realHole && glide === 'from' && lastHole ? lastHole : realHole;
  if (realHole) lastHole = realHole;
  const glideCls = glide === 'done' ? undefined : 'kz-tour-glide';
  // جای کارت از جای واقعیِ عنصر، نه جای لغزان.
  const anchor = realHole;

  // جای کارت: زیر، بالا، کنار، یا وسط.
  let pos: React.CSSProperties;
  if (anchor) {
    const w = cardSize.w, h = cardSize.h;
    const left = Math.min(Math.max(12, anchor.left + anchor.width / 2 - w / 2), vw - w - 12);
    const below = anchor.top + anchor.height + GAP;
    const above = anchor.top - GAP - h;
    const want = step?.placement;
    if ((want === 'bottom' || !want) && below + h < vh - 8) pos = { top: below, left };
    else if ((want === 'top' || !want) && above > 8) pos = { top: above, left };
    else if (below + h < vh - 8) pos = { top: below, left };
    else if (above > 8) pos = { top: above, left };
    else {
      // کنارِ عنصر (عنصرِ بلند، مثلاً سایدبار).
      const top = Math.min(Math.max(12, anchor.top + anchor.height / 2 - h / 2), vh - h - 12);
      const side = anchor.left > vw - (anchor.left + anchor.width) ? anchor.left - GAP - w : anchor.left + anchor.width + GAP;
      pos = { top, left: Math.min(Math.max(12, side), vw - w - 12) };
    }
  } else {
    // ⚠️ `translate` نه `transform`: پویانماییِ ورودِ کارت transform را می‌گیرد و وسط‌چینی را به هم می‌زد.
    pos = { top: '50%', left: '50%', translate: '-50% -50%' };
  }

  // ⚠️ دکمهٔ غیرفعال (مثلاً «افزودنِ مقصد» پیش از آماده شدنِ کلیدِ پشتیبان): قدمِ «کلیک» کاربر را گیر می‌انداخت.
  const disabled = !!el && !viaHolder && (el.matches(':disabled') || el.getAttribute('aria-disabled') === 'true');
  const isClick = (step?.kind === 'click' || viaHolder) && !wrongPath && !missing && !!hole && !disabled;
  const blur = 'bg-black/45 backdrop-blur-[3px]';

  const ui = (
    <div className="kz-tour" style={{ position: 'fixed', inset: 0, zIndex: Z, pointerEvents: 'none' }} dir={getComputedStyle(document.body).direction === 'ltr' ? 'ltr' : 'rtl'}>
      <style>{TOUR_CSS}</style>
      {/* پس‌زمینهٔ تار — چهار تکه دورِ عنصر، یا یکپارچه وقتی عنصری نیست. */}
      {hole ? (
        <>
          <div className={cn(blur, glideCls)} style={{ position: 'fixed', top: 0, left: 0, right: 0, height: Math.max(0, hole.top), pointerEvents: 'auto' }} onPointerDown={block} onClick={block} />
          <div className={cn(blur, glideCls)} style={{ position: 'fixed', top: hole.top + hole.height, left: 0, right: 0, bottom: 0, pointerEvents: 'auto' }} onPointerDown={block} onClick={block} />
          <div className={cn(blur, glideCls)} style={{ position: 'fixed', top: hole.top, left: 0, width: Math.max(0, hole.left), height: hole.height, pointerEvents: 'auto' }} onPointerDown={block} onClick={block} />
          <div className={cn(blur, glideCls)} style={{ position: 'fixed', top: hole.top, left: hole.left + hole.width, right: 0, height: hole.height, pointerEvents: 'auto' }} onPointerDown={block} onClick={block} />
          {/* حلقهٔ روشن؛ در قدمِ «دیدن» روی عنصر هم یک لایهٔ شفاف تا کلیک جایی نبرد. */}
          <div
            className={cn('rounded-xl ring-2 ring-primary', glideCls, isClick && 'kz-tour-glow ring-[3px]')}
            style={{ position: 'fixed', ...hole, boxShadow: isClick ? undefined : '0 0 0 4px color-mix(in oklab, var(--primary) 25%, transparent)', pointerEvents: isClick ? 'none' : 'auto' }}
            onPointerDown={isClick ? undefined : block}
            onClick={isClick ? undefined : block}
          />
          {/*
            قدمِ «کلیک»: دستِ متحرک و موج درست روی جای کلیک — «روی بخشِ روشن کلیک کنید» برای کاربر گنگ بود
            (کدام بخش؟). وسطِ عنصرهای کوچک؛ برای عنصرِ بزرگ (کارت) نزدیکِ گوشهٔ آغازین تا روی متن ننشیند.
          */}
          {isClick && glide !== 'from' && (() => {
            const big = hole.width > 220 || hole.height > 90;
            const rtl = getComputedStyle(document.body).direction !== 'ltr';
            const x = big ? (rtl ? hole.left + hole.width - 48 : hole.left + 48) : hole.left + hole.width / 2;
            const y = big ? hole.top + 34 : hole.top + hole.height / 2;
            return (
              <div aria-hidden style={{ position: 'fixed', left: x, top: y, pointerEvents: 'none' }}>
                <span className="kz-tour-ripple absolute size-9 rounded-full bg-primary/40" style={{ left: 0, top: 0 }} />
                <Pointer className="kz-tour-tap absolute size-7 fill-background text-primary drop-shadow-md" style={{ left: 0, top: 0 }} />
              </div>
            );
          })()}
        </>
      ) : (
        <div className={blur} style={{ position: 'fixed', inset: 0, pointerEvents: 'auto' }} onPointerDown={block} onClick={block} />
      )}

      {/* کارتِ توضیح — تا عنصر پیدا نشده (و قدم عنصر دارد) نشان داده نمی‌شود. */}
      {(hole || !step?.target || wrongPath || missing || !step) && (
        <div
          ref={cardRef}
          role="dialog"
          aria-live="polite"
          aria-label={step ? t(step.title) : t(tour.title)}
          // ⚠️ سقفِ ارتفاع: متنِ بلند (آلمانی/فرانسوی) روی گوشیِ افقی از قاب بیرون می‌زد و دکمه‌ها دیده نمی‌شدند.
          className="kz-tour-card kz-tour-in max-h-[calc(100dvh-24px)] w-[min(340px,calc(100vw-24px))] overflow-y-auto rounded-2xl border bg-card p-4 text-card-foreground shadow-2xl"
          style={{ position: 'fixed', ...pos, pointerEvents: 'auto' }}
          onPointerDown={stop}
          onClick={stop}
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-1.5 text-[11px] font-medium text-primary">
              <Sparkles className="size-3.5 shrink-0" />
              <span className="truncate">{t(tour.title)}</span>
            </span>
            <span className="flex items-center gap-1">
              {/* زبان همین‌جا: کسی که راهنما را به زبانِ نادرست می‌بیند نباید دنبالِ منوی کاربر بگردد. */}
              <LocaleSwitcher compact inTour className="h-6 px-1.5" />
              {step && total > 0 && <span className="text-[11px] tabular-nums text-muted-foreground">{t('{n} از {total}', { n: index + 1, total })}</span>}
              <button type="button" onClick={onClose} aria-label={t('بستنِ راهنما')} className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground">
                <X className="size-4" />
              </button>
            </span>
          </div>

          {!step ? (
            <>
              <h3 className="text-sm font-bold">{t('آفرین! این راهنما تمام شد.')}</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {suggestions.length ? t('راهنمای بعدی را شروع کنید یا هر وقت خواستید از منوی کاربر ← «راهنمای برنامه» ببینید.') : t('هر وقت خواستید، همهٔ راهنماها در منوی کاربر ← «راهنمای برنامه» هستند.')}
              </p>
              {/*
                ⚠️ راهنمای بعدی دکمهٔ **اصلی** است و «تمام» کم‌رنگ: پیش از این «تمام» پررنگ بود و پیشنهادها
                دکمه‌های کم‌رنگ — کاربر فقط «تمام» را می‌زد و نمی‌فهمید می‌شود راهنمای بعدی را دید (خواستِ مالک).
              */}
              {suggestions.length > 0 && (
                <div className="mt-3 grid gap-1.5">
                  <Button type="button" data-tour-primary className="kz-tour-glow h-auto min-h-9 justify-between gap-2 whitespace-normal py-2 text-start" onClick={() => onStart?.(suggestions[0]!.id)}>
                    <span className="flex min-w-0 flex-col items-start">
                      <span className="text-[11px] font-normal opacity-80">{t('راهنمای بعدی')}</span>
                      <span className="font-semibold">{t(suggestions[0]!.title)}</span>
                    </span>
                    <ArrowLeft className="size-4 shrink-0 ltr:rotate-180" />
                  </Button>
                  {suggestions.slice(1).map((s) => (
                    <Button key={s.id} type="button" variant="outline" size="sm" className="justify-start" onClick={() => onStart?.(s.id)}>
                      <Sparkles className="size-3.5" />{t(s.title)}
                    </Button>
                  ))}
                </div>
              )}
              <div className="mt-3 flex justify-end">
                {suggestions.length > 0
                  ? <Button type="button" size="sm" variant="ghost" className="text-muted-foreground" onClick={onClose}>{t('فعلاً بس است')}</Button>
                  : <Button type="button" size="sm" data-tour-primary onClick={onClose}>{t('تمام')}</Button>}
              </div>
            </>
          ) : noDest ? (
            step.optional ? null : (
              <>
                <h3 className="text-sm font-bold">{t(step.title)}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{t('این قدم در صفحهٔ یک موردِ مشخص است؛ اول یکی را باز کنید.')}</p>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <button type="button" onClick={onLater} className="text-xs text-muted-foreground hover:underline">{t('بعداً')}</button>
                  <span className="flex items-center gap-2">
                    <Button type="button" size="sm" variant="ghost" onClick={onBack}>{t('قبلی')}</Button>
                    <Button type="button" size="sm" onClick={onNext}>{t('رد شدن')}</Button>
                  </span>
                </div>
              </>
            )
          ) : wrongPath ? (
            <>
              <h3 className="text-sm font-bold">{t(step.title)}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{t('این قدم در صفحهٔ دیگری است. برویم آنجا؟')}</p>
              <div className="mt-3 flex items-center justify-between gap-2">
                <button type="button" onClick={onLater} className="text-xs text-muted-foreground hover:underline">{t('بعداً')}</button>
                <Button type="button" size="sm" data-tour-primary onClick={() => onGo(step.path!)}>{t('برو به آنجا')}</Button>
              </div>
            </>
          ) : (
            <>
              <h3 className="text-sm font-bold">{t(step.title)}</h3>
              <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                {missing ? t('این بخش الان روی صفحه نیست؛ شاید برای نقشِ شما نیست یا هنوز داده‌ای ندارد. می‌توانید به قدمِ بعد بروید.') : t(step.body)}
              </p>
              {disabled && step.kind === 'click' && !missing && (
                <p className="mt-2 rounded-lg bg-muted px-2.5 py-1.5 text-xs text-muted-foreground">
                  {t('این دکمه الان غیرفعال است؛ به قدمِ بعد بروید.')}
                </p>
              )}
              {isClick && (
                <p className="mt-2 flex items-center gap-1.5 rounded-lg bg-primary/10 px-2.5 py-1.5 text-xs font-medium text-primary">
                  <MousePointerClick className="size-3.5 shrink-0" />
                  {viaHolder ? t('این بخش زیرِ «بیشتر» است؛ اول آن را باز کنید.') : t('روی همان‌جایی بزنید که دستِ متحرک نشان می‌دهد.')}
                </p>
              )}
              <div className="mt-3 flex items-center justify-between gap-2">
                <button type="button" onClick={onLater} className="text-xs text-muted-foreground hover:underline">{t('بعداً')}</button>
                <span className="flex items-center gap-1.5">
                  {index > 0 && (
                    <Button type="button" variant="ghost" size="sm" onClick={onBack}>
                      <ArrowRight className="size-3.5 ltr:rotate-180" />{t('قبلی')}
                    </Button>
                  )}
                  {isClick ? (
                    <button type="button" onClick={onNext} className="text-xs text-muted-foreground hover:underline">{t('رد شدن')}</button>
                  ) : (
                    <Button type="button" size="sm" data-tour-primary onClick={onNext}>
                      {index + 1 >= total ? t('تمام') : t('بعدی')}<ArrowLeft className="size-3.5 ltr:rotate-180" />
                    </Button>
                  )}
                </span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
  return createPortal(ui, document.body);
}
