'use client';

import { useActionState, useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
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
import { summarizeProject } from '@/domain/team-money/payments';
import { PAY_STATUS_LABELS } from './my-money-tab';
import { chipStyle } from '@/domain/ui/contrast';
import { Checkbox } from '@/components/ui/checkbox';

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
  /** «معادل (محاسبه)» — ارزشِ ردیف در ارزِ پروژه (پورتِ `row_value_in`). */
  countedValue?: string | null;
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
  currencyCode = null,
}: {
  price: string;
  finance: FinanceSummary | null;
  payments: PaymentRow[];
  canSee: boolean;
  projectId: number;
  currencyCode?: string | null;
}) {
  const tr = useT();
  const t = useT();
  if (!canSee || !finance) {
    return <EmptyState title={t("دسترسیِ مالی ندارید")} description={t("برای دیدنِ این بخش از مدیر دسترسی بگیرید.")} />;
  }

  // پورتِ `Payments::summary` (R-TEAM-04): بدهیِ کل = قیمت + هزینه‌های قابلِ صورتحساب؛ مانده کف‌بندی؛ وضعیتِ سه‌حالته.
  const summary = summarizeProject(price, finance.projectExpense, finance.incoming);
  const money = (v: string | number) => `${format(String(v))}${currencyCode ? ` ${currencyCode}` : ''}`;
  const cards = [
    { label: 'قیمت', value: money(summary.price) },
    { label: 'هزینه‌های قابلِ صورت‌حساب', value: money(summary.billableExpenses) },
    { label: 'جمعِ بدهی', value: money(summary.totalDue), strong: true },
    { label: 'پرداختی', value: money(summary.paid) },
    { label: 'مانده', value: money(summary.remaining), warn: summary.remaining > 0 },
    { label: 'وضعیت', value: t(PAY_STATUS_LABELS[summary.status] ?? summary.status), plain: true },
  ];

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
        {cards.map((c) => (
          <Card key={c.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-normal text-muted-foreground">{t(c.label)}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className={`${c.plain ? '' : 'num'} text-lg font-semibold ${c.warn ? 'text-amber-600 dark:text-amber-500' : ''}`}>
                {c.value}
              </p>
            </CardContent>
          </Card>
        ))}
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
                <TableHead>{t("معادل (محاسبه)")}</TableHead>
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
                  {/* پورتِ ستونِ «معادل (محاسبه)»: ارزشِ ردیف در ارزِ پروژه، نه مبلغِ خام. */}
                  <TableNumericCell className="text-muted-foreground">{p.countedValue ? money(p.countedValue) : '—'}</TableNumericCell>
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
  /** «چه‌طور بررسی شود» — از آیتمِ کتابخانه کپی شده؛ ممکن است خالی باشد. */
  description?: string | null;
  /** null یعنی آیتمِ کتابخانه‌اش حذف شده — چک‌لیستِ ساده در نظر گرفته می‌شود. */
  isTask: boolean | null;
  /** ⚠️ null یعنی «کارفرما»، نه «بدونِ نقش» (R-QA-02). */
  roleTagId: number | null;
  roleName: string | null;
  isDone: boolean;
  doneByName: string | null;
  /** تسکِ ساخته‌شده از این آیتم (پورتِ `QA::project_tasks`) — با عنوان پیدا می‌شود. */
  taskId?: number | null;
  taskStatusName?: string | null;
  taskStatusColor?: string | null;
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
   * دوباره اعمال نمی‌شوند. و تسک‌ها جدا شمرده می‌شوند: آیتمِ تسک‌ساز کارِ واقعی روی تختهٔ پروژه
   * می‌سازد و پیامِ «۳ آیتم اعمال شد» این را نمی‌گفت — تسک‌ها بی‌صدا ظاهر
   * می‌شدند و کاربر تا بازکردنِ تبِ تسک‌ها خبر نداشت.
   */
  useActionToast(state, {
    success: (state.tasks ?? 0) > 0
      ? tr('{n} آیتم اعمال شد — {t} تسک روی پروژه ساخته شد.', { n: state.added ?? 0, t: state.tasks ?? 0 })
      : tr('{n} آیتم اعمال شد.', { n: state.added ?? 0 }),
  });
  const { pending } = useFormStatus();
  /**
   * مخاطب‌های تیک‌خورده — **کنترل‌شده**.
   * ⚠️ چک‌باکسِ shadcn یک `<button>` است، نه `<input>`؛ تیک‌زدنِ دستیِ DOM
   * (`input.checked = …`) که «انتخابِ همه» با آن کار می‌کرد دیگر اثری ندارد.
   */
  const allAudiences = [...roles.map((r) => String(r.id)), 'client'];
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const toggleAudience = (value: string, on: boolean) => setPicked((prev) => {
    const next = new Set(prev);
    if (on) next.add(value); else next.delete(value);
    return next;
  });
  const setAll = (checked: boolean) => setPicked(checked ? new Set(allAudiences) : new Set());
  // پس از اعمالِ موفق فرم خالی می‌شود — همان کاری که فرمِ کنترل‌نشده خودش می‌کرد.
  useEffect(() => { if (state.ok) setPicked(new Set()); }, [state]);

  return (
    <form action={formAction} className="grid max-w-3xl gap-2 rounded-md border p-3">
      <input type="hidden" name="projectId" value={projectId} />
      <h3 className="text-sm font-semibold">{t("افزودن چک‌لیست QA")}</h3>
      <p className="text-xs text-muted-foreground">
        {tr("آیتم‌های کتابخانهٔ QA برای نقش‌های انتخاب‌شده روی این پروژه می‌نشینند. آیتمِ تکراری دوباره اعمال نمی‌شود.")}
      </p>

      <div className="flex flex-wrap gap-3">
        {roles.map((r) => (
          <label key={r.id} className="flex items-center gap-1.5 text-sm">
            <Checkbox
              name="audience"
              value={String(r.id)}
              checked={picked.has(String(r.id))}
              onCheckedChange={(v) => toggleAudience(String(r.id), v === true)}
            />
            {r.name}
          </label>
        ))}
        {/* R-QA-02 — مخاطبِ «کارفرما» یک نقشِ واقعی نیست؛ توکنِ خودش را دارد. */}
        <label className="flex items-center gap-1.5 text-sm">
          <Checkbox
            name="audience"
            value="client"
            checked={picked.has('client')}
            onCheckedChange={(v) => toggleAudience('client', v === true)}
          />
          {tr("کارفرما")}
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? t('در حالِ اعمال…') : t('اعمالِ چک‌لیست')}
        </Button>
        {/* چک‌لیستِ QA اغلب برای **همهٔ** نقش‌ها لازم است؛ تیک‌زدنِ ده‌تایی کارِ تکراری بود. */}
        <Button type="button" size="sm" variant="outline" onClick={() => setAll(true)}>
          {t('انتخابِ همه')}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setAll(false)}>
          {t('پاک‌کردنِ همه')}
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
    <Button
      type="button"
      aria-label={t("حذفِ آیتم")}
      disabled={pending}
      onClick={async () => {
        if (await confirm({ title: t('این آیتم حذف شود؟') })) {
          startTransition(async () => { await deleteQaItemAction(itemId); });
        }
      }}
      variant="ghost"
      size="icon-xs"
      className="text-muted-foreground"
    >
      <X className="size-3.5" />
    </Button>
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
  taskCount = 0,
  canInteract = false,
}: {
  projectId: number;
  qa: QaRow[];
  /** حاضر بودنش یعنی کاربر می‌تواند چک‌لیست اعمال کند. */
  form: QaFormData | null;
  canManage: boolean;
  /** چند تسکِ پروژه از همین چک‌لیست ساخته شده. */
  taskCount?: number;
  /** عضو/کارفرما آیتم‌های **خودشان** را تیک می‌زنند — فهرست از سرور به‌ازای بیننده فیلتر شده. */
  canInteract?: boolean;
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
            <li key={q.id} className="flex items-start justify-between gap-3 rounded-md border px-3 py-2 text-sm">
              {/*
                ⚠️ توضیح زیرِ عنوان می‌آید. آیتمِ کتابخانه دو بخش دارد — «چه
                چیزی» و «چه‌طور بررسی شود» — و تا امروز فقط اولی دیده می‌شد؛
                دستورالعملِ واقعی در پایگاه‌داده می‌ماند و کسی نمی‌دیدش.
              */}
              <span className="grid gap-0.5">
                <span className={q.isDone ? 'text-muted-foreground line-through' : ''}>{q.title}</span>
                {q.description && (
                  <span className="text-xs whitespace-pre-wrap text-muted-foreground">{q.description}</span>
                )}
              </span>
              <span className="flex shrink-0 items-center gap-2">
                {q.roleName && <Badge variant="secondary">{q.roleName}</Badge>}
                {q.taskId && (
                  <Badge
                    variant="outline"
                    className="text-[10px]"
                    style={chipStyle(q.taskStatusColor)}
                  >
                    {t('تسک')}{q.taskStatusName ? `: ${q.taskStatusName}` : ''}
                  </Badge>
                )}
                {q.isDone && q.doneByName && (
                  <span className="text-xs text-muted-foreground">{t('توسط {name}', { name: q.doneByName })}</span>
                )}
                <QaTick row={q} canManage={canManage || canInteract} />
                {canManage && <QaDelete itemId={q.id} />}
              </span>
            </li>
          ))}
        </ul>
      </section>
    );

  return (
    // ⚠️ پهنای خواندنی: ردیفِ چک‌لیست یک عنوان و چند چیپ است و کش‌آمدنش تا
    // لبهٔ نمایشگر، تیک و عنوان را ده‌ها سانتی‌متر از هم دور می‌کرد.
    <div className="grid max-w-4xl gap-4">
      {form && <ApplyQaForm projectId={projectId} roles={form.roles} />}
      {/*
        ⚠️ آیتمِ «تسک‌ساز» در جدولِ چک‌لیست **نمی‌نشیند** — مستقیم تسک می‌شود.
        پس تبِ QA هیچ ردی از آن نداشت و مدیر بعدِ اعمال نمی‌فهمید کارِ واقعی
        روی تخته ساخته شده. این خط تنها جای ماندگارِ آن خبر است.
      */}
      {taskCount > 0 && (
        <p className="text-xs text-muted-foreground">
          {t('{n} تسکِ این پروژه از همین چک‌لیست ساخته شده است.', { n: taskCount })}{' '}
          <Link href={`/projects/${projectId}?tab=tasks`} className="underline hover:text-foreground">
            {t('دیدنِ تسک‌ها')}
          </Link>
        </p>
      )}
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
  // پورتِ `Bids::status_label`.
  pending: { label: 'در انتظار', variant: 'secondary' },
  approved: { label: 'برنده', variant: 'success' },
  archived: { label: 'انتخاب‌نشده', variant: 'outline' },
  withdrawn: { label: 'انصراف', variant: 'outline' },
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
