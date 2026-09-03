'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, ChevronsUpDown, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useT } from '@/i18n/client';

/**
 * انتخابِ چندتایی — فیلدی که با کلیک باز می‌شود.
 *
 * ⚠️ چرا نه ردیفی از چک‌باکس‌ها: با ده نقش و چند دفتر، فرم چند سطر بلندتر
 * می‌شد و انتخاب‌شده‌ها بینِ انتخاب‌نشده‌ها گم بودند. اینجا فیلد فقط
 * انتخاب‌شده‌ها را نشان می‌دهد و فهرست وقتی باز می‌شود که لازم باشد.
 *
 * ⚠️ مقدارها به‌صورتِ `<input type="hidden">` می‌روند، نه state ِ فرم:
 * این جزء داخلِ فرم‌های server action استفاده می‌شود و `FormData` باید
 * بدونِ جاوااسکریپتِ اضافی پرشان کند.
 */

export interface MultiOption {
  id: number;
  label: string;
  /** نقطهٔ رنگی کنارِ گزینه — برای تگ‌ها. */
  color?: string;
}

export function MultiSelect({
  name,
  options,
  defaultSelected = [],
  placeholder,
  emptyText,
  onChange,
}: {
  name: string;
  options: MultiOption[];
  defaultSelected?: number[];
  placeholder: string;
  emptyText?: string;
  /** برای فیلدهایی که به انتخابِ این یکی وابسته‌اند (مثلِ «مدیرِ این دفاتر»). */
  onChange?: (selected: number[]) => void;
}) {
  const t = useT();
  const [selected, setSelected] = useState<number[]>(defaultSelected);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  // بستن با کلیکِ بیرون — اینجا بی‌خطر است چون چیزی تایپ نشده.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      onChange?.(next);
      return next;
    });
  };

  const chosen = options.filter((o) => selected.includes(o.id));

  return (
    <div className="relative" ref={box}>
      {selected.map((id) => <input key={id} type="hidden" name={name} value={id} />)}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex min-h-9 w-full items-center justify-between gap-2 rounded-md border border-input',
          'bg-transparent px-3 py-1.5 text-start text-sm',
          'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
        )}
      >
        <span className="flex flex-1 flex-wrap gap-1">
          {chosen.length === 0
            ? <span className="text-muted-foreground">{placeholder}</span>
            : chosen.map((o) => (
              <span
                key={o.id}
                className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-xs"
              >
                {o.color && (
                  <span className="size-2 rounded-full" style={{ backgroundColor: o.color }} />
                )}
                {o.label}
                {/*
                  ⚠️ span و نه button: دکمهٔ تودرتو HTML نامعتبر است و
                  کلیکش به دکمهٔ بیرونی هم می‌رسید.
                */}
                <span
                  role="button"
                  tabIndex={-1}
                  aria-label={`${t('برداشتن')} ${o.label}`}
                  onClick={(e) => { e.stopPropagation(); toggle(o.id); }}
                  className="cursor-pointer text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3" />
                </span>
              </span>
            ))}
        </span>
        <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-md border bg-popover p-1 shadow-md">
          {options.length === 0 ? (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">
              {emptyText ?? t('موردی نیست')}
            </p>
          ) : options.map((o) => {
            const on = selected.includes(o.id);
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => toggle(o.id)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-start text-sm',
                  'hover:bg-accent hover:text-accent-foreground',
                )}
              >
                <span className={cn(
                  'flex size-4 shrink-0 items-center justify-center rounded-sm border',
                  on ? 'border-primary bg-primary text-primary-foreground' : 'border-input',
                )}>
                  {on && <Check className="size-3" />}
                </span>
                {o.color && (
                  <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: o.color }} />
                )}
                <span className="truncate">{o.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
