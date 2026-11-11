import { routeActor } from '@/server/auth';
import { mailAttachment, MailboxError } from '@/server/corp-mail/mailbox';

/**
 * پیوستِ ایمیلِ شرکتیِ خودِ کاربر (۲.۶۲.۰): `?email=…&blob=…`.
 *
 * ⚠️ همیشه دانلود (attachment)، هرگز نمایش درونِ صفحه: فایلِ HTML یا SVG ِ پیوست
 * روی دامنهٔ برنامه اجرا نشود. nosniff و sandbox ِ CSP هم برای اطمینان.
 * ⚠️ `mailAttachment` فقط blob ِ پیوستِ همان ایمیلِ خودِ کاربر را می‌دهد.
 */
export async function GET(request: Request) {
  const actor = await routeActor();
  if (!actor) return new Response('unauthorized', { status: 401 });
  const url = new URL(request.url);
  try {
    const file = await mailAttachment(actor, url.searchParams.get('email') ?? '', url.searchParams.get('blob') ?? '');
    // نامِ فایل از ایمیل می‌آید (دادهٔ بیرونی): بی خطِ تازه، گیومه و بک‌اسلش در هدر.
    const safeName = file.name.replace(/[\r\n"\\]/g, '_').slice(0, 200) || 'attachment';
    return new Response(file.body, {
      headers: {
        'content-type': 'application/octet-stream',
        'content-disposition': `attachment; filename="${safeName.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(safeName)}`,
        'x-content-type-options': 'nosniff',
        'content-security-policy': "sandbox; default-src 'none'",
        'cache-control': 'private, no-store',
      },
    });
  } catch (error) {
    if (error instanceof MailboxError) {
      const status = error.code === 'not_found' ? 404 : error.code === 'view_only' ? 403 : error.code === 'stalwart' ? 502 : 409;
      return new Response(error.code, { status });
    }
    throw error;
  }
}

export const dynamic = 'force-dynamic';
