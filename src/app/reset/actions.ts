'use server';

import { redirect } from 'next/navigation';
import { completePasswordReset } from '@/server/auth/reset-service';

export interface ResetState {
  error?: string;
}

/** تعیینِ رمز از راهِ لینکِ ایمیل (دعوت یا بازنشانی). */
export async function completeResetAction(_prev: ResetState, formData: FormData): Promise<ResetState> {
  const token = String(formData.get('token') ?? '');
  const next = String(formData.get('next') ?? '');
  const repeat = String(formData.get('repeat') ?? '');
  if (next !== repeat) return { error: 'تکرارِ رمز یکسان نیست.' };

  const result = await completePasswordReset(token, next);
  if (result === 'invalid') return { error: 'این لینک معتبر نیست.' };
  if (result === 'expired') return { error: 'این لینک منقضی شده است؛ دوباره درخواست بدهید.' };
  if (result === 'policy') return { error: 'رمز باید دستِ‌کم ۸ نویسه و غیرِ رایج باشد.' };
  redirect('/login?reset=1');
}
