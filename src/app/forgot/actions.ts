'use server';

import { headers } from 'next/headers';
import { requestPasswordReset } from '@/server/auth/reset-service';
import { verifyTurnstile } from '@/server/settings/turnstile-service';
import { TURNSTILE_FIELD } from '@/domain/settings/turnstile';

export interface ForgotState {
  done?: boolean;
  error?: string;
}

/**
 * «رمزم را فراموش کرده‌ام» — پورتِ `wp_lostpassword_url`.
 * ⚠️ پاسخ همیشه یکی است؛ وجود یا نبودِ حساب لو نمی‌رود.
 */
export async function requestResetAction(_prev: ForgotState, formData: FormData): Promise<ForgotState> {
  const identifier = String(formData.get('email') ?? '');
  if (identifier.trim() === '') return { error: 'ایمیل یا نامِ کاربری را بنویسید.' };
  // کپچا (۲.۳۱.۰) — بدونِ آن، ربات می‌توانست با این فرم برای هر نشانی ایمیل بفرستد.
  const ip = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  if (!(await verifyTurnstile(formData.get(TURNSTILE_FIELD), ip))) {
    return { error: 'بررسیِ «ربات نیستم» انجام نشد؛ دوباره تلاش کنید.' };
  }
  await requestPasswordReset(identifier).catch(() => undefined);
  return { done: true };
}
