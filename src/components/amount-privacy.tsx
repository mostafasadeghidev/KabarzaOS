'use client';

import { usePathname } from 'next/navigation';
import { useState, useSyncExternalStore, type ReactNode } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Hint } from '@/components/ui/tooltip';
import { useT } from '@/i18n/client';
import { cn } from '@/lib/utils';

/**
 * «پنهان‌کردنِ مبلغ‌ها» (۲.۴۳.۰) — کلیدِ سراسریِ منوی حساب، پیش‌فرض **روشن**.
 *
 * وقتی روشن است هر مبلغی که با `<Amount>` نشان داده می‌شود «•••••» است و با یک
 * کلیک (فقط همان یکی) دیده می‌شود — همان رفتارِ قدیمیِ کارتِ پروژه، حالا در
 * همهٔ برنامه. ⚠️ صفحه‌های «گزارش‌ها» استثنا هستند: آنجا خودِ کار دیدنِ عددهاست.
 *
 * ⚠️ انتخاب در مرورگر می‌ماند (localStorage)، نه در حساب: نمایشگرِ مشترکِ دفتر
 * و لپ‌تاپِ شخصی می‌توانند جدا باشند. سرور همیشه نسخهٔ پنهان را می‌سازد، پس
 * هیچ مبلغی پیش از خوانده‌شدنِ انتخاب یک لحظه هم بیرون نمی‌زند.
 */

const KEY = 'kz.hideAmounts';
const EVENT = 'kz:hide-amounts';

function read(): boolean {
  try {
    return window.localStorage.getItem(KEY) !== '0';
  } catch {
    return true;
  }
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener('storage', onChange);
  window.addEventListener(EVENT, onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(EVENT, onChange);
  };
}

/** آیا مبلغ‌ها اکنون پوشانده‌اند؟ روی سرور همیشه بله. */
export function useHideAmounts(): boolean {
  return useSyncExternalStore(subscribe, read, () => true);
}

function setHideAmounts(hide: boolean): void {
  try {
    window.localStorage.setItem(KEY, hide ? '1' : '0');
  } catch {
    // مرورگرِ بی‌ذخیره (پنجرهٔ خصوصی…) — فقط همین صفحه عوض می‌شود.
  }
  window.dispatchEvent(new Event(EVENT));
}

/** گزارش‌ها همیشه عدد را نشان می‌دهند. */
function isExempt(pathname: string | null): boolean {
  return pathname === '/reports' || (pathname?.startsWith('/reports/') ?? false);
}

/**
 * یک مبلغِ نمایشی. فرزند همان متنِ قالب‌بندی‌شده است (`format(...)`)؛ ورودیِ
 * فرم‌ها هرگز با این پوشانده نمی‌شود.
 */
export function Amount({ children, className }: { children: ReactNode; className?: string }) {
  const t = useT();
  const hide = useHideAmounts();
  const pathname = usePathname();
  const [shown, setShown] = useState(false);
  if (!hide || isExempt(pathname)) return <span className={className}>{children}</span>;
  const label = t('برای نمایش/پنهان‌کردن کلیک کنید');
  return (
    <Hint label={label}>
      <button
        type="button"
        onClick={(e) => {
          // ⚠️ مبلغ گاهی داخلِ ردیفِ کلیک‌پذیر یا لینک است — کلیک فقط همین را باز کند.
          e.preventDefault();
          e.stopPropagation();
          setShown((s) => !s);
        }}
        aria-label={label}
        className={cn('num cursor-pointer tabular-nums', !shown && 'tracking-wider', className)}
      >
        {shown ? children : '•••••'}
      </button>
    </Hint>
  );
}

/**
 * ردیفِ منوی حساب (۲.۴۳.۲) — زیرِ «پالت»، با همان شکلِ ردیف‌های «زبان/ظاهر».
 * ⚠️ `DropdownMenuItem` نیست: کلیک روی کلید نباید منو را ببندد.
 */
export function HideAmountsRow() {
  const t = useT();
  const hide = useHideAmounts();
  const Icon = hide ? EyeOff : Eye;
  return (
    <div className="px-2 py-1.5">
      <label htmlFor="um-hide-amounts" className="flex cursor-pointer items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Icon className="size-3.5" />
          {t('پنهان‌کردنِ مبلغ‌ها')}
        </span>
        <Switch id="um-hide-amounts" size="sm" checked={hide} onCheckedChange={setHideAmounts} />
      </label>
    </div>
  );
}
