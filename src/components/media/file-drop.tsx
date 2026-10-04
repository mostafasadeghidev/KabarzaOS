'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { FileText, Film, ImagePlus, X } from 'lucide-react';
import { Lightbox } from '@/components/lightbox';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useT } from '@/i18n/client';
import { humanSize, MAX_MEDIA, MAX_MEDIA_TOTAL } from '@/domain/files/upload';
import { cn } from '@/lib/utils';

const NO_FILES: File[] = [];
const IMAGE_ACCEPT = 'image/jpeg,image/png,image/gif,image/webp';
const ALL_ACCEPT = `${IMAGE_ACCEPT},video/mp4,video/webm,video/quicktime,application/pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.zip`;

/** فایل‌های کلیپ‌بورد — اسکرین‌شات نامِ ثابتِ «image.png» دارد؛ نامِ یکتا می‌گیرد. */
export function clipboardFiles(data: DataTransfer | null): File[] {
  return Array.from(data?.items ?? [])
    .filter((item) => item.kind === 'file')
    .map((item) => item.getAsFile())
    .filter((f): f is File => f !== null)
    .map((f, i) => (f.name === 'image.png' || f.name === ''
      ? new File([f], `screenshot-${Date.now()}-${i + 1}.${f.type.split('/')[1] ?? 'png'}`, { type: f.type })
      : f));
}

/** هدفِ چسباندن فیلدِ تایپ است؟ آنجا Ctrl+V مالِ متن است، نه کادرِ تصویر. */
function isEditable(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return Boolean(el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)));
}

/**
 * کادرِ «رها کن یا بچسبان» — **کنترل‌شده**: فایل‌ها در state ِ والد می‌مانند
 * (پیش‌نویسِ مورد، فرمِ چندمرحله‌ای) یا والد همان لحظه بارگذاری‌شان می‌کند.
 *
 * - `variant="zone"`: کادرِ بزرگِ خط‌چین — برای جایی که تصویر کارِ اصلی است.
 * - `variant="inline"`: یک ردیفِ دکمه زیرِ فیلدها.
 * - `pageWide`: Ctrl+V هر جای صفحه (وقتی در فیلدی تایپ نمی‌کنی و دیالوگی باز
 *   نیست) به همین کادر می‌رسد — کاربر لازم نیست اول روی کادر کلیک کند.
 *
 * ⚠️ چسباندنِ متن هیچ‌وقت گرفته نمی‌شود؛ فقط وقتی کلیپ‌بورد واقعاً فایل دارد.
 */
export function FileDrop({
  files,
  onAdd,
  onRemove,
  children,
  variant = 'inline',
  imagesOnly = false,
  pageWide = false,
  busy = false,
  title,
  hint,
  footer,
  className,
}: {
  /** فهرستِ در انتظار (پیش‌نمایش با حذف). بی‌آن، کادر فقط تحویل می‌دهد (بارگذاریِ فوری). */
  files?: File[];
  onAdd: (files: File[]) => void;
  onRemove?: (index: number) => void;
  children?: ReactNode;
  variant?: 'zone' | 'inline';
  imagesOnly?: boolean;
  pageWide?: boolean;
  busy?: boolean;
  title?: string;
  hint?: string;
  /** پایین‌ترین ردیف — دکمه‌های فرم زیرِ پیش‌نمایش‌ها می‌نشینند، نه بالایشان. */
  footer?: ReactNode;
  className?: string;
}) {
  const t = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState<number | null>(null);
  // ⚠️ ثابت، نه `[]` ِ تازه در هر رندر: پیش‌نمایش‌ها با تغییرِ همین آرایه از نو
  // ساخته می‌شوند و آرایهٔ تازه در هر رندر حلقهٔ بی‌پایانِ رندر می‌ساخت.
  const pending = files ?? NO_FILES;
  const previews = useObjectUrls(pending);

  const add = (incoming: File[]) => {
    const fresh = incoming.filter((f) => f.size > 0 && (!imagesOnly || f.type.startsWith('image/')));
    if (fresh.length === 0) return;
    const next = [...pending, ...fresh];
    // سقفِ سرور برای هر ارسال — فقط وقتی فهرستِ در انتظار با یک ارسال می‌رود.
    if (files && next.length > MAX_MEDIA) { setError(t('در هر بار حداکثر ۱۰ فایل.')); return; }
    if (next.reduce((sum, f) => sum + f.size, 0) > MAX_MEDIA_TOTAL) {
      setError(t('جمعِ حجمِ فایل‌ها بیش از {size} است.', { size: humanSize(MAX_MEDIA_TOTAL, t) }));
      return;
    }
    setError(null);
    onAdd(fresh);
  };
  const addRef = useRef(add);
  addRef.current = add;

  useEffect(() => {
    if (!pageWide) return;
    const onPaste = (e: ClipboardEvent) => {
      if (isEditable(e.target) || document.querySelector('[role="dialog"]')) return;
      const pasted = clipboardFiles(e.clipboardData);
      if (pasted.length === 0) return;
      e.preventDefault();
      addRef.current(pasted);
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [pageWide]);

  const images = pending.map((f, i) => ({ f, i })).filter(({ i }) => previews[i]);
  const thumb = variant === 'zone' ? 'size-28' : 'size-16';

  const list = pending.length > 0 && (
    <ul className="flex flex-wrap gap-2">
      {pending.map((f, i) => (
        <li key={`${f.name}-${f.size}-${i}`} className="relative">
          {previews[i] ? (
            <button
              type="button"
              onClick={() => setZoom(images.findIndex((x) => x.i === i))}
              className={cn('block overflow-hidden rounded-md border bg-muted', thumb)}
              aria-label={f.name}
            >
              <img src={previews[i]} alt="" className="size-full object-cover" />
            </button>
          ) : (
            <div className={cn('flex flex-col justify-center gap-0.5 rounded-md border bg-muted/50 px-2', variant === 'zone' ? 'h-28 w-36' : 'h-16 w-32')}>
              {f.type.startsWith('video/') ? <Film className="size-4 text-muted-foreground" /> : <FileText className="size-4 text-muted-foreground" />}
              <span className="truncate text-[11px]" title={f.name}>{f.name}</span>
              <span className="num text-[10px] text-muted-foreground">{humanSize(f.size, t)}</span>
            </div>
          )}
          {onRemove && (
            <button
              type="button"
              aria-label={`${t('حذف')} — ${f.name}`}
              onClick={() => { setError(null); onRemove(i); }}
              className="absolute -top-1.5 -end-1.5 grid size-5 place-items-center rounded-full bg-foreground text-background shadow"
            >
              <X className="size-3" />
            </button>
          )}
        </li>
      ))}
    </ul>
  );

  const picker = (
    <input
      ref={inputRef}
      type="file"
      accept={imagesOnly ? IMAGE_ACCEPT : ALL_ACCEPT}
      multiple
      hidden
      onChange={(e) => { add(Array.from(e.target.files ?? [])); e.target.value = ''; }}
    />
  );

  return (
    <div
      className={cn('relative grid gap-2 rounded-lg transition', dragging && variant === 'inline' && 'ring-2 ring-primary ring-offset-2 ring-offset-background', className)}
      onPaste={(e) => {
        const pasted = clipboardFiles(e.clipboardData);
        if (pasted.length === 0) return;
        e.preventDefault();
        e.stopPropagation();
        add(pasted);
      }}
      onDragOver={(e) => {
        if (!Array.from(e.dataTransfer.types).includes('Files')) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        setDragging(true);
      }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false); }}
      onDrop={(e) => {
        if (e.dataTransfer.files.length === 0) return;
        e.preventDefault();
        setDragging(false);
        add(Array.from(e.dataTransfer.files));
      }}
    >
      {children}
      {picker}

      {variant === 'zone' ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className={cn(
            'grid min-h-32 place-items-center gap-1 rounded-xl border-2 border-dashed p-4 text-center transition',
            dragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-muted/40',
          )}
        >
          <span className="grid justify-items-center gap-1.5">
            {busy ? <Spinner className="size-6" /> : <ImagePlus className="size-7 text-muted-foreground" />}
            <span className="text-sm font-medium">{busy ? t('در حالِ بارگذاری…') : (title ?? t('تصویر را اینجا رها کنید یا بچسبانید'))}</span>
            <span className="text-xs text-muted-foreground">{hint ?? t('Ctrl+V برای اسکرین‌شات، یا کلیک برای انتخابِ فایل')}</span>
          </span>
        </button>
      ) : (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Button type="button" variant="ghost" size="xs" className="text-muted-foreground" onClick={() => inputRef.current?.click()}>
            <ImagePlus className="size-3.5" />
            {title ?? t('افزودنِ تصویر یا فایل')}
          </Button>
          <span className="text-[11px] text-muted-foreground">
            {hint ?? t('یا اسکرین‌شات را بچسبانید (Ctrl+V) یا اینجا رها کنید.')}
          </span>
        </div>
      )}

      {list}
      {error && <p className="text-xs text-destructive">{error}</p>}
      {footer}

      <Lightbox
        src={zoom !== null && images[zoom] ? previews[images[zoom]!.i]! : null}
        onClose={() => setZoom(null)}
        onPrev={zoom !== null && zoom > 0 ? () => setZoom(zoom - 1) : undefined}
        onNext={zoom !== null && zoom < images.length - 1 ? () => setZoom(zoom + 1) : undefined}
        position={images.length > 1 && zoom !== null ? `${zoom + 1} / ${images.length}` : undefined}
      />
    </div>
  );
}

/** آدرسِ موقتِ پیش‌نمایش برای تصویرها؛ با تغییرِ فهرست آزاد می‌شود. */
function useObjectUrls(files: File[]): string[] {
  const [urls, setUrls] = useState<string[]>([]);
  useEffect(() => {
    const next = files.map((f) => (f.type.startsWith('image/') ? URL.createObjectURL(f) : ''));
    setUrls(next);
    return () => { for (const u of next) if (u) URL.revokeObjectURL(u); };
  }, [files]);
  return urls;
}
