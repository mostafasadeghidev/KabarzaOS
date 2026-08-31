import { describe, it, expect } from 'vitest';
import { diffMembers, planAddMember, type ExistingMember, type MemberInput } from './members';
import {
  impactState, planDelete, canLighten, canSetParent, ProjectDeleteError,
  assertCanLighten, LightenError, LIGHTEN_KEEPS, LIGHTEN_PURGES,
  type ProjectImpact,
} from './lifecycle';

const impact = (over: Partial<ProjectImpact> = {}): ProjectImpact => ({
  ledgerRows: 0, paymentRows: 0, timelogRows: 0, openRequests: 0,
  clientPartiallyPaid: false, memberPartiallyPaid: false, ...over,
});

describe('R-PROJ-09 — کلید (کاربر، نقش) است', () => {
  it('عضو با دو نقشِ متفاوت دو ردیف می‌گیرد', () => {
    const d = diffMembers(
      [{ userId: 1, roleTagId: 10, agreedAmount: '600' }, { userId: 1, roleTagId: 20, agreedAmount: '400' }],
      [],
    );
    expect(d.toInsert).toHaveLength(2);
  });

  it('نقشِ تکراریِ سهوی ادغام می‌شود و مبلغِ بزرگ‌تر برنده است', () => {
    const d = diffMembers(
      [{ userId: 1, roleTagId: 10, agreedAmount: '500' }, { userId: 1, roleTagId: 10, agreedAmount: '900' }],
      [],
    );
    expect(d.toInsert).toHaveLength(1);
    expect(d.toInsert[0]!.agreedAmount).toBe('900');
  });
});

describe('R-PROJ-08 — diff، نه پاک‌کن‌و‌بنویس', () => {
  const existing: ExistingMember[] = [
    { id: 1, userId: 1, roleTagId: 10, agreedAmount: '600' },
    { id: 2, userId: 2, roleTagId: 20, agreedAmount: '400' },
  ];

  it('ذخیرهٔ دوباره بدونِ تغییر هیچ کاری نمی‌کند', () => {
    const same: MemberInput[] = [
      { userId: 1, roleTagId: 10, agreedAmount: '600' },
      { userId: 2, roleTagId: 20, agreedAmount: '400' },
    ];
    const d = diffMembers(same, existing);
    expect(d).toMatchObject({ toInsert: [], toUpdate: [], toDelete: [], newlyAdded: [] });
  });

  it('فقط عضوِ تازه اعلان می‌گیرد، نه همه', () => {
    const d = diffMembers(
      [{ userId: 1, roleTagId: 10, agreedAmount: '600' },
       { userId: 2, roleTagId: 20, agreedAmount: '400' },
       { userId: 3, roleTagId: 30, agreedAmount: '200' }],
      existing,
    );
    expect(d.newlyAdded).toEqual([3]);
  });

  it('نقشِ دومِ عضوِ موجود، او را «تازه» حساب نمی‌کند', () => {
    const d = diffMembers(
      [{ userId: 1, roleTagId: 10, agreedAmount: '600' }, { userId: 1, roleTagId: 99, agreedAmount: '100' }],
      existing,
    );
    expect(d.toInsert).toHaveLength(1);
    expect(d.newlyAdded).toEqual([]);
  });

  it('⚠️ مبلغِ هم‌ارز با دقتِ متفاوت، تغییر حساب نمی‌شود', () => {
    // دیتابیس «600» را «600.0000» برمی‌گرداند — نباید UPDATE بزند.
    const stored: ExistingMember[] = [{ id: 1, userId: 1, roleTagId: 10, agreedAmount: '600.0000' }];
    const d = diffMembers([{ userId: 1, roleTagId: 10, agreedAmount: '600' }], stored);
    expect(d.toUpdate).toEqual([]);
  });

  it('تغییرِ مبلغ به‌روزرسانی است، نه حذف‌و‌درج', () => {
    const d = diffMembers([{ userId: 1, roleTagId: 10, agreedAmount: '750' }], existing);
    expect(d.toUpdate).toHaveLength(1);
    expect(d.toUpdate[0]!.id).toBe(1);
  });

  it('ردیفِ عضوِ سابق حفظ می‌شود (ممکن است تسویه بدهکار باشیم)', () => {
    const d = diffMembers(
      [{ userId: 1, roleTagId: 10, agreedAmount: '600' }],
      existing,
      { inactiveUserIds: new Set([2]) },
    );
    expect(d.toDelete).toEqual([]);
  });

  it('عضوِ غیرفعال به‌عنوانِ انتخابِ جدید اضافه نمی‌شود', () => {
    const d = diffMembers([{ userId: 9, roleTagId: 10, agreedAmount: '100' }], [], { inactiveUserIds: new Set([9]) });
    expect(d.toInsert).toEqual([]);
  });
});

describe('R-PROJ-01 — وضعیتِ حذفِ سه‌حالته', () => {
  it('پروژهٔ خالی تمیز است', () => {
    expect(impactState(impact())).toBe('clean');
  });

  it('دادهٔ مالی یا کاری تأیید می‌خواهد', () => {
    expect(impactState(impact({ ledgerRows: 3 }))).toBe('confirm');
    expect(impactState(impact({ timelogRows: 5 }))).toBe('confirm');
    expect(impactState(impact({ openRequests: 1 }))).toBe('confirm');
  });

  it('ماندهٔ بازِ کارفرما یا عضو قفل می‌کند', () => {
    expect(impactState(impact({ clientPartiallyPaid: true }))).toBe('locked');
    expect(impactState(impact({ memberPartiallyPaid: true }))).toBe('locked');
  });

  it('R-PROJ-02 — پرداخت‌نشده قفل نیست، نیمه‌پرداخت قفل است', () => {
    expect(impactState(impact({ ledgerRows: 1 }))).toBe('confirm');
    expect(impactState(impact({ ledgerRows: 1, clientPartiallyPaid: true }))).toBe('locked');
  });
});

describe('R-PROJ-03/04 — نقشهٔ حذف', () => {
  const title = 'پروژهٔ من';

  it('پروژهٔ قفل‌شده هرگز حذف نمی‌شود', () => {
    expect(() => planDelete(impact({ clientPartiallyPaid: true }), { actualTitle: title, mode: 'full', confirmTitle: title }))
      .toThrow(ProjectDeleteError);
  });

  it('پروژهٔ تمیز آزادانه حذف می‌شود', () => {
    expect(planDelete(impact(), { actualTitle: title })).toEqual({ purgeSubordinate: true, financial: 'none' });
  });

  it('پروژهٔ داده‌دار بدونِ تأیید رد می‌شود', () => {
    expect(() => planDelete(impact({ ledgerRows: 2 }), { actualTitle: title })).toThrow(ProjectDeleteError);
  });

  it('نامِ اشتباه رد می‌شود', () => {
    expect(() => planDelete(impact({ ledgerRows: 2 }), { actualTitle: title, mode: 'full', confirmTitle: 'غلط' }))
      .toThrow(ProjectDeleteError);
  });

  it('جداسازی تراکنش‌ها را نگه می‌دارد', () => {
    expect(planDelete(impact({ ledgerRows: 2 }), { actualTitle: title, mode: 'detach', confirmTitle: title }).financial)
      .toBe('detach');
  });

  it('حذفِ کامل تراکنش‌ها را هم می‌برد', () => {
    expect(planDelete(impact({ ledgerRows: 2 }), { actualTitle: title, mode: 'full', confirmTitle: title }).financial)
      .toBe('purge');
  });
});

describe('R-PROJ-06/20 — سبک‌سازی و زیرپروژه', () => {
  it('سبک‌سازی فقط بعد از بایگانی', () => {
    expect(canLighten({ isArchived: false, lightenSummary: null })).toBe(false);
    expect(canLighten({ isArchived: true, lightenSummary: null })).toBe(true);
  });

  it('پروژهٔ سبک‌شده دوباره سبک نمی‌شود', () => {
    expect(canLighten({ isArchived: true, lightenSummary: { minutes: 10 } })).toBe(false);
  });

  it('پروژه والدِ خودش نمی‌شود', () => {
    expect(canSetParent(5, 5, null)).toBe(false);
  });

  it('⚠️ پروژه‌ای که خودش زیرپروژه دارد، فرزند نمی‌شود', () => {
    // شرطی که به‌سادگی از قلم می‌افتد؛ بدونِ آن سلسله‌مراتب دو سطح می‌شد.
    expect(canSetParent(3, 2, null, true)).toBe(false);
    expect(canSetParent(3, 2, null, false)).toBe(true);
  });

  it('عمقِ بیش از یک سطح رد می‌شود', () => {
    expect(canSetParent(3, 2, 1)).toBe(false);
    expect(canSetParent(3, 2, null)).toBe(true);
  });
});

describe('R-PROJ-10 — نقشِ خالی از پروفایلِ عضو ارث می‌برد', () => {
  const primary = new Map<number, number | null>([[1, 10], [2, null]]);

  it('بدونِ نقش، نقشِ اصلیِ عضو می‌نشیند', () => {
    const d = diffMembers([{ userId: 1, roleTagId: null, agreedAmount: '100' }], [], { primaryRoleOf: primary });
    expect(d.toInsert[0]!.roleTagId).toBe(10);
  });

  it('⚠️ ارث‌بری کلید را عوض می‌کند، پس ردیفِ موجود دوباره ساخته نمی‌شود', () => {
    // بدونِ ارث‌بری، انتخابِ همان عضو بدونِ نقش یک ردیفِ «نقشِ خالی» می‌ساخت و
    // ردیفِ نقش‌دارش را حذف می‌کرد — یعنی مبلغِ توافقی‌اش گم می‌شد.
    const existing: ExistingMember[] = [{ id: 7, userId: 1, roleTagId: 10, agreedAmount: '100' }];
    const d = diffMembers([{ userId: 1, roleTagId: null, agreedAmount: '100' }], existing, {
      primaryRoleOf: primary,
    });
    expect(d.toInsert).toHaveLength(0);
    expect(d.toDelete).toHaveLength(0);
  });

  it('عضوی که نقشِ اصلی ندارد بدونِ نقش می‌ماند', () => {
    const d = diffMembers([{ userId: 2, roleTagId: null, agreedAmount: '50' }], [], { primaryRoleOf: primary });
    expect(d.toInsert[0]!.roleTagId).toBeNull();
  });
});

describe('⚠️ همهٔ فیلدهای مالی در diff سنجیده می‌شوند', () => {
  const existing: ExistingMember[] = [
    { id: 1, userId: 1, roleTagId: 10, agreedAmount: '600', unitRate: '5', currencyId: 3 },
  ];

  it('تغییرِ نرخِ هر واحد ذخیره می‌شود', () => {
    // در پروژهٔ تعدادی کلِ دستمزد روی همین نرخ است؛ اگر diff نبیندش، کاربر
    // پیغامِ موفقیت می‌گیرد و هیچ‌چیز ذخیره نمی‌شود.
    const d = diffMembers(
      [{ userId: 1, roleTagId: 10, agreedAmount: '600', unitRate: '7', currencyId: 3 }],
      existing,
    );
    expect(d.toUpdate).toHaveLength(1);
    expect(d.toUpdate[0]!.input.unitRate).toBe('7');
  });

  it('تغییرِ ارز ذخیره می‌شود', () => {
    const d = diffMembers(
      [{ userId: 1, roleTagId: 10, agreedAmount: '600', unitRate: '5', currencyId: 9 }],
      existing,
    );
    expect(d.toUpdate).toHaveLength(1);
  });

  it('بدونِ تغییر، هیچ UPDATE ای زده نمی‌شود', () => {
    const d = diffMembers(
      [{ userId: 1, roleTagId: 10, agreedAmount: '600.0000', unitRate: '5.00', currencyId: 3 }],
      existing,
    );
    expect(d.toUpdate).toHaveLength(0);
  });
});

describe('R-PROJ-23 — عضوِ طلبکار با ویرایشِ دسته‌جمعی حذف نمی‌شود', () => {
  const existing: ExistingMember[] = [
    { id: 1, userId: 1, roleTagId: 10, agreedAmount: '600' },
    { id: 2, userId: 2, roleTagId: 20, agreedAmount: '400' },
  ];

  it('⚠️ عضوی که هنوز طلب دارد و انتخاب نشده، می‌ماند', () => {
    // وگرنه پولِ بدهکار با یک ذخیرهٔ ساده بی‌صدا ناپدید می‌شد.
    const d = diffMembers([{ userId: 1, roleTagId: 10, agreedAmount: '600' }], existing, {
      owedUserIds: new Set([2]),
    });
    expect(d.toDelete).toEqual([]);
  });

  it('عضوِ بی‌طلب با حذف از فهرست، حذف می‌شود', () => {
    const d = diffMembers([{ userId: 1, roleTagId: 10, agreedAmount: '600' }], existing, {
      owedUserIds: new Set(),
    });
    expect(d.toDelete).toEqual([2]);
  });

  it('اگر همان عضو با نقشِ دیگری انتخاب شود، نقشِ قبلی‌اش جابه‌جا می‌شود', () => {
    // «انتخاب‌شده» یعنی diff ِ عادی؛ طلبکاری جلوی تعویضِ عمدیِ نقش را نمی‌گیرد.
    const d = diffMembers(
      [{ userId: 1, roleTagId: 10, agreedAmount: '600' }, { userId: 2, roleTagId: 30, agreedAmount: '400' }],
      existing,
      { owedUserIds: new Set([2]) },
    );
    expect(d.toDelete).toEqual([2]);
    expect(d.toInsert).toHaveLength(1);
  });
});

describe('R-PROJ-24 — افزودنِ سریعِ عضو از کارت', () => {
  const existing: ExistingMember[] = [
    { id: 1, userId: 1, roleTagId: 10, agreedAmount: '600' },
  ];

  it('عضوِ تازه insert می‌شود', () => {
    const plan = planAddMember({ userId: 2, roleTagId: 20, agreedAmount: '300' }, existing)!;
    expect(plan.action).toBe('insert');
  });

  it('نقشِ دومِ همان عضو هم ردیفِ تازه است', () => {
    const plan = planAddMember({ userId: 1, roleTagId: 20, agreedAmount: '300' }, existing)!;
    expect(plan.action).toBe('insert');
  });

  it('⚠️ مبلغِ کوچک‌تر ردیف را دست نمی‌زند', () => {
    // یک کلیکِ سهوی روی «افزودن» نباید مبلغِ توافقی را کم کند.
    const plan = planAddMember({ userId: 1, roleTagId: 10, agreedAmount: '100' }, existing)!;
    expect(plan.action).toBe('keep');
  });

  it('⚠️ مبلغِ خالی (صفر) هم ردیف را دست نمی‌زند', () => {
    const plan = planAddMember({ userId: 1, roleTagId: 10, agreedAmount: '0' }, existing)!;
    expect(plan.action).toBe('keep');
  });

  it('فقط مبلغِ بزرگ‌تر یعنی افزایشِ عمدی', () => {
    const plan = planAddMember({ userId: 1, roleTagId: 10, agreedAmount: '900' }, existing)!;
    expect(plan.action).toBe('raise');
    expect(plan.existingId).toBe(1);
  });

  it('نقشِ خالی از پروفایل ارث می‌برد و به ردیفِ موجود می‌خورد', () => {
    const plan = planAddMember({ userId: 1, roleTagId: null, agreedAmount: '50' }, existing, {
      primaryRoleOf: new Map([[1, 10]]),
    })!;
    expect(plan.roleTagId).toBe(10);
    expect(plan.action).toBe('keep');
  });

  it('عضوِ غیرفعال اصلاً اضافه نمی‌شود', () => {
    const plan = planAddMember({ userId: 9, roleTagId: 10, agreedAmount: '100' }, existing, {
      inactiveUserIds: new Set([9]),
    });
    expect(plan).toBeNull();
  });
});

describe('R-PROJ-06 — سبک‌سازی فقط پس از بایگانی و فقط یک بار', () => {
  it('پروژهٔ بایگانی‌نشده سبک نمی‌شود', () => {
    // بایگانی قدمِ برگشت‌پذیرِ اول است؛ سبک‌سازی برگشت‌ناپذیر.
    expect(() => assertCanLighten({ isArchived: false, lightenSummary: null }))
      .toThrow(LightenError);
  });

  it('پروژهٔ بایگانی‌شده سبک می‌شود', () => {
    expect(() => assertCanLighten({ isArchived: true, lightenSummary: null })).not.toThrow();
  });

  it('⚠️ سبک‌سازیِ دوباره رد می‌شود', () => {
    // وگرنه عکسِ لحظه‌ایِ اول با یک عکسِ خالی بازنویسی می‌شد.
    expect(() => assertCanLighten({ isArchived: true, lightenSummary: { minutes: 10 } }))
      .toThrow(LightenError);
  });

  it('پول و پیوندهای انسانی هرگز در سبک‌سازی پاک نمی‌شوند', () => {
    for (const kept of ['ledger', 'project_payments', 'project_members', 'project_clients']) {
      expect(LIGHTEN_KEEPS).toContain(kept);
      expect(LIGHTEN_PURGES).not.toContain(kept);
    }
  });
});
