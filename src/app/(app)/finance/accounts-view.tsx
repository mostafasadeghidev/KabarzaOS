'use client';

import { UserName } from '@/components/user-avatar';
import { useActionState, useEffect, useState, useTransition } from 'react';
import { useFormStatus } from 'react-dom';
import { Check, Copy, Pencil, Plus, Trash2, TriangleAlert } from 'lucide-react';
import { groupBy4 } from '@/domain/finance/bank';
import {
  deleteAccountAction, saveAccountAction, type PayoutState,
} from './_form/payout-actions';
import { format } from '@/domain/money/money';
import type { AccountOption as AccountRow } from './ledger-view';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { IconButton } from '@/components/ui/icon-button';
import { Input } from '@/components/ui/input';
import { Field, FieldDescription, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Table, TableActionsCell, TableActionsHead, TableBody, TableCell, TableHead, TableHeader, TableNumericCell, TableRow } from '@/components/ui/table';
import { useActionToast, useToast } from '@/components/ui/toast';
import { useT } from '@/i18n/client';
import { useConfirm } from '@/components/ui/confirm';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { SectionHeader } from '@/components/page-shell';

// همان شکلِ `listAccounts` — یک تعریف برای هر دو تب.
export type { AccountOption as AccountRow } from './ledger-view';

export interface AccountFormOptions {
  currencies: Array<{ id: number; code: string; isDefault: boolean }>;
  offices: Array<{ id: number; name: string }>;
  people: Array<{ id: number; name: string }>;
  /** حسابدارانِ تخصیص‌یافته به هر حساب. */
  accountantsByAccount: Record<number, number[]>;
}


function Save() {
  const { pending } = useFormStatus();
  const tr = useT();
  return <Button type="submit" disabled={pending}>{pending ? <><Spinner />{tr('در حالِ ذخیره…')}</> : tr('ذخیره')}</Button>;
}

/**
 * حساب‌های بانکی — `Accounts_Page`.
 *
 * ⚠️ «حسابدارانِ اختصاصی» صرفاً یک برچسب نیست: کسی که فقط مجوزِ **دیدنِ** مالی
 * دارد، تنها حساب‌هایی را می‌بیند که اینجا به او تخصیص یافته‌اند (R-ACC-02).
 */
export function AccountsView({
  accounts,
  options,
  canManage,
}: {
  accounts: AccountRow[];
  options: AccountFormOptions;
  canManage: boolean;
}) {
  const tr = useT();
  const t = useT();
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AccountRow | null>(null);
  /** حسابی که مودالِ «مشخصات» برایش باز است (۲.۱۸.۰). */
  const [viewing, setViewing] = useState<AccountRow | null>(null);
  const { show } = useToast();
  const [pending, startTransition] = useTransition();
  const [state, formAction] = useActionState<PayoutState, FormData>(saveAccountAction, {});
  useActionToast(state, { success: 'حساب ذخیره شد.' });

  useEffect(() => {
    if (state.ok) { setOpen(false); setEditing(null); }
  }, [state]);

  /**
   * آنچه پس از خطا در فرم می‌ماند — فقط تا وقتی همین پنجره باز است؛ باز کردنِ
   * دوباره (حسابِ دیگر یا تازه) از دادهٔ ذخیره‌شده شروع می‌کند.
   */
  const [kept, setKept] = useState<Record<string, string> | null>(null);
  useEffect(() => {
    if (state.error && state.values) setKept(state.values);
  }, [state]);
  const keep = (name: string, fallback: string) => kept?.[name] ?? fallback;
  const startEditing = (a: AccountRow | null) => { setKept(null); setEditing(a); setOpen(true); };

  const assigned = new Set(editing ? (options.accountantsByAccount[editing.id] ?? []) : []);

  return (
    <div className="grid gap-4">
      <SectionHeader
        title={t("حساب‌های بانکی")}
        actions={canManage ? (
          <Button size="sm" onClick={() => startEditing(null)}>
            <Plus className="size-4" />
            {tr("افزودن حساب")}
          </Button>
        ) : undefined}
      />

      {/* پورتِ اخطارِ «ابتدا ارز تعریف کنید» — پیش از این فقط هنگامِ ذخیره خطا می‌داد. */}
      {options.currencies.length === 0 && (
        <Alert variant="warning">
          <TriangleAlert />
          <AlertDescription>
            {tr("ابتدا در تنظیمات یک ارز تعریف کنید؛ حساب بدونِ ارز ساخته نمی‌شود.")}
          </AlertDescription>
        </Alert>
      )}

      {accounts.length === 0 ? (
        <EmptyState title={t("حسابی تعریف نشده")} />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("نام")}</TableHead>
              <TableHead>{t("ارز")}</TableHead>
              <TableHead>{t("دفتر")}</TableHead>
              <TableHead numeric>{t("مانده اولیه")}</TableHead>
              <TableHead numeric>{t("مانده")}</TableHead>
              <TableHead>{t("وضعیت")}</TableHead>
              {canManage && <TableActionsHead />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {accounts.map((a) => (
              // ⚠️ کلِ ردیف مشخصاتِ حساب را باز می‌کند؛ دکمه‌های ویرایش/حذف کلیک را بالا نمی‌فرستند.
              <TableRow key={a.id} className="cursor-pointer" onClick={() => setViewing(a)}>
                <TableCell>
                  {a.name}
                  {a.type === 'personal' && (
                    <Badge variant="outline" className="ms-2">{t("شخصی")}</Badge>
                  )}
                </TableCell>
                <TableCell className="num">{a.currencyCode ?? '—'}</TableCell>
                <TableCell>{a.officeName ?? '—'}</TableCell>
                <TableNumericCell>{format(a.openingBalance)}</TableNumericCell>
                {/* ماندهٔ فعلی — پورتِ `balance_fmt`؛ پیش از این فقط ماندهٔ اولیه دیده می‌شد. */}
                <TableNumericCell className="font-medium">{format(a.balance)}</TableNumericCell>
                <TableCell>
                  {a.isActive ? null : <Badge variant="outline">{t("غیرفعال")}</Badge>}
                </TableCell>
                {canManage && (
                  <TableActionsCell onClick={(e) => e.stopPropagation()}>
                      <IconButton
                        variant="ghost"
                        className="size-8"
                        label={t("ویرایش")}
                        onClick={() => startEditing(a)}
                      >
                        <Pencil className="size-3.5" />
                      </IconButton>
                      <IconButton
                        variant="ghost"
                        className="size-8 text-muted-foreground hover:text-destructive"
                        label={t("حذف")}
                        disabled={pending}
                        onClick={async () => {
                          if (!(await confirm({ title: t('این حساب حذف شود؟') }))) return;
                          startTransition(async () => {
                            const result = await deleteAccountAction(a.id);
                            if (result.error) show(t(result.error), 'error');
                            else show(t('حذف شد.'), 'success');
                          });
                        }}
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

      <AccountDetailsDialog
        account={viewing}
        onClose={() => setViewing(null)}
        onEdit={canManage ? (a) => { setViewing(null); startEditing(a); } : undefined}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? tr('ویرایش حساب') : tr('افزودن حساب')}</DialogTitle>
            <DialogDescription>
              {tr("«مانده اولیه» نقطهٔ شروعِ محاسبهٔ مانده است و در دفتر ردیف نمی‌سازد.")}
            </DialogDescription>
          </DialogHeader>

          <form key={editing?.id ?? 'new'} action={formAction} className="grid gap-3">
            {editing && <input type="hidden" name="id" value={editing.id} />}

            <div className="grid gap-3 sm:grid-cols-3">
              <Field className="sm:col-span-2">
                <FieldLabel htmlFor="a-name">{t("نام حساب")}</FieldLabel>
                <Input id="a-name" name="name" defaultValue={keep('name', editing?.name ?? '')} required />
              </Field>
              <Field>
                <FieldLabel htmlFor="a-cur">{t("ارز")}</FieldLabel>
                <NativeSelect
                  id="a-cur"
                  name="currencyId"
                  containerClassName="w-full"
                  defaultValue={keep('currencyId', String(editing?.currencyId ?? options.currencies.find((c) => c.isDefault)?.id ?? ''))}
                >
                  {options.currencies.map((c) => <NativeSelectOption key={c.id} value={c.id}>{c.code}</NativeSelectOption>)}
                </NativeSelect>
              </Field>
            </div>

            <div className="grid gap-3 sm:grid-cols-4">
              <Field>
                <FieldLabel htmlFor="a-type">{t("نوع")}</FieldLabel>
                <NativeSelect id="a-type" name="type" containerClassName="w-full" defaultValue={keep('type', editing?.type ?? 'business')}>
                  <NativeSelectOption value="business">{t("کاری")}</NativeSelectOption>
                  <NativeSelectOption value="personal">{t("شخصی")}</NativeSelectOption>
                </NativeSelect>
              </Field>
              <Field>
                <FieldLabel htmlFor="a-office">{t("دفتر")}</FieldLabel>
                <NativeSelect
                  id="a-office"
                  name="officeId"
                  containerClassName="w-full"
                  defaultValue={keep('officeId', editing?.officeId ? String(editing.officeId) : '')}
                >
                  <NativeSelectOption value="">{t("— هیچ‌کدام —")}</NativeSelectOption>
                  {options.offices.map((o) => <NativeSelectOption key={o.id} value={o.id}>{o.name}</NativeSelectOption>)}
                </NativeSelect>
              </Field>
              <Field>
                <FieldLabel htmlFor="a-opening">{t("مانده اولیه")}</FieldLabel>
                <Input
                  id="a-opening"
                  name="openingBalance"
                  inputMode="decimal"
                  className="num"
                  defaultValue={keep('openingBalance', editing?.openingBalance ?? '0')}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="a-sort">{t("ترتیب")}</FieldLabel>
                <Input id="a-sort" name="sortOrder" type="number" className="num" defaultValue={keep('sortOrder', String(editing?.sortOrder ?? 0))} />
              </Field>
            </div>

            {/* مشخصاتِ بانکی (۲.۱۸.۰) — همه اختیاری؛ IBAN و کارت با رقمِ کنترلی سنجیده می‌شوند. */}
            <FieldSet variant="box">
              <FieldLegend>{t("مشخصاتِ بانکی")}</FieldLegend>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="a-bank">{t("نامِ بانک")}</FieldLabel>
                  <Input id="a-bank" name="bankName" defaultValue={keep('bankName', editing?.bankName ?? '')} maxLength={120} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="a-holder">{t("صاحبِ حساب")}</FieldLabel>
                  <Input id="a-holder" name="holderName" defaultValue={keep('holderName', editing?.holderName ?? '')} maxLength={120} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="a-number">{t("شمارهٔ حساب")}</FieldLabel>
                  <Input id="a-number" name="accountNumber" dir="ltr" className="num" inputMode="numeric" defaultValue={keep('accountNumber', editing?.accountNumber ?? '')} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="a-card">{t("شمارهٔ کارت")}</FieldLabel>
                  <Input id="a-card" name="cardNumber" dir="ltr" className="num" inputMode="numeric" placeholder="0000 0000 0000 0000" defaultValue={keep('cardNumber', editing?.cardNumber ? groupBy4(editing.cardNumber) : '')} />
                </Field>
                <Field className="sm:col-span-2">
                  <FieldLabel htmlFor="a-iban">{t("شمارهٔ بین‌المللیِ حساب (IBAN / شبا)")}</FieldLabel>
                  <Input id="a-iban" name="iban" dir="ltr" className="num uppercase" placeholder="IR00 0000 0000 0000 0000 0000 00" defaultValue={keep('iban', editing?.iban ? groupBy4(editing.iban) : '')} />
                </Field>
              </div>
            </FieldSet>

            <Field>
              <FieldLabel htmlFor="a-note">{t("یادداشت")}</FieldLabel>
              {/* ⚠️ پیش از این یادداشت و ترتیب در ویرایش پر نمی‌شدند و با هر ذخیره پاک می‌شدند. */}
              <Input id="a-note" name="note" defaultValue={keep('note', editing?.note ?? '')} />
            </Field>

            <FieldSet variant="box">
              <FieldLegend>{t("حسابدارانِ این حساب")}</FieldLegend>
              <FieldDescription>
                {tr("کسی که فقط مجوزِ دیدنِ مالی دارد، **تنها** حساب‌هایی را می‌بیند که اینجا به او تخصیص یافته‌اند.")}
              </FieldDescription>
              <div className="grid max-h-40 gap-1 overflow-y-auto">
                {options.people.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      name="accountantIds"
                      value={String(p.id)}
                      defaultChecked={assigned.has(p.id)}
                    />
                    <UserName userId={p.id} name={p.name} />
                  </label>
                ))}
              </div>
            </FieldSet>

            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  name="isActive"
                  defaultChecked={editing?.isActive ?? true}
                />
                {tr("فعال")}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox name="scope" value="private" defaultChecked={editing?.scope === 'private'} />
                {tr("حسابِ خصوصی (فقط با دسترسیِ خصوصی دیده می‌شود)")}
              </label>
            </div>


            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>{t("انصراف")}</Button>
              <Save />
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** یک خطِ مشخصات با دکمهٔ کپی — شماره‌ها چپ‌به‌راست و گروه‌بندی‌شده. */
function DetailRow({ label, value, copy, mono = false }: { label: string; value: string; copy?: string; mono?: boolean }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center justify-between gap-3 border-b py-2 last:border-b-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="flex min-w-0 items-center gap-1.5">
        <span dir={mono ? 'ltr' : undefined} className={mono ? 'num truncate font-mono text-sm' : 'truncate text-sm'}>{value || '—'}</span>
        {value && copy !== undefined && (
          <IconButton
            variant="ghost" className="size-7" label={copied ? t('کپی شد') : t('کپی')}
            onClick={async () => {
              try { await navigator.clipboard.writeText(copy); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* بی‌دسترسی به کلیپ‌بورد */ }
            }}
          >
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          </IconButton>
        )}
      </span>
    </div>
  );
}

/**
 * مشخصاتِ حساب (۲.۱۸.۰) — با کلیک روی ردیف: بانک، صاحبِ حساب، شماره‌ها با دکمهٔ
 * کپی (بی‌فاصله، همان‌که در فرمِ بانک چسبانده می‌شود)، ارز، دفتر و مانده.
 */
function AccountDetailsDialog({ account, onClose, onEdit }: {
  account: AccountRow | null;
  onClose: () => void;
  onEdit?: (a: AccountRow) => void;
}) {
  const t = useT();
  const a = account;
  return (
    <Dialog open={a !== null} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md" dismissable>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {a?.name}
            {a?.type === 'personal' && <Badge variant="outline">{t("شخصی")}</Badge>}
            {a && !a.isActive && <Badge variant="outline">{t("غیرفعال")}</Badge>}
          </DialogTitle>
          <DialogDescription>{t("مشخصاتِ حساب")}</DialogDescription>
        </DialogHeader>
        {a && (
          <div className="grid">
            <DetailRow label={t("نامِ بانک")} value={a.bankName ?? ''} />
            <DetailRow label={t("صاحبِ حساب")} value={a.holderName ?? ''} copy={a.holderName ?? ''} />
            <DetailRow label={t("شمارهٔ حساب")} value={a.accountNumber ?? ''} copy={a.accountNumber ?? ''} mono />
            <DetailRow label={t("شمارهٔ کارت")} value={groupBy4(a.cardNumber ?? '')} copy={a.cardNumber ?? ''} mono />
            <DetailRow label="IBAN" value={groupBy4(a.iban ?? '')} copy={a.iban ?? ''} mono />
            <DetailRow label={t("ارز")} value={a.currencyCode ?? ''} mono />
            <DetailRow label={t("دفتر")} value={a.officeName ?? ''} />
            <DetailRow label={t("مانده")} value={`${format(a.balance)}${a.currencyCode ? ` ${a.currencyCode}` : ''}`} mono />
            {a.note && <DetailRow label={t("یادداشت")} value={a.note} />}
          </div>
        )}
        <DialogFooter>
          {onEdit && a && (
            <Button type="button" variant="outline" onClick={() => onEdit(a)}>
              <Pencil className="size-3.5" />
              {t("ویرایش")}
            </Button>
          )}
          <Button type="button" onClick={onClose}>{t("بستن")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
