'use client';

/**
 * فهرستِ انتخابی با جستجوی زنده — الگوی Combobox ِ shadcn: Popover + Command.
 *
 * ⚠️ جایگزینِ یک‌کلمه‌ایِ `NativeSelect` است. همان فرزندانِ
 * `<NativeSelectOption>` (یا `<option>`/`<optgroup>`) را می‌خواند و همان
 * `name`/`value`/`defaultValue`/`required`/`disabled` را می‌گیرد؛ مقدار در یک
 * `<input type="hidden" name>` فرستاده می‌شود، پس هیچ اکشنِ سرور و هیچ فرمِ
 * GET عوض نمی‌شود. تنها تفاوتِ امضا: `onChange(e)` ← `onValueChange(value)`.
 *
 * ⚠️ رفتارِ `<select>` عیناً حفظ شده: اگر مقدار با هیچ گزینه‌ای جور نباشد (یا
 * مقداری داده نشده باشد) **گزینهٔ اول** انتخاب‌شده است و همان فرستاده می‌شود —
 * فرم‌هایی مثلِ «عضو» ِ پرداخت روی همین تکیه دارند.
 *
 * ⚠️ چرا نه `combobox` ِ رجیستری: نسخهٔ فعلیِ آن روی Base UI ساخته شده و این
 * اپ روی Radix است؛ کتابخانهٔ دوم رفتارِ جهت (DirectionProvider) و فوکوسِ
 * دیالوگ‌ها را دوگانه می‌کرد. این همان الگوی مستندِ Popover + Command است.
 *
 * ⚠️ `modal` روی Popover: داخلِ Dialog، قفلِ اسکرولِ دیالوگ چرخِ ماوس را روی
 * فهرستِ پرتال‌شده می‌بلعید و فهرستِ بلند اسکرول نمی‌شد.
 */

import * as React from 'react';
import { CheckIcon, ChevronDownIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command';
import { NativeSelectOptGroup } from '@/components/ui/native-select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useT } from '@/i18n/client';
import { cn } from '@/lib/utils';

interface Choice {
  key: string;
  value: string;
  label: string;
  disabled: boolean;
}

interface ChoiceGroup {
  label: string | null;
  choices: Choice[];
}

function textOf(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) return textOf(node.props.children);
  return '';
}

/**
 * فرزندان ← گروه‌های گزینه. `.map`، `{شرط && …}` و Fragment باز می‌شوند.
 * ⚠️ فرزندی که از کامپوننتِ سرور بیاید پیشاپیش `<option>` ِ رندرشده است، نه
 * `NativeSelectOption`؛ هر دو را می‌خوانیم چون فقط `props` مهم است.
 */
function readChoices(children: React.ReactNode): ChoiceGroup[] {
  const groups: ChoiceGroup[] = [{ label: null, choices: [] }];
  const visit = (nodes: React.ReactNode, group: ChoiceGroup) => {
    React.Children.forEach(nodes, (child) => {
      if (!React.isValidElement<Record<string, unknown>>(child)) return;
      const props = child.props;
      const inner = props.children as React.ReactNode;
      if (child.type === React.Fragment) {
        visit(inner, group);
      } else if (child.type === 'optgroup' || child.type === NativeSelectOptGroup) {
        const next: ChoiceGroup = { label: String(props.label ?? ''), choices: [] };
        groups.push(next);
        visit(inner, next);
      } else {
        const label = textOf(inner).trim();
        group.choices.push({
          key: `${groups.indexOf(group)}:${group.choices.length}`,
          value: props.value === undefined ? label : String(props.value),
          label,
          disabled: Boolean(props.disabled),
        });
      }
    });
  };
  visit(children, groups[0]!);
  return groups.filter((g) => g.choices.length > 0);
}

/** «ي/ك» ِ عربی = «ی/ک»؛ نیم‌فاصله و کشیده نادیده — نام با هر صفحه‌کلیدی پیدا شود. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[‌ـ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface SearchableSelectProps {
  id?: string;
  name?: string;
  value?: string | number;
  defaultValue?: string | number;
  onValueChange?: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
  size?: 'sm' | 'default';
  /** کلاسِ دکمه — مثلاً `h-7 text-xs`. */
  className?: string;
  /** کلاسِ پوسته — مثلاً `w-full` برای فیلدِ تمام‌عرضِ فرم (همان قراردادِ NativeSelect). */
  containerClassName?: string;
  searchPlaceholder?: string;
  'aria-label'?: string;
  'aria-invalid'?: boolean;
  children?: React.ReactNode;
}

export function SearchableSelect({
  id,
  name,
  value,
  defaultValue,
  onValueChange,
  required,
  disabled,
  size = 'default',
  className,
  containerClassName,
  searchPlaceholder,
  'aria-label': ariaLabel,
  'aria-invalid': ariaInvalid,
  children,
}: SearchableSelectProps) {
  const t = useT();
  const controlled = value !== undefined;
  const initial = defaultValue === undefined ? '' : String(defaultValue);
  const [inner, setInner] = React.useState(initial);
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState('');
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);

  const groups = readChoices(children);
  const choices = groups.flatMap((g) => g.choices);

  // مقدارِ آغازینِ تازه (مثلاً مقدارِ برگشتی پس از خطای فرم) جایگزین می‌شود.
  React.useEffect(() => {
    if (!controlled) setInner(initial);
  }, [controlled, initial]);

  /** ⚠️ React 19 فرمِ کنترل‌نشده را پس از اکشن `reset` می‌کند؛ state باید همراهش برگردد. */
  React.useEffect(() => {
    const form = triggerRef.current?.form;
    if (!form || controlled) return;
    const onReset = () => setInner(initial);
    form.addEventListener('reset', onReset);
    return () => form.removeEventListener('reset', onReset);
  }, [controlled, initial]);

  const wanted = controlled ? String(value) : inner;
  const selected = choices.find((c) => c.value === wanted) ?? choices[0];
  const current = selected?.value ?? '';

  // ⚠️ با باز شدن، ردیفِ انتخاب‌شده برجسته و در دیدرس است — نه ردیفِ اولِ فهرستِ بلند.
  React.useEffect(() => {
    if (!open) return;
    setActive(selected?.key ?? '');
    const frame = requestAnimationFrame(() => {
      listRef.current?.querySelector('[data-selected="true"]')?.scrollIntoView({ block: 'nearest' });
    });
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const pick = (next: string) => {
    if (!controlled) setInner(next);
    // مثلِ `<select>`: انتخابِ دوبارهٔ همان گزینه رویدادِ تغییر نمی‌دهد.
    if (next !== current) onValueChange?.(next);
    setOpen(false);
  };

  return (
    <div data-slot="searchable-select" className={cn('relative w-fit', containerClassName)}>
      <Popover open={open} onOpenChange={setOpen} modal>
        <PopoverTrigger asChild>
          <Button
            ref={triggerRef}
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-label={ariaLabel}
            aria-invalid={ariaInvalid}
            disabled={disabled}
            data-size={size}
            className={cn(
              'h-9 w-full min-w-0 justify-between gap-2 px-3 font-normal data-[size=sm]:h-8',
              className,
            )}
          >
            {/*
              ⚠️ اندازه‌گیرِ نامرئی: همهٔ برچسب‌ها در همان یک خانهٔ grid با ارتفاعِ
              صفر، پس پهنای دکمه = بلندترین گزینه، مثلِ `<select>`. بدونِ آن در
              نوارهای فیلتر دکمه با هر انتخاب پهن و تنگ می‌شد و کنترل‌های کناری
              جابه‌جا می‌شدند.
            */}
            <span className="grid min-w-0 flex-1 text-start">
              <span className="col-start-1 row-start-1 truncate">{selected?.label || '—'}</span>
              {choices.map((choice) => (
                <span key={choice.key} aria-hidden="true" className="invisible col-start-1 row-start-1 h-0 truncate">
                  {choice.label}
                </span>
              ))}
            </span>
            <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-(--radix-popover-trigger-width) min-w-56 p-0">
          <Command
            value={active}
            onValueChange={setActive}
            filter={(_value, search, keywords) =>
              normalize((keywords ?? []).join(' ')).includes(normalize(search)) ? 1 : 0}
          >
            <CommandInput placeholder={searchPlaceholder ?? t('جستجو…')} />
            <CommandList ref={listRef}>
              <CommandEmpty>{t('نتیجه‌ای نیست')}</CommandEmpty>
              {groups.map((group, gi) => (
                <CommandGroup key={gi} heading={group.label ?? undefined}>
                  {group.choices.map((choice) => (
                    <CommandItem
                      key={choice.key}
                      value={choice.key}
                      keywords={[choice.label]}
                      disabled={choice.disabled}
                      onSelect={() => pick(choice.value)}
                    >
                      <span className="truncate">{choice.label || '—'}</span>
                      <CheckIcon
                        className={cn('ms-auto', choice.value === current ? 'opacity-100' : 'opacity-0')}
                      />
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {name && <input type="hidden" name={name} value={current} disabled={disabled} />}
      {required && (
        <input
          tabIndex={-1}
          aria-hidden="true"
          required
          disabled={disabled}
          value={current}
          onChange={() => {}}
          className="pointer-events-none absolute inset-0 opacity-0"
        />
      )}
    </div>
  );
}
