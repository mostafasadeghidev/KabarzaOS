/**
 * فضای ابری (۳.۴.۰) — قواعدِ خالصِ Nextcloud، بی‌پایگاه‌داده و بی‌شبکه.
 *
 * برنامه با API ِ رسمیِ مدیریتِ کاربرانِ Nextcloud (OCS Provisioning) حساب‌های یک
 * گروه را می‌بیند، می‌سازد، سهمیه‌شان را عوض می‌کند و غیرفعالشان می‌کند. هر سرورِ
 * Nextcloud یک «اتصال» است و می‌شود چند تا داشت.
 */

export interface CloudConnectionInput {
  name: string;
  baseUrl: string;
  username: string;
  groupId: string;
  defaultQuotaGb: number;
  isActive: boolean;
}

export type CloudInputProblem = 'name' | 'url' | 'username' | 'group' | 'quota';

/** سقفِ سهمیه به گیگابایت — هم برای پیش‌فرضِ اتصال و هم برای هر حساب. */
export const MAX_QUOTA_GB = 10000;

/**
 * نشانیِ پایهٔ Nextcloud، مثلِ `https://cloud.example.com` یا `https://example.com/nextcloud`.
 *
 * ⚠️ فقط https — رمزِ برنامه با هر درخواست فرستاده می‌شود. http فقط برای localhost
 * و فقط بیرون از production (سرورِ ساختگیِ آزمون). نام‌کاربری/رمز در نشانی، query و
 * hash رد می‌شوند؛ `/index.php` و `/` ِ آخر برداشته می‌شوند.
 */
export function normalizeBaseUrl(raw: string, allowLocalHttp = false): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local && allowLocalHttp)) return null;
  if (url.username || url.password || url.search || url.hash) return null;
  const path = url.pathname.replace(/\/index\.php\/?$/, '').replace(/\/+$/, '');
  return `${url.origin}${path}`;
}

/** شناسهٔ کاربر یا گروه در Nextcloud: حرف، رقم، فاصله و `_ . @ - '`. */
const NC_ID = /^[A-Za-z0-9 _.@'-]{1,64}$/;

export function normalizeConnectionInput(
  input: Record<string, unknown>, allowLocalHttp = false,
): { value: CloudConnectionInput; problems: CloudInputProblem[] } {
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const name = str(input.name).slice(0, 60);
  const baseUrl = normalizeBaseUrl(str(input.baseUrl), allowLocalHttp);
  const username = str(input.username);
  const groupId = str(input.groupId);
  const quota = Number(str(input.defaultQuotaGb) || input.defaultQuotaGb);
  const problems: CloudInputProblem[] = [];
  if (!name) problems.push('name');
  if (!baseUrl) problems.push('url');
  if (!NC_ID.test(username)) problems.push('username');
  if (!NC_ID.test(groupId)) problems.push('group');
  if (!Number.isInteger(quota) || quota < 1 || quota > MAX_QUOTA_GB) problems.push('quota');
  return {
    value: {
      name, baseUrl: baseUrl ?? '', username, groupId,
      defaultQuotaGb: Number.isInteger(quota) ? quota : 10,
      isActive: input.isActive === true || input.isActive === 'on' || input.isActive === 'true',
    },
    problems,
  };
}

/** شناسهٔ حسابِ تازه: حروفِ کوچکِ لاتین، رقم، نقطه، خط تیره و زیرخط؛ ۲ تا ۳۲ نویسه. */
export function cloudUserIdProblem(id: string): boolean {
  return !/^[a-z0-9][a-z0-9._-]{1,31}$/.test(id);
}

export interface CloudAccount {
  id: string;
  displayName: string;
  email: string;
  enabled: boolean;
  usedBytes: number;
  /** `null` = بی‌سقف. */
  quotaBytes: number | null;
  /** آخرین ورود (میلی‌ثانیه)؛ `null` = هرگز. */
  lastLogin: number | null;
  groups: string[];
}

const num = (v: unknown): number | null => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};

/**
 * جزئیاتِ یک کاربر از پاسخِ OCS (`cloud/users/{id}` یا `.../users/details`).
 *
 * ⚠️ سهمیه: عددِ منفی (۳-) یا `none` یعنی بی‌سقف. کاربری که هرگز وارد نشده گاهی فقط
 * `quota` دارد و `used` ندارد ← صفر.
 */
export function parseCloudUser(raw: unknown): CloudAccount | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const id = typeof r.id === 'string' ? r.id : '';
  if (!id) return null;
  const q = (r.quota && typeof r.quota === 'object' ? r.quota : {}) as Record<string, unknown>;
  const quota = num(q.quota);
  const last = num(r.lastLogin);
  return {
    id,
    displayName: typeof r.displayname === 'string' ? r.displayname
      : typeof r['display-name'] === 'string' ? (r['display-name'] as string) : id,
    email: typeof r.email === 'string' ? r.email : '',
    enabled: r.enabled !== false && r.enabled !== 'false',
    usedBytes: Math.max(0, num(q.used) ?? 0),
    quotaBytes: quota !== null && quota >= 0 ? quota : null,
    lastLogin: last && last > 0 ? last : null,
    groups: Array.isArray(r.groups) ? r.groups.filter((g): g is string => typeof g === 'string') : [],
  };
}

/** فهرستِ کاربرها — Nextcloud شیءِ id→جزئیات می‌دهد، و برای idهای عددی گاهی آرایه. */
export function parseCloudUsers(data: unknown): CloudAccount[] {
  const users = data && typeof data === 'object' ? (data as Record<string, unknown>).users : null;
  const list = Array.isArray(users) ? users : users && typeof users === 'object' ? Object.values(users) : [];
  return list.map(parseCloudUser).filter((a): a is CloudAccount => a !== null);
}

/**
 * پاکتِ OCS: `{ ocs: { meta: { statuscode, message }, data } }`. موفق = ۱۰۰ (v1) یا ۲۰۰ (v2).
 * `null` یعنی پاسخ شکلِ OCS نداشت.
 */
export function ocsEnvelope(json: unknown): { ok: boolean; statuscode: number; message: string; data: unknown } | null {
  const ocs = json && typeof json === 'object' ? (json as Record<string, unknown>).ocs : null;
  if (!ocs || typeof ocs !== 'object') return null;
  const meta = ((ocs as Record<string, unknown>).meta ?? {}) as Record<string, unknown>;
  const statuscode = num(meta.statuscode) ?? 0;
  return {
    ok: statuscode === 100 || statuscode === 200,
    statuscode,
    message: typeof meta.message === 'string' ? meta.message.slice(0, 200) : '',
    data: (ocs as Record<string, unknown>).data,
  };
}

/**
 * عضوی که احتمالاً صاحبِ این حساب است: شناسه برابرِ نامِ کاربری یا بخشِ پیش از @ ِ
 * ایمیلش، یا نامِ نمایشی برابرِ نامش. فقط اگر دقیقاً یکی بخورد — حدسِ دوپهلو بدتر از هیچ.
 */
export function suggestCloudMember(
  account: Pick<CloudAccount, 'id' | 'displayName' | 'email'>,
  people: Array<{ id: number; name: string; email: string; username: string | null }>,
): number | null {
  const id = account.id.toLowerCase();
  const display = account.displayName.trim().toLowerCase();
  const mail = account.email.trim().toLowerCase();
  const hits = people.filter((p) => {
    const local = p.email.toLowerCase().split('@')[0] ?? '';
    return (p.username && p.username.toLowerCase() === id)
      || local === id
      || (mail !== '' && p.email.toLowerCase() === mail)
      || (display !== '' && p.name.trim().toLowerCase() === display);
  });
  return hits.length === 1 ? hits[0]!.id : null;
}

/** پیشنهادِ شناسه برای حسابِ تازه از روی نامِ کاربری یا ایمیلِ عضو. */
export function suggestCloudUserId(person: { email: string; username: string | null }): string {
  const base = (person.username || person.email.split('@')[0] || '').toLowerCase().replace(/[^a-z0-9._-]/g, '');
  return base.replace(/^[._-]+/, '').slice(0, 32);
}
