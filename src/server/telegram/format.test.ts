import { describe, expect, it } from 'vitest';
import {
  bullet, bulletHtml, dueHtml, esc, heading, isParseError, mdToHtml, moreHtml, quote, splitHtml, stripHtml, truncateHtml, whenHtml,
} from './format';

/** زبانِ دیداریِ پیام‌های تلگرام (۲.۲۳.۰). */

const tr = (s: string, p?: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(p?.[k] ?? ''));

/** تگ‌های باز و بسته برابرند؟ (همان چیزی که تلگرام می‌سنجد). */
function balanced(html: string): boolean {
  const stack: string[] = [];
  for (const m of html.matchAll(/<(\/?)([a-z-]+)[^>]*>/g)) {
    if (m[1]) { if (stack.pop() !== m[2]) return false; } else stack.push(m[2]!);
  }
  return stack.length === 0;
}

describe('قالب', () => {
  it('سرتیتر و ردیف escape می‌کنند؛ تکهٔ خالی «—» ِ آویزان نمی‌سازد', () => {
    expect(heading('📋', 'a<b>', 3)).toBe('📋 <b>a&lt;b&gt;</b> (3)');
    expect(bullet('x & y', '', null, 'z')).toBe('• x &amp; y — z');
    expect(bulletHtml('<code>A-1</code>')).toBe('• <code>A-1</code>');
  });

  it('ددلاین و زمان نسبت به امروزِ بیننده', () => {
    expect(dueHtml('2026-10-01', '2026-10-11', tr)).toContain('دیرکرد');
    expect(dueHtml('2026-10-11', '2026-10-11', tr)).toBe('📅 امروز');
    expect(dueHtml('2026-10-12', '2026-10-11', tr)).toBe('📅 فردا');
    expect(dueHtml('2026-10-20', '2026-10-11', tr)).toBe('📅 2026-10-20');
    expect(dueHtml(null, '2026-10-11', tr)).toBe('');
    expect(whenHtml('2026-10-11T06:30:00Z', 'UTC', '2026-10-11', tr)).toBe('امروز 06:30');
    expect(whenHtml('2026-10-12T06:30:00Z', 'UTC', '2026-10-11', tr)).toBe('فردا 06:30');
    expect(whenHtml('2026-11-01T06:30:00Z', 'UTC', '2026-10-11', tr)).toBe('2026-11-01 06:30');
  });

  it('«و n مورد دیگر» فقط وقتی چیزی مانده', () => {
    expect(moreHtml(5, 5, tr)).toBe('');
    expect(moreHtml(8, 5, tr)).toBe('<i>و 3 مورد دیگر</i>');
  });

  it('نقل‌قولِ بلند جمع‌شده است و متن escape می‌شود', () => {
    expect(quote('<x>')).toBe('<blockquote>&lt;x&gt;</blockquote>');
    expect(quote('a\nb\nc\nd')).toContain('<blockquote expandable>');
  });
});

describe('بریدن و تکه‌کردنِ امن', () => {
  it('بریدن تگ یا موجودیت را نمی‌شکند و تگ‌ها را می‌بندد', () => {
    const html = `<b>${'سلام '.repeat(50)}</b> &amp; <blockquote>${'x'.repeat(200)}</blockquote>`;
    for (const max of [10, 50, 120, 260, 300]) {
      const out = truncateHtml(html, max);
      expect(out.length).toBeLessThanOrEqual(max);
      expect(balanced(out)).toBe(true);
      expect(out).not.toMatch(/&[a-z]*$/);
    }
    expect(truncateHtml('<b>ok</b>', 100)).toBe('<b>ok</b>');
  });

  it('ایموجی نصفه نمی‌ماند', () => {
    const out = truncateHtml('😀'.repeat(20), 8);
    expect(out).not.toMatch(/[\uD800-\uDBFF]…/);
  });

  it('تکه‌ها زیرِ سقف‌اند و نقل‌قولِ چندخطی در هر تکه بسته و باز می‌شود', () => {
    const html = ['<b>سرتیتر</b>', '<blockquote>', ...Array.from({ length: 80 }, (_, i) => `خطِ ${i} ${'—'.repeat(20)}`), '</blockquote>', 'پایان'].join('\n');
    const parts = splitHtml(html, 1000);
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts) {
      expect(p.length).toBeLessThanOrEqual(1000);
      expect(balanced(p)).toBe(true);
    }
    expect(stripHtml(parts.join('\n'))).toContain('پایان');
  });

  it('متنِ ساده برای نسخهٔ پشتیبان و تشخیصِ خطای قالب', () => {
    expect(stripHtml('<b>a &lt;b&gt; &amp; c</b>')).toBe('a <b> & c');
    expect(isParseError({ ok: false, description: "Bad Request: can't parse entities: unsupported start tag" })).toBe(true);
    expect(isParseError({ ok: false, description: 'Bad Request: chat not found' })).toBe(false);
    expect(isParseError({ ok: true })).toBe(false);
  });
});

describe('جوابِ هوشِ مصنوعی (Markdown ← HTML)', () => {
  it('پررنگ، کد، سرتیتر، فهرست و پیوندِ https؛ هر تگِ دیگر escape', () => {
    const out = mdToHtml('# برنامه\n- **مهم**: `ALZ-1`\n* دوم\n[سایت](https://example.com/a?b=1&c=2)\n<script>x</script>');
    expect(out).toContain('<b>برنامه</b>');
    expect(out).toContain('• <b>مهم</b>: <code>ALZ-1</code>');
    expect(out).toContain('• دوم');
    expect(out).toContain('<a href="https://example.com/a?b=1&amp;c=2">سایت</a>');
    expect(out).toContain('&lt;script&gt;');
    expect(balanced(out)).toBe(true);
  });

  it('بلوکِ کد و پیوندِ غیرِ https', () => {
    expect(mdToHtml('```js\nif (a < b) {}\n```')).toBe('<pre>if (a &lt; b) {}</pre>');
    expect(mdToHtml('[x](javascript:alert(1))')).not.toContain('<a');
    expect(mdToHtml('سلام! چطور کمک کنم؟')).toBe('سلام! چطور کمک کنم؟');
    expect(esc('a&b')).toBe('a&amp;b');
  });
});
