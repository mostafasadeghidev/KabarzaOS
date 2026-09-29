import { describe, expect, it } from 'vitest';
import { isPalette, isTheme, storedAppearance } from './appearance';

describe('ظاهرِ اپ', () => {
  it('فقط مقدارهای شناخته‌شده پذیرفته می‌شوند', () => {
    expect(isTheme('dark')).toBe(true);
    expect(isTheme('auto')).toBe(false);
    expect(isTheme('')).toBe(false);
    expect(isPalette('ocean')).toBe(true);
    expect(isPalette('pink')).toBe(false);
  });

  it('⚠️ مقدارِ خالی یا ناشناخته «انتخاب‌نشده» است، نه «مطابقِ سیستم»', () => {
    // «انتخاب‌نشده» یعنی ترجیحِ مرورگر هنوز اثر دارد؛ اگر به `system` تبدیل
    // می‌شد، کاربری که در مرورگرش «تیره» گذاشته بود ناگهان روشن می‌دید.
    expect(storedAppearance({ theme: '', palette: '' })).toEqual({ theme: '', palette: '' });
    expect(storedAppearance({ theme: 'auto', palette: 'x' })).toEqual({ theme: '', palette: '' });
    expect(storedAppearance({ theme: 'dark', palette: 'forest' })).toEqual({ theme: 'dark', palette: 'forest' });
  });
});
