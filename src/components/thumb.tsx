import { monogram } from '@/domain/files/monogram';

/**
 * تصویرِ شاخص — عکسِ واقعی اگر باشد، وگرنه تک‌نگارِ رنگی.
 *
 * ⚠️ تصویر همیشه از مسیرِ گیت‌شدهٔ `/api/files/<id>` می‌آید، نه از S3
 * (R-FILE-01). این تنها جایی است که تصویرِ شاخص رندر می‌شود تا اگر روزی
 * قاعده عوض شد، یک‌جا عوض شود.
 */
export function Thumb({
  id,
  title,
  fileId,
  size = 44,
  height,
  className = '',
}: {
  id: number;
  title: string;
  fileId: number | null;
  /** عرض (و بی‌`height`، ارتفاع هم) به پیکسل. */
  size?: number;
  /** ارتفاعِ جدا برای تصویرِ افقی (کارت و سربرگِ پروژه: ۱۰۵×۵۵). */
  height?: number;
  className?: string;
}) {
  const px = Math.max(16, size);
  const py = Math.max(16, height ?? size);
  const shared = `shrink-0 overflow-hidden rounded-md ${className}`;

  if (fileId) {
    return (
      <img
        // ⚠️ نسخهٔ کوچک — این تصویر در ۴۴ پیکسل دیده می‌شود و فرستادنِ
        // عکسِ اصلیِ چندمگابایتی برایش اتلافِ محض است (R-FILE-16).
        src={`/api/files/${fileId}?thumb`}
        alt=""
        width={px}
        height={py}
        loading="lazy"
        className={`${shared} object-cover`}
        style={{ width: px, height: py }}
      />
    );
  }

  const { letter, background } = monogram(id, title);
  return (
    <span
      aria-hidden
      className={`${shared} flex items-center justify-center font-semibold text-white`}
      // اندازهٔ حرف از ضلعِ کوچک‌تر — در قابِ افقی حرف از ارتفاع بیرون نمی‌زند.
      style={{ width: px, height: py, fontSize: Math.round(Math.min(px, py) * 0.42), background }}
    >
      {letter}
    </span>
  );
}
