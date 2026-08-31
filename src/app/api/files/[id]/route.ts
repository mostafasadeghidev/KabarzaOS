import { currentActor } from '@/server/auth';
import { FileNotFoundError, serveFile } from '@/server/files/service';
import { ForbiddenError } from '@/domain/access/guard';
import { contentDisposition } from '@/domain/files/upload';

/**
 * نقطهٔ پایانیِ گیت‌شدهٔ فایل — **تنها** راهی که بایتِ فایل بیرون می‌رود.
 *
 * ⚠️ R-FILE-01 — باکت خصوصی است و هیچ آدرسِ مستقیمی وجود ندارد. اگر روزی
 * لینکِ مستقیمِ S3 جایی چاپ شود، همهٔ گاردهای این فایل دور زده می‌شوند.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const actor = await currentActor();
  // ۴۰۳ برای هر دو حالتِ «وارد نشده» و «حق ندارد» — تفاوتشان خودش اطلاعات است.
  if (!actor) return new Response(null, { status: 403 });

  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return new Response(null, { status: 400 });

  const query = new URL(request.url).searchParams;
  const wantsDownload = query.has('dl');
  // `?thumb` نسخهٔ ۴۰۰ پیکسلی را می‌خواهد؛ نبودنش خطا نیست و اصل سِرو می‌شود.
  const wantsThumb = query.has('thumb');

  try {
    const file = await serveFile(actor, id, wantsDownload, wantsThumb);

    return new Response(file.bytes as BodyInit, {
      headers: {
        'Content-Type': file.mime,
        'Content-Length': String(file.bytes.byteLength),
        // ⚠️ nosniff لازم است ولی کافی نیست — SVG/HTML ِ درست‌تایپ‌شده باز هم
        // اجرا می‌شود؛ به همین دلیل disposition هم آن‌ها را دانلود می‌کند.
        'X-Content-Type-Options': 'nosniff',
        // ⚠️ نامِ فارسی باید encode شود، وگرنه هدر خطا می‌دهد (RFC 6266).
        'Content-Disposition': contentDisposition(file.disposition, file.downloadName),
        // فایلِ خصوصی نباید در کشِ مشترک بنشیند.
        'Cache-Control': 'private, max-age=0, no-store',
      },
    });
  } catch (error) {
    if (error instanceof ForbiddenError) return new Response(null, { status: 403 });
    if (error instanceof FileNotFoundError) return new Response(null, { status: 404 });
    throw error;
  }
}
