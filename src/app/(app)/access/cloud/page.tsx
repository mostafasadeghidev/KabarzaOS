import { redirect } from 'next/navigation';
import { currentActor } from '@/server/auth';
import { ForbiddenError } from '@/domain/access/guard';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader, PageShell } from '@/components/page-shell';
import { pageTitle } from '@/i18n/page-title';
import { primeTranslations, t } from '@/i18n/server';
import { listCloudAccounts } from '@/server/cloud/accounts';
import { CloudAccountsView } from './cloud-accounts-view';

export const generateMetadata = pageTitle('فضای ابری');

/**
 * حساب‌های فضای ابری (۳.۴.۰) — یک تب برای هر اتصالِ روشن (`?c=ID`).
 *
 * ⚠️ صفحهٔ جدا، نه تبِ «دسترسی‌ها»: هر بار باز شدن از Nextcloud می‌خواند و نباید
 * هر بازدیدِ دفتر را کند کند.
 */
export default async function CloudAccountsPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  await primeTranslations();
  const actor = await currentActor();
  if (!actor) redirect('/login');

  let data;
  try {
    data = await listCloudAccounts(actor, Number((await searchParams).c ?? 0) || null);
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return (
        <PageShell>
          <PageHeader title={t('فضای ابری')} />
          <EmptyState title={t('دسترسی ندارید')} description={t('این صفحه برای کسی است که اعضا را اداره می‌کند.')} />
        </PageShell>
      );
    }
    throw error;
  }

  return (
    <PageShell>
      <PageHeader
        back={{ href: '/access', label: t('دسترسی‌ها') }}
        title={t('فضای ابری')}
        description={data.current ? <span dir="ltr">{data.current.baseUrl.replace(/^https?:\/\//, '')} · {data.current.groupId}</span> : undefined}
      />
      <CloudAccountsView data={data} isOwner={actor.roles.includes('owner')} />
    </PageShell>
  );
}
