import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { currentActor } from '@/server/auth';
import { getFocusList } from '@/server/dashboard-focus';
import { focusHref, isFocusView, type FocusView } from '@/domain/dashboard/focus';
import { ForbiddenError } from '@/domain/access/guard';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';
import { ProjectStatus } from '../../projects/project-status';
import { primeTranslations, t } from '@/i18n/server';

/**
 * فهرستِ متمرکزِ داشبورد — پورتِ `class-focus-page.php`: کارتِ «منتظرِ اقدام»
 * به‌جای صفحهٔ عمومی، فقط موردهای همان کارت را نشان می‌دهد و هر ردیف پروژه را
 * روی تبِ درست باز می‌کند.
 */

const META: Record<FocusView, { title: string; hint: string }> = {
  bids_pending: {
    title: 'مناقصه‌های منتظرِ تصمیم',
    hint: 'مناقصه‌هایی که پیشنهاد دارند و هنوز برنده‌ای انتخاب نشده. برای بررسی پیشنهادها و تأیید، روی هر پروژه کلیک کنید.',
  },
  deadline_soon: {
    title: 'ددلاینِ نزدیک (۷ روز)',
    hint: 'پروژه‌هایی که ددلاینشان در ۷ روز آینده است. برای دیدن جزئیات، روی هر پروژه کلیک کنید.',
  },
  tasks_review: {
    title: 'تسک‌های نیاز به ریویو',
    hint: 'تسک‌هایی که منتظرِ بررسی هستند، گروه‌بندی‌شده بر اساس پروژه و اولویت. روی هر تسک کلیک کنید تا مستقیم در تبِ «نیازمند بررسی» همان پروژه باز شود.',
  },
  comments_review: {
    title: 'کامنت‌های نیازمند بررسی',
    hint: 'کامنت‌هایی که هنوز بررسی نشده‌اند، گروه‌بندی‌شده بر اساس پروژه. روی هر مورد کلیک کنید تا کامنت‌های همان پروژه باز شود.',
  },
};

export default async function FocusPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  /**
   * ⚠️ هر صفحه **خودش** ترجمه را آماده می‌کند و به چیدمان تکیه نمی‌کند:
   * در ناوبریِ سمتِ کلاینت، Next فقط بخشِ صفحه را دوباره رندر می‌کند.
   */
  await primeTranslations();

  const actor = await currentActor();
  if (!actor) redirect('/login');

  const query = await searchParams;
  const view: FocusView = isFocusView(query.view) ? query.view : 'deadline_soon';

  let data;
  try {
    data = await getFocusList(actor, view);
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return (
        <main className="p-6">
          <EmptyState title={t('دسترسی کافی ندارید.')} />
        </main>
      );
    }
    throw error;
  }

  const empty = data.projects.length === 0 && data.groups.length === 0;

  return (
    <main className="@container/main flex flex-col gap-4 p-4 lg:p-6">
      <div>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowRight className="size-3.5 rtl:rotate-0 ltr:rotate-180" />
          {t('بازگشت به داشبورد')}
        </Link>
        <h1 className="mt-1 text-xl font-semibold">{t(META[view].title)}</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">{t(META[view].hint)}</p>
      </div>

      {empty && <EmptyState title={t('موردی نیست.')} />}

      {/* پروژه‌محور: هر کارت یک پروژه با چیپِ وضعیت و نشان (شمارِ پیشنهاد / روزِ مانده). */}
      {data.projects.length > 0 && (
        <ul className="grid gap-2 @xl/main:grid-cols-2">
          {data.projects.map((p) => (
            <li key={p.id}>
              <Link
                href={focusHref(view, p.id)}
                className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm transition-colors hover:bg-muted"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate font-medium">{p.title}</span>
                  <ProjectStatus name={p.statusName} group={p.statusGroup} />
                </span>
                <Badge variant="outline" className="num shrink-0">{p.badge}</Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {/* موردمحور: گروهِ هر پروژه با سرگروهِ عنوان + وضعیت + «n مورد»؛ ردیف = برچسب + مسئول/نویسنده. */}
      {data.groups.length > 0 && (
        <div className="grid gap-3">
          {data.groups.map((g) => (
            <section key={g.id} className="rounded-md border">
              <header className="flex flex-wrap items-center gap-2 border-b bg-muted/40 px-3 py-2 text-sm">
                <Link href={focusHref(view, g.id)} className="font-semibold hover:underline">{g.title}</Link>
                <ProjectStatus name={g.statusName} group={g.statusGroup} />
                <span className="num text-xs text-muted-foreground">{t('{n} مورد', { n: g.items.length })}</span>
              </header>
              <ul>
                {g.items.map((it, i) => (
                  <li key={i} className="border-b last:border-b-0">
                    <Link
                      href={focusHref(view, g.id)}
                      className="flex items-center justify-between gap-3 px-3 py-2 text-sm transition-colors hover:bg-muted"
                    >
                      <span className="min-w-0 truncate">{it.label}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{it.who}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
