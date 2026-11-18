'use client';

import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { useT } from '@/i18n/client';
import { cn } from '@/lib/utils';

/**
 * فهرستِ جمع‌شونده (۳.۸.۰) — کارت‌های داشبورد (ریسک و نیازمندِ توجه) بلند نشوند.
 *
 * چند موردِ اول دیده می‌شوند، ردیفِ بعدی زیرِ یک محوشدگیِ نرم (mask + کمی blur) پیدا
 * می‌ماند تا معلوم باشد ادامه دارد، و «مشاهدهٔ بیشتر» قاب را با حرکتِ نرم باز می‌کند.
 *
 * ⚠️ همهٔ ردیف‌ها همیشه رندر می‌شوند (فقط ارتفاع بریده می‌شود)، نه slice: لینک‌ها برای
 * جستجوی صفحه و صفحه‌خوان هم هستند و باز شدن بی رفت‌وبرگشت به سرور است.
 * ⚠️ ارتفاعِ بسته از خودِ ردیف‌ها سنجیده می‌شود (پایینِ ردیفِ limit+۱)، پس با فونت، زبان
 * و ردیفِ دوخطی هم درست است. سنجش با getBoundingClientRect است، نه offsetTop: offsetParent ِ
 * ردیف و فهرست همیشه یکی نیست و قابِ بسته گاهی تا ته باز می‌ماند.
 *
 * حالتِ «درجا» (`inPlace`، شبکهٔ داشبورد): «مشاهدهٔ بیشتر» کارت را بلند **نمی‌کند** — اسکرولِ
 * داخلی را روشن می‌کند و فهرست را نرم تا ردیف‌های پنهان می‌برد، تا چیدمانِ کارت‌های کناری به هم نریزد.
 * در هر لحظه فقط یک فهرستِ درجا باز است؛ باز کردنِ یکی بقیه را می‌بندد.
 *
 * حالتِ «پر کردن» (`ExpandFillProvider`، کارتی با قدِ ثابتِ کاربر): فهرست هر جایی که در کارت مانده
 * می‌گیرد و هر چه جا نشد پشتِ «مشاهدهٔ بیشتر» می‌رود — شمارِ ردیف‌ها از قدِ کارت می‌آید، نه از limit.
 */

const FillCtx = React.createContext(false);
/** کارتی که قدش ثابت است: فهرست‌های داخلش جای باقی‌مانده را پر می‌کنند. */
export function ExpandFillProvider({ fill, children }: { fill: boolean; children: React.ReactNode }) {
  return <FillCtx.Provider value={fill}>{children}</FillCtx.Provider>;
}
/** آیا این تکه داخلِ کارتی با قدِ ثابت است؟ (برای فهرست‌هایی که خودشان اسکرول دارند، مثلِ صندوق.) */
export function useExpandFill() {
  return React.useContext(FillCtx);
}

/** فقط یک فهرستِ درجا باز — باز شدنِ هر کدام این رویداد را با شناسهٔ خودش می‌فرستد. */
const OPEN_EVENT = 'kz-expandable-open';

export function ExpandableList({
  children,
  limit = 5,
  inPlace = false,
  className,
}: {
  children: React.ReactNode;
  limit?: number;
  /** باز شدن بی بلند شدنِ قاب (اسکرولِ داخلی) — کارت‌های شبکهٔ داشبورد. */
  inPlace?: boolean;
  className?: string;
}) {
  const t = useT();
  const fill = React.useContext(FillCtx) && inPlace;
  const items = React.Children.toArray(children);
  const ref = React.useRef<HTMLUListElement>(null);
  const id = React.useId();
  const [open, setOpen] = React.useState(false);
  /** closed: قدِ بسته (حالتِ limit)؛ hidden: شمارِ ردیف‌هایی که کامل دیده نمی‌شوند؛ firstHidden: جای اولین‌شان. */
  const [m, setM] = React.useState<{ closed: number; full: number; hidden: number; firstHidden: number } | null>(null);

  React.useLayoutEffect(() => {
    const ul = ref.current;
    if (!ul) return;
    const measure = () => {
      const top = ul.getBoundingClientRect().top - ul.scrollTop;
      const rows = [...ul.children] as HTMLElement[];
      if (rows.length === 0 || rows[0]!.offsetHeight === 0) return; // هنوز کشیده نشده؛ ResizeObserver بعداً
      const rel = (el: HTMLElement) => { const r = el.getBoundingClientRect(); return { top: r.top - top, bottom: r.bottom - top, h: r.height }; };
      let closed = ul.scrollHeight;
      if (!fill && rows.length > limit) {
        const peek = rel(rows[limit]!);
        // تا نیمهٔ ردیفِ «بعدی» — همان که محو می‌شود.
        closed = peek.top + peek.h * 0.6;
      }
      // در حالتِ پر کردن، لبهٔ دیدنی همان قدِ فعلیِ قاب است.
      const edge = fill ? ul.clientHeight : closed;
      let hidden = 0;
      let firstHidden = -1;
      for (const r of rows) {
        const b = rel(r);
        if (b.bottom > edge + 1) { hidden++; if (firstHidden < 0) firstHidden = b.top; }
      }
      setM({ closed, full: ul.scrollHeight, hidden, firstHidden: Math.max(0, firstHidden) });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(ul);
    for (const c of ul.children) ro.observe(c);
    return () => ro.disconnect();
  }, [fill, limit, items.length]);

  // باز شدنِ فهرستِ دیگری این یکی را می‌بندد.
  React.useEffect(() => {
    if (!inPlace) return;
    const onOther = (e: Event) => {
      if ((e as CustomEvent<string>).detail === id) return;
      setOpen(false);
      ref.current?.scrollTo({ top: 0 });
    };
    window.addEventListener(OPEN_EVENT, onOther);
    return () => window.removeEventListener(OPEN_EVENT, onOther);
  }, [id, inPlace]);

  const overflowing = fill ? (m?.hidden ?? 0) > 0 || open : items.length > limit;
  if (!fill && !overflowing) return <ul className={className}>{children}</ul>;

  const collapsed = !open;
  const toggle = () => {
    const ul = ref.current;
    if (!inPlace) { setOpen((o) => !o); return; }
    if (collapsed) {
      window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: id }));
      setOpen(true);
      // اسکرول روشن شد؛ فهرست را تا اولین ردیفِ پنهان ببر (کمی بالاتر، تا ردیفِ قبلی هم پیدا باشد).
      requestAnimationFrame(() => ul?.scrollTo({ top: Math.max(0, (m?.firstHidden ?? 0) - 24), behavior: 'smooth' }));
    } else {
      ul?.scrollTo({ top: 0, behavior: 'smooth' });
      setOpen(false);
    }
  };

  const maxHeight = fill
    ? undefined
    : m
      ? (collapsed || inPlace ? m.closed : m.full)
      : `${(limit + 0.6) * 1.625}rem`; // پیش از سنجش: تخمینِ ردیفِ ۲۶px ِ RiskList، تا صفحه نپرد.
  const hiddenCount = fill ? (m?.hidden ?? 0) : items.length - limit;

  return (
    <div className={cn('grid gap-2', fill && 'flex min-h-0 flex-1 flex-col')}>
      <ul
        ref={ref}
        data-expandable={collapsed ? 'closed' : 'open'}
        className={cn(
          collapsed || !inPlace ? 'overflow-hidden' : 'overflow-x-hidden overflow-y-auto',
          fill && 'min-h-0 flex-1',
          !fill && 'transition-[max-height] duration-300 ease-out motion-reduce:transition-none',
          // ردیفِ grid به‌طورِ پیش‌فرض از محتوایش کوچک‌تر نمی‌شود و قابِ overflow-hidden لبه‌اش را می‌بُرد.
          '[&>li]:min-w-0',
          // انتهای قابِ بسته محو می‌شود تا معلوم باشد فهرست ادامه دارد.
          collapsed && overflowing && '[mask-image:linear-gradient(to_bottom,#000_calc(100%-2.75rem),transparent)]',
          className,
        )}
        style={{ maxHeight }}
      >
        {items.map((item, i) =>
          // ردیف‌های پنهان کمی تار، کنارِ محوشدگی — «متنِ انتها بلور» (فقط حالتِ limit).
          !fill && i >= limit && React.isValidElement<{ className?: string }>(item)
            ? React.cloneElement(item as React.ReactElement<{ className?: string; inert?: boolean }>, {
              className: cn(item.props.className, 'transition-[filter] duration-300', collapsed && 'blur-[1.5px]'),
              // ردیفِ پنهان با Tab یا صفحه‌خوان گرفته نشود (پیوندِ زیرِ محوشدگی).
              inert: collapsed || undefined,
            })
            : item)}
      </ul>
      {overflowing && (
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className="inline-flex shrink-0 items-center gap-1 justify-self-start self-start rounded-md text-xs font-medium text-primary hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          {open ? t('نمایش کمتر') : t('مشاهدهٔ بیشتر ({n})', { n: hiddenCount })}
          <ChevronDown className={cn('size-3.5 transition-transform', open && 'rotate-180')} />
        </button>
      )}
    </div>
  );
}
