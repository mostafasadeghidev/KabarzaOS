/**
 * رنگِ خواناى متن روی یک پس‌زمینهٔ دلخواه.
 *
 * ⚠️ نسخهٔ قبلی روی هر چیپِ رنگی متنِ **سفید** می‌گذاشت. برای رنگ‌های تیره
 * درست است، ولی تگِ زردِ روشن با متنِ سفید عملاً ناخوانا می‌شد (نسبتِ
 * کنتراست حدودِ ۱٫۵:۱). اینجا با روشناییِ نسبیِ WCAG تصمیم گرفته می‌شود:
 * سیاه یا سفید — هرکدام کنتراستِ بیشتری بدهد.
 */

/** `#abc` یا `#aabbcc` → [r, g, b]؛ ورودیِ نامعتبر → null. */
export function parseHex(hex: string | null | undefined): [number, number, number] | null {
  if (!hex) return null;
  const value = hex.trim().replace(/^#/, '');
  const full = value.length === 3 ? value.split('').map((c) => c + c).join('') : value;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

/** روشناییِ نسبی (WCAG 2.1، بخشِ ۱٫۴٫۳). */
export function relativeLuminance([r, g, b]: [number, number, number]): number {
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** نسبتِ کنتراستِ دو روشنایی — همیشه ≥ ۱. */
export function contrastRatio(a: number, b: number): number {
  const [hi, lo] = a >= b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

/** متنِ سیاه یا سفید روی این پس‌زمینه — هرکدام خواناتر. */
export function readableOn(hex: string | null | undefined): '#000000' | '#ffffff' {
  const rgb = parseHex(hex);
  if (!rgb) return '#ffffff';
  const bg = relativeLuminance(rgb);
  // کنتراست با متنِ سیاه (روشناییِ ۰) در برابر متنِ سفید (روشناییِ ۱).
  return contrastRatio(bg, 0) >= contrastRatio(bg, 1) ? '#000000' : '#ffffff';
}

/**
 * استایلِ چیپِ رنگی — پس‌زمینهٔ خودِ تگ با متنِ خوانا.
 * رنگِ نامعتبر یا خالی → `undefined` تا چیپ به ظاهرِ پیش‌فرضِ تم برگردد.
 */
export function chipStyle(hex: string | null | undefined): React.CSSProperties | undefined {
  const rgb = parseHex(hex);
  if (!rgb) return undefined;
  const background = `#${rgb.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
  return { backgroundColor: background, color: readableOn(background), borderColor: background };
}
