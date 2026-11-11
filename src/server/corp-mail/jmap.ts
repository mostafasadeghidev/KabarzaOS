import 'server-only';

/**
 * کلاینتِ کوچکِ JMAP برای Stalwart (۲.۵۹.۰).
 *
 * ⚠️ همهٔ نشانی‌ها از `STALWART_URL` ساخته می‌شوند، نه از `apiUrl` ِ پاسخِ
 * `/jmap/session`: آن پاسخ نشانیِ عمومیِ پنل را برمی‌گرداند و وقتی برنامه از
 * شبکهٔ داخلیِ Docker (`http://stalwart:8080`) وصل است، به اینترنت می‌رفت.
 * با عوض‌کردنِ همین یک متغیر بینِ «یک سرور» و «دو سرور» جابه‌جا می‌شود.
 *
 * ⚠️ کلید، رمز و بدنهٔ درخواست‌ها هرگز لاگ نمی‌شوند؛ خطاها فقط نوع دارند.
 */

export const USING_ADMIN = ['urn:ietf:params:jmap:core', 'urn:stalwart:jmap'] as const;

export type JmapErrorCode = 'not_configured' | 'unauthorized' | 'forbidden' | 'network' | 'http' | 'method' | 'bad_response';

export class JmapError extends Error {
  constructor(readonly code: JmapErrorCode, readonly detail = '') {
    super(`jmap: ${code}${detail ? ` (${detail})` : ''}`);
    this.name = 'JmapError';
  }
}

/** نشانیِ پایه بی‌اسلشِ پایانی، یا null وقتی تنظیم نشده یا معتبر نیست. */
export function stalwartBaseUrl(): string | null {
  const raw = (process.env.STALWART_URL ?? '').trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return url.toString().replace(/\/+$/, '');
  } catch {
    return null;
  }
}

function apiKey(): string | null {
  const key = (process.env.STALWART_API_KEY ?? '').trim();
  return key || null;
}

export function isCorpMailConfigured(): boolean {
  return stalwartBaseUrl() !== null && apiKey() !== null;
}

/** میزبانِ نشانیِ پایه برای نمایش به مالک — بی‌مسیر و بی‌هیچ راز. */
export function stalwartHost(): string | null {
  const base = stalwartBaseUrl();
  return base ? new URL(base).host : null;
}

export type JmapAuth = { kind: 'admin' } | { kind: 'basic'; user: string; password: string };

function authHeader(auth: JmapAuth): string {
  if (auth.kind === 'basic') return `Basic ${Buffer.from(`${auth.user}:${auth.password}`).toString('base64')}`;
  const key = apiKey();
  if (!key) throw new JmapError('not_configured');
  return `Bearer ${key}`;
}

const TIMEOUT_MS = 15_000;

async function request(path: string, auth: JmapAuth, init: { method: 'GET' | 'POST'; body?: unknown }): Promise<unknown> {
  const base = stalwartBaseUrl();
  if (!base) throw new JmapError('not_configured');
  let res: Response;
  try {
    res = await fetch(`${base}${path}`, {
      method: init.method,
      headers: {
        authorization: authHeader(auth),
        accept: 'application/json',
        ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    });
  } catch (error) {
    if (error instanceof JmapError) throw error;
    throw new JmapError('network');
  }
  if (res.status === 401) throw new JmapError('unauthorized');
  if (res.status === 403) throw new JmapError('forbidden');
  if (!res.ok) throw new JmapError('http', String(res.status));
  try {
    return await res.json();
  } catch {
    throw new JmapError('bad_response');
  }
}

export interface JmapSession {
  accounts: Record<string, { name?: string }>;
  primaryAccounts: Record<string, string>;
}

/**
 * شناسهٔ حسابِ صاحبِ کلید (یا کاربرِ Basic) — `accountId` ِ همهٔ متدها.
 * ⚠️ ثابت نوشته نمی‌شود (`b` امروز admin است، فردا شاید نه).
 */
export async function sessionAccountId(auth: JmapAuth = { kind: 'admin' }, capability = 'urn:stalwart:jmap'): Promise<string> {
  const session = (await request('/jmap/session', auth, { method: 'GET' })) as Partial<JmapSession> | null;
  const primary = session?.primaryAccounts ?? {};
  // هر حسابِ اصلیِ دیگری هم پذیرفته است: نشستِ کاربرِ عادی گاهی همهٔ قابلیت‌ها را فهرست نمی‌کند.
  const id = primary[capability] ?? primary['urn:ietf:params:jmap:core'] ?? Object.values(primary)[0]
    ?? Object.keys(session?.accounts ?? {})[0];
  if (!id) throw new JmapError('bad_response', 'no account');
  return id;
}

export type MethodCall = [string, Record<string, unknown>, string];

/**
 * چند متد در یک درخواست. پاسخِ `error` ِ هر متد به JmapError('method') تبدیل
 * می‌شود تا هیچ خطایی بی‌صدا رد نشود.
 */
export async function jmapCall(
  calls: MethodCall[],
  { auth = { kind: 'admin' } as JmapAuth, using = USING_ADMIN as readonly string[] } = {},
): Promise<Map<string, [string, Record<string, unknown>]>> {
  const body = await request('/jmap/', auth, { method: 'POST', body: { using, methodCalls: calls } }) as
    { methodResponses?: Array<[string, Record<string, unknown>, string]> } | null;
  const out = new Map<string, [string, Record<string, unknown>]>();
  for (const [name, args, tag] of body?.methodResponses ?? []) {
    if (name === 'error') throw new JmapError('method', String(args?.type ?? 'unknown'));
    out.set(tag, [name, args]);
  }
  for (const [, , tag] of calls) if (!out.has(tag)) throw new JmapError('bad_response', `missing ${tag}`);
  return out;
}

/** پاسخِ یک متد با برچسبش. */
export function result<T = Record<string, unknown>>(responses: Map<string, [string, Record<string, unknown>]>, tag: string): T {
  return responses.get(tag)![1] as T;
}
