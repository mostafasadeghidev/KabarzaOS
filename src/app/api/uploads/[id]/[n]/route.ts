import { CHUNK_SIZE } from '@/domain/files/upload';
import { putChunk } from '@/server/files/chunked';
import { uploadActor, uploadError } from '@/server/files/upload-http';

/**
 * یک تکه (۳.۱۰.۰). بدنه خودِ بایت‌هاست (نه FormData). ⚠️ بزرگ‌تر از یک تکه پیش از خواندن رد می‌شود
 * تا کسی با بدنهٔ بزرگ حافظهٔ سرور را پر نکند.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string; n: string }> }) {
  const actor = await uploadActor(request);
  if (actor instanceof Response) return actor;
  const declared = Number(request.headers.get('content-length') ?? NaN);
  if (!Number.isFinite(declared) || declared > CHUNK_SIZE) return new Response(null, { status: 413 });
  try {
    const { id, n } = await params;
    const bytes = new Uint8Array(await request.arrayBuffer());
    if (bytes.byteLength > CHUNK_SIZE) return new Response(null, { status: 413 });
    return Response.json(await putChunk(actor, id, Number(n), bytes));
  } catch (error) {
    return uploadError(error);
  }
}
