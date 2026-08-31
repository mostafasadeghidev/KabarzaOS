import { installOwner, isInstalled, SetupError } from '@/server/setup/service';

/**
 * نصب از راهِ API — برای خودکارسازی (اسکریپتِ استقرار، CI).
 *
 * راهِ عادی **ویزاردِ `/setup`** است؛ این مسیر برای وقتی است که کسی
 * می‌خواهد نصب را در اسکریپت ببندد:
 *
 * ```bash
 * curl -X POST -H "x-setup-secret: $CRON_SECRET" -H 'content-type: application/json' \
 *   -d '{"email":"you@example.com","username":"you","password":"…","firstName":"نام"}' \
 *   https://app/api/setup
 * ```
 *
 * ⚠️ منطق **مشترک** با ویزارد است (`installOwner`)، نه یک کپیِ دوم: دو
 * پیاده‌سازی از یک قاعده دیر یا زود از هم واگرا می‌شوند و آن‌وقت یکی
 * سخت‌گیرتر از دیگری می‌شود — که در مسیرِ ساختِ حسابِ مالک یعنی یک درِ باز.
 *
 * ⚠️ برخلافِ ویزارد، اینجا رمزِ سرآیند هم لازم است: مسیرِ ماشینی نباید با
 * حدسِ آدرس قابلِ استفاده باشد.
 */
export async function POST(request: Request): Promise<Response> {
  const expected = process.env.CRON_SECRET ?? '';
  if (expected === '' || request.headers.get('x-setup-secret') !== expected) {
    return new Response('forbidden', { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return Response.json({ error: 'bad_json' }, { status: 400 });
  }

  const text = (key: string) => String(body[key] ?? '');
  const password = text('password');
  const email = text('email');

  try {
    await installOwner({
      firstName: text('firstName') || text('name') || 'مدیرِ کل',
      lastName: text('lastName'),
      email,
      // نامِ کاربری اختیاری است؛ نبودش از بخشِ پیش از @ ساخته می‌شود.
      username: text('username') || email.split('@')[0] || '',
      password,
      passwordRepeat: password,
    });
  } catch (error) {
    if (error instanceof SetupError) {
      const status = error.reason === 'already_installed' ? 409 : 400;
      return Response.json({ error: error.reason }, { status });
    }
    return Response.json({ error: 'setup_failed' }, { status: 500 });
  }

  return Response.json({ ok: true, email: email.trim().toLowerCase() });
}

/** وضعیتِ نصب — تا اسکریپتِ استقرار بداند لازم است یا نه. */
export async function GET(): Promise<Response> {
  return Response.json({ installed: await isInstalled() });
}

export const dynamic = 'force-dynamic';
