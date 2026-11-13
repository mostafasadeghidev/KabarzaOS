import 'server-only';
import { eq, or, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { users } from '@/db/schema';
import { userIdByCompanyEmail } from '@/server/corp-mail/directory';

/**
 * کاربرِ یک شناسهٔ ورود (۳.۱.۰) — مشترکِ «ورود» و «فراموشیِ رمز»:
 *  ۱. ایمیلِ شخصی یا نامِ کاربری (بی‌اعتنا به حروف؛ شاخصِ `lower(...)` ِ مهاجرتِ 0017)،
 *  ۲. وگرنه نشانیِ اصلیِ صندوقِ شرکتیِ باز از دفترِ دسترسی.
 *
 * ⚠️ ترتیب مهم است: اگر ایمیلِ شخصیِ کسی با نشانیِ شرکتیِ دیگری یکی باشد، صاحبِ
 * ایمیلِ شخصی برنده است — همان رفتارِ پیش از ۳.۱.۰ عوض نمی‌شود.
 * `identifier` باید پیشاپیش trim و کوچک شده باشد.
 */
export async function findUserByIdentifier(identifier: string): Promise<{
  user: typeof users.$inferSelect;
  /** از راهِ صندوقِ شرکتی پیدا شد — ایمیلِ بازنشانی به همان صندوق می‌رود. */
  viaCompanyEmail: boolean;
} | null> {
  if (identifier === '') return null;
  const direct = await db.select().from(users).where(or(
    sql`lower(${users.email}) = ${identifier}`,
    sql`lower(${users.username}) = ${identifier}`,
  ));
  if (direct[0]) return { user: direct[0], viaCompanyEmail: false };

  const owner = await userIdByCompanyEmail(identifier);
  if (!owner) return null;
  const [user] = await db.select().from(users).where(eq(users.id, owner));
  return user ? { user, viaCompanyEmail: true } : null;
}
