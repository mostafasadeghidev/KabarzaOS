import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * نگهبانِ چیدمانِ جدول‌ها.
 *
 * ⚠️ دلیلِ وجودش یک باگِ واقعی است که مدت‌ها دیده نشد: کلاسِ `.num`
 * (که روی `<td>` ِ عددی هم می‌نشیند) `display: inline-block` داشت. یک
 * `<td>` با آن display دیگر **سلولِ جدول نیست** — از شبکهٔ ستون‌ها بیرون
 * می‌افتد، مرورگر برایش سلولِ ناشناس می‌سازد و ستون‌های کلِ جدول می‌لغزند.
 * نتیجه‌اش این بود که عددها دقیقاً زیرِ سرستونِ خودشان نمی‌نشستند.
 *
 * هیچ تستِ منطقی این را نمی‌گرفت (DOM درست بود، فقط هندسه غلط بود) و
 * `tsc` هم CSS نمی‌بیند. این تست ساده جلوی بازگشتش را می‌گیرد.
 */

const css = readFileSync('src/app/globals.css', 'utf8');

function ruleBody(selector: string): string {
  const at = css.indexOf(`${selector} {`);
  if (at === -1) throw new Error(`قاعدهٔ ${selector} پیدا نشد`);
  return css.slice(at, css.indexOf('}', at));
}

describe('چیدمانِ جدول', () => {
  it('⚠️ `.num` هرگز display را عوض نمی‌کند — سلولِ جدول باید سلول بماند', () => {
    expect(ruleBody('.num')).not.toMatch(/display\s*:/);
  });

  it('جداییِ جهتِ عدد با unicode-bidi انجام می‌شود، نه با display', () => {
    expect(ruleBody('.num')).toMatch(/unicode-bidi\s*:\s*isolate/);
    expect(ruleBody('.num')).toMatch(/direction\s*:\s*ltr/);
  });
});
