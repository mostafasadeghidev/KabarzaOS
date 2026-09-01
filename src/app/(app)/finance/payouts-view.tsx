'use client';

import { useActionState, useEffect, useState, useTransition } from 'react';
import { useFormStatus } from 'react-dom';
import { Banknote, Check, Plus, Trash2, X } from 'lucide-react';
import {
  decideRequestAction, deleteRecurringAction, payRecurringAction,
  payRequestAction, saveRecurringAction, type PayoutState,
} from './_form/payout-actions';
import { format } from '@/domain/money/money';
import {
  BUCKET_LABELS, dueBucket, KIND_LABELS, UNIT_LABELS,
  type DueBucket, type IntervalUnit,
} from '@/domain/finance/recurring';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableNumericCell, TableRow,
} from '@/components/ui/table';
import { useT } from '@/i18n/client';
import { TablePager, TableSearch, useTableView } from '@/components/ui/table-search';
import { BankDirectory, type BankRow } from './bank-directory';

export interface RequestRow {
  id: number;
  amount: string;
  currencyCode: string | null;
  note: string;
  status: string;
  decisionNote: string;
  ledgerId: number | null;
  userName: string | null;
  projectTitle: string | null;
}

export interface RecurringRow {
  id: number;
  title: string;
  amount: string;
  currencyCode: string | null;
  kind: string;
  intervalUnit: string;
  intervalCount: number;
  nextDueDate: string;
  accountId: number | null;
  accountName: string | null;
  vendorName: string | null;
  isActive: boolean;
}

const STATUS: Record<string, { label: string; variant: 'secondary' | 'success' | 'outline' | 'warning' }> = {
  pending: { label: 'در انتظار', variant: 'warning' },
  approved: { label: 'تأییدشده', variant: 'secondary' },
  paid: { label: 'پرداخت‌شده', variant: 'success' },
  rejected: { label: 'ردشده', variant: 'outline' },
};

const BUCKET_STYLE: Record<DueBucket, string> = {
  overdue: 'text-destructive',
  week: 'text-orange-600 dark:text-orange-500',
  month: 'text-amber-600 dark:text-amber-500',
  next_month: 'text-muted-foreground',
  later: 'text-muted-foreground',
};

const field = 'h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50';

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return <Button type="submit" disabled={pending}>{pending ? 'در حالِ ثبت…' : label}</Button>;
}

/**
 * درخواست‌های پرداخت و هزینه‌های دوره‌ای.
 *
 * ⚠️ هر دو در نهایت ردیفِ دفتر می‌نویسند، پس دکمهٔ پرداخت حسابِ مقصد و تاریخ
 * می‌خواهد و همان گاردهای حسابداری (قفلِ دوره) رویشان اعمال می‌شود.
 */
export function PayoutsView({
  requests,
  recurring,
  accounts,
  currencies,
  vendors,
  today,
  canManage,
  directory,
}: {
  requests: RequestRow[];
  recurring: RecurringRow[];
  accounts: Array<{ id: number; name: string; currencyCode: string | null }>;
  currencies: Array<{ id: number; code: string; isDefault: boolean }>;
  vendors: Array<{ id: number; name: string }>;
  today: string;
  canManage: boolean;
  /** دفترچهٔ بانکی — سرور تصمیم گرفته چه کسی و چه ستونی دیده شود. */
  directory: { showPhone: boolean; rows: BankRow[] };
}) {
  const tr = useT();
  /**
   * جستجوی زندهٔ درخواست‌ها.
   * ⚠️ نام و پروژه هر دو گشته می‌شوند: حسابدار گاهی دنبالِ «چه کسی» است و
   * گاهی دنبالِ «کدام پروژه».
   */
  const requestsView = useTableView(
    requests, (r) => `${r.userName ?? ''} ${r.projectTitle ?? ''}`,
  );
  const t = useT();
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [payTarget, setPayTarget] = useState<RequestRow | null>(null);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [editing, setEditing] = useState<RecurringRow | null>(null);

  const [payState, payAction] = useActionState<PayoutState, FormData>(payRequestAction, {});
  const [expenseState, expenseAction] = useActionState<PayoutState, FormData>(saveRecurringAction, {});

  useEffect(() => { if (payState.ok) setPayTarget(null); }, [payState.ok]);
  useEffect(() => { if (expenseState.ok) { setExpenseOpen(false); setEditing(null); } }, [expenseState.ok]);

  const act = (fn: () => Promise<PayoutState>) =>
    startTransition(async () => {
      const result = await fn();
      setNotice(result.error ?? null);
    });

  // هزینه‌ها بر پایهٔ سررسید سطل‌بندی می‌شوند — همان دسته‌های نسخهٔ قبلی.
  /**
   * فیلترِ هزینه‌های دوره‌ای.
   *
   * ⚠️ فیلتر **پیش از** دسته‌بندی اعمال می‌شود، نه داخلِ هر دسته: وگرنه
   * دسته‌ای که همهٔ ردیف‌هایش فیلتر شده‌اند، سرصفحهٔ خالی نشان می‌داد.
   */
  const [expenseQuery, setExpenseQuery] = useState('');
  const [expenseVendor, setExpenseVendor] = useState('');
  const [expenseKind, setExpenseKind] = useState('');

  const needle = expenseQuery.trim().toLowerCase();
  const visibleRecurring = recurring.filter((x) => {
    if (!x.isActive) return false;
    // ⚠️ نامِ طرف‌حساب ملاک است، نه شناسه: ردیف فقط نام را حمل می‌کند.
    if (expenseVendor && (x.vendorName ?? '') !== expenseVendor) return false;
    if (expenseKind && x.kind !== expenseKind) return false;
    if (needle === '') return true;
    return `${x.title} ${x.vendorName ?? ''} ${x.accountName ?? ''}`
      .toLowerCase().includes(needle);
  });

  const buckets = new Map<DueBucket, RecurringRow[]>();
  for (const r of visibleRecurring) {
    const key = dueBucket(r.nextDueDate, today);
    buckets.set(key, [...(buckets.get(key) ?? []), r]);
  }
  const bucketOrder: DueBucket[] = ['overdue', 'week', 'month', 'next_month', 'later'];

  return (
    <div className="grid gap-6">
      {notice && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{notice}</p>
      )}

      {/* ---- درخواست‌های پرداخت ---- */}
      <section className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold">{t("درخواست‌های پرداخت")}</h2>
          {/* روی جدولِ درخواست‌ها. */}
          {requests.length > 0 && (
            <TableSearch view={requestsView} placeholder={tr('جستجوی عضو یا پروژه…')} />
          )}
        </div>
        {requests.length === 0 ? (
          <EmptyState title={t("درخواستی ثبت نشده")} />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("عضو")}</TableHead>
                  <TableHead>{t("پروژه")}</TableHead>
                  <TableHead>{t("مبلغ")}</TableHead>
                  <TableHead>{t("وضعیت")}</TableHead>
                  {canManage && <TableHead />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {requestsView.rows.map((r) => {
                  const s = STATUS[r.status] ?? { label: r.status, variant: 'secondary' as const };
                  return (
                    <TableRow key={r.id}>
                      <TableCell>{r.userName ?? '—'}</TableCell>
                      <TableCell>{r.projectTitle ?? '—'}</TableCell>
                      <TableNumericCell>{format(r.amount)}</TableNumericCell>
                      <TableCell>
                        <Badge variant={s.variant}>{t(s.label)}</Badge>
                        {r.decisionNote && (
                          <span className="ms-2 text-xs text-muted-foreground">{r.decisionNote}</span>
                        )}
                      </TableCell>
                      {canManage && (
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            {r.status === 'pending' && (
                              <>
                                <Button
                                  size="sm" variant="outline" disabled={pending}
                                  onClick={() => act(() => decideRequestAction(r.id, 'approved'))}
                                >
                                  <Check className="size-3.5" />
                                  {tr("تأیید")}
                                </Button>
                                <Button
                                  size="sm" variant="ghost"
                                  className="text-destructive hover:text-destructive"
                                  disabled={pending}
                                  onClick={() => act(() => decideRequestAction(r.id, 'rejected'))}
                                >
                                  <X className="size-3.5" />
                                  {tr("رد")}
                                </Button>
                              </>
                            )}
                            {/* ⚠️ فقط تأییدشده پرداخت می‌شود؛ ردشده و پرداخت‌شده دکمه ندارند. */}
                            {r.status === 'approved' && (
                              <Button size="sm" disabled={pending} onClick={() => setPayTarget(r)}>
                                <Banknote className="size-3.5" />
                                {tr("ثبت پرداخت در حسابداری")}
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <TablePager view={requestsView} />

      {/* ---- هزینه‌های دوره‌ای ---- */}
      <section className="grid gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">{t("هزینه‌های دوره‌ای")}</h2>
          {canManage && (
            <Button size="sm" onClick={() => { setEditing(null); setExpenseOpen(true); }}>
              <Plus className="size-4" />
              {tr("افزودن هزینه")}
            </Button>
          )}
        </div>

        {recurring.filter((r) => r.isActive).length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full max-w-xs">
              <Input
                type="search"
                value={expenseQuery}
                onChange={(e) => setExpenseQuery(e.target.value)}
                placeholder={tr('جستجوی عنوان، طرف‌حساب یا دسته…')}
                className="h-9"
              />
            </div>
            <select
              value={expenseVendor}
              onChange={(e) => setExpenseVendor(e.target.value)}
              className="h-9 rounded-md border bg-background px-2 text-sm"
              aria-label={tr('طرف‌حساب')}
            >
              <option value="">{tr('همهٔ طرف‌حساب‌ها')}</option>
              {vendors.map((v) => <option key={v.id} value={v.name}>{v.name}</option>)}
            </select>
            <select
              value={expenseKind}
              onChange={(e) => setExpenseKind(e.target.value)}
              className="h-9 rounded-md border bg-background px-2 text-sm"
              aria-label={tr('نوع')}
            >
              <option value="">{tr('هر نوع')}</option>
              <option value="recurring">{tr('دوره‌ای')}</option>
              <option value="one_off">{tr('یک‌بار')}</option>
            </select>
          </div>
        )}

        {visibleRecurring.length === 0 ? (
          <EmptyState title={t("هزینهٔ دوره‌ای ثبت نشده")} />
        ) : (
          bucketOrder.filter((b) => buckets.has(b)).map((bucket) => (
            <div key={bucket} className="grid gap-1.5">
              <h3 className={`text-sm font-medium ${BUCKET_STYLE[bucket]}`}>
                {t(BUCKET_LABELS[bucket])}
              </h3>
              <div className="overflow-x-auto">
                <Table>
                  <TableBody>
                    {buckets.get(bucket)!.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell>
                          {r.title}
                          <span className="ms-2 text-xs text-muted-foreground">
                            {t(KIND_LABELS[r.kind as 'recurring'] ?? r.kind)}
                            {r.kind === 'recurring' && ` · ${UNIT_LABELS[r.intervalUnit as IntervalUnit]}`}
                          </span>
                          {r.vendorName && (
                            <Badge variant="secondary" className="ms-2">{r.vendorName}</Badge>
                          )}
                        </TableCell>
                        <TableNumericCell>{format(r.amount)}</TableNumericCell>
                        <TableNumericCell>{r.nextDueDate}</TableNumericCell>
                        {canManage && (
                          <TableCell>
                            <div className="flex justify-end gap-1">
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={pending || r.accountId === null}
                                title={r.accountId === null ? 'ابتدا حسابِ پرداخت را انتخاب کنید' : undefined}
                                onClick={() => act(() => payRecurringAction(r.id, r.nextDueDate))}
                              >
                                <Banknote className="size-3.5" />
                                {tr("ثبت پرداخت")}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => { setEditing(r); setExpenseOpen(true); }}
                              >
                                {tr("ویرایش")}
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="size-8 text-muted-foreground hover:text-destructive"
                                aria-label={t("حذف")}
                                disabled={pending}
                                onClick={() => act(() => deleteRecurringAction(r.id))}
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
            </div>
          ))
        )}
      </section>

      {/* ---- مودالِ پرداختِ درخواست ---- */}
      <Dialog open={payTarget !== null} onOpenChange={(o) => !o && setPayTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("ثبت پرداخت در حسابداری")}</DialogTitle>
            <DialogDescription>
              {tr("یک ردیفِ خرج در حسابِ انتخابی نوشته می‌شود و درخواست «پرداخت‌شده» می‌گردد.")}
            </DialogDescription>
          </DialogHeader>

          {payTarget && (
            <form action={payAction} className="grid gap-3">
              <input type="hidden" name="requestId" value={payTarget.id} />
              <p className="text-sm">
                {payTarget.userName} — <span className="num">{format(payTarget.amount)}</span>
              </p>

              <div className="grid gap-1.5">
                <Label htmlFor="pay-account">{t("حساب")}</Label>
                <select id="pay-account" name="accountId" className={field} defaultValue={accounts[0]?.id ?? ''}>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.name} ({a.currencyCode})</option>
                  ))}
                </select>
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="pay-date">{t("تاریخ")}</Label>
                <Input id="pay-date" type="date" name="entryDate" className="num" defaultValue={today} required />
              </div>

              {payState.error && (
                <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {tr(payState.error)}
                </p>
              )}

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setPayTarget(null)}>{t("انصراف")}</Button>
                <Submit label={t("ثبت پرداخت")} />
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* ---- مودالِ هزینه ---- */}
      <Dialog open={expenseOpen} onOpenChange={setExpenseOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? 'ویرایش هزینه' : 'افزودن هزینه'}</DialogTitle>
            <DialogDescription>
              {tr("هزینهٔ «یک‌بار» پس از پرداخت بسته می‌شود؛ «دوره‌ای» سررسیدش جلو می‌رود.")}
            </DialogDescription>
          </DialogHeader>

          <form key={editing?.id ?? 'new'} action={expenseAction} className="grid gap-3">
            {editing && <input type="hidden" name="id" value={editing.id} />}

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="grid gap-1.5 sm:col-span-2">
                <Label htmlFor="e-title">{t("عنوان")}</Label>
                <Input id="e-title" name="title" defaultValue={editing?.title ?? ''} required />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="e-amount">{t("مبلغ")}</Label>
                <Input id="e-amount" name="amount" inputMode="decimal" className="num" defaultValue={editing?.amount ?? ''} required />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-4">
              <div className="grid gap-1.5">
                <Label htmlFor="e-cur">{t("ارز")}</Label>
                <select id="e-cur" name="currencyId" className={field} defaultValue={currencies.find((c) => c.isDefault)?.id ?? ''}>
                  {currencies.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}
                </select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="e-kind">{t("نوع")}</Label>
                <select id="e-kind" name="kind" className={field} defaultValue={editing?.kind ?? 'recurring'}>
                  <option value="recurring">{t("دوره‌ای")}</option>
                  <option value="once">{t("یک‌بار")}</option>
                </select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="e-unit">{t("دوره")}</Label>
                <select id="e-unit" name="intervalUnit" className={field} defaultValue={editing?.intervalUnit ?? 'month'}>
                  {(Object.keys(UNIT_LABELS) as IntervalUnit[]).map((u) => (
                    <option key={u} value={u}>{t(UNIT_LABELS[u])}</option>
                  ))}
                </select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="e-count">{t("هر چند دوره")}</Label>
                <Input id="e-count" name="intervalCount" type="number" className="num" defaultValue={editing?.intervalCount ?? 1} />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-4">
              <div className="grid gap-1.5">
                <Label htmlFor="e-start">{t("تاریخ شروع")}</Label>
                <Input id="e-start" type="date" name="startDate" className="num" defaultValue={editing?.nextDueDate ?? today} required />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="e-next">{t("سررسیدِ بعدی")}</Label>
                <Input id="e-next" type="date" name="nextDueDate" className="num" defaultValue={editing?.nextDueDate ?? ''} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="e-account">{t("حسابِ پرداخت")}</Label>
                <select
                  id="e-account"
                  name="accountId"
                  className={field}
                  defaultValue={editing?.accountId ? String(editing.accountId) : ''}
                >
                  <option value="">{t("— بدونِ حساب —")}</option>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="e-vendor">{t("طرف‌حساب")}</Label>
                <select id="e-vendor" name="vendorId" className={field} defaultValue="">
                  <option value="">{t("بدون طرف‌حساب")}</option>
                  {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              {tr("بدونِ «حسابِ پرداخت» هزینه ثبت می‌شود ولی پرداختی در دفتر نوشته نمی‌شود.")}
            </p>

            {expenseState.error && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {tr(expenseState.error)}
              </p>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setExpenseOpen(false)}>{t("انصراف")}</Button>
              <Submit label={t("ذخیره")} />
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/*
        ⚠️ زیرِ درخواست‌ها می‌نشیند، نه تبِ جدا: نسخهٔ قبلی هم آن را در همان
        صفحهٔ پرداخت‌ها دارد، چون درست وقتی لازم می‌شود که کسی دارد پرداخت
        می‌کند.
      */}
      <div className="rounded-md border p-3">
        <BankDirectory rows={directory.rows} showPhone={directory.showPhone} />
      </div>
    </div>
  );
}
