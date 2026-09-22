import { describe, it, expect } from 'vitest';
import {
  AccessError, accessMessage, assertRevocable, assertServiceName, countByService,
  countByUser, isOpen, normalizeKind, normalizeLevel, openGrants, openRisks, planGrant,
  type GrantLike,
} from './service-grants';
import type { MemberState } from '@/domain/people/offboarding';

const grant = (over: Partial<GrantLike> = {}): GrantLike => ({
  id: 1, serviceId: 10, userId: 100, level: 'member', revokedAt: null, ...over,
});

describe('نرمال‌سازیِ ورودی', () => {
  it('دستهٔ ناشناخته به «سایر» می‌افتد، نه خطا', () => {
    expect(normalizeKind('ai')).toBe('ai');
    expect(normalizeKind('quantum')).toBe('other');
  });

  it('سطحِ ناشناخته به «کاربر» می‌افتد', () => {
    expect(normalizeLevel('admin')).toBe('admin');
    expect(normalizeLevel('root')).toBe('member');
  });

  it('نامِ خالی رد می‌شود، فاصله‌ها بریده می‌شوند', () => {
    expect(assertServiceName('  ChatGPT  ')).toBe('ChatGPT');
    expect(() => assertServiceName('   ')).toThrow(AccessError);
  });
});

describe('R-ACCESS-01 — گرنتِ باز در برابرِ قطع‌شده', () => {
  it('«باز» یعنی تاریخِ قطع ندارد', () => {
    expect(isOpen(grant())).toBe(true);
    expect(isOpen(grant({ revokedAt: new Date() }))).toBe(false);
  });

  it('فهرستِ بازها فقط قطع‌نشده‌ها را می‌دهد', () => {
    const rows = [grant({ id: 1 }), grant({ id: 2, revokedAt: new Date() })];
    expect(openGrants(rows).map((g) => g.id)).toEqual([1]);
  });
});

describe('R-ACCESS-03 — اعطای دوباره ردیفِ تکراری نمی‌سازد', () => {
  const base = {
    serviceId: 10, userId: 100, serviceActive: true,
    memberState: 'active' as MemberState, openGrantId: null as number | null,
  };

  it('بدونِ گرنتِ باز، ردیفِ تازه ساخته می‌شود', () => {
    expect(planGrant(base)).toEqual({ action: 'create', grantId: null });
  });

  it('⚠️ با گرنتِ باز، همان ردیف به‌روز می‌شود — نه درجِ دوم', () => {
    // شاخصِ یکتای جزئی درجِ دوم را با خطای دیتابیس رد می‌کند؛ بدونِ این
    // قاعده کاربر فقط یک ۵۰۰ ِ نامفهوم می‌دید.
    expect(planGrant({ ...base, openGrantId: 7 })).toEqual({ action: 'update', grantId: 7 });
  });

  it('سرویس و شخص هر دو لازم‌اند', () => {
    expect(() => planGrant({ ...base, serviceId: null })).toThrow(AccessError);
    expect(() => planGrant({ ...base, userId: null })).toThrow(AccessError);
  });

  it('سرویسِ غیرفعال دسترسیِ تازه نمی‌دهد', () => {
    expect(() => planGrant({ ...base, serviceActive: false })).toThrow(AccessError);
  });

  it('⚠️ به عضوِ سابق دسترسیِ تازه داده نمی‌شود', () => {
    // وگرنه همان شکافی که این ماژول برای بستنش ساخته شده، از راهِ خودش باز می‌ماند.
    for (const state of ['finance', 'locked'] as MemberState[]) {
      expect(() => planGrant({ ...base, memberState: state })).toThrow(AccessError);
    }
  });
});

describe('قطعِ دسترسی', () => {
  it('گرنتِ ناموجود خطا می‌دهد', () => {
    expect(() => assertRevocable(undefined)).toThrow(AccessError);
  });

  it('⚠️ قطعِ دوباره خطاست، نه بی‌اثر — وگرنه تاریخِ قطع بازنویسی می‌شد', () => {
    expect(() => assertRevocable(grant({ revokedAt: new Date() }))).toThrow(AccessError);
    expect(() => assertRevocable(grant())).not.toThrow();
  });

  it('هر کدِ خطا پیامِ خودش را دارد', () => {
    expect(accessMessage('member_inactive')).toContain('عضوِ سابق');
    expect(accessMessage('already_revoked')).toContain('قطع');
  });
});

describe('⚠️ عضوِ سابق با دسترسیِ باز — قلبِ ماژول', () => {
  const states = new Map<number, MemberState>([
    [100, 'active'], [200, 'locked'], [300, 'finance'],
  ]);

  it('فقط غیرفعال‌ها را برمی‌گرداند', () => {
    const rows = [
      grant({ id: 1, userId: 100 }),
      grant({ id: 2, userId: 200, serviceId: 11 }),
      grant({ id: 3, userId: 300, serviceId: 12 }),
    ];
    expect(openRisks(rows, states).map((r) => r.userId).sort()).toEqual([200, 300]);
  });

  it('گرنتِ قطع‌شدهٔ عضوِ سابق دیگر ریسک نیست', () => {
    const rows = [grant({ id: 2, userId: 200, revokedAt: new Date() })];
    expect(openRisks(rows, states)).toEqual([]);
  });

  it('بیشترین دسترسیِ باز اول می‌آید', () => {
    const rows = [
      grant({ id: 1, userId: 300, serviceId: 10 }),
      grant({ id: 2, userId: 200, serviceId: 10 }),
      grant({ id: 3, userId: 200, serviceId: 11 }),
    ];
    const risks = openRisks(rows, states);
    expect(risks[0]!.userId).toBe(200);
    expect(risks[0]!.grantIds).toHaveLength(2);
  });

  it('کاربرِ ناشناخته «فعال» فرض می‌شود، نه ریسک', () => {
    expect(openRisks([grant({ userId: 999 })], states)).toEqual([]);
  });
});

describe('شمارش‌ها فقط بازها را می‌شمارند', () => {
  const rows = [
    grant({ id: 1, serviceId: 10, userId: 100 }),
    grant({ id: 2, serviceId: 10, userId: 200 }),
    grant({ id: 3, serviceId: 11, userId: 100 }),
    grant({ id: 4, serviceId: 11, userId: 200, revokedAt: new Date() }),
  ];

  it('به تفکیکِ سرویس', () => {
    expect(countByService(rows).get(10)).toBe(2);
    expect(countByService(rows).get(11)).toBe(1);
  });

  it('به تفکیکِ شخص', () => {
    expect(countByUser(rows).get(100)).toBe(2);
    expect(countByUser(rows).get(200)).toBe(1);
  });
});
