'use client';

import { UserName } from '@/components/user-avatar';
import { useActionState, useEffect, useMemo, useState, useTransition } from 'react';
import { useFormStatus } from 'react-dom';
import { CircleAlert, Eye, Pause, Pencil, Play, Plus, Trash2, TrendingUp, Wallet } from 'lucide-react';
import {
  changeSalaryAction, deleteSalaryAction, paySalaryAction, saveSalaryAction, stopSalaryAction, unpaySalaryAction,
  type SalaryState,
} from './_form/salary-actions';
import { formatIn } from '@/domain/money/money';
import { addMonths, monthOf, netOf } from '@/domain/team-money/salary';
import type { SalaryPerson, SalaryPeriodRow } from '@/server/finance/salaries';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { IconButton } from '@/components/ui/icon-button';
import { Input } from '@/components/ui/input';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Table, TableActionsCell, TableActionsHead, TableBody, TableCell, TableDateCell, TableHead, TableHeader,
  TableNumericCell, TableRow,
} from '@/components/ui/table';
import { Section } from '@/components/page-shell';
import { useActionToast, useToast } from '@/components/ui/toast';
import { useT } from '@/i18n/client';
import { useConfirm } from '@/components/ui/confirm';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { DatePicker } from '@/components/ui/date-picker';
import { SearchInput } from '@/components/ui/search-input';
import { Checkbox } from '@/components/ui/checkbox';
import { Amount } from '@/components/amount-privacy';

type Account = { id: number; name: string; currencyId: number; isActive: boolean };
type Currency = { id: number; code: string; isDefault: boolean };
type Unpaid = SalaryPerson['unpaid'][number];

/** فرمی که باز است. */
type Mode =
  | { kind: 'start'; userId: number | null }
  | { kind: 'edit'; period: SalaryPeriodRow }
  | { kind: 'stop'; period: SalaryPeriodRow }
  | { kind: 'change'; period: SalaryPeriodRow }
  | { kind: 'pay'; person: SalaryPerson; due: Unpaid };

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  const tr = useT();
  return <Button type="submit" disabled={pending}>{pending ? <><Spinner />{tr('در حالِ ثبت…')}</> : label}</Button>;
}

function Money({ amount, code }: { amount: string; code: string }) {
  return <Amount className="num">{formatIn(amount, code)} {code}</Amount>;
}

/** `2026-04-01` → `2026-04` — همان قالبِ عددیِ تاریخ‌های برنامه. */
function Month({ value }: { value: string }) {
  return <span className="num" dir="ltr">{value.slice(0, 7)}</span>;
}

function ErrorBox({ error }: { error?: string }) {
  if (!error) return null;
  return (
    <Alert variant="destructive">
      <CircleAlert />
      <AlertDescription>{error}</AlertDescription>
    </Alert>
  );
}

/**
 * حقوق‌ها (۲.۵۰.۰) — حقوقِ ماهانهٔ اعضا برای کارهای ثابتِ آژانس، جدا از دستمزدِ پروژه.
 *
 * ⚠️ هر توقف دوره را می‌بندد و هر ادامه دورهٔ تازه می‌سازد؛ ماه‌های بیرونِ دوره‌ها
 * «پرداخت‌نشده» حساب نمی‌شوند.
 */
export function SalariesView({
  people, accounts, currencies, canManage, today,
}: {
  people: SalaryPerson[];
  accounts: Account[];
  currencies: Currency[];
  canManage: boolean;
  today: string;
}) {
  const tr = useT();
  const confirm = useConfirm();
  const { show } = useToast();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [viewing, setViewing] = useState<number | null>(null);
  const [mode, setMode] = useState<Mode | null>(null);

  const needle = query.trim().toLowerCase();
  const withSalary = (p: SalaryPerson) => p.periods.length > 0;
  const shown = people.filter((p) => (showAll ? p.active || withSalary(p) : withSalary(p))
    && (needle === '' || p.name.toLowerCase().includes(needle)));
  const person = viewing === null ? null : people.find((p) => p.userId === viewing) ?? null;

  /** همهٔ ماه‌های پرداخت‌نشده، قدیمی‌ترین اول. */
  const queue = useMemo(() => people
    .flatMap((p) => p.unpaid.map((d) => ({ person: p, due: d })))
    .sort((a, b) => a.due.month.localeCompare(b.due.month) || a.person.name.localeCompare(b.person.name)), [people]);

  const act = (fn: () => Promise<SalaryState>) => startTransition(async () => {
    const result = await fn();
    if (result.error) show(tr(result.error), 'error');
    else show(tr('انجام شد.'), 'success');
  });

  const removePeriod = async (id: number) => {
    if (!(await confirm({ title: tr('این دوره حذف شود؟'), description: tr('فقط دوره‌ای که هنوز پرداختی ندارد حذف می‌شود.') }))) return;
    act(() => deleteSalaryAction(id));
  };
  const removePayment = async (id: number) => {
    if (!(await confirm({
      title: tr('این پرداخت برگردانده شود؟'),
      description: tr('ردیفِ دفترِ همین پرداخت هم حذف می‌شود و اگر قسطِ قرض کم شده بود، به بدهی برمی‌گردد.'),
    }))) return;
    act(() => unpaySalaryAction(id));
  };

  return (
    <Section
      title={tr('حقوق‌ها')}
      description={tr('حقوقِ ماهانهٔ اعضا برای کارهای ثابتِ آژانس — جدا از دستمزدِ پروژه‌ها.')}
      actions={(
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder={tr('جستجوی عضو')} />
          {canManage && (
            <Button size="sm" onClick={() => setMode({ kind: 'start', userId: null })}>
              <Plus className="size-3.5" />{tr('حقوقِ تازه')}
            </Button>
          )}
        </div>
      )}
    >
      {queue.length > 0 && (
        <div className="mb-4 grid gap-2">
          <h3 className="text-sm font-medium">{tr('پرداخت‌نشده تا این ماه')}</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{tr('عضو')}</TableHead>
                <TableHead>{tr('ماه')}</TableHead>
                <TableHead numeric>{tr('مبلغ')}</TableHead>
                <TableHead>{tr('وضعیت')}</TableHead>
                {canManage && <TableActionsHead />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {queue.map(({ person: p, due: d }) => (
                <TableRow key={`${p.userId}-${d.month}`}>
                  <TableCell><UserName userId={p.userId} name={p.name} size="sm" /></TableCell>
                  <TableCell><Month value={d.month} /></TableCell>
                  <TableNumericCell><Money amount={d.amount} code={d.currencyCode} /></TableNumericCell>
                  <TableCell>
                    {d.overdue
                      ? <Badge variant="destructive">{tr('عقب‌افتاده')}</Badge>
                      : <Badge variant="outline">{tr('سررسید روزِ {day}', { day: String(d.payDay) })}</Badge>}
                  </TableCell>
                  {canManage && (
                    <TableActionsCell>
                      <Button size="sm" disabled={!p.active} onClick={() => setMode({ kind: 'pay', person: p, due: d })}>
                        <Wallet className="size-3.5" />{tr('پرداخت')}
                      </Button>
                    </TableActionsCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="mb-3 flex items-center text-sm">
        <label className="ms-auto flex items-center gap-2 text-xs text-muted-foreground">
          <Checkbox checked={showAll} onCheckedChange={(v) => setShowAll(v === true)} />
          {tr('همهٔ اعضا')}
        </label>
      </div>

      {shown.length === 0 ? (
        <EmptyState
          title={tr('هنوز حقوقی ثبت نشده')}
          description={tr('برای عضوی که ماهانه حقوق می‌گیرد «حقوقِ تازه» را بزنید.')}
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{tr('عضو')}</TableHead>
              <TableHead>{tr('حقوقِ فعلی')}</TableHead>
              <TableHead>{tr('پرداخت‌نشده')}</TableHead>
              <TableHead>{tr('آخرین پرداخت')}</TableHead>
              <TableActionsHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((p) => (
              <TableRow key={p.userId}>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    <UserName userId={p.userId} name={p.name} size="sm" />
                    {!p.active && <Badge variant="outline" className="text-[0.65rem]">{tr('سابق')}</Badge>}
                  </div>
                </TableCell>
                <TableCell>
                  {p.current
                    ? (
                      <span className="text-sm">
                        <Money amount={p.current.amount} code={p.current.currencyCode} />
                        <span className="ms-2 text-xs text-muted-foreground">{tr('روزِ {day}', { day: String(p.current.payDay) })}</span>
                        {p.current.endMonth && <span className="ms-2 text-xs text-muted-foreground">{tr('تا')} <Month value={p.current.endMonth} /></span>}
                      </span>
                    )
                    : p.periods.length > 0
                      ? <Badge variant="outline">{tr('متوقف')}</Badge>
                      : <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell>
                  {p.unpaid.length === 0
                    ? <span className="text-muted-foreground">—</span>
                    : <Badge variant={p.unpaid.some((d) => d.overdue) ? 'destructive' : 'warning'}>{tr('{n} ماه', { n: String(p.unpaid.length) })}</Badge>}
                </TableCell>
                <TableDateCell>{p.payments[0]?.paidAt ?? '—'}</TableDateCell>
                <TableActionsCell>
                  {p.periods.length > 0 && (
                    <Button size="sm" variant="outline" onClick={() => setViewing(p.userId)}>
                      <Eye className="size-3.5" />{tr('ریز')}
                    </Button>
                  )}
                  {canManage && p.active && !p.current && (
                    <IconButton
                      variant="ghost"
                      className="size-8"
                      label={p.periods.length > 0 ? tr('ادامهٔ حقوق') : tr('حقوقِ تازه')}
                      onClick={() => setMode({ kind: 'start', userId: p.userId })}
                    >
                      <Play className="size-3.5" />
                    </IconButton>
                  )}
                </TableActionsCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* ---- ریزِ حقوقِ یک عضو ---- */}
      <Dialog open={person !== null} onOpenChange={(open) => { if (!open) setViewing(null); }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
          {person && (
            <>
              <DialogHeader>
                <DialogTitle>{tr('حقوقِ {name}', { name: person.name })}</DialogTitle>
                <DialogDescription>{tr('دوره‌هایی که حقوق داشته و پرداخت‌های هر ماه.')}</DialogDescription>
              </DialogHeader>

              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">{tr('دوره‌ها')}</h3>
                {canManage && person.active && !person.periods.some((x) => x.endMonth === null) && (
                  <Button size="xs" variant="outline" onClick={() => setMode({ kind: 'start', userId: person.userId })}>
                    <Play className="size-3" />{tr('ادامهٔ حقوق')}
                  </Button>
                )}
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{tr('از')}</TableHead>
                    <TableHead>{tr('تا')}</TableHead>
                    <TableHead numeric>{tr('مبلغ')}</TableHead>
                    <TableHead>{tr('روزِ پرداخت')}</TableHead>
                    {canManage && <TableActionsHead />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {person.periods.map((period) => {
                    const paid = person.payments.some((x) => x.salaryId === period.id);
                    return (
                      <TableRow key={period.id}>
                        <TableCell><Month value={period.startMonth} /></TableCell>
                        <TableCell>{period.endMonth ? <Month value={period.endMonth} /> : <Badge variant="success">{tr('ادامه دارد')}</Badge>}</TableCell>
                        <TableNumericCell><Money amount={period.amount} code={period.currencyCode} /></TableNumericCell>
                        <TableCell className="text-sm">
                          {String(period.payDay)}
                          {period.accountName && <span className="ms-2 text-xs text-muted-foreground">{period.accountName}</span>}
                        </TableCell>
                        {canManage && (
                          <TableActionsCell>
                            {period.endMonth === null && (
                              <>
                                <IconButton variant="ghost" className="size-8" label={tr('تغییرِ مبلغ')} onClick={() => setMode({ kind: 'change', period })}>
                                  <TrendingUp className="size-3.5" />
                                </IconButton>
                                <IconButton variant="ghost" className="size-8" label={tr('توقفِ حقوق')} onClick={() => setMode({ kind: 'stop', period })}>
                                  <Pause className="size-3.5" />
                                </IconButton>
                              </>
                            )}
                            <IconButton variant="ghost" className="size-8" label={tr('ویرایش')} onClick={() => setMode({ kind: 'edit', period })}>
                              <Pencil className="size-3.5" />
                            </IconButton>
                            {!paid && (
                              <IconButton
                                variant="ghost"
                                className="size-8 text-muted-foreground hover:text-destructive"
                                label={tr('حذف')}
                                disabled={pending}
                                onClick={() => removePeriod(period.id)}
                              >
                                <Trash2 className="size-3.5" />
                              </IconButton>
                            )}
                          </TableActionsCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              <h3 className="text-sm font-medium">{tr('پرداخت‌ها')}</h3>
              {person.payments.length === 0 ? (
                <p className="text-sm text-muted-foreground">{tr('هنوز پرداختی ثبت نشده.')}</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{tr('ماه')}</TableHead>
                      <TableHead numeric>{tr('حقوق')}</TableHead>
                      <TableHead>{tr('پاداش / کسر')}</TableHead>
                      <TableHead numeric>{tr('خالص')}</TableHead>
                      <TableHead>{tr('تاریخِ پرداخت')}</TableHead>
                      {canManage && <TableActionsHead />}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {person.payments.map((x) => (
                      <TableRow key={x.id}>
                        <TableCell><Month value={x.month} /></TableCell>
                        <TableNumericCell><Money amount={x.baseAmount} code={x.currencyCode} /></TableNumericCell>
                        <TableCell className="text-xs">
                          <Adjustments row={x} />
                        </TableCell>
                        <TableNumericCell><Money amount={x.netAmount} code={x.currencyCode} /></TableNumericCell>
                        <TableDateCell>{x.paidAt}</TableDateCell>
                        {canManage && (
                          <TableActionsCell>
                            <IconButton
                              variant="ghost"
                              className="size-8 text-muted-foreground hover:text-destructive"
                              label={tr('برگرداندنِ پرداخت')}
                              disabled={pending}
                              onClick={() => removePayment(x.id)}
                            >
                              <Trash2 className="size-3.5" />
                            </IconButton>
                          </TableActionsCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ---- فرم‌ها ---- */}
      <Dialog open={mode !== null} onOpenChange={(open) => { if (!open) setMode(null); }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
          {mode && (mode.kind === 'start' || mode.kind === 'edit') && (
            <PeriodForm
              key={mode.kind === 'edit' ? `e${mode.period.id}` : `s${mode.userId ?? 'new'}`}
              mode={mode}
              people={people.filter((p) => p.active)}
              accounts={accounts.filter((a) => a.isActive)}
              currencies={currencies}
              today={today}
              onDone={() => setMode(null)}
            />
          )}
          {mode?.kind === 'stop' && <StopForm key={`t${mode.period.id}`} period={mode.period} today={today} onDone={() => setMode(null)} />}
          {mode?.kind === 'change' && <ChangeForm key={`c${mode.period.id}`} period={mode.period} today={today} onDone={() => setMode(null)} />}
          {mode?.kind === 'pay' && (
            <PayForm
              key={`p${mode.person.userId}-${mode.due.month}`}
              person={mode.person}
              due={mode.due}
              accounts={accounts.filter((a) => a.isActive)}
              today={today}
              onDone={() => setMode(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </Section>
  );
}

/** پاداش، کسر و قسطِ یک پرداخت — هر کدام فقط اگر صفر نباشد. */
export function Adjustments({ row }: { row: { bonus: string; deduction: string; installment: string; currencyCode: string } }) {
  const tr = useT();
  const parts = [
    Number(row.bonus) > 0 && <span key="b" className="text-emerald-700 dark:text-emerald-500">{tr('پاداش')} +<Money amount={row.bonus} code={row.currencyCode} /></span>,
    Number(row.deduction) > 0 && <span key="d">{tr('کسر')} −<Money amount={row.deduction} code={row.currencyCode} /></span>,
    Number(row.installment) > 0 && <span key="i">{tr('قسطِ قرض')} −<Money amount={row.installment} code={row.currencyCode} /></span>,
  ].filter(Boolean);
  if (parts.length === 0) return <span className="text-muted-foreground">—</span>;
  return <div className="flex flex-col gap-0.5">{parts}</div>;
}

function useFormAction(
  fn: (prev: SalaryState, formData: FormData) => Promise<SalaryState>,
  onDone: () => void,
  success: string,
) {
  const [state, action] = useActionState<SalaryState, FormData>(fn, {});
  useActionToast(state, { success });
  useEffect(() => { if (state.ok) onDone(); }, [state, onDone]);
  return [state, action] as const;
}

function PeriodForm({
  mode, people, accounts, currencies, today, onDone,
}: {
  mode: Extract<Mode, { kind: 'start' | 'edit' }>;
  people: SalaryPerson[];
  accounts: Array<{ id: number; name: string }>;
  currencies: Currency[];
  today: string;
  onDone: () => void;
}) {
  const tr = useT();
  const [state, action] = useFormAction(saveSalaryAction, onDone, 'ذخیره شد.');
  const period = mode.kind === 'edit' ? mode.period : null;
  const [userId, setUserId] = useState<string>(mode.kind === 'start' && mode.userId ? String(mode.userId) : '');
  // ادامه پس از توقف: ارز و مبلغ و روز از آخرین دوره.
  const last = mode.kind === 'start' ? people.find((p) => String(p.userId) === userId)?.periods[0] ?? null : null;
  const base = period ?? last;
  const defaultCurrency = base?.currencyId ?? currencies.find((c) => c.isDefault)?.id ?? currencies[0]?.id ?? '';

  return (
    <form action={action} className="grid gap-3">
      <DialogHeader>
        <DialogTitle>{period ? tr('ویرایشِ دورهٔ حقوق') : last ? tr('ادامهٔ حقوق') : tr('حقوقِ تازه')}</DialogTitle>
        <DialogDescription>
          {period
            ? tr('مبلغِ تازه فقط روی ماه‌های پرداخت‌نشده اثر دارد.')
            : tr('از این ماه هر ماه حقوق سررسید می‌شود تا وقتی که متوقفش کنید.')}
        </DialogDescription>
      </DialogHeader>
      {period && <input type="hidden" name="id" value={period.id} />}

      {!period && (
        <Field>
          <FieldLabel htmlFor="sal-user">{tr('عضو')}</FieldLabel>
          <SearchableSelect id="sal-user" name="userId" containerClassName="w-full" value={userId} onValueChange={setUserId} required>
            <NativeSelectOption value="">{tr('— انتخابِ عضو —')}</NativeSelectOption>
            {people.map((p) => <NativeSelectOption key={p.userId} value={p.userId}>{p.name}</NativeSelectOption>)}
          </SearchableSelect>
        </Field>
      )}

      <div key={base?.id ?? 'none'} className="grid gap-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field>
            <FieldLabel htmlFor="sal-amount">{tr('مبلغِ ماهانه')}</FieldLabel>
            <Input id="sal-amount" name="amount" inputMode="decimal" className="num" defaultValue={base ? String(Number(base.amount)) : ''} required />
          </Field>
          <Field>
            <FieldLabel htmlFor="sal-cur">{tr('ارز')}</FieldLabel>
            <NativeSelect id="sal-cur" name="currencyId" containerClassName="w-full" defaultValue={String(defaultCurrency)}>
              {currencies.map((c) => <NativeSelectOption key={c.id} value={c.id}>{c.code}</NativeSelectOption>)}
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel htmlFor="sal-day">{tr('روزِ پرداخت')}</FieldLabel>
            <Input id="sal-day" name="payDay" type="number" min={1} max={28} className="num" defaultValue={String(base?.payDay ?? 1)} required />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="sal-start">{tr('از ماهِ')}</FieldLabel>
            <Input id="sal-start" name="startMonth" type="month" className="num" defaultValue={(period?.startMonth ?? monthOf(today)).slice(0, 7)} required />
          </Field>
          <Field>
            <FieldLabel htmlFor="sal-end">{tr('تا ماهِ (اختیاری)')}</FieldLabel>
            <Input id="sal-end" name="endMonth" type="month" className="num" defaultValue={period?.endMonth?.slice(0, 7) ?? ''} />
            <FieldDescription>{tr('خالی یعنی ادامه دارد.')}</FieldDescription>
          </Field>
        </div>

        <Field>
          <FieldLabel htmlFor="sal-account">{tr('حسابِ پیش‌فرضِ پرداخت')}</FieldLabel>
          <SearchableSelect id="sal-account" name="accountId" containerClassName="w-full" defaultValue={base?.accountId ? String(base.accountId) : ''}>
            <NativeSelectOption value="">{tr('— هنگامِ پرداخت انتخاب می‌شود —')}</NativeSelectOption>
            {accounts.map((a) => <NativeSelectOption key={a.id} value={a.id}>{a.name}</NativeSelectOption>)}
          </SearchableSelect>
        </Field>

        <Field>
          <FieldLabel htmlFor="sal-note">{tr('یادداشت')}</FieldLabel>
          <Textarea id="sal-note" name="note" rows={2} defaultValue={period?.note ?? ''} placeholder={tr('مثلاً پشتیبانیِ سایت‌ها و کارهای ثابتِ آژانس')} />
        </Field>
      </div>

      <ErrorBox error={state.error} />
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>{tr('انصراف')}</Button>
        <Submit label={tr('ذخیره')} />
      </DialogFooter>
    </form>
  );
}

function StopForm({ period, today, onDone }: { period: SalaryPeriodRow; today: string; onDone: () => void }) {
  const tr = useT();
  const [state, action] = useFormAction(stopSalaryAction, onDone, 'حقوق متوقف شد.');
  const current = monthOf(today);
  const suggested = current < period.startMonth ? period.startMonth : current;
  return (
    <form action={action} className="grid gap-3">
      <DialogHeader>
        <DialogTitle>{tr('توقفِ حقوق')}</DialogTitle>
        <DialogDescription>{tr('بعد از ماهی که انتخاب می‌کنید حقوقی سررسید نمی‌شود. هر وقت بخواهید با «ادامهٔ حقوق» دوباره شروع می‌شود.')}</DialogDescription>
      </DialogHeader>
      <input type="hidden" name="id" value={period.id} />
      <Field>
        <FieldLabel htmlFor="sal-last">{tr('آخرین ماهی که حقوق دارد')}</FieldLabel>
        <Input id="sal-last" name="lastMonth" type="month" className="num" min={period.startMonth.slice(0, 7)} defaultValue={suggested.slice(0, 7)} required />
        <FieldDescription>{tr('اگر حقوقِ همین ماه را هم نمی‌دهید، ماهِ قبل را انتخاب کنید.')}</FieldDescription>
      </Field>
      <ErrorBox error={state.error} />
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>{tr('انصراف')}</Button>
        <Submit label={tr('توقف')} />
      </DialogFooter>
    </form>
  );
}

function ChangeForm({ period, today, onDone }: { period: SalaryPeriodRow; today: string; onDone: () => void }) {
  const tr = useT();
  const [state, action] = useFormAction(changeSalaryAction, onDone, 'ذخیره شد.');
  const next = addMonths(monthOf(today), 1);
  return (
    <form action={action} className="grid gap-3">
      <DialogHeader>
        <DialogTitle>{tr('تغییرِ مبلغِ حقوق')}</DialogTitle>
        <DialogDescription>{tr('ماه‌های قبل با همان مبلغِ قبلی می‌مانند و از ماهِ انتخابی مبلغِ تازه حساب می‌شود.')}</DialogDescription>
      </DialogHeader>
      <input type="hidden" name="id" value={period.id} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="sal-new">{tr('مبلغِ تازه ({code})', { code: period.currencyCode })}</FieldLabel>
          <Input id="sal-new" name="amount" inputMode="decimal" className="num" defaultValue={String(Number(period.amount))} required />
        </Field>
        <Field>
          <FieldLabel htmlFor="sal-from">{tr('از ماهِ')}</FieldLabel>
          <Input id="sal-from" name="fromMonth" type="month" className="num" min={period.startMonth.slice(0, 7)} defaultValue={(next < period.startMonth ? period.startMonth : next).slice(0, 7)} required />
        </Field>
      </div>
      <ErrorBox error={state.error} />
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>{tr('انصراف')}</Button>
        <Submit label={tr('ذخیره')} />
      </DialogFooter>
    </form>
  );
}

function PayForm({
  person, due, accounts, today, onDone,
}: {
  person: SalaryPerson;
  due: Unpaid;
  accounts: Array<{ id: number; name: string }>;
  today: string;
  onDone: () => void;
}) {
  const tr = useT();
  const [state, action] = useFormAction(paySalaryAction, onDone, 'پرداخت ثبت شد.');
  const [bonus, setBonus] = useState('');
  const [deduction, setDeduction] = useState('');
  const [installment, setInstallment] = useState('');
  const debt = person.debt[due.currencyId] ?? null;
  const net = netOf(due.amount, bonus || '0', deduction || '0', installment || '0');

  return (
    <form action={action} className="grid gap-3">
      <DialogHeader>
        <DialogTitle>{tr('پرداختِ حقوقِ {name}', { name: person.name })}</DialogTitle>
        <DialogDescription>
          {tr('ماه')}: <Month value={due.month} /> · {tr('حقوق')}: <Money amount={due.amount} code={due.currencyCode} />
        </DialogDescription>
      </DialogHeader>
      <input type="hidden" name="salaryId" value={due.salaryId} />
      <input type="hidden" name="month" value={due.month} />

      <div className="grid gap-3 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="pay-account">{tr('از حسابِ')}</FieldLabel>
          <SearchableSelect id="pay-account" name="accountId" containerClassName="w-full" required defaultValue={due.accountId ? String(due.accountId) : ''}>
            <NativeSelectOption value="">{tr('— انتخابِ حساب —')}</NativeSelectOption>
            {accounts.map((a) => <NativeSelectOption key={a.id} value={a.id}>{a.name}</NativeSelectOption>)}
          </SearchableSelect>
        </Field>
        <Field>
          <FieldLabel htmlFor="pay-date">{tr('تاریخِ پرداخت')}</FieldLabel>
          <DatePicker id="pay-date" name="paidAt" defaultValue={today} required />
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Field>
          <FieldLabel htmlFor="pay-bonus">{tr('پاداش (اختیاری)')}</FieldLabel>
          <Input id="pay-bonus" name="bonus" inputMode="decimal" className="num" value={bonus} onChange={(e) => setBonus(e.target.value)} />
        </Field>
        <Field>
          <FieldLabel htmlFor="pay-ded">{tr('کسر (اختیاری)')}</FieldLabel>
          <Input id="pay-ded" name="deduction" inputMode="decimal" className="num" value={deduction} onChange={(e) => setDeduction(e.target.value)} />
        </Field>
        <Field>
          <FieldLabel htmlFor="pay-inst">{tr('قسطِ قرض (اختیاری)')}</FieldLabel>
          <Input
            id="pay-inst"
            name="installment"
            inputMode="decimal"
            className="num"
            value={installment}
            onChange={(e) => setInstallment(e.target.value)}
            disabled={debt === null}
          />
        </Field>
      </div>
      <p className="text-xs text-muted-foreground">
        {debt === null
          ? tr('به این ارز بدهی‌ای ندارد.')
          : <>{tr('ماندهٔ بدهیِ او به این ارز')}: <Money amount={debt} code={due.currencyCode} /></>}
      </p>

      <Field>
        <FieldLabel htmlFor="pay-note">{tr('یادداشت')}</FieldLabel>
        <Textarea id="pay-note" name="note" rows={2} />
      </Field>

      <div className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-2 text-sm">
        <span className="text-muted-foreground">{tr('خالصِ پرداخت')}</span>
        <span className={Number(net) > 0 ? 'font-medium' : 'font-medium text-destructive'}><Money amount={net} code={due.currencyCode} /></span>
      </div>

      <ErrorBox error={state.error} />
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>{tr('انصراف')}</Button>
        <Submit label={tr('پرداخت')} />
      </DialogFooter>
    </form>
  );
}
