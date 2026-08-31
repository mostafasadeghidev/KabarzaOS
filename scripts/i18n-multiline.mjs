/**
 * متن‌های **چندخطیِ** JSX که هنوز ترجمه نشده‌اند را پیدا می‌کند.
 *
 * ⚠️ کدمود عمداً این‌ها را رد می‌کند: شکستِ خط و تورفتگی داخلِ کلید می‌افتاد
 * و هیچ‌وقت با فایلِ ترجمه جور نمی‌شد. جمع‌کردنشان در یک خط کارِ دستی است،
 * چون گاهی وسطشان `{…}` هست و باید به کلیدِ پارامتری تبدیل شوند.
 *
 * اجرا:  node scripts/i18n-multiline.mjs
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const PERSIAN = /[؀-ۿ]/;

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx$/.test(entry) && !entry.includes('.test.')) out.push(full);
  }
  return out;
}

let total = 0;
for (const file of walk('src')) {
  const src = readFileSync(file, 'utf8');
  // کامنت‌ها بیرون.
  const clean = src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

  const lines = clean.split('\n');
  const hits = [];

  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (!PERSIAN.test(trimmed)) return;
    // خطی که فارسی دارد ولی نه در t(...) است و نه یک رشتهٔ کامل.
    if (/\b(?:t|tr)\(/.test(trimmed)) return;
    if (/^[*|/]/.test(trimmed)) return;
    // متنِ لختِ JSX: نه تگ کامل، نه انتساب.
    if (/^[^<>{}='"`]*[؀-ۿ][^<>{}='"`]*$/.test(trimmed)) hits.push([i + 1, trimmed]);
  });

  if (hits.length === 0) continue;
  total += hits.length;
  console.log(`\n${file}`);
  for (const [n, text] of hits) console.log(`  ${n}: ${text.slice(0, 70)}`);
}

console.log(`\nخطِ چندخطیِ ترجمه‌نشده: ${total}`);
