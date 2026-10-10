'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { FileText, Film, ImagePlus, X } from 'lucide-react';
import { Lightbox } from '@/components/lightbox';
import { Button } from '@/components/ui/button';
import { useT } from '@/i18n/client';
import { humanSize, MAX_MEDIA, MAX_MEDIA_TOTAL } from '@/domain/files/upload';
import { cn } from '@/lib/utils';
import { Hint } from '@/components/ui/tooltip';

/** همان فهرستِ سفیدِ پیوستِ پروژه (`ALLOWED_TYPES.attachment`) — انتخابگرِ سیستم را محدود می‌کند، گارد نیست. */
const ACCEPT = 'image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm,video/quicktime,application/pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.zip';

/**
 * پیوستِ تصویر و فایل به فرمِ تسک، یادداشت و کامنت.
 *
 * سه راه: دکمه، **چسباندن** (Ctrl+V ِ اسکرین‌شات) و **کشیدن و رها کردن** روی
 * همین قاب. پیش‌نمایشِ بندانگشتی با بزرگ‌نمایی و حذفِ تک‌فایل پیش از ارسال.
 *
 * ⚠️ فایل‌ها در همان `<input type="file">` ِ فرم می‌نشینند (DataTransfer)؛
 * سرور `formData.getAll(name)` را می‌خواند و مسیرِ آپلودِ جدایی نیست.
 * ⚠️ چسباندن روی **همین قاب** شنیده می‌شود، نه کلِ صفحه: کامنت، پاسخ‌ها و
 * مودالِ تسک هم‌زمان روی صفحه‌اند و هر کدام فقط عکسِ خودش را می‌گیرد.
 * ⚠️ React پس از اجرای اکشن فرم را reset می‌کند؛ با رویدادِ `reset` فهرست هم
 * خالی می‌شود تا پیش‌نمایشِ کهنه نماند.
 */
export function MediaPicker({
  name = 'media',
  children,
  className,
}: {
  name?: string;
  /** فیلدهای متنیِ فرم — چسباندن و رهاکردن روی آن‌ها هم کار می‌کند. */
  children: ReactNode;
  className?: string;
}) {
  const t = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState<number | null>(null);
  const previews = useObjectUrls(files);

  const sync = (next: File[]) => {
    const dt = new DataTransfer();
    for (const f of next) dt.items.add(f);
    if (inputRef.current) inputRef.current.files = dt.files;
    setFiles(next);
  };

  /** افزودن با سنجشِ شمار و جمعِ حجم — همان سقف‌های سرور، پیش از ارسالِ بی‌حاصل. */
  const add = (incoming: File[]) => {
    const fresh = incoming.filter((f) => f.size > 0);
    if (fresh.length === 0) return;
    const next = [...files, ...fresh];
    if (next.length > MAX_MEDIA) {
      setError(t('در هر بار حداکثر ۱۰ فایل.'));
      return;
    }
    if (next.reduce((sum, f) => sum + f.size, 0) > MAX_MEDIA_TOTAL) {
      setError(t('جمعِ حجمِ فایل‌ها بیش از {size} است.', { size: humanSize(MAX_MEDIA_TOTAL, t) }));
      return;
    }
    setError(null);
    sync(next);
  };

  useEffect(() => {
    const form = inputRef.current?.form;
    if (!form) return;
    const clear = () => { setFiles([]); setError(null); };
    form.addEventListener('reset', clear);
    return () => form.removeEventListener('reset', clear);
  }, []);

  const images = files.map((f, i) => ({ f, i })).filter(({ i }) => previews[i]);

  return (
    <div
      className={cn('relative grid gap-2 rounded-lg transition', dragging && 'ring-2 ring-primary ring-offset-2 ring-offset-background', className)}
      onPaste={(e) => {
        // فقط وقتی کلیپ‌بورد واقعاً فایل دارد؛ چسباندنِ متن دست‌نخورده می‌ماند.
        const pasted = Array.from(e.clipboardData?.items ?? [])
          .filter((item) => item.kind === 'file')
          .map((item) => item.getAsFile())
          .filter((f): f is File => f !== null)
          // اسکرین‌شاتِ کلیپ‌بورد نامِ ثابتِ «image.png» دارد؛ نامِ یکتا در فهرست و دانلود گیج نمی‌کند.
          .map((f, i) => (f.name === 'image.png' || f.name === ''
            ? new File([f], `screenshot-${Date.now()}-${i + 1}.${f.type.split('/')[1] ?? 'png'}`, { type: f.type })
            : f));
        if (pasted.length === 0) return;
        e.preventDefault();
        add(pasted);
      }}
      onDragOver={(e) => {
        if (!Array.from(e.dataTransfer.types).includes('Files')) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        setDragging(true);
      }}
      onDragLeave={(e) => {
        // خروج به فرزندِ همین قاب «ترک» نیست.
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={(e) => {
        if (e.dataTransfer.files.length === 0) return;
        e.preventDefault();
        setDragging(false);
        add(Array.from(e.dataTransfer.files));
      }}
    >
      {children}

      <input
        ref={inputRef}
        type="file"
        name={name}
        accept={ACCEPT}
        multiple
        hidden
        // ⚠️ انتخابِ تازه به فهرست **افزوده** می‌شود، جایگزین نمی‌شود — `sync` ورودی را بازنویسی می‌کند.
        onChange={(e) => {
          const picked = Array.from(e.target.files ?? []);
          // ورودی همین حالا فقط انتخابِ تازه را دارد؛ فهرستِ کامل از state برمی‌گردد.
          sync(files);
          add(picked);
        }}
      />

      {files.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {files.map((f, i) => (
            <li key={`${f.name}-${f.size}-${i}`} className="group/pick relative">
              {previews[i] ? (
                <button
                  type="button"
                  onClick={() => setZoom(images.findIndex((x) => x.i === i))}
                  className="block size-16 overflow-hidden rounded-md border border-dashed bg-muted"
                  aria-label={f.name}
                >
                  <img src={previews[i]} alt="" className="size-full object-cover" />
                </button>
              ) : (
                <div className="flex h-16 w-32 flex-col justify-center gap-0.5 rounded-md border border-dashed bg-muted/50 px-2">
                  {f.type.startsWith('video/') ? <Film className="size-4 text-muted-foreground" /> : <FileText className="size-4 text-muted-foreground" />}
                  <Hint label={f.name}><span className="truncate text-[11px]">{f.name}</span></Hint>
                  <span className="num text-[10px] text-muted-foreground">{humanSize(f.size, t)}</span>
                </div>
              )}
              <button
                type="button"
                aria-label={`${t('حذف')} — ${f.name}`}
                onClick={() => { setError(null); sync(files.filter((_, j) => j !== i)); }}
                className="absolute -top-1.5 -end-1.5 grid size-5 place-items-center rounded-full bg-foreground text-background shadow"
              >
                <X className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Button type="button" variant="ghost" size="xs" className="text-muted-foreground" onClick={() => inputRef.current?.click()}>
          <ImagePlus className="size-3.5" />
          {t('افزودنِ تصویر یا فایل')}
        </Button>
        <span className="text-[11px] text-muted-foreground">
          {t('یا اسکرین‌شات را بچسبانید (Ctrl+V) یا اینجا رها کنید.')}
        </span>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}

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
