import { describe, expect, it } from 'vitest';
import {
  amountFromSettled, isTagSelectable, rateFromAmounts, relocateParty,
  requiresDescription, selectableTags, settledCurrencyId, showsBillable,
  showsRecurring, showsSettled, showsUnitPicker, visibleParty,
} from '../form-rules';

describe('R-FORM-01 — طرفِ حساب با جهت عوض می‌شود', () => {
  it('واریز ← پرداخت‌کننده · برداشت ← دریافت‌کننده', () => {
    expect(visibleParty('in')).toBe('payer');
    expect(visibleParty('out')).toBe('receiver');
  });

  it('⚠️ مقدار به خانهٔ نمایان منتقل می‌شود و خانهٔ پنهان پاک', () => {
    // بدونِ این، ردیف با پرداخت‌کنندهٔ نامرئی ذخیره می‌شد.
    const after = relocateParty(
      { payer: { userId: 7, label: 'مالک' }, receiver: { userId: null, label: '' } },
      'out',
    );
    expect(after.receiver).toEqual({ userId: 7, label: 'مالک' });
    expect(after.payer).toEqual({ userId: null, label: '' });
  });

  it('اگر خانهٔ مقصد پر باشد، رونویسی نمی‌شود', () => {
    const after = relocateParty(
      { payer: { userId: 7, label: 'مالک' }, receiver: { userId: 9, label: 'سارا' } },
      'out',
    );
    expect(after.receiver.userId).toBe(9);
    expect(after.payer.userId).toBeNull();
  });

  it('برگشت به جهتِ قبلی هم همان‌طور کار می‌کند', () => {
    const out = relocateParty(
      { payer: { userId: 7, label: 'مالک' }, receiver: { userId: null, label: '' } },
      'out',
    );
    const back = relocateParty(out, 'in');
    expect(back.payer.userId).toBe(7);
    expect(back.receiver.userId).toBeNull();
  });

  it('نامِ آزادِ بدونِ شناسه هم منتقل می‌شود', () => {
    const after = relocateParty(
      { payer: { userId: null, label: 'فروشندهٔ آزاد' }, receiver: { userId: null, label: '' } },
      'out',
    );
    expect(after.receiver.label).toBe('فروشندهٔ آزاد');
  });
});

describe('R-FORM-02 — چک‌باکسِ بازپرداخت', () => {
  const base = { direction: 'out' as const, projectId: 5, receiverUserId: null, projectMemberIds: [9] };

  it('برداشت + پروژه + دریافت‌کنندهٔ غیرِعضو → دیده می‌شود', () => {
    expect(showsBillable({ ...base, receiverUserId: 3 })).toBe(true);
  });

  it('⚠️ دریافت‌کنندهٔ عضوِ پروژه → پنهان (دستمزد است، نه هزینهٔ قابلِ بازپرداخت)', () => {
    expect(showsBillable({ ...base, receiverUserId: 9 })).toBe(false);
  });

  it('واریز هرگز', () => {
    expect(showsBillable({ ...base, direction: 'in' })).toBe(false);
  });

  it('بدونِ پروژه هرگز', () => {
    expect(showsBillable({ ...base, projectId: null })).toBe(false);
  });
});

describe('R-FORM-03 — هزینهٔ دوره‌ای فقط برای برداشت', () => {
  it('برداشت بله، واریز نه', () => {
    expect(showsRecurring('out')).toBe(true);
    expect(showsRecurring('in')).toBe(false);
  });
});

describe('R-FORM-04 — تگ‌ها با جهت فیلتر می‌شوند', () => {
  const tags = [
    { id: 1, name: 'درآمدِ پروژه', dir: 'in' },
    { id: 2, name: 'هزینهٔ دفتر', dir: 'out' },
    { id: 3, name: 'عمومی', dir: 'both' },
  ];

  it('فقط تگِ همان جهت و «both»', () => {
    expect(selectableTags(tags, 'out', []).map((t) => t.id)).toEqual([2, 3]);
    expect(selectableTags(tags, 'in', []).map((t) => t.id)).toEqual([1, 3]);
  });

  it('⚠️ تگِ انتخاب‌شده با تغییرِ جهت نمی‌افتد', () => {
    // وگرنه ویرایشِ یک ردیف، تگِ ذخیره‌شده‌اش را بی‌صدا می‌انداخت.
    expect(isTagSelectable(tags[0]!, 'out', true)).toBe(true);
    expect(selectableTags(tags, 'out', [1]).map((t) => t.id)).toEqual([1, 2, 3]);
  });

  it('تگِ بدونِ جهت مثلِ both رفتار می‌کند', () => {
    expect(isTagSelectable({ id: 9, name: 'x', dir: '' }, 'in', false)).toBe(true);
  });
});

describe('R-FORM-05 — بلوکِ معادل', () => {
  it('فقط با پروژه دیده می‌شود', () => {
    expect(showsSettled(5)).toBe(true);
    expect(showsSettled(null)).toBe(false);
  });

  const maps = {
    memberCurrency: new Map([['5:9', 3]]),
    projectCurrency: new Map([[5, 2]]),
    defaultCurrencyId: 1,
  };

  it('⚠️ برداشت به عضو ← ارزِ قراردادِ همان عضو، نه ارزِ پروژه', () => {
    expect(settledCurrencyId({
      direction: 'out', projectId: 5, receiverUserId: 9, ...maps,
    })).toBe(3);
  });

  it('عضوِ بدونِ ارزِ قرارداد ← ارزِ پروژه', () => {
    expect(settledCurrencyId({
      direction: 'out', projectId: 5, receiverUserId: 99, ...maps,
    })).toBe(2);
  });

  it('واریز ← ارزِ پروژه', () => {
    expect(settledCurrencyId({
      direction: 'in', projectId: 5, receiverUserId: 9, ...maps,
    })).toBe(2);
  });

  it('پروژهٔ بدونِ ارز ← ارزِ پیش‌فرض', () => {
    expect(settledCurrencyId({
      direction: 'in', projectId: 77, receiverUserId: null, ...maps,
    })).toBe(1);
  });

  it('بدونِ پروژه ← هیچ', () => {
    expect(settledCurrencyId({
      direction: 'in', projectId: null, receiverUserId: null, ...maps,
    })).toBeNull();
  });
});

describe('نرخِ تبدیلِ دوطرفه', () => {
  it('مبلغ = معادل × نرخ', () => {
    expect(amountFromSettled(80, 1000)).toBe(80000);
  });

  it('نرخ = مبلغ ÷ معادل', () => {
    expect(rateFromAmounts(80000, 80)).toBe(1000);
  });

  it('⚠️ تا شش رقم گرد می‌شود تا دنبالهٔ اعشارِ شناور نماند', () => {
    expect(rateFromAmounts(1, 3)).toBe(0.333333);
  });

  it('ورودیِ نامعتبر null می‌دهد، نه NaN', () => {
    expect(amountFromSettled(80, 0)).toBeNull();
    expect(rateFromAmounts(80, 0)).toBeNull();
    expect(rateFromAmounts(Number.NaN, 5)).toBeNull();
  });
});

describe('R-FORM-06 و R-FORM-07', () => {
  it('انتخابگرِ کارکرد: برداشت + پروژه + دریافت‌کننده', () => {
    expect(showsUnitPicker({ direction: 'out', projectId: 5, receiverUserId: 9 })).toBe(true);
    expect(showsUnitPicker({ direction: 'in', projectId: 5, receiverUserId: 9 })).toBe(false);
    expect(showsUnitPicker({ direction: 'out', projectId: null, receiverUserId: 9 })).toBe(false);
    expect(showsUnitPicker({ direction: 'out', projectId: 5, receiverUserId: null })).toBe(false);
  });

  it('ردیفِ پروژه‌دار توضیح لازم دارد', () => {
    expect(requiresDescription(5)).toBe(true);
    expect(requiresDescription(null)).toBe(false);
  });
});
