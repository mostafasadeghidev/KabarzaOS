import { timingSafeEqual } from 'node:crypto';
import { after } from 'next/server';
import { telegramCredentials } from '@/server/settings/telegram-service';
import { handleUpdate, webhookSecret, type TgUpdate } from '@/server/telegram/bot';

export const dynamic = 'force-dynamic';

/**
 * `POST /api/telegram/webhook` — پیام‌های ربات (۲.۹.۰).
 *
 * ⚠️ فقط درخواستی پذیرفته می‌شود که سرآیندِ رازِ ثبت‌شده در `setWebhook` را
 * دارد؛ وگرنه هر کسی می‌توانست به اسمِ یک چت پیام بسازد.
 * ⚠️ پاسخ بی‌درنگ ۲۰۰ است و کار بعد از آن (`after`) انجام می‌شود: جوابِ
 * هوشِ مصنوعی ممکن است طول بکشد و تلگرام درخواستِ کُند را دوباره می‌فرستد.
 */
export async function POST(req: Request) {
  const { token } = await telegramCredentials();
  if (!token) return new Response('not found', { status: 404 });

  const given = Buffer.from(req.headers.get('x-telegram-bot-api-secret-token') ?? '');
  const want = Buffer.from(webhookSecret(token));
  if (given.length !== want.length || !timingSafeEqual(given, want)) {
    return new Response('forbidden', { status: 403 });
  }

  const update = await req.json().catch(() => null) as TgUpdate | null;
  if (update) after(() => handleUpdate(update));
  return Response.json({ ok: true });
}
