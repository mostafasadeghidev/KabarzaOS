import * as React from 'react';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';

/**
 * جعبهٔ جستجوی نوارِ ابزار — یک شکل همه‌جا.
 *
 * ⚠️ چرا لازم شد: پیش از این پنج پیاده‌سازی داشت — ذره‌بین در سه جای مختلف
 * (یکی با کلاسی که در تیلویند وجود ندارد و فقط تصادفاً سرِ جایش بود)، دو
 * اندازهٔ آیکون، دو ارتفاع (۳۲ و ۳۶) و سه پهنا. ارتفاعِ `h-8` همان دکمه‌های
 * `size="sm"` و فهرست‌های `size="sm"` ِ کنارش است، تا ردیفِ ابزار یک خط باشد.
 *
 * روی `InputGroup` ِ shadcn: آیکون افزونهٔ آغازِ فیلد است، نه یک عنصرِ
 * `absolute` که با پدینگِ دستی سرِ جایش نگه داشته شود.
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
    <InputGroup className={cn('h-8 w-full sm:w-64', containerClassName)}>
      <InputGroupAddon>
        <Search aria-hidden />
      </InputGroupAddon>
      <InputGroupInput type="search" className={cn('h-8', className)} {...props} />
    </InputGroup>
  );
}
