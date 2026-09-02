'use client';

import { createContext, useContext, useMemo } from 'react';
import { DEFAULT_LOCALE, type Locale } from './config';
import { createTranslator, type Messages, type Translator } from './translate';
import { formatDateTime } from './datetime';

/**
 * ترجمه در کامپوننت‌های کلاینت.
 *
 * ⚠️ پیام‌ها **یک بار** از چیدمانِ سرور پایین داده می‌شوند، نه اینکه هر
 * کامپوننتِ کلاینت فایلِ زبان را import کند — وگرنه همان ۱۵۰ کیلوبایت در
 * باندلِ مرورگر چند بار تکرار می‌شد.
 *
 * ⚠️ برای فارسی هیچ داده‌ای فرستاده نمی‌شود (شیءِ خالی): مسیرِ پیش‌فرض هیچ
 * وزنی به باندل اضافه نمی‌کند.
 */

interface Ctx {
  locale: Locale;
  messages: Messages;
  /** منطقهٔ زمانیِ بیننده — خالی یعنی منطقهٔ خودِ مرورگر. */
  timeZone: string;
}

const TranslationContext = createContext<Ctx>({ locale: DEFAULT_LOCALE, messages: {}, timeZone: '' });

export function TranslationProvider({
  locale,
  messages,
  timeZone = '',
  children,
}: {
  locale: Locale;
  messages: Messages;
  timeZone?: string;
  children: React.ReactNode;
}) {
  const value = useMemo(() => ({ locale, messages, timeZone }), [locale, messages, timeZone]);
  return <TranslationContext.Provider value={value}>{children}</TranslationContext.Provider>;
}

/**
 * قلابِ ترجمه.
 *
 * ⚠️ بیرون از Provider هم کار می‌کند و فارسی برمی‌گرداند — چون کلید خودِ
 * متنِ فارسی است. پس یک کامپوننتِ فراموش‌شده متنِ خالی یا کلیدِ خام نشان
 * نمی‌دهد، فقط ترجمه نمی‌شود.
 */
export function useT(): Translator {
  const { locale, messages } = useContext(TranslationContext);
  return useMemo(() => createTranslator(messages, locale), [messages, locale]);
}

/** زبانِ جاری در کلاینت — برای تصمیم‌های وابسته به جهت یا قالبِ عدد. */
export function useLocale(): Locale {
  return useContext(TranslationContext).locale;
}

/** منطقهٔ زمانیِ بیننده — از پروفایلش، وگرنه خالی (مرورگر تصمیم می‌گیرد). */
export function useTimeZone(): string {
  return useContext(TranslationContext).timeZone;
}

/** قالب‌کنِ تاریخ/ساعت در منطقهٔ زمانیِ بیننده — به‌جای `toISOString().slice(0, 16)`. */
export function useDateTime(): (value: Date | string | null | undefined) => string {
  const timeZone = useTimeZone();
  return useMemo(() => (value: Date | string | null | undefined) => formatDateTime(value, timeZone), [timeZone]);
}
