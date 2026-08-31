import { currentActor } from '@/server/auth';
import { teamMembers } from '@/server/team/service';
import { ForbiddenError } from '@/domain/access/guard';
import { csvDocument } from '@/domain/access/office-scope';
import { hoursLabel } from '@/domain/timelogs/timer';

/**
 * خروجیِ CSV ِ ساعتِ کاریِ تیم.
 * ⚠️ همان گاردِ صفحه — دامنه در سرویس اعمال می‌شود، نه اینجا.
 */
export async function GET(request: Request) {
  const actor = await currentActor();
  if (!actor) return new Response(null, { status: 403 });

  const params = new URL(request.url).searchParams;

  let data;
  try {
    data = await teamMembers(actor, {
      range: params.get('range') ?? undefined,
      from: params.get('from') ?? undefined,
      to: params.get('to') ?? undefined,
    });
  } catch (error) {
    if (error instanceof ForbiddenError) return new Response(null, { status: 403 });
    throw error;
  }

  const csv = csvDocument(
    ['عضو', 'ایمیل', 'دقیقه', 'ساعت کاری'],
    data.members.map((m) => [m.name, m.email, m.minutes, hoursLabel(m.minutes)]),
  );

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      // نامِ فارسی طبقِ RFC 6266 کدگذاری می‌شود (R-FILE-11).
      'Content-Disposition':
        `attachment; filename="team-hours.csv"; filename*=UTF-8''${encodeURIComponent('ساعت-کاری-تیم.csv')}`,
      'Cache-Control': 'private, no-store',
    },
  });
}
