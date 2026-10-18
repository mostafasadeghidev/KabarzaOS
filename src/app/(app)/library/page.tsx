import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus } from 'lucide-react';
import { currentActor } from '@/server/auth';
import { canUseLibrary } from '@/domain/library/model';
import { libraryTopics, listEntries, projectOptions } from '@/server/library/service';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { PageHeader, PageShell } from '@/components/page-shell';
import { primeTranslations, t } from '@/i18n/server';
import { pageTitle } from '@/i18n/page-title';
import { LibraryView } from './library-view';

export const generateMetadata = pageTitle('کتابخانهٔ کد');

/**
 * کتابخانهٔ کد و راهنما (۲.۳۷.۰) — کدهای اختصاصیِ پروژه‌ها، راهنمای کارفرما
 * و یادداشت‌های آموزشیِ تیم، در یک جا و قابلِ جستجو (حتی داخلِ خودِ کد).
 */
export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string; kind?: string; platform?: string; topic?: string; project?: string; mine?: string; archived?: string;
  }>;
}) {
  await primeTranslations();
  const actor = await currentActor();
  if (!actor) redirect('/login');

  if (!canUseLibrary(actor)) {
    return (
      <PageShell>
        <PageHeader title={t('کتابخانهٔ کد')} />
        <EmptyState title={t('دسترسی ندارید')} description={t('کتابخانهٔ کد و راهنما مالِ تیم است.')} />
      </PageShell>
    );
  }

  const sp = await searchParams;
  const filter = {
    q: sp.q ?? '',
    kind: sp.kind ?? '',
    platform: sp.platform ?? '',
    topic: sp.topic ?? '',
    projectId: Number(sp.project) > 0 ? Number(sp.project) : undefined,
    mine: sp.mine === '1',
    archived: sp.archived === '1',
  };
  const [entries, topics, projects, all] = await Promise.all([
    listEntries(actor, filter),
    libraryTopics(actor),
    projectOptions(actor),
    // شمارِ هر نوع برای قرص‌های فیلتر — بی‌فیلترِ نوع، با بقیهٔ فیلترها.
    listEntries(actor, { ...filter, kind: '' }),
  ]);
  const counts = { all: all.length, code: 0, guide: 0, note: 0 };
  for (const e of all) counts[e.kind] += 1;

  return (
    <PageShell>
      <PageHeader
        title={t('کتابخانهٔ کد')}
        description={t('کدهای اختصاصی، راهنمای کارفرما و یادداشت‌های تیم — هر کدام با جای نصب، تنظیمات و پروژه‌هایی که رویشان نصب است.')}
        actions={(
          <Button asChild>
            <Link href="/library/new"><Plus />{t('ثبتِ موردِ تازه')}</Link>
          </Button>
        )}
      />
      <LibraryView
        entries={entries}
        topics={topics}
        projects={projects}
        counts={counts}
        filter={{ ...filter, projectId: filter.projectId ?? null }}
      />
    </PageShell>
  );
}
