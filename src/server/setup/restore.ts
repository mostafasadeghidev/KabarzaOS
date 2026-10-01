import { spawn } from 'node:child_process';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { isInstalled } from './service';

/**
 * بازگردانی از ویزاردِ نصب — برای سرورِ تازه‌ای که ترمینال ندارد (Coolify، Portainer…).
 *
 * کار را خودش انجام نمی‌دهد: همان ابزارِ خطِ فرمان (`scripts/kbz-backup.mjs`) را
 * اجرا می‌کند، تا بازگردانی از پنل و از ترمینال **یک** مسیر باشند و از هم جدا نیفتند.
 *
 * ⚠️ امنیت — همان قفلِ خودِ ویزارد: فقط تا وقتی هیچ کاربری نیست. کسی که فایل
 * را بالا می‌فرستد یک «ژتون» می‌گیرد و هر گامِ بعدی آن را می‌خواهد؛ بازدیدکنندهٔ
 * دوم نه می‌تواند کارِ او را ببیند، نه قطع کند، نه فایلِ خودش را جایش بگذارد.
 * جای خالی پس از ده دقیقه بی‌کاری آزاد می‌شود (کسی که صفحه را بست، قفل را
 * برای همیشه نگه نمی‌دارد).
 *
 * ⚠️ پس از بازگردانی برنامه **خودش را می‌بندد** تا Docker (restart: unless-stopped)
 * دوباره بالایش بیاورد: رازهای بازگردانده (امضای نشست، کلیدِ پشتیبان) فقط در
 * راه‌اندازی خوانده می‌شوند، و مایگریشن‌ها پشتیبانِ قدیمی‌تر را همان‌جا به‌روز می‌کنند.
 */

export type RestorePhase = 'upload' | 'inspected' | 'running' | 'done' | 'failed';

export interface RestoreManifest {
  createdAt: string;
  app: string | null;
  current: string | null;
  dbBytes: number;
  fileCount: number;
  fileBytes: number;
  tooNew: boolean;
}

interface Slot {
  token: string;
  phase: RestorePhase;
  size: number;
  touched: number;
  manifest?: RestoreManifest;
  log: string[];
  error?: string;
}

export type RestoreFailure =
  | 'installed' | 'busy' | 'token' | 'offset' | 'phase' | 'empty'
  | 'bad_passphrase' | 'not_backup' | 'too_new' | 'tool_failed';

export class RestoreError extends Error {
  constructor(readonly code: RestoreFailure, readonly expected?: number) {
    super(code);
    this.name = 'RestoreError';
  }
}

const IDLE_MS = 10 * 60 * 1000;
const LOG_LINES = 200;

/*
 * ⚠️ این مسیرها ولومِ زمانِ اجرا هستند، نه فایل‌های پروژه — نشانِ turbopackIgnore
 * جلوی ریختنِ کلِ پروژه در ایمیج را می‌گیرد (همان دلیلِ src/server/backup/run.ts).
 */
const DIR = () => path.join(/*turbopackIgnore: true*/ process.env.BACKUP_DIR || '/app/backups', '.setup-restore');
const FILE = () => path.join(/*turbopackIgnore: true*/ DIR(), 'upload.kbzbak');
const CLI = () => path.join(/*turbopackIgnore: true*/ process.cwd(), 'scripts', 'kbz-backup.mjs');

/*
 * ⚠️ روی globalThis، نه متغیرِ ماژول: مسیرهای مختلفِ Next (ویزارد، تیکِ زمان‌بند)
 * ممکن است نسخهٔ جدای این ماژول را بارگذاری کنند و آن‌وقت یکی از بازگردانیِ در
 * جریان بی‌خبر می‌ماند.
 */
const store = globalThis as typeof globalThis & { __kbzSetupRestore?: Slot | null };
const current = () => store.__kbzSetupRestore ?? null;
const setSlot = (slot: Slot | null) => { store.__kbzSetupRestore = slot; };

/** بازگردانی همین حالا در جریان است؟ — نصبِ عادی و زمان‌بند باید کنار بایستند. */
export function isRestoring(): boolean {
  return current()?.phase === 'running';
}

function expired(slot: Slot): boolean {
  return slot.phase !== 'running' && slot.phase !== 'done' && Date.now() - slot.touched > IDLE_MS;
}

function claim(token: string): Slot {
  const slot = current();
  if (!slot || expired(slot)) throw new RestoreError('token');
  const a = Buffer.from(token);
  const b = Buffer.from(slot.token);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new RestoreError('token');
  slot.touched = Date.now();
  return slot;
}

/** شروعِ یک بارگذاریِ تازه. ژتون فقط همین‌جا برگردانده می‌شود. */
export async function beginRestore(): Promise<string> {
  if (await isInstalled()) throw new RestoreError('installed');
  const slot = current();
  if (slot && !expired(slot)) throw new RestoreError('busy');

  await fs.rm(/*turbopackIgnore: true*/ DIR(), { recursive: true, force: true });
  await fs.mkdir(/*turbopackIgnore: true*/ DIR(), { recursive: true, mode: 0o700 });
  await fs.writeFile(/*turbopackIgnore: true*/ FILE(), '', { mode: 0o600 });
  const token = randomBytes(24).toString('base64url');
  setSlot({ token, phase: 'upload', size: 0, touched: Date.now(), log: [] });
  return token;
}

/**
 * یک تکه از فایل. ⚠️ جای تکه باید دقیقاً پایانِ فایلِ فعلی باشد: تکهٔ تکراری
 * (تلاشِ دوباره پس از قطعی) یا جاافتاده فایل را بی‌صدا خراب می‌کرد. در عوض
 * اندازهٔ درست برمی‌گردد تا مرورگر از همان‌جا ادامه دهد.
 */
export async function appendChunk(token: string, offset: number, bytes: Uint8Array): Promise<number> {
  const slot = claim(token);
  if (slot.phase !== 'upload' && slot.phase !== 'inspected') throw new RestoreError('phase');
  if (offset !== slot.size) throw new RestoreError('offset', slot.size);
  await fs.appendFile(/*turbopackIgnore: true*/ FILE(), bytes);
  slot.size += bytes.byteLength;
  // فایل عوض شد → خلاصهٔ قبلی دیگر معتبر نیست.
  slot.phase = 'upload';
  slot.manifest = undefined;
  return slot.size;
}

function runTool(args: string[], passphrase: string, onLine?: (line: string) => void): Promise<{ code: number; out: string; err: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI(), ...args], {
      env: { ...process.env, KBZ_PASSPHRASE: passphrase, KBZ_FROM_APP: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    let err = '';
    let pending = '';
    const feed = (chunk: string) => {
      pending += chunk;
      const lines = pending.split('\n');
      pending = lines.pop() ?? '';
      for (const line of lines) if (line.trim()) onLine?.(line);
    };
    child.stdout.setEncoding('utf8').on('data', (d: string) => { out += d; feed(d); });
    child.stderr.setEncoding('utf8').on('data', (d: string) => { err += d; feed(d); });
    child.on('error', reject);
    child.on('close', (code) => {
      if (pending.trim()) onLine?.(pending);
      resolve({ code: code ?? 1, out, err });
    });
  });
}

/** پیامِ خطای ابزار → کدِ شناخته‌شده؛ بقیه «tool_failed» با متنِ خودش. */
function toolFailure(err: string): RestoreError {
  if (err.includes('رمز اشتباه است')) return new RestoreError('bad_passphrase');
  if (err.includes('پشتیبانِ KabarzaOS نیست')) return new RestoreError('not_backup');
  if (err.includes('تازه‌تر از این سرور')) return new RestoreError('too_new');
  return new RestoreError('tool_failed');
}

/** باز کردنِ فایل با رمز و خواندنِ خلاصه‌اش — چیزی تغییر نمی‌کند. */
export async function inspectRestore(token: string, passphrase: string): Promise<RestoreManifest> {
  const slot = claim(token);
  if (slot.phase !== 'upload' && slot.phase !== 'inspected') throw new RestoreError('phase');
  if (slot.size === 0) throw new RestoreError('empty');
  const { code, out, err } = await runTool(['inspect', FILE()], passphrase);
  if (code !== 0) throw toolFailure(err);
  const manifest = JSON.parse(out.trim().split('\n').at(-1) ?? '{}') as RestoreManifest;
  slot.manifest = manifest;
  slot.phase = 'inspected';
  return manifest;
}

/**
 * بازگردانی، در پس‌زمینه. ⚠️ «نصب نشده؟» همین‌جا دوباره سنجیده می‌شود: بینِ
 * بررسی و تأیید ممکن است کسی از راهِ فرمِ عادی حساب ساخته باشد.
 */
export async function applyRestore(token: string, passphrase: string): Promise<void> {
  const slot = claim(token);
  // پس از شکست هم: فایل هنوز سرِ جاست و دیتابیس دست‌نخورده (بازگردانیِ همه یا هیچ).
  if ((slot.phase !== 'inspected' && slot.phase !== 'failed') || !slot.manifest) throw new RestoreError('phase');
  if (slot.manifest.tooNew) throw new RestoreError('too_new');
  if (await isInstalled()) throw new RestoreError('installed');

  slot.phase = 'running';
  slot.log = [];
  slot.error = undefined;
  const push = (line: string) => {
    slot.log.push(line);
    if (slot.log.length > LOG_LINES) slot.log.splice(0, slot.log.length - LOG_LINES);
  };

  void runTool(['restore', FILE(), '--yes'], passphrase, push)
    .then(async ({ code, err }) => {
      if (code !== 0) {
        slot.phase = 'failed';
        slot.error = toolFailure(err).code;
        return;
      }
      slot.phase = 'done';
      await fs.rm(/*turbopackIgnore: true*/ DIR(), { recursive: true, force: true }).catch(() => undefined);
      // ⚠️ فقط در محیطِ تولید (کانتینر با restart: unless-stopped). در توسعه
      // بستنِ پردازه یعنی سرورِ توسعه می‌میرد و کسی بالایش نمی‌آورد.
      if (process.env.NODE_ENV === 'production') {
        setTimeout(() => process.exit(0), 3000).unref();
      }
    })
    .catch(() => {
      slot.phase = 'failed';
      slot.error = 'tool_failed';
    });
}

export interface RestoreStatus {
  phase: RestorePhase;
  size: number;
  manifest: RestoreManifest | null;
  log: string[];
  error: string | null;
  /** برنامه پس از پایان خودش دوباره راه می‌افتد؟ (فقط در کانتینرِ تولید) */
  restarts: boolean;
}

export function restoreStatus(token: string): RestoreStatus {
  const slot = claim(token);
  return {
    phase: slot.phase,
    size: slot.size,
    manifest: slot.manifest ?? null,
    log: slot.log,
    error: slot.error ?? null,
    restarts: process.env.NODE_ENV === 'production',
  };
}

/** رها کردن — فایلِ بالارفته پاک می‌شود. وسطِ بازگردانی ممکن نیست. */
export async function cancelRestore(token: string): Promise<void> {
  const slot = claim(token);
  if (slot.phase === 'running') throw new RestoreError('phase');
  setSlot(null);
  await fs.rm(/*turbopackIgnore: true*/ DIR(), { recursive: true, force: true });
}
