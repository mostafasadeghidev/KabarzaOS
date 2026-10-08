import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { auditLog, users } from '@/db/schema';
import { verifyInitData } from '@/domain/telegram/webapp';
import { loadActor } from '@/server/auth';
import { telegramCredentials } from '@/server/settings/telegram-service';

/**
 * ورود از مینی‌اپِ تلگرام (۲.۱۰.۰).
 *
 * ⚠️ فقط کسی وارد می‌شود که حسابِ تلگرامش **قبلاً از پروفایل** به کاربرش وصل
 * شده؛ یعنی همان پیوندِ یک‌بارمصرفِ «اتصال به تلگرام» که مالکیتِ هر دو حساب را
 * ثابت کرده. حسابِ تلگرامِ ناشناس هیچ‌وقت حسابی نمی‌سازد و به کسی وصل نمی‌شود.
 * ⚠️ همان گاردِ ورودِ عادی (`loadActor` → `canSignIn`): قطع‌شده و حذف‌شده نه.
 */

export type MiniAppLogin =
  | { ok: true; userId: number }
  | { ok: false; reason: 'off' | 'invalid' | 'not_linked' | 'inactive' };

export async function miniAppLogin(initData: string): Promise<MiniAppLogin> {
  const { token } = await telegramCredentials();
  if (!token) return { ok: false, reason: 'off' };
  const check = verifyInitData(initData, token);
  if (!check.ok) return { ok: false, reason: 'invalid' };

  // در چتِ خصوصی شناسهٔ چت همان شناسهٔ کاربرِ تلگرام است.
  const [row] = await db.select({ id: users.id }).from(users)
    .where(eq(users.telegramChatId, String(check.telegramUserId)));
  if (!row) return { ok: false, reason: 'not_linked' };
  const loaded = await loadActor(row.id);
  if (!loaded) return { ok: false, reason: 'inactive' };

  await db.insert(auditLog).values({
    actorType: 'user', actorId: row.id, action: 'auth.telegram_login',
    objectType: 'user', objectId: row.id, after: { via: 'telegram_mini_app' },
  });
  return { ok: true, userId: row.id };
}
