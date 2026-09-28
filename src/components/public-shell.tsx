import { cn } from '@/lib/utils';

export interface PublicBrand {
  name: string;
  /** نسخهٔ کوچکِ لوگو به‌شکلِ `data:` — یا `null` وقتی لوگویی ثبت نشده. */
  logo: string | null;
}

/**
 * پوستهٔ صفحه‌های عمومی (ورود، فراموشیِ رمز، تعیینِ رمز، نصبِ اولیه) — همان
 * چیدمانِ بلوکِ login ِ shadcn: ستونِ وسط‌چین، نشانِ برند بالای کارت.
 *
 * ⚠️ چرا لازم شد: چهار صفحه هر کدام `<main>` و کارتِ خودشان را می‌ساختند و
 * هیچ‌کدام لوگو و نامِ شرکت را نشان نمی‌دادند؛ کاربرِ یک آژانس پشتِ درِ
 * ورود «KabarzaOS» می‌دید، نه نامِ شرکتِ خودش. نشانِ برند همان است که در
 * سرِ سایدبار می‌آید (لوگو، وگرنه حرفِ اولِ نام روی مربعِ آبی).
 *
 * ⚠️ لوگو `data:` است، نه `/api/files/…`: آن مسیر گیت‌شده است و کاربرِ
 * واردنشده ۴۰۳ می‌گیرد (R-FILE-01)؛ صفحه خودش نسخهٔ کوچک را می‌خواند —
 * `companyLogoDataUrl()` در سرویسِ فایل.
 */
export function PublicShell({
  brand,
  width = 'sm',
  children,
}: {
  brand: PublicBrand;
  /** `sm` برای ورود و رمز؛ `lg` برای ویزاردِ نصب که دو ستون فیلد دارد. */
  width?: 'sm' | 'lg';
  children: React.ReactNode;
}) {
  return (
    <main className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className={cn('flex w-full flex-col gap-6', width === 'sm' ? 'max-w-sm' : 'max-w-lg')}>
        <div className="flex items-center justify-center gap-2 text-sm font-semibold">
          {brand.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={brand.logo} alt="" className="size-8 rounded-md object-contain" />
          ) : (
            <span className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <span className="text-sm font-bold">{brand.name.trim().slice(0, 1) || 'K'}</span>
            </span>
          )}
          <span>{brand.name}</span>
        </div>
        {children}
      </div>
    </main>
  );
}
