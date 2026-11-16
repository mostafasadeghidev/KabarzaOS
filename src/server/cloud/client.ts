import 'server-only';
import { ocsEnvelope } from '@/domain/cloud/nextcloud';

/**
 * فراخوانِ API ِ OCS ِ Nextcloud (۳.۴.۰) — یک درخواست، یک پاسخ.
 *
 * ⚠️ امنیت:
 *  · رمزِ برنامه فقط در سرآیندِ Authorization می‌رود؛ هرگز لاگ نمی‌شود (نه نشانیِ کامل با
 *    پارامترها، نه بدنه — بدنه ممکن است رمزِ تازهٔ کارمند باشد).
 *  · `redirect: 'manual'`: تغییرمسیر یعنی خطا، نه دنبال‌کردن — رمز نباید به میزبانِ دیگری برسد.
 *  · سقفِ زمان ۱۵ ثانیه تا صفحه‌ای با سرورِ کُند گیر نکند.
 */

export type CloudApiErrorCode =
  | 'unauthorized' | 'forbidden' | 'not_found' | 'network' | 'http' | 'bad_response' | 'refused';

export class CloudApiError extends Error {
  constructor(readonly code: CloudApiErrorCode, readonly statuscode = 0, readonly detail = '') {
    super(`nextcloud: ${code}${statuscode ? ` ${statuscode}` : ''}`);
    this.name = 'CloudApiError';
  }
}

export interface CloudTarget {
  baseUrl: string;
  username: string;
  secret: string;
}

type Params = Record<string, string | string[]>;

function encode(params: Params): URLSearchParams {
  const out = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) for (const v of value) out.append(`${key}[]`, v);
    else out.append(key, value);
  }
  return out;
}

/** بخشِ مسیر — شناسه‌ها می‌توانند فاصله یا @ داشته باشند. */
export const seg = (value: string) => encodeURIComponent(value);

export async function ocs(
  target: CloudTarget, method: 'GET' | 'POST' | 'PUT', path: string, params: Params = {},
): Promise<unknown> {
  const url = new URL(`${target.baseUrl}/ocs/v2.php/${path}`);
  url.searchParams.set('format', 'json');
  if (method === 'GET') for (const [k, v] of encode(params)) url.searchParams.append(k, v);

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        Authorization: `Basic ${Buffer.from(`${target.username}:${target.secret}`).toString('base64')}`,
        'OCS-APIRequest': 'true',
        Accept: 'application/json',
        ...(method === 'GET' ? {} : { 'Content-Type': 'application/x-www-form-urlencoded' }),
      },
      body: method === 'GET' ? undefined : encode(params).toString(),
      redirect: 'manual',
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new CloudApiError('network');
  }

  if (response.status === 401) throw new CloudApiError('unauthorized', 401);
  if (response.status >= 300 && response.status < 400) throw new CloudApiError('http', response.status, 'redirect');

  let json: unknown = null;
  try {
    json = await response.json();
  } catch {
    // بدنهٔ غیرِ JSON — پایین‌تر بر اساسِ کدِ HTTP.
  }
  const envelope = ocsEnvelope(json);
  if (!envelope) {
    if (response.status === 403) throw new CloudApiError('forbidden', 403);
    if (response.status === 404) throw new CloudApiError('not_found', 404);
    throw new CloudApiError(response.ok ? 'bad_response' : 'http', response.status);
  }
  if (envelope.ok && response.ok) return envelope.data;

  const code = envelope.statuscode;
  if (code === 997 || response.status === 401) throw new CloudApiError('unauthorized', code);
  if (code === 998 || code === 404 || response.status === 404) throw new CloudApiError('not_found', code, envelope.message);
  if (code === 403 || response.status === 403) throw new CloudApiError('forbidden', code, envelope.message);
  // ردِ یک درخواستِ مشخص (مثلاً «کاربر از پیش هست» = ۱۰۲) — پیامِ خودِ Nextcloud بی راز است.
  throw new CloudApiError('refused', code, envelope.message);
}
