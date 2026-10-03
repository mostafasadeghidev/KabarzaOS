import { describe, expect, it } from 'vitest';
import {
  embedUrl, formatTimestamp, linkify, parseTimestamp, parseVideoUrl, videosIn,
} from './video';

const LOOM = '0281766fa2d04bb788eaf19e65135184';

describe('parseVideoUrl', () => {
  it('پیوندِ share و embed ِ لوم', () => {
    expect(parseVideoUrl(`https://www.loom.com/share/${LOOM}`)).toMatchObject({ provider: 'loom', id: LOOM });
    expect(parseVideoUrl(`https://loom.com/embed/${LOOM}?sid=abc`)).toMatchObject({ provider: 'loom', id: LOOM });
    expect(parseVideoUrl(`https://www.loom.com/share/Home-page-review-${LOOM}?t=83`))
      .toMatchObject({ provider: 'loom', id: LOOM, start: 83 });
  });

  it('همهٔ شکل‌های رایجِ یوتیوب', () => {
    for (const url of [
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://youtu.be/dQw4w9WgXcQ',
      'https://m.youtube.com/watch?v=dQw4w9WgXcQ&t=1m5s',
      'https://www.youtube.com/shorts/dQw4w9WgXcQ',
      'https://www.youtube.com/embed/dQw4w9WgXcQ',
    ]) {
      expect(parseVideoUrl(url)).toMatchObject({ provider: 'youtube', id: 'dQw4w9WgXcQ' });
    }
    expect(parseVideoUrl('https://youtu.be/dQw4w9WgXcQ?t=42')?.start).toBe(42);
    expect(parseVideoUrl('https://m.youtube.com/watch?v=dQw4w9WgXcQ&t=1m5s')?.start).toBe(65);
  });

  it('ویمئو با کلیدِ خصوصی و زمانِ داخلِ هش', () => {
    expect(parseVideoUrl('https://vimeo.com/123456789')).toMatchObject({ provider: 'vimeo', id: '123456789', hash: null });
    expect(parseVideoUrl('https://vimeo.com/123456789/abcdef1234#t=1m20s'))
      .toMatchObject({ provider: 'vimeo', hash: 'abcdef1234', start: 80 });
    expect(parseVideoUrl('https://player.vimeo.com/video/123456789?h=abcdef12')).toMatchObject({ hash: 'abcdef12' });
  });

  it('هر چیزِ دیگر رد می‌شود — دامنهٔ شبیه و شناسهٔ نامعتبر هم', () => {
    expect(parseVideoUrl('https://evil.com/share/' + LOOM)).toBeNull();
    expect(parseVideoUrl('https://loom.com.evil.com/share/' + LOOM)).toBeNull();
    expect(parseVideoUrl('https://www.loom.com/share/not-an-id')).toBeNull();
    expect(parseVideoUrl('https://www.youtube.com/watch?v=<script>')).toBeNull();
    expect(parseVideoUrl('javascript:alert(1)')).toBeNull();
    expect(parseVideoUrl('not a url')).toBeNull();
  });
});

describe('embedUrl', () => {
  it('همیشه به دامنهٔ ثابتِ پخش‌کننده', () => {
    const loom = parseVideoUrl(`https://www.loom.com/share/${LOOM}`)!;
    expect(embedUrl(loom)).toMatch(new RegExp(`^https://www\.loom\.com/embed/${LOOM}\?`));
    expect(embedUrl(loom, 90, true)).toContain('t=90');
    expect(embedUrl(loom, 90, true)).toContain('autoplay=1');
    const yt = parseVideoUrl('https://youtu.be/dQw4w9WgXcQ')!;
    expect(embedUrl(yt, 12)).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0&start=12');
    const vimeo = parseVideoUrl('https://vimeo.com/123456789/abcdef1234')!;
    expect(embedUrl(vimeo, 30)).toBe('https://player.vimeo.com/video/123456789?h=abcdef1234#t=30s');
  });
});

describe('زمانِ ویدئو', () => {
  it('ساعت‌دار، واحددار و ثانیهٔ ساده — با رقمِ فارسی', () => {
    expect(parseTimestamp('1:23')).toBe(83);
    expect(parseTimestamp('01:02:03')).toBe(3723);
    expect(parseTimestamp('83')).toBe(83);
    expect(parseTimestamp('1m20s')).toBe(80);
    expect(parseTimestamp('۲:۰۵')).toBe(125);
    expect(parseTimestamp('')).toBeNull();
    expect(parseTimestamp('1:75')).toBeNull();
    expect(parseTimestamp('abc')).toBeNull();
  });

  it('برگرداندن به متن', () => {
    expect(formatTimestamp(83)).toBe('1:23');
    expect(formatTimestamp(3723)).toBe('1:02:03');
    expect(formatTimestamp(-5)).toBe('0:00');
  });
});

describe('متنِ پیوند‌دار', () => {
  it('متن و پیوند جدا می‌شوند و نشانه‌گذاریِ پایانی جزوِ آدرس نیست', () => {
    expect(linkify('see https://a.com/x. then')).toEqual([
      { kind: 'text', text: 'see ' },
      { kind: 'link', href: 'https://a.com/x', text: 'https://a.com/x' },
      { kind: 'text', text: '. then' },
    ]);
    expect(linkify('ببین https://a.com،')[1]).toEqual({ kind: 'link', href: 'https://a.com', text: 'https://a.com' });
  });

  it('پرانتزِ جفت داخلِ آدرس می‌ماند', () => {
    const parts = linkify('(https://en.wikipedia.org/wiki/A_(b))');
    expect(parts[1]).toMatchObject({ href: 'https://en.wikipedia.org/wiki/A_(b)' });
  });

  it('متنِ ساده و طرحِ غیرِ http دست نمی‌خورد', () => {
    expect(linkify('no links here')).toEqual([{ kind: 'text', text: 'no links here' }]);
    expect(linkify('javascript:alert(1)')).toEqual([{ kind: 'text', text: 'javascript:alert(1)' }]);
  });

  it('ویدئوها بی‌تکرار و به ترتیب', () => {
    const text = `a https://youtu.be/dQw4w9WgXcQ b https://www.youtube.com/watch?v=dQw4w9WgXcQ c https://www.loom.com/share/${LOOM}`;
    expect(videosIn(text).map((v) => v.provider)).toEqual(['youtube', 'loom']);
  });
});
