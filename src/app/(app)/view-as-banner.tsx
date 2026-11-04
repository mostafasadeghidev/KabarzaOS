import { Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { t } from '@/i18n/server';
import { stopViewAsAction } from './_actions/view-as';

/**
 * نوارِ ثابتِ «دیدن به‌جای کاربر» (۲.۵۳.۰) — تا مالک لحظه‌ای فراموش نکند
 * چشمِ چه کسی است، و برگشت همیشه یک کلیک فاصله داشته باشد.
 */
export function ViewAsBanner({ name }: { name: string }) {
  return (
    <div
      role="status"
      className="sticky top-0 z-50 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-amber-500 px-4 py-1.5 text-sm text-amber-950"
    >
      <Eye className="size-4 shrink-0" aria-hidden />
      <span>
        <strong>{t('به‌جای {name} می‌بینید', { name })}</strong>
        {' — '}
        {t('فقط دیدن؛ هیچ تغییری ذخیره نمی‌شود.')}
      </span>
      <form action={stopViewAsAction}>
        <Button type="submit" size="xs" variant="outline" className="border-amber-950/30 bg-amber-50 text-amber-950 hover:bg-amber-100">
          {t('برگشت به حسابِ خودم')}
        </Button>
      </form>
    </div>
  );
}
