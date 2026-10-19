import { createHmac, timingSafeEqual } from 'node:crypto';
import { safeNextPath } from '@/domain/auth/next-path';

/**
 * اعتبارسنجیِ `initData` ِ مینی‌اپِ تلگرام (۲.۱۰.۰).
 *
 * تلگرام هنگامِ بازکردنِ مینی‌اپ رشته‌ای امضاشده به صفحه می‌دهد (شناسهٔ کاربر،
 * زمان، …). امضا با کلیدی ساخته شده که فقط تلگرام و صاحبِ توکنِ ربات دارند:
 *   secret = HMAC_SHA256(key = "WebAppData", msg = botToken)
 *   hash   = hex(HMAC_SHA256(key = secret, msg = data_check_string))
 * `data_check_string` = همهٔ فیلدها جز `hash`، مرتب‌شده، `key=value` با `\n`.
 *
 * ⚠️ این تنها چیزی است که «این واقعاً کاربرِ تلگرامِ X است» را ثابت می‌کند؛
 * `initDataUnsafe` ِ سمتِ مرورگر را هر کسی می‌تواند بسازد.
 * ⚠️ `auth_date` کهنه رد می‌شود تا رشتهٔ دزدیده‌شده بعدها کار نکند.
 */

export type WebAppCheck =
  /** `startParam`: پارامترِ لینکِ مستقیمِ مینی‌اپ (۲.۴۰.۰) — جزوِ رشتهٔ امضاشده. */
  | { ok: true; telegramUserId: number; authDate: number; startParam: string }
  | { ok: false; reason: 'malformed' | 'bad_signature' | 'expired' };

export function verifyInitData(
  initData: string,
  botToken: string,
  nowSeconds = Math.floor(Date.now() / 1000),
  maxAgeSeconds = 3600,
): WebAppCheck {
  if (!initData || !botToken || initData.length > 4096) return { ok: false, reason: 'malformed' };
  const params = new URLSearchParams(initData);
  const hash = params.get('hash') ?? '';
  if (!/^[0-9a-f]{64}$/.test(hash)) return { ok: false, reason: 'malformed' };

  const check = [...params.entries()]
    .filter(([k]) => k !== 'hash')
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const want = createHmac('sha256', secret).update(check).digest();
  const given = Buffer.from(hash, 'hex');
  if (given.length !== want.length || !timingSafeEqual(given, want)) return { ok: false, reason: 'bad_signature' };

  const authDate = Number(params.get('auth_date'));
  if (!Number.isInteger(authDate) || authDate <= 0) return { ok: false, reason: 'malformed' };
  if (nowSeconds - authDate > maxAgeSeconds || authDate - nowSeconds > 300) return { ok: false, reason: 'expired' };

  let user: { id?: unknown };
  try {
    user = JSON.parse(params.get('user') ?? '') as { id?: unknown };
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (typeof user?.id !== 'number' || !Number.isSafeInteger(user.id) || user.id <= 0) return { ok: false, reason: 'malformed' };
  return { ok: true, telegramUserId: user.id, authDate, startParam: params.get('start_param') ?? '' };
}

/**
 * مسیرِ داخلی ← `startapp` ِ لینکِ مستقیمِ مینی‌اپ (۲.۴۰.۰). تلگرام فقط
 * `[A-Za-z0-9_-]` تا ۵۱۲ نویسه می‌پذیرد؛ base64url همین است.
 */
export function encodeStartParam(path: string): string | null {
  const value = Buffer.from(path, 'utf8').toString('base64url');
  return value.length > 0 && value.length <= 512 ? value : null;
}

/**
 * `startapp` ← مسیرِ داخلی، یا null. ⚠️ فقط مسیرِ همین سایت (همان `safeNextPath`):
 * لینکی که کسی دست‌کاری کند کاربر را بیرون نمی‌برد.
 */
export function decodeStartParam(raw: string): string | null {
  if (!/^[A-Za-z0-9_-]{1,512}$/.test(raw)) return null;
  const path = Buffer.from(raw, 'base64url').toString('utf8');
  return path !== '/' && safeNextPath(path) === path ? path : null;
}

/** لینکِ مستقیمِ مینی‌اپ: `t.me/<ربات>/<نامِ کوتاه>?startapp=…` — در گروه هم داخلِ تلگرام باز می‌شود. */
export function miniAppDirectLink(username: string, appName: string, path: string): string | null {
  if (!/^[A-Za-z0-9_]{3,64}$/.test(username) || !/^[A-Za-z0-9_]{3,64}$/.test(appName)) return null;
  const start = encodeStartParam(path);
  return start ? `https://t.me/${username}/${appName}?startapp=${start}` : null;
}

/** ساختِ initData ِ امضاشده — فقط برای تست. */
export function signInitData(fields: Record<string, string>, botToken: string): string {
  const check = Object.keys(fields).sort().map((k) => `${k}=${fields[k]}`).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hash = createHmac('sha256', secret).update(check).digest('hex');
  return new URLSearchParams({ ...fields, hash }).toString();
}
