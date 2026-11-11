import { redirect } from 'next/navigation';
import { currentActor } from '@/server/auth';
import { ForbiddenError } from '@/domain/access/guard';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader, PageShell } from '@/components/page-shell';
import { pageTitle } from '@/i18n/page-title';
import { primeTranslations, t } from '@/i18n/server';
import { listMailAccounts } from '@/server/corp-mail/accounts';
import { MailAccountsView } from './mail-accounts-view';

export const generateMetadata = pageTitle('حساب‌های ایمیل');

/**
 * حساب‌های ایمیلِ شرکتی (۲.۶۰.۰) — فهرست از سرورِ ایمیل، جفت با اعضا، alias.
 *
 * ⚠️ صفحهٔ جدا، نه تبِ «دسترسی‌ها»: هر بار باز شدن از Stalwart می‌خواند و
 * نباید هر بازدیدِ دفترِ دسترسی‌ها را کند کند.
 */
export default async function MailAccountsPage() {
  await primeTranslations();
  const actor = await currentActor();
  if (!actor) redirect('/login');

  let data;
  try {
    data = await listMailAccounts(actor);
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return (
        <PageShell>
          <PageHeader title={t('حساب‌های ایمیل')} />
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
        title={t('حساب‌های ایمیل')}
        description={data.domain ? <span dir="ltr">@{data.domain}</span> : undefined}
      />
      <MailAccountsView data={data} />
    </PageShell>
  );
}
