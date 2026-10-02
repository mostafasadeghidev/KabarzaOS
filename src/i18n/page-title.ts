import type { Metadata } from 'next';
import { getT } from '@/i18n/server';

/**
 * عنوانِ تبِ یک صفحه — «پروژه‌ها — نامِ برند» (الگو در چیدمانِ ریشه).
 *
 *   export const generateMetadata = pageTitle('پروژه‌ها');
 *
 * ⚠️ صفحه‌های تک‌مورد (پروژه، عضو، گزارشِ یک نفر) عنوانِ **بخش** را می‌گیرند، نه
 * نامِ همان مورد: `generateMetadata` جدا از گاردِ صفحه اجرا می‌شود، و نامِ
 * پروژه‌ای که کاربر اجازهٔ دیدنش را ندارد در عنوانِ تب لو می‌رفت.
 *
 * ⚠️ کلید باید از قبل در فایل‌های زبان باشد (همه نام‌های منو و کارت‌ها هستند):
 * استخراج‌گرِ ترجمه فقط فراخوانیِ صریحِ مترجم را می‌بیند، نه این آرگومان را.
 */
export function pageTitle(key: string) {
  return async function generateMetadata(): Promise<Metadata> {
    const t = await getT();
    return { title: t(key) };
  };
}
