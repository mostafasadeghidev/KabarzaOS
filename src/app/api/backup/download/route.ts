import { createReadStream, promises as fs } from 'node:fs';
import { Readable } from 'node:stream';
import { and, eq, isNull, ne } from 'drizzle-orm';
import { currentActor } from '@/server/auth';
import { db } from '@/db/client';
import { userRoles, users } from '@/db/schema';
import { localBackupPath } from '@/server/backup/run';
import { recordDownload, verifyDownloadToken } from '@/server/backup/service';
import { notify } from '@/server/notifications/service';

/**
 * دانلودِ یک پشتیبانِ محلی.
 *
 * ⚠️ سه شرط با هم: نشستِ **مالک**، پیوندِ امضاشدهٔ پنج‌دقیقه‌ای که فقط پس از
 * تأییدِ دوبارهٔ رمز ساخته می‌شود، و همان کاربری که پیوند را گرفت. هر دانلود در
 * گزارشِ فعالیت ثبت می‌شود و مالکانِ دیگر خبردار می‌شوند — فایلِ پشتیبان یعنی
 * همهٔ داده.
 */
export async function GET(request: Request) {
  const actor = await currentActor();
  if (!actor || !actor.roles.includes('owner')) return new Response(null, { status: 403 });

  const token = new URL(request.url).searchParams.get('token') ?? '';
  const name = verifyDownloadToken(token, actor.id);
  const file = name ? localBackupPath(name) : null;
  if (!name || !file) return new Response(null, { status: 403 });

  const stat = await fs.stat(file).catch(() => null);
  if (!stat) return new Response(null, { status: 404 });

  await recordDownload(actor, name);
  // مالکانِ دیگر — اگر دانلود کارِ کسِ دیگری با نشستِ این حساب بود، بدانند.
  const others = await db.selectDistinct({ id: users.id }).from(userRoles)
    .innerJoin(users, eq(users.id, userRoles.userId))
    .where(and(eq(userRoles.role, 'owner'), isNull(users.deletedAt), ne(users.id, actor.id)));
  await notify(others.map((o) => o.id), {
    type: 'backup.downloaded',
    title: 'یک فایلِ پشتیبان دانلود شد',
    body: '{file}',
    params: { file: name },
    url: '/settings?tab=backup',
  }).catch(() => undefined);

  return new Response(Readable.toWeb(createReadStream(file)) as ReadableStream, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(stat.size),
      'Content-Disposition': `attachment; filename="${name}"`,
      'Cache-Control': 'no-store',
    },
  });
}
