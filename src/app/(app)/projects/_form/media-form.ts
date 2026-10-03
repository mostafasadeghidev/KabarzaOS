import { FileRejected, rejectMessage } from '@/domain/files/upload';
import type { UploadBlob } from '@/server/files/service';

/**
 * خواندنِ رسانهٔ فرم (`<input name="media" multiple>`) به بایت.
 * ⚠️ فقط باز کردنِ فرم — نوع، امضا، حجم و شمار را سرویس می‌سنجد (R-ARCH-01).
 */
export async function mediaFrom(formData: FormData, name = 'media'): Promise<UploadBlob[]> {
  const picked = formData.getAll(name).filter((f): f is File => f instanceof File && f.size > 0);
  return Promise.all(picked.map(async (file) => ({
    name: file.name,
    mime: file.type,
    bytes: new Uint8Array(await file.arrayBuffer()),
  })));
}

/** دلیلِ ردِ فایل به زبانِ کاربر — یا `null` اگر خطا از فایل نبود. */
export function mediaError(error: unknown): string | null {
  return error instanceof FileRejected ? rejectMessage(error.reason) : null;
}
