import { notFound, redirect } from 'next/navigation';
import { currentActor } from '@/server/auth';
import { canUseLibrary } from '@/domain/library/model';
import { entryOptions, getEntryForEdit, libraryTopics, LibraryError, projectOptions } from '@/server/library/service';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader, PageShell } from '@/components/page-shell';
import { primeTranslations, t } from '@/i18n/server';
import { pageTitle } from '@/i18n/page-title';
import { EntryForm } from '../../entry-form';
import { ForkedNotice } from './forked-notice';

export const generateMetadata = pageTitle('ویرایش');

export default async function EditLibraryEntryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ forked?: string }>;
}) {
  await primeTranslations();
  const actor = await currentActor();
  if (!actor) redirect('/login');
  const id = Number((await params).id);
  if (!canUseLibrary(actor) || !Number.isInteger(id) || id <= 0) notFound();

  let entry;
  try {
    entry = await getEntryForEdit(actor, id);
  } catch (error) {
    if (error instanceof LibraryError && error.code === 'not_found') notFound();
    if (error instanceof LibraryError && error.code === 'forbidden') {
      return (
        <PageShell>
          <PageHeader title={t('ویرایش')} back={{ href: `/library/${id}`, label: t('کتابخانهٔ کد') }} />
          <EmptyState
            title={t('فقط نویسنده ویرایش می‌کند')}
            description={t('اگر برای پروژهٔ خودتان نسخهٔ متفاوتی لازم دارید، از بخشِ «نصب روی پروژه‌ها» نسخهٔ جدا بسازید.')}
          />
        </PageShell>
      );
    }
    throw error;
  }
  const [projects, entries, topics] = await Promise.all([projectOptions(actor), entryOptions(actor), libraryTopics(actor)]);

  return (
    <PageShell width="reading">
      <PageHeader back={{ href: `/library/${id}`, label: entry.title }} title={t('ویرایش')} description={entry.title} />
      {(await searchParams).forked === '1' && <ForkedNotice />}
      <EntryForm entry={entry} projects={projects} entries={entries} topics={topics} />
    </PageShell>
  );
}
