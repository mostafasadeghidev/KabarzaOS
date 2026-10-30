import { notFound, redirect } from 'next/navigation';
import { currentActor } from '@/server/auth';
import { canUseLibrary } from '@/domain/library/model';
import { getEntry, LibraryError, projectOptions } from '@/server/library/service';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader, PageShell } from '@/components/page-shell';
import { primeTranslations, t } from '@/i18n/server';
import { pageTitle } from '@/i18n/page-title';
import { EntryView } from './entry-view';

export const generateMetadata = pageTitle('کتابخانهٔ کد');

export default async function LibraryEntryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; suggested?: string; suggestion?: string }>;
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

  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  let entry;
  try {
    entry = await getEntry(actor, id);
  } catch (error) {
    if (error instanceof LibraryError && error.code === 'not_found') notFound();
    throw error;
  }
  const projects = await projectOptions(actor);
  const sp = await searchParams;
  const openSuggestion = Number(sp.suggestion);

  return (
    <PageShell>
      <EntryView
        entry={entry}
        projects={projects}
        justSaved={sp.saved === '1'}
        justSuggested={sp.suggested === '1'}
        openSuggestion={Number.isInteger(openSuggestion) && openSuggestion > 0 ? openSuggestion : null}
      />
    </PageShell>
  );
}
