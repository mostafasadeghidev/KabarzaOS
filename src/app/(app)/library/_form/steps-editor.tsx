'use client';

import { ArrowDown, ArrowUp, Check, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { MediaPicker } from '@/components/media/media-picker';
import { useT } from '@/i18n/client';
import { cn } from '@/lib/utils';
import { LANGUAGE_LABELS, type LibraryLanguage } from '@/domain/library/model';
import type { LibraryMedia } from '@/server/library/service';

/**
 * یک گام در فرم. ⚠️ تکه‌کد و گزینه با `key` ِ پیش‌نویس‌شان ارجاع می‌شوند، نه
 * جایگاه: جابه‌جا کردنِ تکه‌ها در فرم نباید گام را به تکهٔ دیگری وصل کند.
 * هنگامِ ارسال به جایگاه/نام تبدیل می‌شوند.
 */
export interface StepDraft {
  key: number;
  title: string;
  body: string;
  blockKeys: number[];
  optionKeys: number[];
  mediaIds: number[];
}

export const emptyStep = (key: number): StepDraft => ({ key, title: '', body: '', blockKeys: [], optionKeys: [], mediaIds: [] });

/** نامِ فیلدِ تصویرهای تازهٔ یک گام — سرور با همین نام جدایشان می‌کند. */
export const stepMediaName = (key: number | string) => `stepmedia-${key}`;

function toggle(list: number[], id: number): number[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

/**
 * ویرایشگرِ گام‌ها (۲.۴۷.۰) — هر گام: عنوان، توضیح، تصویر (چسباندنِ
 * اسکرین‌شات روی همان گام)، و تیک زدنِ تکه‌کد و گزینه‌ای که در همین گام لازم
 * است. صفحهٔ مورد هر کدام را دقیقاً زیرِ همان گام نشان می‌دهد.
 */
export function StepsEditor({
  steps,
  setSteps,
  blocks,
  options,
  media,
  allowUpload,
  nextKey,
}: {
  steps: StepDraft[];
  setSteps: (fn: (list: StepDraft[]) => StepDraft[]) => void;
  blocks: ReadonlyArray<{ key: number; label: string; language: LibraryLanguage }>;
  options: ReadonlyArray<{ key: number; name: string; value: string }>;
  /** تصویرهای ذخیره‌شدهٔ همین مورد — برای وصل به گام. */
  media: readonly LibraryMedia[];
  /** پیشنهادِ ویرایش تصویرِ تازه نمی‌آورد. */
  allowUpload: boolean;
  nextKey: () => number;
}) {
  const tr = useT();
  const images = media.filter((m) => m.kind === 'image');
  const named = options.filter((o) => o.name.trim());
  const patch = (key: number, p: Partial<StepDraft>) => setSteps((list) => list.map((s) => (s.key === key ? { ...s, ...p } : s)));
  const move = (from: number, to: number) => setSteps((list) => {
    if (to < 0 || to >= list.length) return list;
    const next = [...list];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item!);
    return next;
  });

  return (
    <div className="grid gap-3">
      {steps.map((s, i) => {
        const bodyField = (
          <Field>
            <FieldLabel htmlFor={`st-body-${s.key}`}>{tr('توضیح (اختیاری)')}</FieldLabel>
            <Textarea
              id={`st-body-${s.key}`}
              rows={3}
              value={s.body}
              onChange={(e) => patch(s.key, { body: e.target.value })}
              dir="auto"
              className="bg-card"
              placeholder={tr('جزئیاتِ این گام. نامِ کلاس یا attribute را بینِ دو بک‌تیک بنویسید تا کپی‌شدنی شود: `macy-container`')}
            />
            {allowUpload && <FieldDescription>{tr('اسکرین‌شاتِ این گام را همین‌جا بکشید و رها کنید یا Ctrl+V بزنید.')}</FieldDescription>}
          </Field>
        );
        return (
          <div key={s.key} className="grid gap-3 rounded-lg bg-muted/60 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-sm font-semibold">
                <span className="flex size-6 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground tabular-nums">{i + 1}</span>
                {tr('گامِ {n}', { n: i + 1 })}
              </span>
              <div className="flex items-center gap-1">
                <IconButton type="button" variant="ghost" className="size-8" label={tr('بالاتر')} disabled={i === 0} onClick={() => move(i, i - 1)}>
                  <ArrowUp className="size-3.5" />
                </IconButton>
                <IconButton type="button" variant="ghost" className="size-8" label={tr('پایین‌تر')} disabled={i === steps.length - 1} onClick={() => move(i, i + 1)}>
                  <ArrowDown className="size-3.5" />
                </IconButton>
                <IconButton type="button" variant="ghost" className="size-8" label={tr('حذفِ این گام')} onClick={() => setSteps((list) => list.filter((x) => x.key !== s.key))}>
                  <Trash2 className="size-3.5" />
                </IconButton>
              </div>
            </div>
            <Field>
              <FieldLabel htmlFor={`st-title-${s.key}`}>{tr('چه کاری انجام شود')}</FieldLabel>
              <Input
                id={`st-title-${s.key}`}
                value={s.title}
                onChange={(e) => patch(s.key, { title: e.target.value })}
                dir="auto"
                className="bg-card"
                maxLength={200}
                placeholder={tr('مثلاً: اسکریپت را در head ِ صفحه بگذارید')}
              />
            </Field>
            {allowUpload ? <MediaPicker name={stepMediaName(s.key)}>{bodyField}</MediaPicker> : bodyField}

            {images.length > 0 && (
              <PickRow label={tr('تصویرهای ذخیره‌شده')}>
                {images.map((m) => {
                  const on = s.mediaIds.includes(m.id);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      aria-pressed={on}
                      aria-label={m.name}
                      onClick={() => patch(s.key, { mediaIds: toggle(s.mediaIds, m.id) })}
                      className={cn(
                        'relative size-14 overflow-hidden rounded-md border-2 transition',
                        on ? 'border-primary' : 'border-transparent opacity-70 hover:opacity-100',
                      )}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- مسیرِ گیت‌شدهٔ فایل */}
                      <img src={`/api/files/${m.fileId}?thumb`} alt="" className="size-full object-cover" />
                      {on && (
                        <span className="absolute end-0.5 top-0.5 grid size-4 place-items-center rounded-full bg-primary text-primary-foreground">
                          <Check className="size-3" aria-hidden />
                        </span>
                      )}
                    </button>
                  );
                })}
              </PickRow>
            )}
            {blocks.length > 0 && (
              <PickRow label={tr('کدِ این گام')}>
                {blocks.map((b, bi) => (
                  <Chip key={b.key} on={s.blockKeys.includes(b.key)} onClick={() => patch(s.key, { blockKeys: toggle(s.blockKeys, b.key) })}>
                    {b.label || tr('تکهٔ {n}', { n: bi + 1 })}
                    <span className="font-mono text-[10px] opacity-70" dir="ltr">{LANGUAGE_LABELS[b.language]}</span>
                  </Chip>
                ))}
              </PickRow>
            )}
            {named.length > 0 && (
              <PickRow label={tr('گزینه‌های این گام')}>
                {named.map((o) => (
                  <Chip key={o.key} on={s.optionKeys.includes(o.key)} onClick={() => patch(s.key, { optionKeys: toggle(s.optionKeys, o.key) })}>
                    <span className="font-mono" dir="ltr">{o.value.trim() ? `${o.name.trim()} = ${o.value.trim()}` : o.name.trim()}</span>
                  </Chip>
                ))}
              </PickRow>
            )}
          </div>
        );
      })}
      <Button type="button" size="sm" variant="outline" className="w-fit" onClick={() => setSteps((list) => [...list, emptyStep(nextKey())])}>
        <Plus />
        {tr('افزودنِ گام')}
      </Button>
    </div>
  );
}

function PickRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors',
        on ? 'border-primary bg-primary/10 text-primary' : 'bg-card hover:border-primary/40',
      )}
    >
      {on && <Check className="size-3" aria-hidden />}
      {children}
    </button>
  );
}
