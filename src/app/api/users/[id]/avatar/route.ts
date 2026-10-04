import { currentActor } from '@/server/auth';
import { FileNotFoundError, serveUserAvatar } from '@/server/files/service';
import { openObject } from '@/server/files/storage';

/**
 * آواتارِ یک شخص با شناسهٔ کاربر — همیشه نسخهٔ کوچک.
 *
 * ⚠️ گارد در `serveUserAvatar` است (آینهٔ پنهان‌کردنِ نام برای کارفرما).
 * پاسخ در کشِ **خصوصیِ** مرورگر می‌ماند تا فهرستی با سی نام در هر صفحه سی
 * درخواستِ تکراری نزند. «ندارد» کوتاه‌تر می‌ماند: کسی که تازه عکس گذاشته
 * نباید پنج دقیقه حرفِ اولِ خودش را ببیند.
 */
const CACHE = 'private, max-age=300';
const CACHE_MISSING = 'private, max-age=30';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await currentActor();
  if (!actor) return new Response(null, { status: 403 });
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return new Response(null, { status: 400 });

  try {
    const file = await serveUserAvatar(actor, id);
    const object = await openObject(file.key, null);
    return new Response(object.body, {
      status: 200,
      headers: {
        'Content-Type': file.mime,
        'Content-Length': String(object.length),
        'X-Content-Type-Options': 'nosniff',
        'Content-Disposition': 'inline',
        'Cache-Control': CACHE,
      },
    });
  } catch (error) {
    if (error instanceof FileNotFoundError) {
      return new Response(null, { status: 404, headers: { 'Cache-Control': CACHE_MISSING } });
    }
    throw error;
  }
}
