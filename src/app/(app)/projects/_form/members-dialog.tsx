'use client';

import { UserName } from '@/components/user-avatar';
import { useActionState, useEffect, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Plus, X } from 'lucide-react';
import { setMembersAction } from './members-actions';
import type { MembersFormState } from './members-schema';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { IconButton } from '@/components/ui/icon-button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableActionsCell, TableActionsHead, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { useActionToast, useToast } from '@/components/ui/toast';
import { useT } from '@/i18n/client';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { SearchableSelect } from '@/components/ui/searchable-select';

export interface MemberRow {
  userId: number | null;
  userName?: string;
  roleTagId: number | null;
  agreedAmount: string;
  unitRate: string;
  currencyId: number | null;
  isFormer?: boolean;
  isOwed?: boolean;
}

export interface MembersFormData {
  projectId: number;
  isUnitBased: boolean;
  /** ارزِ پروژه — پیش‌فرضِ ردیفِ تازه. */
  projectCurrencyId: number | null;
  members: MemberRow[];
  team: Array<{ id: number; name: string }>;
  roles: Array<{ id: number; name: string }>;
  /** نقش‌های هر نفر؛ نبودنِ کلید یعنی نقشی ثبت نشده — آن‌وقت همهٔ نقش‌ها. */
  memberRoles?: Record<number, number[]>;
  currencies: Array<{ id: number; code: string; isDefault: boolean }>;
}


function SaveButton() {
  const { pending } = useFormStatus();
  const tr = useT();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? <><Spinner />{tr('در حالِ ذخیره…')}</> : tr('ذخیرهٔ اعضا')}
    </Button>
  );
}

/**
 * مدیریتِ اعضا — جدولِ تکرارشوندهٔ نسخهٔ قبلی (`member_row`) با همان ستون‌ها:
 * عضو · نقش · مبلغ توافقی · نرخِ هر واحد · ارز.
 *
 * ⚠️ ستونِ «مبلغ توافقی» و «نرخِ هر واحد» مثلِ نسخهٔ قبلی با نوعِ پروژه جابه‌جا
 * می‌شوند: پروژهٔ تعدادی نرخ می‌گیرد، بقیه مبلغِ توافقی.
 */
export function MembersDialog({ data }: { data: MembersFormData }) {
  const tr = useT();
  const t = useT();
  const { show } = useToast();
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState<MembersFormState, FormData>(setMembersAction, {});
  /**
   * ⚠️ شمارنده‌ها در پیام می‌مانند — «۲ افزوده، ۱ به‌روز، ۰ حذف» تنها راهی
   * است که کاربر می‌فهمد ویرایشش واقعاً چه کرد. دلایلِ نگه‌داشتن (طلبِ
   * تسویه‌نشده، عضوِ سابق) هم توستِ جداگانه می‌گیرند، چون هشدارند نه
   * موفقیت.
   */
  useActionToast(state, {
    success: state.summary
      ? tr('ذخیره شد — {added} افزوده، {updated} به‌روز، {removed} حذف.', {
        added: state.summary.added,
        updated: state.summary.updated,
        removed: state.summary.removed,
      })
      : tr('اعضا ذخیره شد.'),
  });

  /**
   * ⚠️ ذخیرهٔ موفق مودال را می‌بندد. پیش از این باز می‌ماند و کاربر
   * نمی‌دانست کارش گرفت یا نه — و با زدنِ دوبارهٔ «ذخیره» همان فهرست را
   * دوباره می‌فرستاد.
   */
  useEffect(() => {
    if (state.ok) setOpen(false);
  }, [state.ok]);

  useEffect(() => {
    if (state.keptOwed?.length) {
      show(tr('{names} حذف نشد چون روی این پروژه تسویه‌نشده دارد. اول تسویه کنید.', {
        names: state.keptOwed.join(tr('، ')),
      }), 'info');
    }
    if (state.keptFormer?.length) {
      show(tr('{names} عضوِ سابق است و سابقه‌اش روی پروژه نگه داشته می‌شود.', {
        names: state.keptFormer.join(tr('، ')),
      }), 'info');
    }
  }, [state, show, tr]);

  /**
   * ⚠️ ردیفِ تازه به **ارزِ پروژه**، نه ارزِ پیش‌فرضِ سامانه — همان قاعدهٔ
   * افزودنِ سریع از کارت (`addProjectMember`). پیش از این عضوی که روی پروژهٔ
   * ریالی اضافه می‌شد بی‌صدا قراردادِ یورویی می‌گرفت.
   */
  const defaultCurrency = data.projectCurrencyId
    ?? data.currencies.find((c) => c.isDefault)?.id ?? data.currencies[0]?.id ?? null;
  const blank = (): MemberRow => ({
    userId: null,
    roleTagId: null,
    agreedAmount: '0',
    unitRate: '0',
    currencyId: defaultCurrency,
  });

  const [rows, setRows] = useState<MemberRow[]>(
    data.members.length > 0 ? data.members : [blank()],
  );

  const patch = (i: number, next: Partial<MemberRow>) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...next } : r)));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">{t("مدیریتِ اعضا")}</Button>
      </DialogTrigger>

      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t("اعضای پروژه")}</DialogTitle>
          <DialogDescription>
            {data.isUnitBased
              ? tr('پروژهٔ تعدادی است: دستمزدِ هر عضو = نرخِ هر واحد × تعدادِ ثبت‌شده.')
              : tr('مبلغِ توافقیِ هر عضو برای این پروژه.')}
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="grid gap-4">
          <input type="hidden" name="projectId" value={data.projectId} />

          {/* جدولِ داخلِ دیالوگ: بی‌قاب، و ستون‌های اول و آخر هم‌لبهٔ متنِ دیالوگ. */}
          <Table
            frame={false}
            className="[&_td]:px-1.5 [&_td]:py-1.5 [&_td:first-child]:ps-0 [&_td:last-child]:pe-0 [&_th]:px-1.5 [&_th:first-child]:ps-0 [&_th:last-child]:pe-0"
          >
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>{t("عضو")}</TableHead>
                  <TableHead>{t("نقش")}</TableHead>
                  <TableHead>
                    {data.isUnitBased ? tr('نرخِ هر واحد') : tr('مبلغ توافقی')}
                  </TableHead>
                  <TableHead>{t("ارز")}</TableHead>
                  <TableActionsHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, i) => (
                  <TableRow key={i} className="hover:bg-transparent">
                    <TableCell>
                      {row.isFormer ? (
                        // عضوِ سابق دوباره انتخاب‌شدنی نیست، ولی ردیفش می‌ماند (R-PROJ-11).
                        <div className="flex items-center gap-2">
                          <UserName userId={row.userId} name={row.userName} size="sm" />
                          <Badge variant="secondary">{t("سابق")}</Badge>
                          <input type="hidden" name="memberUser" value={row.userId ?? ''} />
                        </div>
                      ) : (
                        <SearchableSelect
                          name="memberUser"
                          size="sm" containerClassName="w-full"
                          value={row.userId ?? ''}
                          onValueChange={(v) => patch(i, { userId: v ? Number(v) : null })}
                        >
                          <NativeSelectOption value="">—</NativeSelectOption>
                          {data.team.map((u) => (
                            <NativeSelectOption key={u.id} value={u.id}>{u.name}</NativeSelectOption>
                          ))}
                        </SearchableSelect>
                      )}
                      {row.isOwed && (
                        <span className="mt-0.5 block text-[11px] text-amber-700 dark:text-amber-500">
                          {tr("تسویه‌نشده — با حذف از فهرست هم ردیفش می‌ماند")}
                        </span>
                      )}
                    </TableCell>

                    <TableCell>
                      <NativeSelect
                        name="memberRole"
                        size="sm" containerClassName="w-full"
                        value={row.roleTagId ?? ''}
                        onChange={(e) => patch(i, { roleTagId: e.target.value ? Number(e.target.value) : null })}
                      >
                        <NativeSelectOption value="">{t("— نقشِ خودش —")}</NativeSelectOption>
                        {/*
                          ⚠️ فقط نقش‌های همین نفر (D#90) — مثلِ افزودنِ سریع و فرمِ ساخت؛
                          نقشِ فعلیِ ردیف همیشه می‌ماند تا ویرایش آن را بی‌صدا پاک نکند.
                          نفری که هیچ نقشی ندارد، همهٔ نقش‌ها را می‌بیند.
                        */}
                        {data.roles
                          .filter((r) => {
                            const own = row.userId !== null ? data.memberRoles?.[row.userId] : undefined;
                            return !own || own.length === 0 || own.includes(r.id) || r.id === row.roleTagId;
                          })
                          .map((r) => (
                            <NativeSelectOption key={r.id} value={r.id}>{r.name}</NativeSelectOption>
                          ))}
                      </NativeSelect>
                    </TableCell>

                    <TableCell>
                      {/* هر دو فیلد همیشه فرستاده می‌شوند تا آرایه‌ها هم‌طول بمانند. */}
                      <Input
                        className="num h-8"
                        inputMode="decimal"
                        name={data.isUnitBased ? 'memberUnitRate' : 'memberAmount'}
                        value={data.isUnitBased ? row.unitRate : row.agreedAmount}
                        onChange={(e) =>
                          patch(i, data.isUnitBased
                            ? { unitRate: e.target.value }
                            : { agreedAmount: e.target.value })
                        }
                      />
                      <input
                        type="hidden"
                        name={data.isUnitBased ? 'memberAmount' : 'memberUnitRate'}
                        value={data.isUnitBased ? row.agreedAmount : row.unitRate}
                      />
                    </TableCell>

                    <TableCell>
                      <NativeSelect
                        name="memberCurrency"
                        size="sm" containerClassName="w-full"
                        value={row.currencyId ?? ''}
                        onChange={(e) => patch(i, { currencyId: e.target.value ? Number(e.target.value) : null })}
                      >
                        {data.currencies.map((c) => (
                          <NativeSelectOption key={c.id} value={c.id}>{c.code}</NativeSelectOption>
                        ))}
                      </NativeSelect>
                    </TableCell>

                    <TableActionsCell>
                      <IconButton
                        type="button"
                        variant="ghost"
                        className="size-8 text-muted-foreground hover:text-destructive"
                        label={t("حذفِ ردیف")}
                        onClick={() => setRows((rs) => rs.filter((_, idx) => idx !== i))}
                      >
                        <X className="size-4" />
                      </IconButton>
                    </TableActionsCell>
                  </TableRow>
                ))}
              </TableBody>
          </Table>

          {state.rowErrors && (
            <ul className="text-xs text-destructive">
              {Object.entries(state.rowErrors).map(([i, message]) => (
                <li key={i}>{t("ردیفِ")} <span className="num">{Number(i) + 1}</span>: {tr(message)}</li>
              ))}
            </ul>
          )}

          <div>
            <Button type="button" variant="outline" size="sm" onClick={() => setRows((rs) => [...rs, blank()])}>
              <Plus className="size-4" />
              {tr("افزودن عضو")}
            </Button>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>{t("بستن")}</Button>
            <SaveButton />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
