'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { useT } from '@/i18n/client';

/**
 * بزرگ‌نماییِ تصویر — پورتِ لایت‌باکسِ رسیدهای نسخهٔ قبلی: تمام‌صفحه، کلیک
 * روی تصویر، دکمهٔ × یا Escape می‌بندد.
 *
 * چند تصویر (گالریِ تسک و کامنت): با `onPrev`/`onNext` دکمه‌های قبلی/بعدی و
 * کلیدهای جهت فعال می‌شوند و `position` شمارهٔ تصویر را نشان می‌دهد.
 *
 * ⚠️ فقط تصویر. PDF و فایل‌های دیگر با پیوندِ معمولی (تبِ جدید) باز می‌شوند —
 * همان تفکیکِ `receipt_thumb_ro()`.
 */
export function Lightbox({
  src,
  alt = '',
  onClose,
  onPrev,
  onNext,
  position,
}: {
  src: string | null;
  alt?: string;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  /** مثلاً «2 / 5». */
  position?: string;
}) {
  const t = useT();
  return (
    <Dialog open={src !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent
        dismissable
        className="max-h-[92vh] max-w-[92vw] overflow-auto border-0 bg-black/90 p-2 sm:max-w-[92vw]"
        onKeyDown={(e) => {
          // ⚠️ جهتِ فیزیکی: «راست» همیشه تصویرِ سمتِ راست است — در راست‌به‌چپ قبلی، در چپ‌به‌راست بعدی.
          const rtl = document.documentElement.dir === 'rtl';
          if (e.key === 'ArrowRight') (rtl ? onPrev : onNext)?.();
          if (e.key === 'ArrowLeft') (rtl ? onNext : onPrev)?.();
        }}
      >
        <DialogTitle className="sr-only">{t('بزرگ‌نمایی')}</DialogTitle>
        {src && (
          <img
            src={src}
            alt={alt}
            className="mx-auto max-h-[86vh] w-auto max-w-full cursor-zoom-out object-contain"
            onClick={onClose}
          />
        )}
        {(onPrev || onNext) && (
          <div className="pointer-events-none absolute inset-x-3 top-1/2 flex -translate-y-1/2 justify-between">
            <button
              type="button"
              aria-label={t('تصویرِ قبلی')}
              disabled={!onPrev}
              onClick={onPrev}
              className="pointer-events-auto grid size-9 place-items-center rounded-full bg-black/60 text-white transition hover:bg-black/80 disabled:invisible"
            >
              <ChevronRight className="size-5 ltr:rotate-180" />
            </button>
            <button
              type="button"
              aria-label={t('تصویرِ بعدی')}
              disabled={!onNext}
              onClick={onNext}
              className="pointer-events-auto grid size-9 place-items-center rounded-full bg-black/60 text-white transition hover:bg-black/80 disabled:invisible"
            >
              <ChevronLeft className="size-5 ltr:rotate-180" />
            </button>
          </div>
        )}
        {position && (
          <span className="num pointer-events-none absolute inset-x-0 bottom-3 mx-auto w-fit rounded-full bg-black/60 px-2 py-0.5 text-xs text-white" dir="ltr">
            {position}
          </span>
        )}
      </DialogContent>
    </Dialog>
  );
}
