'use client';

import { useState, useTransition } from 'react';
import { Download, FileText, X } from 'lucide-react';
import { Lightbox } from '@/components/lightbox';
import {
  Attachment, AttachmentAction, AttachmentActions, AttachmentContent, AttachmentDescription,
  AttachmentMedia, AttachmentTitle,
} from '@/components/ui/attachment';
import { useConfirm } from '@/components/ui/confirm';
import { useT } from '@/i18n/client';
import { humanSize } from '@/domain/files/upload';
import { cn } from '@/lib/utils';
import { deleteAttachmentAction } from '@/app/(app)/projects/[id]/_form/file-actions';

/** یک قلمِ رسانه همان‌طور که سرور می‌فرستد (`shapeMedia`). */
export interface MediaEntry {
  id: number;
  fileId: number;
  kind: string;
  mime: string;
  size: number;
  name: string;
  canDelete: boolean;
}

const fileUrl = (fileId: number) => `/api/files/${fileId}`;

/**
 * رسانهٔ تسک، یادداشت یا کامنت: تصویرها بندانگشتی (با بزرگ‌نمایی و قبلی/بعدی)،
 * ویدئوی بارگذاری‌شده پخش‌کنندهٔ خودش را دارد و بقیهٔ فایل‌ها کارتِ دانلود.
 *
 * ⚠️ همهٔ آدرس‌ها از مسیرِ گیت‌شدهٔ `/api/files` است (R-FILE-01) و بندانگشتی
 * نسخهٔ ۴۰۰ پیکسلی (`?thumb`) — صفحه با ده اسکرین‌شاتِ چندمگابایتی سنگین نمی‌شود.
 */
export function MediaGallery({
  items,
  projectId,
  onChanged,
  size = 'md',
  onRemove,
}: {
  items: readonly MediaEntry[];
  projectId: number;
  /**
   * حذفِ سفارشی — فایلی که مالِ پروژه نیست (راهنمای آنبوردینگ، ۲.۶.۰) گاردِ
   * حذفِ خودش را دارد. بی‌این، حذفِ پیوستِ پروژه.
   */
  onRemove?: (item: MediaEntry) => Promise<{ error?: string }>;
  /** پس از حذف — فراخوان دوباره می‌خواند (مودالِ تسک). صفحهٔ پروژه با revalidate تازه می‌شود. */
  onChanged?: () => void;
  /** `lg` — کادرِ «تصاویر» ِ بازبینی، جایی که تصویر خودش محتواست. */
  size?: 'sm' | 'md' | 'lg';
}) {
  const t = useT();
  const confirm = useConfirm();
  const [zoom, setZoom] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  if (items.length === 0) return null;

  const images = items.filter((m) => m.kind === 'image');
  const videos = items.filter((m) => m.kind === 'video');
  const others = items.filter((m) => m.kind !== 'image' && m.kind !== 'video');

  const remove = async (item: MediaEntry) => {
    if (!(await confirm({ title: t('این فایل حذف شود؟'), description: item.name }))) return;
    startTransition(async () => {
      const result = onRemove ? await onRemove(item) : await deleteAttachmentAction(item.id, projectId);
      if (result.error) setError(result.error);
      else { setError(null); setZoom(null); onChanged?.(); }
    });
  };

  const removeButton = (item: MediaEntry, className?: string) => item.canDelete && (
    <button
      type="button"
      disabled={pending}
      aria-label={`${t('حذف')} — ${item.name}`}
      onClick={() => remove(item)}
      className={cn(
        // ⚠️ روی صفحهٔ لمسی هاور نیست؛ آنجا دکمه همیشه پیداست.
        'grid size-6 place-items-center rounded-full bg-black/60 text-white transition hover:bg-destructive [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/media:opacity-100 [@media(hover:hover)]:focus-visible:opacity-100',
        className,
      )}
    >
      <X className="size-3.5" />
    </button>
  );

  const current = zoom === null ? null : images[zoom] ?? null;

  return (
    <div className="grid gap-2">
      {images.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {images.map((item, i) => (
            <li key={item.id} className="group/media relative">
              <button
                type="button"
                onClick={() => setZoom(i)}
                aria-label={item.name}
                className={cn(
                  'block overflow-hidden rounded-lg border bg-muted transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring',
                  size === 'sm' ? 'size-16' : size === 'lg' ? 'size-32 sm:size-40' : 'size-24',
                )}
              >
                <img src={`${fileUrl(item.fileId)}?thumb`} alt={item.name} loading="lazy" className="size-full object-cover" />
              </button>
              {removeButton(item, 'absolute -top-1.5 -end-1.5')}
            </li>
          ))}
        </ul>
      )}

      {videos.map((item) => (
        <div key={item.id} className="group/media relative">
          {/* ⚠️ `preload=metadata`: فقط سربرگ و مدت — نه کلِ فایل با بازشدنِ مودال. */}
          <video
            src={fileUrl(item.fileId)}
            controls
            preload="metadata"
            className="max-h-80 w-full rounded-lg border bg-black"
          />
          {removeButton(item, 'absolute top-2 end-2')}
        </div>
      ))}

      {others.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {others.map((item) => (
            <li key={item.id}>
              <Attachment size="sm">
                <AttachmentMedia><FileText /></AttachmentMedia>
                <AttachmentContent>
                  <AttachmentTitle title={item.name}>{item.name}</AttachmentTitle>
                  <AttachmentDescription>{humanSize(item.size, t)}</AttachmentDescription>
                </AttachmentContent>
                <AttachmentActions>
                  <AttachmentAction asChild aria-label={`${t('دانلود')} — ${item.name}`}>
                    <a href={`${fileUrl(item.fileId)}?dl`}><Download /></a>
                  </AttachmentAction>
                  {item.canDelete && (
                    <AttachmentAction
                      disabled={pending}
                      aria-label={`${t('حذف')} — ${item.name}`}
                      onClick={() => remove(item)}
                    >
                      <X />
                    </AttachmentAction>
                  )}
                </AttachmentActions>
              </Attachment>
            </li>
          ))}
        </ul>
      )}

      {error && <p className="text-xs text-destructive">{t(error)}</p>}

      <Lightbox
        src={current ? fileUrl(current.fileId) : null}
        alt={current?.name ?? ''}
        onClose={() => setZoom(null)}
        onPrev={zoom !== null && zoom > 0 ? () => setZoom(zoom - 1) : undefined}
        onNext={zoom !== null && zoom < images.length - 1 ? () => setZoom(zoom + 1) : undefined}
        position={images.length > 1 && zoom !== null ? `${zoom + 1} / ${images.length}` : undefined}
      />
    </div>
  );
}
