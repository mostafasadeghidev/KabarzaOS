/**
 * تک‌نگار (monogram) — جایگزینِ تصویر وقتی تصویری نیست.
 *
 *. دو نکتهٔ نسخهٔ قبلی عمداً حفظ شده‌اند:
 *  - **دو رنگ با فاصلهٔ ۴۵ تا ۹۵ درجه** — نزدیک به هم، پس هیچ‌وقت جیغ نمی‌شود.
 *  - **روشناییِ سقف‌دار** تا حرفِ سفید همیشه خوانا بماند.
 */

/**
 * هشِ پایدار از شناسه و عنوان.
 * ⚠️ باید در سرور و مرورگر یک عدد بدهد، وگرنه رنگ بعد از hydration می‌پرد.
 * پس از `Math.random` یا زمان خبری نیست — فقط خودِ متن.
 */
export function stableHash(seed: string): number {
  let hash = 0;
  for (const ch of seed) {
    hash = (hash * 31 + ch.codePointAt(0)!) % 0xffffffff;
  }
  return Math.abs(hash);
}

export interface Monogram {
  letter: string;
  background: string;
}

export function monogram(id: number, title: string): Monogram {
  const clean = title.trim();
  const letter = clean ? [...clean][0]! : '#';

  const hash = stableHash(`${id}|${clean}`);
  const h1 = hash % 360;
  const h2 = (h1 + 45 + ((hash >> 8) % 50)) % 360;

  return {
    letter,
    background: `linear-gradient(135deg, hsl(${h1} 68% 52%) 0%, hsl(${h2} 72% 40%) 100%)`,
  };
}
