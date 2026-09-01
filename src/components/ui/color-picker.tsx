'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { useT } from '@/i18n/client';

/**
 * انتخابگرِ رنگِ تگ — فقط رنگِ دلخواه.
 *
 * ⚠️ ردیفِ بیست سواچِ پیشنهادی برداشته شد: بیشتر از خودِ فیلد جا می‌گرفت و
 * انتخابِ واقعی را — که تقریباً همیشه رنگی بیرون از آن بیست‌تاست — پشتِ
 * خودش پنهان می‌کرد. کادرِ رنگ و کدِ هگز کنارِ هم همان کار را در یک سطر
 * انجام می‌دهند.
 *
 * ⚠️ کدِ هگز کنارِ کادر می‌ماند: کاربری که رنگِ برندش را می‌داند، تایپش
 * می‌کند و لازم نیست در پنجرهٔ رنگِ سیستم دنبالش بگردد.
 */

export function ColorPicker({
  name,
  defaultValue = '#6c5ce7',
  id,
}: {
  name: string;
  defaultValue?: string;
  id?: string;
}) {
  const t = useT();
  const [color, setColor] = useState(defaultValue || '#6c5ce7');

  return (
    <div className="flex items-center gap-2">
      <input type="hidden" name={name} value={color} />
      <input
        id={id}
        type="color"
        value={color}
        onChange={(event) => setColor(event.target.value)}
        aria-label={t('رنگِ دلخواه')}
        className="size-9 cursor-pointer rounded-md border border-input bg-transparent p-0.5"
      />
      <Input
        value={color}
        onChange={(event) => setColor(event.target.value)}
        aria-label={t('کدِ رنگ')}
        className="h-9 w-32 font-mono text-xs"
        dir="ltr"
      />
    </div>
  );
}
