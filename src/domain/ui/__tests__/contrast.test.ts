import { describe, it, expect } from 'vitest';
import { chipStyle, contrastRatio, parseHex, readableOn, relativeLuminance } from '../contrast';

/** رنگِ متنِ چیپ‌ها — قاعدهٔ خوانایی، نه «همیشه سفید». */

describe('parseHex', () => {
  it('سه‌رقمی و شش‌رقمی را می‌خواند و بقیه را رد می‌کند', () => {
    expect(parseHex('#fff')).toEqual([255, 255, 255]);
    expect(parseHex('4ade80')).toEqual([74, 222, 128]);
    expect(parseHex('')).toBeNull();
    expect(parseHex(null)).toBeNull();
    expect(parseHex('رنگ')).toBeNull();
    expect(parseHex('#12345')).toBeNull();
  });
});

describe('readableOn', () => {
  it('روی رنگِ روشن سیاه و روی رنگِ تیره سفید', () => {
    expect(readableOn('#fde047')).toBe('#000000'); // زردِ روشن
    expect(readableOn('#ffffff')).toBe('#000000');
    expect(readableOn('#1e3a8a')).toBe('#ffffff'); // آبیِ تیره
    expect(readableOn('#000000')).toBe('#ffffff');
  });

  it('انتخابش همیشه کنتراستِ ≥ ۴٫۵ می‌دهد مگر رنگِ میانیِ سخت', () => {
    for (const hex of ['#fde047', '#4ade80', '#1e3a8a', '#ef4444', '#ffffff', '#000000']) {
      const bg = relativeLuminance(parseHex(hex)!);
      const fg = readableOn(hex) === '#000000' ? 0 : 1;
      expect(contrastRatio(bg, fg)).toBeGreaterThan(3);
    }
  });

  it('رنگِ نامعتبر → سفید (همان پیش‌فرضِ قبلی)', () => {
    expect(readableOn(null)).toBe('#ffffff');
  });
});

describe('chipStyle', () => {
  it('پس‌زمینه و متن را با هم می‌دهد', () => {
    expect(chipStyle('#fde047')).toEqual({
      backgroundColor: '#fde047', color: '#000000', borderColor: '#fde047',
    });
  });

  it('بدونِ رنگ، استایلی نمی‌سازد تا چیپ به ظاهرِ تم برگردد', () => {
    expect(chipStyle('')).toBeUndefined();
    expect(chipStyle(null)).toBeUndefined();
  });
});
