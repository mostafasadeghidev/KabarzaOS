/**
 * آواتارِ اعضا — چه کسی عکسِ چه کسی را می‌بیند، و جایگزینش وقتی نمی‌بیند.
 *
 * ⚠️ قاعده آینهٔ `nameForViewer` (`domain/access/viewer-names`) است: هر جا
 * نام پنهان می‌شود، عکس هم نباید برسد؛ وگرنه «عضو تیم» کنارِ چهرهٔ واقعی
 * پنهان‌کاری را بی‌اثر می‌کند. تصمیم سمتِ سرور گرفته می‌شود (مسیرِ
 * `/api/users/[id]/avatar`)؛ UI فقط شناسه را می‌شناسد.
 */

import { stableHash } from '@/domain/files/monogram';

export type AccountRole = 'owner' | 'admin' | 'finance' | 'member' | 'client';

export interface AvatarViewer {
  id: number;
  roles: readonly AccountRole[];
  /** مجوزِ «اعضا» — فهرستِ کاملِ اعضا را با عکس می‌بیند. */
  canViewMembers: boolean;
}

/** فقط نقشِ کارفرما دارد؟ */
export function isClientOnlyAccount(roles: readonly AccountRole[]): boolean {
  return roles.length > 0 && roles.every((r) => r === 'client');
}

/**
 * آیا بیننده عکسِ این شخص را می‌بیند؟
 *
 *  ۱. عکسِ خودش، مالک و دارندهٔ مجوزِ «اعضا» — همیشه.
 *  ۲. کارفرمای خالص اعضا را با نامِ نقش می‌بیند ← عکسِ هیچ‌کس جز خودش.
 *  ۳. همکار کارفرما را فقط «کارفرما» می‌بیند ← عکسِ کارفرمای خالص نه.
 *  ۴. همکارِ ادمین برای بقیه «دستیارِ مدیر» است ← عکسش نه.
 *  ۵. بقیهٔ همکاران — بله.
 */
export function canSeeAvatar(viewer: AvatarViewer, target: { id: number; roles: readonly AccountRole[] }): boolean {
  if (viewer.id === target.id) return true;
  if (viewer.roles.includes('owner') || viewer.canViewMembers) return true;
  // ⚠️ حتی عکسِ مالک نه: اگر مالک عضوِ پروژه هم باشد، کارفرما او را با نامِ
  // نقشش می‌بیند و چهرهٔ واقعی کنارِ «دولوپر» همان ماسک را می‌شکست.
  if (isClientOnlyAccount(viewer.roles)) return false;
  if (isClientOnlyAccount(target.roles)) return false;
  if (target.roles.includes('admin') && !target.roles.includes('owner')) return false;
  return target.roles.length > 0;
}

/**
 * حرف(های) جایگزین: نامِ لاتین دو حرف («MS»)، نامِ فارسی/عربی یک حرف —
 * دو حرفِ فارسی کنارِ هم به هم می‌چسبند و یک کلمهٔ بی‌معنا می‌سازند.
 */
export function avatarInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  const first = [...words[0]!][0]!;
  if (!/^[A-Za-z]$/.test(first)) return first;
  const second = words.length > 1 ? [...words[words.length - 1]!][0]! : '';
  return (first + (/^[A-Za-z]$/.test(second) ? second : '')).toUpperCase();
}

/** رنگِ ثابتِ هر شخص — از شناسه، تا با تغییرِ نام عوض نشود. */
export function avatarColor(userId: number): string {
  const hash = stableHash(`user|${userId}`);
  const h1 = hash % 360;
  const h2 = (h1 + 40 + ((hash >> 8) % 40)) % 360;
  return `linear-gradient(135deg, hsl(${h1} 62% 52%) 0%, hsl(${h2} 66% 40%) 100%)`;
}
