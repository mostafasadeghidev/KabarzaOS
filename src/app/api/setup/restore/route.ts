import {
  appendChunk, applyRestore, beginRestore, cancelRestore, inspectRestore, RestoreError, restoreStatus,
} from '@/server/setup/restore';

/**
 * بازگردانی از ویزاردِ نصب — گام‌ها با `?op=`:
 *
 *   begin    → ژتون                       (فقط وقتی هیچ کاربری نیست)
 *   chunk    → بدنهٔ خام، هدرِ x-offset   (تکه‌تکه، تا پراکسی‌ها با محدودیتِ حجم هم کار کنند)
 *   inspect  → { passphrase } → خلاصهٔ پشتیبان
 *   apply    → { passphrase } → شروعِ بازگردانی در پس‌زمینه
 *   status   → وضعیت و گزارشِ پیشرفت
 *   cancel   → رها کردن و پاک کردنِ فایل
 *
 * ⚠️ همهٔ گام‌ها جز begin ژتون را در هدرِ x-restore-token می‌خواهند.
 * گاردِ اصلی («نصب نشده») و ژتون هر دو در src/server/setup/restore.ts اند.
 */

const NO_STORE = { 'Cache-Control': 'no-store' };

function fail(error: unknown): Response {
  if (error instanceof RestoreError) {
    const status = error.code === 'installed' || error.code === 'busy' ? 409
      : error.code === 'token' ? 403
        : 400;
    return Response.json({ error: error.code, expected: error.expected }, { status, headers: NO_STORE });
  }
  console.error('[setup-restore]', error);
  return Response.json({ error: 'tool_failed' }, { status: 500, headers: NO_STORE });
}

async function passphraseOf(request: Request): Promise<string> {
  const body = (await request.json().catch(() => ({}))) as { passphrase?: unknown };
  return typeof body.passphrase === 'string' ? body.passphrase : '';
}

export async function POST(request: Request) {
  const op = new URL(request.url).searchParams.get('op');
  const token = request.headers.get('x-restore-token') ?? '';
  try {
    switch (op) {
      case 'begin':
        return Response.json({ token: await beginRestore() }, { headers: NO_STORE });
      case 'chunk': {
        const offset = Number(request.headers.get('x-offset'));
        if (!Number.isSafeInteger(offset) || offset < 0) throw new RestoreError('offset');
        const bytes = new Uint8Array(await request.arrayBuffer());
        return Response.json({ size: await appendChunk(token, offset, bytes) }, { headers: NO_STORE });
      }
      case 'inspect':
        return Response.json({ manifest: await inspectRestore(token, await passphraseOf(request)) }, { headers: NO_STORE });
      case 'apply':
        await applyRestore(token, await passphraseOf(request));
        return Response.json({ ok: true }, { headers: NO_STORE });
      case 'cancel':
        await cancelRestore(token);
        return Response.json({ ok: true }, { headers: NO_STORE });
      default:
        return Response.json({ error: 'op' }, { status: 400, headers: NO_STORE });
    }
  } catch (error) {
    return fail(error);
  }
}

export async function GET(request: Request) {
  try {
    return Response.json(restoreStatus(request.headers.get('x-restore-token') ?? ''), { headers: NO_STORE });
  } catch (error) {
    return fail(error);
  }
}

export const dynamic = 'force-dynamic';
