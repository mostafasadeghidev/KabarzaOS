'use client';

import Link from 'next/link';
import { useActionState, useState, useTransition } from 'react';
import { useFormStatus } from 'react-dom';
import { Check, Clock, Package, Pencil, TextCursorInput, Trash2, X } from 'lucide-react';
import { UserName, avatarFor } from '@/components/user-avatar';
import {
  addUnitAction, cancelRequestAction, deleteUnitAction, renameUnitAction,
  requestUnitAction, setUnitAmountAction, setUnitStatusAction, type MoneyState,
} from './_form/money-actions';
import type { UnitRow } from './my-money-tab';
import { format } from '@/domain/money/money';
import { UNIT_STATUS_LABELS } from '@/domain/finance/member-money';
import { ENTRY_NAME_MAX } from '@/domain/projects/unit-entry-name';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Input } from '@/components/ui/input';
import { Field, FieldLabel } from '@/components/ui/field';
import {
  Table, TableActionsCell, TableActionsHead, TableBody, TableCell, TableHead, TableHeader, TableNumericCell, TableRow,
} from '@/components/ui/table';
import { useActionToast } from '@/components/ui/toast';
import { useT } from '@/i18n/client';
import { NativeSelectOption } from '@/components/ui/native-select';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { DatePicker } from '@/components/ui/date-picker';
import { NativeSelect } from '@/components/ui/native-select';
import { ProjectStatus } from '../project-status';
import { Section } from '@/components/page-shell';
import { IconButton } from '@/components/ui/icon-button';

/** دادهٔ لازمِ بخشِ کارکردها — زیرمجموعهٔ دادهٔ «پولِ من». */
export interface UnitSectionData {
  projectId: number;
  seesAll: boolean;
  asMember: boolean;
  isFrozen: boolean;
  unitManualAmount: boolean;
  units: UnitRow[];
  myUnpaidUnits: string;
  members: Array<{ id: number; name: string }>;
  today: string;
  /** وضعیت‌های کار — همان وضعیت‌های پروژه (۲.۲۲.۰). */
  statuses: Array<{ id: number; name: string; group: string | null; color: string | null }>;
}

/** دقیقه به «ساعت:دقیقه». */
function hoursLabel(minutes: number): string {
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
}

function Submit({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  const tr = useT();
  return <Button type="submit" size="sm" disabled={pending}>{pending ? <><Spinner />{tr('صبر کنید…')}</> : children}</Button>;
}

/**
 * کارکردهای پروژهٔ تعدادی (۲.۲۱.۰) — در تبِ «اطلاعات» (پیش از این در تبِ مالی بود).
 *
 * هر ردیف یک **نامِ یکتا** داخلِ پروژه دارد (مثلاً «CAT»)، می‌تواند ساعتِ کاری بگیرد
 * (در صفحهٔ «ساعت کاری» با برچسبِ «پروژه - نام») و مبلغ و وضعیتِ پرداخت دارد.
 *
 * ⚠️ مدیرِ سراسری همهٔ ردیف‌ها را می‌بیند، عضو فقط ردیف‌های خودش را — مبلغ و
 * ساعتِ کارکرد حقوقِ عضو است.
 */
export function UnitEntriesSection({ data }: { data: UnitSectionData }) {
  const t = useT();
  const [unitState, addUnit] = useActionState(addUnitAction, {} as MoneyState);
  useActionToast(unitState);
  const [pending, startTransition] = useTransition();
  const [rowError, setRowError] = useState<string | null>(null);
  /** ردیفی که مبلغش در حالِ ویرایش است (۲.۲۰.۰). */
  const [editing, setEditing] = useState<{ id: number; value: string } | null>(null);
  /** ردیفی که نامش در حالِ ویرایش است (۲.۲۱.۰). */
  const [renaming, setRenaming] = useState<{ id: number; value: string } | null>(null);
  /** فقط مسئولِ پروژه و فقط روی پروژه‌ای که مبلغِ دستی را روشن دارد. */
  const manualAmount = data.unitManualAmount && data.seesAll;

  const run = (fn: () => Promise<MoneyState>) =>
    startTransition(async () => setRowError((await fn()).error ?? null));

  return (
    <Section
      icon={<Package />}
      title={t("کارکردها")}
      description={manualAmount
        ? t("تعدادِ کارِ هر تاریخ را ثبت کنید. مبلغ را می‌توانید خودتان بزنید؛ اگر خالی بماند، تعداد × نرخِ توافقیِ عضو حساب می‌شود.")
        : t("تعدادِ کارِ هر تاریخ را ثبت کنید؛ مبلغ = تعداد × نرخِ هر واحدِ شما (خودکار) و حسابدار هنگامِ پرداخت می‌تواند اصلاحش کند.")}
    >
      {!data.isFrozen && (
        <form action={addUnit} className="flex flex-wrap items-end gap-2 rounded-xl border bg-card p-3">
          <input type="hidden" name="projectId" value={data.projectId} />

          {/* مدیر برای هر عضوی ثبت می‌کند؛ عضو فقط برای خودش. */}
          {data.seesAll && (
            <Field>
              <FieldLabel htmlFor="u-user">{t("عضو")}</FieldLabel>
              <SearchableSelect id="u-user" name="userId" containerClassName="w-44" required renderMedia={avatarFor(data.members)}>
                {data.members.map((m) => <NativeSelectOption key={m.id} value={m.id}>{m.name}</NativeSelectOption>)}
              </SearchableSelect>
            </Field>
          )}

          {/* نامِ یکتا (۲.۲۱.۰) — در ساعت‌ها و جستجو به شکلِ «پروژه - نام» دیده می‌شود. */}
          <Field>
            <FieldLabel htmlFor="u-name">{t("نام")}</FieldLabel>
            <Input id="u-name" name="name" maxLength={ENTRY_NAME_MAX} className="w-40" placeholder={t("مثلاً CAT")} />
          </Field>
          {/* وضعیتِ کار (۲.۲۲.۰) — پیش‌فرض «شروع نشده»؛ روی وضعیتِ پروژه اثری ندارد. */}
          {data.statuses.length > 0 && (
            <Field>
              <FieldLabel htmlFor="u-status">{t("وضعیت")}</FieldLabel>
              <NativeSelect
                id="u-status" name="workStatusTagId" containerClassName="w-40"
                defaultValue={String(data.statuses.find((s) => s.group === 'not_started')?.id ?? '')}
              >
                {data.statuses.map((s) => <NativeSelectOption key={s.id} value={s.id}>{s.name}</NativeSelectOption>)}
              </NativeSelect>
            </Field>
          )}
          <Field>
            <FieldLabel htmlFor="u-date">{t("تاریخ")}</FieldLabel>
            <DatePicker id="u-date" name="entryDate" className="w-40" defaultValue={data.today} />
          </Field>
          <Field>
            <FieldLabel htmlFor="u-qty">{t("تعداد")}</FieldLabel>
            <Input id="u-qty" name="quantity" type="number" min={1} className="num w-24" required />
          </Field>
          {/* مبلغِ دستی — فقط مسئولِ پروژه؛ خالی = از نرخِ توافقی پیروی کن. */}
          {manualAmount && (
            <Field>
              <FieldLabel htmlFor="u-amount">{t("مبلغ")}</FieldLabel>
              <Input
                id="u-amount" name="amount" inputMode="decimal" dir="ltr"
                className="num w-32" placeholder={t("طبق نرخِ توافقی")}
              />
            </Field>
          )}
          <Field className="flex-1">
            <FieldLabel htmlFor="u-note">{t("توضیح")}</FieldLabel>
            <Input id="u-note" name="note" placeholder={t("اختیاری")} />
          </Field>
          <Submit>{t("ثبت")}</Submit>
        </form>
      )}

      {data.units.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("هنوز ردیفی ثبت نشده.")}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("نام")}</TableHead>
              <TableHead numeric>{t("تاریخ")}</TableHead>
              {data.seesAll && <TableHead>{t("عضو")}</TableHead>}
              <TableHead numeric>{t("تعداد")}</TableHead>
              <TableHead numeric>{t("ساعت")}</TableHead>
              <TableHead>{t("وضعیتِ کار")}</TableHead>
              <TableHead numeric>{t("مبلغ")}</TableHead>
              <TableHead>{t("پرداخت")}</TableHead>
              <TableActionsHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.units.map((u) => {
              const paid = u.status === 'paid';
              const canRename = !data.isFrozen && (data.seesAll || u.isMine);
              return (
                // id برای پیوندِ مستقیمِ جستجو و پالتِ فرمان: /projects/۵۷#unit-۱۲
                <TableRow key={u.id} id={`unit-${u.id}`} className="scroll-mt-24 target:bg-primary/5">
                  <TableCell className="font-medium">
                    {renaming?.id === u.id ? (
                      <span className="inline-flex items-center gap-1">
                        <Input
                          autoFocus maxLength={ENTRY_NAME_MAX} className="h-8 w-36" value={renaming.value}
                          placeholder={t("بدون نام")}
                          onChange={(e) => setRenaming({ id: u.id, value: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') setRenaming(null);
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              run(async () => {
                                const result = await renameUnitAction(u.id, data.projectId, renaming.value);
                                if (!result.error) setRenaming(null);
                                return result;
                              });
                            }
                          }}
                        />
                        <IconButton
                          variant="ghost" className="size-8" label={t("ذخیره")} disabled={pending}
                          onClick={() => run(async () => {
                            const result = await renameUnitAction(u.id, data.projectId, renaming.value);
                            if (!result.error) setRenaming(null);
                            return result;
                          })}
                        >
                          <Check className="size-3.5" />
                        </IconButton>
                        <IconButton variant="ghost" className="size-8" label={t("انصراف")} onClick={() => setRenaming(null)}>
                          <X className="size-3.5" />
                        </IconButton>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1">
                        {u.name || <span className="text-muted-foreground">—</span>}
                        {canRename && (
                          <IconButton
                            variant="ghost" className="size-7 text-muted-foreground" label={t("ویرایشِ نام")}
                            onClick={() => setRenaming({ id: u.id, value: u.name })}
                          >
                            <TextCursorInput className="size-3.5" />
                          </IconButton>
                        )}
                      </span>
                    )}
                  </TableCell>
                  <TableNumericCell>{u.entryDate}</TableNumericCell>
                  {data.seesAll && <TableCell><UserName userId={u.userId} name={u.userName ?? `#${u.userId}`} /></TableCell>}
                  <TableNumericCell>{Number(u.quantity)}</TableNumericCell>
                  <TableNumericCell>{u.minutes > 0 ? hoursLabel(u.minutes) : '—'}</TableNumericCell>
                  <TableCell>
                    {/* وضعیتِ کار — مسئول یا صاحبِ ردیف عوضش می‌کند (۲.۲۲.۰). */}
                    {canRename && data.statuses.length > 0 ? (
                      <NativeSelect
                        aria-label={t("وضعیتِ کار")} containerClassName="w-36" className="h-8"
                        value={u.workStatusTagId === null ? '' : String(u.workStatusTagId)} disabled={pending}
                        onChange={(e) => {
                          const next = e.target.value === '' ? null : Number(e.target.value);
                          run(() => setUnitStatusAction(u.id, data.projectId, next));
                        }}
                      >
                        <NativeSelectOption value="">{t("— بدونِ وضعیت —")}</NativeSelectOption>
                        {data.statuses.map((s) => <NativeSelectOption key={s.id} value={s.id}>{s.name}</NativeSelectOption>)}
                      </NativeSelect>
                    ) : (
                      <ProjectStatus name={u.workStatusName} group={u.workStatusGroup} color={u.workStatusColor} />
                    )}
                  </TableCell>
                  <TableNumericCell>
                    {editing?.id === u.id ? (
                      /* ویرایشِ درجا — خالی = برگشت به نرخِ توافقی. */
                      <span className="inline-flex items-center gap-1">
                        <Input
                          autoFocus dir="ltr" inputMode="decimal" className="num h-8 w-28"
                          value={editing.value} placeholder={t("طبق نرخِ توافقی")}
                          onChange={(e) => setEditing({ id: u.id, value: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') setEditing(null);
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              run(async () => {
                                const result = await setUnitAmountAction(u.id, data.projectId, editing.value);
                                if (!result.error) setEditing(null);
                                return result;
                              });
                            }
                          }}
                        />
                        <IconButton
                          variant="ghost" className="size-8" label={t("ذخیره")} disabled={pending}
                          onClick={() => run(async () => {
                            const result = await setUnitAmountAction(u.id, data.projectId, editing.value);
                            if (!result.error) setEditing(null);
                            return result;
                          })}
                        >
                          <Check className="size-3.5" />
                        </IconButton>
                        <IconButton variant="ghost" className="size-8" label={t("انصراف")} onClick={() => setEditing(null)}>
                          <X className="size-3.5" />
                        </IconButton>
                      </span>
                    ) : (
                      <>{format(u.amount)} {u.currencyCode}</>
                    )}
                  </TableNumericCell>
                  <TableCell>
                    <Badge variant={paid ? 'success' : 'outline'}>
                      {t(UNIT_STATUS_LABELS[u.status] ?? u.status)}
                    </Badge>
                  </TableCell>
                  <TableActionsCell>
                    {/* ثبتِ ساعت روی ردیفِ خودم — انتخابگرِ «پروژه - نام» در صفحهٔ ساعت کاری. */}
                    {u.isMine && u.name !== '' && !data.isFrozen && (
                      <IconButton variant="ghost" className="size-8 text-muted-foreground" label={t("ثبتِ ساعت")} asChild>
                        <Link href="/hours"><Clock className="size-3.5" /></Link>
                      </IconButton>
                    )}
                    {/* ⚠️ ردیفِ پرداخت‌شده هیچ اقدامی ندارد — سندِ انجام‌شده است. */}
                    {!paid && !data.isFrozen && (
                      <>
                        {u.isMine && data.asMember && (
                          u.openRequest ? (
                            u.openRequest.status === 'pending' ? (
                              <Button
                                size="sm" variant="ghost" disabled={pending}
                                onClick={() => run(() => cancelRequestAction(u.openRequest!.id, data.projectId))}
                              >
                                {t("لغو درخواست")}
                              </Button>
                            ) : (
                              <Badge variant="secondary">{t("در انتظار پرداخت")}</Badge>
                            )
                          ) : (
                            <Button
                              size="sm" variant="outline" disabled={pending}
                              onClick={() => run(() => requestUnitAction(u.id, data.projectId))}
                            >
                              {t("درخواست پرداخت")}
                            </Button>
                          )
                        )}
                        {/* ویرایشِ مبلغ — فقط ردیفِ پرداخت‌نشده و بی‌درخواستِ باز. */}
                        {manualAmount && u.status === 'unpaid' && !u.openRequest && editing?.id !== u.id && (
                          <IconButton
                            variant="ghost" className="size-8 text-muted-foreground" label={t("ویرایشِ مبلغ")}
                            onClick={() => setEditing({ id: u.id, value: String(Number(u.amount)) })}
                          >
                            <Pencil className="size-3.5" />
                          </IconButton>
                        )}
                        {(data.seesAll || u.isMine) && (
                          <IconButton
                            variant="ghost"
                            className="size-8 text-muted-foreground hover:text-destructive"
                            label={t("حذف")}
                            disabled={pending}
                            onClick={() => run(() => deleteUnitAction(u.id, data.projectId))}
                          >
                            <Trash2 className="size-3.5" />
                          </IconButton>
                        )}
                      </>
                    )}
                  </TableActionsCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      {data.asMember && (
        <p className="flex flex-wrap gap-4 text-sm">
          <span><b>{t("جمعِ پرداخت‌نشده:")}</b> <span className="num">{format(data.myUnpaidUnits)}</span></span>
          {/* پورتِ جمعِ «پرداخت‌شده» ِ ردیف‌های تعدادی. */}
          <span><b>{t("جمعِ پرداخت‌شده:")}</b> <span className="num">{format(
            data.units.filter((u) => u.isMine && u.status === 'paid').reduce((sum, u) => sum + Number(u.amount), 0).toFixed(4),
          )}</span></span>
        </p>
      )}
      {rowError && <p className="text-xs text-destructive">{rowError}</p>}
    </Section>
  );
}
