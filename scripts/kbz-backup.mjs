#!/usr/bin/env node
// ابزارِ پشتیبان و بازگردانیِ KabarzaOS — بی‌وابستگی (فقط Node و ابزارهای ایمیج).
//
// ⚠️ عمداً جدا از خودِ برنامه: بازگردانی دقیقاً وقتی لازم می‌شود که برنامه
// بالا نمی‌آید (دیتابیسِ خراب، سرورِ تازه). این فایل فقط Node، pg_restore،
// rclone و tar را لازم دارد — همه در ایمیجِ اپ هستند.
//
// استفاده (داخلِ کانتینرِ اپ؛ معمولاً از راهِ scripts/restore.sh و scripts/backup.sh):
//   node scripts/kbz-backup.mjs restore <file.kbzbak> [--yes]
//   node scripts/kbz-backup.mjs inspect <file.kbzbak>        (خلاصهٔ JSON، بی‌هیچ تغییری)
//   node scripts/kbz-backup.mjs decrypt <file.kbzbak> <folder>
//   node scripts/kbz-backup.mjs backup
//
// رمزِ فایل: از متغیرِ KBZ_PASSPHRASE یا پرسشِ پنهان در ترمینال.
//
// ⚠️ قالبِ رمزگذاری باید با src/server/backup/crypto.ts یکی بماند
// (تستِ src/server/backup/crypto.test.ts هر دو را با هم می‌آزماید).

import { createDecipheriv, createCipheriv, randomBytes, scrypt } from 'node:crypto';
import { createReadStream, createWriteStream, promises as fs } from 'node:fs';
import { spawn } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';

export const MAGIC = Buffer.from('KBZBAK01');
const SALT = 16;
const IV = 12;
const TAG = 16;
const HEADER = MAGIC.length + SALT + IV;
const KDF = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

/** نسخهٔ همین برنامه — کنارِ scripts/ (در ایمیج /app/package.json). */
const APP_VERSION = await fs.readFile(new URL('../package.json', import.meta.url), 'utf8')
  .then((raw) => JSON.parse(raw).version ?? null, () => null);

/**
 * آیا نسخهٔ پشتیبان از نسخهٔ برنامه تازه‌تر است؟
 *
 * ⚠️ پشتیبانِ تازه‌تر یعنی جدول‌هایی که این برنامه نمی‌شناسد و مایگریشنی که
 * هنوز ندارد — بازگردانی‌اش برنامه را بی‌صدا خراب می‌کند. قدیمی‌تر مشکلی
 * ندارد: مایگریشن‌ها در راه‌اندازیِ بعدی آن را بالا می‌آورند.
 */
export function isNewerVersion(backup, app) {
  if (!backup || !app) return false;
  const a = String(backup).split('.').map((n) => Number.parseInt(n, 10) || 0);
  const b = String(app).split('.').map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  return false;
}

function deriveKey(passphrase, salt) {
  return new Promise((resolve, reject) => {
    scrypt(passphrase.normalize('NFC'), salt, 32, KDF, (error, key) => (error ? reject(error) : resolve(key)));
  });
}

export async function encryptFile(src, dest, passphrase) {
  const salt = randomBytes(SALT);
  const iv = randomBytes(IV);
  const key = await deriveKey(passphrase, salt);
  const header = Buffer.concat([MAGIC, salt, iv]);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(header);
  const out = createWriteStream(dest);
  out.write(header);
  await pipeline(createReadStream(src), cipher, out, { end: false });
  await new Promise((resolve, reject) => {
    out.on('error', reject);
    out.end(cipher.getAuthTag(), () => resolve());
  });
}

export async function decryptFile(src, dest, passphrase) {
  const fh = await fs.open(src, 'r');
  let header;
  let tag;
  let size;
  try {
    size = (await fh.stat()).size;
    if (size < HEADER + TAG) throw new Error('not_backup');
    header = Buffer.alloc(HEADER);
    await fh.read(header, 0, HEADER, 0);
    if (!header.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error('not_backup');
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
    throw new Error('bad_passphrase');
  }
}

/* ------------------------------------------------------------------ *
 * ابزارها
 * ------------------------------------------------------------------ */

function run(cmd, args, { env = {}, quiet = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      env: { ...process.env, ...env },
      stdio: ['ignore', quiet ? 'ignore' : 'inherit', 'pipe'],
    });
    let err = '';
    child.stderr.on('data', (d) => { err += d; if (!quiet) process.stderr.write(d); });
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}: ${err.trim().slice(-400)}`))));
  });
}

/** اتصالِ Postgres از DATABASE_URL — رمز در env، نه در خطِ فرمان. */
function pgEnv() {
  const url = new URL(process.env.DATABASE_URL ?? '');
  return {
    PGHOST: url.hostname,
    PGPORT: url.port || '5432',
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: url.pathname.replace(/^\//, ''),
  };
}

/** انبارِ فایلِ خودِ سامانه برای rclone (remote به نامِ `store`). */
function storeEnv() {
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

async function askHidden(question) {
  if (process.env.KBZ_PASSPHRASE) return process.env.KBZ_PASSPHRASE;
  if (!process.stdin.isTTY) throw new Error('رمز لازم است: KBZ_PASSPHRASE را بدهید یا با ترمینالِ تعاملی (-it) اجرا کنید.');
  process.stdout.write(question);
  return new Promise((resolve) => {
    let value = '';
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    const onData = (ch) => {
      if (ch === '\r' || ch === '\n' || ch === '\u0004') {
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdin.off('data', onData);
        process.stdout.write('\n');
        resolve(value);
      } else if (ch === '\u0003') {
        process.exit(130);
      } else if (ch === '\u007f') {
        value = value.slice(0, -1);
      } else {
        value += ch;
      }
    };
    process.stdin.on('data', onData);
  });
}

async function askYes(question) {
  if (process.argv.includes('--yes')) return true;
  if (!process.stdin.isTTY) return false;
  process.stdout.write(question);
  const answer = await new Promise((resolve) => {
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    process.stdin.once('data', (d) => { process.stdin.pause(); resolve(String(d).trim()); });
  });
  return answer === 'yes';
}

async function waitForDb() {
  for (let i = 0; i < 60; i++) {
    try {
      await run('pg_isready', ['-q'], { env: pgEnv(), quiet: true });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw new Error('دیتابیس در دو دقیقه آماده نشد.');
}

async function unpack(file, dir, { manifestOnly = false } = {}) {
  const pass = await askHidden('رمزِ فایلِ پشتیبان: ');
  const tgz = path.join(dir, 'payload.tgz');
  await decryptFile(file, tgz, pass);
  const out = path.join(dir, 'x');
  await fs.mkdir(out, { recursive: true });
  // بسته با «tar -C work .» ساخته شده، پس نامِ ورودی‌ها با ./ شروع می‌شود.
  await run('tar', ['-xzf', tgz, '-C', out, ...(manifestOnly ? ['./manifest.json'] : [])]);
  await fs.rm(tgz, { force: true });
  const manifest = JSON.parse(await fs.readFile(path.join(out, 'manifest.json'), 'utf8'));
  return { out, manifest };
}

/**
 * بازگردانیِ دیتابیس — **همه یا هیچ**.
 *
 * ⚠️ نه «pg_restore --clean»: آن فقط چیزهایی را پاک می‌کند که در پشتیبان هست.
 * پشتیبانِ قدیمی روی نصبِ تازه‌تر جدول‌های نسخهٔ جدید را سرِ جا می‌گذاشت، و در
 * راه‌اندازیِ بعدی مایگریشن‌ها می‌خواستند همان‌ها را دوباره بسازند و برنامه
 * بالا نمی‌آمد. اینجا دو شِمای برنامه (public و drizzle ِ دفترِ مایگریشن) کامل
 * پاک و از پشتیبان ساخته می‌شوند، و کلِ کار در یک تراکنش است: اگر جایی شکست
 * بخورد، دیتابیس دست‌نخورده می‌ماند.
 */
function restoreDatabase(dump) {
  const env = { ...process.env, ...pgEnv() };
  return new Promise((resolve, reject) => {
    const psql = spawn('psql', ['-X', '-q', '-1', '-v', 'ON_ERROR_STOP=1'], { env, stdio: ['pipe', 'ignore', 'pipe'] });
    const dumpSql = spawn('pg_restore', ['--no-owner', '--no-privileges', '--file', '-', dump], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let err = '';
    const codes = {};
    const done = (name) => (code) => {
      codes[name] = code;
      if (!('psql' in codes) || !('pg_restore' in codes)) return;
      if (codes.psql === 0 && codes.pg_restore === 0) resolve();
      else reject(new Error(`دیتابیس بازگردانده نشد (چیزی تغییر نکرد): ${err.trim().split('\n').slice(-3).join(' ').slice(0, 400)}`));
    };
    psql.stderr.on('data', (d) => { err += d; });
    dumpSql.stderr.on('data', (d) => { err += d; });
    psql.on('error', reject);
    dumpSql.on('error', reject);
    psql.on('close', done('psql'));
    dumpSql.on('close', done('pg_restore'));
    // psql زودتر بسته شود (خطا) → نوشتن EPIPE می‌دهد؛ خطای واقعی از کدِ خروج می‌آید.
    psql.stdin.on('error', () => undefined);
    psql.stdin.write('DROP SCHEMA IF EXISTS drizzle CASCADE;\nDROP SCHEMA IF EXISTS public CASCADE;\nCREATE SCHEMA public;\n');
    dumpSql.stdout.pipe(psql.stdin);
  });
}

/* ------------------------------------------------------------------ *
 * فرمان‌ها
 * ------------------------------------------------------------------ */

/** خلاصهٔ پشتیبان به JSON — برای ویزاردِ نصب. چیزی را تغییر نمی‌دهد. */
async function inspect(file) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'kbz-inspect-'));
  try {
    const { manifest } = await unpack(file, dir, { manifestOnly: true });
    console.log(JSON.stringify({
      createdAt: manifest.createdAt, app: manifest.app, current: APP_VERSION,
      dbBytes: manifest.dbBytes, fileCount: manifest.fileCount, fileBytes: manifest.fileBytes,
      tooNew: isNewerVersion(manifest.app, APP_VERSION),
    }));
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

async function restore(file) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'kbz-restore-'));
  try {
    const { out, manifest } = await unpack(file, dir);
    console.log(`\nپشتیبانِ ${manifest.createdAt} — نسخهٔ ${manifest.app}`);
    console.log(`  دیتابیس: ${(manifest.dbBytes / 1024 / 1024).toFixed(1)} MB · فایل‌ها: ${manifest.fileCount} (${(manifest.fileBytes / 1024 / 1024).toFixed(1)} MB)`);
    if (isNewerVersion(manifest.app, APP_VERSION)) throw new Error('too_new');
    console.log('\n⚠️ دیتابیس و فایل‌های فعلیِ این سرور با محتوای پشتیبان جایگزین می‌شوند.');
    if (!(await askYes('برای ادامه «yes» بنویسید: '))) {
      console.log('لغو شد. چیزی تغییر نکرد.');
      return;
    }

    console.log('\n▸ انتظار برای دیتابیس');
    await waitForDb();
    console.log('▸ بازگردانیِ دیتابیس');
    await restoreDatabase(path.join(out, 'db.dump'));

    const files = path.join(out, 'files');
    if (await fs.stat(files).then(() => true, () => false)) {
      console.log('▸ بازگردانیِ فایل‌ها');
      const bucket = process.env.S3_BUCKET || 'kabarza';
      await run('rclone', ['mkdir', `store:${bucket}`], { env: storeEnv() });
      await run('rclone', ['copy', files, `store:${bucket}`, '--transfers', '8'], { env: storeEnv() });
    }

    const secrets = path.join(out, 'secrets');
    const secretDir = process.env.SECRET_DIR || '/app/data';
    const overridden = [];
    if (await fs.stat(secrets).then(() => true, () => false)) {
      console.log('▸ بازگردانیِ رازهای داخلی');
      for (const name of await fs.readdir(secrets)) {
        if (!/^[a-z_]+$/.test(name)) continue;
        const target = path.join(secretDir, name);
        // ⚠️ docker-entrypoint.sh متغیرِ محیط را بر فایل مقدم می‌داند. اگر این سرور
        // همین راز را در .env دارد (یعنی با فایلِ فعلی فرق دارد)، فایلِ بازگردانده
        // نادیده می‌ماند — پس باید به مدیر گفت.
        const envName = name.toUpperCase();
        const before = (await fs.readFile(target, 'utf8').catch(() => '')).trim();
        const restored = (await fs.readFile(path.join(secrets, name), 'utf8')).trim();
        const fromEnv = process.env[envName] ?? '';
        if (fromEnv.length >= 32 && fromEnv !== before && fromEnv !== restored) overridden.push(envName);
        await fs.copyFile(path.join(secrets, name), target);
        await fs.chmod(target, 0o600);
      }
    }

    // از ویزاردِ نصب، خودِ برنامه پس از این دوباره راه می‌افتد.
    console.log(process.env.KBZ_FROM_APP === '1'
      ? '\n✓ بازگردانی تمام شد.'
      : '\n✓ بازگردانی تمام شد. اپ را بالا بیاورید: docker compose up -d');
    if (overridden.length) {
      const effect = {
        SESSION_SECRET: 'همه باید دوباره وارد شوند',
        CRON_SECRET: 'زمان‌بندِ بیرونی (اگر دارید) باید رازِ تازه را بگیرد',
        BACKUP_KEY: 'رمزِ پشتیبان و مقصدها باید در تنظیمات از نو وارد شوند',
      };
      console.log('\n⚠️ این متغیرها در .env ِ این سرور تعیین شده‌اند و بر رازِ بازگردانده مقدم‌اند:');
      for (const name of overridden) console.log(`   ${name} — ${effect[name] ?? 'مقدارِ .env به کار می‌رود'}`);
      console.log('   برای استفاده از رازِ بازگردانده، آن خط(ها) را از .env بردارید و docker compose up -d بزنید.');
    }
    const envFile = path.join(out, 'env.txt');
    if (await fs.stat(envFile).then(() => true, () => false)) {
      console.log('\nتنظیماتِ سرورِ قبلی (برای مقایسه با .env ِ این سرور؛ رازها نشان داده نمی‌شوند):');
      for (const line of (await fs.readFile(envFile, 'utf8')).split('\n')) {
        const [k] = line.split('=');
        if (k && !/PASSWORD|SECRET|TOKEN|KEY/.test(k)) console.log(`  ${line}`);
      }
    }
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

async function decryptTo(file, folder) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'kbz-decrypt-'));
  try {
    const { out } = await unpack(file, dir);
    await fs.mkdir(folder, { recursive: true });
    await fs.cp(out, folder, { recursive: true });
    console.log(`✓ باز شد در ${folder}`);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

/** پشتیبانِ فوری از راهِ خودِ اپ (همان مسیرِ زمان‌بند) — و منتظرِ پایانش. */
async function backupNow() {
  const secret = process.env.CRON_SECRET
    || (await fs.readFile(path.join(process.env.SECRET_DIR || '/app/data', 'cron_secret'), 'utf8')).trim();
  const res = await fetch(`http://127.0.0.1:${process.env.PORT || 3000}/api/backup/run?wait=1`, {
    method: 'POST',
    headers: { 'x-cron-secret': secret },
  });
  const body = await res.json().catch(() => ({}));
  // ⚠️ فایل ممکن است ساخته شده باشد و فقط مقصدی شکست خورده باشد — فهرستِ مقصدها
  // را در هر دو حالت نشان بده تا معلوم باشد کدام.
  if (body.file) console.log(`${body.ok ? '✓' : '⚠️'} پشتیبان ساخته شد: ${body.file}`);
  for (const d of body.destinations ?? []) console.log(`  ${d.ok ? '✓' : '✗'} ${d.name}${d.error ? ` — ${d.error}` : ''}`);
  if (!res.ok || !body.ok) throw new Error(body.error || `HTTP ${res.status}`);
}

async function main() {
  const [cmd, a, b] = process.argv.slice(2).filter((x) => x !== '--yes');
  try {
    if (cmd === 'restore' && a) await restore(a);
    else if (cmd === 'inspect' && a) await inspect(a);
    else if (cmd === 'decrypt' && a && b) await decryptTo(a, b);
    else if (cmd === 'backup') await backupNow();
    else {
      console.log('استفاده: restore <file> [--yes] | inspect <file> | decrypt <file> <folder> | backup');
      process.exit(2);
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const known = {
      bad_passphrase: 'رمز اشتباه است یا فایل دست‌کاری شده.',
      not_backup: 'این فایل پشتیبانِ KabarzaOS نیست.',
      too_new: `این پشتیبان از نسخه‌ای تازه‌تر از این سرور (${APP_VERSION}) است؛ اول برنامه را به‌روز کنید.`,
      destination_failed: 'فایل ساخته شد ولی به همهٔ مقصدها نرسید (فهرستِ بالا).',
      busy: 'پشتیبانِ دیگری همین حالا در حالِ اجراست.',
      no_passphrase: 'رمزِ پشتیبان تعیین نشده — در تنظیمات ← پشتیبان‌گیری تعیینش کنید.',
      key_missing: 'BACKUP_KEY در دسترس نیست؛ اپ را یک بار با docker compose up -d بالا بیاورید.',
    };
    console.error(`✗ ${known[msg] ?? msg}`);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
