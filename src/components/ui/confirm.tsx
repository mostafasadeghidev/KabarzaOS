'use client';

import { createContext, useCallback, useContext, useRef, useState } from 'react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useT } from '@/i18n/client';

/**
 * تأییدِ کارِ برگشت‌ناپذیر — پورتِ `confirm()` ِ نسخهٔ قبلی پیش از حذفِ تسک،
 * فایل، کامنت، آیتمِ QA، سبک‌سازی، حذفِ جلسه و ساعت.
 *
 * ⚠️ چرا لازم شد: هیچ کلیکِ مخربی در اپ تأیید نمی‌خواست؛ حذفِ تسک، پس‌گرفتنِ
 * پیشنهادِ برنده و سبک‌سازی (که برگشت‌ناپذیر است) با یک لمسِ اشتباه اجرا
 * می‌شدند. نسخهٔ قبلی برای همهٔ این‌ها `confirm()` داشت.
 *
 * ⚠️ یک پرووایدر در ریشه و یک دیالوگ — نه یک دیالوگ در هر دکمه: چند ده
 * دکمهٔ حذف داریم و هر کدام که دیالوگِ خودش را می‌ساخت، هم کد تکرار می‌شد
 * هم تله‌های فوکوسِ تودرتو با منوها درگیر می‌شدند. صدازننده فقط
 * `await confirm({ title })` می‌کند و متنش را خودش ترجمه‌شده می‌دهد.
 *
 * ⚠️ روی `AlertDialog` سوار است، نه `Dialog`. سه فرقِ رفتاری که همه‌شان به
 * سودِ کارِ مخرب‌اند:
 *   · نقشِ `alertdialog` — صفحه‌خوان آن را هشدار اعلام می‌کند، نه قابی ساده.
 *   · دکمهٔ بستنِ گوشه ندارد و کلیکِ بیرون نمی‌بنددش؛ فقط «انصراف» یا Escape.
 *   · فوکوسِ آغازین روی **انصراف** است، نه دکمهٔ قرمز؛ یعنی Enter ِ عجولانه
 *     دیگر چیزی را حذف نمی‌کند.
 * API دست‌نخورده است؛ هیچ‌کدام از صدازننده‌ها تغییر نکردند.
 */

export interface ConfirmOptions {
  /** متنِ **ترجمه‌شده**. دیالوگ خودش ترجمه نمی‌کند. */
  title: string;
  description?: string;
  confirmLabel?: string;
  /** پیش‌فرض قرمز (حذف)؛ `false` برای کارِ غیرمخرب. */
  destructive?: boolean;
}

type Ask = (options: ConfirmOptions) => Promise<boolean>;

/** بیرونِ پرووایدر (تست، پیش‌نمایش) همیشه «بله» — نباید چیزی را قفل کند. */
const ConfirmContext = createContext<Ask>(async () => true);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const tr = useT();
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const ask = useCallback<Ask>((next) => new Promise<boolean>((resolve) => {
    // ⚠️ پرسشِ قبلی که هنوز پاسخ نگرفته «نه» می‌شود، نه اینکه معلق بماند.
    resolver.current?.(false);
    resolver.current = resolve;
    setOptions(next);
  }), []);

  /**
   * ⚠️ بعد از اولین پاسخ `resolver` خالی می‌شود، و این لازم است: دکمهٔ تأیید
   * هم خودش دیالوگ را می‌بندد و هم `onOpenChange` را صدا می‌زند، پس `settle`
   * دو بار اجرا می‌شود — بارِ دوم باید بی‌اثر بماند، وگرنه «بله» با «نه»
   * بازنویسی می‌شد.
   */
  const settle = (ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setOptions(null);
  };

  return (
    <ConfirmContext.Provider value={ask}>
      {children}
      <AlertDialog open={options !== null} onOpenChange={(open) => { if (!open) settle(false); }}>
        <AlertDialogContent className="sm:max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>{options?.title ?? ''}</AlertDialogTitle>
            {options?.description ? (
              <AlertDialogDescription>{options.description}</AlertDialogDescription>
            ) : (
              <AlertDialogDescription className="sr-only">
                {tr('این کار نیاز به تأیید دارد.')}
              </AlertDialogDescription>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => settle(false)}>
              {tr('انصراف')}
            </AlertDialogCancel>
            <AlertDialogAction
              variant={options?.destructive === false ? 'default' : 'destructive'}
              onClick={() => settle(true)}
            >
              {options?.confirmLabel ?? tr('بله، انجام بده')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmContext.Provider>
  );
}

/** `const confirm = useConfirm(); if (await confirm({ title: tr('حذف شود؟') })) …` */
export function useConfirm(): Ask {
  return useContext(ConfirmContext);
}
