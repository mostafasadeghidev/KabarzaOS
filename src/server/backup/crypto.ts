import { createCipheriv, createDecipheriv, randomBytes, scrypt } from 'node:crypto';
import { createReadStream, createWriteStream, promises as fs } from 'node:fs';
import { pipeline } from 'node:stream/promises';

/**
 * رمزگذاریِ فایلِ پشتیبان.
 *
 * قالب (نسخهٔ ۱):  `KBZBAK01` (۸ بایت) | salt (۱۶) | iv (۱۲) | متنِ رمزشده | tag (۱۶)
 *  · کلید: scrypt(رمز، salt) — N=2^15، r=8، p=1 → ۳۲ بایت.
 *  · رمز: AES-256-GCM؛ سرآیند (magic+salt+iv) به‌عنوانِ AAD بسته می‌شود، پس
 *    دست‌بردن در هر بایتی از فایل — حتی سرآیند — بازکردن را رد می‌کند.
 *
 * ⚠️ همین قالب در `scripts/kbz-backup.mjs` (ابزارِ بازگردانیِ بی‌وابستگی) هم
 * پیاده شده؛ تستِ `crypto.test.ts` هم‌خوانیِ دو طرف را می‌پاید. هر تغییری اینجا
 * یعنی نسخهٔ تازهٔ magic و پشتیبانی از هر دو در ابزارِ بازگردانی.
 */

export const MAGIC = Buffer.from('KBZBAK01');
const SALT = 16;
const IV = 12;
const TAG = 16;
export const HEADER = MAGIC.length + SALT + IV;
const KDF = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export class BackupCryptoError extends Error {
  constructor(readonly code: 'not_backup' | 'bad_passphrase') {
    super(`backup crypto: ${code}`);
    this.name = 'BackupCryptoError';
  }
}

function deriveKey(passphrase: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(passphrase.normalize('NFC'), salt, 32, KDF, (error, key) => (error ? reject(error) : resolve(key)));
  });
}

export async function encryptFile(src: string, dest: string, passphrase: string): Promise<void> {
  const salt = randomBytes(SALT);
  const iv = randomBytes(IV);
  const key = await deriveKey(passphrase, salt);
  const header = Buffer.concat([MAGIC, salt, iv]);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(header);

  const out = createWriteStream(dest);
  out.write(header);
  // ⚠️ end:false — tag باید **بعد از** آخرین بایتِ رمزشده نوشته شود.
  await pipeline(createReadStream(src), cipher, out, { end: false });
  await new Promise<void>((resolve, reject) => {
    out.on('error', reject);
    out.end(cipher.getAuthTag(), () => resolve());
  });
}

/**
 * بازکردن. ⚠️ GCM فقط در پایان می‌گوید داده سالم بوده؛ پس خروجی در فایلِ موقت
 * نوشته می‌شود و فقط اگر برچسب درست بود سرِ جایش می‌رود — رمزِ غلط یا فایلِ
 * دست‌خورده هرگز خروجیِ نیمه‌کاره باقی نمی‌گذارد.
 */
export async function decryptFile(src: string, dest: string, passphrase: string): Promise<void> {
  const fh = await fs.open(src, 'r');
  let header: Buffer;
  let tag: Buffer;
  let size: number;
  try {
    size = (await fh.stat()).size;
    if (size < HEADER + TAG) throw new BackupCryptoError('not_backup');
    header = Buffer.alloc(HEADER);
    await fh.read(header, 0, HEADER, 0);
    if (!header.subarray(0, MAGIC.length).equals(MAGIC)) throw new BackupCryptoError('not_backup');
    tag = Buffer.alloc(TAG);
    await fh.read(tag, 0, TAG, size - TAG);
  } finally {
    await fh.close();
  }

  const salt = header.subarray(MAGIC.length, MAGIC.length + SALT);
  const iv = header.subarray(MAGIC.length + SALT);
  const key = await deriveKey(passphrase, salt);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAAD(header);
  decipher.setAuthTag(tag);

  const tmp = `${dest}.partial`;
  try {
    await pipeline(createReadStream(src, { start: HEADER, end: size - TAG - 1 }), decipher, createWriteStream(tmp));
    await fs.rename(tmp, dest);
  } catch {
    await fs.rm(tmp, { force: true });
    throw new BackupCryptoError('bad_passphrase');
  }
}
