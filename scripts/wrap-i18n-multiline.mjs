/**
 * بندهای **چندخطیِ** JSX را در یک کلیدِ تک‌خطی می‌پیچد.
 *
 * ⚠️ چرا جمع‌کردنِ خطوط بی‌خطر است؟ چون خودِ JSX هنگامِ رندر فاصله‌های
 * پیاپی و شکستِ خط را به یک فاصله تبدیل می‌کند. پس متنِ نمایش‌داده‌شده
 * دقیقاً همان می‌ماند؛ فقط کلید قابلِ تطبیق با فایلِ ترجمه می‌شود.
 *
 * ⚠️ بندی که `{…}` در خود دارد **دست نمی‌خورد**: آن باید به کلیدِ پارامتری
 * تبدیل شود و انتخابِ نامِ پارامتر کارِ آدم است، نه رجکس.
 *
 * اجرا:  node scripts/wrap-i18n-multiline.mjs <file...>
 *        node scripts/wrap-i18n-multiline.mjs --dry <file...>
 */

import { readFileSync, writeFileSync } from 'node:fs';

const PERSIAN = /[؀-ۿ]/;

/** نامِ امنِ مترجم — همان قاعدهٔ کدمودِ اصلی. */
function translatorName(src) {
  if (/\btr\(/.test(src)) return 'tr';
  return /(?<![\w$.'"])t(?![\w$])/.test(src) ? 'tr' : 't';
}

function maskedRanges(src) {
  const ranges = [];
  let m;
  const block = /\/\*[\s\S]*?\*\//g;
  while ((m = block.exec(src))) ranges.push([m.index, m.index + m[0].length]);
  const line = /(^|[^:])\/\/[^\n]*/g;
  while ((m = line.exec(src))) ranges.push([m.index, m.index + m[0].length]);
  return (index) => ranges.some(([a, b]) => index >= a && index < b);
}

export function wrapMultiline(src) {
  const masked = maskedRanges(src);
  const T = translatorName(src);
  let count = 0;

  // بندِ چندخطی: از `>` تا `<`، بدونِ هیچ `{` یا `}`.
  const out = src.replace(
    /(>)([^<>{}]*\n[^<>{}]*)(<)/g,
    (full, open, text, close, index) => {
      if (masked(index)) return full;
      if (!PERSIAN.test(text)) return full;

      const collapsed = text.replace(/\s+/g, ' ').trim();
      if (!collapsed) return full;

      // تورفتگیِ خطِ بسته حفظ می‌شود تا قالب‌بندی به‌هم نریزد.
      const closingIndent = text.slice(text.lastIndexOf('\n'));
      count += 1;
      return `${open}${closingIndent}  {${T}(${JSON.stringify(collapsed)})}${closingIndent}${close}`;
    },
  );

  return { out, count, name: T };
}

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const files = args.filter((a) => !a.startsWith('--'));

let total = 0;
for (const file of files) {
  if (file.includes('.test.')) continue;
  const src = readFileSync(file, 'utf8');
  const { out, count } = wrapMultiline(src);
  if (count === 0) continue;
  total += count;
  if (!dry) writeFileSync(file, out, 'utf8');
  console.log(`${count.toString().padStart(4)}  ${file}`);
}
console.log(`\n${dry ? 'قابلِ پیچیدن' : 'پیچیده شد'}: ${total}`);
