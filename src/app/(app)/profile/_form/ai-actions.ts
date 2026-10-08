'use server';

import { revalidatePath } from 'next/cache';
import { requireActor } from '@/server/auth';
import {
  AiError, deleteAiConnection, listMyModels, moveAiConnection, saveAiConnection, setAiModel,
} from '@/server/ai/connections';
import type { ModelOption } from '@/domain/ai/providers';
import { notifyAiChange } from '@/server/telegram/bot';

/** اقدام‌های «مغزِ» ربات — هر کس فقط اتصال‌های خودش (۲.۹.۰؛ چندتایی از ۲.۱۲.۰). */

export interface AiFormState {
  error?: string;
  saved?: boolean;
}

const MESSAGES: Record<AiError['code'], string> = {
  bad_url: 'نشانی پذیرفته نشد؛ فقط نشانیِ HTTPS ِ عمومی.',
  invalid_key: 'کلید پذیرفته نشد؛ دوباره از سایتِ ارائه‌دهنده کپی کنید.',
  network: 'به ارائه‌دهنده وصل نشد؛ کمی بعد دوباره امتحان کنید.',
  no_key: 'کلیدِ API را وارد کنید.',
  bad_provider: 'ارائه‌دهنده را انتخاب کنید.',
  too_many: 'حداکثر ۵ هوشِ مصنوعی می‌شود وصل کرد؛ یکی را حذف کنید.',
  not_found: 'این اتصال پیدا نشد.',
};

function explain(error: unknown): string {
  if (error instanceof AiError) return MESSAGES[error.code];
  throw error;
}

export async function saveAiAction(_prev: AiFormState, formData: FormData): Promise<AiFormState> {
  try {
    const actor = await requireActor();
    const view = await saveAiConnection(actor, {
      provider: String(formData.get('provider') ?? ''),
      baseUrl: String(formData.get('baseUrl') ?? ''),
      apiKey: String(formData.get('apiKey') ?? ''),
      model: String(formData.get('model') ?? ''),
    });
    // در تلگرام هم معلوم شود چه چیزی وصل است (۲.۱۰.۰).
    await notifyAiChange(actor.id, view);
    revalidatePath('/profile');
    return { saved: true };
  } catch (error) {
    return { error: explain(error) };
  }
}

export async function loadModelsAction(id: number): Promise<{ models?: ModelOption[]; error?: string }> {
  try {
    return { models: await listMyModels(await requireActor(), id) };
  } catch (error) {
    return { error: explain(error) };
  }
}

export async function setModelAction(id: number, model: string): Promise<AiFormState> {
  const ok = await setAiModel(await requireActor(), model, id);
  revalidatePath('/profile');
  return ok ? { saved: true } : { error: 'مدل ذخیره نشد.' };
}

/** جابه‌جاییِ اولویت. */
export async function moveAiAction(id: number, direction: 'up' | 'down'): Promise<AiFormState> {
  const ok = await moveAiConnection(await requireActor(), id, direction === 'up' ? 'up' : 'down');
  revalidatePath('/profile');
  return ok ? {} : { error: 'اولویت عوض نشد.' };
}

export async function deleteAiAction(id: number): Promise<AiFormState> {
  const actor = await requireActor();
  if (await deleteAiConnection(actor, id)) await notifyAiChange(actor.id, null);
  revalidatePath('/profile');
  return {};
}
