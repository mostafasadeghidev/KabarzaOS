import { createHash, randomBytes } from 'node:crypto';
import { SCOPES, type TokenScope } from './tokens';

/**
 * OAuth 2.1 برای MCP (۲.۸.۰) — قاعده‌های خالص.
 *
 * فقط «کدِ مجوز + PKCE» (S256) پذیرفته می‌شود؛ نه implicit، نه password.
 * اپ‌ها «عمومی»اند (رازِ کلاینت ندارند) و امنیتشان از PKCE می‌آید.
 */

export const CODE_TTL_MS = 10 * 60_000;
export const ACCESS_TTL_S = 60 * 60;
export const REFRESH_TTL_MS = 90 * 24 * 60 * 60_000;

export function randomSecret(prefix: string, bytes = 32): string {
  return prefix + randomBytes(bytes).toString('base64url');
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** RFC 7636 — code_verifier: ۴۳ تا ۱۲۸ نویسهٔ «unreserved». */
export function isValidVerifier(verifier: string): boolean {
  return /^[A-Za-z0-9\-._~]{43,128}$/.test(verifier);
}

/** PKCE با S256: base64url(sha256(verifier)) === challenge. */
export function verifyPkce(verifier: string, challenge: string): boolean {
  if (!isValidVerifier(verifier) || !challenge) return false;
  const computed = createHash('sha256').update(verifier).digest('base64url');
  return computed === challenge;
}

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);
const FORBIDDEN_SCHEMES = new Set(['javascript:', 'data:', 'file:', 'vbscript:', 'blob:', 'about:']);

/**
 * نشانیِ بازگشتی که یک اپ می‌تواند ثبت کند.
 * - https هر میزبانی (claude.ai، chatgpt.com، …)
 * - http فقط روی همین کامپیوتر (برنامه‌های دسکتاپ/CLI)
 * - طرحِ اختصاصیِ برنامه (cursor://، vscode://) — ولی نه javascript:/data:/file:
 * ⚠️ بی‌قطعه (#) — RFC 6749 §3.1.2.
 */
export function isAllowedRedirect(raw: string): boolean {
  if (raw.length > 2000) return false;
  let url: URL;
  try { url = new URL(raw); } catch { return false; }
  if (url.hash) return false;
  if (FORBIDDEN_SCHEMES.has(url.protocol)) return false;
  if (url.protocol === 'https:') return true;
  if (url.protocol === 'http:') return LOOPBACK.has(url.hostname);
  return /^[a-z][a-z0-9+.-]*:$/.test(url.protocol);
}

/**
 * نشانیِ بازگشتِ درخواست باید **دقیقاً** یکی از ثبت‌شده‌ها باشد — جز برای
 * loopback که پورتش هر بار عوض می‌شود (RFC 8252 §7.3).
 */
export function redirectMatches(requested: string, registered: readonly string[]): boolean {
  if (registered.includes(requested)) return true;
  let req: URL;
  try { req = new URL(requested); } catch { return false; }
  if (req.protocol !== 'http:' || !LOOPBACK.has(req.hostname)) return false;
  return registered.some((r) => {
    try {
      const u = new URL(r);
      return u.protocol === 'http:' && u.hostname === req.hostname && u.pathname === req.pathname;
    } catch { return false; }
  });
}

/** دامنهٔ درخواستی ← فقط read/write؛ نبودنش یعنی هر دو (کاربر در صفحهٔ «اجازه» کمش می‌کند). */
export function parseScopes(raw: string | null | undefined): TokenScope[] {
  const asked = (raw ?? '').split(/\s+/).filter((s): s is TokenScope => (SCOPES as readonly string[]).includes(s));
  return asked.length ? [...new Set(asked)] : ['read', 'write'];
}
