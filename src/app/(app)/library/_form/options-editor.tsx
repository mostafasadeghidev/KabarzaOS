'use client';

import { useState } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { useT } from '@/i18n/client';
import { cn } from '@/lib/utils';
import {
  formatAllowed, LIBRARY_OPTION_KINDS, LIBRARY_OPTION_ROLES, OPTION_KIND_LABELS, OPTION_ROLE_LABELS, parseAllowed,
  type CleanOption, type LibraryOptionKind, type LibraryOptionRole, type OptionInput,
} from '@/domain/library/model';

/** یک گزینه در فرم — مقدارهای مجاز به شکلِ «مقدار — توضیح» در هر خط. */
export interface OptionDraft {
  key: number;
  name: string;
  kind: LibraryOptionKind;
  role: LibraryOptionRole;
  description: string;
  value: string;
  defaultValue: string;
  element: string;
  target: string;
  allowedText: string;
  important: string;
  example: string;
}

export function optionDraft(key: number, o?: CleanOption): OptionDraft {
  return {
    key,
    name: o?.name ?? '',
    kind: o?.kind ?? 'attribute',
    role: o?.role ?? 'required',
    description: o?.description ?? '',
    value: o?.value ?? '',
    defaultValue: o?.defaultValue ?? '',
    element: o?.element ?? '',
    target: o?.target ?? '',
    allowedText: formatAllowed(o?.allowedValues ?? []),
    important: o?.important ?? '',
    example: o?.example ?? '',
  };
}

export function optionPayload(o: OptionDraft): OptionInput {
  return {
    name: o.name, kind: o.kind, role: o.role, description: o.description, value: o.value,
    defaultValue: o.defaultValue, element: o.element, target: o.target, allowedValues: parseAllowed(o.allowedText),
    important: o.important, example: o.example,
  };
}

/**
 * ویرایشگرِ گزینه‌ها (۲.۴۷.۰) — هر گزینه یک کارت: سطرِ اول همان چیزی که
 * همیشه لازم است (نام، مقدار، جایگاه، نوع، توضیح)، بقیه زیرِ «جزئیاتِ بیشتر».
 * ⚠️ کارتی که جزئیات دارد باز شروع می‌شود تا چیزی پنهان نماند.
 */
export function OptionsEditor({
  options,
  setOptions,
  nextKey,
}: {
  options: OptionDraft[];
  setOptions: (fn: (list: OptionDraft[]) => OptionDraft[]) => void;
  nextKey: () => number;
}) {
  const tr = useT();
  const patch = (key: number, p: Partial<OptionDraft>) =>
    setOptions((list) => list.map((o) => (o.key === key ? { ...o, ...p } : o)));
  const move = (from: number, to: number) => setOptions((list) => {
    if (to < 0 || to >= list.length) return list;
    const next = [...list];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item!);
    return next;
  });

  return (
    <div className="grid gap-3">
      {options.map((o, i) => (
        <OptionRow
          key={o.key}
          o={o}
          index={i}
          last={i === options.length - 1}
          patch={(p) => patch(o.key, p)}
          move={move}
          remove={() => setOptions((list) => list.filter((x) => x.key !== o.key))}
        />
      ))}
      <div className="flex flex-wrap gap-2">
        {LIBRARY_OPTION_ROLES.map((role) => (
          <Button
            key={role}
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setOptions((list) => [...list, { ...optionDraft(nextKey()), role }])}
          >
            <Plus />
            {tr('گزینهٔ «{r}»', { r: tr(OPTION_ROLE_LABELS[role]) })}
          </Button>
        ))}
      </div>
    </div>
  );
}

function OptionRow({
  o, index, last, patch, move, remove,
}: {
  o: OptionDraft;
  index: number;
  last: boolean;
  patch: (p: Partial<OptionDraft>) => void;
  move: (from: number, to: number) => void;
  remove: () => void;
}) {
  const tr = useT();
  const hasMore = Boolean(o.element || o.target || o.allowedText || o.important || o.example || o.defaultValue);
  const [open, setOpen] = useState(hasMore);
  const id = (f: string) => `opt-${f}-${o.key}`;
  return (
    <div className="grid gap-3 rounded-lg bg-muted/60 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold">{o.name ? <code dir="ltr" className="font-mono text-[13px]">{o.name}</code> : tr('گزینهٔ تازه')}</span>
        <div className="flex items-center gap-1">
          <IconButton type="button" variant="ghost" className="size-8" label={tr('بالاتر')} disabled={index === 0} onClick={() => move(index, index - 1)}>
            <ArrowUp className="size-3.5" />
          </IconButton>
          <IconButton type="button" variant="ghost" className="size-8" label={tr('پایین‌تر')} disabled={last} onClick={() => move(index, index + 1)}>
            <ArrowDown className="size-3.5" />
          </IconButton>
          <IconButton type="button" variant="ghost" className="size-8" label={tr('حذفِ این گزینه')} onClick={remove}>
            <Trash2 className="size-3.5" />
          </IconButton>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor={id('name')}>{tr('نام')}</FieldLabel>
          <Input id={id('name')} value={o.name} onChange={(e) => patch({ name: e.target.value })} placeholder="fs-rangeslider-element" dir="ltr" className="bg-card font-mono text-xs" maxLength={120} />
        </Field>
        <Field>
          <FieldLabel htmlFor={id('value')}>{tr('مقدار (اگر ثابت است)')}</FieldLabel>
          <Input id={id('value')} value={o.value} onChange={(e) => patch({ value: e.target.value })} placeholder="wrapper" dir="ltr" className="bg-card font-mono text-xs" maxLength={300} />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor={id('role')}>{tr('جایگاه')}</FieldLabel>
          <NativeSelect id={id('role')} value={o.role} containerClassName="w-full" onChange={(e) => patch({ role: e.target.value as LibraryOptionRole })}>
            {LIBRARY_OPTION_ROLES.map((r) => <NativeSelectOption key={r} value={r}>{tr(OPTION_ROLE_LABELS[r])}</NativeSelectOption>)}
          </NativeSelect>
        </Field>
        <Field>
          <FieldLabel htmlFor={id('kind')}>{tr('نوع')}</FieldLabel>
          <NativeSelect id={id('kind')} value={o.kind} containerClassName="w-full" onChange={(e) => patch({ kind: e.target.value as LibraryOptionKind })}>
            {LIBRARY_OPTION_KINDS.map((k) => <NativeSelectOption key={k} value={k}>{tr(OPTION_KIND_LABELS[k])}</NativeSelectOption>)}
          </NativeSelect>
        </Field>
      </div>
      <Field>
        <FieldLabel htmlFor={id('desc')}>{tr('چه کار می‌کند')}</FieldLabel>
        <Input id={id('desc')} value={o.description} onChange={(e) => patch({ description: e.target.value })} placeholder={tr('مثلاً: قابِ اصلیِ اسلایدر که بقیه داخلش‌اند')} dir="auto" className="bg-card" maxLength={500} />
      </Field>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-fit items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        <ChevronDown className={cn('size-3.5 transition-transform', open && 'rotate-180')} aria-hidden />
        {tr('جزئیاتِ بیشتر: المنت، مقدارهای مجاز، نکتهٔ مهم، مثال')}
      </button>
      {open && (
        <div className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor={id('element')}>{tr('روی چه المنتی')}</FieldLabel>
              <Input id={id('element')} value={o.element} onChange={(e) => patch({ element: e.target.value })} placeholder="Div Block, Image" dir="auto" className="bg-card" maxLength={200} />
            </Field>
            <Field>
              <FieldLabel htmlFor={id('target')}>{tr('داخل یا روی کدام المنت')}</FieldLabel>
              <Input id={id('target')} value={o.target} onChange={(e) => patch({ target: e.target.value })} placeholder='fs-rangeslider-element = "wrapper"' dir="auto" className="bg-card" maxLength={300} />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor={id('allowed')}>{tr('مقدارهای مجاز')}</FieldLabel>
              <Textarea id={id('allowed')} rows={3} value={o.allowedText} onChange={(e) => patch({ allowedText: e.target.value })} placeholder={'move — هر حرکت\nrelease — فقط پس از رها کردن'} dir="auto" className="bg-card font-mono text-xs" />
              <FieldDescription>{tr('هر خط یکی: «مقدار — توضیح».')}</FieldDescription>
            </Field>
            <div className="grid content-start gap-3">
              <Field>
                <FieldLabel htmlFor={id('default')}>{tr('پیش‌فرض')}</FieldLabel>
                <Input id={id('default')} value={o.defaultValue} onChange={(e) => patch({ defaultValue: e.target.value })} placeholder="move" dir="ltr" className="bg-card font-mono text-xs" maxLength={120} />
              </Field>
              <Field>
                <FieldLabel htmlFor={id('example')}>{tr('مثال')}</FieldLabel>
                <Input id={id('example')} value={o.example} onChange={(e) => patch({ example: e.target.value })} placeholder='fs-rangeslider-step = "5"' dir="ltr" className="bg-card font-mono text-xs" maxLength={500} />
              </Field>
            </div>
          </div>
          <Field>
            <FieldLabel htmlFor={id('important')}>{tr('نکتهٔ مهم')}</FieldLabel>
            <Input id={id('important')} value={o.important} onChange={(e) => patch({ important: e.target.value })} placeholder={tr('مثلاً: این المنت باید position: relative داشته باشد')} dir="auto" className="bg-card" maxLength={500} />
          </Field>
        </div>
      )}
    </div>
  );
}
