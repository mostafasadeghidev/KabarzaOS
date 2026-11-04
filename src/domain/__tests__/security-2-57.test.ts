import { describe, it, expect } from 'vitest';
import { sessionStillValid, wholeSecondNow } from '@/domain/auth/session';
import { makeTelegramLinkToken, telegramLinkTokenFresh } from '@/domain/people/profile';
import { isBinaryMedia } from '@/domain/ai/media';
import { redirectTarget } from '@/domain/mcp/oauth';
import { csvCell } from '@/domain/access/office-scope';

/** رفع‌های امنیتیِ ۲.۵۷.۰ — قطعه‌های خالصِ دامنه. */

describe('باطل شدنِ نشست', () => {
  it('کوکیِ امضاشده پیش از تغییرِ رمز باطل است؛ همان ثانیه و بعدش نه', () => {
    const at = wholeSecondNow(new Date('2026-11-04T10:00:00.700Z'));
    const sec = at.getTime() / 1000;
    expect(sessionStillValid(sec - 1, at)).toBe(false);
    expect(sessionStillValid(sec, at)).toBe(true);
    expect(sessionStillValid(sec + 5, at)).toBe(true);
    expect(sessionStillValid(sec - 999, null)).toBe(true);
  });
});

describe('پیوندِ اتصالِ تلگرام', () => {
  const now = new Date('2026-11-04T10:00:00Z');
  it('نیم ساعت معتبر است', () => {
    const token = makeTelegramLinkToken('ab'.repeat(18), now);
    expect(token).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
    expect(telegramLinkTokenFresh(token, new Date(now.getTime() + 29 * 60_000))).toBe(true);
    expect(telegramLinkTokenFresh(token, new Date(now.getTime() + 31 * 60_000))).toBe(false);
  });
  it('توکنِ قدیمیِ بی‌زمان پذیرفته نمی‌شود', () => {
    expect(telegramLinkTokenFresh('Zm9vYmFyYmF6cXV4cXV1eHF1dXhxdXV4', now)).toBe(false);
  });
});

describe('ورودیِ ffmpeg', () => {
  const bytes = (head: string | number[]) => {
    const out = new Uint8Array(200);
    const arr = typeof head === 'string' ? [...head].map((c) => c.charCodeAt(0)) : head;
    out.set(arr);
    return out;
  };
  it('mp4، ogg و webm پذیرفته می‌شوند', () => {
    expect(isBinaryMedia(bytes('\0\0\0\x20ftypisom'))).toBe(true);
    expect(isBinaryMedia(bytes('OggS'))).toBe(true);
    expect(isBinaryMedia(bytes([0x1a, 0x45, 0xdf, 0xa3]))).toBe(true);
  });
  it('فهرستِ پخش و متن رد می‌شوند', () => {
    expect(isBinaryMedia(bytes('#EXTM3U\n#EXT-X-MEDIA-SEQUENCE:0\nfile:///etc/passwd'))).toBe(false);
    expect(isBinaryMedia(bytes('ffconcat version 1.0'))).toBe(false);
  });
});

describe('صفحهٔ اجازهٔ OAuth', () => {
  it('میزبانِ واقعی را نشان می‌دهد و ناشناخته را علامت می‌زند', () => {
    expect(redirectTarget('https://claude.ai/api/mcp/auth_callback')).toEqual({ host: 'claude.ai', known: true, local: false });
    expect(redirectTarget('https://claude.ai.evil.com/cb').known).toBe(false);
    expect(redirectTarget('http://127.0.0.1:3333/cb').local).toBe(true);
  });
});

describe('CSV', () => {
  it('فرمولِ پشتِ فاصله یا تب هم خنثی می‌شود', () => {
    expect(csvCell('  =1+1')).toBe(`"'  =1+1"`);
    expect(csvCell('\t=1')).toBe(`"'\t=1"`);
    expect(csvCell('سلام')).toBe('"سلام"');
  });
});
