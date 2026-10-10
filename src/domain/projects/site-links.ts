/**
 * لینکِ سایتِ پروژه (۲.۱۹.۰) — دامنهٔ اصلی و آدرسِ آزمایشی.
 *
 * ⚠️ فقط http و https: آدرسی که در href می‌نشیند نباید `javascript:` یا `data:` باشد.
 */

/** سقفِ طول — آدرسِ آزمایشیِ webflow.io با مسیر هم زیرِ این است. */
export const SITE_URL_MAX = 300;

/**
 * آدرسِ تایپ‌شده را به شکلِ یکدست درمی‌آورد: فاصله‌ها را می‌برد و اگر طرح
 * (scheme) نداشت `https://` می‌گذارد. نامعتبر یا خالی ← `null`.
 */
export function normalizeSiteUrl(raw: string): string | null {
  const text = raw.trim();
  if (text === '' || text.length > SITE_URL_MAX) return null;
  // «example.com» را هم بپذیر؛ «ftp://x» یا «javascript:x» را رد کن.
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(text);
  const candidate = hasScheme ? text : `https://${text}`;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  // میزبان باید دست‌کم یک نقطه داشته باشد: «localhost» یا «abc» یعنی تایپِ ناقص.
  if (!url.hostname.includes('.') || url.hostname.startsWith('.') || url.hostname.endsWith('.')) return null;
  return url.toString();
}

/**
 * آیا بیننده لینک‌های سایت را می‌بیند؟ تیم همیشه؛ کارفرمای **صرف** فقط وقتی
 * تیم تیکِ «نمایش به کارفرما» را زده باشد.
 */
export function canSeeSiteLinks(input: { clientOnly: boolean; urlsClientVisible: boolean }): boolean {
  return !input.clientOnly || input.urlsClientVisible;
}

/** نامِ میزبان برای نمایش — بی‌طرح و بی‌`www.`؛ آدرسِ ناخوانا همان‌طور برمی‌گردد. */
export function siteHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, '');
  } catch {
    return url;
  }
}
