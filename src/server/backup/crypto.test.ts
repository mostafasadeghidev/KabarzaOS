import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomBytes } from 'node:crypto';
import { BackupCryptoError, decryptFile, encryptFile } from './crypto';
// @ts-expect-error — ابزارِ بی‌وابستگیِ بازگردانی، JS ِ خالص
import * as tool from '../../../scripts/kbz-backup.mjs';

/**
 * ⚠️ قالبِ فایلِ پشتیبان دو پیاده‌سازی دارد: داخلِ اپ (ساختن) و ابزارِ مستقلِ
 * بازگردانی. اگر از هم جدا شوند، پشتیبانِ امروز فردا باز نمی‌شود — این تست
 * هم‌خوانیِ هر دو جهت را می‌پاید.
 */

let dir = '';
const payload = randomBytes(300_000);

beforeAll(async () => {
  dir = mkdtempSync(path.join(os.tmpdir(), 'kbz-crypto-'));
  await fs.writeFile(path.join(dir, 'plain'), payload);
});
afterAll(async () => { await fs.rm(dir, { recursive: true, force: true }); });

describe('رمزگذاریِ پشتیبان', () => {
  it('اپ رمز می‌کند ← ابزارِ بازگردانی باز می‌کند', async () => {
    await encryptFile(path.join(dir, 'plain'), path.join(dir, 'a.kbzbak'), 'رمزِ قوی ۱۲۳');
    await tool.decryptFile(path.join(dir, 'a.kbzbak'), path.join(dir, 'a.out'), 'رمزِ قوی ۱۲۳');
    expect((await fs.readFile(path.join(dir, 'a.out'))).equals(payload)).toBe(true);
  });

  it('ابزار رمز می‌کند ← اپ باز می‌کند', async () => {
    await tool.encryptFile(path.join(dir, 'plain'), path.join(dir, 'b.kbzbak'), 'pass');
    await decryptFile(path.join(dir, 'b.kbzbak'), path.join(dir, 'b.out'), 'pass');
    expect((await fs.readFile(path.join(dir, 'b.out'))).equals(payload)).toBe(true);
  });

  it('رمزِ غلط رد می‌شود و خروجیِ نیمه‌کاره نمی‌ماند', async () => {
    await expect(decryptFile(path.join(dir, 'a.kbzbak'), path.join(dir, 'c.out'), 'wrong'))
      .rejects.toBeInstanceOf(BackupCryptoError);
    expect(await fs.stat(path.join(dir, 'c.out')).then(() => true, () => false)).toBe(false);
    expect(await fs.stat(path.join(dir, 'c.out.partial')).then(() => true, () => false)).toBe(false);
  });

  it('دست‌بردن در یک بایت تشخیص داده می‌شود', async () => {
    const bytes = await fs.readFile(path.join(dir, 'a.kbzbak'));
    const mid = bytes.length >> 1;
    bytes[mid] = bytes[mid]! ^ 0xff;
    await fs.writeFile(path.join(dir, 'd.kbzbak'), bytes);
    await expect(decryptFile(path.join(dir, 'd.kbzbak'), path.join(dir, 'd.out'), 'رمزِ قوی ۱۲۳'))
      .rejects.toMatchObject({ code: 'bad_passphrase' });
  });

  it('فایلِ غیرپشتیبان', async () => {
    await expect(decryptFile(path.join(dir, 'plain'), path.join(dir, 'e.out'), 'x'))
      .rejects.toMatchObject({ code: 'not_backup' });
  });
});
