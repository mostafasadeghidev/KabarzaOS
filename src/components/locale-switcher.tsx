'use client';

import * as React from 'react';
import { Check, Languages } from 'lucide-react';
import { setLocale } from '@/app/(app)/_actions/locale';
import { LOCALES, LOCALE_NAMES, type Locale } from '@/i18n/config';
import { useLocale, useT } from '@/i18n/client';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

/**
 * دکمهٔ «زبان» روی کارتِ راهنما (۳.۱۹.۰): کارمندی که راهنما را به زبانِ دیگری می‌بیند همان‌جا عوضش کند.
 * ⚠️ در نوارِ بالا نیست — خواستِ مالک: جای زبان منوی کاربر است؛ فقط راهنما میان‌بُرِ خودش را دارد.
 * ذخیره روی خودِ کاربر است (`setLocale`) و بعدش بارگذاریِ کامل — همان دلیلِ منوی کاربر: کشِ مسیریاب
 * صفحه‌های دیده‌شده را به زبانِ قبلی نگه می‌دارد.
 */
export function LocaleSwitcher({ compact = false, className, disabled, inTour = false }: {
  /** فقط آیکون + کدِ زبان (نوارِ بالا روی گوشی، کارتِ راهنما). */
  compact?: boolean;
  className?: string;
  /** «دیدن به‌جای کاربر»: زبانِ آن کاربر را عوض نکن. */
  disabled?: boolean;
  /**
   * روی کارتِ راهنما: منو باید بالای لایهٔ راهنما باشد (z-index ِ آن بسیار بالاست) و `kz-tour-layer` دارد تا
   * قاعدهٔ «پنجرهٔ بی‌ربط باز است ← راهنما کنار برود» آن را بیگانه حساب نکند.
   */
  inTour?: boolean;
}) {
  const t = useT();
  const locale = useLocale();
  const [busy, setBusy] = React.useState(false);
  const pick = async (l: Locale) => {
    if (l === locale) return;
    setBusy(true);
    await setLocale(l);
    window.location.reload();
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled || busy}>
        <Button
          type="button" variant="ghost" size="sm"
          className={cn('h-8 gap-1.5 px-2 text-muted-foreground', className)}
          aria-label={t('زبان')}
          data-tour={inTour ? undefined : 'topbar-locale'}
        >
          <Languages className="size-4" />
          <span className={cn('text-xs font-medium uppercase', !compact && 'hidden sm:inline')}>{locale}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className={cn('min-w-40', inTour && 'kz-tour-layer z-[2147483600]')}>
        <DropdownMenuLabel className="text-xs text-muted-foreground">{t('زبان')}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {LOCALES.map((code) => (
          <DropdownMenuItem key={code} onSelect={() => void pick(code)} className="justify-between gap-3">
            <span>{LOCALE_NAMES[code]}</span>
            {code === locale && <Check className="size-3.5 text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
