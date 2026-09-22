import { currentActor } from '@/server/auth';
import { getT } from '@/i18n/server';
import { accessBoard } from '@/server/access/service';
import { ForbiddenError } from '@/domain/access/guard';
import { csvDocument } from '@/domain/access/office-scope';
import { KIND_LABELS, LEVEL_LABELS } from '@/domain/access/service-grants';
import { stateLabel } from '@/domain/people/offboarding';

/**
 * خروجیِ CSV ِ دفترِ دسترسی‌ها — همان فیلترهای صفحه.
 *
 * ⚠️ ستونِ «ارجاعِ محفظهٔ رمز» عمداً **در خروجی نیست**: فایلِ CSV از سامانه
 * بیرون می‌رود و روی ایمیل و فلش می‌چرخد؛ نقشهٔ نامِ آیتم‌های محفظه چیزی
 * نیست که بخواهیم آن‌طور پخش شود. درونِ اپ دیده می‌شود، که گاردِ خودش را دارد.
 */
export async function GET(request: Request) {
  const actor = await currentActor();
  const t = await getT();
  if (!actor) return new Response(null, { status: 403 });

  let data;
  try {
    data = await accessBoard(actor);
  } catch (error) {
    if (error instanceof ForbiddenError) return new Response(null, { status: 403 });
    throw error;
  }

  const params = new URL(request.url).searchParams;
  const user = Number(params.get('user') ?? 0) || null;
  const service = Number(params.get('service') ?? 0) || null;
  const status = params.get('status') ?? 'open';
  const formerOnly = params.get('former') === '1';

  const serviceById = new Map(data.services.map((s) => [s.id, s]));
  const nameOf = (id: number | null) =>
    (id ? data.people.find((p) => p.id === id)?.name ?? '' : '');

  const rows = data.grants.filter((g) => {
    if (user && g.userId !== user) return false;
    if (service && g.serviceId !== service) return false;
    if (status === 'open' && g.revokedAt !== null) return false;
    if (status === 'revoked' && g.revokedAt === null) return false;
    if (formerOnly && g.memberState === 'active') return false;
    return true;
  });

  const day = (value: Date | string | null) =>
    (value ? new Date(value).toISOString().slice(0, 10) : '');

  const csv = csvDocument(
    [
      t('شخص'), t('وضعیتِ عضو'), t('سرویس'), t('دسته'), t('مسئولِ اعطای دسترسی'),
      t('سطح'), t('شناسهٔ حساب'), t('از تاریخ'), t('تاریخِ قطع'), t('یادداشت'),
    ],
    rows.map((g) => {
      const svc = serviceById.get(g.serviceId);
      return [
        g.userName,
        g.memberState === 'active' ? t('فعال') : t(stateLabel(g.memberState) ?? ''),
        svc?.name ?? '',
        svc ? t(KIND_LABELS[svc.kind]) : '',
        nameOf(svc?.ownerUserId ?? null),
        t(LEVEL_LABELS[g.level]),
        g.accountRef,
        day(g.grantedAt),
        day(g.revokedAt),
        g.note,
      ];
    }),
  );

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      // نامِ فارسی طبقِ RFC 6266 کدگذاری می‌شود (R-FILE-11).
      'Content-Disposition':
        `attachment; filename="access.csv"; filename*=UTF-8''${encodeURIComponent(t('دسترسی-ها.csv'))}`,
      'Cache-Control': 'private, no-store',
    },
  });
}
