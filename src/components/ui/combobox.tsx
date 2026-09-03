'use client';

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronsUpDown, X } from 'lucide-react';
import { useT } from '@/i18n/client';

export interface Option {
  value: number;
  label: string;
  /** متنِ کمکیِ ردیف — مثلاً ایمیل یا نامِ دفتر. */
  hint?: string;
  disabled?: boolean;
}

/** جستجوی ساده و بی‌طرف نسبت به فاصله و «ی/ک» عربی. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/ي/g, 'ی')   // ي عربی ← ی فارسی
    .replace(/ك/g, 'ک')   // ك عربی ← ک فارسی
    .replace(/‌/g, ' ')        // نیم‌فاصله مثلِ فاصله
    .replace(/\s+/g, ' ')
    .trim();
}

export function matches(option: Option, query: string): boolean {
  const q = normalize(query);
  if (!q) return true;
  return normalize(option.label).includes(q) || normalize(option.hint ?? '').includes(q);
}

const boxClass =
  'flex h-9 w-full items-center gap-1 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs';

/**
 * جای‌گیریِ فهرستِ بازشو **بیرونِ** جریانِ صفحه.
 *
 * ⚠️ چرا portal و نه `absolute`: این فیلد داخلِ مودالی است که خودش
 * `overflow-y-auto` دارد — فهرستِ absolute زیرِ لبهٔ مودال بریده می‌شد و
 * کاربر باید مودال را اسکرول می‌کرد تا گزینه‌ها را ببیند. با portal روی
 * `body` و مختصاتِ fixed، فهرست **روی** مودال می‌نشیند.
 */
function useFloatingList(open: boolean, anchorRef: React.RefObject<HTMLElement | null>) {
  const [box, setBox] = useState<{ top: number; left: number; width: number } | null>(null);

  const measure = useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const below = window.innerHeight - r.bottom;
    // اگر پایین جا نبود، فهرست بالای فیلد باز می‌شود.
    const height = Math.min(224, Math.max(120, below - 12));
    const openUp = below < 160 && r.top > below;
    setBox({
      top: openUp ? Math.max(8, r.top - height - 4) : r.bottom + 4,
      left: r.left,
      width: r.width,
    });
  }, [anchorRef]);

  useLayoutEffect(() => {
    if (!open) return;
    measure();
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
    };
  }, [open, measure]);

  return box;
}

/**
 * انتخابگرِ **تک‌مقداریِ** جستجوی زنده.
 *
 * ⚠️ دو رفتارِ نسخهٔ قبلی که بدونشان فیلد آزاردهنده می‌شود:
 *  ۱. **نامِ آزاد** هم پذیرفته می‌شود؛ هر طرف‌حسابی کاربرِ سامانه نیست.
 *     پس مقدار همیشه دوتایی است: شناسه (شاید null) + متن.
 *  ۲. بستنِ فهرست نباید متنِ تایپ‌شده را پاک کند.
 */
export function Combobox({
  options,
  value,
  onChange,
  placeholder,
  allowFreeText = false,
  name,
  id,
  disabled,
}: {
  options: Option[];
  value: { id: number | null; label: string };
  onChange: (next: { id: number | null; label: string }) => void;
  placeholder?: string;
  /** نامِ آزاد (خارج از فهرست) مجاز است؟ */
  allowFreeText?: boolean;
  /** نامِ فیلدِ مخفیِ شناسه، برای ارسال در فرم. */
  name?: string;
  id?: string;
  disabled?: boolean;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const visible = useMemo(
    () => options.filter((o) => !o.disabled && matches(o, value.label)).slice(0, 50),
    [options, value.label],
  );

  useEffect(() => {
    const onOutside = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, []);

  useEffect(() => { setActive(0); }, [value.label]);

  const fieldRef = useRef<HTMLDivElement>(null);
  const listBox = useFloatingList(open, fieldRef);

  const pick = (option: Option) => {
    onChange({ id: option.value, label: option.label });
    setOpen(false);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((a) => (a + 1) % Math.max(1, visible.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => (a - 1 + visible.length) % Math.max(1, visible.length));
    } else if (e.key === 'Enter' && open && visible[active]) {
      e.preventDefault();
      pick(visible[active]!);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div ref={boxRef} className="relative">
      {name && <input type="hidden" name={name} value={value.id ?? ''} />}

      <div ref={fieldRef} className={boxClass}>
        <input
          id={id}
          type="text"
          autoComplete="off"
          disabled={disabled}
          className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
          placeholder={placeholder ?? t('جستجو…')}
          value={value.label}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          onFocus={() => setOpen(true)}
          onKeyDown={onKey}
          onChange={(e) => {
            // ⚠️ تایپ‌کردن شناسه را باطل می‌کند — وگرنه متنِ «سارا» با شناسهٔ
            // «مالک» ذخیره می‌شد. نامِ آزاد فقط اگر مجاز باشد می‌ماند.
            onChange({ id: null, label: allowFreeText ? e.target.value : e.target.value });
            setOpen(true);
          }}
        />
        {(value.label || value.id) && !disabled && (
          <button
            type="button"
            aria-label={t("پاک‌کردن")}
            onClick={() => { onChange({ id: null, label: '' }); setOpen(false); }}
            className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted"
          >
            <X className="size-3.5" />
          </button>
        )}
        <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      </div>

      {open && listBox && createPortal(
        <ul
          id={listId}
          role="listbox"
          // ⚠️ همان دلیلِ MultiSelect: فهرست باید **روی** مودال بنشیند.
          className="fixed z-[100] max-h-56 overflow-y-auto rounded-md border bg-popover p-1 shadow-md"
          style={{ top: listBox.top, left: listBox.left, width: listBox.width }}
        >
          {visible.length === 0 ? (
            <li className="px-2 py-1.5 text-xs text-muted-foreground">
              {allowFreeText ? t('در فهرست نیست — همین نام ثبت می‌شود.') : t('موردی پیدا نشد.')}
            </li>
          ) : visible.map((o, i) => (
            <li key={o.value}>
              <button
                type="button"
                role="option"
                aria-selected={o.value === value.id}
                onMouseEnter={() => setActive(i)}
                // mousedown چون blur ِ ورودی زودتر از click اتفاق می‌افتد.
                onMouseDown={(e) => { e.preventDefault(); pick(o); }}
                className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-start text-sm ${
                  i === active ? 'bg-muted' : ''
                }`}
              >
                <Check className={`size-3.5 shrink-0 ${o.value === value.id ? '' : 'invisible'}`} />
                <span className="flex-1 truncate">{o.label}</span>
                {o.hint && <span className="shrink-0 text-xs text-muted-foreground">{o.hint}</span>}
              </button>
            </li>
          ))}
        </ul>,
        document.body,
      )}
    </div>
  );
}

/**
 * انتخابگرِ **چندمقداری** با چیپ.
 *
 * ⚠️ گزینهٔ غیرفعال از منو پنهان می‌شود ولی اگر **انتخاب‌شده** باشد چیپش
 * می‌ماند؛ کاربر خودش با × برش می‌دارد (R-FORM-04).
 */
export function MultiSelect({
  options,
  selected,
  onChange,
  placeholder,
  name,
  id,
}: {
  options: Option[];
  selected: number[];
  onChange: (next: number[]) => void;
  placeholder?: string;
  name?: string;
  id?: string;
}) {
  const t = useT();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const byId = useMemo(() => new Map(options.map((o) => [o.value, o])), [options]);

  const available = useMemo(
    () => options.filter((o) => !o.disabled && !selected.includes(o.value) && matches(o, query)).slice(0, 50),
    [options, selected, query],
  );

  useEffect(() => {
    const onOutside = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, []);

  const fieldRef = useRef<HTMLDivElement>(null);
  const listBox = useFloatingList(open, fieldRef);

  return (
    <div ref={boxRef} className="relative">
      {/* هر انتخاب یک ورودیِ جدا، تا FormData آرایه بگیرد. */}
      {name && selected.map((v) => <input key={v} type="hidden" name={name} value={v} />)}

      <div ref={fieldRef} className={`${boxClass} h-auto min-h-9 flex-wrap py-1`}>
        {selected.map((v) => (
          <span
            key={v}
            className="flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-xs"
          >
            {byId.get(v)?.label ?? `#${v}`}
            <button
              type="button"
              aria-label={t("برداشتن")}
              onClick={() => onChange(selected.filter((s) => s !== v))}
              className="rounded hover:text-destructive"
            >
              <X className="size-3" />
            </button>
          </span>
        ))}

        <input
          id={id}
          type="text"
          autoComplete="off"
          className="min-w-24 flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
          placeholder={selected.length === 0 ? (placeholder ?? t('افزودن…')) : ''}
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onKeyDown={(e) => {
            // Backspace روی ورودیِ خالی، آخرین چیپ را برمی‌دارد.
            if (e.key === 'Backspace' && !query && selected.length > 0) {
              onChange(selected.slice(0, -1));
            }
          }}
        />
      </div>

      {open && available.length > 0 && listBox && createPortal(
        <ul
          role="listbox"
          // ⚠️ z بالاتر از مودال (z-50) تا فهرست رویش بنشیند، نه زیرش.
          className="fixed z-[100] max-h-56 overflow-y-auto rounded-md border bg-popover p-1 shadow-md"
          style={{ top: listBox.top, left: listBox.left, width: listBox.width }}
        >
          {available.map((o) => (
            <li key={o.value}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange([...selected, o.value]);
                  setQuery('');
                }}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-start text-sm hover:bg-muted"
              >
                <span className="flex-1 truncate">{o.label}</span>
                {o.hint && <span className="text-xs text-muted-foreground">{o.hint}</span>}
              </button>
            </li>
          ))}
        </ul>,
        document.body,
      )}
    </div>
  );
}
