import { currentActor } from '@/server/auth';
import { getMeetingForCalendar } from '@/server/meetings/service';
import { buildIcs, icsFilename } from '@/domain/meetings/ics';

/**
 * فایلِ تقویمِ یک جلسه — پورتِ `handle_meeting_ics()`.
 *
 * ⚠️ گارد در سرویس است (R-ARCH-01)؛ `null` یعنی یا جلسه نیست یا این کاربر
 * حقِ دیدنش را ندارد. عمداً هر دو **۴۰۴** می‌گیرند: تفکیکشان به کسی که
 * دعوت نشده می‌گفت چنین جلسه‌ای وجود دارد.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const actor = await currentActor();
  if (!actor) return new Response('ورود لازم است', { status: 401 });

  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return new Response('یافت نشد', { status: 404 });

  const meeting = await getMeetingForCalendar(actor, id);
  if (!meeting) return new Response('یافت نشد', { status: 404 });

  const body = buildIcs(
    {
      id: meeting.id,
      title: meeting.title,
      description: meeting.description,
      location: meeting.location,
      meetAt: meeting.meetAt,
      projectTitle: meeting.projectTitle,
    },
    new URL(request.url).host,
    new Date(),
  );

  return new Response(body, {
    headers: {
      'content-type': 'text/calendar; charset=utf-8',
      'content-disposition': `attachment; filename="${icsFilename(meeting.id)}"`,
      // ⚠️ تقویمِ کهنه بدتر از نبودنش است — جلسه‌ای که ساعتش عوض شده.
      'cache-control': 'no-store',
    },
  });
}
