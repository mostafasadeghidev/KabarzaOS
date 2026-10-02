import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ICON_BACKGROUND, iconLetter, normalizeIconSize } from './icon';

describe('آیکونِ برنامه', () => {
  it('فقط اندازه‌های مجاز؛ بقیه ۳۲', () => {
    expect(normalizeIconSize('180')).toBe(180);
    expect(normalizeIconSize('512')).toBe(512);
    expect(normalizeIconSize('4096')).toBe(32);
    expect(normalizeIconSize('abc')).toBe(32);
    expect(normalizeIconSize(null)).toBe(32);
  });

  it('حرفِ اول: فارسی، لاتینِ بزرگ، ایموجیِ کامل، نامِ خالی', () => {
    expect(iconLetter('کبرزا')).toBe('ک');
    expect(iconLetter('  kabarza ')).toBe('K');
    expect(iconLetter('👩‍💻 تیم')).toBe('👩‍💻');
    expect(iconLetter('   ')).toBe('K');
  });

  it('⚠️ رنگِ آیکون همان رنگِ اصلیِ برنامه است — اگر یکی عوض شد، دیگری هم', () => {
    const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8');
    expect(css).toMatch(/--color-primary: oklch\(0\.54 0\.17 254\);/);
    expect(ICON_BACKGROUND).toBe('#046dce');
  });
});
