import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { deleteLocalBackup } from '@/server/backup/service';
import type { Actor } from '@/domain/access/permissions';

/** حذفِ نسخهٔ محلیِ پشتیبان (۲.۶۴.۰): فقط مالک، فقط نامِ معتبرِ همان پوشه. */
const owner: Actor = { id: 1, roles: ['owner'], permissions: [], privateAccess: true };
const admin: Actor = { id: 2, roles: ['admin'], permissions: [], privateAccess: false };
let dir: string;
const NAME = 'kabarzaos-2026-11-11-121309.kbzbak';

beforeAll(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'kbz-bk-'));
  process.env.BACKUP_DIR = dir;
  await fs.writeFile(path.join(dir, NAME), 'x');
  await fs.writeFile(path.join(dir, 'secret.txt'), 'keep');
});
afterAll(async () => {
  delete process.env.BACKUP_DIR;
  await fs.rm(dir, { recursive: true, force: true });
});

describe('حذفِ نسخهٔ محلیِ پشتیبان', () => {
  it('⚠️ غیرِ مالک، نامِ ناموجود و مسیرِ دلخواه رد می‌شوند', async () => {
    await expect(deleteLocalBackup(admin, NAME)).rejects.toThrow();
    await expect(deleteLocalBackup(owner, 'secret.txt')).rejects.toThrow();
    await expect(deleteLocalBackup(owner, `../${path.basename(dir)}/${NAME}`)).rejects.toThrow();
    await expect(fs.stat(path.join(dir, 'secret.txt'))).resolves.toBeTruthy();
  });

  it('مالک نسخهٔ معتبر را پاک می‌کند', async () => {
    await deleteLocalBackup(owner, NAME);
    await expect(fs.stat(path.join(dir, NAME))).rejects.toThrow();
  });
});
