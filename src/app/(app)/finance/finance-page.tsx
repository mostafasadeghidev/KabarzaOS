'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { LedgerPaging } from './ledger-filter';
import type { BankRow } from './bank-directory';
import { LedgerView } from './ledger-view';
import type { AccountOption, EntryRow, FormOptions } from './ledger-view';
import { PayoutsView, type RecurringRow, type RequestRow , type UnitRow, type DetachedRow } from './payouts-view';
import { AccountsView, type AccountFormOptions } from './accounts-view';
import { useT } from '@/i18n/client';

/**
 * ⚠️ «پرداخت‌ها و هزینه‌ها» به دو تب شکست.
 *
 * پولِ **اعضا** (درخواست‌های پرداخت + شمارهٔ حسابشان) و هزینهٔ **شرکت**
 * (اجاره، اشتراک) دو کارِ متفاوتِ دو نفرِ متفاوت‌اند و هیچ‌وقت با هم دیده
 * نمی‌شوند. نسخهٔ قبلی هم همین را دارد: «مالی اعضا» صفحهٔ خودش است و
 * هزینه‌ها تبی از «مدیریت مالی».
 */
const TABS = [
  { key: 'ledger', label: 'دفترکل', ownerOnly: false },
  { key: 'members', label: 'مالی اعضا', ownerOnly: false },
  { key: 'expenses', label: 'هزینه‌ها', ownerOnly: false },
  /**
   * ⚠️ فقط برای مدیر: `accountOptions` برای بینندهٔ خواندنی `null` است و
   * تبِ خالی — بدونِ جدول، بدونِ پیام — از نبودنش بدتر بود.
   */
  { key: 'accounts', label: 'حساب‌های بانکی', ownerOnly: true },
] as const;

/**
 * صفحهٔ مالی — دفترکل و پرداخت‌ها.
 * تعویضِ حساب به URL می‌رود تا رفرش و لینکِ مستقیم همان حساب را باز کند.
 */
export function FinancePage({
  requests,
  archivedRequests,
  unpaidUnits,
  detachedPayments,
  isOwner,
  categories,
  directory,
  recurring,
  vendors,
  today,
  accountOptions,
  ...props
}: {
  /** درخواست‌های بایگانی‌شده (تصمیم‌گرفته پیش از قفل) — تبِ جدا. */
  archivedRequests: RequestRow[];
  unpaidUnits: UnitRow[];
  detachedPayments: DetachedRow[];
  /** تأیید/رد فقط مالک؛ حسابدار پرداخت می‌کند. */
  isOwner: boolean;
  categories: Array<{ id: number; name: string | null }>;
  accountId: number;
  accounts: AccountOption[];
  entries: EntryRow[];
  totals: { in: string; out: string; balance: string; opening: string; carried: boolean };
  currencyCode: string | null;
  lockDate: string | null;
  options: FormOptions;
  canManage: boolean;
  paging: LedgerPaging;
  periodScoped: boolean;
  directory: { showPhone: boolean; rows: BankRow[] };
  requests: RequestRow[];
  recurring: RecurringRow[];
  vendors: Array<{ id: number; name: string }>;
  today: string;
  accountOptions: AccountFormOptions | null;
}) {
  const tr = useT();
  const router = useRouter();

  /**
   * تبِ آغازین از نشانی خوانده می‌شود.
   *
   * ⚠️ چرا لازم شد: اعلانِ «درخواستِ پرداخت» به `/finance?tab=…` لینک می‌دهد.
   * تا وقتی تب فقط state ِ محلی بود، آن پارامتر بی‌اثر بود و حسابدار پس از
   * کلیک روی اعلان، دفترکل را می‌دید نه درخواست را — اعلان به مقصد می‌رسید
   * ولی به **جای** درست نمی‌رسید.
   *
   * ⚠️ کلیدِ ناشناخته بی‌صدا به دفترکل برمی‌گردد؛ لینکِ قدیمی نباید صفحهٔ
   * خالی بدهد.
   */
  const params = useSearchParams();
  const asked = params.get('tab');
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>(
    TABS.some((x) => x.key === asked) ? (asked as (typeof TABS)[number]['key']) : 'ledger',
  );
  const visible = TABS.filter((t) => !t.ownerOnly || accountOptions !== null);

  return (
    <div className="grid gap-4">
      <nav className="flex flex-wrap gap-1 border-b">
        {visible.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm transition-colors ${
              tab === t.key
                ? 'border-primary font-medium text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tr(t.label)}
          </button>
        ))}
      </nav>

      {tab === 'ledger' && (
        <LedgerView
          {...props}
          onSelectAccount={(id) => router.push(`/finance?account=${id}`)}
        />
      )}

      {tab === 'accounts' && accountOptions && (
        <AccountsView
          accounts={props.accounts}
          options={accountOptions}
          canManage={props.canManage}
        />
      )}

      {(tab === 'members' || tab === 'expenses') && (
        <PayoutsView
          section={tab}
          directory={directory}
          requests={requests}
          archivedRequests={archivedRequests}
          unpaidUnits={unpaidUnits}
          detachedPayments={detachedPayments}
          isOwner={isOwner}
          lockDate={props.lockDate}
          categories={categories}
          recurring={recurring}
          accounts={props.accounts}
          currencies={props.options.currencies}
          vendors={vendors}
          today={today}
          canManage={props.canManage}
        />
      )}
    </div>
  );
}
