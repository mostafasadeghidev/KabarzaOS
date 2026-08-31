import nodemailer, { type Transporter } from 'nodemailer';

/**
 * فرستندهٔ ایمیل.
 *
 * ⚠️ **اختیاری است.** بدونِ `SMTP_HOST` هیچ ایمیلی فرستاده نمی‌شود و این
 * خطا نیست: نسخهٔ قبلی هم روی سایتی که mailer ندارد بی‌صدا رد می‌شود. اعلانِ
 * داخلِ اپ همیشه نوشته شده، پس چیزی گم نمی‌شود.
 *
 * ⚠️ ترابر یک بار ساخته و نگه داشته می‌شود؛ ساختنِ آن به‌ازای هر ایمیل یعنی
 * یک دست‌دادنِ TLS تازه برای هر اعلان.
 */

let cached: Transporter | null = null;
let built = false;

export function mailEnabled(): boolean {
  return Boolean(process.env.SMTP_HOST);
}

function transport(): Transporter | null {
  if (built) return cached;
  built = true;

  if (!mailEnabled()) return (cached = null);

  const port = Number(process.env.SMTP_PORT ?? 587);
  const user = process.env.SMTP_USER ?? '';
  const pass = process.env.SMTP_PASSWORD ?? '';

  cached = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    // ۴۶۵ یعنی TLS از ابتدا؛ بقیه با STARTTLS بالا می‌آیند.
    secure: port === 465,
    auth: user ? { user, pass } : undefined,
  });
  return cached;
}

/** نشانیِ فرستنده — پیش‌فرضی امن تا پیکربندیِ ناقص ارسال را نشکند. */
function from(): string {
  return process.env.SMTP_FROM || process.env.SMTP_USER || 'kabarza@localhost';
}

/**
 * ارسالِ یک ایمیل. `false` یعنی «فرستاده نشد» — چه چون mailer نیست، چه چون
 * ارسال شکست خورد. صدا زننده نباید به‌خاطرش بشکند (R-NOTIF-03).
 */
export async function sendMail(to: string, subject: string, text: string): Promise<boolean> {
  const mailer = transport();
  if (!mailer || !to) return false;

  try {
    await mailer.sendMail({ from: from(), to, subject, text });
    return true;
  } catch (error) {
    console.error('[mail]', error);
    return false;
  }
}

/** ⚠️ فقط برای تست — کشِ ترابر را خالی می‌کند. */
export function resetTransport(): void {
  cached = null;
  built = false;
}
