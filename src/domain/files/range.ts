/**
 * هدرِ `Range` ِ درخواستِ فایل — پورتِ بخشِ پخشِ جریانی (F#285).
 *
 * فقط **یک** بازه پذیرفته می‌شود (`bytes=a-b`، `bytes=a-`، `bytes=-n`)؛ همان
 * چیزی که پخش‌کنندهٔ صدا/ویدئو و ادامهٔ دانلود می‌فرستند. چندبازه‌ای یا بدشکل
 * `null` است یعنی «کلِ فایل با ۲۰۰» — طبقِ RFC 9110 نادیده‌گرفتنِ Range مجاز
 * است و خطا دادن نه.
 *
 * ⚠️ خروجی شکلِ استانداردِ همان بازه است و مستقیم به S3 می‌رود؛ این‌که بازه
 * از اندازهٔ فایل بیرون است را S3 می‌گوید (۴۱۶)، چون اندازهٔ واقعی را او دارد.
 */
export function normalizeRange(header: string | null | undefined): string | null {
  if (!header) return null;
  const match = /^\s*bytes\s*=\s*(\d*)\s*-\s*(\d*)\s*$/i.exec(header);
  if (!match) return null;
  const [, from, to] = match;
  if (from === '' && to === '') return null;
  if (from === '') {
    // «n بایتِ آخر» — صفر معنا ندارد.
    return Number(to) > 0 ? `bytes=-${Number(to)}` : null;
  }
  if (to === '') return `bytes=${Number(from)}-`;
  if (Number(to) < Number(from)) return null;
  return `bytes=${Number(from)}-${Number(to)}`;
}
