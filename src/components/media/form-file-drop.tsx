'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { FileDrop } from '@/components/media/file-drop';

/**
 * کادرِ «رها کن یا بچسبان» **داخلِ فرم** (۲.۱۹.۰) — همان کادرِ بازبینی (`FileDrop`)
 * ولی فایل‌ها در یک `<input type="file" name=…>` ِ پنهان می‌نشینند تا
 * `formData.getAll(name)` ِ سرور بی‌تغییر بخواندشان.
 *
 * سه راه: کلیک، **چسباندن** (Ctrl+V ِ اسکرین‌شات) و **کشیدن و رها کردن** — روی
 * خودِ کادر و روی فیلدهای `children` (متنِ فرم).
 *
 * ⚠️ فایل‌ها با `DataTransfer` در ورودیِ پنهان نشانده می‌شوند. React پس از اجرای
 * اکشن فرم را `reset` می‌کند و ورودی خالی می‌شود؛ با رویدادِ `reset` فهرستِ
 * پیش‌نمایش هم خالی می‌شود تا کاربر پیش‌نمایشِ کهنه نبیند.
 * ⚠️ `multiple={false}`: فایلِ تازه جایگزینِ قبلی می‌شود (تصویرِ شاخص).
 */
export function FormFileDrop({
  name,
  multiple = true,
  imagesOnly = false,
  compact = false,
  title,
  hint,
  children,
  footer,
  className,
  onCountChange,
}: {
  name: string;
  multiple?: boolean;
  imagesOnly?: boolean;
  compact?: boolean;
  title?: string;
  hint?: string;
  /** فیلدهای متنیِ فرم — چسباندن و رهاکردن روی آن‌ها هم کار می‌کند. */
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
  /** شمارِ فایل‌های در انتظار — مثلاً برای غیرفعال‌کردنِ دکمهٔ ارسال. */
  onCountChange?: (count: number) => void;
}) {
  const holderRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const countRef = useRef(onCountChange);
  countRef.current = onCountChange;

  const sync = (next: File[]) => {
    const data = new DataTransfer();
    for (const f of next) data.items.add(f);
    if (holderRef.current) holderRef.current.files = data.files;
    setFiles(next);
    countRef.current?.(next.length);
  };

  useEffect(() => {
    const form = holderRef.current?.form;
    if (!form) return;
    const clear = () => { setFiles([]); countRef.current?.(0); };
    form.addEventListener('reset', clear);
    return () => form.removeEventListener('reset', clear);
  }, []);

  return (
    <div className={className}>
      {/* ورودیِ نام‌دار: دیده نمی‌شود ولی فایل‌ها را برای FormData نگه می‌دارد. */}
      <input ref={holderRef} type="file" name={name} multiple={multiple} hidden tabIndex={-1} />
      <FileDrop
        variant="zone"
        imagesOnly={imagesOnly}
        compact={compact}
        title={title}
        hint={hint}
        footer={footer}
        files={files}
        onAdd={(added) => sync(multiple ? [...files, ...added] : added.slice(0, 1))}
        onRemove={(i) => sync(files.filter((_, j) => j !== i))}
      >
        {children}
      </FileDrop>
    </div>
  );
}
