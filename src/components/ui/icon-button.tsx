'use client';

import { Button } from '@/components/ui/button';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';

/**
 * دکمهٔ فقط‌آیکون، با راهنمای شناور.
 *
 * ⚠️ چرا یک کامپوننتِ جدا و نه پیچیدنِ دستیِ هر دکمه: پانزده دکمهٔ آیکونی در
 * جدول‌ها داریم (ویرایش، حذف، قطعِ دسترسی، پرداخت…) که همه فقط `aria-label`
 * داشتند — یعنی صفحه‌خوان می‌فهمید چیست ولی کاربرِ ماوس نه. با یک کامپوننت،
 * همان `label` هم برچسبِ دسترس‌پذیری می‌شود هم متنِ تولتیپ، پس این دو
 * هیچ‌وقت از هم دور نمی‌افتند.
 *
 * ⚠️ `label` باید **ترجمه‌شده** برسد؛ این کامپوننت ترجمه نمی‌کند.
 *
 * ⚠️ پرووایدرِ خودش را همراه دارد: `SidebarProvider` یکی در چیدمانِ اپ
 * می‌گذارد، ولی صفحه‌های بیرونِ آن (ورود، بازنشانیِ رمز، نصبِ اولیه) ندارند و
 * بدونِ پرووایدر، Radix خطا می‌دهد.
 *
 * ⚠️ روی دکمهٔ `disabled` تولتیپ باز نمی‌شود — مرورگر رویدادِ اشاره‌گر را
 * نمی‌فرستد. برچسبِ دسترس‌پذیری سرِ جایش می‌ماند.
 */
export function IconButton({
  label,
  children,
  ...props
}: React.ComponentProps<typeof Button> & { label: string }) {
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button size="icon" aria-label={label} {...props}>
            {children}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
