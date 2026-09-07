import { describe, it, expect } from 'vitest';
import { KIND_LABEL, kindOf, structuredBody } from './display';

describe('kindOf', () => {
  it('همهٔ نوع‌های واقعیِ سامانه دستهٔ درست می‌گیرند', () => {
    expect(kindOf('task.assigned')).toBe('task');
    expect(kindOf('task.review')).toBe('task');
    expect(kindOf('task.back')).toBe('task');
    expect(kindOf('comment')).toBe('comment');
    expect(kindOf('review')).toBe('comment');
    expect(kindOf('meeting.invited')).toBe('meeting');
    expect(kindOf('meeting_soon')).toBe('meeting');
    expect(kindOf('payment.requested')).toBe('money');
    expect(kindOf('payment.decided')).toBe('money');
    expect(kindOf('message.received')).toBe('message');
    expect(kindOf('tender_opened')).toBe('project');
  });

  it('⚠️ «پیام جدید» و «پاسخِ تازه» یک دسته‌اند — دسته از نوع می‌آید نه عنوان', () => {
    // هر دو با همین `type` نوشته می‌شوند؛ فقط عنوانشان فرق دارد.
    expect(kindOf('message.received')).toBe(kindOf('message.received'));
    expect(KIND_LABEL[kindOf('message.received')]).toBe('پیام');
  });

  it('نوعِ ناشناخته دستهٔ عمومی می‌گیرد، نه خطا', () => {
    expect(kindOf('timer_running')).toBe('other');
    expect(kindOf('')).toBe('other');
  });

  it('هر دسته برچسب دارد', () => {
    for (const kind of Object.keys(KIND_LABEL)) expect(KIND_LABEL[kind as never]).toBeTruthy();
  });
});

describe('structuredBody', () => {
  it('بدنهٔ جلسه به سطرهای برچسب/مقدار باز می‌شود', () => {
    expect(structuredBody('meeting.invited', 'زمان: 2026-09-13 14:08 · مکان: یه جایی · پروژه: آلفا')).toEqual([
      { label: 'زمان', value: '2026-09-13 14:08' },
      { label: 'مکان', value: 'یه جایی' },
      { label: 'پروژه', value: 'آلفا' },
    ]);
  });

  it('تکِ «زمان» هم سطرِ خودش را می‌گیرد', () => {
    expect(structuredBody('meeting_soon', 'زمان: 2026-09-13 14:08')).toEqual([
      { label: 'زمان', value: '2026-09-13 14:08' },
    ]);
  });

  it('در زبان‌های دیگر هم کار می‌کند — جداکننده و شکل یکی است', () => {
    expect(structuredBody('meeting.invited', 'Time: 2026-09-13 14:08 · Location: somewhere')).toEqual([
      { label: 'Time', value: '2026-09-13 14:08' },
      { label: 'Location', value: 'somewhere' },
    ]);
  });

  it('⚠️ متنِ آدم‌ها هرگز تکه نمی‌شود', () => {
    // پیام و کامنت: بدنه متنِ آزاد است، حتی اگر «:» و « · » داشته باشد.
    expect(structuredBody('message.received', 'سلام: فردا میای؟ · راستی')).toBeNull();
    expect(structuredBody('comment', 'باگ: صفحهٔ ورود')).toBeNull();
    expect(structuredBody('task.assigned', 'باگ: صفحهٔ ورود')).toBeNull();
  });

  it('⚠️ بدنهٔ جلسه‌ای که شکلش نمی‌خورد دست‌نخورده می‌ماند', () => {
    expect(structuredBody('meeting.invited', 'یک توضیحِ آزاد بدونِ برچسب')).toBeNull();
    // یک تکهٔ ناجور کلِ بدنه را از تجزیه بیرون می‌برد.
    expect(structuredBody('meeting.invited', 'زمان: ۱۴:۰۸ · بدونِ برچسب')).toBeNull();
    expect(structuredBody('meeting.invited', '')).toBeNull();
  });

  it('برچسبِ خیلی بلند برچسب نیست — یعنی جمله است', () => {
    expect(structuredBody('meeting.invited', 'این یک جملهٔ بلند و کاملاً عادی است: بله')).toBeNull();
  });
});
