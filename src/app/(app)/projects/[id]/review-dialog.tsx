'use client';

import { useActionState, useEffect, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Check, Eye, EyeOff } from 'lucide-react';
import { saveReviewAction, type ReviewFormState } from '../_form/review-actions';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { MultiSelect } from '@/components/ui/combobox';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { MediaPicker } from '@/components/media/media-picker';
import { useActionToast } from '@/components/ui/toast';
import { useT } from '@/i18n/client';
import { parseVideoUrl, PROVIDER_LABEL } from '@/domain/files/video';
import { PICKABLE_SOURCES, SOURCE_LABELS } from '@/domain/projects/reviews';
import type { ReviewSource } from '@/db/schema/projects';

export interface ReviewFormValues {
  id: number;
  title: string;
  videoUrl: string | null;
  source: ReviewSource;
  notes: string;
  roles: Array<{ id: number }>;
  clientVisible: boolean;
}

function Submit({ editing }: { editing: boolean }) {
  const { pending } = useFormStatus();
  const t = useT();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? <><Spinner />{t('در حالِ ذخیره…')}</> : editing ? t('ذخیرهٔ تغییرات') : t('ساختِ بازبینی')}
    </Button>
  );
}

/**
 * ساخت و ویرایشِ بازبینی.
 *
 * ⚠️ «برای کارفرما نمایش داده شود» پیش‌فرض **خاموش** است: بیشترِ بازبینی‌ها
 * گفتگوی داخلیِ تیم است. مخاطبِ خالی یعنی کلِ تیمِ پروژه؛ با انتخابِ نقش فقط
 * دارندگانِ همان نقش‌ها (و مدیران) می‌بینند.
 */
export function ReviewDialog({
  open,
  onOpenChange,
  projectId,
  roleOptions,
  review,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: number;
  roleOptions: Array<{ id: number; name: string }>;
  /** حاضر = ویرایش. */
  review?: ReviewFormValues | null;
  onSaved?: (reviewId: number) => void;
}) {
  const t = useT();
  const [state, formAction] = useActionState<ReviewFormState, FormData>(saveReviewAction, {});
  useActionToast(state, { success: review ? 'تغییرات ذخیره شد.' : 'بازبینی ساخته شد.' });

  const [url, setUrl] = useState(review?.videoUrl ?? '');
  const [roles, setRoles] = useState<number[]>(review?.roles.map((r) => r.id) ?? []);
  const [clientVisible, setClientVisible] = useState(review?.clientVisible ?? false);
  // هر بار که دیالوگ باز می‌شود از مقدارِ ذخیره‌شده — نه از ویرایشِ نیمه‌کارهٔ قبلی.
  useEffect(() => {
    if (!open) return;
    setUrl(review?.videoUrl ?? '');
    setRoles(review?.roles.map((r) => r.id) ?? []);
    setClientVisible(review?.clientVisible ?? false);
  }, [open, review]);

  useEffect(() => {
    if (!state.ok || !state.reviewId) return;
    onOpenChange(false);
    onSaved?.(state.reviewId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const detected = url.trim() ? parseVideoUrl(url) : null;
  const pickedSource = review && PICKABLE_SOURCES.includes(review.source) ? review.source : 'video';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{review ? t('ویرایشِ بازبینی') : t('بازبینیِ تازه')}</DialogTitle>
          <DialogDescription>
            {t('ویدئوی لوم یا هر بررسیِ دیگر — موردهایش بعد از ساخت، یکی‌یکی تسک می‌شوند.')}
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="grid gap-4">
          <input type="hidden" name="projectId" value={projectId} />
          {review && <input type="hidden" name="reviewId" value={review.id} />}

          <Field>
            <FieldLabel htmlFor="rv-title">{t('عنوان')}</FieldLabel>
            <Input id="rv-title" name="title" required maxLength={200} defaultValue={review?.title ?? ''}
              placeholder={t('مثلاً بازبینیِ نسخهٔ موبایل')} autoFocus />
          </Field>

          <Field>
            <FieldLabel htmlFor="rv-url">{t('پیوندِ ویدئو')}</FieldLabel>
            <Input id="rv-url" name="videoUrl" dir="ltr" value={url} onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.loom.com/share/…" />
            <FieldDescription>
              {detected
                ? <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400"><Check className="size-3.5" />{t('{provider} شناسایی شد — داخلِ صفحه پخش می‌شود.', { provider: PROVIDER_LABEL[detected.provider] })}</span>
                : t('Loom، YouTube یا Vimeo داخلِ صفحه پخش می‌شوند. ویدئوی خودتان را هم می‌توانید پایین‌تر بارگذاری کنید.')}
            </FieldDescription>
          </Field>

          {!detected && (
            <Field>
              <FieldLabel htmlFor="rv-source">{t('منبع')}</FieldLabel>
              <NativeSelect id="rv-source" name="source" containerClassName="w-full" defaultValue={pickedSource}>
                {PICKABLE_SOURCES.map((s) => (
                  <NativeSelectOption key={s} value={s}>
                    {s === 'video' ? t('ویدئو (خودکار)') : t(SOURCE_LABELS[s])}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
          )}

          <Field>
            <FieldLabel htmlFor="rv-roles">{t('مخاطب')}</FieldLabel>
            <MultiSelect
              id="rv-roles"
              name="roleTagIds"
              options={roleOptions.map((r) => ({ value: r.id, label: r.name }))}
              selected={roles}
              onChange={setRoles}
              placeholder={t('کلِ تیمِ پروژه')}
            />
            <FieldDescription>
              {roles.length === 0
                ? t('خالی یعنی همهٔ اعضای پروژه می‌بینند. با انتخابِ نقش فقط دارندگانِ همان نقش‌ها (و مدیران) می‌بینند.')
                : t('فقط دارندگانِ این نقش‌ها و مدیرانِ پروژه می‌بینند؛ موردها هم به همین نقش‌ها سپرده می‌شوند.')}
            </FieldDescription>
          </Field>

          {/* ⚠️ پیش‌فرض خاموش — کارفرما فقط وقتی می‌بیند که عمداً روشن شود. */}
          <label className="flex items-start gap-3 rounded-lg border p-3">
            <Switch name="clientVisible" checked={clientVisible} onCheckedChange={setClientVisible} className="mt-0.5" />
            <span className="grid gap-0.5">
              <span className="flex items-center gap-1.5 text-sm font-medium">
                {clientVisible ? <Eye className="size-4" /> : <EyeOff className="size-4 text-muted-foreground" />}
                {t('برای کارفرما نمایش داده شود')}
              </span>
              <span className="text-xs text-muted-foreground">
                {clientVisible
                  ? t('کارفرمای پروژه این بازبینی و موردهایش را می‌بیند.')
                  : t('کارفرما نه این بازبینی را می‌بیند، نه تسک‌هایی را که از آن ساخته می‌شوند.')}
              </span>
            </span>
          </label>

          <MediaPicker>
            <Field>
              <FieldLabel htmlFor="rv-notes">{t('یادداشت')}</FieldLabel>
              <Textarea id="rv-notes" name="notes" rows={4} defaultValue={review?.notes ?? ''}
                placeholder={t('خلاصهٔ بررسی، پیوندِ فیگما، متنِ پیامِ واتس‌اپ…')} />
            </Field>
          </MediaPicker>

          {state.error && <p className="text-sm text-destructive">{t(state.error)}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t('انصراف')}</Button>
            <Submit editing={Boolean(review)} />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
