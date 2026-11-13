import 'server-only';
import { and, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { serviceGrants, services } from '@/db/schema';

/**
 * نشانیِ صندوقِ شرکتیِ هر نفر (۳.۱.۰) — **فقط از دفترِ دسترسی**، بی درخواست به
 * سرورِ ایمیل؛ پس کارتِ اعضا و صفحهٔ ورود کند نمی‌شوند.
 *
 * ⚠️ فقط ردیفِ باز و جفت‌شده (`external_id` پر) شمرده می‌شود: صندوقِ بسته‌شده یا
 * ردیفِ دستیِ قدیمی نه نشانیِ کارت می‌شود، نه راهِ ورود.
 */
const open = () => and(
  eq(services.provider, 'stalwart'),
  isNull(serviceGrants.revokedAt),
  ne(serviceGrants.externalId, ''),
  ne(serviceGrants.accountRef, ''),
);

export async function companyEmailsOf(userIds: readonly number[]): Promise<Map<number, string>> {
  const ids = [...new Set(userIds)].filter((id) => id > 0);
  if (ids.length === 0) return new Map();
  const rows = await db.select({ userId: serviceGrants.userId, address: serviceGrants.accountRef })
    .from(serviceGrants)
    .innerJoin(services, eq(services.id, serviceGrants.serviceId))
    .where(and(open(), inArray(serviceGrants.userId, ids)));
  return new Map(rows.map((r) => [r.userId, r.address]));
}

/**
 * صاحبِ یک نشانیِ شرکتی — برای ورود و «فراموشیِ رمز» (۳.۱.۰).
 *
 * ⚠️ فقط نشانیِ اصلیِ صندوق (نه aliasها — آن‌ها فقط روی سرورِ ایمیل‌اند و ورود
 * نباید منتظرِ شبکه بماند). اگر به هر دلیل دو ردیفِ باز یک نشانی داشته باشند،
 * هیچ‌کدام برنمی‌گردد — ورود باید بی‌ابهام باشد.
 */
export async function userIdByCompanyEmail(address: string): Promise<number | null> {
  const id = address.trim().toLowerCase();
  if (!id.includes('@')) return null;
  const rows = await db.selectDistinct({ userId: serviceGrants.userId })
    .from(serviceGrants)
    .innerJoin(services, eq(services.id, serviceGrants.serviceId))
    .where(and(open(), sql`lower(${serviceGrants.accountRef}) = ${id}`))
    .limit(2);
  return rows.length === 1 ? rows[0]!.userId : null;
}
