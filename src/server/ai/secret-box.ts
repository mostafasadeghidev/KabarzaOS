import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/**
 * رمزگذاریِ کلیدِ هوشِ مصنوعیِ کاربران (۲.۹.۰) — AES-256-GCM.
 *
 * ⚠️ کلیدِ رمز از `AI_KEY_SECRET` (اگر هست) وگرنه `SESSION_SECRET` مشتق می‌شود؛
 * پس نشتِ دیتابیس به‌تنهایی کلیدها را لو نمی‌دهد. عوض‌کردنِ آن راز یعنی
 * اتصال‌های قبلی دیگر باز نمی‌شوند و کاربر باید دوباره وصل کند — نه خرابی.
 *
 * قالب: `v1.<iv>.<tag>.<ciphertext>` (base64url).
 */

function key(): Buffer {
  const secret = process.env.AI_KEY_SECRET || process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('SESSION_SECRET (or AI_KEY_SECRET) must be set (32+ chars) in production');
    }
    return createHash('sha256').update('dev-only-ai-key-secret').digest();
  }
  return createHash('sha256').update(`kabarza-ai-key|${secret}`).digest();
}

export function seal(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), body.toString('base64url')].join('.');
}

/** بازکردن؛ رازِ عوض‌شده یا متنِ دست‌کاری‌شده ← null، نه پرتاب. */
export function open(sealed: string): string | null {
  const [v, iv, tag, body] = sealed.split('.');
  if (v !== 'v1' || !iv || !tag || body === undefined) return null;
  try {
    const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(body, 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}
