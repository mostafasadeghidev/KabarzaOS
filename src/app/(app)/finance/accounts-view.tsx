'use client';

import { useActionState, useEffect, useState, useTransition } from 'react';
import { useFormStatus } from 'react-dom';
import { Plus, Trash2 } from 'lucide-react';
import {
  deleteAccountAction, saveAccountAction, type PayoutState,
} from './_form/payout-actions';
import { format } from '@/domain/money/money';
import type { AccountOption as AccountRow } from './ledger-view';
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

// همان شکلِ `listAccounts` — یک تعریف برای هر دو تب.
export type { AccountOption as AccountRow } from './ledger-view';

export interface AccountFormOptions {
  currencies: Array<{ id: number; code: string; isDefault: boolean }>;
  offices: Array<{ id: number; name: string }>;
  people: Array<{ id: number; name: string }>;
  /** حسابدارانِ تخصیص‌یافته به هر حساب. */
  accountantsByAccount: Record<number, number[]>;
}

const field = 'h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50';

function Save() {
  const { pending } = useFormStatus();
  return <Button type="submit" disabled={pending}>{pending ? 'در حالِ ذخیره…' : 'ذخیره'}</Button>;
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
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AccountRow | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [state, formAction] = useActionState<PayoutState, FormData>(saveAccountAction, {});

  useEffect(() => {
    if (state.ok) { setOpen(false); setEditing(null); setNotice(null); }
    else if (state.error) setNotice(state.error);
  }, [state.ok, state.error]);

  const assigned = new Set(editing ? (options.accountantsByAccount[editing.id] ?? []) : []);

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">{t("حساب‌های بانکی")}</h2>
        {canManage && (
          <Button size="sm" onClick={() => { setEditing(null); setOpen(true); setNotice(null); }}>
            <Plus className="size-4" />
            {tr("افزودن حساب")}
          </Button>
        )}
      </div>

      {notice && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{notice}</p>
      )}

      {accounts.length === 0 ? (
        <EmptyState title={t("حسابی تعریف نشده")} />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("نام")}</TableHead>
                <TableHead>{t("ارز")}</TableHead>
                <TableHead>{t("دفتر")}</TableHead>
                <TableHead>{t("مانده اولیه")}</TableHead>
                <TableHead>{t("وضعیت")}</TableHead>
                {canManage && <TableHead />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>
                    {a.name}
                    {a.type === 'personal' && (
                      <Badge variant="outline" className="ms-2">{t("شخصی")}</Badge>
                    )}
                  </TableCell>
                  <TableCell className="num">{a.currencyCode ?? '—'}</TableCell>
                  <TableCell>{a.officeName ?? '—'}</TableCell>
                  <TableNumericCell>{format(a.openingBalance)}</TableNumericCell>
                  <TableCell>
                    {a.isActive ? null : <Badge variant="outline">{t("غیرفعال")}</Badge>}
                  </TableCell>
                  {canManage && (
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => { setEditing(a); setOpen(true); setNotice(null); }}
                        >
                          {tr("ویرایش")}
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-8 text-muted-foreground hover:text-destructive"
                          aria-label={t("حذف")}
                          disabled={pending}
                          onClick={() =>
                            startTransition(async () => {
                              const result = await deleteAccountAction(a.id);
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? 'ویرایش حساب' : 'افزودن حساب'}</DialogTitle>
            <DialogDescription>
              {tr("«مانده اولیه» نقطهٔ شروعِ محاسبهٔ مانده است و در دفتر ردیف نمی‌سازد.")}
            </DialogDescription>
          </DialogHeader>

          <form key={editing?.id ?? 'new'} action={formAction} className="grid gap-3">
            {editing && <input type="hidden" name="id" value={editing.id} />}

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="grid gap-1.5 sm:col-span-2">
                <Label htmlFor="a-name">{t("نام حساب")}</Label>
                <Input id="a-name" name="name" defaultValue={editing?.name ?? ''} required />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="a-cur">{t("ارز")}</Label>
                <select
                  id="a-cur"
                  name="currencyId"
                  className={field}
                  defaultValue={String(editing?.currencyId ?? options.currencies.find((c) => c.isDefault)?.id ?? '')}
                >
                  {options.currencies.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}
                </select>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-4">
              <div className="grid gap-1.5">
                <Label htmlFor="a-type">{t("نوع")}</Label>
                <select id="a-type" name="type" className={field} defaultValue={editing?.type ?? 'business'}>
                  <option value="business">{t("کاری")}</option>
                  <option value="personal">{t("شخصی")}</option>
                </select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="a-office">{t("دفتر")}</Label>
                <select
                  id="a-office"
                  name="officeId"
                  className={field}
                  defaultValue={editing?.officeId ? String(editing.officeId) : ''}
                >
                  <option value="">{t("— هیچ‌کدام —")}</option>
                  {options.offices.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="a-opening">{t("مانده اولیه")}</Label>
                <Input
                  id="a-opening"
                  name="openingBalance"
                  inputMode="decimal"
                  className="num"
                  defaultValue={editing?.openingBalance ?? '0'}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="a-sort">{t("ترتیب")}</Label>
                <Input id="a-sort" name="sortOrder" type="number" className="num" defaultValue={0} />
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="a-note">{t("یادداشت")}</Label>
              <Input id="a-note" name="note" />
            </div>

            <fieldset className="grid gap-1.5 rounded-md border p-3">
              <legend className="px-1 text-sm font-medium">{t("حسابدارانِ این حساب")}</legend>
              <p className="text-xs text-muted-foreground">
                {tr("کسی که فقط مجوزِ دیدنِ مالی دارد، **تنها** حساب‌هایی را می‌بیند که اینجا به او تخصیص یافته‌اند.")}
              </p>
              <div className="grid max-h-40 gap-1 overflow-y-auto">
                {options.people.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="accountantIds"
                      value={p.id}
                      defaultChecked={assigned.has(p.id)}
                      className="size-4 accent-primary"
                    />
                    {p.name}
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="isActive"
                  defaultChecked={editing?.isActive ?? true}
                  className="size-4 accent-primary"
                />
                {tr("فعال")}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="scope" value="private" className="size-4 accent-primary" />
                {tr("حسابِ خصوصی (فقط با دسترسیِ خصوصی دیده می‌شود)")}
              </label>
            </div>

            {state.error && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {tr(state.error)}
              </p>
            )}

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
