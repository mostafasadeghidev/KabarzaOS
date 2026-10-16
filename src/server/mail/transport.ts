import nodemailer, { type Transporter } from 'nodemailer';
import { smtpFingerprint, type SmtpConfig } from '@/domain/settings/smtp';
import { smtpConfig } from '@/server/settings/smtp-service';

/**
 * فرستندهٔ ایمیل.
 *
 * ⚠️ **اختیاری است.** بی‌پیکربندی هیچ ایمیلی فرستاده نمی‌شود و این خطا نیست:
 * نسخهٔ قبلی هم روی سایتی که mailer ندارد بی‌صدا رد می‌شود. اعلانِ داخلِ اپ
 * همیشه نوشته شده، پس چیزی گم نمی‌شود.
 *
 * پیکربندی از `.env` (`SMTP_*`) یا از پنل (تنظیمات ← اطلاع‌رسانی، ۲.۳۲.۰)؛
 * محیط برنده است (`smtp-service`).
 *
 * ⚠️ ترابر نگه داشته می‌شود؛ ساختنِ آن به‌ازای هر ایمیل یعنی یک دست‌دادنِ TLS
 * تازه برای هر اعلان. با عوض‌شدنِ تنظیمات (اثرِ انگشت) دوباره ساخته می‌شود.
 */

let cached: Transporter | null = null;
let cachedFor = '';

export async function mailEnabled(): Promise<boolean> {
  return (await smtpConfig()) !== null;
}

function build(config: SmtpConfig): Transporter {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    // ۴۶۵ یعنی TLS از ابتدا؛ بقیه با STARTTLS بالا می‌آیند.
    secure: config.port === 465,
    auth: config.user ? { user: config.user, pass: config.pass } : undefined,
    connectionTimeout: 15_000,
  });
}

async function transport(): Promise<{ mailer: Transporter; from: string } | null> {
  const config = await smtpConfig();
  if (!config) {
    cached = null;
    cachedFor = '';
    return null;
  }
  const fingerprint = smtpFingerprint(config);
  if (!cached || cachedFor !== fingerprint) {
    cached?.close();
    cached = build(config);
    cachedFor = fingerprint;
  }
  return { mailer: cached, from: config.from };
}

/**
 * ارسالِ یک ایمیل. `false` یعنی «فرستاده نشد» — چه چون mailer نیست، چه چون
 * ارسال شکست خورد. صدا زننده نباید به‌خاطرش بشکند (R-NOTIF-03).
 */
export async function sendMail(to: string, subject: string, text: string): Promise<boolean> {
  return (await sendMailDetailed(to, subject, text)).ok;
}

/** همان ارسال، با دلیلِ شکست — برای دکمهٔ «ایمیلِ آزمایشی» ِ تنظیمات. */
export async function sendMailDetailed(
  to: string, subject: string, text: string,
): Promise<{ ok: true } | { ok: false; reason: 'disabled' | 'no_recipient' | 'failed'; detail?: string }> {
  const t = await transport();
  if (!t) return { ok: false, reason: 'disabled' };
  if (!to) return { ok: false, reason: 'no_recipient' };
  try {
    await t.mailer.sendMail({ from: t.from, to, subject, text });
    return { ok: true };
  } catch (error) {
    console.error('[mail]', error);
    // ⚠️ فقط پیامِ خطا، کوتاه — نه کلِ شیء (که ممکن است پیکربندی را هم داشته باشد).
    const detail = error instanceof Error ? error.message.slice(0, 300) : undefined;
    return { ok: false, reason: 'failed', detail };
  }
}

/** ⚠️ فقط برای تست — کشِ ترابر را خالی می‌کند. */
export function resetTransport(): void {
  cached?.close();
  cached = null;
  cachedFor = '';
}
