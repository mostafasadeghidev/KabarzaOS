import { createHash } from 'node:crypto';
import { telegramCredentials } from '@/server/settings/telegram-service';
import { webhookSecret } from './secret';

/**
 * دریافتِ پیام‌های ربات (۲.۹.۰) — وب‌هوک یا پولینگ.
 *
 * `TELEGRAM_BOT_MODE`:
 *  - `webhook`: تلگرام پیام را به `/api/telegram/webhook` می‌فرستد؛ نشانیِ
 *    عمومیِ HTTPS (`APP_URL`) لازم است.
 *  - `polling`: سرور خودش با `getUpdates` می‌پرسد — برای نصبِ داخلی/بی‌دامنه.
 *  - `off`: ربات فقط اعلان می‌فرستد و پیام نمی‌گیرد.
 *  - `auto` (پیش‌فرض): HTTPS ← وب‌هوک؛ وگرنه در تولید پولینگ؛ در توسعه خاموش.
 *
 * ⚠️ چرا توسعه خاموش است: اگر نسخهٔ محلی با همان توکنِ ربات پولینگ کند،
 * پیام‌های کاربرانِ واقعی را از سرورِ اصلی «می‌دزدد».
 * ⚠️ توکن هر دقیقه دوباره خوانده می‌شود: ذخیرهٔ توکن در تنظیمات بی‌ری‌استارت
 * اثر می‌کند.
 * ⚠️ پولینگ هر پیام را به **همان مسیرِ وب‌هوکِ محلی** می‌دهد: یک راهِ پردازش،
 * با زمینهٔ درخواستِ واقعی، و این فایل (که `instrumentation` بارش می‌کند)
 * کلِ سرویس‌ها را با خودش نمی‌کشد.
 */

type Mode = 'webhook' | 'polling' | 'off';

export function botMode(env: NodeJS.ProcessEnv = process.env): Mode {
  const raw = (env.TELEGRAM_BOT_MODE ?? 'auto').trim().toLowerCase();
  if (raw === 'webhook' || raw === 'polling' || raw === 'off') return raw;
  if ((env.APP_URL ?? '').startsWith('https://')) return 'webhook';
  return env.NODE_ENV === 'production' ? 'polling' : 'off';
}

async function tg(token: string, method: string, payload: Record<string, unknown>, timeoutMs = 20_000) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(timeoutMs),
  });
  return res.json() as Promise<{ ok?: boolean; result?: unknown; error_code?: number; description?: string }>;
}

const fingerprint = (token: string) => createHash('sha256').update(token).digest('hex').slice(0, 12);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let started = false;

export function startTelegramRunner(): void {
  if (started) return;
  started = true;
  const mode = botMode();
  if (mode === 'off') return;
  console.log(`[telegram] bot mode: ${mode}`);
  void (mode === 'webhook' ? webhookLoop() : pollLoop());
}

/** وب‌هوک: با هر توکنِ تازه یک بار ثبت. */
async function webhookLoop() {
  let configured = '';
  for (;;) {
    try {
      const { token } = await telegramCredentials();
      if (token && fingerprint(token) !== configured) {
        const url = `${(process.env.APP_URL ?? '').replace(/\/$/, '')}/api/telegram/webhook`;
        const out = await tg(token, 'setWebhook', {
          url,
          secret_token: webhookSecret(token),
          allowed_updates: ['message', 'callback_query'],
        });
        if (out.ok) {
          configured = fingerprint(token);
          console.log('[telegram] webhook set');
        } else {
          console.error('[telegram] setWebhook failed:', out.description ?? out.error_code);
        }
      }
    } catch (error) {
      console.error('[telegram] webhook setup error', error instanceof Error ? error.message : error);
    }
    await sleep(60_000);
  }
}

/** پولینگِ بلند: هر پاسخ تا ۲۵ ثانیه باز می‌ماند؛ هزینهٔ تقریباً صفر. */
async function pollLoop() {
  let offset = 0;
  let current = '';
  for (;;) {
    let token = '';
    try {
      token = (await telegramCredentials()).token;
    } catch {
      // دیتابیس هنوز بالا نیامده.
    }
    if (!token) {
      await sleep(60_000);
      continue;
    }
    try {
      if (fingerprint(token) !== current) {
        // ⚠️ وب‌هوکِ فعال جلوی getUpdates را می‌گیرد (۴۰۹).
        await tg(token, 'deleteWebhook', { drop_pending_updates: false });
        current = fingerprint(token);
        offset = 0;
      }
      const out = await tg(token, 'getUpdates', {
        offset, timeout: 25, allowed_updates: ['message', 'callback_query'],
      }, 35_000);
      if (!out.ok || !Array.isArray(out.result)) {
        await sleep(out.error_code === 409 ? 30_000 : 5_000);
        continue;
      }
      for (const update of out.result as Array<{ update_id: number }>) {
        offset = Math.max(offset, update.update_id + 1);
        await forward(token, update);
      }
    } catch {
      await sleep(5_000);
    }
  }
}

/** نشانیِ همین سرور از درون. */
function localBase(): string {
  return (process.env.TELEGRAM_LOCAL_URL ?? `http://127.0.0.1:${process.env.PORT || 3000}`).replace(/\/$/, '');
}

/** تحویلِ یک به‌روزرسانی به مسیرِ وب‌هوک (که بی‌درنگ ۲۰۰ می‌دهد). */
async function forward(token: string, update: unknown) {
  await fetch(`${localBase()}/api/telegram/webhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': webhookSecret(token) },
    body: JSON.stringify(update),
    signal: AbortSignal.timeout(15_000),
  }).catch(() => {});
}
