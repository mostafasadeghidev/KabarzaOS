import sharp from 'sharp';

/**
 * پیش‌نمایشِ کوچکِ تصویر — پورتِ `THUMB_W = 400` ِ نسخهٔ قبلی.
 *
 * ⚠️ چرا اصلاً؟ کارتِ پروژه و فهرستِ افراد تصویر را در ۴۴ پیکسل نشان می‌دهند؛
 * فرستادنِ عکسِ اصلیِ چندمگابایتی برای آن یعنی صفحه‌ای که روی اینترنتِ کند
 * باز نمی‌شود. نسخهٔ کوچک یک‌بار هنگامِ بارگذاری ساخته می‌شود، نه در هر نمایش.
 */

/** عرضِ پیش‌نمایش — همان ۴۰۰ ِ نسخهٔ قبلی. */
export const PREVIEW_WIDTH = 400;

/** خروجی همیشه WebP است؛ کوچک‌تر از JPEG و همه‌جا پشتیبانی می‌شود. */
export const PREVIEW_MIME = 'image/webp';

/**
 * فرمت‌هایی که پیش‌نمایش برایشان ساخته می‌شود.
 *
 * ⚠️ SVG عمداً بیرون است: برداری است (کوچک‌کردنش سودی ندارد) و پردازشش با
 * کتابخانهٔ تصویر سطحِ حمله باز می‌کند. GIF هم بیرون است تا متحرک‌بودنش
 * از بین نرود.
 */
const PREVIEWABLE = new Set(['image/jpeg', 'image/png', 'image/webp']);

export function canPreview(mime: string): boolean {
  return PREVIEWABLE.has(mime.toLowerCase().split(';')[0]!.trim());
}

/**
 * ساختِ پیش‌نمایش. `null` یعنی «نساختیم» — و این خطا **نیست**:
 * فراخوان در آن حالت به عکسِ اصلی برمی‌گردد.
 *
 * ⚠️ شکستِ ساخت هم `null` می‌دهد، نه پرتابِ خطا: عکسی که پیش‌نمایشش ساخته
 * نشد باید همچنان بارگذاری شود، نه اینکه کلِ آپلود بشکند.
 */
export async function makePreview(
  bytes: Uint8Array,
  mime: string,
): Promise<Uint8Array | null> {
  if (!canPreview(mime)) return null;

  try {
    const out = await sharp(bytes)
      // ⚠️ `withoutEnlargement` — عکسِ ۱۰۰ پیکسلی نباید کش بیاید و تار شود.
      .resize({ width: PREVIEW_WIDTH, withoutEnlargement: true })
      // ⚠️ چرخشِ EXIF اعمال می‌شود، وگرنه عکسِ موبایل خوابیده می‌ماند.
      .rotate()
      .webp({ quality: 78 })
      .toBuffer();
    return new Uint8Array(out);
  } catch (error) {
    console.error('[preview]', error);
    return null;
  }
}
