'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { FileText, Paperclip, X } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Lightbox } from '@/components/lightbox';
import { useT } from '@/i18n/client';
import { FileInput } from '@/components/ui/file-input';
import {
  Attachment, AttachmentAction, AttachmentActions, AttachmentContent, AttachmentDescription,
  AttachmentMedia, AttachmentTitle, AttachmentTrigger,
} from '@/components/ui/attachment';
import { humanSize } from '@/domain/files/upload';

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
    <div className="grid gap-2 rounded-lg border p-3">
      <Label htmlFor={inputId} className="flex items-center gap-1.5">
        <Paperclip className="size-3.5" />
        {multiple ? tr('رسیدها') : tr('رسید')}
      </Label>
      {children}
      {/* `selected`: فایلِ چسبانده یا حذف‌شده از رویدادِ change رد نمی‌شود؛ برچسب از همین فهرست می‌خواند. */}
      <FileInput
        ref={inputRef}
        id={inputId}
        name={name}
        accept="image/*,application/pdf"
        multiple={multiple}
        selected={files.map((f) => f.name)}
        onChange={(e) => sync(Array.from(e.target.files ?? []))}
      />
      {/*
        ⚠️ `idle` = انتخاب‌شده ولی هنوز فرستاده نشده (قابِ خط‌چین)؛ با «ذخیره»
        همراهِ فرم می‌رود. کلیک روی تصویر بزرگش می‌کند، × فقط از فهرست برش می‌دارد.
      */}
      {files.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {files.map((f, i) => (
            <li key={`${f.name}-${f.size}-${i}`}>
              <Attachment orientation="vertical" state="idle">
                <AttachmentMedia variant={previews[i] ? 'image' : 'icon'}>
                  {previews[i] ? <img src={previews[i]} alt="" /> : <FileText />}
                </AttachmentMedia>
                <AttachmentContent>
                  <AttachmentTitle title={f.name}>{f.name}</AttachmentTitle>
                  <AttachmentDescription>{humanSize(f.size, tr)}</AttachmentDescription>
                </AttachmentContent>
                <AttachmentActions>
                  <AttachmentAction
                    variant="outline"
                    aria-label={`${tr('حذف')} — ${f.name}`}
                    onClick={() => sync(files.filter((_, j) => j !== i))}
                  >
                    <X />
                  </AttachmentAction>
                </AttachmentActions>
                {previews[i] && (
                  <AttachmentTrigger aria-label={f.name} onClick={() => setZoom(previews[i]!)} />
                )}
              </Attachment>
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
