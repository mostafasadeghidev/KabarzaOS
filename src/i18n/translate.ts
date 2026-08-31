/**
 * ترجمه — قواعدِ docs/rules/I18N.md
 *
 * R-I18N-01 — کلید، متنِ فارسی است. اگر ترجمه‌ای نباشد، فارسی نمایش داده
 * می‌شود؛ این **درست** است، نه نقص (فارسی خودِ منبع است).
 */

import { DEFAULT_LOCALE, type Locale } from './config';

export type Messages = Record<string, string>;

/**
 * سازندهٔ تابعِ ترجمه.
 * جای‌گذاری با {name} انجام می‌شود تا رشته‌ها قابلِ ترجمه بمانند
 * (به‌جای چسباندنِ متن که در RTL خراب می‌شود).
 */
export function createTranslator(messages: Messages, locale: Locale = DEFAULT_LOCALE) {
  return function t(key: string, params?: Record<string, string | number>): string {
    // فارسی مبدأ است؛ برای بقیه اگر ترجمه نبود، به مبدأ برمی‌گردیم.
    const raw = locale === DEFAULT_LOCALE ? key : (messages[key] ?? key);
    if (!params) return raw;
    return raw.replace(/\{(\w+)\}/g, (match, name: string) =>
      Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match,
    );
  };
}

export type Translator = ReturnType<typeof createTranslator>;
