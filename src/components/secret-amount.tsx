'use client';

import { useState } from 'react';
import { useT } from '@/i18n/client';

/**
 * مبلغی که پیش‌فرض پوشیده است و با کلیک باز می‌شود.
 *
 * ⚠️ چرا: صفحهٔ داشبورد جایی است که کاربر پیشِ چشمِ دیگران بازش می‌کند —
 * جلسه، کافه، اسکرینِ مشترک. رقمِ قرارداد و ماندهٔ بدهی نباید همان لحظهٔ
 * اول روی صفحه باشد. این **پوششِ نمایشی** است، نه گاردِ دسترسی: عدد از
 * سرور آمده و کسی که حقِ دیدنش را ندارد اصلاً آن را نمی‌گیرد (گاردِ واقعی
 * در `domain/access/project-money` است).
 */
export function SecretAmount({
  value,
  className = '',
}: {
  /** متنِ آمادهٔ نمایش — قالب‌بندی و واحد از قبل روی آن نشسته است. */
  value: string;
  className?: string;
}) {
  const t = useT();
  const [shown, setShown] = useState(false);

  return (
    <button
      type="button"
      // ⚠️ کلیک نباید کارتِ زیرین را هم باز کند.
      onClick={(e) => { e.stopPropagation(); setShown((v) => !v); }}
      title={shown ? t('پنهان‌کردن') : t('نمایشِ مبلغ')}
      aria-label={shown ? t('پنهان‌کردن') : t('نمایشِ مبلغ')}
      className={`rounded outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 ${
        shown ? '' : 'text-muted-foreground'
      } ${className}`}
    >
      {shown ? value : '•••'}
    </button>
  );
}
