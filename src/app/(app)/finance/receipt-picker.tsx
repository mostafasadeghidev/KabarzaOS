'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { FileText, Paperclip, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Lightbox } from '@/components/lightbox';
import { useT } from '@/i18n/client';

/**
 * انتخابِ رسید — پورتِ dropzone ِ نسخهٔ قبلی: پیش‌نمایشِ بندانگشتیِ فایل‌های
 * تازه (با بزرگ‌نمایی)، چسباندنِ تصویر از کلیپ‌بورد (Ctrl+V) و حذفِ تک‌فایل
 * پیش از ارسال.
 *
 * ⚠️ فایل‌ها در همان `<input type="file">` می‌نشینند (DataTransfer) تا فرم
 * بدونِ مسیرِ جداگانه ارسال شود — سرور همان `formData.getAll(name)` را
 * می‌خواند که پیش از این می‌خواند.
 */
export function ReceiptPicker({
  name,
  inputId,
  multiple = true,
  hint,
  children,
}: {
  name: string;
  inputId: string;
  multiple?: boolean;
  hint?: string;
  /** فهرستِ رسیدهای موجود (در ویرایش) — بالای ورودی می‌نشیند. */
  children?: ReactNode;
}) {
  const tr = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [zoom, setZoom] = useState<string | null>(null);
  const previews = useObjectUrls(files);

  const sync = (next: File[]) => {
    const dt = new DataTransfer();
    for (const f of next) dt.items.add(f);
    if (inputRef.current) inputRef.current.files = dt.files;
    setFiles(next);
  };

  useEffect(() => {
    // چسباندنِ تصویر از کلیپ‌بورد — فقط وقتی واقعاً فایلی در کلیپ‌بورد است؛
    // چسباندنِ متن در فیلدهای دیگر دست‌نخورده می‌ماند.
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.kind !== 'file') continue;
        const f = item.getAsFile();
        if (!f) continue;
        e.preventDefault();
        sync(multiple ? [...files, f] : [f]);
        return;
      }
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files, multiple]);

  return (
    <div className="grid gap-2 rounded-md border p-3">
      <Label htmlFor={inputId} className="flex items-center gap-1.5">
        <Paperclip className="size-3.5" />
        {multiple ? tr('رسیدها') : tr('رسید')}
      </Label>
      {children}
      <Input
        ref={inputRef}
        id={inputId}
        name={name}
        type="file"
        accept="image/*,application/pdf"
        multiple={multiple}
        onChange={(e) => sync(Array.from(e.target.files ?? []))}
      />
      {files.length > 0 && (
        <ul className="flex flex-wrap gap-3">
          {files.map((f, i) => (
            <li key={`${f.name}-${f.size}-${i}`} className="relative flex w-24 flex-col items-center gap-1 text-center">
              {previews[i] ? (
                <button
                  type="button"
                  onClick={() => setZoom(previews[i]!)}
                  className="size-16 overflow-hidden rounded-md border"
                  title={f.name}
                >
                  <img src={previews[i]} alt="" className="size-full object-cover" />
                </button>
              ) : (
                <span className="flex size-16 items-center justify-center rounded-md border text-muted-foreground">
                  <FileText className="size-6" />
                </span>
              )}
              <span className="w-full truncate text-[11px] text-muted-foreground" title={f.name}>{f.name}</span>
              <button
                type="button"
                aria-label={tr('حذف')}
                onClick={() => sync(files.filter((_, j) => j !== i))}
                className="absolute -top-1 -end-1 rounded-full border bg-background p-0.5 text-muted-foreground hover:text-destructive"
              >
                <X className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">
        {hint ? `${hint} ` : ''}
        {tr('چسباندنِ تصویر از کلیپ‌بورد (Ctrl+V) هم کار می‌کند.')}
      </p>
      <Lightbox src={zoom} onClose={() => setZoom(null)} />
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
