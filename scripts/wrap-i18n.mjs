/**
 * کدمودِ چندزبانگی — رشته‌های فارسیِ **دیدنی** را در `t(...)` می‌پیچد.
 *
 * ⚠️ عمداً محافظه‌کار است: هر الگویی که مطمئن نباشد دست‌نخورده می‌ماند.
 * رشتهٔ پیچیده‌نشده همچنان فارسی نشان داده می‌شود (کلید خودِ متن است)، پس
 * جا افتادن «خرابی» نیست — ولی پیچیدنِ اشتباه، خرابی است.
 *
 * چه چیزهایی را می‌پیچد:
 *   ۱. متنِ لختِ JSX که **تک‌خطی** است و هیچ `{}` در خود ندارد.
 *   ۲. مقدارِ رشته‌ایِ پراپ‌های دیدنی (title/label/placeholder/…).
 *   ۳. رشتهٔ فارسی در کلیدهای دیدنیِ شیء (label:/title:/description:).
 *
 * چه چیزهایی را **نمی‌پیچد**:
 *   · متنِ **چندخطی** — شکستِ خط و تورفتگی داخلِ کلید می‌افتاد و هیچ‌وقت
 *     با فایلِ ترجمه جور نمی‌شد.
 *   · کامنت‌ها، `className`، `name`، `value`، `key`، `href`، import
 *   · فایل‌های تست
 *
 * اجرا:  node scripts/wrap-i18n.mjs <file...>        (نوشتن)
 *        node scripts/wrap-i18n.mjs --dry <file...>  (فقط شمارش)
 */

import { readFileSync, writeFileSync } from 'node:fs';

const PERSIAN = /[؀-ۿ]/;

/** پراپ‌هایی که مقدارشان را کاربر می‌بیند. */
const VISIBLE_PROPS = new Set([
  'title', 'label', 'placeholder', 'description', 'aria-label', 'hint',
  'empty', 'emptyText', 'heading', 'caption', 'legend',
]);

/** کلیدهای شیء که مقدارشان روی صفحه می‌نشیند. */
const VISIBLE_KEYS = new Set(['label', 'title', 'description', 'hint', 'empty']);

/** بازه‌هایی که نباید دست بخورند: کامنت و import. */
function maskedRanges(src) {
  const ranges = [];
  let m;

  const block = /\/\*[\s\S]*?\*\//g;
  while ((m = block.exec(src))) ranges.push([m.index, m.index + m[0].length]);

  const line = /(^|[^:])\/\/[^\n]*/g;
  while ((m = line.exec(src))) ranges.push([m.index, m.index + m[0].length]);

  const imp = /^import[\s\S]*?from\s+'[^']*';/gm;
  while ((m = imp.exec(src))) ranges.push([m.index, m.index + m[0].length]);

  return (index) => ranges.some(([a, b]) => index >= a && index < b);
}

/**
 * نامِ امنِ مترجم برای این فایل.
 *
 * ⚠️ بعضی فایل‌ها `t` را از قبل برای چیزِ دیگری به کار می‌برند (مثلاً
 * `inbox.map((t) => …)` برای رشتهٔ گفتگو). تزریقِ `const t = useT()` آنجا
 * سایه می‌اندازد و `t.unread` بی‌صدا می‌شکند — پس نامِ دیگری لازم است.
 */
function translatorName(src) {
  return /(?<![\w$.'"])t(?![\w$])/.test(src) ? 'tr' : 't';
}

export function wrapFile(src) {
  let count = 0;
  const masked = maskedRanges(src);
  const isClient = /^['"]use client['"];/m.test(src);
  const T = translatorName(src);

  // ۱) متنِ لختِ JSX — تک‌خطی، بدونِ `{}`.
  let out = src.replace(
    /(>)([^<>{}\n]*[؀-ۿ][^<>{}\n]*)(<)/g,
    (full, open, text, close, index) => {
      if (masked(index)) return full;
      const trimmed = text.trim();
      if (!trimmed || !PERSIAN.test(trimmed)) return full;
      const lead = text.slice(0, text.length - text.trimStart().length);
      const tail = text.slice(text.trimEnd().length);
      count += 1;
      return `${open}${lead}{${T}(${JSON.stringify(trimmed)})}${tail}${close}`;
    },
  );

  // ۲) پراپ‌های دیدنی: title="متن"
  out = out.replace(
    /(\s)([a-zA-Z-]+)="([^"\n]*[؀-ۿ][^"\n]*)"/g,
    (full, space, prop, text, index) => {
      if (masked(index) || !VISIBLE_PROPS.has(prop)) return full;
      count += 1;
      return `${space}${prop}={${T}(${JSON.stringify(text)})}`;
    },
  );

  /**
   * ۳) کلیدهای دیدنیِ شیء: label: 'متن'
   *
   * ⚠️ فقط در کامپوننتِ **سرور**. در کلاینت این‌ها معمولاً ثابتِ سطحِ ماژول‌اند
   * (`const TABS = [...]`) و قلاب آنجا مجاز نیست؛ پیچیدنشان کدِ خراب می‌سازد.
   * در کلاینت متنشان فارسی می‌ماند و محلِ **نمایش** ترجمه‌اش می‌کند.
   */
  if (!isClient) out = out.replace(
    /([{,]\s*)([a-zA-Z]+)(:\s*)'([^'\n]*[؀-ۿ][^'\n]*)'/g,
    (full, pre, key, colon, text, index) => {
      if (masked(index) || !VISIBLE_KEYS.has(key)) return full;
      count += 1;
      return `${pre}${key}${colon}${T}(${JSON.stringify(text)})`;
    },
  );

  if (count > 0) out = ensureTranslator(out, T);
  return { out, count };
}

/** جفتِ پرانتزِ بازِ داده‌شده. */
function matchingParen(src, openIndex) {
  let depth = 0;
  for (let i = openIndex; i < src.length; i += 1) {
    if (src[i] === '(') depth += 1;
    else if (src[i] === ')') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** بدنهٔ تابع از `{` ِ باز تا جفتش. */
function sliceBody(src, from) {
  let depth = 1;
  for (let i = from; i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') {
      depth -= 1;
      if (depth === 0) return src.slice(from, i);
    }
  }
  return src.slice(from);
}

/** درجِ یک import پس از آخرین importِ سطحِ بالا. */
function addImport(src, statement) {
  const imports = [...src.matchAll(/^import[\s\S]*?from '[^']*';$/gm)];
  if (imports.length === 0) return src;
  const last = imports[imports.length - 1];
  const at = last.index + last[0].length;
  return `${src.slice(0, at)}\n${statement}${src.slice(at)}`;
}

/**
 * تزریقِ مترجم.
 *
 * ⚠️ دو مسیرِ متفاوت و نباید قاطی شوند:
 *  · کامپوننتِ **سرور** → `import { t }` — همگام و بی‌پراپ، از ذخیره‌گاهِ
 *    per-request.
 *  · کامپوننتِ **کلاینت** → قلابِ `useT()` داخلِ هر کامپوننتی که t دارد،
 *    چون قلاب بیرون از بدنهٔ کامپوننت مجاز نیست.
 */
function ensureTranslator(src, T) {
  const isClient = /^['"]use client['"];/m.test(src);

  if (!isClient) {
    if (src.includes("from '@/i18n/server'")) return src;
    const spec = T === 't' ? 't' : `t as ${T}`;
    return addImport(src, `import { ${spec} } from '@/i18n/server';`);
  }

  let out = src;
  if (!out.includes("from '@/i18n/client'")) {
    out = addImport(out, "import { useT } from '@/i18n/client';");
  }

  // اعلانِ مترجم در ابتدای هر کامپوننتی که صدایش می‌زند.
  // ⚠️ `export default function` هم باید بگیرد، وگرنه صفحهٔ ورود جا می‌ماند.
  // ⚠️ `<T extends …>` هم باید رد شود، وگرنه کامپوننتِ جنریک جا می‌ماند.
  const fnStart = /(?:^|\n)(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+[A-Z]\w*\s*(?:<[^>]*>)?\s*\(/g;
  const declaration = `const ${T} = useT();`;
  const callsIt = new RegExp(`\\b${T}\\(`);

  const insertions = [];
  let m;
  while ((m = fnStart.exec(out))) {
    const close = matchingParen(out, m.index + m[0].length - 1);
    if (close === -1) continue;
    const open = out.indexOf('{', close);
    if (open === -1) continue;

    const bodyStart = open + 1;
    const body = sliceBody(out, bodyStart);
    if (!callsIt.test(body)) continue;
    if (body.includes(declaration)) continue;
    insertions.push(bodyStart);
  }

  // از آخر به اول، تا جابه‌جاییِ اندیس‌ها مهم نباشد.
  for (const at of insertions.reverse()) {
    out = `${out.slice(0, at)}\n  ${declaration}${out.slice(at)}`;
  }
  return out;
}

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const files = args.filter((a) => !a.startsWith('--'));

let total = 0;
for (const file of files) {
  if (file.includes('.test.')) continue;
  const src = readFileSync(file, 'utf8');
  const { out, count } = wrapFile(src);
  if (count === 0) continue;
  total += count;
  if (!dry) writeFileSync(file, out, 'utf8');
  console.log(`${count.toString().padStart(4)}  ${file}`);
}
console.log(`\n${dry ? 'قابلِ پیچیدن' : 'پیچیده شد'}: ${total}`);
