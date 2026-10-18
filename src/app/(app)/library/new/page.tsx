import { redirect } from 'next/navigation';
import { currentActor } from '@/server/auth';
import { canUseLibrary, isKind } from '@/domain/library/model';
import { entryOptions, libraryTopics, projectOptions } from '@/server/library/service';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader, PageShell } from '@/components/page-shell';
import { primeTranslations, t } from '@/i18n/server';
import { pageTitle } from '@/i18n/page-title';
import { EntryForm } from '../entry-form';

export const generateMetadata = pageTitle('ثبتِ موردِ تازه');

export default async function NewLibraryEntryPage({
  searchParams,
}: {
  /** `?project=` از تبِ پروژه — مبدأ و نصبِ خودکار؛ `?kind=` نوعِ پیش‌فرض. */
  searchParams: Promise<{ project?: string; kind?: string }>;
}) {
  await primeTranslations();
  const actor = await currentActor();
  if (!actor) redirect('/login');
  if (!canUseLibrary(actor)) {
    return (
      <PageShell>
        <PageHeader title={t('ثبتِ موردِ تازه')} />
        <EmptyState title={t('دسترسی ندارید')} description={t('کتابخانهٔ کد و راهنما مالِ تیم است.')} />
      </PageShell>
    );
  }
  const sp = await searchParams;
  const [projects, entries, topics] = await Promise.all([projectOptions(actor), entryOptions(actor), libraryTopics(actor)]);
  const wanted = Number(sp.project);
  // فقط پروژه‌ای که بیننده رویش کار می‌کند — سرور هم همین را می‌سنجد.
  const defaultProjectId = projects.some((p) => p.id === wanted) ? wanted : null;
  const fromProject = projects.find((p) => p.id === defaultProjectId);

  return (
    <PageShell width="reading">
      <PageHeader
        back={fromProject
          ? { href: `/projects/${fromProject.id}?tab=library`, label: fromProject.title }
          : { href: '/library', label: t('کتابخانهٔ کد') }}
        title={t('ثبتِ موردِ تازه')}
        description={t('چیزی بنویسید که خودتان شش ماه بعد، بدونِ یادآوری، بتوانید از رویش نصبش کنید.')}
      />
      <EntryForm
        entry={null}
        projects={projects}
        entries={entries}
        topics={topics}
        defaultProjectId={defaultProjectId}
        defaultKind={isKind(sp.kind) ? sp.kind : 'code'}
      />
    </PageShell>
  );
}
