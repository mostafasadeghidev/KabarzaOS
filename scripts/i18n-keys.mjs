/**
 * استخراجِ کلیدهای ترجمه از کد — **تنها** پیاده‌سازیِ این کار.
 *
 * ⚠️ چرا ماژولِ جدا: پیش از این همین منطق دو جا نوشته شده بود — یک بار در
 * `scripts/i18n-missing.mjs` و یک بار در `src/i18n/coverage.test.ts` — و
 * دقیقاً همان اتفاقی افتاد که از دوباره‌نویسی انتظار می‌رود: یکی گسترش
 * یافت و دیگری نیافت، پس ابزار «کامل» گزارش می‌داد در حالی که رابطِ
 * انگلیسی هنوز «عملیات» و «اطلاعات پایه» را فارسی نشان می‌داد. حالا هر دو
 * از همین‌جا می‌خوانند و امکانِ واگرایی نیست.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const PERSIAN = /[؀-ۿ]/;

/** کلیدهایی که مقدارشان بعداً پویا ترجمه می‌شود، مثلِ `t(card.label)`. */
// ⚠️ `header` و `addLabel` بعداً اضافه شدند: سرستون‌های جدول و دکمهٔ افزودن
// از راهِ پراپ پاس می‌شوند و هرگز داخلِ `t()` نمی‌آیند، پس استخراج‌گر
// نمی‌دیدشان و «صفر کلیدِ کم» گزارش می‌داد در حالی که در همهٔ زبان‌ها
// فارسی می‌ماندند.
const LABEL_KEYS = new Set([
  'label', 'title', 'description', 'hint', 'empty', 'header', 'addLabel',
  'editLabel', 'placeholder', 'emptyText',
  // ⚠️ `success` بعداً اضافه شد: پیامِ موفقیتِ توست از راهِ پراپ پاس می‌شود
  // (`useActionToast(state, { success: '…' })`) و هرگز داخلِ `t()` نمی‌آید؛
  // چهار کلید در شش جا از هر زبانی جا مانده بود و ابزار «صفر» می‌گفت.
  'success',
  // ⚠️ `body`/`title` ِ اعلان‌ها کلیدند و در notify() ترجمه می‌شوند.
  'body',
]);

export function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry) && !entry.includes('.test.')) out.push(full);
  }
  return out;
}

/**
 * بدنهٔ `{…}` را با شمارشِ متوازنِ آکولاد برمی‌دارد.
 *
 * ⚠️ الگوی «تا اولین `}`» اینجا کار نمی‌کند: نگاشتِ برچسب‌ها اغلب آکولادِ
 * تودرتو دارد و وسطِ راه بریده می‌شد.
 */
function braceBody(src, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(openIdx + 1, i);
  }
  return '';
}

/**
 * همهٔ کلیدهایی که کد واقعاً به مترجم می‌دهد — از **سه** منبع:
 *
 *  ۱. فراخوانیِ **لفظی**: `t("پروژه‌ها")`
 *  ۲. برچسبِ **ثابت** با نامِ آشنا: `{ label: 'پروژه‌ها' }` که در محلِ نمایش
 *     `t(card.label)` می‌شود.
 *  ۳. هر مقدارِ فارسی داخلِ **نگاشتِ ثابتِ برچسب**: `const X_LABELS = {…}`.
 *
 * ⚠️ منبعِ سوم بعداً اضافه شد و دلیلش واقعی است: `GROUP_LABELS` با کلیدهای
 * `operations:`/`data:` و `THEME_LABEL` با `system:` از فیلترِ نامِ آشنا رد
 * نمی‌شدند، پس «عملیات»، «اطلاعات پایه» و «مطابق سیستم» هیچ‌وقت وارد فایلِ
 * زبان نشدند و در رابطِ انگلیسی فارسی می‌ماندند — با اینکه هر سه درست در
 * `t()` پیچیده شده بودند. کلیدی که **پویا** به مترجم می‌رسد را شمارشِ لفظی
 * نمی‌بیند؛ باید از سرچشمه‌اش برداشته شود.
 */
export function usedKeys(root = 'src') {
  const keys = new Set();
  // ⚠️ هر دو نوع کوتیشن: کلیدهای پارامتری با تک‌کوتیشن نوشته می‌شوند و با
  // رجکسِ فقط-دوتایی بی‌صدا از شمارش می‌افتادند.
  const call = /\b(?:t|tr)\(\s*(['"])((?:(?!\1)[^\\]|\\.)*)\1\s*[),]/g;
  const label = /\b([a-zA-Z]+)\s*:\s*(['"])([^'"\n]*[؀-ۿ][^'"\n]*)\2/g;
  // JSX form of the same props: addLabel="…" uses = not :. Without this
  // the "Add …" button of every catalogue stayed Persian in all locales,
  // and the coverage check reported zero missing because it never saw them.
  const attr = /\b([a-zA-Z]+)\s*=\s*"([^"\n]*[\u0600-\u06FF][^"\n]*)"/g;
  // Persian string literals returned straight from a function, e.g. the
  // per-type field labels in domain/tags/groups.ts. They never sit inside
  // t() and are not in a LABELS map, so nothing else here sees them.
  const ret = /\breturn\s+'([^'\n]*[؀-ۿ][^'\n]*)'/g;
  const map = /\bconst\s+([A-Z][A-Z0-9_]*_(?:LABELS?|NAMES?|TITLES?))\b[^=]*=\s*\{/g;

  for (const file of walk(root)) {
    const src = readFileSync(file, 'utf8');

    let m;
    while ((m = call.exec(src))) {
      try {
        keys.add(JSON.parse(`"${m[2]}"`));
      } catch {
        // کلیدِ نامعتبر نادیده گرفته می‌شود.
      }
    }
    while ((m = label.exec(src))) {
      if (!LABEL_KEYS.has(m[1]) || !PERSIAN.test(m[3])) continue;
      keys.add(m[3]);
    }
    while ((m = attr.exec(src))) {
      if (!LABEL_KEYS.has(m[1]) || !PERSIAN.test(m[2])) continue;
      keys.add(m[2]);
    }
    while ((m = ret.exec(src))) {
      // No LABEL_KEYS check here: a returned literal has no prop name to match.
      if (!PERSIAN.test(m[1])) continue;
      keys.add(m[1]);
    }
    while ((m = map.exec(src))) {
      // ⚠️ نامِ زبان ترجمه نمی‌شود: «فارسی» در رابطِ انگلیسی هم «فارسی»
      // می‌ماند، نه Persian. هر زبان با نام و خطِ خودش دیده می‌شود، وگرنه
      // کسی که فقط زبانِ خودش را می‌خواند نمی‌تواند پیدایش کند.
      if (m[1] === 'LOCALE_NAMES') continue;
      for (const v of braceBody(src, src.indexOf('{', m.index)).match(
        /(['"])[^'"\n]*[؀-ۿ][^'"\n]*\1/g,
      ) ?? []) {
        keys.add(v.slice(1, -1));
      }
    }
  }
  return keys;
}
