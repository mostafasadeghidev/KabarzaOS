import 'server-only';
import { cache } from 'react';
import { currentSession } from '@/server/auth';
import { getSystemConfig } from '@/server/settings/system-service';
import { DEFAULT_LOCALE, type Locale } from './config';
import { createTranslator, type Messages, type Translator } from './translate';

/**
 * ترجمه در کامپوننت‌های سرور.
 *
 * ⚠️ چرا ذخیره‌گاهِ per-request به‌جای پاس‌دادنِ `t` به هر کامپوننت؟
 * چون کمکی‌های ارائه‌ایِ داخلِ یک صفحهٔ سرور **همگام** هستند و نمی‌توانند
 * `await` کنند. اگر `t` را پراپ می‌کردیم، هر کامپوننتِ کوچکِ داخلی هم باید
 * امضایش عوض می‌شد — یعنی صدها تغییرِ بی‌ربط. `cache()` ِ ری‌اکت به‌ازای
 * **هر درخواست** یک شیء می‌دهد، پس نه نشتِ بینِ کاربران هست و نه لوله‌کشی.
 *
 * ⚠️ فارسی هیچ فایلی لازم ندارد: کلید خودِ متنِ فارسی است (R-I18N-01)، پس
 * مسیرِ پیش‌فرضِ اپ صفر هزینهٔ ترجمه دارد.
 */

const LOADERS: Record<Locale, (() => Promise<{ default: Messages }>) | null> = {
  fa: null,
  en: () => import('./messages/en.json'),
  ar: () => import('./messages/ar.json'),
  ckb: () => import('./messages/ckb.json'),
  de: () => import('./messages/de.json'),
  es: () => import('./messages/es.json'),
  fr: () => import('./messages/fr.json'),
  pt: () => import('./messages/pt.json'),
  tr: () => import('./messages/tr.json'),
};

export const loadMessages = cache(async (locale: Locale): Promise<Messages> => {
  const load = LOADERS[locale];
  if (!load) return {};
  try {
    return (await load()).default;
  } catch {
    // ⚠️ نبودِ فایلِ زبان نباید صفحه را بشکند؛ به فارسیِ مبدأ برمی‌گردیم.
    return {};
  }
});

/**
 * زبانِ کاربرِ جاری — سه پله، دقیقاً مثلِ `Core\I18n::current_locale()` نسخهٔ قبلی:
 *
 *   ۱. انتخابِ خودِ کاربر  (`users.locale`)
 *   ۲. زبانِ پیش‌فرضِ سامانه (تنظیماتِ سامانه)
 *   ۳. فارسی
 *
 * ⚠️ پلهٔ دوم فقط وقتی معنا دارد که پلهٔ اول بتواند **خالی** باشد؛ برای همین
 * ستونِ `locale` اختیاری شد (R-I18N-14).
 */
export const currentLocale = cache(async (): Promise<Locale> => {
  /**
   * ⚠️ بیرون از یک درخواستِ HTTP هم صدا زده می‌شود — زمان‌بند، کرون و تست.
   * آنجا `cookies()` پرتاب می‌کند، و آن **خطا نیست**: نشستی وجود ندارد، پس
   * زبانِ پیش‌فرضِ سامانه درست‌ترین جواب است. بدونِ این محافظ، هر کوئری‌ای که
   * نامِ تگ می‌خواند در گزارشِ روزانه و تیکِ کرون می‌شکست.
   */
  try {
    const session = await currentSession();
    if (session?.locale) return session.locale;
    return (await getSystemConfig()).defaultLocale;
  } catch {
    /**
     * ⚠️ کلِ بدنه محافظ دارد، نه فقط `cookies()`: هنگامِ `next build`،
     * صفحهٔ استاتیکِ 404 از چیدمانِ ریشه رد می‌شود و آن‌جا نه درخواست هست
     * نه دیتابیسی — `getSystemConfig` با ECONNREFUSED می‌شکست و build ِ
     * داکر (که عمداً بی‌دیتابیس است) می‌خوابید. بدونِ نشست و بدونِ
     * تنظیمات، زبانِ پیش‌فرض جوابِ درست است.
     */
    return DEFAULT_LOCALE;
  }
});

/**
 * ظرفِ ترجمهٔ این درخواست.
 * ⚠️ `cache()` تضمین می‌کند هر درخواست ظرفِ خودش را دارد؛ متغیرِ ماژولی
 * بینِ کاربرانِ هم‌زمان نشت می‌کرد.
 */
const container = cache((): { translate: Translator; locale: Locale } => ({
  // پیش از آماده‌سازی، همان متنِ فارسی برمی‌گردد — نه رشتهٔ خالی.
  translate: createTranslator({}, DEFAULT_LOCALE),
  locale: DEFAULT_LOCALE,
}));

/**
 * آماده‌سازیِ ترجمه برای این درخواست. **چیدمانِ ریشه** صدایش می‌زند و چون
 * در RSC چیدمان پیش از فرزندان رندر می‌شود، بقیه تضمیناً مقدارِ درست را
 * می‌بینند.
 */
export async function primeTranslations(): Promise<{ locale: Locale; messages: Messages }> {
  const locale = await currentLocale();
  const messages = await loadMessages(locale);
  container().translate = createTranslator(messages, locale);
  container().locale = locale;
  return { locale, messages };
}

/**
 * ترجمه در هر کامپوننتِ سرور — همگام و بدونِ پراپ:
 *
 * ```tsx
 * import { t } from '@/i18n/server';
 * <h1>{t('پروژه‌ها')}</h1>
 * ```
 */
export function t(key: string, params?: Record<string, string | number>): string {
  return container().translate(key, params);
}

/**
 * زبانِ جاری — **همگام**، فقط برای کمکی‌های ارائه‌ایِ داخلِ **رندر**
 * (قالب‌بندیِ تاریخ و عدد).
 *
 * ⚠️⚠️ **در واکشیِ داده استفاده نکن.** در App Router چیدمان و صفحه موازی
 * اجرا می‌شوند: واکشیِ دادهٔ صفحه منتظرِ `primeTranslations()` ِ چیدمان
 * نمی‌ماند. پس در آن لحظه اینجا هنوز `DEFAULT_LOCALE` است، نه زبانِ کاربر.
 *
 * دقیقاً همین اتفاق افتاد: نامِ تگ‌ها در همهٔ فهرست‌ها با `tagName(activeLocale())`
 * ساخته می‌شد و **همیشه فارسی** درمی‌آمد — در حالی که برچسب‌های همان صفحه
 * انگلیسی بودند، چون `t()` در زمانِ **رندر** صدا زده می‌شود که تا آن موقع
 * ظرف پر شده. یعنی یک صفحه، دو زبان.
 *
 * برای ساختِ کوئری `await currentLocale()` را صدا بزن — `cache()` است و
 * هزینهٔ اضافه ندارد، ولی به ترتیبِ رندر وابسته نیست.
 */
export function activeLocale(): Locale {
  return container().locale;
}

/** مترجمِ کامل، وقتی باید به جایی پاس داده شود. */
export async function getT(): Promise<Translator> {
  const locale = await currentLocale();
  return createTranslator(await loadMessages(locale), locale);
}
