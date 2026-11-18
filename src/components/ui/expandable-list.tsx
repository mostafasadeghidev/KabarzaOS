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
 * و ردیفِ دوخطی هم درست است.
 */
export function ExpandableList({
  children,
  limit = 5,
  scrollAt,
  className,
}: {
  children: React.ReactNode;
  limit?: number;
  /**
   * سقفِ قابِ باز (rem) — اگر داده‌ی زیاد بود، پس از «مشاهدهٔ بیشتر» کارت تا این قد باز می‌شود و
   * بقیه داخلِ خودش اسکرول می‌خورد (کارت‌های شبکهٔ داشبورد). نبودن = باز شدنِ کامل، مثلِ قبل.
   */
  scrollAt?: number;
  className?: string;
}) {
  const t = useT();
  const items = React.Children.toArray(children);
  const extra = items.length - limit;
  const ref = React.useRef<HTMLUListElement>(null);
  const [open, setOpen] = React.useState(false);
  const [height, setHeight] = React.useState<{ closed: number; full: number } | null>(null);

  React.useLayoutEffect(() => {
    const ul = ref.current;
    if (!ul || extra <= 0) return;
    const measure = () => {
      const peek = ul.children[limit] as HTMLElement | undefined;
      // هنوز کشیده نشده (تبِ پنهان، پنجرهٔ بسته): تخمینِ پیش‌فرض بماند؛ ResizeObserver بعداً می‌سنجد.
      if (!peek || peek.offsetHeight === 0) return;
      // تا نیمهٔ ردیفِ «بعدی» — همان که محو می‌شود.
      const closed = peek.offsetTop - ul.offsetTop + peek.offsetHeight * 0.6;
      setHeight({ closed, full: ul.scrollHeight });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(ul);
    return () => ro.disconnect();
  }, [extra, limit]);

  if (extra <= 0) return <ul className={className}>{children}</ul>;

  const collapsed = !open;
  return (
    <div className="grid gap-2">
      <ul
        ref={ref}
        data-expandable={collapsed ? 'closed' : 'open'}
        className={cn(
          collapsed || !scrollAt ? 'overflow-hidden' : 'overflow-x-hidden overflow-y-auto',
          // ردیفِ grid به‌طورِ پیش‌فرض از محتوایش کوچک‌تر نمی‌شود و قابِ overflow-hidden لبه‌اش را می‌بُرد.
          '[&>li]:min-w-0',
          'transition-[max-height] duration-300 ease-out motion-reduce:transition-none',
          // انتهای قابِ بسته محو می‌شود تا معلوم باشد فهرست ادامه دارد.
          collapsed && '[mask-image:linear-gradient(to_bottom,#000_calc(100%-2.75rem),transparent)]',
          className,
        )}
        style={{
          // پیش از سنجش (رندرِ سرور): تخمینِ ردیفِ ۲۶px ِ RiskList، تا صفحه پس از بارگذاری نپرد.
          maxHeight: height ? (collapsed ? height.closed : scrollAt ? `min(${height.full}px, ${scrollAt}rem)` : height.full) : collapsed ? `${(limit + 0.6) * 1.625}rem` : undefined,
        }}
      >
        {items.map((item, i) =>
          // ردیف‌های پنهان کمی تار، کنارِ محوشدگی — «متنِ انتها بلور».
          i >= limit && React.isValidElement<{ className?: string }>(item)
            ? React.cloneElement(item as React.ReactElement<{ className?: string; inert?: boolean }>, {
              className: cn(item.props.className, 'transition-[filter] duration-300', collapsed && 'blur-[1.5px]'),
              // ردیفِ پنهان با Tab یا صفحه‌خوان گرفته نشود (پیوندِ زیرِ محوشدگی).
              inert: collapsed || undefined,
            })
            : item)}
      </ul>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="inline-flex items-center gap-1 justify-self-start rounded-md text-xs font-medium text-primary hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        {open ? t('نمایش کمتر') : t('مشاهدهٔ بیشتر ({n})', { n: extra })}
        <ChevronDown className={cn('size-3.5 transition-transform', open && 'rotate-180')} />
      </button>
    </div>
  );
}
