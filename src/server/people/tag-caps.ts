import { and, eq, inArray, ne } from 'drizzle-orm';
import { db } from '@/db/client';
import { tagRelations, tags } from '@/db/schema';
import { permissionsFromCaps } from '@/domain/access/tag-caps';
import type { Permission } from '@/domain/access/permissions';

/**
 * دسترسی‌های مشتق از **تگ‌های نقشِ عضو** — پورتِ `People::sync_caps_from_tags()`.
 *
 * ⚠️ هر بار از دیتابیس خوانده می‌شود (مثلِ مجوزهای per-user): برداشتنِ تگِ
 * «حسابدار» همان لحظه دسترسیِ مالی را می‌گیرد، بی‌آنکه ردیفِ مجوزی جا بماند.
 */
export async function capsForUser(userId: number): Promise<string[]> {
  const rows = await db
    .select({ cap: tags.grantsCap })
    .from(tagRelations)
    .innerJoin(tags, eq(tags.id, tagRelations.tagId))
    .where(and(
      eq(tagRelations.objectType, 'user'),
      eq(tagRelations.objectId, userId),
      eq(tags.type, 'member_role'),
      ne(tags.grantsCap, ''),
    ));
  return [...new Set(rows.map((r) => r.cap).filter((c): c is string => Boolean(c)))];
}

export async function tagPermissionsFor(userId: number): Promise<Permission[]> {
  return permissionsFromCaps(await capsForUser(userId));
}

/** کاربرانی که تگِ مالی دارند — کاندیدای تخصیص به حساب (پورتِ `accountant candidates`). */
export async function userIdsWithCaps(caps: readonly string[]): Promise<number[]> {
  if (caps.length === 0) return [];
  const rows = await db
    .selectDistinct({ userId: tagRelations.objectId })
    .from(tagRelations)
    .innerJoin(tags, eq(tags.id, tagRelations.tagId))
    .where(and(
      eq(tagRelations.objectType, 'user'),
      eq(tags.type, 'member_role'),
      inArray(tags.grantsCap, [...caps]),
    ));
  return rows.map((r) => r.userId);
}
