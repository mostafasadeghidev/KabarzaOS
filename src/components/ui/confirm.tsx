'use client';

import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
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

  const settle = (ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setOptions(null);
  };

  return (
    <ConfirmContext.Provider value={ask}>
      {children}
      <Dialog open={options !== null} onOpenChange={(open) => { if (!open) settle(false); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{options?.title ?? ''}</DialogTitle>
            {options?.description ? (
              <DialogDescription>{options.description}</DialogDescription>
            ) : (
              <DialogDescription className="sr-only">{tr('این کار نیاز به تأیید دارد.')}</DialogDescription>
            )}
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => settle(false)}>
              {tr('انصراف')}
            </Button>
            <Button
              type="button"
              variant={options?.destructive === false ? 'default' : 'destructive'}
              onClick={() => settle(true)}
              autoFocus
            >
              {options?.confirmLabel ?? tr('بله، انجام بده')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ConfirmContext.Provider>
  );
}

/** `const confirm = useConfirm(); if (await confirm({ title: tr('حذف شود؟') })) …` */
export function useConfirm(): Ask {
  return useContext(ConfirmContext);
}
