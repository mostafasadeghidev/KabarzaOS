'use server';

import { revalidatePath } from 'next/cache';
import { requireActor } from '@/server/auth';
import { ForbiddenError } from '@/domain/access/guard';
import { DestinationError } from '@/domain/backup/plan';
import { BackupKeyError } from '@/server/backup/config';
import { BackupError } from '@/server/backup/run';
import {
  BackupSettingsError, deleteDestination, DownloadError, issueDownloadToken, saveBackupSettings, saveDestination,
  startBackupNow, testDestination,
} from '@/server/backup/service';

/** اقدام‌های پشتیبان‌گیری. گاردِ «فقط مالک» در سرویس است (R-ARCH-01). */

export interface BackupState {
  error?: string;
  message?: string;
  /** پیوندِ دانلودِ کوتاه‌عمر، پس از تأییدِ رمز. */
  download?: string;
}

const MESSAGES: Record<string, string> = {
  // تنظیمات
  weak_passphrase: 'رمزِ پشتیبان دست‌کم ۱۲ نویسه باشد.',
  passphrase_required: 'برای روشن‌کردنِ پشتیبانِ خودکار اول رمزِ پشتیبان را تعیین کنید.',
  key_missing: 'کلیدِ پشتیبان (BACKUP_KEY) روی سرور نیست؛ کانتینرِ اپ را دوباره بسازید.',
  not_found: 'پیدا نشد.',
  // مقصد
  name_required: 'نامِ مقصد لازم است.',
  bad_type: 'نوعِ مقصد معتبر نیست.',
  endpoint_required: 'نشانیِ سرویس (Endpoint) لازم است.',
  bucket_required: 'نامِ سطل (Bucket) لازم است.',
  keys_required: 'کلیدِ دسترسی و کلیدِ مخفی هر دو لازم‌اند.',
  host_required: 'نشانیِ سرور لازم است.',
  user_required: 'نامِ کاربری و رمز هر دو لازم‌اند.',
  url_required: 'نشانیِ WebDAV باید با http:// یا https:// شروع شود.',
  token_required: 'توکن معتبر نیست؛ خروجیِ کاملِ rclone authorize را بچسبانید.',
  raw_required: 'متنِ پیکربندیِ rclone لازم است.',
  bad_raw: 'پیکربندیِ rclone خوانا نیست؛ باید خطِ type = … داشته باشد.',
  bad_path: 'مسیرِ پوشه معتبر نیست.',
  // اجرا
  no_passphrase: 'اول رمزِ پشتیبان را تعیین کنید.',
  busy: 'یک پشتیبان‌گیری در جریان است؛ کمی بعد دوباره امتحان کنید.',
  // دانلود
  bad_password: 'رمزِ ورود درست نیست.',
};

function explain(error: unknown, fallback: string): string {
  if (error instanceof ForbiddenError) return 'فقط مدیرِ کل.';
  if (error instanceof BackupKeyError) return MESSAGES.key_missing!;
  if (error instanceof BackupSettingsError || error instanceof DestinationError || error instanceof DownloadError) {
    return MESSAGES[error.code] ?? fallback;
  }
  if (error instanceof BackupError) {
    // ⚠️ خطای ابزار (rclone/pg_dump) همان پیامِ خودش است — همان چیزی که برای رفعش لازم است.
    return error.code === 'tool_failed' ? error.message : (MESSAGES[error.code] ?? fallback);
  }
  return fallback;
}

const refresh = () => revalidatePath('/settings');

export async function saveBackupSettingsAction(_prev: BackupState, form: FormData): Promise<BackupState> {
  try {
    await saveBackupSettings(await requireActor(), {
      enabled: form.get('enabled') !== null,
      hour: Number(form.get('hour')),
      retention: { daily: form.get('daily'), weekly: form.get('weekly'), monthly: form.get('monthly') },
      keepLocal: Number(form.get('keepLocal')),
      passphrase: String(form.get('passphrase') ?? ''),
    });
  } catch (error) {
    return { error: explain(error, 'ذخیره نشد.') };
  }
  refresh();
  return { message: 'تنظیماتِ پشتیبان ذخیره شد.' };
}

const PARAM_KEYS = ['provider', 'endpoint', 'region', 'bucket', 'accessKeyId', 'host', 'port', 'user', 'url', 'vendor'];
const SECRET_KEYS = ['secretAccessKey', 'password', 'token', 'rawConfig'];

export async function saveDestinationAction(_prev: BackupState, form: FormData): Promise<BackupState> {
  try {
    const pick = (keys: string[]) => Object.fromEntries(keys.map((k) => [k, form.get(k) ?? '']));
    await saveDestination(await requireActor(), String(form.get('id') ?? '') || null, {
      name: form.get('name'),
      type: form.get('type'),
      path: form.get('path'),
      enabled: form.get('enabled') !== null,
      params: pick(PARAM_KEYS),
      secrets: pick(SECRET_KEYS),
    });
  } catch (error) {
    return { error: explain(error, 'مقصد ذخیره نشد.') };
  }
  refresh();
  return { message: 'مقصد ذخیره شد.' };
}

export async function deleteDestinationAction(id: string): Promise<BackupState> {
  try {
    await deleteDestination(await requireActor(), id);
  } catch (error) {
    return { error: explain(error, 'حذف نشد.') };
  }
  refresh();
  return { message: 'مقصد حذف شد.' };
}

export async function testDestinationAction(id: string): Promise<BackupState> {
  try {
    await testDestination(await requireActor(), id);
  } catch (error) {
    return { error: explain(error, 'اتصال برقرار نشد.') };
  }
  return { message: 'اتصال برقرار است.' };
}

export async function startBackupAction(): Promise<BackupState> {
  try {
    await startBackupNow(await requireActor());
  } catch (error) {
    return { error: explain(error, 'پشتیبان‌گیری شروع نشد.') };
  }
  refresh();
  return { message: 'پشتیبان‌گیری شروع شد؛ چند دقیقه طول می‌کشد.' };
}

export async function downloadBackupAction(_prev: BackupState, form: FormData): Promise<BackupState> {
  try {
    const name = String(form.get('name') ?? '');
    const token = await issueDownloadToken(await requireActor(), name, String(form.get('password') ?? ''));
    return { download: `/api/backup/download?token=${encodeURIComponent(token)}` };
  } catch (error) {
    return { error: explain(error, 'دانلود آماده نشد.') };
  }
}
