import { abortUpload, uploadStatus } from '@/server/files/chunked';
import { uploadActor, uploadError } from '@/server/files/upload-http';

type Ctx = { params: Promise<{ id: string }> };

/** کدام تکه‌ها رسیده‌اند — برای ادامه پس از قطعی. */
export async function GET(request: Request, { params }: Ctx) {
  const actor = await uploadActor(request);
  if (actor instanceof Response) return actor;
  try {
    return Response.json(await uploadStatus(actor, (await params).id));
  } catch (error) {
    return uploadError(error);
  }
}

/** لغو — تکه‌های موقت در مقصد هم پاک می‌شوند. */
export async function DELETE(request: Request, { params }: Ctx) {
  const actor = await uploadActor(request);
  if (actor instanceof Response) return actor;
  try {
    await abortUpload(actor, (await params).id);
    return new Response(null, { status: 204 });
  } catch (error) {
    return uploadError(error);
  }
}
