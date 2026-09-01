'use client';

import { useActionState, useEffect, useState, useTransition } from 'react';
import { useFormStatus } from 'react-dom';
import { ArrowLeftRight, Lock, Paperclip, Plus, Trash2 } from 'lucide-react';
import {
  deleteEntryAction, saveEntryAction, transferAction, type FinanceState,
} from './_form/actions';
import { EntryForm } from './entry-form';
import { format } from '@/domain/money/money';
import { humanSize, MAX_SIZE } from '@/domain/files/upload';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableNumericCell, TableRow,
} from '@/components/ui/table';
import { useT } from '@/i18n/client';
import { LedgerFilter, type LedgerPaging } from './ledger-filter';
import { TableSearch, useTableView } from '@/components/ui/table-search';

/** یک حساب — همان شکلی که `listAccounts` برمی‌گرداند. */
export interface AccountOption {
  id: number;
  name: string;
  type: string;
  currencyId: number;
  currencyCode: string | null;
  openingBalance: string;
  officeId: number | null;
  officeName: string | null;
  isActive: boolean;
}

export interface EntryRow {
  id: number;
  entryDate: string;
  direction: string;
  description: string;
  amount: string;
  currencyId: number;
  amountAccount: string;
  amountEur: string;
  payerLabel: string;
  payerName: string | null;
  receiverLabel: string;
  projectId: number | null;
  projectTitle: string | null;
  receipts: ReceiptView[];
  /** آخرین ثبت/ویرایش‌کننده — پورتِ ستونِ «توسط» ِ نسخهٔ قبلی. */
  lastActor: string | null;
}

/** رسیدِ پیوستِ ردیف — همیشه از مسیرِ گیت‌شده خوانده می‌شود، نه S3. */
export interface ReceiptView {
  id: number;
  originalName: string;
  mime: string;
  size: number;
  href: string;
  kind: string;
}

export interface FormOptions {
  accounts: AccountOption[];
  currencies: Array<{ id: number; code: string; isDefault: boolean }>;
  /** `dir` = both | in | out — تگ با جهت فیلتر می‌شود (R-FORM-04). */
  categories: Array<{ id: number; name: string; dir?: string }>;
  projects: Array<{ id: number; title: string; currencyId?: number | null }>;
  people: Array<{ id: number; name: string; email?: string }>;
  /** پروژه ← شناسهٔ اعضایش (R-FORM-02). */
  projectMemberIds: Record<number, number[]>;
  /** «projectId:userId» ← ارزِ قرارداد (R-FORM-05). */
  memberCurrency: Record<string, number>;
  defaultCurrencyId: number | null;
}

const cellSelect =
  'h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50';

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return <Button type="submit" disabled={pending}>{pending ? 'در حالِ ثبت…' : label}</Button>;
}

/**
 * دفترکل — بازسازیِ:
 * انتخابِ حساب ← کارت‌های مانده ← جدولِ ردیف‌ها ← ثبت/ویرایش/حذف ← انتقال.
 *
 * ⚠️ نشانِ قفلِ دوره بالای صفحه دیده می‌شود تا کاربر پیش از پر کردنِ فرم
 * بداند کدام تاریخ‌ها بسته‌اند.
 */
export function LedgerView({
  accountId,
  accounts,
  entries,
  totals,
  currencyCode,
  lockDate,
  options,
  canManage,
  paging,
  onSelectAccount,
}: {
  accountId: number;
  accounts: AccountOption[];
  entries: EntryRow[];
  totals: { in: string; out: string; balance: string; opening: string };
  currencyCode: string | null;
  lockDate: string | null;
  options: FormOptions;
  canManage: boolean;
  paging: LedgerPaging;
  onSelectAccount: (id: number) => void;
}) {
  const tr = useT();
  const t = useT();

  /**
   * جستجوی زندهٔ ردیف‌های صفحهٔ جاری.
   * ⚠️ مبلغ هم گشته می‌شود، چون نسخهٔ قبلی صریحاً «مبلغ، پروژه، توضیحات» نوشته:
   * حسابدار اغلب عددی را به یاد دارد، نه شرح را.
   */
  const entriesView = useTableView(
    entries,
    (e) => [
      e.description, e.projectTitle ?? '', e.payerName ?? '', e.payerLabel ?? '',
      e.receiverLabel ?? '', e.amount, e.amountAccount, e.entryDate,
    ].join(' '),
    30,
  );
  const [formOpen, setFormOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [editing, setEditing] = useState<EntryRow | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [entryState, entryAction] = useActionState<FinanceState, FormData>(saveEntryAction, {});
  const [transferState, transferFormAction] = useActionState<FinanceState, FormData>(transferAction, {});

  useEffect(() => { if (entryState.ok) { setFormOpen(false); setEditing(null); } }, [entryState.ok]);
  useEffect(() => { if (transferState.ok) setTransferOpen(false); }, [transferState.ok]);

  const keep = (name: string, fallback = '') => entryState.values?.[name] ?? fallback;
  const today = new Date().toISOString().slice(0, 10);

  const cards: Array<{ label: string; value: string; strong?: boolean }> = [
    { label: 'ارز حساب', value: currencyCode ?? '—' },
    { label: 'مانده اولیه', value: format(totals.opening) },
    { label: 'مجموع واریز', value: format(totals.in) },
    { label: 'مجموع برداشت', value: format(totals.out) },
    { label: 'مانده', value: format(totals.balance), strong: true },
  ];

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <select
          className={`${cellSelect} max-w-xs`}
          value={accountId}
          onChange={(e) => onSelectAccount(Number(e.target.value))}
        >
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} ({a.currencyCode})
            </option>
          ))}
        </select>

        {canManage && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setTransferOpen(true)}>
              <ArrowLeftRight className="size-4" />
              {tr("انتقال")}
            </Button>
            <Button size="sm" onClick={() => { setEditing(null); setFormOpen(true); }}>
              <Plus className="size-4" />
              {tr("ثبت ردیف جدید")}
            </Button>
          </div>
        )}
      </div>

      <LedgerFilter
        accountId={accountId}
        options={{ categories: options.categories, projects: options.projects }}
        paging={paging}
      />

      {/* ⚠️ نشانِ قفل پیش از فرم دیده می‌شود، نه بعد از خطا. */}
      {lockDate && (
        <p className="flex items-center gap-1.5 rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-500">
          <Lock className="size-3.5" />
          {tr('دورهٔ مالی تا {date} بسته است؛ ردیف‌های آن بازه تغییر نمی‌کنند.', {
            date: lockDate,
          })}
        </p>
      )}

      {notice && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{notice}</p>
      )}

      <div className="grid gap-3 @2xl/main:grid-cols-5 @xl/main:grid-cols-3">
        {cards.map((c) => (
          <Card key={c.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-normal text-muted-foreground">{t(c.label)}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className={`num ${c.strong ? 'text-lg font-semibold' : 'text-sm font-medium'}`}>
                {c.value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/*
        ⚠️ این **کنارِ** فیلترِ سرور می‌نشیند و جایش را نمی‌گیرد: فیلترِ بالا
        دامنه را از دیتابیس باریک می‌کند، این داخلِ همان صفحه می‌گردد —
        دقیقاً همان تقسیمِ کارِ نسخهٔ قبلی ( کنارِ فرمِ GET).
      */}
      {entries.length > 0 && (
        <TableSearch view={entriesView} placeholder={tr('جستجوی زنده (مبلغ، پروژه، توضیحات…)')} />
      )}

      {entries.length === 0 ? (
        <EmptyState title={t("ردیفی ثبت نشده")} />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("تاریخ")}</TableHead>
                <TableHead>{t("بابت")}</TableHead>
                <TableHead>{t("جهت")}</TableHead>
                <TableHead>{t("مبلغ")}</TableHead>
                <TableHead>{t("معادل یورو")}</TableHead>
                <TableHead>{t("توسط")}</TableHead>
                {canManage && <TableHead />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {entriesView.rows.map((e) => (
                <TableRow key={e.id}>
                  <TableNumericCell>{e.entryDate}</TableNumericCell>
                  <TableCell>
                    {e.description || e.receiverLabel || e.payerName || '—'}
                    {e.projectTitle && (
                      <Badge variant="secondary" className="ms-2">{e.projectTitle}</Badge>
                    )}
                    {/* ردیفِ دارای سند با یک نگاه دیده شود. */}
                    {e.receipts.length > 0 && (
                      <a
                        href={e.receipts[0]!.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={t('{n} رسید', { n: e.receipts.length })}
                        className="ms-2 inline-flex items-center gap-0.5 align-middle text-muted-foreground hover:text-foreground"
                      >
                        <Paperclip className="size-3.5" />
                        {e.receipts.length > 1 && (
                          <span className="num text-xs">{e.receipts.length}</span>
                        )}
                      </a>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={e.direction === 'in' ? 'success' : 'outline'}>
                      {e.direction === 'in' ? tr('واریز / درآمد') : tr('برداشت / هزینه')}
                    </Badge>
                  </TableCell>
                  <TableNumericCell>{format(e.amountAccount)}</TableNumericCell>
                  <TableNumericCell>{format(e.amountEur)}</TableNumericCell>
                  <TableCell className="text-muted-foreground">{e.lastActor ?? '—'}</TableCell>
                  {canManage && (
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => { setEditing(e); setFormOpen(true); }}
                        >
                          {tr("ویرایش")}
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-8 text-muted-foreground hover:text-destructive"
                          aria-label={t("حذفِ ردیف")}
                          disabled={pending}
                          onClick={() =>
                            startTransition(async () => {
                              const result = await deleteEntryAction(e.id);
                              setNotice(result.error ?? null);
                            })
                          }
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* ---- فرمِ ردیف ---- */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? 'ویرایش ردیف' : 'ثبت ردیف جدید'}</DialogTitle>
            <DialogDescription>
              {tr("مبلغ در ارزِ دلخواه وارد می‌شود؛ معادلِ حساب و یورو خودکار محاسبه می‌شوند.")}
            </DialogDescription>
          </DialogHeader>

          <form key={editing?.id ?? 'new'} action={entryAction} className="grid gap-3">
            <EntryForm
              editing={editing}
              options={options}
              accountId={accountId}
              today={today}
              keep={keep}
              fieldErrors={entryState.fieldErrors}
              error={entryState.error ? tr(entryState.error) : undefined}
              onCancel={() => setFormOpen(false)}
            />
          </form>
        </DialogContent>
      </Dialog>

      {/* ---- انتقال ---- */}
      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("انتقال بینِ حساب‌ها")}</DialogTitle>
            <DialogDescription>
              {tr("مبلغِ خروجی و مبلغِ واقعاً رسیده جدا وارد می‌شوند تا کارمزد طبیعی ثبت شود.")}
            </DialogDescription>
          </DialogHeader>

          <form action={transferFormAction} className="grid gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="t-from">{t("از حساب")}</Label>
                <select id="t-from" name="fromAccountId" className={cellSelect} defaultValue={accountId}>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.name} ({a.currencyCode})</option>
                  ))}
                </select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="t-to">{t("به حساب")}</Label>
                <select id="t-to" name="toAccountId" className={cellSelect} defaultValue="">
                  <option value="">{t("— انتخاب —")}</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.name} ({a.currencyCode})</option>
                  ))}
                </select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="t-famount">{t("مبلغِ خروجی")}</Label>
                <Input id="t-famount" name="fromAmount" inputMode="decimal" className="num" required />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="t-tamount">{t("مبلغِ رسیده")}</Label>
                <Input id="t-tamount" name="toAmount" inputMode="decimal" className="num" required />
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="t-date">{t("تاریخ")}</Label>
              <Input id="t-date" type="date" name="entryDate" className="num" defaultValue={today} required />
            </div>

            {transferState.error && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {tr(transferState.error)}
              </p>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setTransferOpen(false)}>{t("انصراف")}</Button>
              <SubmitButton label={t("ثبتِ انتقال")} />
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
