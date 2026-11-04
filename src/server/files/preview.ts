import sharp, { type Sharp } from 'sharp';

/**
 * پیش‌نمایشِ کوچکِ تصویر — پورتِ `THUMB_W = 400` ِ نسخهٔ قبلی.
 *
 * ⚠️ چرا اصلاً؟ کارتِ پروژه و فهرستِ افراد تصویر را در ۴۴ پیکسل نشان می‌دهند؛
 * فرستادنِ عکسِ اصلیِ چندمگابایتی برای آن یعنی صفحه‌ای که روی اینترنتِ کند
 * باز نمی‌شود. نسخهٔ کوچک یک‌بار هنگامِ بارگذاری ساخته می‌شود، نه در هر نمایش.
 */

/** عرضِ پیش‌نمایش — همان ۴۰۰ ِ نسخهٔ قبلی. */
export const PREVIEW_WIDTH = 400;

/**
 * سقفِ پیکسلِ ورودیِ sharp (۲.۵۷.۰) — حدودِ ۸۰۰۰×۵۰۰۰.
 * ⚠️ پیش‌فرضِ sharp ۲۶۸ میلیون پیکسل است: «بمبِ تصویر» ِ چندکیلوبایتی با
 * ابعادِ غول‌آسا چند گیگ حافظه و چند ثانیه پردازنده می‌گرفت. بزرگ‌تر از این
 * پیش‌نمایش نمی‌گیرد و خودِ فایل دست‌نخورده می‌ماند.
 */
export const MAX_INPUT_PIXELS = 40_000_000;

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
    const out = await sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS })
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

/** قالب‌هایی که فرادادهٔ EXIF شان پیش از ذخیره پاک می‌شود. */
const STRIPPABLE: Record<string, (img: Sharp) => Sharp> = {
  'image/jpeg': (img) => img.jpeg({ quality: 92, mozjpeg: true }),
  'image/png': (img) => img.png(),
  'image/webp': (img) => img.webp({ quality: 92 }),
};

/**
 * پاک کردنِ EXIF (موقعیتِ GPS، مدلِ گوشی، زمانِ عکس) از عکسِ اصلی (۲.۵۷.۰).
 *
 * ⚠️ عکسِ گوشی مختصاتِ جایی را که گرفته شده با خودش دارد — عکسِ پروفایل یا
 * اسکرین‌شاتی که در کامنت می‌رود نباید نشانیِ خانهٔ کسی را لو بدهد.
 * فقط وقتی EXIF دارد دوباره ساخته می‌شود (بقیه دست‌نخورده)؛ چرخش اعمال و
 * پروفایلِ رنگ نگه داشته می‌شود. شکست = همان بایت‌های اصلی، نه خطا.
 */
export async function stripMetadata(bytes: Uint8Array, mime: string): Promise<Uint8Array> {
  const encode = STRIPPABLE[mime];
  if (!encode) return bytes;
  try {
    const input = sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS });
    const meta = await input.metadata();
    if (!meta.exif || (meta.pages ?? 1) > 1) return bytes;
    const out = await encode(input.rotate().keepIccProfile()).toBuffer();
    return new Uint8Array(out);
  } catch {
    return bytes;
  }
}
