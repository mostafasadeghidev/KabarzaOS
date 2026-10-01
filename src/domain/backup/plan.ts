/**
 * پشتیبان‌گیری — قاعده‌های خالص (بی‌دیتابیس، بی‌شبکه، آزمودنی).
 *
 * یک پشتیبان = یک فایلِ رمزگذاری‌شده با همه‌چیزِ لازم برای برگرداندنِ سامانه
 * روی سرورِ دیگر: دیتابیس، فایل‌های انبار، رازهای داخلی و تنظیماتِ محیط.
 * فایل روی خودِ سرور ساخته می‌شود و با rclone به هر تعداد مقصد فرستاده می‌شود.
 */

export const BACKUP_PREFIX = 'kabarzaos-';
export const BACKUP_EXT = '.kbzbak';

const pad = (n: number) => String(n).padStart(2, '0');

/** `kabarzaos-2026-10-01-030000.kbzbak` — زمان به UTC تا مرتب‌سازیِ متنی همان مرتب‌سازیِ زمانی باشد. */
export function backupFileName(at: Date): string {
  return `${BACKUP_PREFIX}${at.getUTCFullYear()}-${pad(at.getUTCMonth() + 1)}-${pad(at.getUTCDate())}`
    + `-${pad(at.getUTCHours())}${pad(at.getUTCMinutes())}${pad(at.getUTCSeconds())}${BACKUP_EXT}`;
}

const NAME_RE = /^kabarzaos-(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})(\d{2})\.kbzbak$/;

/**
 * ⚠️ فقط فایلی که دقیقاً این الگو را دارد «مالِ ماست». نگه‌داری و حذف فقط
 * روی همین‌ها کار می‌کند — هر فایلِ دیگری در پوشهٔ مقصد هرگز پاک نمی‌شود.
 */
export function parseBackupName(name: string): Date | null {
  const m = NAME_RE.exec(name);
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m.map(Number) as number[];
  const at = new Date(Date.UTC(y!, mo! - 1, d!, h!, mi!, s!));
  return Number.isNaN(at.getTime()) ? null : at;
}

export interface Retention {
  /** چند روزِ آخر، از هر روز یک نسخه. */
  daily: number;
  /** چند هفتهٔ آخر، از هر هفته یک نسخه. */
  weekly: number;
  /** چند ماهِ آخر، از هر ماه یک نسخه. */
  monthly: number;
}

export const DEFAULT_RETENTION: Retention = { daily: 7, weekly: 4, monthly: 3 };

export function normalizeRetention(input: Partial<Record<keyof Retention, unknown>>): Retention {
  const clamp = (v: unknown, d: number, max: number) => {
    const n = Math.trunc(Number(v));
    return Number.isFinite(n) && n >= 0 ? Math.min(n, max) : d;
  };
  const r = {
    daily: clamp(input.daily, DEFAULT_RETENTION.daily, 90),
    weekly: clamp(input.weekly, DEFAULT_RETENTION.weekly, 52),
    monthly: clamp(input.monthly, DEFAULT_RETENTION.monthly, 36),
  };
  // ⚠️ همه صفر یعنی «هیچ‌چیز نگه ندار» — پشتیبانی که بلافاصله پاک شود بی‌معناست.
  return r.daily + r.weekly + r.monthly === 0 ? { ...r, daily: 1 } : r;
}

/** کلیدِ هفتهٔ ISO (دوشنبه‌آغاز) — برای «یکی از هر هفته». */
function isoWeekKey(at: Date): string {
  const d = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${week}`;
}

/**
 * نگه‌داریِ پله‌ای (پدربزرگ–پدر–پسر): تازه‌ترینِ هر روز برای `daily` روزِ
 * اخیرِ دارای پشتیبان، تازه‌ترینِ هر هفته برای `weekly` هفته، و هر ماه برای
 * `monthly` ماه. تازه‌ترین پشتیبان همیشه می‌ماند. خروجی: نام‌هایی که **می‌مانند**.
 * نام‌های بیگانه (نه با الگوی ما) در ورودی نادیده گرفته می‌شوند و در خروجی هم نیستند —
 * فراخوان فقط از میانِ نام‌های خودمان پاک می‌کند.
 */
export function keepSet(names: readonly string[], policy: Retention): Set<string> {
  const ours = names
    .map((name) => ({ name, at: parseBackupName(name) }))
    .filter((x): x is { name: string; at: Date } => x.at !== null)
    .sort((a, b) => b.at.getTime() - a.at.getTime());
  const keep = new Set<string>();
  if (ours.length === 0) return keep;
  keep.add(ours[0]!.name);

  const bucket = (count: number, key: (at: Date) => string) => {
    const seen = new Set<string>();
    for (const b of ours) {
      const k = key(b.at);
      if (seen.has(k)) continue;
      if (seen.size >= count) break;
      seen.add(k);
      keep.add(b.name);
    }
  };
  bucket(policy.daily, (at) => at.toISOString().slice(0, 10));
  bucket(policy.weekly, isoWeekKey);
  bucket(policy.monthly, (at) => at.toISOString().slice(0, 7));
  return keep;
}

/**
 * زمان‌بندِ روزانه: آیا الان وقتِ پشتیبانِ امروز است؟ ساعتِ محلیِ سامانه
 * به ساعتِ انتخاب‌شده رسیده و امروز هنوز اجرا نشده.
 */
export function scheduledDue(input: {
  enabled: boolean;
  hour: number;
  lastRunDate: string | null;
  localDate: string;
  localHour: number;
}): boolean {
  if (!input.enabled) return false;
  if (input.lastRunDate === input.localDate) return false;
  return input.localHour >= input.hour;
}

/* ------------------------------------------------------------------ *
 * مقصدها
 * ------------------------------------------------------------------ */

export const DEST_TYPES = ['s3', 'sftp', 'webdav', 'drive', 'dropbox', 'rclone'] as const;
export type DestType = (typeof DEST_TYPES)[number];

export const DEST_LABELS: Record<DestType, string> = {
  s3: 'فضای S3 (Amazon، Hetzner، آروان، Cloudflare R2، Backblaze، …)',
  sftp: 'SFTP (Hetzner Storage Box، سرورِ دیگر)',
  webdav: 'WebDAV (Nextcloud، ownCloud، …)',
  drive: 'Google Drive',
  dropbox: 'Dropbox',
  rclone: 'پیکربندیِ پیشرفتهٔ rclone (OneDrive، pCloud، Mega، Box، …)',
};

export const S3_PROVIDERS = ['AWS', 'Cloudflare', 'Wasabi', 'Other'] as const;

/** فیلدهای غیرِمحرمانهٔ هر نوع — در تنظیمات به‌صورتِ متنِ عادی می‌مانند. */
export interface DestParams {
  provider?: string;
  endpoint?: string;
  region?: string;
  bucket?: string;
  host?: string;
  port?: string;
  user?: string;
  url?: string;
  vendor?: string;
  accessKeyId?: string;
}

/** فیلدهای محرمانه — رمزگذاری‌شده نگه داشته می‌شوند و هرگز به مرورگر برنمی‌گردند. */
export interface DestSecrets {
  secretAccessKey?: string;
  /** رمزِ SFTP/WebDAV — پیش از رسیدن به rclone «obscure» می‌شود. */
  password?: string;
  /** توکنِ JSON ِ `rclone authorize` برای Drive/Dropbox. */
  token?: string;
  /** متنِ خامِ یک بخشِ rclone.conf برای نوعِ پیشرفته. */
  rawConfig?: string;
}

export class DestinationError extends Error {
  constructor(readonly code:
    | 'name_required' | 'bad_type' | 'endpoint_required' | 'bucket_required' | 'keys_required'
    | 'host_required' | 'user_required' | 'url_required' | 'token_required' | 'raw_required' | 'bad_raw'
    | 'bad_path') {
    super(`backup destination: ${code}`);
    this.name = 'DestinationError';
  }
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

/**
 * مسیرِ پوشه در مقصد. ⚠️ نه `..` و نه مسیرِ مطلق — پوشه زیرِ ریشهٔ همان
 * مقصد می‌ماند. خالی یعنی ریشه.
 */
export function normalizePath(raw: unknown): string {
  const path = str(raw).replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').replace(/\/{2,}/g, '/');
  if (path.split('/').some((seg) => seg === '..' || seg === '.')) throw new DestinationError('bad_path');
  return path.slice(0, 300);
}

/**
 * متنِ خامِ rclone.conf ← کلید/مقدار. خطِ `[name]`، توضیح (`#`/`;`) و خطِ
 * خالی نادیده؛ کلید فقط حرف/رقم/زیرخط. بی‌`type` پذیرفته نمی‌شود.
 */
export function parseRawConfig(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#') || t.startsWith(';') || (t.startsWith('[') && t.endsWith(']'))) continue;
    const eq = t.indexOf('=');
    if (eq <= 0) throw new DestinationError('bad_raw');
    const key = t.slice(0, eq).trim().toLowerCase();
    if (!/^[a-z0-9_]+$/.test(key)) throw new DestinationError('bad_raw');
    out[key] = t.slice(eq + 1).trim();
  }
  if (!out.type) throw new DestinationError('bad_raw');
  return out;
}

export interface DestinationInput {
  name: unknown;
  type: unknown;
  path: unknown;
  params: Record<string, unknown>;
  /** فیلدِ محرمانهٔ خالی یعنی «دست نزن» (مقدارِ قبلی بماند). */
  secrets: Record<string, unknown>;
}

/**
 * اعتبارسنجی. `previous` رازهای ذخیره‌شدهٔ قبلی است: فیلدِ محرمانهٔ خالی در
 * فرمِ ویرایش یعنی «همان قبلی»، نه «پاکش کن» — مثلِ توکنِ تلگرام.
 */
export function validateDestination(input: DestinationInput, previous: DestSecrets = {}) {
  const name = str(input.name).slice(0, 80);
  if (!name) throw new DestinationError('name_required');
  const type = str(input.type) as DestType;
  if (!(DEST_TYPES as readonly string[]).includes(type)) throw new DestinationError('bad_type');
  const path = normalizePath(input.path);
  const p = input.params;
  const fresh = (k: keyof DestSecrets) => str(input.secrets[k]) || previous[k] || '';

  let params: DestParams = {};
  let secrets: DestSecrets = {};
  switch (type) {
    case 's3': {
      const provider = (S3_PROVIDERS as readonly string[]).includes(str(p.provider)) ? str(p.provider) : 'Other';
      params = {
        provider,
        endpoint: str(p.endpoint),
        region: str(p.region),
        bucket: str(p.bucket),
        accessKeyId: str(p.accessKeyId),
      };
      secrets = { secretAccessKey: fresh('secretAccessKey') };
      if (provider !== 'AWS' && !params.endpoint) throw new DestinationError('endpoint_required');
      if (!params.bucket) throw new DestinationError('bucket_required');
      if (!params.accessKeyId || !secrets.secretAccessKey) throw new DestinationError('keys_required');
      break;
    }
    case 'sftp': {
      params = { host: str(p.host), port: str(p.port) || '22', user: str(p.user) };
      secrets = { password: fresh('password') };
      if (!params.host) throw new DestinationError('host_required');
      if (!params.user || !secrets.password) throw new DestinationError('user_required');
      break;
    }
    case 'webdav': {
      const vendor = ['nextcloud', 'owncloud', 'other'].includes(str(p.vendor)) ? str(p.vendor) : 'other';
      params = { url: str(p.url), vendor, user: str(p.user) };
      secrets = { password: fresh('password') };
      if (!/^https?:\/\//i.test(params.url ?? '')) throw new DestinationError('url_required');
      if (!params.user || !secrets.password) throw new DestinationError('user_required');
      break;
    }
    case 'drive':
    case 'dropbox': {
      secrets = { token: fresh('token') };
      if (!secrets.token) throw new DestinationError('token_required');
      try {
        const parsed = JSON.parse(secrets.token) as { access_token?: string; refresh_token?: string };
        if (!parsed.access_token && !parsed.refresh_token) throw new Error('empty');
      } catch {
        throw new DestinationError('token_required');
      }
      break;
    }
    case 'rclone': {
      secrets = { rawConfig: fresh('rawConfig') };
      if (!secrets.rawConfig) throw new DestinationError('raw_required');
      parseRawConfig(secrets.rawConfig);
      break;
    }
  }
  return { name, type, path, params, secrets };
}

/**
 * تنظیمِ rclone از راهِ متغیرهای محیطی (`RCLONE_CONFIG_<REMOTE>_<KEY>`) —
 * هیچ فایلِ rclone.conf ای روی دیسک نوشته نمی‌شود و هیچ رازی در خطِ فرمان
 * (که در فهرستِ پردازه‌ها دیده می‌شود) نمی‌آید.
 * `obscured` رمزِ از پیش «obscure»‌شده است (کارِ خودِ rclone، نه رمزنگاری).
 */
export function rcloneEnv(
  remote: string,
  dest: { type: DestType; params: DestParams; secrets: DestSecrets },
  obscured: string | null,
): Record<string, string> {
  const R = remote.toUpperCase();
  const env: Record<string, string> = {};
  const set = (k: string, v: string | undefined) => { if (v) env[`RCLONE_CONFIG_${R}_${k.toUpperCase()}`] = v; };
  const { params: p, secrets: s } = dest;
  switch (dest.type) {
    case 's3':
      set('type', 's3');
      set('provider', p.provider);
      set('endpoint', p.endpoint);
      set('region', p.region);
      set('access_key_id', p.accessKeyId);
      set('secret_access_key', s.secretAccessKey);
      // ⚠️ بی‌این، rclone برای سطلِ موجود هم «CreateBucket» می‌فرستد و کلیدِ محدود رد می‌شود.
      set('no_check_bucket', 'true');
      break;
    case 'sftp':
      set('type', 'sftp');
      set('host', p.host);
      set('port', p.port);
      set('user', p.user);
      set('pass', obscured ?? undefined);
      break;
    case 'webdav':
      set('type', 'webdav');
      set('url', p.url);
      set('vendor', p.vendor);
      set('user', p.user);
      set('pass', obscured ?? undefined);
      break;
    case 'drive':
      set('type', 'drive');
      set('scope', 'drive');
      set('token', s.token);
      break;
    case 'dropbox':
      set('type', 'dropbox');
      set('token', s.token);
      break;
    case 'rclone':
      for (const [k, v] of Object.entries(parseRawConfig(s.rawConfig ?? ''))) set(k, v);
      break;
  }
  return env;
}

/** نشانیِ پوشهٔ مقصد برای rclone — S3 سطل را در مسیر دارد. */
export function remoteDir(remote: string, dest: { type: DestType; params: DestParams }, path: string): string {
  const parts = dest.type === 's3' ? [dest.params.bucket, path] : [path];
  return `${remote}:${parts.filter(Boolean).join('/')}`;
}

/**
 * خلاصهٔ خوانای stderr ِ یک ابزار برای نمایش به مدیر.
 *
 * rclone هر تلاش را با تاریخ و «Attempt 2/3 failed…» تکرار می‌کند؛ خروجیِ خام
 * در کارتِ وضعیت چند سطرِ یکسان با شناسه‌های درخواست می‌شد. این تابع پیشوندِ
 * زمان و سطح و شناسه‌ها را برمی‌دارد و آخرین خطا را نگه می‌دارد.
 */
export function tidyToolError(stderr: string, max = 300): string {
  const lines = stderr.split('\n')
    .filter((l) => !/^\S+ \S+\s+NOTICE\b/.test(l))
    .map((l) => l
      .replace(/^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}\s+(?:[A-Z]+\s*:\s*)?/, '')
      .replace(/^Attempt \d+\/\d+ failed with \d+ errors? and:\s*/, '')
      .replace(/,?\s*(?:RequestID|HostID): [^,]*/g, '')
      .trim())
    .filter(Boolean);
  return (lines.at(-1) ?? '').slice(0, max);
}
