'use server';

import { requestPasswordReset } from '@/server/auth/reset-service';

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
  await requestPasswordReset(identifier).catch(() => undefined);
  return { done: true };
}
