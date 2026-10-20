'use client';

import { UserName } from '@/components/user-avatar';
import { useActionState, useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { useFormStatus } from 'react-dom';
import { ArrowDownLeft, ArrowUpRight, Check, ExternalLink, FileText, Link2, Paperclip, Square, X } from 'lucide-react';
import {
  applyQaAction, approveBidAction, toggleQaAction, withdrawBidAction, type QaActionState,
} from '../_form/qa-actions';
import { deleteQaItemAction } from '../_form/tab-actions';
import { format, formatIn } from '@/domain/money/money';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { IconButton } from '@/components/ui/icon-button';
import { EmptyState } from '@/components/ui/empty-state';
import { Table, TableActionsCell, TableActionsHead, TableBody, TableCell, TableHead, TableHeader, TableNumericCell, TableRow } from '@/components/ui/table';
import { useActionToast, useToast } from '@/components/ui/toast';
import { useT } from '@/i18n/client';
import { removeQaRoleAction } from '../_form/tab-actions';
import { useConfirm } from '@/components/ui/confirm';
import { summarizeProject } from '@/domain/team-money/payments';
import { userNoteOf } from '@/domain/ledger/mirror';
import { PAY_STATUS_LABELS } from './my-money-tab';
import { Checkbox } from '@/components/ui/checkbox';
import { StatCard } from '@/components/stat-card';
import { Panel, Section } from '@/components/page-shell';
import { TagChip } from '@/components/ui/tag-chip';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Item, ItemActions, ItemContent, ItemGroup } from '@/components/ui/item';
import { useRouter } from 'next/navigation';
import { TaskDialog } from './task-dialog';
import { Amount } from '@/components/amount-privacy';

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
  userId?: number | null;
  userName: string | null;
  receiptIds: number[] | null;
  /** «معادل (محاسبه)» — ارزشِ ردیف در ارزِ پروژه (پورتِ `row_value_in`). */
  countedValue?: string | null;
  /** «از حساب» (۲.۳۰.۰) — مبلغِ واقعی با ارز و نامِ حساب. */
  currencyCode?: string | null;
  accountName?: string | null;
  transferFeePct?: string | null;
}

/** بخشِ «تیم» ِ تبِ مالی (۲.۳۰.۰) — فقط برای مدیرِ سراسریِ پروژه‌ها یا مالی. */
export interface TeamMoney {
  currencyCode: string | null;
  agreed: number;
  paid: number;
  remaining: number;
  members: Array<{
    userId: number;
    name: string;
    currencyCode: string | null;
    agreed: number;
    paid: number;
    remaining: number;
  }>;
}

const DIRECTION_LABEL: Record<string, string> = {
  incoming: 'پرداخت کارفرما',
  member_payout: 'پرداخت به عضو',
  project_expense: 'هزینه',
};

/**
 * سلولِ مبلغ با یک خطِ توضیح زیرش (۲.۳۰.۰) — هم‌ترازِ ستون‌های عددی.
 * ⚠️ نه `TableNumericCell`: آن همه‌چیز را در `span.num` ِ چپ‌به‌راست می‌پیچد و
 * خطِ دوم (نامِ حساب، کارمزد) در RTL به سمتِ چپ می‌افتاد. اینجا فقط خودِ عدد
 * `num` است و خطِ دوم جهتِ صفحه را دارد.
 */
function StackedAmountCell({ value, sub }: { value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <TableCell className="whitespace-nowrap ltr:text-end rtl:text-start">
      <span className="num">{value}</span>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </TableCell>
  );
}

function day(value: Date | string | null): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  return d.toISOString().slice(0, 10);
}

export function FinanceTab({
  price,
  finance,
  team = null,
  payments,
  canSee,
  projectId,
  currencyCode = null,
}: {
  price: string;
  finance: FinanceSummary | null;
  team?: TeamMoney | null;
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
  // ⚠️ هر مبلغِ این تب‌ها از همین می‌گذرد — پس کلیدِ «پنهان‌کردنِ مبلغ‌ها» همه را می‌گیرد (۲.۴۳.۰).
  const withCode = (v: string | number, code: string | null) => <Amount>{`${formatIn(String(v), code)}${code ? ` ${code}` : ''}`}</Amount>;
  const money = (v: string | number) => withCode(v, currencyCode);
  /**
   * ⚠️ قیمتِ صفر یعنی «هنوز ثبت نشده»، نه «پرداخت‌نشده» (۲.۳۰.۰): پیش از این
   * پروژه‌ای بی‌قیمت وضعیتِ «پرداخت‌نشده» و ماندهٔ صفر را هم‌زمان نشان می‌داد.
   */
  const noPrice = Number(summary.totalDue) <= 0;
  const clientCards = [
    { label: 'قیمت', value: noPrice ? t('ثبت نشده') : money(summary.price), plain: noPrice },
    { label: 'هزینه‌های قابلِ صورت‌حساب', value: money(summary.billableExpenses) },
    { label: 'جمعِ بدهی', value: noPrice ? '—' : money(summary.totalDue) },
    { label: 'پرداختی', value: money(summary.paid) },
    { label: 'مانده', value: noPrice ? '—' : money(summary.remaining), warn: !noPrice && summary.remaining > 0 },
    {
      label: 'وضعیت',
      value: noPrice ? t('قیمت ثبت نشده') : t(PAY_STATUS_LABELS[summary.status] ?? summary.status),
      plain: true,
    },
  ];

  return (
    <div className="grid gap-6">
      <div className="flex justify-end">
        {/* فاکتور صفحهٔ جدا دارد تا Ctrl+P سندِ تمیز بدهد. */}
        <Button asChild size="sm" variant="outline">
          <a href={`/projects/${projectId}/invoice`} target="_blank" rel="noopener noreferrer">
            <FileText />
            {tr("فاکتور")}
          </a>
        </Button>
      </div>

      <Section title={t('کارفرما')} description={t('قیمتِ پروژه و آنچه کارفرما پرداخته است.')}>
        <div className="grid gap-4 @xl/main:grid-cols-3">
          {clientCards.map((c) => (
            <StatCard
              key={c.label}
              label={t(c.label)}
              value={c.value}
              numeric={!c.plain}
              tone={c.warn ? 'warning' : 'default'}
            />
          ))}
        </div>
      </Section>

      {team && (
        <Section title={t('تیم')} description={t('مبلغِ توافق‌شده با اعضا و آنچه به آنها پرداخت شده است.')}>
          <div className="grid gap-4 @xl/main:grid-cols-3">
            <StatCard label={t('توافق با اعضا')} value={withCode(team.agreed, team.currencyCode)} />
            <StatCard label={t('پرداخت‌شده به اعضا')} value={withCode(team.paid, team.currencyCode)} />
            <StatCard
              label={t('مانده به اعضا')}
              value={withCode(team.remaining, team.currencyCode)}
              tone={team.remaining > 0.001 ? 'warning' : 'default'}
            />
          </div>
          {team.members.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('عضو')}</TableHead>
                  <TableHead numeric>{t('توافق')}</TableHead>
                  <TableHead numeric>{t('پرداخت‌شده')}</TableHead>
                  <TableHead numeric>{t('مانده')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {team.members.map((m) => (
                  <TableRow key={m.userId}>
                    <TableCell><UserName userId={m.userId} name={m.name} /></TableCell>
                    <TableNumericCell>{withCode(m.agreed, m.currencyCode)}</TableNumericCell>
                    <TableNumericCell>{withCode(m.paid, m.currencyCode)}</TableNumericCell>
                    {/* اضافه‌پرداخت پنهان نمی‌شود: مانده کف‌بندی است، ولی «تسویه» برای بیشتر از توافق گمراه‌کننده بود. */}
                    {m.remaining > 0.001
                      ? <TableNumericCell>{withCode(m.remaining, m.currencyCode)}</TableNumericCell>
                      : m.paid - m.agreed > 0.001
                        ? (
                          <TableCell className="whitespace-nowrap text-amber-700 ltr:text-end rtl:text-start dark:text-amber-500">
                            {t('اضافه‌پرداخت')}{' '}
                            <bdi dir="ltr" className="tabular-nums">{withCode(m.paid - m.agreed, m.currencyCode)}</bdi>
                          </TableCell>
                        )
                        : <TableCell className="text-muted-foreground">{m.agreed > 0 || m.paid > 0 ? t('تسویه') : '—'}</TableCell>}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Section>
      )}

      <Section title={t('تراکنش‌ها')}>
        {payments.length === 0 ? (
          <EmptyState
            title={t("تراکنشی ثبت نشده")}
            description={t("هزینه‌ها و پرداخت‌ها از صفحهٔ «حسابداری» ثبت می‌شوند.")}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("شرح")}</TableHead>
                <TableHead>{t("نوع")}</TableHead>
                <TableHead numeric>{t("تاریخ")}</TableHead>
                <TableHead numeric>{t("از حساب")}</TableHead>
                <TableHead numeric>{t("ارزش برای پروژه")}</TableHead>
                <TableHead>{t("رسید")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.map((p) => {
                const incoming = p.direction === 'incoming';
                const fee = Number(p.transferFeePct ?? 0);
                return (
                  <TableRow key={p.id}>
                    {/* برچسبِ «بابت پروژه: …» اینجا، داخلِ صفحهٔ همان پروژه، تکراری است. */}
                    <TableCell className="min-w-48">{userNoteOf(p.note) || '—'}</TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1 whitespace-nowrap">
                        {incoming
                          ? <ArrowDownLeft className="size-3.5 text-success" aria-hidden />
                          : <ArrowUpRight className="size-3.5 text-muted-foreground" aria-hidden />}
                        {t(DIRECTION_LABEL[p.direction] ?? p.direction)}
                      </span>
                      {p.userName && p.userId && (
                        <div className="text-xs text-muted-foreground"><UserName userId={p.userId} name={p.userName} /></div>
                      )}
                    </TableCell>
                    <TableNumericCell>{day(p.paidAt)}</TableNumericCell>
                    {/* مبلغی که واقعاً از حساب رفت یا به آن رسید — با ارز و نامِ حساب. */}
                    <StackedAmountCell value={withCode(p.amount, p.currencyCode ?? null)} sub={p.accountName} />
                    {/* پورتِ ستونِ «معادل (محاسبه)»: ارزشِ ردیف در ارزِ پروژه، نه مبلغِ خام. */}
                    <StackedAmountCell
                      value={p.countedValue ? money(p.countedValue) : '—'}
                      sub={fee > 0 ? t('کارمزدِ انتقال {pct}٪', { pct: format(String(fee)) }) : null}
                    />
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
                );
              })}
            </TableBody>
          </Table>
        )}
        {payments.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {tr("هزینه‌ها و پرداخت‌ها از صفحهٔ «حسابداری» ثبت می‌شوند.")}
          </p>
        )}
      </Section>
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
  doneBy?: number | null;
  doneByName: string | null;
  /** تسکِ ساخته‌شده از این آیتم (پورتِ `QA::project_tasks`) — با عنوان پیدا می‌شود. */
  taskId?: number | null;
  taskStatusName?: string | null;
  taskStatusColor?: string | null;
}

/** تسکی که از آیتمِ QA ساخته شده — ردیفِ تبِ «تسک‌ها» ی QA. */
export interface QaTaskRow {
  id: number;
  title: string;
  statusName: string | null;
  statusColor: string | null;
  roleNames: string[];
  assigneeId?: number | null;
  assigneeName: string | null;
}

/**
 * تسک‌های QA با زیرتبِ نقش — پورتِ `qa_tasks_subtabs`: هر تسکِ QA یک نقش
 * دارد؛ بی‌نقش‌ها (تسکِ کارفرما) کنارِ هم. عنوان مودالِ تسک را باز می‌کند.
 */
function QaTaskGroups({ tasks, onOpen }: { tasks: QaTaskRow[]; onOpen: (id: number) => void }) {
  const t = useT();
  const groups = [...tasks.reduce((map, task) => {
    const name = task.roleNames[0] ?? t('بدون نقش');
    map.set(name, [...(map.get(name) ?? []), task]);
    return map;
  }, new Map<string, QaTaskRow[]>())];
  const [active, setActive] = useState(groups[0]?.[0] ?? '');
  const current = groups.find(([name]) => name === active)?.[1] ?? groups[0]?.[1] ?? [];

  if (tasks.length === 0) return <p className="text-sm text-muted-foreground">{t('هنوز تسکی از QA اضافه نشده.')}</p>;
  return (
    <div className="grid gap-3">
      {groups.length > 1 && (
        <div className="overflow-x-auto pb-1.5">
          <Tabs value={active} onValueChange={setActive}>
            <TabsList className="w-max">
              {groups.map(([name, list]) => (
                <TabsTrigger key={name} value={name} className="flex-none gap-1.5 px-3">
                  {name}
                  <span className="num text-xs text-muted-foreground">{list.length}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      )}
      <ItemGroup className="gap-1.5">
        {current.map((task) => (
          <Item key={task.id} variant="outline" size="sm" className="px-3 py-2">
            <ItemContent>
              <button
                type="button"
                className="text-start text-sm font-medium hover:underline focus-visible:underline focus-visible:outline-none"
                onClick={() => onOpen(task.id)}
              >
                {task.title}
              </button>
              {task.assigneeName && <UserName userId={task.assigneeId} name={task.assigneeName} className="text-xs text-muted-foreground" />}
            </ItemContent>
            {task.statusName && (
              <ItemActions><TagChip color={task.statusColor}>{task.statusName}</TagChip></ItemActions>
            )}
          </Item>
        ))}
      </ItemGroup>
    </div>
  );
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
    <Panel
      title={t("افزودن چک‌لیست QA")}
      description={tr("آیتم‌های کتابخانهٔ QA برای نقش‌های انتخاب‌شده روی این پروژه می‌نشینند. آیتمِ تکراری دوباره اعمال نمی‌شود.")}
    >
      <form action={formAction} className="grid gap-3">
        <input type="hidden" name="projectId" value={projectId} />

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
            {pending ? <><Spinner />{t('در حالِ اعمال…')}</> : t('اعمالِ چک‌لیست')}
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
    </Panel>
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
    return row.isDone ? <Check className="size-4 text-emerald-600 dark:text-emerald-500" /> : null;
  }

  return (
    <span className="flex items-center gap-1">
      <IconButton
        type="button"
        variant="ghost"
        className="size-7"
        label={row.isDone ? t('برداشتنِ تیک') : t('انجام شد')}
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await toggleQaAction(row.id);
            if (result.error) setError(result.error);
          })
        }
      >
        {row.isDone ? <Check className="size-3.5 text-emerald-600 dark:text-emerald-500" /> : <Square className="size-3.5" />}
      </IconButton>
      {error && <span className="text-[11px] text-destructive">{t(error)}</span>}
    </span>
  );
}

export function QaTab({
  projectId,
  qa,
  form,
  canManage,
  tasks = [],
  canInteract = false,
}: {
  projectId: number;
  qa: QaRow[];
  /** حاضر بودنش یعنی کاربر می‌تواند چک‌لیست اعمال کند. */
  form: QaFormData | null;
  canManage: boolean;
  /** تسک‌هایی که همین چک‌لیست ساخته (دیدنی برای این بیننده). */
  tasks?: QaTaskRow[];
  /** عضو/کارفرما آیتم‌های **خودشان** را تیک می‌زنند — فهرست از سرور به‌ازای بیننده فیلتر شده. */
  canInteract?: boolean;
}) {
  const t = useT();
  const router = useRouter();
  /**
   * دو تب، مثلِ نسخهٔ قبلی: «تسک‌ها» (کارِ واقعی که QA روی تخته ساخته) و
   * «چک‌لیست» (ردیف‌های `project_qa`). پیش‌فرض تبی است که چیزی دارد.
   */
  const [view, setView] = useState<'tasks' | 'checklist'>(tasks.length > 0 ? 'tasks' : 'checklist');
  const [openTask, setOpenTask] = useState<number | null>(null);

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
      <Section title={t(title)}>
        <ul className="grid gap-1">
          {rows.map((q) => (
            <li key={q.id} className="flex items-start justify-between gap-3 rounded-lg border bg-card px-3 py-2 text-sm">
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
                  <TagChip color={q.taskStatusColor}>
                    {t('تسک')}{q.taskStatusName ? `: ${q.taskStatusName}` : ''}
                  </TagChip>
                )}
                {q.isDone && q.doneByName && (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    {t('توسط')}
                    <UserName userId={q.doneBy} name={q.doneByName} />
                  </span>
                )}
                <QaTick row={q} canManage={canManage || canInteract} />
                {canManage && <QaDelete itemId={q.id} />}
              </span>
            </li>
          ))}
        </ul>
      </Section>
    );

  return (
    // ⚠️ پهنای خواندنی را خودِ تب (`TabPanel width="reading"`) می‌دهد: ردیفِ
    // چک‌لیست یک عنوان و چند چیپ است و کش‌آمدنش تا لبهٔ نمایشگر، تیک و عنوان را
    // دور می‌کرد. فرمِ بالا دیگر عرضِ سومی (`3xl`) ندارد.
    <div className="grid grid-cols-1 gap-4">
      {form && <ApplyQaForm projectId={projectId} roles={form.roles} />}
      {qa.length === 0 && tasks.length === 0 ? (
        <EmptyState title={t("هنوز آیتم چک‌لیستی روی این پروژه نیست.")} />
      ) : (
        <>
          {canManage && roleGroups.length > 0 && (
            <div className="flex flex-wrap items-center gap-1 rounded-xl border bg-card p-2">
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
          <Tabs value={view} onValueChange={(v) => setView(v as typeof view)}>
            <TabsList variant="line">
              <TabsTrigger value="tasks" className="flex-none gap-1.5">
                {t('تسک‌ها')}
                <span className="num text-xs text-muted-foreground">{tasks.length}</span>
              </TabsTrigger>
              <TabsTrigger value="checklist" className="flex-none gap-1.5">
                {t('چک‌لیست')}
                <span className="num text-xs text-muted-foreground">{qa.length}</span>
              </TabsTrigger>
            </TabsList>
          </Tabs>
          {view === 'tasks'
            ? <QaTaskGroups tasks={tasks} onOpen={setOpenTask} />
            : (qa.length === 0
              ? <p className="text-sm text-muted-foreground">{t('هنوز آیتم چک‌لیستی روی این پروژه نیست.')}</p>
              : section('چک‌لیست', qa))}
        </>
      )}
      <TaskDialog
        taskId={openTask}
        open={openTask !== null}
        onOpenChange={(open) => { if (!open) { setOpenTask(null); router.refresh(); } }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * تبِ پیشنهادهای مناقصه — تأیید و پس‌گرفتن.
 * ------------------------------------------------------------------ */

export interface BidRow {
  id: number;
  /** برای یافتنِ برندهٔ فعلیِ **همین نقش** پیش از جایگزینی. */
  roleTagId?: number;
  amount: string;
  status: string;
  note: string | null;
  currencyCode?: string | null;
  userId?: number | null;
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
  currentWinner = null,
}: {
  bid: BidRow;
  projectId: number;
  isOpen: boolean;
  /** برندهٔ فعلیِ همین نقش (اگر کسِ دیگری است) — تأیید یعنی جایگزینیِ او. */
  currentWinner?: string | null;
}) {
  const tr = useT();
  const confirm = useConfirm();
  const { show } = useToast();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const gone = bid.status === 'withdrawn' || bid.status === 'archived';

  return (
    <div className="flex flex-wrap items-center justify-end gap-1">
      {/* R-TENDER-01 — پس از شروعِ کار برنده عوض نمی‌شود، پس دکمه هم نمی‌آید. */}
      {isOpen && !gone && bid.status !== 'approved' && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={async () => {
            /**
             * ⚠️ نقش برنده دارد → تأیید یعنی **جایگزینی**: برندهٔ قبلی از پروژه
             * برداشته می‌شود (پورتِ `Bids::approve`). پیش از این بی‌پرسش و
             * بی‌پیام انجام می‌شد و ردیف‌ها جابه‌جا می‌شدند، پس به چشم «هیچ
             * اتفاقی نیفتاد» دیده می‌شد.
             */
            if (currentWinner && !(await confirm({
              title: tr('برندهٔ این نقش عوض شود؟'),
              description: tr('«{winner}» الان برندهٔ این نقش است. با تأییدِ این پیشنهاد، او از پروژه برداشته می‌شود و «{name}» جایش می‌نشیند.', {
                winner: currentWinner,
                name: bid.userName ?? '—',
              }),
            }))) return;
            startTransition(async () => {
              setError(null);
              const result = await approveBidAction(bid.id, projectId);
              if (result.error) setError(result.error);
              else show(currentWinner ? tr('برنده عوض شد.') : tr('پیشنهاد تأیید شد.'), 'success');
            });
          }}
        >
          <Check className="size-3.5" />
          {tr("تأیید")}
        </Button>
      )}
      {/* «حذفِ برنده» فقط برای پیشنهادِ تأییدشده — پیشنهادِ در انتظارِ دیگران دستِ خودشان است. */}
      {isOpen && bid.status === 'approved' && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          disabled={pending}
          onClick={async () => {
            if (await confirm({ title: tr('برنده پس گرفته شود؟'), description: tr('نقش دوباره برای پیشنهاد باز می‌شود.') })) {
              startTransition(async () => {
                setError(null);
                const result = await withdrawBidAction(bid.id, projectId);
                if (result.error) setError(result.error);
                else show(tr('برنده پس گرفته شد.'), 'success');
              });
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
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("پیشنهاددهنده")}</TableHead>
            <TableHead>{t("نقش")}</TableHead>
            <TableHead numeric>{t("مبلغ")}</TableHead>
            <TableHead>{t("وضعیت")}</TableHead>
            {/* پورتِ ستونِ «یادداشت» ِ جدولِ پیشنهادهای مدیر — توضیحِ پیشنهاددهنده. */}
            <TableHead>{t("یادداشت")}</TableHead>
            {canManage && <TableActionsHead />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {bids.map((b) => {
            const s = BID_STATUS[b.status] ?? { label: b.status, variant: 'secondary' as const };
            return (
              <TableRow key={b.id}>
                <TableCell><UserName userId={b.userId} name={b.userName ?? '—'} size="sm" /></TableCell>
                <TableCell>{b.roleName ?? '—'}</TableCell>
                <TableNumericCell><Amount>{format(b.amount)}{b.currencyCode ? ` ${b.currencyCode}` : ''}</Amount></TableNumericCell>
                <TableCell><Badge variant={s.variant}>{t(s.label)}</Badge></TableCell>
                <TableCell className="max-w-64 text-xs whitespace-pre-wrap text-muted-foreground">{b.note || '—'}</TableCell>
                {canManage && (
                  <TableActionsCell>
                    <BidActions
                      bid={b}
                      projectId={projectId}
                      isOpen={isOpen}
                      currentWinner={bids.find((x) => x.id !== b.id && x.status === 'approved'
                        && (x.roleTagId ?? x.roleName) === (b.roleTagId ?? b.roleName))?.userName ?? null}
                    />
                  </TableActionsCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
