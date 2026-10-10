'use client';

import { useFreshKey } from '@/hooks/use-fresh-key';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Eye, EyeOff, Film, Paperclip, Pencil, Play, Trash2, Upload, X } from 'lucide-react';
import {
  addReviewItemAction, addReviewMediaAction, saveReviewAction,
} from '../_form/review-actions';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { MultiSelect } from '@/components/ui/combobox';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { FileDrop } from '@/components/media/file-drop';
import { useToast } from '@/components/ui/toast';
import { useT } from '@/i18n/client';
import { humanSize, MAX_SIZE } from '@/domain/files/upload';
import { parseVideoUrl, PROVIDER_LABEL } from '@/domain/files/video';
import { cn } from '@/lib/utils';
import {
  itemFormData, ReviewItemComposer, type ItemDraft, type ReviewFormOptions,
} from './review-item-composer';

export interface ReviewFormValues {
  id: number;
  title: string;
  videoUrl: string | null;
  notes: string;
  roles: Array<{ id: number }>;
  /** اشخاصِ مخاطب (۲.۲۲.۰). */
  people?: Array<{ id: number }>;
  clientVisible: boolean;
}

interface Info {
  title: string;
  url: string;
  video: File | null;
  roles: number[];
  people: number[];
  clientVisible: boolean;
  notes: string;
  images: File[];
}

const emptyInfo = (review?: ReviewFormValues | null): Info => ({
  title: review?.title ?? '',
  url: review?.videoUrl ?? '',
  video: null,
  roles: review?.roles.map((r) => r.id) ?? [],
  people: review?.people?.map((p) => p.id) ?? [],
  clientVisible: review?.clientVisible ?? false,
  notes: review?.notes ?? '',
  images: [],
});

/** بخشِ اطلاعاتِ بازبینی بیش از ۱۰ تصویر را دسته‌دسته می‌فرستد (سقفِ هر ارسال). */
function chunks<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/**
 * ساخت و ویرایشِ بازبینی.
 *
 * ساخت **دومرحله‌ای** است تا سازنده لازم نباشد بعد از ساخت به صفحهٔ بازبینی
 * برود و موردها را جدا اضافه کند:
 *  ۱. اطلاعات — عنوان، ویدئو (لینک یا بارگذاری)، مخاطب، «برای کارفرما»،
 *     یادداشت و تصاویر (رها کن / بچسبان).
 *  ۲. موردها — هر مورد با زمان، بخش، اسکرین‌شات و نقش؛ با Enter پشتِ سرِ هم.
 * «ساختِ بازبینی» همه را با هم ثبت می‌کند. ⚠️ ترتیب: بازبینی (با ویدئو) ←
 * تصاویر (دسته‌های ۱۰تایی) ← موردها یکی‌یکی؛ اگر جایی شکست بخورد، آنچه ثبت
 * شده نگه داشته می‌شود و دکمه فقط باقی‌مانده را دوباره می‌فرستد.
 *
 * ویرایش یک‌مرحله‌ای است — موردها و تصاویر در خودِ صفحهٔ بازبینی‌اند.
 *
 * ⚠️ «برای کارفرما نمایش داده شود» پیش‌فرض **خاموش** است.
 */
function ReviewDialogBody({
  open,
  onOpenChange,
  projectId,
  options,
  review,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: number;
  options: ReviewFormOptions;
  /** حاضر = ویرایش. */
  review?: ReviewFormValues | null;
  onSaved?: (reviewId: number) => void;
}) {
  const t = useT();
  const { show } = useToast();
  const editing = Boolean(review);
  const [step, setStep] = useState<1 | 2>(1);
  const [info, setInfo] = useState<Info>(() => emptyInfo(review));
  const [drafts, setDrafts] = useState<ItemDraft[]>([]);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** بازبینیِ ساخته‌شده — ارسالِ دوباره پس از خطا آن را از نو نمی‌سازد. */
  const created = useRef<{ id: number; imagesSent: boolean } | null>(null);
  const videoInput = useRef<HTMLInputElement>(null);

  // هر بار که دیالوگ باز می‌شود از نو — نه از کارِ نیمه‌تمامِ قبلی.
  useEffect(() => {
    if (!open) return;
    setStep(1);
    setInfo(emptyInfo(review));
    setDrafts([]);
    setEditIndex(null);
    setError(null);
    setBusy(null);
    created.current = null;
    // ⚠️ وابسته به شناسه، نه خودِ شیء: صفحه با هر بارگذاریِ دوباره شیءِ تازه‌ای
    // می‌سازد و فرمِ در حالِ ویرایش وسطِ تایپ پاک می‌شد.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, review?.id]);

  const set = <K extends keyof Info>(key: K, value: Info[K]) => setInfo((s) => ({ ...s, [key]: value }));
  const detected = info.url.trim() ? parseVideoUrl(info.url) : null;

  const infoForm = () => {
    const fd = new FormData();
    fd.set('projectId', String(projectId));
    if (review) fd.set('reviewId', String(review.id));
    fd.set('title', info.title);
    fd.set('videoUrl', info.url);
    fd.set('notes', info.notes);
    for (const r of info.roles) fd.append('roleTagIds', String(r));
    for (const u of info.people) fd.append('userIds', String(u));
    if (info.clientVisible) fd.set('clientVisible', '1');
    if (info.video) fd.append('media', info.video);
    return fd;
  };

  const save = async () => {
    if (info.title.trim() === '') { setStep(1); setError(t('عنوانِ بازبینی الزامی است.')); return; }
    setError(null);

    // ویرایش: فقط اطلاعات.
    if (review) {
      setBusy(t('در حالِ ذخیره…'));
      const result = await saveReviewAction({}, infoForm());
      setBusy(null);
      if (result.error) { setError(result.error); return; }
      show(t('تغییرات ذخیره شد.'));
      onOpenChange(false);
      onSaved?.(review.id);
      return;
    }

    // ۱) خودِ بازبینی (با ویدئوی بارگذاری‌شده).
    if (!created.current) {
      setBusy(t('ساختِ بازبینی…'));
      const result = await saveReviewAction({}, infoForm());
      if (result.error || !result.reviewId) { setBusy(null); setError(result.error ?? 'بازبینی ذخیره نشد.'); return; }
      created.current = { id: result.reviewId, imagesSent: false };
    }
    const reviewId = created.current.id;

    // ۲) تصاویر — دسته‌های ۱۰تایی.
    if (!created.current.imagesSent && info.images.length > 0) {
      for (const [i, part] of chunks(info.images, 10).entries()) {
        setBusy(t('بارگذاریِ تصاویر… ({n} از {total})', { n: i + 1, total: Math.ceil(info.images.length / 10) }));
        const fd = new FormData();
        for (const f of part) fd.append('media', f);
        const result = await addReviewMediaAction(reviewId, fd);
        if (result.error) { setBusy(null); setError(result.error); return; }
      }
    }
    created.current.imagesSent = true;

    // ۳) موردها یکی‌یکی — ثبت‌شده‌ها از فهرست می‌روند تا تلاشِ دوباره تکرارشان نکند.
    let left = [...drafts];
    for (const [i, draft] of drafts.entries()) {
      setBusy(t('ثبتِ موردها… ({n} از {total})', { n: i + 1, total: drafts.length }));
      const result = await addReviewItemAction({}, itemFormData(reviewId, draft));
      if (result.error) {
        setBusy(null);
        setDrafts(left);
        setStep(2);
        setError(t('بازبینی ساخته شد، ولی موردِ «{title}» ثبت نشد: {error}', { title: draft.title, error: t(result.error) }));
        return;
      }
      left = left.slice(1);
    }

    setBusy(null);
    show(drafts.length > 0
      ? t('بازبینی با {n} مورد ساخته شد.', { n: drafts.length })
      : t('بازبینی ساخته شد.'));
    onOpenChange(false);
    onSaved?.(reviewId);
  };

  const infoStep = (
    <div className="grid gap-4">
      <Field>
        <FieldLabel htmlFor="rv-title">{t('عنوان')}</FieldLabel>
        <Input id="rv-title" value={info.title} onChange={(e) => set('title', e.target.value)} maxLength={200}
          placeholder={t('مثلاً بازبینیِ نسخهٔ موبایل')} autoFocus />
      </Field>

      <Field>
        <FieldLabel htmlFor="rv-url">{t('ویدئو')}</FieldLabel>
        <Input id="rv-url" dir="ltr" value={info.url} onChange={(e) => set('url', e.target.value)}
          placeholder="https://www.loom.com/share/…" />
        <FieldDescription>
          {detected
            ? <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400"><Check className="size-3.5" />{t('{provider} شناسایی شد — داخلِ صفحه پخش می‌شود.', { provider: PROVIDER_LABEL[detected.provider] })}</span>
            : t('پیوندِ Loom، YouTube یا Vimeo — یا ویدئوی خودتان را بارگذاری کنید.')}
        </FieldDescription>
        {!detected && (
          <div className="flex flex-wrap items-center gap-2">
            <input ref={videoInput} type="file" hidden accept="video/mp4,video/webm,video/quicktime"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                e.target.value = '';
                if (f && f.size > MAX_SIZE.attachment) { setError(t('حجمِ ویدئو بیش از {size} است.', { size: humanSize(MAX_SIZE.attachment, t) })); return; }
                set('video', f);
              }} />
            {info.video ? (
              <span className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-xs">
                <Film className="size-3.5" />
                <span className="max-w-56 truncate" dir="ltr">{info.video.name}</span>
                <span className="num text-muted-foreground">{humanSize(info.video.size, t)}</span>
                <button type="button" aria-label={t('حذف')} onClick={() => set('video', null)}><X className="size-3.5" /></button>
              </span>
            ) : (
              <Button type="button" size="xs" variant="outline" onClick={() => videoInput.current?.click()}>
                <Upload className="size-3.5" />{t('بارگذاریِ ویدئو')}
              </Button>
            )}
          </div>
        )}
      </Field>

      <Field>
        <FieldLabel htmlFor="rv-roles">{t('مخاطب')}</FieldLabel>
        {options.roles.length > 0 ? (
          <MultiSelect
            id="rv-roles"
            options={options.roles.map((r) => ({ value: r.id, label: r.name }))}
            selected={info.roles}
            onChange={(v) => set('roles', v)}
            placeholder={t('کلِ تیمِ پروژه')}
          />
        ) : null}
        {/* مخاطبِ شخصی (۲.۲۲.۰) — مثلاً فقط یکی از دو دولوپرِ پروژه. با نقش‌ها جمع می‌شود. */}
        {options.people.length > 0 && (
          <MultiSelect
            id="rv-people"
            options={options.people.map((p) => ({ value: p.id, label: p.name }))}
            selected={info.people}
            onChange={(v) => set('people', v)}
            placeholder={t('اشخاص (اختیاری)')}
          />
        )}
        <FieldDescription>
          {info.roles.length === 0 && info.people.length === 0
            ? t('خالی یعنی همهٔ اعضای پروژه می‌بینند. با انتخابِ نقش یا شخص فقط همان‌ها (و مدیران) می‌بینند.')
            : t('فقط دارندگانِ این نقش‌ها، اشخاصِ انتخاب‌شده و مدیرانِ پروژه می‌بینند.')}
        </FieldDescription>
      </Field>

      {/* ⚠️ پیش‌فرض خاموش — کارفرما فقط وقتی می‌بیند که عمداً روشن شود. */}
      <label className="flex items-start gap-3 rounded-lg border p-3">
        <Switch checked={info.clientVisible} onCheckedChange={(v) => set('clientVisible', v)} className="mt-0.5" />
        <span className="grid gap-0.5">
          <span className="flex items-center gap-1.5 text-sm font-medium">
            {info.clientVisible ? <Eye className="size-4" /> : <EyeOff className="size-4 text-muted-foreground" />}
            {t('برای کارفرما نمایش داده شود')}
          </span>
          <span className="text-xs text-muted-foreground">
            {info.clientVisible
              ? t('کارفرمای پروژه این بازبینی و موردهایش را می‌بیند.')
              : t('کارفرما نه این بازبینی را می‌بیند، نه تسک‌هایی را که از آن ساخته می‌شوند.')}
          </span>
        </span>
      </label>

      <Field>
        <FieldLabel htmlFor="rv-notes">{t('یادداشت')}</FieldLabel>
        <Textarea id="rv-notes" rows={3} value={info.notes} onChange={(e) => set('notes', e.target.value)}
          placeholder={t('خلاصهٔ بررسی، پیوندِ فیگما، متنِ پیامِ واتس‌اپ…')} />
      </Field>

      {/* تصاویرِ کلیِ بازبینی — در ویرایش، کادرِ «تصاویر» ِ خودِ صفحه همین کار را می‌کند. */}
      {!editing && (
        <FileDrop
          variant="zone"
          imagesOnly
          files={info.images}
          onAdd={(added) => set('images', [...info.images, ...added])}
          onRemove={(i) => set('images', info.images.filter((_, j) => j !== i))}
          title={t('تصاویرِ بازبینی')}
        />
      )}
    </div>
  );

  const itemsStep = (
    <div className="grid gap-3">
      {drafts.length > 0 && (
        <ul className="grid gap-1.5">
          {drafts.map((d, i) => (
            <li key={i} className={cn('flex items-center gap-2 rounded-lg border bg-card px-2.5 py-1.5 text-sm', editIndex === i && 'border-primary')}>
              {d.start && (
                <span className="num inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 text-xs text-primary" dir="ltr">
                  <Play className="size-3" />{d.start}{d.end ? `–${d.end}` : ''}
                </span>
              )}
              <span className="min-w-0 flex-1 truncate">{d.title}</span>
              {d.area && <span className="rounded-sm bg-muted px-1.5 text-[11px] text-muted-foreground">{d.area}</span>}
              {d.files.length > 0 && (
                <span className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground">
                  <Paperclip className="size-3" /><span className="num">{d.files.length}</span>
                </span>
              )}
              <Button type="button" size="icon-xs" variant="ghost" aria-label={t('ویرایش')} onClick={() => setEditIndex(i)}><Pencil className="size-3.5" /></Button>
              <Button type="button" size="icon-xs" variant="ghost" aria-label={t('حذف')} className="text-destructive"
                onClick={() => { setDrafts(drafts.filter((_, j) => j !== i)); if (editIndex === i) setEditIndex(null); }}>
                <Trash2 className="size-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <ReviewItemComposer
        key={editIndex ?? 'new'}
        options={options}
        defaultRoles={info.roles}
        clientVisible={info.clientVisible}
        initial={editIndex !== null ? drafts[editIndex] ?? null : null}
        submitLabel={editIndex !== null ? t('ذخیرهٔ مورد') : t('افزودن به فهرست')}
        onCancel={editIndex !== null ? () => setEditIndex(null) : undefined}
        onSubmit={(d) => {
          if (editIndex !== null) {
            setDrafts(drafts.map((x, j) => (j === editIndex ? d : x)));
            setEditIndex(null);
          } else {
            setDrafts([...drafts, d]);
          }
          return null;
        }}
      />
      {drafts.length === 0 && (
        <p className="text-xs text-muted-foreground">{t('موردها را حالا بنویسید یا بعداً در صفحهٔ بازبینی اضافه کنید.')}</p>
      )}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) onOpenChange(o); }}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? t('ویرایشِ بازبینی') : t('بازبینیِ تازه')}</DialogTitle>
          <DialogDescription>
            {editing
              ? t('موردها و تصاویر را در خودِ صفحهٔ بازبینی اضافه کنید.')
              : step === 1 ? t('مرحلهٔ ۱ از ۲ — اطلاعات و ویدئو') : t('مرحلهٔ ۲ از ۲ — موردها')}
          </DialogDescription>
        </DialogHeader>

        {!editing && (
          <div className="grid grid-cols-2 gap-2">
            {[1, 2].map((s) => (
              <div key={s} className={cn('h-1 rounded-full', step >= s ? 'bg-primary' : 'bg-muted')} />
            ))}
          </div>
        )}

        {editing || step === 1 ? infoStep : itemsStep}

        {error && <p className="text-sm text-destructive">{t(error)}</p>}

        <DialogFooter className="gap-2">
          {busy && <span className="me-auto flex items-center gap-2 text-sm text-muted-foreground"><Spinner />{busy}</span>}
          {!editing && step === 2 && (
            <Button type="button" variant="outline" disabled={Boolean(busy)} onClick={() => setStep(1)}>
              <ArrowRight className="size-4 ltr:rotate-180" />{t('قبلی')}
            </Button>
          )}
          {!editing && step === 1 ? (
            <Button
              type="button"
              onClick={() => {
                if (info.title.trim() === '') { setError(t('عنوانِ بازبینی الزامی است.')); return; }
                setError(null);
                setStep(2);
              }}
            >
              {t('بعدی: موردها')}<ArrowLeft className="size-4 ltr:rotate-180" />
            </Button>
          ) : (
            <Button type="button" disabled={Boolean(busy)} onClick={() => void save()}>
              {editing
                ? t('ذخیرهٔ تغییرات')
                : drafts.length > 0 ? t('ساختِ بازبینی با {n} مورد', { n: drafts.length }) : t('ساختِ بازبینی')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * ⚠️ بدنه با هر بار باز شدن از نو ساخته می‌شود (`useFreshKey`، ۲.۱۷.۱) — تغییرِ
 * ذخیره‌نشده با بستنِ پنجره دور ریخته می‌شود، نه اینکه دفعهٔ بعد سرِ جایش بماند.
 */
export function ReviewDialog(props: Parameters<typeof ReviewDialogBody>[0]) {
  const key = useFreshKey(props.open);
  return <ReviewDialogBody key={key} {...props} />;
}
