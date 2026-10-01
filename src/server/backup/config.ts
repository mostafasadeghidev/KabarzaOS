import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { schedulerStamps } from '@/db/schema';
import {
  DEFAULT_RETENTION, normalizeRetention, type DestParams, type DestSecrets, type DestType, type Retention,
} from '@/domain/backup/plan';

/**
 * تنظیماتِ پشتیبان‌گیری — یک ردیفِ JSON در `scheduler_stamps`.
 *
 * ⚠️ رازها (رمزِ فایلِ پشتیبان و رمزهای مقصدها) **مهروموم** نگه داشته می‌شوند:
 * AES-256-GCM با کلیدی از `BACKUP_KEY` — رازی که خودِ کانتینر بارِ اول می‌سازد
 * و در والیومِ `app_data` نگه می‌دارد (docker-entrypoint.sh)، پس نه در دیتابیس
 * است و نه در مخزن. دیتابیسِ لورفته به‌تنهایی رمزِ هیچ مقصدی را لو نمی‌دهد.
 * ⚠️ رازها هرگز به مرورگر برنمی‌گردند — فقط «تنظیم شده / نشده».
 */

const KEY = 'backup:config';
const STATUS = 'backup:status';
const HISTORY = 'backup:history';
const SCHEDULED = 'backup:last_scheduled';

export class BackupKeyError extends Error {
  constructor() {
    super('backup: BACKUP_KEY missing');
    this.name = 'BackupKeyError';
  }
}

function sealKey(): Buffer {
  const raw = process.env.BACKUP_KEY ?? '';
  if (raw.length < 32) throw new BackupKeyError();
  return createHash('sha256').update(raw).digest();
}

/** `v1.<iv>.<tag>.<ciphertext>` — base64url. */
export function seal(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', sealKey(), iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv, cipher.getAuthTag(), ct].map((p) => (typeof p === 'string' ? p : p.toString('base64url'))).join('.');
}

/** `null` اگر کلید عوض شده یا داده خراب است — آن‌وقت راز «تنظیم‌نشده» حساب می‌شود. */
export function unseal(blob: string | null | undefined): string | null {
  if (!blob) return null;
  try {
    const [v, iv, tag, ct] = blob.split('.');
    if (v !== 'v1' || !iv || !tag || !ct) return null;
    const decipher = createDecipheriv('aes-256-gcm', sealKey(), Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(ct, 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

export interface StoredDestination {
  id: string;
  name: string;
  type: DestType;
  path: string;
  enabled: boolean;
  params: DestParams;
  /** `DestSecrets` ِ مهروموم‌شده. */
  secrets: string;
}

export interface BackupConfig {
  enabled: boolean;
  /** ساعتِ محلیِ سامانه (۰ تا ۲۳). */
  hour: number;
  retention: Retention;
  /** چند پشتیبانِ آخر روی خودِ سرور بماند. */
  keepLocal: number;
  /** رمزِ فایلِ پشتیبان، مهروموم‌شده. */
  passphrase: string | null;
  destinations: StoredDestination[];
}

export const DEFAULT_CONFIG: BackupConfig = {
  enabled: false,
  hour: 3,
  retention: DEFAULT_RETENTION,
  keepLocal: 3,
  passphrase: null,
  destinations: [],
};

async function readStamp(key: string): Promise<string | null> {
  const [row] = await db.select({ value: schedulerStamps.value }).from(schedulerStamps).where(eq(schedulerStamps.key, key));
  return row?.value ?? null;
}

async function writeStamp(key: string, value: string): Promise<void> {
  await db.insert(schedulerStamps).values({ key, value })
    .onConflictDoUpdate({ target: schedulerStamps.key, set: { value, updatedAt: new Date() } });
}

export async function readConfig(): Promise<BackupConfig> {
  const raw = await readStamp(KEY);
  if (!raw) return DEFAULT_CONFIG;
  try {
    const c = JSON.parse(raw) as Partial<BackupConfig>;
    return {
      enabled: c.enabled === true,
      hour: Number.isInteger(c.hour) && c.hour! >= 0 && c.hour! <= 23 ? c.hour! : DEFAULT_CONFIG.hour,
      retention: normalizeRetention(c.retention ?? {}),
      keepLocal: Math.min(30, Math.max(1, Math.trunc(Number(c.keepLocal)) || DEFAULT_CONFIG.keepLocal)),
      passphrase: typeof c.passphrase === 'string' ? c.passphrase : null,
      destinations: Array.isArray(c.destinations) ? c.destinations : [],
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export async function writeConfig(config: BackupConfig): Promise<void> {
  await writeStamp(KEY, JSON.stringify(config));
}

export function destinationSecrets(d: StoredDestination): DestSecrets {
  const plain = unseal(d.secrets);
  if (!plain) return {};
  try {
    return JSON.parse(plain) as DestSecrets;
  } catch {
    return {};
  }
}

/* ---- وضعیت و تاریخچه ---- */

export interface DestinationResult {
  id: string;
  name: string;
  ok: boolean;
  error?: string;
  /** چند نسخهٔ قدیمی طبقِ سیاستِ نگه‌داری پاک شد. */
  pruned?: number;
}

export interface BackupRun {
  trigger: 'schedule' | 'manual' | 'cli';
  startedAt: string;
  finishedAt: string | null;
  running: boolean;
  ok: boolean | null;
  error?: string;
  file?: string;
  size?: number;
  destinations: DestinationResult[];
}

export async function readStatus(): Promise<BackupRun | null> {
  const raw = await readStamp(STATUS);
  try {
    return raw ? (JSON.parse(raw) as BackupRun) : null;
  } catch {
    return null;
  }
}

export async function writeStatus(run: BackupRun): Promise<void> {
  await writeStamp(STATUS, JSON.stringify(run));
}

export async function readHistory(): Promise<BackupRun[]> {
  const raw = await readStamp(HISTORY);
  try {
    return raw ? (JSON.parse(raw) as BackupRun[]) : [];
  } catch {
    return [];
  }
}

/** ۲۰ اجرای آخر — بیشتر لازم نیست و ردیف را بزرگ نمی‌کند. */
export async function pushHistory(run: BackupRun): Promise<void> {
  const list = [run, ...(await readHistory())].slice(0, 20);
  await writeStamp(HISTORY, JSON.stringify(list));
}

export async function readLastScheduled(): Promise<string | null> {
  return readStamp(SCHEDULED);
}

export async function writeLastScheduled(date: string): Promise<void> {
  await writeStamp(SCHEDULED, date);
}
