'use client';

import * as React from 'react';
import { Upload } from 'lucide-react';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';
import { useT } from '@/i18n/client';

/**
 * ورودیِ فایل با ظاهرِ خودِ اپ.
 *
 * ⚠️ چرا لازم شد: `<input type="file">` ِ خام را مرورگر با زبانِ **خودش**
 * می‌کشد — «Choose File» و «No file chosen» وسطِ رابطِ فارسی، با قلم و قابی
 * که به هیچ فیلدِ دیگری نمی‌خورد.
 *
 * ⚠️ ورودیِ واقعی سرِ جایش می‌ماند و فقط دیده نمی‌شود (`sr-only`، نه `hidden`):
 * نام‌دار است و همان `FormData` را می‌سازد که پیش از این می‌ساخت، `required`
 * کار می‌کند، و با Tab فوکوس می‌گیرد — حلقهٔ فوکوس روی دکمه کشیده می‌شود.
 *
 * `selected` — وقتی فایل‌ها بیرون از رویدادِ change عوض می‌شوند (چسباندن از
 * کلیپ‌بورد، حذفِ تک‌فایل)، فراخوان نامشان را می‌دهد تا برچسب کهنه نماند.
 */
export const FileInput = React.forwardRef<
  HTMLInputElement,
  Omit<React.ComponentProps<'input'>, 'type'> & { selected?: string[] }
>(function FileInput({ className, id, multiple, onChange, selected, ...props }, ref) {
  const tr = useT();
  const autoId = React.useId();
  const inputId = id ?? autoId;
  const [names, setNames] = React.useState<string[]>([]);
  const innerRef = React.useRef<HTMLInputElement | null>(null);

  // فرمِ ویرایش پس از ذخیره `reset` می‌شود؛ برچسب هم باید همراهش خالی شود.
  React.useEffect(() => {
    const form = innerRef.current?.form;
    if (!form) return;
    const onReset = () => setNames([]);
    form.addEventListener('reset', onReset);
    return () => form.removeEventListener('reset', onReset);
  }, []);

  const shown = selected ?? names;
  const label = shown.length === 0
    ? tr('فایلی انتخاب نشده')
    : shown.length === 1
      ? shown[0]
      : tr('{n} فایل انتخاب شد', { n: shown.length });

  return (
    <div className={cn('flex min-w-0 items-center gap-2', className)}>
      <input
        ref={(node) => {
          innerRef.current = node;
          if (typeof ref === 'function') ref(node);
          else if (ref) ref.current = node;
        }}
        id={inputId}
        type="file"
        multiple={multiple}
        className="peer sr-only"
        onChange={(e) => {
          setNames([...(e.target.files ?? [])].map((f) => f.name));
          onChange?.(e);
        }}
        {...props}
      />
      <label
        htmlFor={inputId}
        className={cn(
          buttonVariants({ variant: 'outline', size: 'sm' }),
          'shrink-0 cursor-pointer peer-focus-visible:border-ring peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring/50',
          'peer-disabled:pointer-events-none peer-disabled:opacity-50',
        )}
      >
        <Upload className="size-3.5" aria-hidden />
        {multiple ? tr('انتخاب فایل‌ها') : tr('انتخاب فایل')}
      </label>
      <span className="min-w-0 truncate text-xs text-muted-foreground" title={shown.join(tr('، '))}>
        {label}
      </span>
    </div>
  );
});
