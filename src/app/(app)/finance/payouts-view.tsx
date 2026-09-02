'use client';

import { useActionState, useEffect, useState, useTransition } from 'react';
import { useFormStatus } from 'react-dom';
import { Banknote, Check, Plus, Trash2, X } from 'lucide-react';
import {
  decideRequestAction, deleteRecurringAction, payRecurringAction,
  payRequestAction, payUnitAction, saveRecurringAction, type PayoutState,
} from './_form/payout-actions';
import { format } from '@/domain/money/money';
import {
  BUCKET_LABELS, dueBucket, intervalLabel, KIND_LABELS, UNIT_LABELS,
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
import { useActionToast, useToast } from '@/components/ui/toast';
import { useT } from '@/i18n/client';
import { TablePager, TableSearch, useTableView } from '@/components/ui/table-search';
import { BankDirectory, type BankRow } from './bank-directory';
import { useConfirm } from '@/components/ui/confirm';

export interface RequestRow {
  id: number;
  amount: string;
  currencyCode: string | null;
  note: string;
  status: string;
  decisionNote: string;
  ledgerId: number | null;
  createdAt: Date;
  userName: string | null;
  projectTitle: string | null;
  /** ماندهٔ قراردادِ عضو در همان پروژه — پورتِ ستونِ `member_summary`. */
  remaining: string | null;
  remainingCurrencyCode: string | null;
  /** خانهٔ بانکی — کارت/شبا/حساب (پورتِ `bank_cell`). */
  bankCard: string | null;
  bankIban: string | null;
  bankAccount: string | null;
}

/** کارکردِ تعدادیِ پرداخت‌نشده (Flow 1 ِ افزونه). */
export interface UnitRow {
  id: number;
  entryDate: string;
  quantity: string;
  amount: string;
  currencyCode: string | null;
  userName: string | null;
  projectTitle: string | null;
}

/** پرداختِ بی‌پروژه — مانده از «جداسازی». */
export interface DetachedRow {
  id: number;
  paidAt: string | null;
  direction: string;
  amount: string;
  currencyCode: string | null;
  note: string;
  userName: string | null;
  receiptId: number | null;
}

/** برچسبِ جهتِ پرداخت — پورتِ `payment_dir_label()`. */
const PAY_DIRECTION_LABELS: Record<string, string> = {
  incoming: 'دریافت از کارفرما',
  member_payout: 'پرداخت به عضو',
  project_expense: 'هزینهٔ پروژه',
  project_cost: 'هزینهٔ پروژه',
};

export interface RecurringRow {
  id: number;
  title: string;
  amount: string;
  currencyId: number | null;
  currencyCode: string | null;
  vendorId: number | null;
  categoryTagId: number | null;
  note: string;
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

/** برچسبِ تب‌های وضعیت — همان چهار وضعیت + «همه» و «بایگانی‌شده». */
const REQUEST_TAB_LABELS: Record<RequestTab, string> = {
  pending: 'در انتظار',
  approved: 'تأییدشده',
  paid: 'پرداخت‌شده',
  rejected: 'ردشده',
  all: 'همه',
  archived: 'بایگانی‌شده',
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
  const tr = useT();
  return <Button type="submit" disabled={pending}>{pending ? tr('در حالِ ثبت…') : label}</Button>;
}

/**
 * درخواست‌های پرداخت و هزینه‌های دوره‌ای.
 *
 * ⚠️ هر دو در نهایت ردیفِ دفتر می‌نویسند، پس دکمهٔ پرداخت حسابِ مقصد و تاریخ
 * می‌خواهد و همان گاردهای حسابداری (قفلِ دوره) رویشان اعمال می‌شود.
 */
type RequestTab = 'pending' | 'approved' | 'paid' | 'rejected' | 'all' | 'archived';

export function PayoutsView({
  section,
  requests,
  unpaidUnits = [],
  detachedPayments = [],
  archivedRequests = [],
  isOwner,
  lockDate = null,
  categories = [],
  recurring,
  accounts,
  currencies,
  vendors,
  today,
  canManage,
  directory,
}: {
  archivedRequests?: RequestRow[];
  unpaidUnits?: UnitRow[];
  detachedPayments?: DetachedRow[];
  /** تأیید/رد فقط مالک (پورتِ `manage_options`)؛ حسابدار فقط پرداخت می‌کند. */
  isOwner: boolean;
  lockDate?: string | null;
  categories?: Array<{ id: number; name: string | null }>;
  /**
   * کدام نیمه رندر شود.
   *
   * ⚠️ چرا یک پراپ و نه دو فایل: تقسیمِ فیزیکیِ این ۵۲۰ خط چهار چیز را
   * می‌شکست — `field` و `Submit` که هر دو دیالوگ از آن استفاده می‌کنند،
   * `TablePager` که بینِ دو بخش افتاده، و تایپ‌هایی که `finance-page`
   * ایمپورت می‌کند. نتیجهٔ دیدنی همان است: دو تبِ جدا.
   */
  section: 'members' | 'expenses';
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
  /**
   * تب‌های وضعیت — پورتِ `status_tabs()`: مالک همهٔ وضعیت‌ها (+ بایگانی پس از
   * قفل)، حسابدار فقط تأییدشده/پرداخت‌شده. سرور همین‌ها را برگردانده؛ تب فقط
   * فیلترِ نمایش است.
   */
  const tabs: RequestTab[] = isOwner
    ? ['pending', 'approved', 'paid', 'rejected', 'all', ...(lockDate ? ['archived' as const] : [])]
    : ['approved', 'paid', 'all'];
  const [status, setStatus] = useState<RequestTab>(tabs[0]!);
  const tabRows = status === 'archived'
    ? archivedRequests
    : requests.filter((r) => status === 'all' || r.status === status);
  const pendingCount = requests.filter((r) => r.status === 'pending').length;
  const requestsView = useTableView(
    tabRows, (r) => `${r.userName ?? ''} ${r.projectTitle ?? ''}`,
  );
  const t = useT();
  const confirm = useConfirm();
  const [rejectTarget, setRejectTarget] = useState<RequestRow | null>(null);
  const [rejectNote, setRejectNote] = useState('');
  const [expenseStatus, setExpenseStatus] = useState<'active' | 'inactive' | 'all'>('active');
  const [pending, startTransition] = useTransition();
  const [payTarget, setPayTarget] = useState<RequestRow | null>(null);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [editing, setEditing] = useState<RecurringRow | null>(null);

  const [payState, payAction] = useActionState<PayoutState, FormData>(payRequestAction, {});
  const { show } = useToast();
  useActionToast(payState, { success: 'پرداخت ثبت شد.' });
  const [expenseState, expenseAction] = useActionState<PayoutState, FormData>(saveRecurringAction, {});
  useActionToast(expenseState, { success: 'هزینه ذخیره شد.' });

  useEffect(() => { if (payState.ok) setPayTarget(null); }, [payState]);
  const [unitTarget, setUnitTarget] = useState<UnitRow | null>(null);
  const [unitState, unitAction] = useActionState<PayoutState, FormData>(payUnitAction, {});
  useActionToast(unitState, { success: 'پرداخت ثبت شد.' });
  useEffect(() => { if (unitState.ok) setUnitTarget(null); }, [unitState]);
  useEffect(() => { if (expenseState.ok) { setExpenseOpen(false); setEditing(null); } }, [expenseState]);

  const act = (fn: () => Promise<PayoutState>) =>
    startTransition(async () => {
      const result = await fn();
      if (result.error) show(tr(result.error), 'error');
      else show(tr('انجام شد.'), 'success');
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
    // ⚠️ غیرفعال‌ها هم دیدنی‌اند — هزینهٔ یک‌بارِ پرداخت‌شده پیش از این برای همیشه گم می‌شد.
    if (expenseStatus === 'active' && !x.isActive) return false;
    if (expenseStatus === 'inactive' && x.isActive) return false;
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
      {/* ---- درخواست‌های پرداخت ---- */}
      {section === 'members' && (
      <section className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold">{t("درخواست‌های پرداخت")}</h2>
          {/* روی جدولِ درخواست‌ها. */}
          {requests.length > 0 && (
            <TableSearch view={requestsView} placeholder={tr('جستجوی عضو یا پروژه…')} />
          )}
        </div>
        <nav className="flex flex-wrap gap-1 border-b pb-2">
          {tabs.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setStatus(key)}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors ${
                status === key ? 'bg-muted font-medium' : 'text-muted-foreground hover:bg-muted/60'
              }`}
            >
              {t(REQUEST_TAB_LABELS[key])}
              {key === 'pending' && pendingCount > 0 && (
                <Badge variant="secondary" className="num px-1.5 py-0 text-[10px]">{pendingCount}</Badge>
              )}
            </button>
          ))}
        </nav>
        {tabRows.length === 0 ? (
          <EmptyState title={t("درخواستی در این وضعیت نیست")} />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("عضو")}</TableHead>
                  <TableHead>{t("پروژه")}</TableHead>
                  <TableHead>{t("مبلغ")}</TableHead>
                  <TableHead>{t("ماندهٔ قرارداد")}</TableHead>
                  <TableHead>{t("تاریخ")}</TableHead>
                  <TableHead>{t("وضعیت")}</TableHead>
                  <TableHead>{t("اطلاعات بانکی")}</TableHead>
                  {canManage && <TableHead />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {requestsView.rows.map((r) => {
                  const s = STATUS[r.status] ?? { label: r.status, variant: 'secondary' as const };
                  return (
                    <TableRow key={r.id}>
                      <TableCell>
                        {r.userName ?? '—'}
                        {/* یادداشتِ خودِ عضو روی درخواست — پورتِ ستونِ «توضیح». */}
                        {r.note && <span className="block text-xs text-muted-foreground">{r.note}</span>}
                      </TableCell>
                      <TableCell>{r.projectTitle ?? '—'}</TableCell>
                      <TableNumericCell>{format(r.amount)} {r.currencyCode ?? ''}</TableNumericCell>
                      <TableNumericCell className="text-muted-foreground">
                        {r.remaining === null ? '—' : `${format(r.remaining)} ${r.remainingCurrencyCode ?? ''}`}
                      </TableNumericCell>
                      <TableNumericCell className="text-muted-foreground">{String(r.createdAt).slice(0, 10)}</TableNumericCell>
                      <TableCell>
                        <Badge variant={s.variant}>{t(s.label)}</Badge>
                        {r.decisionNote && (
                          <span className="ms-2 text-xs text-muted-foreground">{r.decisionNote}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {r.bankCard || r.bankIban || r.bankAccount ? (
                          <span className="grid">
                            {r.bankCard && <span className="num">{t("کارت")}: {r.bankCard}</span>}
                            {r.bankIban && <span className="num">{t("شبا")}: {r.bankIban}</span>}
                            {r.bankAccount && <span className="num">{t("حساب")}: {r.bankAccount}</span>}
                          </span>
                        ) : '—'}
                      </TableCell>
                      {canManage && (
                        <TableCell>
                          {/*
                            پورتِ `request_actions()`: مالک → تأیید (در انتظار)، پرداخت
                            (در انتظار یا تأییدشده)، رد با دلیل (در انتظار/تأییدشده)؛
                            حسابدار → فقط پرداختِ تأییدشده.
                          */}
                          <div className="flex justify-end gap-1">
                            {isOwner && r.status === 'pending' && (
                              <Button
                                size="sm" variant="outline" disabled={pending}
                                onClick={() => act(() => decideRequestAction(r.id, 'approved'))}
                              >
                                <Check className="size-3.5" />
                                {tr("تأیید")}
                              </Button>
                            )}
                            {(r.status === 'approved' || (isOwner && r.status === 'pending')) && (
                              <Button size="sm" disabled={pending} onClick={() => setPayTarget(r)}>
                                <Banknote className="size-3.5" />
                                {tr("ثبت پرداخت در حسابداری")}
                              </Button>
                            )}
                            {isOwner && (r.status === 'pending' || r.status === 'approved') && (
                              <Button
                                size="sm" variant="ghost"
                                className="text-destructive hover:text-destructive"
                                disabled={pending}
                                onClick={() => { setRejectNote(''); setRejectTarget(r); }}
                              >
                                <X className="size-3.5" />
                                {tr("رد")}
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
      )}

      {/* ⚠️ صفحه‌بند به جدولِ درخواست‌ها تعلق دارد، نه به هزینه‌ها. */}
      {section === 'members' && <TablePager view={requestsView} />}

      {/* ---- کارکردهای پرداخت‌نشده — Flow 1: حسابدار ردیف را مستقیم می‌پردازد ---- */}
      {section === 'members' && (
      <section className="grid gap-3">
        <div>
          <h2 className="text-base font-semibold">{t("کارکردهای پرداخت‌نشده")}</h2>
          <p className="text-xs text-muted-foreground">
            {tr("ردیف‌های کارکردِ تعدادی که هنوز پرداخت نشده‌اند و درخواستِ بازی ندارند؛ «ثبت در حسابداری» ردیفِ برداشت را می‌نویسد و کارکرد «پرداخت‌شده» می‌شود.")}
          </p>
        </div>
        {unpaidUnits.length === 0 ? (
          <EmptyState title={t("موردی نیست.")} />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("تاریخ")}</TableHead>
                  <TableHead>{t("عضو")}</TableHead>
                  <TableHead>{t("پروژه")}</TableHead>
                  <TableHead>{t("تعداد")}</TableHead>
                  <TableHead>{t("مبلغ")}</TableHead>
                  {canManage && <TableHead />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {unpaidUnits.map((u) => (
                  <TableRow key={u.id}>
                    <TableNumericCell>{u.entryDate}</TableNumericCell>
                    <TableCell>{u.userName ?? '—'}</TableCell>
                    <TableCell>{u.projectTitle ?? '—'}</TableCell>
                    <TableNumericCell>{format(u.quantity)}</TableNumericCell>
                    <TableNumericCell>{format(u.amount)} {u.currencyCode ?? ''}</TableNumericCell>
                    {canManage && (
                      <TableCell>
                        <div className="flex justify-end">
                          <Button size="sm" disabled={pending} onClick={() => setUnitTarget(u)}>
                            <Banknote className="size-3.5" />
                            {tr("ثبت در حسابداری")}
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
      </section>
      )}

      {/* ---- پرداخت‌های بی‌پروژه — مانده از «جداسازی» ---- */}
      {section === 'members' && detachedPayments.length > 0 && (
      <section className="grid gap-3">
        <div>
          <h2 className="text-base font-semibold">{t("پرداخت‌های بی‌پروژه")}</h2>
          <p className="text-xs text-muted-foreground">
            {tr("ردیف‌هایی که با «جداسازی» از پروژهٔ حذف‌شده مانده‌اند؛ پول در دفتر هست و نامِ پروژه در توضیحات.")}
          </p>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("تاریخ")}</TableHead>
                <TableHead>{t("طرف")}</TableHead>
                <TableHead>{t("نوع")}</TableHead>
                <TableHead>{t("مبلغ")}</TableHead>
                <TableHead>{t("توضیحات")}</TableHead>
                <TableHead>{t("رسید")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {detachedPayments.map((p) => (
                <TableRow key={p.id}>
                  <TableNumericCell>{p.paidAt ?? '—'}</TableNumericCell>
                  <TableCell>{p.userName ?? '—'}</TableCell>
                  <TableCell>{t(PAY_DIRECTION_LABELS[p.direction] ?? p.direction)}</TableCell>
                  <TableNumericCell>{format(p.amount)} {p.currencyCode ?? ''}</TableNumericCell>
                  <TableCell className="text-muted-foreground">{p.note || '—'}</TableCell>
                  <TableCell>
                    {p.receiptId ? (
                      <a href={`/api/files/${p.receiptId}`} target="_blank" rel="noopener noreferrer" className="underline">
                        {t("رسید")}
                      </a>
                    ) : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>
      )}

      {/* ---- هزینه‌های دوره‌ای ---- */}
      {section === 'expenses' && (
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
              <option value="once">{tr('یک‌بار')}</option>
            </select>
            <select
              className={`${field} sm:w-40`}
              value={expenseStatus}
              onChange={(e) => setExpenseStatus(e.target.value as 'active' | 'inactive' | 'all')}
              aria-label={tr('وضعیت')}
            >
              <option value="active">{tr('فعال')}</option>
              <option value="inactive">{tr('غیرفعال')}</option>
              <option value="all">{tr('همه')}</option>
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
                            {r.kind === 'recurring' && ` · ${intervalLabel(r.intervalUnit as IntervalUnit, r.intervalCount, t)}`}
                            {!r.isActive && ` · ${t('غیرفعال')}`}
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
                                disabled={pending}
                                title={r.accountId === null ? tr('بدونِ حساب فقط سررسید جلو می‌رود') : undefined}
                                onClick={async () => {
                                  // پورتِ `pay()`: بدونِ حساب هیچ ردیفی نوشته نمی‌شود، فقط نوبت می‌گذرد.
                                  if (r.accountId === null && !(await confirm({
                                    title: t('پرداخت بدونِ ثبت در دفتر؟'),
                                    description: t('این هزینه حسابِ پرداخت ندارد؛ فقط سررسیدش جلو می‌رود و ردیفی در دفتر نوشته نمی‌شود.'),
                                  }))) return;
                                  act(() => payRecurringAction(r.id, r.nextDueDate));
                                }}
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
                                onClick={async () => {
                                  if (await confirm({ title: t('این هزینه حذف شود؟') })) act(() => deleteRecurringAction(r.id));
                                }}
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
      )}

      {/* ---- مودالِ ردِ درخواست با دلیل (پورتِ فرمِ inline ِ «رد کردن») ---- */}
      <Dialog open={rejectTarget !== null} onOpenChange={(o) => !o && setRejectTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("ردِ درخواست")}</DialogTitle>
            <DialogDescription>
              {tr("دلیل برای عضو فرستاده می‌شود؛ خالی هم می‌تواند بماند.")}
            </DialogDescription>
          </DialogHeader>
          {rejectTarget && (
            <div className="grid gap-3">
              <p className="text-sm">
                {rejectTarget.userName} — <span className="num">{format(rejectTarget.amount)}</span>
              </p>
              <textarea
                className="min-h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                placeholder={tr("دلیل رد (اختیاری)")}
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setRejectTarget(null)}>{t("انصراف")}</Button>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={pending}
                  onClick={() => {
                    const target = rejectTarget;
                    setRejectTarget(null);
                    act(() => decideRequestAction(target.id, 'rejected', rejectNote));
                  }}
                >
                  {tr("رد کردن")}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

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

              {/* پورتِ `record_payment_url`: مبلغِ درخواست معادلِ تعهد است؛ مبلغِ واقعی از حساب اختیاری. */}
              <div className="grid gap-1.5">
                <Label htmlFor="pay-amount">{t("مبلغِ واقعی از حساب (اختیاری)")}</Label>
                <Input id="pay-amount" name="amount" inputMode="decimal" className="num" placeholder={payTarget.amount} />
                <p className="text-xs text-muted-foreground">
                  {tr("در ارزِ حساب؛ خالی یعنی همان مبلغِ درخواست. مبلغِ درخواست به‌عنوانِ معادلِ تعهدِ عضو ثبت می‌شود.")}
                </p>
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

      {/* ---- مودالِ پرداختِ مستقیمِ کارکرد (پورتِ from_unit) ---- */}
      <Dialog open={unitTarget !== null} onOpenChange={(o) => !o && setUnitTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("ثبت در حسابداری")}</DialogTitle>
            <DialogDescription>
              {tr("یک ردیفِ برداشت به عضو نوشته می‌شود و کارکرد «پرداخت‌شده» می‌گردد.")}
            </DialogDescription>
          </DialogHeader>
          {unitTarget && (
            <form action={unitAction} className="grid gap-3">
              <input type="hidden" name="unitEntryId" value={unitTarget.id} />
              <p className="text-sm">
                {unitTarget.userName} — {unitTarget.projectTitle} — <span className="num">{format(unitTarget.amount)} {unitTarget.currencyCode ?? ''}</span>
              </p>
              <div className="grid gap-1.5">
                <Label htmlFor="unit-account">{t("حساب")}</Label>
                <select id="unit-account" name="accountId" className={field} defaultValue={accounts[0]?.id ?? ''}>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.name} ({a.currencyCode})</option>
                  ))}
                </select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="unit-date">{t("تاریخ")}</Label>
                <Input id="unit-date" type="date" name="entryDate" className="num" defaultValue={today} required />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="unit-amount">{t("مبلغِ واقعی از حساب (اختیاری)")}</Label>
                <Input id="unit-amount" name="amount" inputMode="decimal" className="num" placeholder={unitTarget.amount} />
              </div>
              {unitState.error && (
                <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {tr(unitState.error)}
                </p>
              )}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setUnitTarget(null)}>{t("انصراف")}</Button>
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
            <DialogTitle>{editing ? tr('ویرایش هزینه') : tr('افزودن هزینه')}</DialogTitle>
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
                <select id="e-cur" name="currencyId" className={field} defaultValue={editing?.currencyId ?? currencies.find((c) => c.isDefault)?.id ?? ''}>
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
                <select id="e-vendor" name="vendorId" className={field} defaultValue={editing?.vendorId ? String(editing.vendorId) : ''}>
                  <option value="">{t("بدون طرف‌حساب")}</option>
                  {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
                {/* پورتِ `find_or_create`: طرف‌حسابِ تازه همین‌جا ساخته می‌شود. */}
                <Input name="vendorName" placeholder={tr('یا طرف‌حسابِ تازه…')} className="h-8 text-xs" />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="grid gap-1.5">
                <Label htmlFor="e-cat">{t("دسته")}</Label>
                <select id="e-cat" name="categoryTagId" className={field} defaultValue={editing?.categoryTagId ? String(editing.categoryTagId) : ''}>
                  <option value="">{t("— بدونِ دسته —")}</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name ?? ''}</option>)}
                </select>
              </div>
              <div className="grid gap-1.5 sm:col-span-2">
                <Label htmlFor="e-note">{t("یادداشت")}</Label>
                <Input id="e-note" name="note" defaultValue={editing?.note ?? ''} />
              </div>
            </div>
            {/* ⚠️ پیش از این ویرایش، طرف‌حساب و ارز را بی‌صدا پاک می‌کرد و دسته/یادداشت/فعال ذخیره نمی‌شدند. */}
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="isActive" defaultChecked={editing?.isActive ?? true} className="size-4 accent-primary" />
              {tr("فعال")}
            </label>
            {!editing && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="payNow" className="size-4 accent-primary" />
                {tr("نوبتِ اول همین حالا پرداخت شود")}
                <span className="text-xs text-muted-foreground">{tr("(با حساب، ردیفِ دفتر نوشته می‌شود)")}</span>
              </label>
            )}

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
        ⚠️ کنارِ درخواست‌های پرداخت می‌ماند، نه کنارِ هزینه‌های شرکت — نسخهٔ
        قبلی هم هر دو را روی صفحهٔ «مالی اعضا» دارد، چون شمارهٔ حساب درست
        وقتی لازم می‌شود که کسی دارد به یک **عضو** پرداخت می‌کند. هزینهٔ
        دوره‌ای ربطی به آن ندارد.
      */}
      {section === 'members' && (
        <div className="rounded-md border p-3">
          <BankDirectory rows={directory.rows} showPhone={directory.showPhone} />
        </div>
      )}
    </div>
  );
}
