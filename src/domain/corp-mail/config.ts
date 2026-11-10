/**
 * ایمیلِ شرکتی (۲.۵۹.۰) — قواعدِ خالص، بی‌پایگاه‌داده و بی‌شبکه.
 *
 * KabarzaOS حسابِ ایمیلِ کارمندان را روی سرورِ Stalwart می‌سازد، جفت می‌کند و
 * می‌بندد. نشانی و کلیدِ API از env می‌آیند (`STALWART_URL`، `STALWART_API_KEY`)؛
 * اینجا فقط تنظیماتی است که مالک در پنل عوض می‌کند.
 *
 * ⚠️ «نام‌های رزرو» حیاتی‌اند: نشانی‌هایی مثلِ `contact@` صندوقِ Google دارند و
 * ساختنِ حسابِ هم‌نام در Stalwart ایمیلِ آنها را می‌دزدد.
 */

export interface CorpMailConfig {
  /** دامنهٔ نشانی‌ها، مثلِ `example.com`. شناسهٔ Stalwart از روی همین پیدا می‌شود. */
  domain: string;
  /** سهمیهٔ حسابِ تازه به گیگابایت. */
  quotaGb: number;
  /** بخشِ پیش از @ که هرگز ساخته نمی‌شود (حساب یا alias). */
  reserved: string[];
  /** لینکِ وب‌میل برای کارمند. */
  webmailUrl: string;
  /** برای تنظیمِ گوشی و Outlook. */
  imapHost: string;
  imapPort: number;
  smtpHost: string;
  smtpPort: number;
}

/** این‌ها همیشه رزروند، حتی اگر مالک از فهرست برشان دارد. */
export const ALWAYS_RESERVED = ['admin', 'postmaster', 'abuse', 'hostmaster', 'webmaster', 'root', 'mailer-daemon'] as const;

export const DEFAULT_CORP_MAIL: CorpMailConfig = {
  domain: '',
  quotaGb: 5,
  reserved: ['contact', 'finance'],
  webmailUrl: '',
  imapHost: '',
  imapPort: 993,
  smtpHost: '',
  smtpPort: 465,
};

const DOMAIN_RE = /^(?=.{3,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
/** بخشِ پیش از @ — محافظه‌کارانه: حروفِ کوچکِ لاتین، رقم، نقطه، خط تیره و زیرخط. */
const LOCAL_RE = /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/;

export function normalizeDomain(raw: string): string {
  return raw.trim().toLowerCase().replace(/^@/, '');
}

export function isValidDomain(domain: string): boolean {
  return DOMAIN_RE.test(domain);
}

export function normalizeLocalPart(raw: string): string {
  return raw.trim().toLowerCase();
}

export type LocalPartProblem = 'empty' | 'invalid' | 'reserved';

/** مشکلِ نامِ پیش از @، یا null اگر قابلِ ساختن است. */
export function localPartProblem(local: string, config: Pick<CorpMailConfig, 'reserved'>): LocalPartProblem | null {
  if (!local) return 'empty';
  if (!LOCAL_RE.test(local) || local.includes('..')) return 'invalid';
  if (isReserved(local, config)) return 'reserved';
  return null;
}

export function isReserved(local: string, config: Pick<CorpMailConfig, 'reserved'>): boolean {
  const name = normalizeLocalPart(local);
  return (ALWAYS_RESERVED as readonly string[]).includes(name) || config.reserved.includes(name);
}

/** فهرستِ رزرو از متنِ آزاد — جداشده با ویرگول، فاصله یا خطِ تازه. */
export function parseReserved(raw: string): string[] {
  const names = raw.split(/[\s,،]+/).map((s) => normalizeLocalPart(s.replace(/@.*$/, ''))).filter(Boolean);
  return [...new Set(names)].filter((n) => LOCAL_RE.test(n)).slice(0, 200);
}

function cleanHost(raw: unknown): string {
  const host = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  return /^[a-z0-9.-]{1,253}$/.test(host) ? host : '';
}

function cleanPort(raw: unknown, fallback: number): number {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 && n < 65536 ? n : fallback;
}

/** فقط https؛ هر چیزِ دیگر (javascript:، http) خالی می‌شود. */
export function cleanHttpsUrl(raw: unknown): string {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (!value) return '';
  try {
    const url = new URL(/^[a-z]+:\/\//i.test(value) ? value : `https://${value}`);
    return url.protocol === 'https:' ? url.toString().replace(/\/$/, '') : '';
  } catch {
    return '';
  }
}

/** ردیفِ ذخیره‌شده (یا ورودیِ فرم) ← تنظیماتِ سالم. هر فیلدِ خراب پیش‌فرض می‌گیرد. */
export function normalizeCorpMail(raw: Record<string, unknown> | null | undefined): CorpMailConfig {
  const r = raw ?? {};
  const domain = normalizeDomain(typeof r.domain === 'string' ? r.domain : '');
  const quota = Number(r.quotaGb);
  return {
    domain: isValidDomain(domain) ? domain : '',
    quotaGb: Number.isFinite(quota) && quota >= 0.1 && quota <= 1000 ? Math.round(quota * 10) / 10 : DEFAULT_CORP_MAIL.quotaGb,
    reserved: Array.isArray(r.reserved)
      ? parseReserved(r.reserved.filter((x): x is string => typeof x === 'string').join(','))
      : DEFAULT_CORP_MAIL.reserved,
    webmailUrl: cleanHttpsUrl(r.webmailUrl),
    imapHost: cleanHost(r.imapHost),
    imapPort: cleanPort(r.imapPort, DEFAULT_CORP_MAIL.imapPort),
    smtpHost: cleanHost(r.smtpHost),
    smtpPort: cleanPort(r.smtpPort, DEFAULT_CORP_MAIL.smtpPort),
  };
}

export const quotaBytes = (config: Pick<CorpMailConfig, 'quotaGb'>) => Math.round(config.quotaGb * 1024 ** 3);

/** نشانیِ کامل از نامِ پیش از @. */
export const addressOf = (local: string, config: Pick<CorpMailConfig, 'domain'>) =>
  `${normalizeLocalPart(local)}@${config.domain}`;
