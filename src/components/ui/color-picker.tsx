'use client';

import { useState } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { useT } from '@/i18n/client';

/**
 * انتخابگرِ رنگِ تگ — سواچ‌های آماده به‌علاوهٔ رنگِ دلخواه.
 *
 * ⚠️ چرا نه `<input type="color">` ِ خام: مرورگر آن را به اندازهٔ یک کادرِ
 * بزرگ رندر می‌کند که با بقیهٔ فرم هم‌قد نیست، و برای انتخابِ یکی از چند
 * رنگِ متداول کاربر را به پنجرهٔ رنگِ سیستم می‌فرستد. سواچ‌ها همان کار را
 * با یک کلیک انجام می‌دهند و کادرِ سیستمی فقط برای رنگِ دلخواه می‌ماند.
 */

/** پالتِ پیش‌فرض — همان رنگ‌هایی که تگ‌های پایه با آن می‌آیند. */
const SWATCHES = [
  '#b9b7c2', '#a298eb', '#665abf', '#6c5ce7', '#9561a8',
  '#00d65d', '#03cc00', '#30a17f', '#95f9d3', '#60cbe6',
  '#428bff', '#2509fb', '#1e00ff', '#eb8b05', '#f36a20',
  '#e74c3c', '#ff0000', '#f50000', '#740202', '#a79093',
];

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
    <div className="grid gap-2">
      <input type="hidden" name={name} value={color} />
      <div className="flex flex-wrap gap-1.5">
        {SWATCHES.map((swatch) => (
          <button
            key={swatch}
            type="button"
            onClick={() => setColor(swatch)}
            aria-label={swatch}
            aria-pressed={color.toLowerCase() === swatch}
            className={cn(
              'size-6 rounded-md border border-border/60 transition',
              'hover:scale-110 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
            )}
            style={{ backgroundColor: swatch }}
          >
            {color.toLowerCase() === swatch && (
              // ⚠️ سفید روی هر رنگی خوانا نیست؛ سایه متن را از زمینه جدا می‌کند.
              <Check className="mx-auto size-3.5 text-white drop-shadow-[0_1px_1px_rgba(0,0,0,.7)]" />
            )}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="color"
          value={color}
          onChange={(event) => setColor(event.target.value)}
          aria-label={t('رنگِ دلخواه')}
          className="size-8 cursor-pointer rounded-md border border-input bg-transparent p-0.5"
        />
        <Input
          value={color}
          onChange={(event) => setColor(event.target.value)}
          aria-label={t('کدِ رنگ')}
          className="h-8 w-28 font-mono text-xs"
          dir="ltr"
        />
      </div>
    </div>
  );
}
