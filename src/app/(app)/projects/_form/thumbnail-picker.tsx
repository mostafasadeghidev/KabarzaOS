'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { FileDrop } from '@/components/media/file-drop';
import { Thumb } from '@/components/thumb';
import { useT } from '@/i18n/client';

/**
 * تصویرِ شاخصِ پروژه (۳.۸.۰) — عکسِ انتخاب‌شده **همان‌جای تصویرِ فعلی** (یا تک‌نگار) دیده
 * می‌شود، نه در جعبهٔ جدایی زیرِ کادر. کاربر می‌بیند پس از ذخیره پروژه چه شکلی دارد.
 *
 * ⚠️ فایل در یک `<input type=file name>` ِ پنهان می‌ماند تا با FormData ِ همان فرم برود
 * (مثلِ FormFileDrop)؛ «×» روی پیش‌نمایش انتخاب را پس می‌گیرد و تصویرِ قبلی برمی‌گردد.
 */
export function ThumbnailPicker({
  name,
  project,
  children,
}: {
  name: string;
  /** زیرِ کادر (مثلاً «حذفِ تصویرِ فعلی»). */
  children?: ReactNode;
  /** در ویرایش: تصویرِ فعلی یا تک‌نگار؛ در ساخت: هیچ. */
  project?: { id: number; title: string; thumbnailFileId: number | null };
}) {
  const t = useT();
  const holderRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  // ⚠️ آرایهٔ پایدار: FileDrop با تغییرِ همین آرایه پیش‌نمایش می‌سازد؛ `[]` ِ تازه در هر رندر حلقه می‌ساخت.
  const files = useMemo(() => (file ? [file] : []), [file]);

  useEffect(() => {
    if (!file) { setUrl(null); return; }
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  const choose = (next: File | null) => {
    const data = new DataTransfer();
    if (next) data.items.add(next);
    if (holderRef.current) holderRef.current.files = data.files;
    setFile(next);
  };

  // «بازنشانیِ» فرم (بستن و باز کردنِ پنجره) انتخاب را هم پاک کند.
  useEffect(() => {
    const form = holderRef.current?.form;
    if (!form) return;
    const clear = () => setFile(null);
    form.addEventListener('reset', clear);
    return () => form.removeEventListener('reset', clear);
  }, []);

  const showSlot = Boolean(project) || Boolean(url);
  return (
    <div className="flex items-start gap-3">
      <input ref={holderRef} type="file" name={name} hidden tabIndex={-1} />
      {showSlot && (
        <div className="relative shrink-0">
          {url ? (
            <img src={url} alt="" className="size-14 rounded-md object-cover" />
          ) : project ? (
            <Thumb id={project.id} title={project.title} fileId={project.thumbnailFileId} size={56} />
          ) : null}
          {url && (
            <button
              type="button"
              aria-label={`${t('حذف')} — ${file?.name ?? ''}`}
              onClick={() => choose(null)}
              className="absolute -top-1.5 -end-1.5 grid size-5 place-items-center rounded-full bg-foreground text-background shadow"
            >
              <X className="size-3" />
            </button>
          )}
        </div>
      )}
      <div className="grid min-w-0 flex-1 gap-2">
        <FileDrop
          variant="zone"
          imagesOnly
          compact
          hideList
          files={files}
          onAdd={(added) => choose(added[0] ?? null)}
        />
        {children}
      </div>
    </div>
  );
}
