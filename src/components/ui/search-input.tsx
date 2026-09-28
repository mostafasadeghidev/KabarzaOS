import * as React from 'react';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';

/**
 * جعبهٔ جستجوی نوارِ ابزار — یک شکل همه‌جا.
 *
 * ⚠️ چرا لازم شد: پیش از این پنج پیاده‌سازی داشت — ذره‌بین در سه جای مختلف
 * (یکی با کلاسی که در تیلویند وجود ندارد و فقط تصادفاً سرِ جایش بود)، دو
 * اندازهٔ آیکون، دو ارتفاع (۳۲ و ۳۶) و سه پهنا. ارتفاعِ `h-8` همان دکمه‌های
 * `size="sm"` و فهرست‌های `size="sm"` ِ کنارش است، تا ردیفِ ابزار یک خط باشد.
 *
 * پهنای پیش‌فرض: تمام‌عرض روی موبایل، `w-64` از `sm` به بالا. جایی که جعبه
 * باید کلِ ستون را بگیرد (سرِ صندوقِ پیام) `containerClassName="sm:w-full"`.
 */
export function SearchInput({
  className,
  containerClassName,
  ...props
}: Omit<React.ComponentProps<'input'>, 'type'> & { containerClassName?: string }) {
  return (
    <div className={cn('relative w-full sm:w-64', containerClassName)}>
      <Search
        aria-hidden
        className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input type="search" className={cn('h-8 ps-8', className)} {...props} />
    </div>
  );
}
