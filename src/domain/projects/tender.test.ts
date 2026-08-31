import { describe, it, expect } from 'vitest';
import {
  isTenderEligible, openRolesForUser, planApproveBid, planTenderRoles, planWithdrawBid,
  tenderIsOpen, tenderPhase, type Bid, validateBid,
} from './tender';

const bid = (over: Partial<Bid> = {}): Bid => ({
  id: 1, userId: 1, roleTagId: 10, amount: '500', currencyId: null, status: 'pending', ...over,
});

describe('R-TENDER-01 — فازِ مناقصه از گروهِ وضعیت می‌آید', () => {
  it('پروژهٔ غیرِ مناقصه فازی ندارد', () => {
    expect(tenderPhase(false, 'lead')).toBe('none');
  });

  it('«احتمالِ عقد قرارداد» یعنی باز', () => {
    expect(tenderPhase(true, 'lead')).toBe('open');
    expect(tenderIsOpen(true, 'lead')).toBe(true);
  });

  it('⚠️ به‌محضِ شروعِ کار بسته می‌شود', () => {
    // وگرنه برندهٔ یک پروژهٔ در حالِ اجرا قابلِ تعویض می‌ماند.
    expect(tenderPhase(true, 'in_progress')).toBe('closed');
    expect(tenderPhase(true, 'completed')).toBe('closed');
    expect(tenderIsOpen(true, 'in_progress')).toBe(false);
  });

  it('لغو فازِ خودش را دارد', () => {
    expect(tenderPhase(true, 'cancelled')).toBe('cancelled');
  });

  it('بدونِ وضعیت هم بسته است', () => {
    expect(tenderPhase(true, null)).toBe('closed');
  });
});

describe('تأییدِ پیشنهاد', () => {
  const ctx = { isOpen: true, projectCurrencyId: 3 };

  it('⚠️ مناقصهٔ بسته اصلاً تأیید نمی‌پذیرد', () => {
    expect(planApproveBid(bid(), [], { ...ctx, isOpen: false })).toEqual({ action: 'locked' });
  });

  it('تأییدِ دوبارهٔ همان پیشنهاد بی‌اثر است', () => {
    expect(planApproveBid(bid({ status: 'approved' }), [], ctx)).toEqual({ action: 'noop' });
  });

  it('پیشنهادِ تازه ساین می‌شود و ارزِ پروژه را می‌گیرد', () => {
    const plan = planApproveBid(bid(), [], ctx);
    expect(plan.action).toBe('approve');
    expect(plan.action === 'approve' && plan.sign).toEqual({
      userId: 1, roleTagId: 10, amount: '500', currencyId: 3,
    });
  });

  it('ارزِ خودِ پیشنهاد بر ارزِ پروژه مقدم است', () => {
    const plan = planApproveBid(bid({ currencyId: 9 }), [], ctx);
    expect(plan.action === 'approve' && plan.sign.currencyId).toBe(9);
  });

  it('⚠️ برندهٔ قبلیِ همان نقش کنار می‌رود', () => {
    // وگرنه دو نفر هم‌زمان برندهٔ یک نقش می‌ماندند و هر دو دستمزد داشتند.
    const winner = bid({ id: 7, userId: 4, status: 'approved' });
    const plan = planApproveBid(bid({ id: 8, userId: 5 }), [winner, bid({ id: 8, userId: 5 })], ctx);
    expect(plan.action === 'approve' && plan.unseat).toEqual({ bidId: 7, userId: 4 });
  });

  it('⚠️ برندهٔ نقشِ دیگر دست‌نخورده می‌ماند — سقفِ قیمت per-role است', () => {
    const otherRoleWinner = bid({ id: 7, userId: 4, roleTagId: 20, status: 'approved' });
    const plan = planApproveBid(bid({ id: 8, roleTagId: 10 }), [otherRoleWinner], ctx);
    expect(plan.action === 'approve' && plan.unseat).toBeNull();
  });
});

describe('پس‌گرفتنِ پیشنهاد', () => {
  it('⚠️ پس‌گرفتنِ پیشنهادِ برنده عضویتش را هم برمی‌دارد', () => {
    // وگرنه کسی که دیگر برنده نیست همچنان روی پروژه دستمزد داشت.
    expect(planWithdrawBid(bid({ status: 'approved' }))).toEqual({
      unsign: true, nextStatus: 'withdrawn',
    });
  });

  it('پیشنهادِ در انتظار عضویتی ندارد که برداشته شود', () => {
    expect(planWithdrawBid(bid({ status: 'pending' }))).toEqual({
      unsign: false, nextStatus: 'withdrawn',
    });
  });
});

describe('مناقصه از سمتِ عضو', () => {
  const base = {
    isTender: true,
    tenderRoleIds: [5, 6],
    userRoleTagIds: [5],
    awardedRoleIds: [] as number[],
  };

  it('فقط نقشی که کاربر دارد و هنوز واگذار نشده', () => {
    expect(openRolesForUser(base)).toEqual([5]);
    expect(isTenderEligible(base)).toBe(true);
  });

  it('⚠️ واگذاریِ یک نقش، نقشِ دیگر را نمی‌بندد', () => {
    // گاردِ سطحِ پروژه بقیهٔ نقش‌ها را هم بی‌دلیل می‌بست.
    const both = { ...base, userRoleTagIds: [5, 6], awardedRoleIds: [5] };
    expect(openRolesForUser(both)).toEqual([6]);
  });

  it('نقشِ واگذارشده دیگر باز نیست', () => {
    expect(openRolesForUser({ ...base, awardedRoleIds: [5] })).toEqual([]);
    expect(isTenderEligible({ ...base, awardedRoleIds: [5] })).toBe(false);
  });

  it('کسی که نقش را ندارد واجدِ شرایط نیست', () => {
    expect(openRolesForUser({ ...base, userRoleTagIds: [9] })).toEqual([]);
  });

  it('پروژهٔ غیرِمناقصه‌ای هیچ نقشِ بازی ندارد', () => {
    expect(openRolesForUser({ ...base, isTender: false })).toEqual([]);
  });
});

describe('اعتبارسنجیِ پیشنهاد', () => {
  const ok = { amount: '500', cap: '1000', roleIsAwarded: false, tenderIsOpen: true };

  it('پیشنهادِ زیرِ سقف مجاز است', () => {
    expect(validateBid(ok)).toBeNull();
  });

  it('دقیقاً روی سقف مجاز است', () => {
    expect(validateBid({ ...ok, amount: '1000' })).toBeNull();
  });

  it('بیش از سقف رد می‌شود', () => {
    expect(validateBid({ ...ok, amount: '1500' })).toBe('over_cap');
  });

  it('⚠️ سقفِ صفر یعنی «بدونِ سقف»، نه «سقفِ صفر»', () => {
    // وگرنه هر پیشنهادی روی نقشِ بی‌سقف رد می‌شد.
    expect(validateBid({ ...ok, cap: '0', amount: '99999' })).toBeNull();
    expect(validateBid({ ...ok, cap: null, amount: '99999' })).toBeNull();
  });

  it('مبلغِ صفر و منفی رد می‌شوند', () => {
    expect(validateBid({ ...ok, amount: '0' })).toBe('amount_invalid');
    expect(validateBid({ ...ok, amount: '-5' })).toBe('amount_invalid');
  });

  it('نقشِ واگذارشده و مناقصهٔ بسته رد می‌شوند', () => {
    expect(validateBid({ ...ok, roleIsAwarded: true })).toBe('role_closed');
    expect(validateBid({ ...ok, tenderIsOpen: false })).toBe('tender_closed');
  });

  it('بستنِ مناقصه بر بقیهٔ دلایل مقدم است', () => {
    expect(validateBid({ ...ok, tenderIsOpen: false, roleIsAwarded: true, amount: '0' }))
      .toBe('tender_closed');
  });
});

describe('جدولِ نقش/سقفِ مناقصه', () => {
  it('نقش و سقف ذخیره می‌شوند', () => {
    const plan = planTenderRoles({
      checked: true,
      rows: [{ roleTagId: 5, cap: '800' }],
      previouslyAnnounced: [],
    });
    expect(plan.isTender).toBe(true);
    expect(plan.roles).toEqual({ '5': '800.0000' });
  });

  it('⚠️ تیکِ مناقصه بدونِ نقش، مناقصه نیست', () => {
    // پروژه‌ای که هیچ‌کس نمی‌تواند برایش پیشنهاد بدهد.
    const plan = planTenderRoles({ checked: true, rows: [], previouslyAnnounced: [] });
    expect(plan.isTender).toBe(false);
    expect(plan.roles).toEqual({});
  });

  it('نقشِ بدونِ تیک هم مناقصه نمی‌سازد', () => {
    const plan = planTenderRoles({
      checked: false,
      rows: [{ roleTagId: 5, cap: '800' }],
      previouslyAnnounced: [],
    });
    expect(plan.isTender).toBe(false);
  });

  it('سقفِ نامعتبر یا منفی یعنی «بدونِ سقف»', () => {
    const plan = planTenderRoles({
      checked: true,
      rows: [{ roleTagId: 5, cap: 'abc' }, { roleTagId: 6, cap: '-3' }],
      previouslyAnnounced: [],
    });
    expect(plan.roles).toEqual({ '5': '0.0000', '6': '0.0000' });
  });

  it('ردیفِ خالی نادیده گرفته می‌شود', () => {
    const plan = planTenderRoles({
      checked: true,
      rows: [{ roleTagId: 0, cap: '100' }, { roleTagId: 5, cap: '800' }],
      previouslyAnnounced: [],
    });
    expect(Object.keys(plan.roles)).toEqual(['5']);
  });

  it('⚠️ فقط نقشِ تازه اعلام می‌شود، نه همه دوباره', () => {
    // افزودنِ «حسابدار» نباید دوباره به دولوپرها پیام بدهد.
    const plan = planTenderRoles({
      checked: true,
      rows: [{ roleTagId: 5, cap: '800' }, { roleTagId: 6, cap: '0' }],
      previouslyAnnounced: [5],
    });
    expect(plan.newlyAnnounced).toEqual([6]);
    expect(plan.announced.sort()).toEqual([5, 6]);
  });

  it('ذخیرهٔ بدونِ تغییر هیچ اعلانی نمی‌فرستد', () => {
    const plan = planTenderRoles({
      checked: true,
      rows: [{ roleTagId: 5, cap: '800' }],
      previouslyAnnounced: [5],
    });
    expect(plan.newlyAnnounced).toEqual([]);
  });

  it('⚠️ خاموش‌کردنِ مناقصه فهرستِ اعلام را صفر می‌کند', () => {
    // تا بازکردنِ دوباره از نو اعلام شود.
    const plan = planTenderRoles({ checked: false, rows: [], previouslyAnnounced: [5, 6] });
    expect(plan.announced).toEqual([]);
  });
});
