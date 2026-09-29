import { describe, expect, it } from 'vitest';
import { normalizeRange } from './range';

describe('هدرِ Range', () => {
  it('سه شکلِ تک‌بازه', () => {
    expect(normalizeRange('bytes=0-99')).toBe('bytes=0-99');
    expect(normalizeRange('bytes=100-')).toBe('bytes=100-');
    expect(normalizeRange('bytes=-500')).toBe('bytes=-500');
    expect(normalizeRange(' BYTES = 007 - 010 ')).toBe('bytes=7-10');
  });

  it('⚠️ بدشکل یا چندبازه‌ای = کلِ فایل، نه خطا', () => {
    expect(normalizeRange(null)).toBeNull();
    expect(normalizeRange('bytes=0-1,5-9')).toBeNull();
    expect(normalizeRange('items=0-9')).toBeNull();
    expect(normalizeRange('bytes=-')).toBeNull();
    expect(normalizeRange('bytes=-0')).toBeNull();
    expect(normalizeRange('bytes=9-3')).toBeNull();
  });
});
