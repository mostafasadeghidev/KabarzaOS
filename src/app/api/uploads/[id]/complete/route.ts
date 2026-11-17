import { revalidatePath } from 'next/cache';
import { completeUpload } from '@/server/files/chunked';
import { uploadActor, uploadError } from '@/server/files/upload-http';

/** همهٔ تکه‌ها رسید ← سرِ هم کردن در مقصد و ثبتِ فایل در پروژه. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await uploadActor(request);
  if (actor instanceof Response) return actor;
  try {
    const { id } = await params;
    const fileId = await completeUpload(actor, id);
    revalidatePath('/projects', 'layout');
    return Response.json({ fileId });
  } catch (error) {
    return uploadError(error);
  }
}
