'use client';

import { useActionState, useState, useTransition } from 'react';
import { useFormStatus } from 'react-dom';
import { Check, ExternalLink, FileText, Link2, Paperclip, Square, X } from 'lucide-react';
import {
  applyQaAction, approveBidAction, toggleQaAction, withdrawBidAction, type QaActionState,
} from '../_form/qa-actions';
import { deleteQaItemAction } from '../_form/tab-actions';
import { format } from '@/domain/money/money';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableNumericCell, TableRow,
} from '@/components/ui/table';
import { useActionToast } from '@/components/ui/toast';
import { useT } from '@/i18n/client';
import { removeQaRoleAction } from '../_form/tab-actions';
import { useConfirm } from '@/components/ui/confirm';

/* ------------------------------------------------------------------ *
 * تبِ مالی — `finance` panel ِ مودالِ نسخهٔ قبلی.
 * ------------------------------------------------------------------ */

export interface FinanceSummary {
  incoming: string;
  memberPayout: string;
  projectExpense: string;
}

export interface PaymentRow {
  id: number;
  direction: string;
  type: string;
  amount: string;
  amountSettled: string | null;
  paidAt: Date | string | null;
  note: string;
  userName: string | null;
  receiptIds: number[] | null;
}

const DIRECTION_LABEL: Record<string, string> = {
  incoming: 'پرداخت کارفرما',
  member_payout: 'پرداخت به عضو',
  project_expense: 'هزینه',
};

function day(value: Date | string | null): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  return d.toISOString().slice(0, 10);
}

/** مبلغِ واقعاً تسویه‌شده بر مبلغِ اسمی مقدم است (R-TEAM-01). */
function settled(row: PaymentRow): string {
  return row.amountSettled ?? row.amount;
}

export function FinanceTab({
  price,
  finance,
  payments,
  canSee,
  projectId,
}: {
  price: string;
  finance: FinanceSummary | null;
  payments: PaymentRow[];
  canSee: boolean;
  projectId: number;
}) {
  const tr = useT();
  const t = useT();
  if (!canSee || !finance) {
    return <EmptyState title={t("دسترسیِ مالی ندارید")} description={t("برای دیدنِ این بخش از مدیر دسترسی بگیرید.")} />;
  }

  // بدهیِ کارفرما = قیمتِ پروژه − دریافتی. هزینه‌ها اینجا شمرده نمی‌شوند تا با
  // «قیمتِ ثبت‌شدهٔ پروژه» ِ نسخهٔ قبلی یکی بماند.
  const due = (Number(price) - Number(finance.incoming)).toFixed(2);

  return (
    <div className="grid gap-4">
      <div className="flex justify-end">
        {/* فاکتور صفحهٔ جدا دارد تا Ctrl+P سندِ تمیز بدهد. */}
        <a
          href={`/projects/${projectId}/invoice`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs hover:bg-muted"
        >
          <FileText className="size-3.5" />
          {tr("فاکتور")}
        </a>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-normal text-muted-foreground">{t("قیمت ثبت‌شدهٔ پروژه")}</CardTitle>
          </CardHeader>
          <CardContent><p className="num text-lg font-semibold">{format(price)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-normal text-muted-foreground">{t("مقدار پرداختی")}</CardTitle>
          </CardHeader>
          <CardContent><p className="num text-lg font-semibold">{format(finance.incoming)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-normal text-muted-foreground">{t("مقدار بدهی")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`num text-lg font-semibold ${Number(due) > 0 ? 'text-amber-600 dark:text-amber-500' : ''}`}>
              {format(due)}
            </p>
          </CardContent>
        </Card>
      </div>

      {payments.length === 0 ? (
        <EmptyState
          title={t("تراکنشی ثبت نشده")}
          description={t("هزینه‌ها و پرداخت‌ها از صفحهٔ «حسابداری» ثبت می‌شوند.")}
        />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("شرح")}</TableHead>
                <TableHead>{t("نوع")}</TableHead>
                <TableHead>{t("تاریخ")}</TableHead>
                <TableHead>{t("مبلغ")}</TableHead>
                <TableHead>{t("رسید")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>{p.note || p.userName || '—'}</TableCell>
                  <TableCell>{t(DIRECTION_LABEL[p.direction] ?? p.direction)}</TableCell>
                  <TableNumericCell>{day(p.paidAt)}</TableNumericCell>
                  <TableNumericCell>{format(settled(p))}</TableNumericCell>
                  <TableCell>
                    {(p.receiptIds?.length ?? 0) > 0 ? (
                      <a
                        href={`/api/files/${p.receiptIds![0]}`}
                        target="_blank"
                        rel="noopener"
                        className="text-primary hover:underline"
                      >
                        {t('مشاهده')}
                      </a>
                    ) : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        {tr("هزینه‌ها و پرداخت‌ها از صفحهٔ «حسابداری» ثبت می‌شوند.")}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * تبِ QA — اعمالِ چک‌لیست + تیک‌زدن.
 * ------------------------------------------------------------------ */

export interface QaRow {
  id: number;
  title: string;
  /** null یعنی آیتمِ کتابخانه‌اش حذف شده — چک‌لیستِ ساده در نظر گرفته می‌شود. */
  isTask: boolean | null;
  /** ⚠️ null یعنی «کارفرما»، نه «بدونِ نقش» (R-QA-02). */
  roleTagId: number | null;
  roleName: string | null;
  isDone: boolean;
  doneByName: string | null;
}

export interface QaFormData {
  roles: Array<{ id: number; name: string }>;
}

function ApplyQaForm({ projectId, roles }: { projectId: number; roles: Array<{ id: number; name: string }> }) {
  const tr = useT();
  const t = useT();
  const [state, formAction] = useActionState<QaActionState, FormData>(applyQaAction, {});
  /**
   * ⚠️ عدد در پیام می‌ماند: «۷ آیتم اعمال شد.» چیزی می‌گوید که «اعمال شد»
   * نمی‌گوید — کاربر می‌خواهد بداند چند آیتم واقعاً نشست، چون تکراری‌ها
   * دوباره اعمال نمی‌شوند.
   */
  useActionToast(state, { success: tr('{n} آیتم اعمال شد.', { n: state.added ?? 0 }) });
  const { pending } = useFormStatus();

  return (
    <form action={formAction} className="grid gap-2 rounded-md border p-3">
      <input type="hidden" name="projectId" value={projectId} />
      <h3 className="text-sm font-semibold">{t("افزودن چک‌لیست QA")}</h3>
      <p className="text-xs text-muted-foreground">
        {tr("آیتم‌های کتابخانهٔ QA برای نقش‌های انتخاب‌شده روی این پروژه می‌نشینند. آیتمِ تکراری دوباره اعمال نمی‌شود.")}
      </p>

      <div className="flex flex-wrap gap-3">
        {roles.map((r) => (
          <label key={r.id} className="flex items-center gap-1.5 text-sm">
            <input type="checkbox" name="audience" value={r.id} className="size-4 accent-primary" />
            {r.name}
          </label>
        ))}
        {/* R-QA-02 — مخاطبِ «کارفرما» یک نقشِ واقعی نیست؛ توکنِ خودش را دارد. */}
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" name="audience" value="client" className="size-4 accent-primary" />
          {tr("کارفرما")}
        </label>
      </div>


      <div>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? t('در حالِ اعمال…') : t('اعمالِ چک‌لیست')}
        </Button>
      </div>
    </form>
  );
}

/** حذفِ یک آیتمِ چک‌لیست — فقط مدیر. */
function QaDelete({ itemId }: { itemId: number }) {
  const t = useT();
  const confirm = useConfirm();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      aria-label={t("حذفِ آیتم")}
      disabled={pending}
      onClick={async () => {
        if (await confirm({ title: t('این آیتم حذف شود؟') })) {
          startTransition(async () => { await deleteQaItemAction(itemId); });
        }
      }}
      className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-60"
    >
      <X className="size-3.5" />
    </button>
  );
}

/**
 * برداشتنِ همهٔ آیتم‌های QA ِ یک نقش.
 *
 * ⚠️ سرویس و اکشنش از قبل نوشته شده بودند ولی **هیچ دکمه‌ای صدایشان
 * نمی‌زد**: چک‌لیستی که با یک نقشِ اشتباه اعمال شده بود، فقط آیتم‌به‌آیتم
 * پاک می‌شد.
 *
 * ⚠️ `null` یعنی «کارفرما»، نه «همه» (R-QA-02) — پس شناسهٔ نقش عیناً پاس
 * داده می‌شود و صفر با null قاطی نمی‌شود.
 */
function QaRoleRemove({
  projectId, roleTagId, roleName,
}: {
  projectId: number;
  roleTagId: number | null;
  roleName: string;
}) {
  const tr = useT();
  const confirm = useConfirm();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-destructive"
      disabled={pending}
      onClick={async () => {
        if (!(await confirm({ title: tr('همهٔ آیتم‌های این نقش برداشته شود؟') }))) return;
        startTransition(async () => {
          await removeQaRoleAction(projectId, roleTagId);
        });
      }}
    >
      <X className="size-3" />
      {tr('برداشتنِ آیتم‌های «{role}»', { role: roleName })}
    </Button>
  );
}

function QaTick({ row, canManage }: { row: QaRow; canManage: boolean }) {
  const t = useT();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!canManage) {
    return row.isDone ? <Check className="size-4 text-emerald-600" /> : null;
  }

  return (
    <span className="flex items-center gap-1">
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="size-7"
        title={row.isDone ? t('برداشتنِ تیک') : t('انجام شد')}
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await toggleQaAction(row.id);
            if (result.error) setError(result.error);
          })
        }
      >
        {row.isDone ? <Check className="size-3.5 text-emerald-600" /> : <Square className="size-3.5" />}
      </Button>
      {error && <span className="text-[11px] text-destructive">{t(error)}</span>}
    </span>
  );
}

export function QaTab({
  projectId,
  qa,
  form,
  canManage,
}: {
  projectId: number;
  qa: QaRow[];
  /** حاضر بودنش یعنی کاربر می‌تواند چک‌لیست اعمال کند. */
  form: QaFormData | null;
  canManage: boolean;
}) {
  const t = useT();
  // R-PROJ-18 — آیتمِ «تسک‌ساز» از آیتمِ چک‌لیستِ ساده جداست.
  const asTasks = qa.filter((q) => q.isTask === true);
  const checklist = qa.filter((q) => q.isTask !== true);

  /**
   * نقش‌هایی که روی این پروژه آیتم دارند — برای دکمهٔ حذفِ گروهی.
   * ⚠️ کلید رشته است چون `null` (کارفرما) هم یک گروهِ معتبر است و در
   * `Map<number>` جا نمی‌شد.
   */
  const roleGroups = [...new Map(
    qa.map((q) => [
      String(q.roleTagId ?? 'client'),
      { key: String(q.roleTagId ?? 'client'), roleTagId: q.roleTagId ?? null, name: q.roleName ?? t('کارفرما') },
    ]),
  ).values()];

  const section = (title: string, rows: QaRow[]) =>
    rows.length > 0 && (
      <section className="grid gap-2">
        <h3 className="text-sm font-semibold">{t(title)}</h3>
        <ul className="grid gap-1">
          {rows.map((q) => (
            <li key={q.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
              <span className={q.isDone ? 'text-muted-foreground line-through' : ''}>{q.title}</span>
              <span className="flex items-center gap-2">
                {q.roleName && <Badge variant="secondary">{q.roleName}</Badge>}
                {q.isDone && q.doneByName && (
                  <span className="text-xs text-muted-foreground">{t('توسط {name}', { name: q.doneByName })}</span>
                )}
                <QaTick row={q} canManage={canManage} />
                {canManage && <QaDelete itemId={q.id} />}
              </span>
            </li>
          ))}
        </ul>
      </section>
    );

  return (
    <div className="grid gap-4">
      {form && <ApplyQaForm projectId={projectId} roles={form.roles} />}
      {qa.length === 0 ? (
        <EmptyState title={t("هنوز آیتم چک‌لیستی روی این پروژه نیست.")} />
      ) : (
        <>
          {canManage && roleGroups.length > 0 && (
            <div className="flex flex-wrap items-center gap-1 rounded-md border p-2">
              <span className="me-1 text-xs text-muted-foreground">{t('برداشتنِ گروهی:')}</span>
              {roleGroups.map((g) => (
                <QaRoleRemove
                  key={g.key}
                  projectId={projectId}
                  roleTagId={g.roleTagId}
                  roleName={g.name}
                />
              ))}
            </div>
          )}
          {section('تسک‌ها', asTasks)}
          {section('چک‌لیست', checklist)}
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * تبِ پیشنهادهای مناقصه — تأیید و پس‌گرفتن.
 * ------------------------------------------------------------------ */

export interface BidRow {
  id: number;
  amount: string;
  status: string;
  note: string | null;
  userName: string | null;
  roleName: string | null;
}

const BID_STATUS: Record<string, { label: string; variant: 'secondary' | 'success' | 'outline' }> = {
  pending: { label: 'در انتظار', variant: 'secondary' },
  approved: { label: 'تأییدشده', variant: 'success' },
  archived: { label: 'بایگانی', variant: 'outline' },
  withdrawn: { label: 'پس‌گرفته‌شده', variant: 'outline' },
};

function BidActions({
  bid,
  projectId,
  isOpen,
}: {
  bid: BidRow;
  projectId: number;
  isOpen: boolean;
}) {
  const tr = useT();
  const confirm = useConfirm();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = (fn: () => Promise<QaActionState>) =>
    startTransition(async () => {
      setError(null);
      const result = await fn();
      if (result.error) setError(result.error);
    });

  const gone = bid.status === 'withdrawn' || bid.status === 'archived';

  return (
    <div className="flex flex-wrap items-center justify-end gap-1">
      {/* R-TENDER-01 — پس از شروعِ کار برنده عوض نمی‌شود، پس دکمه هم نمی‌آید. */}
      {isOpen && !gone && bid.status !== 'approved' && (
        <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => run(() => approveBidAction(bid.id, projectId))}>
          <Check className="size-3.5" />
          {tr("تأیید")}
        </Button>
      )}
      {/* «حذفِ برنده» فقط برای پیشنهادِ تأییدشده — پیشنهادِ در انتظارِ دیگران دستِ خودشان است. */}
      {isOpen && bid.status === 'approved' && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="text-destructive hover:text-destructive"
          disabled={pending}
          onClick={async () => {
            if (await confirm({ title: tr('برنده پس گرفته شود؟'), description: tr('نقش دوباره برای پیشنهاد باز می‌شود.') })) {
              run(() => withdrawBidAction(bid.id, projectId));
            }
          }}
        >
          <X className="size-3.5" />
          {tr("حذفِ برنده")}
        </Button>
      )}
      {error && <span className="text-[11px] text-destructive">{tr(error)}</span>}
    </div>
  );
}

export function BidsTab({
  projectId,
  bids,
  isOpen,
  canManage,
}: {
  projectId: number;
  bids: BidRow[];
  /** مناقصه هنوز باز است؟ (R-TENDER-01) */
  isOpen: boolean;
  canManage: boolean;
}) {
  const tr = useT();
  const t = useT();
  if (bids.length === 0) return <EmptyState title={t("هنوز پیشنهادی ثبت نشده")} />;

  return (
    <div className="grid gap-3">
      {!isOpen && (
        <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
          {tr("مناقصه بسته است — برنده پس از شروعِ کار عوض نمی‌شود.")}
        </p>
      )}
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("پیشنهاددهنده")}</TableHead>
              <TableHead>{t("نقش")}</TableHead>
              <TableHead>{t("مبلغ")}</TableHead>
              <TableHead>{t("وضعیت")}</TableHead>
              {canManage && <TableHead />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {bids.map((b) => {
              const s = BID_STATUS[b.status] ?? { label: b.status, variant: 'secondary' as const };
              return (
                <TableRow key={b.id}>
                  <TableCell>{b.userName ?? '—'}</TableCell>
                  <TableCell>{b.roleName ?? '—'}</TableCell>
                  <TableNumericCell>{format(b.amount)}</TableNumericCell>
                  <TableCell><Badge variant={s.variant}>{t(s.label)}</Badge></TableCell>
                  {canManage && (
                    <TableCell>
                      <BidActions bid={b} projectId={projectId} isOpen={isOpen} />
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
