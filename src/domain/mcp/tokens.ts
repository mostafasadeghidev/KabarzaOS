import { createHash, randomBytes } from 'node:crypto';

/**
 * توکنِ شخصیِ MCP (۲.۷.۰) — قاعده‌های خالص.
 *
 * ⚠️ توکن فقط یک بار، هنگامِ ساختن، به کاربر نشان داده می‌شود؛ در دیتابیس فقط
 * **هشِ SHA-256** ِ آن است. توکن ۳۲ بایتِ تصادفی است، پس هشِ سریع کافی است
 * (برخلافِ رمزِ عبور که حدس‌زدنی است و bcrypt می‌خواهد).
 */

export const TOKEN_PREFIX = 'kbz_';

/** دامنهٔ دسترسیِ توکن: فقط‌خواندنی، یا خواندن و نوشتن. */
export const SCOPES = ['read', 'write'] as const;
export type TokenScope = (typeof SCOPES)[number];

export function isScope(value: unknown): value is TokenScope {
  return typeof value === 'string' && (SCOPES as readonly string[]).includes(value);
}

/** «write» شاملِ «read» است — توکنِ نوشتنی بی‌خواندن بی‌معناست. */
export function scopesFor(scope: TokenScope): string[] {
  return scope === 'write' ? ['read', 'write'] : ['read'];
}

export function generateToken(): string {
  return TOKEN_PREFIX + randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** آغازِ توکن برای فهرستِ کلیدها: «kbz_Ab12Cd…». */
export function tokenPrefix(token: string): string {
  return token.slice(0, TOKEN_PREFIX.length + 6);
}

/** شکلِ ظاهری درست است؟ — پیش از هر کوئری، تا ورودیِ بی‌ربط به دیتابیس نرسد. */
export function looksLikeToken(raw: string): boolean {
  return /^kbz_[A-Za-z0-9_-]{40,60}$/.test(raw);
}

/** توکن از سرآیندِ `Authorization: Bearer …`؛ هر شکلِ دیگری ← null. */
export function bearerToken(header: string | null): string | null {
  const m = /^Bearer\s+(\S+)\s*$/i.exec(header ?? '');
  return m && looksLikeToken(m[1]!) ? m[1]! : null;
}

/**
 * محدودیتِ درخواست در پنجرهٔ یک‌دقیقه‌ای — شمارنده‌ای که بیرون نگه داشته می‌شود.
 * `allowed: false` یعنی این درخواست از سقف گذشته است.
 */
export function rateWindow(
  prev: { start: number; count: number } | undefined,
  now: number,
  limit: number,
  windowMs = 60_000,
): { state: { start: number; count: number }; allowed: boolean } {
  const state = !prev || now - prev.start >= windowMs ? { start: now, count: 0 } : prev;
  const next = { start: state.start, count: state.count + 1 };
  return { state: next, allowed: next.count <= limit };
}
