import { describe, expect, it } from 'vitest';
import { loginSchema } from './schema';

/**
 * ⚠️ این پرونده به‌خاطر یک باگِ واقعی هست: اسکیمای فرم `.email()` داشت و
 * ورود با نامِ کاربری را **پیش از رسیدن به منطقِ ورود** رد می‌کرد. همهٔ
 * تست‌های دامنه سبز بودند چون مستقیم `attemptLogin` را صدا می‌زدند و از
 * لایهٔ فرم رد می‌شدند. فقط ورودِ واقعی در مرورگر نشانش داد.
 */
describe('اسکیمای فرمِ ورود', () => {
  it('نامِ کاربری را می‌پذیرد، نه فقط ایمیل', () => {
    for (const id of ['mostafa', 'MOSTAFA', 'a_b-c.d', 'boss@example.com']) {
      expect(loginSchema.safeParse({ email: id, password: 'x' }).success, id).toBe(true);
    }
  });

  it('شناسهٔ خالی رد می‌شود', () => {
    expect(loginSchema.safeParse({ email: '   ', password: 'x' }).success).toBe(false);
    expect(loginSchema.safeParse({ email: 'ali', password: '' }).success).toBe(false);
  });
});
