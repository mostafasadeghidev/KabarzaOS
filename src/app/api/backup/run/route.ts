import { timingSafeEqual } from 'node:crypto';
import { BackupKeyError } from '@/server/backup/config';
import { BackupError, createBackup, startBackup } from '@/server/backup/run';

/**
 * پشتیبانِ فوری از خطِ فرمان (`scripts/backup.sh` → `kbz-backup.mjs backup`).
 *
 * ⚠️ همان گاردِ تیکِ زمان‌بند: رازِ مشترکِ `x-cron-secret`. بی‌راز، بسته.
 * `?wait=1` منتظرِ پایان می‌ماند و نتیجه را برمی‌گرداند (ابزارِ خطِ فرمان
 * می‌خواهد بداند موفق شد یا نه)؛ بی‌آن فقط شروع می‌کند.
 */

function authorized(request: Request): boolean {
  const expected = process.env.CRON_SECRET ?? '';
  if (!expected) return false;
  const a = Buffer.from(request.headers.get('x-cron-secret') ?? '');
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  if (!authorized(request)) return new Response(null, { status: 403 });

  if (new URL(request.url).searchParams.get('wait') !== '1') {
    startBackup('cli');
    return Response.json({ ok: true, started: true });
  }
  try {
    const run = await createBackup('cli');
    return Response.json({ ok: run.ok, file: run.file, error: run.error, destinations: run.destinations });
  } catch (error) {
    const code = error instanceof BackupError ? error.code : error instanceof BackupKeyError ? 'key_missing' : 'failed';
    return Response.json({ ok: false, error: code }, { status: 409 });
  }
}
