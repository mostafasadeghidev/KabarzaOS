import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { notifications } from '@/db/schema';
import { currentActor } from '@/server/auth';
import { getSystemConfig } from '@/server/settings/system-service';

/**
 * نبضِ زنده — پورتِ `ajax_pulse()`.
 *
 * ⚠️ عمداً فقط **دو عدد** برمی‌گرداند، نه محتوا: این مسیر هر چند ثانیه یک‌بار
 * از هر تبِ باز صدا زده می‌شود؛ هر بایتِ اضافه در آن ضرب می‌شود.
 *
 * ⚠️ وقتی نبض در تنظیمات خاموش است، اینجا هم بسته است (R-ARCH-01) — نه فقط
 * کامپوننت سوار نمی‌شود.
 */
export async function GET() {
  const actor = await currentActor();
  if (!actor) return Response.json({ notif: 0, msg: 0 });

  const system = await getSystemConfig();
  if (!system.pulseEnabled) return Response.json({ notif: 0, msg: 0, off: true });

  const [notif, msg] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` })
      .from(notifications)
      .where(and(eq(notifications.userId, actor.id), eq(notifications.isRead, false))),
    /**
     * پیامِ خوانده‌نشده — همان تعریفِ صندوق: بعد از رسیدِ خواندن، و فرستنده
     * خودم نباشم.
     */
    db.execute(sql`
      select count(m.id)::int as n
      from thread_users tu
      join messages m on m.thread_id = tu.thread_id
        and m.id > coalesce(tu.last_read_message_id, 0)
        and m.from_user_id <> ${actor.id}
      where tu.user_id = ${actor.id}
    `),
  ]);

  return Response.json({
    notif: notif[0]?.n ?? 0,
    msg: Number((msg as unknown as Array<{ n: number }>)[0]?.n ?? 0),
  });
}
