'use client';

import { useState } from 'react';
import { format } from '@/domain/money/money';
import { useAmountsMasked } from '@/components/amount-privacy';
import { Hint } from '@/components/ui/tooltip';
import { useT } from '@/i18n/client';
import { cn } from '@/lib/utils';

function text(value: string, code: string | null): string {
  return `${format(value)}${code ? ` ${code}` : ''}`;
}

/**
 * مبلغِ یک پرداخت (۲.۶۶.۱) — همان مبلغی که در تراز حساب شده، با ارزِ **خودش**.
 *
 * ⚠️ پیش از این مبلغِ معادل (مثلاً 227.40 یورو) کنارِ ارزِ اصلیِ پرداخت (IRT)
 * نوشته می‌شد: «227.40 IRT». اگر پرداخت به ارزِ دیگری انجام شده، مبلغِ اصلی در
 * راهنمای شناور می‌آید — برای تطبیق با رسید.
 *
 * ⚠️ پنهان‌سازیِ مبلغ را خودش رعایت می‌کند، نه با `<Amount>` ِ تودرتو: راهنمای
 * شناور جای کلیک نیست، پس مبلغِ دومِ پوشانده در آن هرگز باز نمی‌شد. تا مبلغ
 * پوشانده است راهنما همان «برای نمایش کلیک کنید» است؛ پس از باز شدن، مبلغِ اصلی.
 */
export function PaidAmount({ amount, currencyCode, original, className }: {
  amount: string;
  currencyCode: string | null;
  original?: { amount: string; currencyCode: string | null } | null;
  className?: string;
}) {
  const t = useT();
  const masked = useAmountsMasked();
  const [shown, setShown] = useState(false);
  const visible = !masked || shown;
  const toggle = t('برای نمایش/پنهان‌کردن کلیک کنید');
  const label = visible && original
    // ⚠️ مبلغ جدا با dir=ltr — وگرنه در متنِ راست‌به‌چپ «IRT 4,800,000» دیده می‌شد.
    ? <>{t('مبلغِ پرداخت‌شده')}: <bdi dir="ltr" className="num">{text(original.amount, original.currencyCode)}</bdi></>
    : masked ? toggle : undefined;
  const hinted = visible && original
    ? 'cursor-help underline decoration-dotted decoration-muted-foreground/60 underline-offset-4'
    : '';
  const body = visible ? text(amount, currencyCode) : '•••••';

  return (
    <Hint label={label}>
      {masked ? (
        <button
          type="button"
          onClick={(e) => {
            // مبلغ گاهی داخلِ ردیفِ کلیک‌پذیر یا لینک است — کلیک فقط همین را باز کند.
            e.preventDefault();
            e.stopPropagation();
            setShown((s) => !s);
          }}
          aria-label={toggle}
          className={cn('num cursor-pointer tabular-nums', !visible && 'tracking-wider', hinted, className)}
        >
          {body}
        </button>
      ) : (
        <span className={cn('num', hinted, className)}>{body}</span>
      )}
    </Hint>
  );
}
