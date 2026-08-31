import { describe, expect, it } from 'vitest';
import { learnedRate, paymentNote, planPaymentMirror } from './mirror';

const base = {
  direction: 'out' as const,
  projectId: 5,
  payerUserId: null,
  receiverUserId: null,
  receiverIsMember: false,
  billable: true,
};

describe('آینهٔ پرداختِ پروژه', () => {
  it('ورودیِ پروژه ← دریافتی از کارفرما', () => {
    const plan = planPaymentMirror({ ...base, direction: 'in', payerUserId: 9 });
    expect(plan).toEqual({ direction: 'incoming', userId: 9, projectId: 5 });
  });

  it('⚠️ خروجی به عضوِ همان پروژه ← دستمزد، نه هزینه', () => {
    const plan = planPaymentMirror({ ...base, receiverUserId: 3, receiverIsMember: true });
    expect(plan).toEqual({ direction: 'member_payout', userId: 3, projectId: 5 });
  });

  it('خروجی به غیرِعضو ← هزینه؛ و «قابلِ صورتحساب» جهت را تعیین می‌کند', () => {
    expect(planPaymentMirror({ ...base, receiverUserId: 7, billable: true })?.direction)
      .toBe('project_expense');
    // ⚠️ جذب‌شده به بدهیِ کارفرما اضافه نمی‌شود.
    expect(planPaymentMirror({ ...base, receiverUserId: 7, billable: false })?.direction)
      .toBe('project_cost');
  });

  it('⚠️ عضو بودن بر «قابلِ صورتحساب» مقدم است', () => {
    // حتی با billable=false، پرداخت به عضو دستمزد است نه هزینه.
    const plan = planPaymentMirror({
      ...base, receiverUserId: 3, receiverIsMember: true, billable: false,
    });
    expect(plan?.direction).toBe('member_payout');
  });

  it('ردیفِ بی‌پروژه ولی منسوب به فرد، بدونِ پروژه آینه می‌شود', () => {
    expect(planPaymentMirror({ ...base, projectId: null, direction: 'in', payerUserId: 4 }))
      .toEqual({ direction: 'incoming', userId: 4, projectId: null });
    // ⚠️ صفر هم مثلِ null است — ورودیِ فرم ممکن است صفر بفرستد.
    expect(planPaymentMirror({ ...base, projectId: 0, receiverUserId: 4 }))
      .toEqual({ direction: 'member_payout', userId: 4, projectId: null });
  });

  it('⚠️ ردیفِ بی‌پروژه و بی‌طرف اصلاً آینه نمی‌شود', () => {
    // کارمزدِ بانک — به هیچ‌کس منسوب نیست.
    expect(planPaymentMirror({ ...base, projectId: null })).toBeNull();
    expect(planPaymentMirror({ ...base, projectId: null, direction: 'in' })).toBeNull();
  });

  it('هزینهٔ پروژه بدونِ گیرندهٔ مشخص هم ثبت می‌شود', () => {
    const plan = planPaymentMirror({ ...base, receiverUserId: null });
    expect(plan).toEqual({ direction: 'project_expense', userId: null, projectId: 5 });
  });
});

describe('یادداشتِ پرداخت', () => {
  it('نامِ پروژه را به متن می‌چسباند', () => {
    expect(paymentNote('پیش‌پرداخت', 'وب‌سایتِ آلفا'))
      .toBe('پیش‌پرداخت — بابت پروژه: وب‌سایتِ آلفا');
  });

  it('متنِ خالی فقط برچسب می‌گیرد', () => {
    expect(paymentNote('  ', 'آلفا')).toBe('بابت پروژه: آلفا');
  });

  it('⚠️ برچسبِ تکراری اضافه نمی‌شود', () => {
    const once = paymentNote('پیش‌پرداخت', 'آلفا');
    expect(paymentNote(once, 'آلفا')).toBe(once);
  });

  it('بدونِ پروژه، متن دست‌نخورده می‌ماند', () => {
    expect(paymentNote('کارمزد بانک', null)).toBe('کارمزد بانک');
  });
});

describe('آموختنِ نرخ از تسویه', () => {
  it('نرخِ تایپ‌شدهٔ کاربر مقدم است', () => {
    expect(learnedRate({
      amount: '100', amountSettled: '80', currencyId: 1, settledCurrencyId: 2, typedRate: '1.5',
    })).toEqual({ from: 2, to: 1, rate: '1.5' });
  });

  it('بدونِ نرخِ تایپ‌شده، از دو مبلغ مشتق می‌شود', () => {
    expect(learnedRate({
      amount: '100', amountSettled: '80', currencyId: 1, settledCurrencyId: 2,
    })).toEqual({ from: 2, to: 1, rate: '1.25' });
  });

  it('⚠️ تسویهٔ هم‌ارز چیزی نمی‌آموزد', () => {
    expect(learnedRate({
      amount: '100', amountSettled: '100', currencyId: 1, settledCurrencyId: 1,
    })).toBeNull();
  });

  it('بدونِ تسویه یا با نرخِ نامعتبر، null', () => {
    expect(learnedRate({ amount: '100', amountSettled: null, currencyId: 1, settledCurrencyId: 2 }))
      .toBeNull();
    expect(learnedRate({
      amount: '100', amountSettled: '0', currencyId: 1, settledCurrencyId: 2,
    })).toBeNull();
  });
});
