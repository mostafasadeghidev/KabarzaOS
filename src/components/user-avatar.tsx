'use client';

import { Avatar, AvatarFallback, AvatarGroup, AvatarGroupCount, AvatarImage } from '@/components/ui/avatar';
import { avatarColor, avatarInitials } from '@/domain/people/avatar';
import { cn } from '@/lib/utils';

/**
 * آواتارِ یک عضو — **تنها** جایی که چهرهٔ اعضا کنارِ نامشان رندر می‌شود.
 *
 * - عکس از `/api/users/{id}/avatar` (نسخهٔ کوچک)؛ سرور تصمیم می‌گیرد بدهد یا
 *   نه. ⚠️ برای کارفرما عکسِ اعضا نمی‌آید — همان جایی که نامشان هم «نامِ نقش»
 *   است — پس پنهان‌کاری با چهره لو نمی‌رود.
 * - نبودنِ عکس (یا اجازه) ← حرفِ اولِ همان نامی که نمایش داده می‌شود، روی
 *   رنگِ ثابتِ آن شخص. برای نامِ پنهان‌شده (`userId` تهی) رنگِ خنثی.
 */

const SIZES = {
  xs: 'size-5 text-[9px]',
  sm: 'size-6 text-[10px]',
  md: 'size-8 text-xs',
  lg: 'size-10 text-sm',
} as const;
export type AvatarSize = keyof typeof SIZES;

export function UserAvatar({
  userId,
  name,
  size = 'sm',
  className,
}: {
  /** تهی = شخصِ ناشناس یا نامِ پنهان‌شده؛ عکسی درخواست نمی‌شود. */
  userId: number | null | undefined;
  /** همان نامی که کنارش نمایش داده می‌شود (شاید «کارفرما» یا نامِ نقش). */
  name: string | null | undefined;
  size?: AvatarSize;
  className?: string;
}) {
  const label = name?.trim() || '?';
  return (
    <Avatar className={cn(SIZES[size], className)} title={label}>
      {userId ? <AvatarImage src={`/api/users/${userId}/avatar`} alt="" className="object-cover" /> : null}
      <AvatarFallback
        className={cn('font-semibold', userId ? 'text-white' : 'bg-muted text-muted-foreground')}
        style={userId ? { background: avatarColor(userId) } : undefined}
        // ⚠️ عکس اگر بیاید فوری جایگزین می‌شود؛ تأخیر نمی‌گذاریم تا حرف چشمک نزند.
      >
        {avatarInitials(label)}
      </AvatarFallback>
    </Avatar>
  );
}

/** آواتار + نام در یک خط — شکلِ رایجِ «مسئول: …»، نویسندهٔ کامنت و ستونِ جدول. */
export function UserName({
  userId,
  name,
  size = 'xs',
  className,
  nameClassName,
}: {
  userId: number | null | undefined;
  name: string | null | undefined;
  size?: AvatarSize;
  className?: string;
  nameClassName?: string;
}) {
  if (!name) return null;
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1.5 align-middle', className)}>
      <UserAvatar userId={userId} name={name} size={size} />
      <span className={cn('min-w-0 truncate', nameClassName)}>{name}</span>
    </span>
  );
}

/** ردیفِ آواتارهای روی‌هم (اعضای پروژه) با «+n» برای بقیه. */
export function UserAvatarStack({
  people,
  max = 4,
  size = 'sm',
  className,
}: {
  people: ReadonlyArray<{ userId: number | null; name: string }>;
  max?: number;
  size?: AvatarSize;
  className?: string;
}) {
  if (people.length === 0) return null;
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;
  return (
    <AvatarGroup className={className} title={people.map((p) => p.name).join('، ')}>
      {shown.map((p, i) => <UserAvatar key={`${p.userId ?? 'x'}-${i}`} userId={p.userId} name={p.name} size={size} />)}
      {rest > 0 && <AvatarGroupCount className={cn(SIZES[size], 'num')}>+{rest}</AvatarGroupCount>}
    </AvatarGroup>
  );
}

/**
 * `renderMedia` ِ انتخابگرهایی که مقدارشان شناسهٔ شخص است — آواتارِ کوچک
 * کنارِ هر نام. مقدارِ ناشناس (مثلاً «همه» یا «تعیین‌نشده») چیزی نمی‌گیرد.
 */
export function avatarFor(people: ReadonlyArray<{ id: number; name: string }>, prefix = '') {
  return (value: string) => {
    if (prefix && !value.startsWith(prefix)) return null;
    const id = Number(prefix ? value.slice(prefix.length) : value);
    const person = people.find((p) => p.id === id);
    return person ? <UserAvatar userId={person.id} name={person.name} size="xs" /> : null;
  };
}
