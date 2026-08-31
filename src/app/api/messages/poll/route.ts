import { currentActor } from '@/server/auth';
import { pollThread } from '@/server/messaging/service';
import { ThreadNotFoundError } from '@/server/messaging/service';

/**
 * پولِ گفت‌وگوی باز.
 *
 * ⚠️ پاسخِ «تغییری نیست» عمداً تقریباً خالی است: این مسیر هر چند ثانیه از هر
 * تبِ باز صدا زده می‌شود و هر بایتِ اضافه در آن ضرب می‌شود.
 *
 * ⚠️ عضویت در گفت‌وگو در سرویس بررسی می‌شود، نه اینجا (R-ARCH-01) — و
 * گفت‌وگویی که کاربر عضوش نیست «یافت نشد» است، نه «ممنوع».
 */
export async function GET(request: Request) {
  const actor = await currentActor();
  if (!actor) return Response.json({ changed: false }, { status: 401 });

  const params = new URL(request.url).searchParams;
  const threadId = Number(params.get('thread') ?? 0);
  if (!Number.isInteger(threadId) || threadId <= 0) {
    return Response.json({ changed: false }, { status: 400 });
  }

  try {
    return Response.json(await pollThread(actor, threadId, params.get('fp') ?? ''));
  } catch (error) {
    if (error instanceof ThreadNotFoundError) {
      return Response.json({ changed: false }, { status: 404 });
    }
    throw error;
  }
}
