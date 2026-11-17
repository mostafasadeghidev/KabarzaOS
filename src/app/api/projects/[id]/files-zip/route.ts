import { currentSession } from '@/server/auth';
import { FileNotFoundError, projectFilesZip } from '@/server/files/service';
import { openObject } from '@/server/files/storage';
import { uniqueZipNames, zipStream, ZIP_MAX_TOTAL, type ZipEntry } from '@/server/files/zip';
import { ForbiddenError } from '@/domain/access/guard';
import { contentDisposition } from '@/domain/files/upload';

/**
 * «دانلودِ همه» ِ تبِ فایل‌های پروژه (۳.۹.۰) — یک zip ِ جریانی از همان فایل‌هایی که این کاربر
 * در تبِ فایل‌ها می‌بیند. گارد همان مسیرِ تک‌فایل است (`canViewFile` برای هر فایل)؛ بایت‌ها
 * مستقیم از مخزن (سرور یا فضای ابری) به مرورگر می‌روند و هیچ فایلی کامل در حافظه نمی‌ماند.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await currentSession();
  if (!session) return new Response(null, { status: 403 });
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return new Response(null, { status: 400 });

  try {
    const data = await projectFilesZip(session.actor, id, session.memberState !== 'active');
    const total = data.files.reduce((s, f) => s + f.size, 0);
    if (total > ZIP_MAX_TOTAL) return new Response('zip.too_large', { status: 413 });

    const linksName = 'لینک‌ها.txt';
    const names = uniqueZipNames([...data.files.map((f) => f.name), ...(data.links.length ? [linksName] : [])]);
    const entries: ZipEntry[] = data.files.map((f, i) => ({
      name: names[i]!,
      date: f.date,
      open: async () => (await openObject(f.key)).body,
    }));
    if (data.links.length) {
      const text = data.links.map((l) => (l.label ? `${l.label}\n${l.url}` : l.url)).join('\n\n') + '\n';
      entries.push({ name: names[names.length - 1]!, date: new Date(), open: async () => new Response(text).body! });
    }

    const title = data.title.replace(/[\r\n"\/:*?<>|]+/g, ' ').trim() || 'project';
    return new Response(zipStream(entries), {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': contentDisposition('attachment', `${title}.zip`),
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, max-age=0, no-store',
      },
    });
  } catch (error) {
    if (error instanceof ForbiddenError) return new Response(null, { status: 403 });
    if (error instanceof FileNotFoundError) return new Response(null, { status: 404 });
    throw error;
  }
}
