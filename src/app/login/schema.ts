import { z } from 'zod';

/**
 * اسکیمای ورود — در فایلِ جدا چون فایلِ `'use server'` فقط تابعِ async
 * می‌تواند صادر کند.
 *
 * همین اسکیما بعداً برای مسیرِ API هم استفاده می‌شود — یک‌بار نوشتن،
 * دو جا مصرف (ARCHITECTURE.md).
 */
export const loginSchema = z.object({
  /**
   * ⚠️ شناسه، نه ایمیل: ورود با نامِ کاربری هم ممکن است. اینجا اول
   * `.email()` بود و هر نامِ کاربری را با «ایمیل معتبر نیست» رد می‌کرد —
   * پیش از رسیدن به منطقِ ورود. تنها اعتبارسنجیِ درست در این لایه
   * «خالی نباشد» است؛ تصمیمِ واقعی در `attemptLogin` گرفته می‌شود.
   */
  email: z.string().trim().min(1, 'ایمیل یا نام کاربری را وارد کنید'),
  password: z.string().min(1, 'رمز عبور را وارد کنید'),
});

export type LoginInput = z.infer<typeof loginSchema>;

export interface LoginState {
  error?: string;
}
