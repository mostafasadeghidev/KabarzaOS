import { describe, expect, it } from 'vitest';
import { avatarColor, avatarInitials, canSeeAvatar, type AccountRole } from './avatar';

const viewer = (roles: AccountRole[], canViewMembers = false) => ({ id: 1, roles, canViewMembers });
const target = (roles: AccountRole[], id = 2) => ({ id, roles });

describe('دیدنِ آواتار', () => {
  it('خودش، مالک و مجوزِ اعضا همه را می‌بینند', () => {
    expect(canSeeAvatar(viewer(['client']), target(['client'], 1))).toBe(true);
    expect(canSeeAvatar(viewer(['owner']), target(['client']))).toBe(true);
    expect(canSeeAvatar(viewer(['member'], true), target(['admin']))).toBe(true);
  });

  it('⚠️ کارفرمای خالص عکسِ هیچ‌کس را نمی‌بیند — اعضا (حتی مالکِ عضو) برایش نامِ نقش‌اند', () => {
    expect(canSeeAvatar(viewer(['client']), target(['member']))).toBe(false);
    expect(canSeeAvatar(viewer(['client']), target(['owner']))).toBe(false);
    expect(canSeeAvatar(viewer(['client']), target(['client']))).toBe(false);
  });

  it('⚠️ همکار عکسِ کارفرما و دستیارِ مدیر را نمی‌بیند؛ همکارانِ دیگر را می‌بیند', () => {
    expect(canSeeAvatar(viewer(['member']), target(['client']))).toBe(false);
    expect(canSeeAvatar(viewer(['member']), target(['admin']))).toBe(false);
    expect(canSeeAvatar(viewer(['member']), target(['member']))).toBe(true);
    expect(canSeeAvatar(viewer(['member']), target(['finance', 'member']))).toBe(true);
    // عضوی که کارفرمای پروژهٔ دیگری هم هست، همکار است.
    expect(canSeeAvatar(viewer(['member']), target(['member', 'client']))).toBe(true);
  });

  it('کاربرِ بی‌نقش (حذف‌شده) نه', () => {
    expect(canSeeAvatar(viewer(['member']), target([]))).toBe(false);
  });
});

describe('حرف و رنگ', () => {
  it('لاتین دو حرف، فارسی یک حرف', () => {
    expect(avatarInitials('Mostafa Sadeghi')).toBe('MS');
    expect(avatarInitials('aurora')).toBe('A');
    expect(avatarInitials('سارا محمدی')).toBe('س');
    expect(avatarInitials('  ')).toBe('?');
  });

  it('رنگ از شناسه پایدار است', () => {
    expect(avatarColor(5)).toBe(avatarColor(5));
    expect(avatarColor(5)).not.toBe(avatarColor(6));
  });
});
