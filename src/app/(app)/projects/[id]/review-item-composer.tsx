'use client';

import { UserAvatar } from '@/components/user-avatar';
import { useEffect, useRef, useState } from 'react';
import { Plus, Timer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldLabel } from '@/components/ui/field';
import { Combobox, MultiSelect } from '@/components/ui/combobox';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { FileDrop } from '@/components/media/file-drop';
import { useT } from '@/i18n/client';
import { formatTimestamp, parseTimestamp } from '@/domain/files/video';

/** گزینه‌های فرم — `reviewFormOptions` (نقش‌های همین پروژه، بخش‌های تنظیمات). */
export interface ReviewFormOptions {
  roles: Array<{ id: number; name: string }>;
  areas: Array<{ id: number; name: string }>;
  assignees: Array<{ userId: number; label: string }>;
  priorities: Array<{ id: number; name: string }>;
}

/** یک موردِ نوشته‌شده، پیش از ثبت — در فرمِ دومرحله‌ای چند تا کنارِ هم می‌مانند. */
export interface ItemDraft {
  start: string;
  end: string;
  area: string;
  title: string;
  description: string;
  priorityTagId: number | null;
  assignee: { id: number | null; label: string };
  roleTagIds: number[];
  clientHidden: boolean;
  files: File[];
}

export function emptyDraft(roleTagIds: number[]): ItemDraft {
  return {
    start: '', end: '', area: '', title: '', description: '', priorityTagId: null,
    assignee: { id: null, label: '' }, roleTagIds, clientHidden: false, files: [],
  };
}

/** پیش‌نویس ← فرم برای `addReviewItemAction`. */
export function itemFormData(reviewId: number, d: ItemDraft): FormData {
  const fd = new FormData();
  fd.set('reviewId', String(reviewId));
  fd.set('start', d.start);
  fd.set('end', d.end);
  fd.set('area', d.area);
  fd.set('title', d.title);
  fd.set('description', d.description);
  if (d.priorityTagId) fd.set('priorityTagId', String(d.priorityTagId));
  if (d.assignee.id) fd.set('assignedTo', String(d.assignee.id));
  else for (const r of d.roleTagIds) fd.append('roleTagIds', String(r));
  if (d.clientHidden) fd.set('clientHidden', '1');
  for (const f of d.files) fd.append('media', f);
  return fd;
}

/** زمانِ نامعتبر را پیش از ارسال می‌گیرد؛ تهی مجاز است. */
function badTime(value: string): boolean {
  return value.trim() !== '' && parseTimestamp(value) === null;
}

/**
 * نوشتنِ یک مورد — در فرمِ «بازبینیِ تازه» (مرحلهٔ دوم) و در صفحهٔ بازبینی.
 *
 * ⚠️ کنترل‌شده، نه `<form action>`: پس از «افزودن» **همهٔ** فیلدها خالی
 * می‌شوند (درخواستِ کاربر) و نقش‌ها به نقش‌های بازبینی برمی‌گردند؛ reset ِ
 * خودکارِ React روی فیلدهای کنترل‌شده قابلِ اعتماد نبود.
 * اسکرین‌شاتِ چسبانده داخلِ همین قاب به **همین مورد** می‌چسبد.
 */
export function ReviewItemComposer({
  options,
  defaultRoles,
  clientVisible,
  currentTime,
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  options: ReviewFormOptions;
  /** نقش‌های مخاطبِ بازبینی — پیش‌فرضِ هر موردِ تازه. */
  defaultRoles: number[];
  clientVisible: boolean;
  /** فقط ویدئوی بارگذاری‌شده زمانِ جاری را می‌دهد؛ قابِ لوم/یوتیوب نه. */
  currentTime?: (() => number | null) | null;
  /** ویرایشِ پیش‌نویس. */
  initial?: ItemDraft | null;
  submitLabel: string;
  /** خطا را برمی‌گرداند یا `null`؛ با `null` فرم خالی می‌شود. */
  onSubmit: (draft: ItemDraft) => Promise<string | null> | string | null;
  onCancel?: () => void;
}) {
  const t = useT();
  const [draft, setDraft] = useState<ItemDraft>(() => initial ?? emptyDraft(defaultRoles));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (initial) setDraft(initial); }, [initial]);
  const set = <K extends keyof ItemDraft>(key: K, value: ItemDraft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  const submit = async () => {
    if (draft.title.trim() === '') { setError(t('عنوانِ مورد الزامی است.')); titleRef.current?.focus(); return; }
    if (badTime(draft.start) || badTime(draft.end)) { setError(t('زمان را به شکلِ ۱:۲۳ بنویسید.')); return; }
    setBusy(true);
    const result = await onSubmit({ ...draft, title: draft.title.trim() });
    setBusy(false);
    if (result) { setError(result); return; }
    setError(null);
    setDraft(emptyDraft(defaultRoles));
    titleRef.current?.focus();
  };

  const stamp = (key: 'start' | 'end') => {
    const now = currentTime?.();
    if (now !== null && now !== undefined) set(key, formatTimestamp(now));
  };

  return (
    <FileDrop
      files={draft.files}
      onAdd={(added) => setDraft((d) => ({ ...d, files: [...d.files, ...added] }))}
      onRemove={(i) => setDraft((d) => ({ ...d, files: d.files.filter((_, j) => j !== i) }))}
      title={t('اسکرین‌شاتِ همین مورد')}
      className="rounded-lg border border-dashed p-3"
      footer={(
        <>
          {error && <p className="text-xs text-destructive">{t(error)}</p>}
          <div className="flex justify-end gap-2">
            {onCancel && <Button type="button" size="sm" variant="ghost" onClick={onCancel}>{t('بستن')}</Button>}
            <Button type="button" size="sm" disabled={busy} onClick={() => void submit()}>
              {busy ? <Spinner /> : <Plus className="size-4" />}
              {submitLabel}
            </Button>
          </div>
        </>
      )}
    >
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-end gap-3">
        <Field>
          <FieldLabel htmlFor="ri-start">{t('زمان')}</FieldLabel>
          <div className="flex items-center gap-1" dir="ltr">
            <Input id="ri-start" value={draft.start} onChange={(e) => set('start', e.target.value)} placeholder="1:23" className="num w-16" />
            <span className="text-muted-foreground">–</span>
            <Input value={draft.end} onChange={(e) => set('end', e.target.value)} placeholder="1:40" className="num w-16" aria-label={t('پایان')} />
          </div>
        </Field>
        <Field>
          <FieldLabel htmlFor="ri-area">{t('بخش')}</FieldLabel>
          {/* فهرستِ تنظیمات + متنِ آزاد؛ تسک فقط متن را نگه می‌دارد. */}
          <Combobox
            id="ri-area"
            options={options.areas.map((a) => ({ value: a.id, label: a.name }))}
            value={{ id: options.areas.find((a) => a.name === draft.area)?.id ?? null, label: draft.area }}
            onChange={(v) => set('area', v.label)}
            allowFreeText
            placeholder={t('انتخاب یا تایپ…')}
          />
        </Field>
      </div>
      {currentTime && (
        <div className="flex gap-2">
          <Button type="button" size="xs" variant="ghost" onClick={() => stamp('start')}><Timer className="size-3.5" />{t('شروع = لحظهٔ فعلی')}</Button>
          <Button type="button" size="xs" variant="ghost" onClick={() => stamp('end')}><Timer className="size-3.5" />{t('پایان = لحظهٔ فعلی')}</Button>
        </div>
      )}
      <Field>
        <FieldLabel htmlFor="ri-title">{t('عنوانِ مورد')}</FieldLabel>
        <Input
          ref={titleRef}
          id="ri-title"
          value={draft.title}
          maxLength={200}
          onChange={(e) => set('title', e.target.value)}
          // Enter ثبت می‌کند — ثبتِ پشتِ سرِ همِ موردهای یک ویدئو.
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void submit(); } }}
          placeholder={t('مثلاً فاصلهٔ منوی موبایل کم است')}
        />
      </Field>
      <Textarea
        value={draft.description}
        onChange={(e) => set('description', e.target.value)}
        rows={2}
        placeholder={t('توضیح (اختیاری) — اسکرین‌شات را هم می‌شود چسباند.')}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="ri-priority">{t('اولویت…')}</FieldLabel>
          <NativeSelect
            id="ri-priority"
            containerClassName="w-full"
            value={draft.priorityTagId ? String(draft.priorityTagId) : ''}
            onChange={(e) => set('priorityTagId', Number(e.target.value) || null)}
          >
            <NativeSelectOption value="">—</NativeSelectOption>
            {options.priorities.map((p) => <NativeSelectOption key={p.id} value={p.id}>{p.name}</NativeSelectOption>)}
          </NativeSelect>
        </Field>
        {options.assignees.length > 0 && (
          <Field>
            <FieldLabel htmlFor="ri-assignee">{t('تخصیص به…')}</FieldLabel>
            <Combobox
              id="ri-assignee"
              options={options.assignees.map((a) => ({ value: a.userId, label: a.label, media: <UserAvatar userId={a.userId} name={a.label} size="xs" /> }))}
              value={draft.assignee}
              onChange={(v) => set('assignee', v)}
              placeholder={t('نامِ عضو را تایپ کنید…')}
            />
          </Field>
        )}
        {draft.assignee.id === null && (
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor="ri-roles">{t('تخصیص به نقش')}</FieldLabel>
            {options.roles.length > 0 ? (
              <MultiSelect
                id="ri-roles"
                options={options.roles.map((r) => ({ value: r.id, label: r.name }))}
                selected={draft.roleTagIds}
                onChange={(v) => set('roleTagIds', v)}
                placeholder={t('نقش‌ها…')}
              />
            ) : (
              <p className="text-xs text-muted-foreground">{t('هنوز نقشی به اعضای این پروژه سپرده نشده.')}</p>
            )}
          </Field>
        )}
      </div>
      {/* پنهان‌کردنِ تک‌مورد فقط وقتی معنا دارد که خودِ بازبینی برای کارفرما آشکار است. */}
      {clientVisible && (
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={draft.clientHidden} onCheckedChange={(v) => set('clientHidden', v === true)} />
          {t('این مورد پنهان از کارفرما')}
        </label>
      )}
    </FileDrop>
  );
}
