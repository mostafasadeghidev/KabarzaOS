'use client';

import { UserName } from '@/components/user-avatar';
import { useActionState, useEffect, useMemo, useState, useTransition } from 'react';
import { useFormStatus } from 'react-dom';
import { CircleAlert, Eye, Plus, Trash2 } from 'lucide-react';
import { deleteMemberEntryAction, saveMemberEntryAction, type MemberAccountState } from './_form/member-account-actions';
import { formatIn } from '@/domain/money/money';
import { debtSign, MEMBER_ACCOUNT_LABELS, type MemberAccountKind } from '@/domain/team-money/member-account';
import type { MemberAccountRow } from '@/server/finance/member-accounts';
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

/** کارهایی که از این تب ثبت می‌شوند، به ترتیبِ نمایش. */
const KINDS: MemberAccountKind[] = ['loan', 'gift', 'charge', 'repayment', 'offset', 'forgive'];

const KIND_HINT: Record<MemberAccountKind, string> = {
  loan: 'پول از حساب می‌رود و عضو به همان اندازه بدهکار می‌شود.',
  gift: 'پول از حساب می‌رود و عضو بدهکار نمی‌شود؛ هزینهٔ شرکت است.',
  charge: 'شرکت چیزی برای عضو خریده (مثلاً اشتراک)؛ پول به فروشنده می‌رود و عضو بدهکارِ سهمِ خودش می‌شود.',
  repayment: 'عضو پول را برگردانده؛ ردیفِ واریز در حساب نوشته و بدهی کم می‌شود.',
  offset: 'از دستمزدِ یک پروژه کم می‌شود: پروژه به همان اندازه پرداخت‌شده حساب می‌شود و بدهی کم می‌شود. پولی جابه‌جا نمی‌شود.',
  forgive: 'بدهی پاک می‌شود و در جمعِ «هدیه و بخشیده» می‌آید. پولی جابه‌جا نمی‌شود.',
};

const KIND_VARIANT: Record<MemberAccountKind, 'warning' | 'success' | 'secondary' | 'outline'> = {
  loan: 'warning',
  charge: 'warning',
  gift: 'secondary',
  repayment: 'success',
  offset: 'success',
  forgive: 'outline',
};

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  const tr = useT();
  return <Button type="submit" disabled={pending}>{pending ? <><Spinner />{tr('در حالِ ثبت…')}</> : label}</Button>;
}

function Money({ amount, code }: { amount: string; code: string }) {
  return <Amount className="num">{formatIn(amount, code)} {code}</Amount>;
}

/**
 * حسابِ اعضا (۲.۴۹.۰) — قرض، هدیه، هزینه برای عضو و تسویه‌شان.
 *
 * ⚠️ مانده **به تفکیکِ ارز** است؛ جمعِ یورو و تومان در یک عدد معنایی نداشت.
 */
export function MemberAccountsView({
  people,
  accounts,
  currencies,
  canManage,
  today,
}: {
  people: MemberAccountRow[];
  accounts: Array<{ id: number; name: string; currencyId: number; isActive: boolean }>;
  currencies: Array<{ id: number; code: string; isDefault: boolean }>;
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
  const [form, setForm] = useState<{ userId: number | null; kind: MemberAccountKind } | null>(null);

  const [state, action] = useActionState<MemberAccountState, FormData>(saveMemberEntryAction, {});
  useActionToast(state, { success: 'ثبت شد.' });
  useEffect(() => { if (state.ok) setForm(null); }, [state]);

  const needle = query.trim().toLowerCase();
  const shown = people.filter((p) => (showAll ? p.active || p.lines.length > 0 : p.lines.length > 0)
    && (needle === '' || p.name.toLowerCase().includes(needle)));

  /** جمعِ کلِ بدهی‌ها و هدیه‌ها، به تفکیکِ ارز. */
  const totals = useMemo(() => {
    const debt = new Map<string, number>();
    const gift = new Map<string, number>();
    for (const p of people) {
      for (const b of p.balances) debt.set(b.currencyCode, (debt.get(b.currencyCode) ?? 0) + Number(b.amount));
      for (const g of p.gifts) gift.set(g.currencyCode, (gift.get(g.currencyCode) ?? 0) + Number(g.amount));
    }
    return { debt: [...debt], gift: [...gift] };
  }, [people]);

  const person = viewing === null ? null : people.find((p) => p.userId === viewing) ?? null;

  const remove = async (id: number, kind: MemberAccountKind) => {
    const cash = kind === 'loan' || kind === 'gift' || kind === 'repayment';
    if (!(await confirm({
      title: tr('این ردیف حذف شود؟'),
      description: cash
        ? tr('ردیفِ دفترِ همین پول هم از حساب حذف می‌شود.')
        : kind === 'charge' ? tr('فقط بدهی برداشته می‌شود؛ پرداخت به فروشنده در دفتر می‌ماند.') : undefined,
    }))) return;
    startTransition(async () => {
      const result = await deleteMemberEntryAction(id);
      if (result.error) show(tr(result.error), 'error');
      else show(tr('انجام شد.'), 'success');
    });
  };

  return (
    <Section
      title={tr('حسابِ اعضا')}
      description={tr('قرض، هدیه و هزینه‌ای که برای اعضا پرداخت شده، و ماندهٔ بدهیِ هر نفر.')}
      actions={(
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder={tr('جستجوی عضو')} />
          {canManage && (
            <Button size="sm" onClick={() => setForm({ userId: null, kind: 'loan' })}>
              <Plus className="size-3.5" />{tr('ثبتِ جدید')}
            </Button>
          )}
        </div>
      )}
    >
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <span className="text-muted-foreground">{tr('جمعِ بدهی‌ها:')}</span>
        {totals.debt.filter(([, v]) => Math.abs(v) > 0.005).length === 0
          ? <span>—</span>
          : totals.debt.filter(([, v]) => Math.abs(v) > 0.005).map(([code, v]) => (
            <Badge key={code} variant="warning"><Money amount={v.toFixed(2)} code={code} /></Badge>
          ))}
        {totals.gift.length > 0 && (
          <>
            <span className="text-muted-foreground">{tr('هدیه و بخشیده:')}</span>
            {totals.gift.map(([code, v]) => (
              <Badge key={code} variant="secondary"><Money amount={v.toFixed(2)} code={code} /></Badge>
            ))}
          </>
        )}
        <label className="ms-auto flex items-center gap-2 text-xs text-muted-foreground">
          <Checkbox checked={showAll} onCheckedChange={(v) => setShowAll(v === true)} />
          {tr('همهٔ اعضا')}
        </label>
      </div>

      {shown.length === 0 ? (
        <EmptyState
          title={tr('هنوز چیزی ثبت نشده')}
          description={tr('قرض، هدیه یا هزینه‌ای که برای عضوی پرداخت کنید اینجا می‌آید.')}
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{tr('عضو')}</TableHead>
              <TableHead>{tr('ماندهٔ بدهی')}</TableHead>
              <TableHead>{tr('هدیه و بخشیده')}</TableHead>
              <TableHead>{tr('آخرین ردیف')}</TableHead>
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
                    {p.overdue && <Badge variant="destructive" className="text-[0.65rem]">{tr('موعدِ برگشت گذشته')}</Badge>}
                  </div>
                </TableCell>
                <TableCell>
                  {p.balances.length === 0
                    ? <span className="text-muted-foreground">{tr('تسویه')}</span>
                    : <div className="flex flex-wrap gap-1">{p.balances.map((b) => <Badge key={b.currencyId} variant="warning"><Money amount={b.amount} code={b.currencyCode} /></Badge>)}</div>}
                </TableCell>
                <TableCell>
                  {p.gifts.length === 0
                    ? <span className="text-muted-foreground">—</span>
                    : <div className="flex flex-wrap gap-1">{p.gifts.map((g) => <span key={g.currencyId} className="text-sm"><Money amount={g.amount} code={g.currencyCode} /></span>)}</div>}
                </TableCell>
                <TableDateCell>{p.lines[0]?.entryDate ?? '—'}</TableDateCell>
                <TableActionsCell>
                  {p.lines.length > 0 && (
                    <Button size="sm" variant="outline" onClick={() => setViewing(p.userId)}>
                      <Eye className="size-3.5" />{tr('ریز')}
                    </Button>
                  )}
                  {canManage && p.active && (
                    <IconButton variant="ghost" className="size-8" label={tr('ثبتِ جدید')} onClick={() => setForm({ userId: p.userId, kind: 'loan' })}>
                      <Plus className="size-3.5" />
                    </IconButton>
                  )}
                </TableActionsCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* ---- ریزِ حسابِ یک عضو ---- */}
      <Dialog open={person !== null} onOpenChange={(open) => { if (!open) setViewing(null); }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
          {person && (
            <>
              <DialogHeader>
                <DialogTitle>{tr('حسابِ {name}', { name: person.name })}</DialogTitle>
                <DialogDescription>
                  {person.balances.length === 0
                    ? tr('بدهیِ بازی ندارد.')
                    : (
                      <>
                        {tr('ماندهٔ بدهی')}:{' '}
                        {person.balances.map((b, i) => (
                          <span key={b.currencyId}>{i > 0 && ' · '}<Money amount={b.amount} code={b.currencyCode} /></span>
                        ))}
                      </>
                    )}
                </DialogDescription>
              </DialogHeader>
              {canManage && person.active && (
                <div className="flex flex-wrap gap-1.5">
                  {KINDS.map((k) => (
                    <Button
                      key={k}
                      size="xs"
                      variant="outline"
                      disabled={debtSign(k) === -1 && person.balances.length === 0}
                      onClick={() => setForm({ userId: person.userId, kind: k })}
                    >
                      {tr(MEMBER_ACCOUNT_LABELS[k])}
                    </Button>
                  ))}
                </div>
              )}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{tr('تاریخ')}</TableHead>
                    <TableHead>{tr('نوع')}</TableHead>
                    <TableHead numeric>{tr('مبلغ')}</TableHead>
                    <TableHead>{tr('توضیح')}</TableHead>
                    {canManage && <TableActionsHead />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {person.lines.map((l) => (
                    <TableRow key={l.id}>
                      <TableDateCell>{l.entryDate}</TableDateCell>
                      <TableCell><Badge variant={KIND_VARIANT[l.kind]}>{tr(MEMBER_ACCOUNT_LABELS[l.kind])}</Badge></TableCell>
                      <TableNumericCell>
                        <span className={debtSign(l.kind) === -1 ? 'text-emerald-700 dark:text-emerald-500' : undefined}>
                          {debtSign(l.kind) === -1 ? '−' : debtSign(l.kind) === 1 ? '+' : ''}
                          <Money amount={l.amount} code={l.currencyCode} />
                        </span>
                      </TableNumericCell>
                      <TableCell className="text-sm">
                        <span dir="auto">{[l.recurringTitle, l.projectTitle, l.note].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(' — ') || '—'}</span>
                        {Number(l.sharePct) < 100 && (
                          <span className="ms-2 text-xs text-muted-foreground">{tr('سهمِ عضو {pct}٪', { pct: String(Number(l.sharePct)) })}</span>
                        )}
                        {l.dueDate && <span className="ms-2 text-xs text-muted-foreground">{tr('موعد: {date}', { date: l.dueDate })}</span>}
                      </TableCell>
                      {canManage && (
                        <TableActionsCell>
                          <IconButton
                            variant="ghost"
                            className="size-8 text-muted-foreground hover:text-destructive"
                            label={tr('حذف')}
                            disabled={pending}
                            onClick={() => remove(l.id, l.kind)}
                          >
                            <Trash2 className="size-3.5" />
                          </IconButton>
                        </TableActionsCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ---- فرمِ ثبت ---- */}
      <Dialog open={form !== null} onOpenChange={(open) => { if (!open) setForm(null); }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
          {form && (
            <EntryForm
              key={`${form.userId ?? 'new'}-${form.kind}`}
              initial={form}
              people={people.filter((p) => p.active)}
              accounts={accounts.filter((a) => a.isActive)}
              currencies={currencies}
              today={today}
              action={action}
              error={state.error}
              onCancel={() => setForm(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </Section>
  );
}

function EntryForm({
  initial, people, accounts, currencies, today, action, error, onCancel,
}: {
  initial: { userId: number | null; kind: MemberAccountKind };
  people: MemberAccountRow[];
  accounts: Array<{ id: number; name: string; currencyId: number }>;
  currencies: Array<{ id: number; code: string; isDefault: boolean }>;
  today: string;
  action: (formData: FormData) => void;
  error?: string;
  onCancel: () => void;
}) {
  const tr = useT();
  const [kind, setKind] = useState<MemberAccountKind>(initial.kind);
  const [userId, setUserId] = useState<string>(initial.userId ? String(initial.userId) : '');
  const person = people.find((p) => String(p.userId) === userId) ?? null;
  const settles = debtSign(kind) === -1;
  const cash = kind === 'loan' || kind === 'gift' || kind === 'charge' || kind === 'repayment';
  // تسویه به ارزِ همان بدهی؛ وگرنه ارزِ پیش‌فرض.
  const defaultCurrency = (settles && person?.balances[0]?.currencyId) || currencies.find((c) => c.isDefault)?.id || currencies[0]?.id || '';
  const [currencyId, setCurrencyId] = useState<string>(String(defaultCurrency));
  useEffect(() => { setCurrencyId(String(defaultCurrency)); }, [defaultCurrency]);
  const balance = person?.balances.find((b) => String(b.currencyId) === currencyId) ?? null;

  return (
    <form action={action} className="grid gap-3">
      <DialogHeader>
        <DialogTitle>{tr('ثبت در حسابِ اعضا')}</DialogTitle>
        <DialogDescription>{tr(KIND_HINT[kind])}</DialogDescription>
      </DialogHeader>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="ma-kind">{tr('نوع')}</FieldLabel>
          <NativeSelect id="ma-kind" name="kind" containerClassName="w-full" value={kind} onChange={(e) => setKind(e.target.value as MemberAccountKind)}>
            {KINDS.map((k) => <NativeSelectOption key={k} value={k}>{tr(MEMBER_ACCOUNT_LABELS[k])}</NativeSelectOption>)}
          </NativeSelect>
        </Field>
        <Field>
          <FieldLabel htmlFor="ma-user">{tr('عضو')}</FieldLabel>
          <SearchableSelect id="ma-user" name="userId" containerClassName="w-full" value={userId} onValueChange={setUserId} required>
            <NativeSelectOption value="">{tr('— انتخابِ عضو —')}</NativeSelectOption>
            {people.map((p) => <NativeSelectOption key={p.userId} value={p.userId}>{p.name}</NativeSelectOption>)}
          </SearchableSelect>
        </Field>
      </div>

      {cash && (
        <Field>
          <FieldLabel htmlFor="ma-account">{kind === 'repayment' ? tr('به حسابِ') : tr('از حسابِ')}</FieldLabel>
          <SearchableSelect id="ma-account" name="accountId" containerClassName="w-full" required defaultValue="">
            <NativeSelectOption value="">{tr('— انتخابِ حساب —')}</NativeSelectOption>
            {accounts.map((a) => <NativeSelectOption key={a.id} value={a.id}>{a.name}</NativeSelectOption>)}
          </SearchableSelect>
        </Field>
      )}

      {kind === 'offset' && (
        <Field>
          <FieldLabel htmlFor="ma-project">{tr('از دستمزدِ پروژهٔ')}</FieldLabel>
          <SearchableSelect id="ma-project" name="projectId" containerClassName="w-full" required defaultValue="">
            <NativeSelectOption value="">{tr('— انتخابِ پروژه —')}</NativeSelectOption>
            {(person?.projects ?? []).map((p) => <NativeSelectOption key={p.id} value={p.id}>{p.title}</NativeSelectOption>)}
          </SearchableSelect>
        </Field>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <Field>
          <FieldLabel htmlFor="ma-amount">{kind === 'charge' ? tr('مبلغِ کل') : tr('مبلغ')}</FieldLabel>
          <Input id="ma-amount" name="amount" inputMode="decimal" className="num" required />
        </Field>
        <Field>
          <FieldLabel htmlFor="ma-cur">{tr('ارز')}</FieldLabel>
          <NativeSelect id="ma-cur" name="currencyId" containerClassName="w-full" value={currencyId} onChange={(e) => setCurrencyId(e.target.value)}>
            {currencies.map((c) => <NativeSelectOption key={c.id} value={c.id}>{c.code}</NativeSelectOption>)}
          </NativeSelect>
        </Field>
        <Field>
          <FieldLabel htmlFor="ma-date">{tr('تاریخ')}</FieldLabel>
          <DatePicker id="ma-date" name="entryDate" defaultValue={today} required />
        </Field>
      </div>

      {settles && person && (
        <p className="text-xs text-muted-foreground">
          {balance
            ? <>{tr('ماندهٔ بدهیِ او به این ارز')}: <Money amount={balance.amount} code={balance.currencyCode} /></>
            : tr('به این ارز بدهی‌ای ندارد.')}
        </p>
      )}

      {kind === 'loan' && (
        <Field>
          <FieldLabel htmlFor="ma-due">{tr('موعدِ برگشت (اختیاری)')}</FieldLabel>
          <DatePicker id="ma-due" name="dueDate" defaultValue="" />
        </Field>
      )}

      {kind === 'charge' && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor="ma-vendor">{tr('پرداخت به')}</FieldLabel>
            <Input id="ma-vendor" name="vendorLabel" placeholder={tr('مثلاً Google Cloud')} />
          </Field>
          <Field>
            <FieldLabel htmlFor="ma-share">{tr('سهمِ عضو (٪)')}</FieldLabel>
            <Input id="ma-share" name="sharePct" inputMode="decimal" className="num" defaultValue="100" />
          </Field>
        </div>
      )}

      {kind === 'offset' && (
        <Field>
          <FieldLabel htmlFor="ma-counted">{tr('معادل در ارزِ قراردادِ پروژه (اختیاری)')}</FieldLabel>
          <Input id="ma-counted" name="counted" inputMode="decimal" className="num" />
          <FieldDescription>{tr('اگر ارزِ پروژه فرق دارد و نرخِ روز را نمی‌خواهید، مبلغِ معادل را بنویسید.')}</FieldDescription>
        </Field>
      )}

      <Field>
        <FieldLabel htmlFor="ma-note">{tr('یادداشت')}</FieldLabel>
        <Textarea id="ma-note" name="note" rows={2} placeholder={kind === 'gift' ? tr('مثلاً کادوی عروسی') : undefined} />
      </Field>

      {error && (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>{tr('انصراف')}</Button>
        <Submit label={tr('ثبت')} />
      </DialogFooter>
    </form>
  );
}
