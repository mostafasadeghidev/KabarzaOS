'use client';

import { useActionState, useState, useTransition } from 'react';
import { useFormStatus } from 'react-dom';
import { Package, Trash2 } from 'lucide-react';
import {
  addUnitAction, cancelRequestAction, deleteUnitAction, requestPaymentAction,
  requestUnitAction, type MoneyState,
} from './_form/money-actions';
import { format } from '@/domain/money/money';
import { REQUEST_STATUS_LABELS, UNIT_STATUS_LABELS } from '@/domain/finance/member-money';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableNumericCell, TableRow,
} from '@/components/ui/table';
import { useT } from '@/i18n/client';

export interface UnitRow {
  id: number;
  userId: number;
  userName: string | null;
  entryDate: string;
  quantity: string;
  amount: string;
  note: string;
  status: string;
  currencyCode: string | null;
  openRequest: { id: number; status: string } | null;
  isMine: boolean;
}

export interface RequestRow {
  id: number;
  amount: string;
  status: string;
  note: string;
  decisionNote: string;
  currencyCode: string | null;
  cancellable: boolean;
  /** رسیدِ ردیفِ دفترِ آینه — فقط پس از پرداخت پر است. */
  receiptIds: number[] | null;
}

export interface MyMoneyData {
  projectId: number;
  canManage: boolean;
  isFrozen: boolean;
  units: UnitRow[];
  myUnpaidUnits: string;
  requests: RequestRow[];
  remaining: string;
  available: string;
  outstanding: string;
  members: Array<{ id: number; name: string }>;
  today: string;
}

const selectClass =
  'h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none';

function Notice({ state }: { state: MoneyState }) {
  if (!state.error && !state.message) return null;
  return (
    <p className={`text-xs ${state.error ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-500'}`}>
      {state.error ?? state.message}
    </p>
  );
}

function Submit({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return <Button type="submit" size="sm" disabled={pending}>{pending ? 'صبر کنید…' : children}</Button>;
}

/**
 * «پولِ من» — کارکردِ تعدادی و درخواستِ پرداخت.
 *
 * ⚠️ این تب **مجوزِ مالی نمی‌خواهد**: پولِ خودِ عضو است و در نسخهٔ قبلی هم روی
 * داشبوردِ خودش دیده می‌شود. عضو فقط ردیف‌های خودش را می‌بیند؛ مدیر همه را.
 */
export function MyMoneyTab({ data }: { data: MyMoneyData }) {
  const tr = useT();
  const t = useT();
  const [unitState, addUnit] = useActionState(addUnitAction, {} as MoneyState);
  const [reqState, requestPayment] = useActionState(requestPaymentAction, {} as MoneyState);
  const [pending, startTransition] = useTransition();
  const [rowError, setRowError] = useState<string | null>(null);

  const run = (fn: () => Promise<MoneyState>) =>
    startTransition(async () => setRowError((await fn()).error ?? null));

  return (
    <div className="grid gap-5">
      <section className="grid gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          <Package className="size-4" />
          {tr("کارکردِ تعدادی")}
        </h3>
        <p className="text-xs text-muted-foreground">
          {tr("تعدادِ کارِ هر تاریخ را ثبت کنید؛ مبلغ = تعداد × نرخِ هر واحدِ شما (خودکار) و حسابدار هنگامِ پرداخت می‌تواند اصلاحش کند.")}
        </p>

        {!data.isFrozen && (
          <form action={addUnit} className="flex flex-wrap items-end gap-2 rounded-md border p-3">
            <input type="hidden" name="projectId" value={data.projectId} />

            {/* مدیر برای هر عضوی ثبت می‌کند؛ عضو فقط برای خودش. */}
            {data.canManage && (
              <div className="grid gap-1.5">
                <Label htmlFor="u-user">{t("عضو")}</Label>
                <select id="u-user" name="userId" className={`${selectClass} w-44`} required>
                  {data.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>
            )}

            <div className="grid gap-1.5">
              <Label htmlFor="u-date">{t("تاریخ")}</Label>
              <Input id="u-date" name="entryDate" type="date" className="num w-40" defaultValue={data.today} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="u-qty">{t("تعداد")}</Label>
              <Input id="u-qty" name="quantity" type="number" min={1} className="num w-24" required />
            </div>
            <div className="grid flex-1 gap-1.5">
              <Label htmlFor="u-note">{t("توضیح")}</Label>
              <Input id="u-note" name="note" placeholder={t("اختیاری")} />
            </div>
            <Submit>{t("ثبت")}</Submit>
            <Notice state={unitState} />
          </form>
        )}

        {data.units.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("هنوز ردیفی ثبت نشده.")}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("تاریخ")}</TableHead>
                {data.canManage && <TableHead>{t("عضو")}</TableHead>}
                <TableHead>{t("تعداد")}</TableHead>
                <TableHead>{t("مبلغ")}</TableHead>
                <TableHead>{t("وضعیت")}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.units.map((u) => {
                const paid = u.status === 'paid';
                return (
                  <TableRow key={u.id}>
                    <TableNumericCell>{u.entryDate}</TableNumericCell>
                    {data.canManage && <TableCell>{u.userName ?? `#${u.userId}`}</TableCell>}
                    <TableNumericCell>{Number(u.quantity)}</TableNumericCell>
                    <TableNumericCell>{format(u.amount)} {u.currencyCode}</TableNumericCell>
                    <TableCell>
                      <Badge variant={paid ? 'success' : 'outline'}>
                        {t(UNIT_STATUS_LABELS[u.status] ?? u.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-end">
                      {/* ⚠️ ردیفِ پرداخت‌شده هیچ اقدامی ندارد — سندِ انجام‌شده است. */}
                      {!paid && !data.isFrozen && (
                        <div className="flex justify-end gap-1">
                          {u.isMine && !data.canManage && (
                            u.openRequest ? (
                              u.openRequest.status === 'pending' ? (
                                <Button
                                  size="sm" variant="ghost" disabled={pending}
                                  onClick={() => run(() => cancelRequestAction(u.openRequest!.id, data.projectId))}
                                >
                                  {tr("لغو درخواست")}
                                </Button>
                              ) : (
                                <Badge variant="secondary">{t("در انتظار پرداخت")}</Badge>
                              )
                            ) : (
                              <Button
                                size="sm" variant="outline" disabled={pending}
                                onClick={() => run(() => requestUnitAction(u.id, data.projectId))}
                              >
                                {tr("درخواست پرداخت")}
                              </Button>
                            )
                          )}
                          {(data.canManage || u.isMine) && (
                            <button
                              type="button"
                              disabled={pending}
                              onClick={() => run(() => deleteUnitAction(u.id, data.projectId))}
                              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted"
                              aria-label={t("حذف")}
                            >
                              <Trash2 className="size-4" />
                            </button>
                          )}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}

        {!data.canManage && (
          <p className="text-sm">
            <b>{t("جمعِ پرداخت‌نشده:")}</b> <span className="num">{format(data.myUnpaidUnits)}</span>
          </p>
        )}
        {rowError && <p className="text-xs text-destructive">{rowError}</p>}
      </section>

      {/* ── درخواستِ پرداخت — فقط برای عضو ── */}
      {!data.canManage && (
        <section className="grid gap-2">
          <h3 className="text-sm font-semibold">{t("درخواستِ پرداخت")}</h3>

          <div className="flex flex-wrap gap-4 text-sm">
            <span>{t("ماندهٔ قرارداد:")} <b className="num">{format(data.remaining)}</b></span>
            <span>{t("درخواست‌های باز:")} <b className="num">{format(data.outstanding)}</b></span>
            <span>{t("قابلِ درخواست:")} <b className="num">{format(data.available)}</b></span>
          </div>

          {data.requests.length > 0 && (
            <ul className="grid gap-1">
              {data.requests.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm">
                  <b className="num">{format(r.amount)}</b>
                  <Badge variant={r.status === 'paid' ? 'success' : 'outline'}>
                    {t(REQUEST_STATUS_LABELS[r.status] ?? r.status)}
                  </Badge>
                  {/* رسیدِ پرداخت — پورتِ ستونِ «رسید» ِ نسخهٔ قبلی در پولِ من. */}
                  {r.status === 'paid' && (r.receiptIds?.length ?? 0) > 0 && (
                    <a
                      href={`/api/files/${r.receiptIds![0]}`}
                      target="_blank"
                      rel="noopener"
                      className="text-xs text-primary hover:underline"
                    >
                      {t('رسید')}
                    </a>
                  )}
                  {r.note && <span className="text-xs text-muted-foreground">{r.note}</span>}
                  {r.decisionNote && (
                    <span className="text-xs text-muted-foreground">· {r.decisionNote}</span>
                  )}
                  {/* ⚠️ فقط درخواستِ «در انتظار» لغو می‌شود؛ تأییدشده تصمیمِ حسابدار است. */}
                  {r.cancellable && (
                    <Button
                      size="sm" variant="ghost" className="ms-auto" disabled={pending}
                      onClick={() => run(() => cancelRequestAction(r.id, data.projectId))}
                    >
                      {tr("لغو")}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {Number(data.available) > 0 ? (
            <form action={requestPayment} className="flex flex-wrap items-end gap-2 rounded-md border p-3">
              <input type="hidden" name="projectId" value={data.projectId} />
              <div className="grid gap-1.5">
                <Label htmlFor="r-amount">{t("مبلغ")}</Label>
                <Input
                  id="r-amount" name="amount" inputMode="decimal" className="num w-36" required
                  placeholder={format(data.available)}
                />
              </div>
              <div className="grid flex-1 gap-1.5">
                <Label htmlFor="r-note">{t("توضیح")}</Label>
                <Input id="r-note" name="note" placeholder={t("اختیاری")} />
              </div>
              <Submit>{t("ثبتِ درخواست")}</Submit>
              <Notice state={reqState} />
            </form>
          ) : (
            <p className="text-xs text-muted-foreground">
              {tr("مبلغِ قابلِ درخواستی ندارید — یا مانده صفر است یا درخواستِ بازی دارید.")}
            </p>
          )}
        </section>
      )}
    </div>
  );
}
