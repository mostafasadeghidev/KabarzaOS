import { authHeaders, type ProviderId } from '@/domain/ai/providers';
import { classifyProviderError } from '@/domain/ai/chat';
import type { Segment } from '@/domain/ai/media';
import type { AiSecret } from './connections';

/**
 * تبدیلِ پیامِ صوتیِ تلگرام به متن (۲.۱۱.۰) — با همان کلیدِ هوشِ مصنوعیِ کاربر.
 *
 * ⚠️ فقط ارائه‌دهنده‌هایی که `/audio/transcriptions` ِ سازگار با OpenAI دارند:
 * OpenAI و Groq (Groq سهمیهٔ رایگان دارد). DeepSeek، Claude، OpenRouter، Z.ai و
 * … این نقطه را ندارند؛ برایشان ربات صریح می‌گوید که صدا پشتیبانی نمی‌شود.
 * «نشانیِ دلخواه» امتحان می‌شود (بسیاری از سرورهای محلی/سازگار دارند).
 */

const MODELS: Partial<Record<ProviderId, string>> = {
  openai: 'whisper-1',
  groq: 'whisper-large-v3-turbo',
  custom: 'whisper-1',
};

export function transcriptionModel(provider: ProviderId): string | null {
  return MODELS[provider] ?? null;
}

/** سقفِ صدا — ویسِ طولانی هم سهمیهٔ کاربر را می‌خورد و هم حافظهٔ سرور را. */
export const MAX_VOICE_SECONDS = 180;
export const MAX_VOICE_BYTES = 8 * 1024 * 1024;

/** سقفِ صدای ویدیو (۲.۳۴.۰) — سقفِ خودِ OpenAI و Groq ۲۵ مگابایت است. */
export const MAX_MEDIA_AUDIO_BYTES = 24 * 1024 * 1024;

export type Transcription =
  | { ok: true; text: string; segments: Segment[] }
  | { ok: false; reason: 'unsupported' | 'quota' | 'auth' | 'other' };

/**
 * `timed`: تکه‌های زمان‌دار هم برگردد (`verbose_json`) — برای ویدیو، تا هر مورد
 * ثانیهٔ همان لحظه را داشته باشد.
 */
export async function transcribe(secret: AiSecret, audio: Blob, filename: string, opts: { timed?: boolean } = {}): Promise<Transcription> {
  const model = transcriptionModel(secret.provider);
  if (!model) return { ok: false, reason: 'unsupported' };
  const form = new FormData();
  form.append('file', audio, filename);
  form.append('model', model);
  if (opts.timed) form.append('response_format', 'verbose_json');
  let res: Response;
  try {
    res = await fetch(`${secret.baseUrl}/audio/transcriptions`, {
      method: 'POST',
      headers: authHeaders(secret.provider, secret.apiKey),
      body: form,
      redirect: 'error',
      signal: AbortSignal.timeout(opts.timed ? 180_000 : 60_000),
    });
  } catch {
    return { ok: false, reason: 'other' };
  }
  if (res.status === 404 || res.status === 405) return { ok: false, reason: 'unsupported' };
  if (!res.ok) {
    const kind = classifyProviderError(res.status, await res.text().catch(() => ''));
    return { ok: false, reason: kind === 'quota' || kind === 'auth' ? kind : 'other' };
  }
  const data = await res.json().catch(() => null) as { text?: unknown; segments?: unknown } | null;
  const text = typeof data?.text === 'string' ? data.text.trim() : '';
  const segments: Segment[] = Array.isArray(data?.segments)
    ? (data.segments as Array<{ start?: unknown; end?: unknown; text?: unknown }>)
      .filter((x) => typeof x?.start === 'number' && typeof x.text === 'string')
      .map((x) => ({ start: x.start as number, end: typeof x.end === 'number' ? x.end : x.start as number, text: x.text as string }))
    : [];
  // ⚠️ ویدیوی بی‌صدا متنِ خالی دارد — برای ویدیو خطا نیست، فقط «حرفی زده نشد».
  if (opts.timed) return { ok: true, text, segments };
  return text ? { ok: true, text, segments } : { ok: false, reason: 'other' };
}
