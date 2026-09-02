'use client';

import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { useT } from '@/i18n/client';

/**
 * بزرگ‌نماییِ تصویر — پورتِ لایت‌باکسِ رسیدهای نسخهٔ قبلی: تمام‌صفحه، کلیک
 * روی تصویر، دکمهٔ × یا Escape می‌بندد.
 *
 * ⚠️ فقط تصویر. PDF و فایل‌های دیگر با پیوندِ معمولی (تبِ جدید) باز می‌شوند —
 * همان تفکیکِ `receipt_thumb_ro()`.
 */
export function Lightbox({
  src,
  alt = '',
  onClose,
}: {
  src: string | null;
  alt?: string;
  onClose: () => void;
}) {
  const t = useT();
  return (
    <Dialog open={src !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent
        dismissable
        className="max-h-[92vh] max-w-[92vw] overflow-auto border-0 bg-black/90 p-2 sm:max-w-[92vw]"
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
      </DialogContent>
    </Dialog>
  );
}
