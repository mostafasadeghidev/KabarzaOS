import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { currentActor } from '@/server/auth';
import {
  getAccountFormOptions, getEntryFormOptions, getLedger, listAccounts, listClosedPeriods,
} from '@/server/finance/service';
import { bankDirectory, listRecurring, listRequests , listUnpaidUnits, listDetachedPayments } from '@/server/finance/payouts';
import { ForbiddenError } from '@/domain/access/guard';
import { EmptyState } from '@/components/ui/empty-state';
import { FinancePage } from './finance-page';
import { primeTranslations, t } from '@/i18n/server';
import { AccountsView } from './accounts-view';
import { LAST_ACCOUNT_COOKIE } from './account-cookie';
import { can } from '@/domain/access/permissions';
import { listVendors } from '@/server/settings/service';
import { listMemberAccounts } from '@/server/finance/member-accounts';
import { listSalaries } from '@/server/finance/salaries';
import { PageHeader, PageShell } from '@/components/page-shell';
import { pageTitle } from '@/i18n/page-title';

export const generateMetadata = pageTitle('مالی');

/** حسابداری — دفترکلِ حساب‌ها. */
export default async function Finance({
  searchParams,
}: {
  searchParams: Promise<{
    account?: string; from?: string; to?: string; tag?: string;
    project?: string; party?: string; page?: string; per?: string;
    /** `all=1` — ردیف‌های دورهٔ بسته هم نشان داده شوند (پورتِ نمایشِ کاملِ دفتر). */
    all?: string;
    tab?: string;
  }>;
}) {
  /**
   * ⚠️ هر صفحه **خودش** ترجمه را آماده می‌کند و به چیدمان تکیه نمی‌کند:
   * در ناوبریِ سمتِ کلاینت، Next فقط بخشِ صفحه را دوباره رندر می‌کند و
   * چیدمان را از درختِ کش‌شده برمی‌دارد — پس `primeTranslations()` ِ
   * چیدمان اجرا نمی‌شود و `t()` رشتهٔ فارسیِ مبدأ را برمی‌گرداند.
   * `cache()` تضمین می‌کند در هر درخواست فقط یک بار اجرا شود.
   */
  await primeTranslations();

  const actor = await currentActor();
  if (!actor) redirect('/login');

  let accounts;
  try {
    accounts = await listAccounts(actor);
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return (
        <PageShell>
          <PageHeader title={t("مالی")} />
          <EmptyState title={t("دسترسی ندارید")} description={t("برای دیدنِ بخشِ مالی از مدیر دسترسی بگیرید.")} />
        </PageShell>
      );
    }
    throw error;
  }

  /**
   * ⚠️ بدونِ حساب، دفترکل قابلِ ساختن نیست (هر ردیف به یک حساب می‌چسبد)، پس
   * صفحهٔ عادی رندر نمی‌شود. ولی پیامِ خالی به‌تنهایی **بن‌بست** بود: تبِ
   * «حساب‌های بانکی» — تنها جایی که می‌شود حساب ساخت — هم با همان پیام
   * جایگزین می‌شد، و کاربر می‌خواند «اول حساب بساز» بی‌آنکه راهی به آن
   * داشته باشد. حالا خودِ فرمِ ساخت اینجاست.
   */
  if (accounts.length === 0) {
    const canManage = can(actor, 'finance.manage');
    if (!canManage) {
      return (
        <PageShell>
          <PageHeader title={t("مالی")} />
          <EmptyState
            title={t("حسابی تعریف نشده")}
            description={t("هنوز حسابی ساخته نشده. از مدیرِ مالی بخواهید یکی بسازد.")}
          />
        </PageShell>
      );
    }
    const firstOptions = await getAccountFormOptions(actor);
    return (
      <PageShell>
        <PageHeader
          title={t("مالی")}
          description={(
            <>{t("برای شروع یک حساب بسازید؛ هر ردیفِ دفترکل به یک حساب می‌چسبد.")}</>
          )}
        />
        <AccountsView
          accounts={[]}
          options={{
            currencies: firstOptions.currencies,
            offices: firstOptions.offices,
            people: firstOptions.people,
            // Map → Record، همان تبدیلی که مسیرِ عادی هم می‌کند.
            accountantsByAccount: Object.fromEntries(firstOptions.accountantsByAccount),
          }}
          canManage
        />
      </PageShell>
    );
  }

  const query = await searchParams;
  const requested = Number(query.account);
  /**
   * ⚠️ حساب دیگر بی‌صدا «اولین» نیست (۲.۴۵.۰): نشانی ← آخرین حسابِ همین مرورگر
   * (کوکی) ← وگرنه کاربر اول حساب را انتخاب می‌کند. با تنها یک حساب انتخابی نیست.
   */
  const remembered = Number((await cookies()).get(LAST_ACCOUNT_COOKIE)?.value);
  const known = (id: number) => accounts.some((a) => a.id === id);
  const chosen = known(requested) ? requested : known(remembered) ? remembered : accounts.length === 1 ? accounts[0]!.id : null;
  const needsPick = chosen === null;
  const accountId = chosen ?? accounts[0]!.id;

  /**
   * ⚠️ فیلترها از **آدرس** می‌آیند، نه از state ِ کلاینت: با این کار دکمهٔ
   * برگشتِ مرورگر کار می‌کند، لینکِ نتیجه قابلِ اشتراک است، و خروجیِ CSV
   * می‌تواند دقیقاً همان فیلتر را بگیرد.
   */
  const filter = {
    accountId,
    from: query.from || null,
    to: query.to || null,
    tagId: Number(query.tag) || null,
    projectId: Number(query.project) || null,
    party: query.party || null,
    page: Number(query.page) || 1,
    perPage: Number(query.per) || undefined,
    // «همهٔ ردیف‌ها» — نمایشِ دورهٔ بسته هم (پیش‌فرض: از فردای قفل).
    includeLocked: query.all === '1',
  };

  const [data, requests, archivedRequests, recurring, directory, unpaidUnits, detachedPayments, closedPeriods, memberAccounts, salaries] = await Promise.all([
    getLedger(actor, filter),
    listRequests(actor),
    listRequests(actor, 'archived'),
    listRecurring(actor),
    bankDirectory(actor),
    listUnpaidUnits(actor),
    listDetachedPayments(actor),
    listClosedPeriods(actor),
    listMemberAccounts(actor),
    listSalaries(actor),
  ]);
  const options = data.canManage
    ? await getEntryFormOptions(actor)
    : {
      accounts: [], currencies: [], categories: [], projects: [], vendors: [], people: [],
      projectMemberIds: {}, projectClientIds: {}, unitUnpaid: {}, memberCurrency: {}, rates: [], defaultCurrencyId: null, lockDate: null,
    };

  const accountOptions = data.canManage ? await getAccountFormOptions(actor) : null;
  // تبِ طرف‌حساب‌ها — گاردش در سرویس است؛ بی‌مجوزِ مالی تب ساخته نمی‌شود.
  const vendorRows = can(actor, 'finance.manage') ? await listVendors(actor) : null;

  return (
    <PageShell>
      <PageHeader title={t("مالی")} description={needsPick ? undefined : data.account.name} />

      <FinancePage
        needsPick={needsPick}
        accountId={accountId}
        accounts={accounts}
        entries={data.entries}
        totals={data.totals}
        currencyCode={data.account.currencyCode}
        lockDate={data.lockDate}
        options={{
          accounts: options.accounts,
          currencies: options.currencies,
          categories: options.categories,
          projects: options.projects,
          people: options.people,
          projectMemberIds: options.projectMemberIds,
          projectClientIds: options.projectClientIds,
          unitUnpaid: options.unitUnpaid,
          memberCurrency: options.memberCurrency,
          rates: options.rates,
          defaultCurrencyId: options.defaultCurrencyId,
          vendors: options.vendors,
        }}
        canManage={data.canManage}
        paging={data.paging}
        periodScoped={data.periodScoped}
        accountProjectIds={data.accountProjectIds}
        directory={directory}
        requests={requests}
        archivedRequests={archivedRequests}
        unpaidUnits={unpaidUnits}
        detachedPayments={detachedPayments}
        closedPeriods={closedPeriods}
        isOwner={actor.roles.includes('owner')}
        memberAccounts={memberAccounts}
        salaries={salaries}
        categories={options.categories}
        recurring={recurring}
        vendors={options.vendors}
        vendorRows={vendorRows}
        today={new Date().toISOString().slice(0, 10)}
        accountOptions={accountOptions ? {
          currencies: accountOptions.currencies,
          offices: accountOptions.offices,
          people: accountOptions.people,
          accountantsByAccount: Object.fromEntries(accountOptions.accountantsByAccount),
        } : null}
      />
    </PageShell>
  );
}
