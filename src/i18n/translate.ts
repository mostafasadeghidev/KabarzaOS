/**
 * ترجمه — قواعدِ docs/rules/I18N.md
 *
 * R-I18N-01 — کلید، متنِ فارسی است. اگر ترجمه‌ای نباشد، فارسی نمایش داده
 * می‌شود؛ این **درست** است، نه نقص (فارسی خودِ منبع است).
 */

import { DEFAULT_LOCALE, intlTag, type Locale } from './config';

/**
 * شکل‌های مفرد/جمعِ یک ترجمه — دسته‌های CLDR (`Intl.PluralRules`): انگلیسی one/other،
 * عربی zero/one/two/few/many/other و… . `other` همیشه لازم است (پشتیبانِ هر دستهٔ نبود).
 * `by`: نامِ پارامتری که شکل را تعیین می‌کند؛ نبودن = `n`، وگرنه اولین پارامترِ عددیِ کلید.
 *
 * ⚠️ پیش از این هر ترجمه فقط یک رشته بود و «1 days to deadline» / «1 projects» نوشته می‌شد؛
 * فارسی (مبدأ) این مشکل را ندارد چون پس از عدد اسم مفرد می‌آید، پس کلید همان متنِ فارسی می‌ماند.
 */
export type PluralForms = Partial<Record<Intl.LDMLPluralRule, string>> & { other: string; by?: string };
export type Messages = Record<string, string | PluralForms>;

const RULES = new Map<Locale, Intl.PluralRules>();
function rulesFor(locale: Locale): Intl.PluralRules {
  let r = RULES.get(locale);
  if (!r) { r = new Intl.PluralRules(intlTag(locale)); RULES.set(locale, r); }
  return r;
}

/** کدام پارامتر عدد است: `by`، بعد `n`، بعد اولین پارامترِ عددی به ترتیبِ آمدن در کلید. */
function countOf(key: string, forms: PluralForms, params: Record<string, string | number>): number | null {
  const num = (v: unknown) => (v === undefined || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null);
  if (forms.by) return num(params[forms.by]);
  if ('n' in params) return num(params.n);
  for (const m of key.matchAll(/\{(\w+)\}/g)) {
    const v = num(params[m[1]!]);
    if (v !== null) return v;
  }
  return null;
}

/**
 * سازندهٔ تابعِ ترجمه.
 * جای‌گذاری با {name} انجام می‌شود تا رشته‌ها قابلِ ترجمه بمانند
 * (به‌جای چسباندنِ متن که در RTL خراب می‌شود).
 */
export function createTranslator(messages: Messages, locale: Locale = DEFAULT_LOCALE) {
  return function t(key: string, params?: Record<string, string | number>): string {
    // فارسی مبدأ است؛ برای بقیه اگر ترجمه نبود، به مبدأ برمی‌گردیم.
    const found = locale === DEFAULT_LOCALE ? key : (messages[key] ?? key);
    let raw: string;
    if (typeof found === 'string') raw = found;
    else {
      const n = params ? countOf(key, found, params) : null;
      raw = (n === null ? found.other : found[rulesFor(locale).select(n)]) ?? found.other;
    }
    if (!params) return raw;
    return raw.replace(/\{(\w+)\}/g, (match, name: string) =>
      Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match,
    );
  };
}

export type Translator = ReturnType<typeof createTranslator>;
