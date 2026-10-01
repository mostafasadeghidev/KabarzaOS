import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { auditLog, users } from '@/db/schema';
import type { Actor } from '@/domain/access/permissions';
import { assertOwner } from '@/domain/access/guard';
import { verifyPassword } from '@/domain/auth/password';
import {
  normalizeRetention, validateDestination, type DestinationInput, type Retention,
} from '@/domain/backup/plan';
import {
  BackupKeyError, destinationSecrets, readConfig, readHistory, readStatus, seal, unseal, writeConfig,
} from './config';
import { BackupError, listLocalBackups, localBackupPath, startBackup, testRemote } from './run';

/**
 * پشتیبان‌گیری — رابطِ پنل.
 *
 * ⚠️ فقط مدیرِ کل (`assertOwner`) — نه حتی کسی با `settings.manage`: فایلِ
 * پشتیبان یعنی **همهٔ** داده به‌اضافهٔ رازهای سامانه.
 * ⚠️ هیچ رازی به مرورگر برنمی‌گردد؛ نما فقط «تنظیم شده / نشده» می‌گوید.
 */

export const MIN_PASSPHRASE = 12;

async function audit(actor: Actor, action: string, after?: unknown) {
  await db.insert(auditLog).values({
    actorType: 'user', actorId: actor.id, action, objectType: 'backup', objectId: 0, before: null, after: after ?? null,
  });
}

function keyReady(): boolean {
  return (process.env.BACKUP_KEY ?? '').length >= 32;
}

export async function getBackupView(actor: Actor) {
  assertOwner(actor);
  const [config, status, history, local] = await Promise.all([
    readConfig(), readStatus(), readHistory(), listLocalBackups(),
  ]);
  return {
    keyReady: keyReady(),
    enabled: config.enabled,
    hour: config.hour,
    retention: config.retention,
    keepLocal: config.keepLocal,
    hasPassphrase: keyReady() && unseal(config.passphrase) !== null,
    destinations: config.destinations.map((d) => {
      const s = keyReady() ? destinationSecrets(d) : {};
      return {
        id: d.id, name: d.name, type: d.type, path: d.path, enabled: d.enabled, params: d.params,
        hasSecret: Object.values(s).some(Boolean),
      };
    }),
    status,
    history: history.slice(0, 10),
    local: local.map((b) => ({ name: b.name, size: b.size, at: b.at.toISOString() })),
  };
}

export interface SettingsInput {
  enabled: boolean;
  hour: number;
  retention: Partial<Record<keyof Retention, unknown>>;
  keepLocal: number;
  /** خالی یعنی «همان قبلی». */
  passphrase: string;
}

export class BackupSettingsError extends Error {
  constructor(readonly code: 'weak_passphrase' | 'passphrase_required' | 'key_missing' | 'not_found') {
    super(`backup settings: ${code}`);
    this.name = 'BackupSettingsError';
  }
}

export async function saveBackupSettings(actor: Actor, input: SettingsInput): Promise<void> {
  assertOwner(actor);
  if (!keyReady()) throw new BackupSettingsError('key_missing');
  const config = await readConfig();
  const passphrase = input.passphrase.trim();
  if (passphrase && [...passphrase].length < MIN_PASSPHRASE) throw new BackupSettingsError('weak_passphrase');
  const sealed = passphrase ? seal(passphrase) : config.passphrase;
  // ⚠️ زمان‌بندِ روشن بی‌رمز هر شب بی‌صدا شکست می‌خورد — پس پذیرفته نمی‌شود.
  if (input.enabled && !unseal(sealed)) throw new BackupSettingsError('passphrase_required');

  await writeConfig({
    ...config,
    enabled: input.enabled,
    hour: Number.isInteger(input.hour) && input.hour >= 0 && input.hour <= 23 ? input.hour : config.hour,
    retention: normalizeRetention(input.retention),
    keepLocal: Math.min(30, Math.max(1, Math.trunc(input.keepLocal) || config.keepLocal)),
    passphrase: sealed,
  });
  await audit(actor, 'backup.settings', { enabled: input.enabled, hour: input.hour, passphraseChanged: Boolean(passphrase) });
}

export async function saveDestination(actor: Actor, id: string | null, input: DestinationInput & { enabled: boolean }) {
  assertOwner(actor);
  if (!keyReady()) throw new BackupSettingsError('key_missing');
  const config = await readConfig();
  const existing = id ? config.destinations.find((d) => d.id === id) : undefined;
  if (id && !existing) throw new BackupSettingsError('not_found');
  const valid = validateDestination(input, existing ? destinationSecrets(existing) : {});
  const stored = {
    id: existing?.id ?? randomUUID().slice(0, 8),
    name: valid.name,
    type: valid.type,
    path: valid.path,
    enabled: input.enabled,
    params: valid.params,
    secrets: seal(JSON.stringify(valid.secrets)),
  };
  await writeConfig({
    ...config,
    destinations: existing
      ? config.destinations.map((d) => (d.id === existing.id ? stored : d))
      : [...config.destinations, stored],
  });
  // ⚠️ فقط نام و نوع در گزارشِ فعالیت — نه نشانی، نه کلید.
  await audit(actor, existing ? 'backup.destination.update' : 'backup.destination.create', { name: stored.name, type: stored.type });
  return stored.id;
}

export async function deleteDestination(actor: Actor, id: string): Promise<void> {
  assertOwner(actor);
  const config = await readConfig();
  const target = config.destinations.find((d) => d.id === id);
  if (!target) throw new BackupSettingsError('not_found');
  await writeConfig({ ...config, destinations: config.destinations.filter((d) => d.id !== id) });
  await audit(actor, 'backup.destination.delete', { name: target.name, type: target.type });
}

/** آزمونِ اتصال: پوشه را می‌سازد و فهرست می‌کند — هیچ فایلی نمی‌نویسد. */
export async function testDestination(actor: Actor, id: string): Promise<void> {
  assertOwner(actor);
  if (!keyReady()) throw new BackupSettingsError('key_missing');
  const target = (await readConfig()).destinations.find((d) => d.id === id);
  if (!target) throw new BackupSettingsError('not_found');
  await testRemote(target, destinationSecrets(target));
}

export async function startBackupNow(actor: Actor): Promise<void> {
  assertOwner(actor);
  if (!keyReady()) throw new BackupKeyError();
  const config = await readConfig();
  if (!unseal(config.passphrase)) throw new BackupError('no_passphrase');
  const status = await readStatus();
  if (status?.running && Date.now() - Date.parse(status.startedAt) < 3 * 60 * 60 * 1000) throw new BackupError('busy');
  startBackup('manual', actor.id);
}

/* ------------------------------------------------------------------ *
 * دانلود — فقط با تأییدِ دوبارهٔ رمزِ ورود و پیوندِ کوتاه‌عمر
 * ------------------------------------------------------------------ */

const TOKEN_TTL_MS = 5 * 60 * 1000;

function sign(payload: string): string {
  return createHmac('sha256', process.env.SESSION_SECRET ?? '').update(`backup-download|${payload}`).digest('base64url');
}

export class DownloadError extends Error {
  constructor(readonly code: 'bad_password' | 'not_found') {
    super(`backup download: ${code}`);
    this.name = 'DownloadError';
  }
}

/**
 * ⚠️ چرا رمزِ دوباره: نشستِ بازِ مدیرِ کل (مرورگرِ جاماندهٔ باز، کوکیِ دزدیده)
 * نباید به‌تنهایی کلِ داده را با یک کلیک بیرون ببرد.
 */
export async function issueDownloadToken(actor: Actor, name: string, password: string): Promise<string> {
  assertOwner(actor);
  if (!localBackupPath(name)) throw new DownloadError('not_found');
  const [user] = await db.select({ hash: users.passwordHash }).from(users).where(eq(users.id, actor.id));
  if (!user?.hash || !(await verifyPassword(user.hash, password))) throw new DownloadError('bad_password');
  const exp = Date.now() + TOKEN_TTL_MS;
  const payload = `${actor.id}|${name}|${exp}`;
  return `${Buffer.from(payload).toString('base64url')}.${sign(payload)}`;
}

/** درستیِ پیوند: امضا، انقضا، و همان کاربری که ساختش. */
export function verifyDownloadToken(token: string, actorId: number): string | null {
  const [body, mac] = token.split('.');
  if (!body || !mac) return null;
  const payload = Buffer.from(body, 'base64url').toString('utf8');
  const expected = sign(payload);
  if (expected.length !== mac.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(mac))) return null;
  const [uid, name, exp] = payload.split('|');
  if (Number(uid) !== actorId || Number(exp) < Date.now() || !name) return null;
  return localBackupPath(name) ? name : null;
}

export async function recordDownload(actor: Actor, name: string): Promise<void> {
  await audit(actor, 'backup.download', { file: name });
}
