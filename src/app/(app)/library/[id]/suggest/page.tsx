import { notFound, redirect } from 'next/navigation';
import { currentActor } from '@/server/auth';
import { canUseLibrary } from '@/domain/library/model';
import { getEntryForSuggest, libraryTopics, LibraryError } from '@/server/library/service';
import { PageHeader, PageShell } from '@/components/page-shell';
import { primeTranslations, t } from '@/i18n/server';
import { pageTitle } from '@/i18n/page-title';
import { EntryForm } from '../../entry-form';

export const generateMetadata = pageTitle('پیشنهادِ ویرایش');

/**
 * پیشنهادِ ویرایش (۲.۴۶.۰) — همان فرمِ ویرایش برای کسی که نویسنده نیست.
 * ⚠️ اگر پیشنهادِ بازی از خودِ کاربر هست، فرم با همان پر می‌شود تا
 * دوباره‌نویسی لازم نباشد؛ فرستادن همان را تازه می‌کند.
 */
export default async function SuggestLibraryEditPage({ params }: { params: Promise<{ id: string }> }) {
  await primeTranslations();
  const actor = await currentActor();
  if (!actor) redirect('/login');
  const id = Number((await params).id);
  if (!canUseLibrary(actor) || !Number.isInteger(id) || id <= 0) notFound();

  let data;
  try {
    data = await getEntryForSuggest(actor, id);
  } catch (error) {
    if (error instanceof LibraryError && error.code === 'not_found') notFound();
    // نویسنده یا مدیر — خودش ویرایش می‌کند.
    if (error instanceof LibraryError && error.code === 'can_edit') redirect(`/library/${id}/edit`);
    throw error;
  }
  const { entry, draft } = data;
  const topics = await libraryTopics(actor);
  const prefilled = draft
    ? {
      ...entry,
      ...draft.content,
      blocks: draft.content.blocks.map((b, i) => ({ ...b, id: i })),
      options: draft.content.options.map((o, i) => ({ ...o, id: i })),
    }
    : entry;

  return (
    <PageShell width="reading">
      <PageHeader
        back={{ href: `/library/${id}`, label: entry.title }}
        title={t('پیشنهادِ ویرایش')}
        description={entry.authorName ? t('برای «{entry}» · نویسنده: {name}', { entry: entry.title, name: entry.authorName }) : entry.title}
      />
      <EntryForm entry={prefilled} projects={[]} entries={[]} topics={topics} mode="suggest" initialNote={draft?.note ?? ''} />
    </PageShell>
  );
}
