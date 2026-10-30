/**
 * فهرست‌های ثابتِ کتابخانهٔ کد و راهنما (۲.۳۷.۰).
 * ⚠️ فایلِ خالص و جدا: هم اسکیمای دیتابیس می‌خواندش، هم کامپوننت‌های مرورگر —
 * اگر در اسکیما می‌ماند، هر صفحه‌ای که برچسبِ نوع را نشان می‌داد drizzle را
 * هم به مرورگر می‌برد.
 */

export const LIBRARY_KINDS = ['code', 'guide', 'note'] as const;
export type LibraryKind = (typeof LIBRARY_KINDS)[number];

export const LIBRARY_PLATFORMS = ['webflow', 'wordpress', 'shopify', 'html', 'other'] as const;
export type LibraryPlatform = (typeof LIBRARY_PLATFORMS)[number];

export const LIBRARY_STATUSES = ['draft', 'ready', 'deprecated'] as const;
export type LibraryStatus = (typeof LIBRARY_STATUSES)[number];

export const LIBRARY_LANGUAGES = ['html', 'css', 'js', 'json', 'php', 'liquid', 'text'] as const;
export type LibraryLanguage = (typeof LIBRARY_LANGUAGES)[number];

/** جای نصبِ یک تکه‌کد — همان جاهایی که Webflow و بقیه کدِ سفارشی می‌پذیرند. */
export const LIBRARY_PLACEMENTS = [
  'site_head', 'site_body_end', 'page_head', 'page_body_end', 'embed', 'external', 'other',
] as const;
export type LibraryPlacement = (typeof LIBRARY_PLACEMENTS)[number];

/** گونهٔ یک «گزینهٔ قابلِ تنظیم» — چیزی که نصب‌کننده یا کارفرما عوضش می‌کند. */
export const LIBRARY_OPTION_KINDS = ['attribute', 'class', 'id', 'variable', 'setting'] as const;
export type LibraryOptionKind = (typeof LIBRARY_OPTION_KINDS)[number];

/** پیشنهادِ ویرایش (۲.۴۶.۰): باز، پذیرفته، رد، پس‌گرفته. */
export const LIBRARY_SUGGESTION_STATUSES = ['pending', 'accepted', 'rejected', 'withdrawn'] as const;
export type LibrarySuggestionStatus = (typeof LIBRARY_SUGGESTION_STATUSES)[number];
