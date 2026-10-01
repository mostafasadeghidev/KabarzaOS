import { describe, it, expect } from 'vitest';
import {
  backupFileName, DestinationError, keepSet, normalizePath, normalizeRetention, parseBackupName,
  parseRawConfig, rcloneEnv, remoteDir, scheduledDue, tidyToolError, validateDestination,
} from './plan';

describe('نامِ فایل', () => {
  it('رفت و برگشت', () => {
    const at = new Date('2026-10-01T03:04:05Z');
    const name = backupFileName(at);
    expect(name).toBe('kabarzaos-2026-10-01-030405.kbzbak');
    expect(parseBackupName(name)?.toISOString()).toBe(at.toISOString());
  });

  it('فایلِ بیگانه «مالِ ما» نیست', () => {
    expect(parseBackupName('notes.txt')).toBeNull();
    expect(parseBackupName('kabarzaos-2026-10-01.kbzbak')).toBeNull();
    expect(parseBackupName('../kabarzaos-2026-10-01-030405.kbzbak')).toBeNull();
  });
});

describe('نگه‌داریِ پله‌ای', () => {
  const daysBack = (n: number, hour = 3) => backupFileName(new Date(Date.UTC(2026, 9, 1, hour) - n * 86_400_000));

  it('تازه‌ترین همیشه می‌ماند، حتی با سیاستِ حداقلی', () => {
    const names = [daysBack(0), daysBack(1), daysBack(2)];
    expect([...keepSet(names, { daily: 1, weekly: 0, monthly: 0 })]).toEqual([daysBack(0)]);
  });

  it('۷ روزانه + هفتگی + ماهانه از ۹۰ روز پشتیبان', () => {
    const names = Array.from({ length: 90 }, (_, i) => daysBack(i));
    const keep = keepSet(names, { daily: 7, weekly: 4, monthly: 3 });
    for (let i = 0; i < 7; i++) expect(keep.has(daysBack(i))).toBe(true);
    expect(keep.has(daysBack(89))).toBe(false);
    expect(keep.size).toBeGreaterThanOrEqual(7);
    expect(keep.size).toBeLessThanOrEqual(14);
  });

  it('دو پشتیبانِ یک روز: فقط تازه‌ترش از سهمِ روزانه', () => {
    const names = [daysBack(0, 3), daysBack(0, 1), daysBack(1)];
    const keep = keepSet(names, { daily: 2, weekly: 0, monthly: 0 });
    expect(keep.has(daysBack(0, 1))).toBe(false);
    expect(keep.has(daysBack(1))).toBe(true);
  });

  it('فایلِ بیگانه نه نگه داشته می‌شود نه شمرده', () => {
    const keep = keepSet(['readme.txt', daysBack(0)], { daily: 7, weekly: 0, monthly: 0 });
    expect([...keep]).toEqual([daysBack(0)]);
  });

  it('همه صفر → دست‌کم یکی', () => {
    expect(normalizeRetention({ daily: 0, weekly: 0, monthly: 0 }).daily).toBe(1);
  });
});

describe('زمان‌بند', () => {
  const base = { enabled: true, hour: 3, lastRunDate: '2026-09-30', localDate: '2026-10-01', localHour: 3 };
  it('سرِ ساعت و یک بار در روز', () => {
    expect(scheduledDue(base)).toBe(true);
    expect(scheduledDue({ ...base, localHour: 2 })).toBe(false);
    expect(scheduledDue({ ...base, lastRunDate: '2026-10-01' })).toBe(false);
    expect(scheduledDue({ ...base, enabled: false })).toBe(false);
  });
});

describe('مقصدها', () => {
  it('مسیرِ پوشه از ریشهٔ مقصد بیرون نمی‌رود', () => {
    expect(normalizePath('/backups/kabarza/')).toBe('backups/kabarza');
    expect(() => normalizePath('a/../../etc')).toThrow(DestinationError);
  });

  it('S3 بی‌endpoint فقط برای AWS', () => {
    const input = (provider: string) => ({
      name: 'h', type: 's3', path: 'kbz',
      params: { provider, bucket: 'b', accessKeyId: 'k' }, secrets: { secretAccessKey: 's' },
    });
    expect(() => validateDestination(input('Other'))).toThrow(DestinationError);
    expect(validateDestination(input('AWS')).params.provider).toBe('AWS');
  });

  it('رازِ خالی در ویرایش یعنی همان قبلی', () => {
    const d = validateDestination(
      { name: 'box', type: 'sftp', path: '', params: { host: 'h', user: 'u' }, secrets: { password: '' } },
      { password: 'old' },
    );
    expect(d.secrets.password).toBe('old');
  });

  it('توکنِ نامعتبرِ Drive رد می‌شود', () => {
    expect(() => validateDestination({ name: 'g', type: 'drive', path: '', params: {}, secrets: { token: 'abc' } }))
      .toThrow(DestinationError);
  });

  it('پیکربندیِ خامِ rclone', () => {
    const raw = '[od]\ntype = onedrive\ntoken = {"access_token":"x"}\ndrive_id = 123\n# note';
    expect(parseRawConfig(raw)).toEqual({ type: 'onedrive', token: '{"access_token":"x"}', drive_id: '123' });
    expect(() => parseRawConfig('drive_id = 1')).toThrow(DestinationError);
  });

  it('متغیرهای محیطیِ rclone — رازها در env، نه در خطِ فرمان', () => {
    const env = rcloneEnv('d1', {
      type: 's3', params: { provider: 'Other', endpoint: 'https://e', bucket: 'b', accessKeyId: 'k' },
      secrets: { secretAccessKey: 's' },
    }, null);
    expect(env.RCLONE_CONFIG_D1_TYPE).toBe('s3');
    expect(env.RCLONE_CONFIG_D1_SECRET_ACCESS_KEY).toBe('s');
    expect(remoteDir('d1', { type: 's3', params: { bucket: 'b' } }, 'kbz')).toBe('d1:b/kbz');
    expect(remoteDir('d1', { type: 'sftp', params: {} }, '')).toBe('d1:');
  });
});

describe('خلاصهٔ خطای ابزار', () => {
  it('پیشوندِ زمان، تکرارِ تلاش و شناسه‌ها حذف می‌شوند', () => {
    const stderr = [
      '2026/10/01 19:30:24 NOTICE: Config file "/x/rclone.conf" not found - using defaults',
      '2026/10/01 19:30:24 ERROR : Attempt 2/3 failed with 1 errors and: operation error S3: HeadObject, https response error StatusCode: 403, RequestID: 18DA7E, HostID: dd90, api error Forbidden: Forbidden',
      '2026/10/01 19:30:24 ERROR : Attempt 3/3 failed with 1 errors and: operation error S3: HeadObject, https response error StatusCode: 403, RequestID: 18DA7F, HostID: dd91, api error Forbidden: Forbidden',
      '2026/10/01 19:30:24 Failed to copy: operation error S3: HeadObject, https response error StatusCode: 403, RequestID: 18DA80, HostID: dd92, api error Forbidden: Forbidden',
      '',
    ].join('\n');
    expect(tidyToolError(stderr)).toBe('Failed to copy: operation error S3: HeadObject, https response error StatusCode: 403, api error Forbidden: Forbidden');
  });
  it('خطای سادهٔ بی‌پیشوند دست‌نخورده می‌ماند و خالی، خالی', () => {
    expect(tidyToolError('pg_dump: error: connection refused\n')).toBe('pg_dump: error: connection refused');
    expect(tidyToolError('')).toBe('');
    expect(tidyToolError('x'.repeat(500)).length).toBe(300);
  });
});
