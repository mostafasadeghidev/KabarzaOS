import { redirect } from 'next/navigation';
import { currentActor } from '@/server/auth';
import {
  getAccountFormOptions, getEntryFormOptions, getLedger, listAccounts,
} from '@/server/finance/service';
import { bankDirectory, listRecurring, listRequests } from '@/server/finance/payouts';
import { ForbiddenError } from '@/domain/access/guard';
import { EmptyState } from '@/components/ui/empty-state';
import { FinancePage } from './finance-page';
import { primeTranslations, t } from '@/i18n/server';
import { AccountsView } from './accounts-view';
import { can } from '@/domain/access/permissions';

/** حسابداری — دفترکلِ حساب‌ها. */
export default async function Finance({
  searchParams,
}: {
  searchParams: Promise<{
    account?: string; from?: string; to?: string; tag?: string;
    project?: string; party?: string; page?: string; per?: string;
    /** `all=1` — ردیف‌های دورهٔ بسته هم نشان داده شوند (پورتِ نمایشِ کاملِ دفتر). */
    all?: string;
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
        <main className="p-6">
          <EmptyState title={t("دسترسی ندارید")} description={t("برای دیدنِ بخشِ مالی از مدیر دسترسی بگیرید.")} />
        </main>
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
        <main className="p-6">
          <EmptyState
            title={t("حسابی تعریف نشده")}
            description={t("هنوز حسابی ساخته نشده. از مدیرِ مالی بخواهید یکی بسازد.")}
          />
        </main>
      );
    }
    const firstOptions = await getAccountFormOptions(actor);
    return (
      <main className="@container/main flex flex-col gap-4 p-4 lg:p-6">
        <header>
          <h1 className="text-xl font-semibold">{t("مالی")}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {t("برای شروع یک حساب بسازید؛ هر ردیفِ دفترکل به یک حساب می‌چسبد.")}
          </p>
        </header>
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
      </main>
    );
  }

  const query = await searchParams;
  const requested = Number(query.account);
  const accountId = accounts.some((a) => a.id === requested) ? requested : accounts[0]!.id;

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

  const [data, requests, archivedRequests, recurring, directory] = await Promise.all([
    getLedger(actor, filter),
    listRequests(actor),
    listRequests(actor, 'archived'),
    listRecurring(actor),
    bankDirectory(actor),
  ]);
  const options = data.canManage
    ? await getEntryFormOptions(actor)
    : {
      accounts: [], currencies: [], categories: [], projects: [], vendors: [], people: [],
      projectMemberIds: {}, memberCurrency: {}, defaultCurrencyId: null, lockDate: null,
    };

  const accountOptions = data.canManage ? await getAccountFormOptions(actor) : null;

  return (
    <main className="@container/main flex flex-col gap-4 p-4 lg:p-6">
      <header>
        <h1 className="text-xl font-semibold">{t("مالی")}</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">{data.account.name}</p>
      </header>

      <FinancePage
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
          memberCurrency: options.memberCurrency,
          defaultCurrencyId: options.defaultCurrencyId,
        }}
        canManage={data.canManage}
        paging={data.paging}
        periodScoped={data.periodScoped}
        directory={directory}
        requests={requests}
        archivedRequests={archivedRequests}
        isOwner={actor.roles.includes('owner')}
        categories={options.categories}
        recurring={recurring}
        vendors={options.vendors}
        today={new Date().toISOString().slice(0, 10)}
        accountOptions={accountOptions ? {
          currencies: accountOptions.currencies,
          offices: accountOptions.offices,
          people: accountOptions.people,
          accountantsByAccount: Object.fromEntries(accountOptions.accountantsByAccount),
        } : null}
      />
    </main>
  );
}
