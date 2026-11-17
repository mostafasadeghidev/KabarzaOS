import { startUpload } from '@/server/files/chunked';
import { uploadActor, uploadError } from '@/server/files/upload-http';

/** شروعِ آپلودِ تکه‌ای (۳.۱۰.۰) — فقط جلسه؛ بایت‌ها با `PUT /api/uploads/<id>/<n>` می‌آیند. */
export async function POST(request: Request) {
  const actor = await uploadActor(request);
  if (actor instanceof Response) return actor;
  try {
    const body = await request.json() as { projectId?: unknown; name?: unknown; size?: unknown; mime?: unknown; label?: unknown };
    const out = await startUpload(actor, {
      projectId: Number(body.projectId), name: String(body.name ?? ''), size: Number(body.size),
      mime: String(body.mime ?? ''), label: String(body.label ?? ''),
    });
    return Response.json(out);
  } catch (error) {
    return uploadError(error);
  }
}
