/**
 * «پس از ورود برگرد به …» — فقط مسیرِ داخلیِ همین سایت (۲.۸.۰).
 *
 * ⚠️ بازهدایتِ باز (open redirect) نشود: `//evil.com`، `/\evil.com`،
 * `https://…` و هر چیزِ غیرِ «/…» ← خانه. صفحهٔ «اجازه» ِ OAuth با همین
 * راه پس از ورود دوباره باز می‌شود.
 */
export function safeNextPath(raw: unknown): string {
  if (typeof raw !== 'string' || raw.length > 2000) return '/';
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return '/';
  if (/[\u0000-\u001f]/.test(raw)) return '/';
  return raw;
}
