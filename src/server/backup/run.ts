import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/db/client';
import { auditLog, userRoles, users } from '@/db/schema';
import {
  backupFileName, keepSet, parseBackupName, rcloneEnv, remoteDir, scheduledDue, tidyToolError,
  type DestParams, type DestSecrets, type DestType,
} from '@/domain/backup/plan';
import { localParts } from '@/domain/scheduler/tick';
import { getSystemConfig } from '@/server/settings/system-service';
import { notify } from '@/server/notifications/service';
import { encryptFile } from './crypto';
import {
  destinationSecrets, pushHistory, readConfig, readLastScheduled, readStatus, unseal, writeLastScheduled,
  writeStatus, type BackupRun, type DestinationResult, type StoredDestination,
} from './config';
import pkg from '../../../package.json';

/**
 * موتورِ پشتیبان‌گیری.
 *
 * یک پشتیبان = یک فایلِ رمزگذاری‌شده با:
 *   db.dump        خروجیِ pg_dump (قالبِ custom)
 *   files/         همهٔ شیءهای انبارِ فایل
 *   secrets/       رازهای داخلی (امضای نشست، cron، کلیدِ تنظیماتِ پشتیبان)
 *   env.txt        تنظیماتِ محیطِ سرور (APP_URL، SMTP، …) برای مرجع
 *   manifest.json  نسخه، زمان، شمار و حجم
 *
 * ⚠️ ابزارها (pg_dump، rclone، tar) در ایمیجِ اپ نصب‌اند (Dockerfile). روی
 * ماشینِ توسعه نبودنشان خطای روشن می‌دهد، نه خرابیِ خاموش.
 */

/*
 * ⚠️ این دو پوشه ولومِ زمانِ اجرا هستند، نه فایل‌های پروژه. هر دسترسیِ fs به آن‌ها
 * نشانِ turbopackIgnore دارد؛ بی‌آن ردیابِ فایلِ Next کلِ پروژه (Dockerfile، src،
 * scripts، …) را کنارِ این مسیرها در ایمیج می‌ریزد.
 */
const BACKUP_DIR = () => process.env.BACKUP_DIR || '/app/backups';
const SECRET_DIR = () => process.env.SECRET_DIR || '/app/data';
/** پشتیبانی که بیش از این «در حالِ اجرا» مانده، یعنی پردازه وسطِ کار مُرده. */
const STALE_MS = 3 * 60 * 60 * 1000;
/**
 * رازهایی که بازگردانی لازم دارد — فقط همین نام‌ها، نه هر چه در پوشه است.
 * ⚠️ مقدارِ مؤثر از متغیرِ محیط خوانده می‌شود، نه فقط از فایل: اگر مدیر رازی را
 * در .env گذاشته باشد فایلی ساخته نمی‌شود و پشتیبان بی‌راز می‌ماند — آن‌وقت
 * روی سرورِ تازه BACKUP_KEY عوض می‌شود و تنظیماتِ مهروموم‌شده دیگر باز نمی‌شوند.
 */
const SECRETS: Array<[file: string, env: string]> = [
  ['session_secret', 'SESSION_SECRET'], ['cron_secret', 'CRON_SECRET'], ['backup_key', 'BACKUP_KEY'],
];
/** تنظیماتِ محیط برای مرجع در سرورِ تازه — نه DATABASE_URL (مالِ همان سرور است). */
const ENV_KEYS = [
  'APP_URL', 'APP_TIMEZONE', 'DEFAULT_LOCALE', 'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASSWORD',
  'SMTP_FROM', 'TELEGRAM_BOT_TOKEN', 'TELEGRAM_BOT_USERNAME', 'S3_BUCKET', 'S3_REGION',
];

export class BackupError extends Error {
  constructor(readonly code: 'no_passphrase' | 'busy' | 'tool_failed' | 'key_missing', detail = '') {
    super(detail || `backup: ${code}`);
    this.name = 'BackupError';
  }
}

/** اجرای یک ابزار. خروجی = stdout؛ خطا = آخرین خطای stderr (بی‌رازها — رازها فقط در env اند). */
function tool(cmd: string, args: string[], opts: { env?: Record<string, string>; input?: string; timeoutMs?: number } = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { env: { ...process.env, ...opts.env }, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), opts.timeoutMs ?? 2 * 60 * 60 * 1000);
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(new BackupError('tool_failed', `${cmd}: ${(e as NodeJS.ErrnoException).code === 'ENOENT' ? 'not installed' : e.message}`));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(out);
      else reject(new BackupError('tool_failed', `${cmd}: ${tidyToolError(err) || `exit ${code}`}`));
    });
    if (opts.input !== undefined) child.stdin.end(opts.input);
    else child.stdin.end();
  });
}

function pgEnv(): Record<string, string> {
  const url = new URL(process.env.DATABASE_URL ?? '');
  return {
    PGHOST: url.hostname,
    PGPORT: url.port || '5432',
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: url.pathname.replace(/^\//, ''),
  };
}

/** انبارِ فایلِ خودِ سامانه برای rclone (remote ِ `store`). */
function storeEnv(): Record<string, string> {
  return {
    RCLONE_CONFIG_STORE_TYPE: 's3',
    RCLONE_CONFIG_STORE_PROVIDER: 'Other',
    RCLONE_CONFIG_STORE_ENDPOINT: process.env.S3_ENDPOINT ?? '',
    RCLONE_CONFIG_STORE_REGION: process.env.S3_REGION ?? 'us-east-1',
    RCLONE_CONFIG_STORE_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY ?? '',
    RCLONE_CONFIG_STORE_SECRET_ACCESS_KEY: process.env.S3_SECRET_KEY ?? '',
    RCLONE_CONFIG_STORE_FORCE_PATH_STYLE: 'true',
  };
}

async function dirStats(dir: string): Promise<{ count: number; bytes: number }> {
  let count = 0;
  let bytes = 0;
  for (const entry of await fs.readdir(dir, { withFileTypes: true, recursive: true }).catch(() => [])) {
    if (!entry.isFile()) continue;
    count++;
    bytes += (await fs.stat(path.join(entry.parentPath, entry.name))).size;
  }
  return { count, bytes };
}

/** rclone برای یک مقصد: env + نشانیِ پوشه. رمزِ SFTP/WebDAV اینجا «obscure» می‌شود. */
async function destinationRemote(d: { id: string; type: DestType; path: string; params: DestParams }, secrets: DestSecrets) {
  const remote = `d${d.id.replace(/[^a-z0-9]/gi, '').slice(0, 12)}`;
  const obscured = (d.type === 'sftp' || d.type === 'webdav') && secrets.password
    ? (await tool('rclone', ['obscure', '-'], { input: secrets.password, timeoutMs: 30_000 })).trim()
    : null;
  return {
    env: rcloneEnv(remote, { type: d.type, params: d.params, secrets }, obscured),
    dir: remoteDir(remote, d, d.path),
  };
}

/** آزمونِ اتصال: پوشه ساخته و فهرست می‌شود — بی‌نوشتنِ فایل. */
export async function testRemote(d: { id: string; type: DestType; path: string; params: DestParams }, secrets: DestSecrets) {
  const { env, dir } = await destinationRemote(d, secrets);
  await tool('rclone', ['mkdir', dir], { env, timeoutMs: 60_000 });
  await tool('rclone', ['lsf', dir, '--max-depth', '1', '--files-only'], { env, timeoutMs: 60_000 });
}

/** ارسال به یک مقصد و پاک‌کردنِ نسخه‌های قدیمیِ **خودمان** طبقِ سیاستِ نگه‌داری. */
async function sendTo(dest: StoredDestination, file: string, name: string, retention: Parameters<typeof keepSet>[1]): Promise<DestinationResult> {
  try {
    const { env, dir } = await destinationRemote(dest, destinationSecrets(dest));
    await tool('rclone', ['copyto', file, `${dir.replace(/\/$/, '')}${dir.endsWith(':') ? '' : '/'}${name}`, '--retries', '3'], { env });
    const listed = (await tool('rclone', ['lsf', dir, '--files-only', '--max-depth', '1'], { env, timeoutMs: 120_000 }))
      .split('\n').map((s) => s.trim()).filter(Boolean);
    const ours = listed.filter((n) => parseBackupName(n) !== null);
    const keep = keepSet(ours, retention);
    let pruned = 0;
    for (const old of ours.filter((n) => !keep.has(n))) {
      await tool('rclone', ['deletefile', `${dir.replace(/\/$/, '')}${dir.endsWith(':') ? '' : '/'}${old}`], { env, timeoutMs: 120_000 });
      pruned++;
    }
    return { id: dest.id, name: dest.name, ok: true, pruned };
  } catch (error) {
    return { id: dest.id, name: dest.name, ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/** نسخه‌های روی خودِ سرور — تازه‌ترین اول. */
export async function listLocalBackups(): Promise<Array<{ name: string; size: number; at: Date }>> {
  const entries = await fs.readdir(/*turbopackIgnore: true*/ BACKUP_DIR()).catch(() => [] as string[]);
  const rows: Array<{ name: string; size: number; at: Date }> = [];
  for (const name of entries) {
    const at = parseBackupName(name);
    if (!at) continue;
    rows.push({ name, at, size: (await fs.stat(/*turbopackIgnore: true*/ path.join(/*turbopackIgnore: true*/ BACKUP_DIR(), name))).size });
  }
  return rows.sort((a, b) => b.at.getTime() - a.at.getTime());
}

/** مسیرِ امنِ یک پشتیبانِ محلی — فقط نامِ معتبر، هرگز مسیرِ دلخواه. */
export function localBackupPath(name: string): string | null {
  return parseBackupName(name) ? path.join(/*turbopackIgnore: true*/ BACKUP_DIR(), name) : null;
}

async function ownerIds(): Promise<number[]> {
  const rows = await db.selectDistinct({ id: users.id }).from(userRoles)
    .innerJoin(users, eq(users.id, userRoles.userId))
    .where(and(eq(userRoles.role, 'owner'), isNull(users.deletedAt), eq(users.memberState, 'active')));
  return rows.map((r) => r.id);
}

let running = false;

/**
 * ساختنِ یک پشتیبان، از اول تا آخر. ⚠️ در هر لحظه فقط یکی: قفلِ درونِ پردازه
 * + مهرِ «در حالِ اجرا» در دیتابیس (برای چند نمونه یا ریستارتِ وسطِ کار).
 */
export async function createBackup(trigger: BackupRun['trigger'], actorId: number | null = null): Promise<BackupRun> {
  if (running) throw new BackupError('busy');
  const previous = await readStatus();
  if (previous?.running && Date.now() - Date.parse(previous.startedAt) < STALE_MS) throw new BackupError('busy');

  const config = await readConfig();
  const passphrase = unseal(config.passphrase);
  if (!passphrase) throw new BackupError('no_passphrase');

  running = true;
  const started = new Date();
  const run: BackupRun = { trigger, startedAt: started.toISOString(), finishedAt: null, running: true, ok: null, destinations: [] };
  await writeStatus(run);

  const name = backupFileName(started);
  const base = BACKUP_DIR();
  const work = path.join(base, `.work-${started.getTime()}`);
  const tgz = `${work}.tgz`;
  try {
    await fs.mkdir(path.join(work, 'files'), { recursive: true });

    // ۱. دیتابیس
    await tool('pg_dump', ['--format=custom', '--no-owner', '--no-privileges', '--file', path.join(work, 'db.dump')], { env: pgEnv() });

    // ۲. فایل‌ها — کلِ سطلِ انبار
    const bucket = process.env.S3_BUCKET || 'kabarza';
    await tool('rclone', ['copy', `store:${bucket}`, path.join(work, 'files'), '--transfers', '8'], { env: storeEnv() });

    // ۳. رازهای داخلی و تنظیماتِ محیط
    await fs.mkdir(path.join(work, 'secrets'), { recursive: true });
    for (const [file, env] of SECRETS) {
      const target = path.join(work, 'secrets', file);
      const value = process.env[env] ?? '';
      // همان آستانهٔ ۳۲ ِ docker-entrypoint.sh: کوتاه‌تر یعنی «تعیین نشده».
      if (value.length >= 32) await fs.writeFile(target, value, { mode: 0o600 });
      else await fs.copyFile(/*turbopackIgnore: true*/ path.join(/*turbopackIgnore: true*/ SECRET_DIR(), file), target).catch(() => undefined);
    }
    await fs.writeFile(path.join(work, 'env.txt'),
      ENV_KEYS.filter((k) => process.env[k]).map((k) => `${k}=${process.env[k]}`).join('\n') + '\n', { mode: 0o600 });

    const files = await dirStats(path.join(work, 'files'));
    const dbBytes = (await fs.stat(path.join(work, 'db.dump'))).size;
    await fs.writeFile(path.join(work, 'manifest.json'), JSON.stringify({
      format: 1, app: pkg.version, createdAt: started.toISOString(), dbBytes, fileCount: files.count, fileBytes: files.bytes,
    }, null, 2));

    // ۴. یک فایل، رمزگذاری‌شده
    await tool('tar', ['-czf', tgz, '-C', work, '.']);
    const out = path.join(/*turbopackIgnore: true*/ base, name);
    await encryptFile(tgz, out, passphrase);
    run.file = name;
    run.size = (await fs.stat(/*turbopackIgnore: true*/ out)).size;

    // ۵. مقصدها — هر کدام مستقل؛ شکستِ یکی بقیه را نمی‌خواباند.
    for (const dest of config.destinations.filter((d) => d.enabled)) {
      run.destinations.push(await sendTo(dest, out, name, config.retention));
    }

    // ۶. نگه‌داریِ محلی
    const local = await listLocalBackups();
    for (const old of local.slice(config.keepLocal)) await fs.rm(/*turbopackIgnore: true*/ path.join(/*turbopackIgnore: true*/ base, old.name), { force: true });

    run.ok = run.destinations.every((d) => d.ok);
    if (!run.ok) run.error = 'destination_failed';
  } catch (error) {
    run.ok = false;
    run.error = error instanceof Error ? error.message : String(error);
  } finally {
    await fs.rm(work, { recursive: true, force: true }).catch(() => undefined);
    await fs.rm(tgz, { force: true }).catch(() => undefined);
    run.running = false;
    run.finishedAt = new Date().toISOString();
    running = false;
    await writeStatus(run).catch(() => undefined);
    await pushHistory(run).catch(() => undefined);
    await db.insert(auditLog).values({
      actorType: actorId ? 'user' : 'system', actorId, action: 'backup.create', objectType: 'backup', objectId: 0,
      before: null, after: { trigger, ok: run.ok, file: run.file ?? null, error: run.error ?? null },
    }).catch(() => undefined);
  }

  if (!run.ok) {
    const failed = run.destinations.filter((d) => !d.ok).map((d) => d.name);
    await notify(await ownerIds(), {
      type: 'backup.failed',
      title: 'پشتیبان‌گیری کامل نشد',
      body: failed.length > 0 ? 'ارسال به این مقصدها ناموفق بود: {names}' : '{error}',
      params: { names: failed.join('، '), error: (run.error ?? '').slice(0, 200) },
      url: '/settings?tab=backup',
    }).catch(() => undefined);
  }
  return run;
}

/** شروعِ پشتیبان بی‌انتظار — برای دکمهٔ پنل و زمان‌بند (درخواستِ HTTP منتظرِ ساعت‌ها کار نمی‌ماند). */
export function startBackup(trigger: BackupRun['trigger'], actorId: number | null = null): void {
  void createBackup(trigger, actorId).catch((error) => {
    if (!(error instanceof BackupError && error.code === 'busy')) console.error('[backup]', error);
  });
}

/** کارِ تیکِ زمان‌بند: اگر وقتِ پشتیبانِ امروز است، شروعش کن. */
export async function runBackupIfDue(now = new Date()): Promise<boolean> {
  const config = await readConfig();
  if (!config.enabled || !config.passphrase) return false;
  const local = localParts(now, (await getSystemConfig()).timezone || 'UTC');
  const due = scheduledDue({
    enabled: config.enabled,
    hour: config.hour,
    lastRunDate: await readLastScheduled(),
    localDate: local.date,
    localHour: local.hour,
  });
  if (!due) return false;
  // ⚠️ مهر پیش از شروع — تیکِ بعدی (۵ دقیقه بعد) نباید دوباره شروع کند.
  await writeLastScheduled(local.date);
  startBackup('schedule');
  return true;
}
