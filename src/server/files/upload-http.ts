import 'server-only';
import { currentSession } from '@/server/auth';
import type { Actor } from '@/domain/access/permissions';
import { ForbiddenError } from '@/domain/access/guard';
import { FileRejected, rejectMessage } from '@/domain/files/upload';
import { FrozenProjectError } from '@/server/projects/authority';
import { UploadConflict, UploadNotFound } from './chunked';
import { getT } from '@/i18n/server';

/**
 * گاردِ مشترکِ مسیرهای `/api/uploads` (۳.۱۰.۰).
 * ⚠️ این‌ها مسیرِ API اند نه server action، پس محافظتِ خودکارِ Next در برابرِ درخواستِ میان‌سایتی
 * را ندارند: `Origin` باید همین سایت باشد. «دیدن به‌جای کاربر» و عضوِ غیرفعال هم آپلود نمی‌کنند.
 */
export async function uploadActor(request: Request): Promise<Actor | Response> {
  // ⚠️ فقط درخواستِ تغییردهنده: مرورگر روی GET ِ هم‌مبدأ سرآیندِ Origin نمی‌فرستد.
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    const origin = request.headers.get('origin');
    const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
    let same = false;
    try { same = !!origin && !!host && new URL(origin).host === host; } catch { same = false; }
    if (!same) return new Response(null, { status: 403 });
  }
  const session = await currentSession();
  if (!session || session.actor.viewOnly || session.memberState !== 'active') return new Response(null, { status: 403 });
  return session.actor;
}

/** خطای سرویس ← پاسخِ JSON با پیامِ ترجمه‌شده؛ کدِ وضعیت به مرورگر می‌گوید دوباره تلاش کند یا نه. */
export async function uploadError(error: unknown): Promise<Response> {
  const t = await getT();
  const json = (status: number, message: string, retry = false) => Response.json({ error: t(message), retry }, { status });
  if (error instanceof FileRejected) return json(422, rejectMessage(error.reason));
  if (error instanceof UploadNotFound) return json(404, 'این آپلود دیگر وجود ندارد؛ دوباره انتخابش کنید.');
  if (error instanceof UploadConflict) {
    if (error.code === 'too_many') return json(429, 'آپلودهای نیمه‌کارهٔ شما زیاد است؛ چندتا را تمام یا لغو کنید.');
    return json(409, 'ترتیبِ تکه‌ها به‌هم ریخت؛ آپلود از سر گرفته می‌شود.', true);
  }
  if (error instanceof FrozenProjectError) return json(423, 'این پروژه بایگانی/بسته است و تغییر نمی‌پذیرد.');
  if (error instanceof ForbiddenError) return json(403, 'دسترسی ندارید.');
  console.error('[uploads]', error);
  // خطای شبکه با مقصد (Nextcloud/S3) — مرورگر کمی بعد همین تکه را دوباره می‌فرستد.
  return json(503, 'ارتباط با محلِ ذخیره قطع شد؛ دوباره تلاش می‌شود.', true);
}
