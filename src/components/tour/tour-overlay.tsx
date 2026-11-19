'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowRight, MousePointerClick, Sparkles, X } from 'lucide-react';
import { useT } from '@/i18n/client';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Tour, TourStep } from '@/tours/types';

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

function findTarget(name: string): HTMLElement | null {
  const els = [...document.querySelectorAll<HTMLElement>(`[data-tour="${CSS.escape(name)}"]`)];
  return els.find((e) => {
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden';
  }) ?? null;
}

type Rect = { top: number; left: number; width: number; height: number };
const stop = (e: React.SyntheticEvent) => { e.stopPropagation(); };
const block = (e: React.SyntheticEvent) => { e.stopPropagation(); e.preventDefault(); };

export function TourOverlay({
  tour, step, index, total, pathname, suggestions = [], onStart, onNext, onBack, onClose, onLater, onGo,
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
  onBack: () => void;
  onClose: () => void;
  onLater: () => void;
  onGo: (path: string) => void;
}) {
  const t = useT();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  const wrongPath = !!(step?.path && !pathname.startsWith(step.path));
  const [el, setEl] = React.useState<HTMLElement | null>(null);
  const [missing, setMissing] = React.useState(false);
  const [rect, setRect] = React.useState<Rect | null>(null);
  const cardRef = React.useRef<HTMLDivElement>(null);
  const [cardSize, setCardSize] = React.useState({ w: 340, h: 180 });

  // پیدا کردنِ عنصر — صفحه یا دیالوگ ممکن است هنوز در حالِ باز شدن باشد، پس تا ۶ ثانیه صبر.
  React.useEffect(() => {
    setEl(null); setMissing(false); setRect(null);
    if (!step?.target || wrongPath) return;
    let alive = true;
    const t0 = Date.now();
    const tick = () => {
      if (!alive) return;
      const found = findTarget(step.target!);
      if (found) {
        found.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
        setEl(found);
        return;
      }
      if (Date.now() - t0 > 6000) {
        if (step.optional) onNext(); else setMissing(true);
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
      if (!el.isConnected) {
        // عنصر رفت (مثلاً با کلیک صفحه عوض شد) — دوباره بگرد.
        const again = step?.target ? findTarget(step.target) : null;
        if (again && again !== el) { setEl(again); return; }
      }
      const r = el.getBoundingClientRect();
      setRect((p) => (p && p.top === r.top && p.left === r.left && p.width === r.width && p.height === r.height
        ? p : { top: r.top, left: r.left, width: r.width, height: r.height }));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [el, step?.target]);

  // قدمِ «کلیک»: کلیکِ کاربر روی خودِ عنصر راهنما را جلو می‌برد (مگر قدم با رسیدن به مسیر جلو برود).
  React.useEffect(() => {
    if (!el || step?.kind !== 'click') return;
    const onClick = (e: MouseEvent) => {
      if (!(e.target instanceof Node) || !el.contains(e.target)) return;
      if (!step.advanceOnPath) setTimeout(onNext, 80);
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [el, step, onNext]);

  React.useLayoutEffect(() => {
    const c = cardRef.current;
    // ⚠️ فقط با تغییرِ واقعی — شیءِ تازه در هر رندر حلقهٔ بی‌پایانِ رندر می‌ساخت.
    if (c) setCardSize((p) => (p.w === c.offsetWidth && p.h === c.offsetHeight ? p : { w: c.offsetWidth, h: c.offsetHeight }));
  });

  if (!mounted) return null;
  // در حالِ پیدا کردنِ عنصر (صفحه یا دیالوگ هنوز باز نشده): چیزی نکش — صفحهٔ تار بی‌کارت گیج‌کننده بود.
  if (step?.target && !wrongPath && !missing && !rect) return null;

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const hole = rect && !wrongPath && !missing
    ? { top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 }
    : null;

  // جای کارت: زیر، بالا، کنار، یا وسط.
  let pos: React.CSSProperties;
  if (hole) {
    const w = cardSize.w, h = cardSize.h;
    const left = Math.min(Math.max(12, hole.left + hole.width / 2 - w / 2), vw - w - 12);
    const below = hole.top + hole.height + GAP;
    const above = hole.top - GAP - h;
    const want = step?.placement;
    if ((want === 'bottom' || !want) && below + h < vh - 8) pos = { top: below, left };
    else if ((want === 'top' || !want) && above > 8) pos = { top: above, left };
    else if (below + h < vh - 8) pos = { top: below, left };
    else if (above > 8) pos = { top: above, left };
    else {
      // کنارِ عنصر (عنصرِ بلند، مثلاً سایدبار).
      const top = Math.min(Math.max(12, hole.top + hole.height / 2 - h / 2), vh - h - 12);
      const side = hole.left > vw - (hole.left + hole.width) ? hole.left - GAP - w : hole.left + hole.width + GAP;
      pos = { top, left: Math.min(Math.max(12, side), vw - w - 12) };
    }
  } else {
    pos = { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
  }

  const isClick = step?.kind === 'click' && !wrongPath && !missing && !!hole;
  const blur = 'bg-black/45 backdrop-blur-[3px]';

  const ui = (
    <div className="kz-tour" style={{ position: 'fixed', inset: 0, zIndex: Z, pointerEvents: 'none' }} dir={getComputedStyle(document.body).direction === 'ltr' ? 'ltr' : 'rtl'}>
      {/* پس‌زمینهٔ تار — چهار تکه دورِ عنصر، یا یکپارچه وقتی عنصری نیست. */}
      {hole ? (
        <>
          <div className={blur} style={{ position: 'fixed', top: 0, left: 0, right: 0, height: Math.max(0, hole.top), pointerEvents: 'auto' }} onPointerDown={block} onClick={block} />
          <div className={blur} style={{ position: 'fixed', top: hole.top + hole.height, left: 0, right: 0, bottom: 0, pointerEvents: 'auto' }} onPointerDown={block} onClick={block} />
          <div className={blur} style={{ position: 'fixed', top: hole.top, left: 0, width: Math.max(0, hole.left), height: hole.height, pointerEvents: 'auto' }} onPointerDown={block} onClick={block} />
          <div className={blur} style={{ position: 'fixed', top: hole.top, left: hole.left + hole.width, right: 0, height: hole.height, pointerEvents: 'auto' }} onPointerDown={block} onClick={block} />
          {/* حلقهٔ روشن؛ در قدمِ «دیدن» روی عنصر هم یک لایهٔ شفاف تا کلیک جایی نبرد. */}
          <div
            className={cn('rounded-xl ring-2 ring-primary transition-[top,left,width,height] duration-150', isClick && 'animate-pulse')}
            style={{ position: 'fixed', ...hole, boxShadow: '0 0 0 4px color-mix(in oklab, var(--primary) 25%, transparent)', pointerEvents: isClick ? 'none' : 'auto' }}
            onPointerDown={isClick ? undefined : block}
            onClick={isClick ? undefined : block}
          />
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
          className="kz-tour-card w-[min(340px,calc(100vw-24px))] rounded-2xl border bg-card p-4 text-card-foreground shadow-2xl"
          style={{ position: 'fixed', ...pos, pointerEvents: 'auto' }}
          onPointerDown={stop}
          onClick={stop}
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-1.5 text-[11px] font-medium text-primary">
              <Sparkles className="size-3.5 shrink-0" />
              <span className="truncate">{t(tour.title)}</span>
            </span>
            <span className="flex items-center gap-2">
              {step && total > 0 && <span className="num text-[11px] text-muted-foreground">{t('{n} از {total}', { n: index + 1, total })}</span>}
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
              {suggestions.length > 0 && (
                <div className="mt-3 grid gap-1.5">
                  {suggestions.map((s) => (
                    <Button key={s.id} type="button" variant="outline" size="sm" className="justify-start" onClick={() => onStart?.(s.id)}>
                      <Sparkles className="size-3.5" />{t(s.title)}
                    </Button>
                  ))}
                </div>
              )}
              <div className="mt-3 flex justify-end"><Button type="button" size="sm" onClick={onClose}>{t('تمام')}</Button></div>
            </>
          ) : wrongPath ? (
            <>
              <h3 className="text-sm font-bold">{t(step.title)}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{t('این قدم در صفحهٔ دیگری است. برویم آنجا؟')}</p>
              <div className="mt-3 flex items-center justify-between gap-2">
                <button type="button" onClick={onLater} className="text-xs text-muted-foreground hover:underline">{t('بعداً')}</button>
                <Button type="button" size="sm" onClick={() => onGo(step.path!)}>{t('برو به آنجا')}</Button>
              </div>
            </>
          ) : (
            <>
              <h3 className="text-sm font-bold">{t(step.title)}</h3>
              <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                {missing ? t('این بخش الان روی صفحه نیست؛ شاید برای نقشِ شما نیست یا هنوز داده‌ای ندارد. می‌توانید به قدمِ بعد بروید.') : t(step.body)}
              </p>
              {isClick && (
                <p className="mt-2 flex items-center gap-1.5 rounded-lg bg-primary/10 px-2.5 py-1.5 text-xs font-medium text-primary">
                  <MousePointerClick className="size-3.5 shrink-0" />{t('روی بخشِ روشن کلیک کنید.')}
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
                    <Button type="button" size="sm" onClick={onNext}>
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
