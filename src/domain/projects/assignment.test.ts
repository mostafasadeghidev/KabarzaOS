import { describe, expect, it } from 'vitest';
import { resolveAssignment, type AssignmentFacts } from './assignment';

/** پروژه: اعضا ۱۰ و ۱۱، کارفرما ۲۰. نقش‌های معتبر: ۵ و ۶. */
const facts: AssignmentFacts = {
  projectUserIds: new Set([10, 11, 20]),
  memberRoleTagIds: new Set([5, 6]),
};

describe('تخصیصِ تسک', () => {
  it('شخصِ روی پروژه پذیرفته می‌شود', () => {
    expect(resolveAssignment({ assignedTo: 10, roleTagIds: [] }, facts))
      .toEqual({ assignedTo: 10, roleTagIds: [] });
  });

  /**
   * ⚠️ همان قاعدهٔ `valid_assignee()`: «anything else falls back to 0».
   * بدونِ این، هر کسی می‌توانست تسکی به یک کاربرِ بیرون از پروژه بچسباند.
   */
  it('شخصِ بیرون از پروژه رد می‌شود و تسک بی‌صاحب می‌ماند', () => {
    expect(resolveAssignment({ assignedTo: 99, roleTagIds: [] }, facts))
      .toEqual({ assignedTo: null, roleTagIds: [] });
  });

  it('نقشِ نامعتبر کنار گذاشته می‌شود، بقیه می‌مانند', () => {
    expect(resolveAssignment({ assignedTo: null, roleTagIds: [5, 999, 6] }, facts))
      .toEqual({ assignedTo: null, roleTagIds: [5, 6] });
  });

  it('نقشِ تکراری یک بار می‌آید', () => {
    expect(resolveAssignment({ assignedTo: null, roleTagIds: [5, 5, 5] }, facts))
      .toEqual({ assignedTo: null, roleTagIds: [5] });
  });

  it('شخص بر نقش مقدم است — نقش‌ها پاک می‌شوند', () => {
    expect(resolveAssignment({ assignedTo: 11, roleTagIds: [5, 6] }, facts))
      .toEqual({ assignedTo: 11, roleTagIds: [] });
  });

  /**
   * ⚠️ رخنه‌ای که بازکردنِ فرم برای کارفرما می‌ساخت: در UI فقط نقش می‌بیند،
   * ولی درخواست را دستی می‌سازد و شناسهٔ یک عضوِ **واقعی** را می‌گذارد.
   * چون آن عضو روی پروژه هست، بررسیِ عضویت به‌تنهایی جلویش را نمی‌گیرد.
   */
  it('کارفرمای خالص حتی با شناسهٔ عضوِ واقعی هم نمی‌تواند به شخص بدهد', () => {
    const out = resolveAssignment(
      { assignedTo: 10, roleTagIds: [5] },
      { ...facts, rolesOnly: true },
    );
    expect(out).toEqual({ assignedTo: null, roleTagIds: [5] });
  });

  it('کارفرمای خالص بدونِ نقش، تسکِ بی‌صاحب می‌سازد — نه خطا', () => {
    expect(resolveAssignment({ assignedTo: 10, roleTagIds: [] }, { ...facts, rolesOnly: true }))
      .toEqual({ assignedTo: null, roleTagIds: [] });
  });

  it('کارفرمای پروژه می‌تواند مسئولِ تسک باشد وقتی مدیر تخصیص می‌دهد', () => {
    expect(resolveAssignment({ assignedTo: 20, roleTagIds: [] }, facts))
      .toEqual({ assignedTo: 20, roleTagIds: [] });
  });
});
