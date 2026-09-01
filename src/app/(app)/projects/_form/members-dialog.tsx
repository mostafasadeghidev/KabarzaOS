'use client';

import { useActionState, useEffect, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Plus, X } from 'lucide-react';
import { setMembersAction } from './members-actions';
import type { MembersFormState } from './members-schema';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { useActionToast, useToast } from '@/components/ui/toast';
import { useT } from '@/i18n/client';

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
  members: MemberRow[];
  team: Array<{ id: number; name: string }>;
  roles: Array<{ id: number; name: string }>;
  currencies: Array<{ id: number; code: string; isDefault: boolean }>;
}

const cellSelect =
  'h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50';

function SaveButton() {
  const { pending } = useFormStatus();
  const tr = useT();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? tr('در حالِ ذخیره…') : tr('ذخیرهٔ اعضا')}
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

  useEffect(() => {
    if (state.keptOwed?.length) {
      show(tr('{names} حذف نشد چون روی این پروژه تسویه‌نشده دارد. اول تسویه کنید.', {
        names: state.keptOwed.join('، '),
      }), 'info');
    }
    if (state.keptFormer?.length) {
      show(tr('{names} عضوِ سابق است و سابقه‌اش روی پروژه نگه داشته می‌شود.', {
        names: state.keptFormer.join('، '),
      }), 'info');
    }
  }, [state, show, tr]);

  const defaultCurrency = data.currencies.find((c) => c.isDefault)?.id ?? data.currencies[0]?.id ?? null;
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

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b">
                  <th className="py-2 text-start font-normal">{t("عضو")}</th>
                  <th className="py-2 text-start font-normal">{t("نقش")}</th>
                  <th className="py-2 text-start font-normal">
                    {data.isUnitBased ? tr('نرخِ هر واحد') : tr('مبلغ توافقی')}
                  </th>
                  <th className="py-2 text-start font-normal">{t("ارز")}</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="py-1.5 pe-2">
                      {row.isFormer ? (
                        // عضوِ سابق دوباره انتخاب‌شدنی نیست، ولی ردیفش می‌ماند (R-PROJ-11).
                        <div className="flex items-center gap-2">
                          <span>{row.userName}</span>
                          <Badge variant="secondary">{t("سابق")}</Badge>
                          <input type="hidden" name="memberUser" value={row.userId ?? ''} />
                        </div>
                      ) : (
                        <select
                          name="memberUser"
                          className={cellSelect}
                          value={row.userId ?? ''}
                          onChange={(e) => patch(i, { userId: e.target.value ? Number(e.target.value) : null })}
                        >
                          <option value="">—</option>
                          {data.team.map((u) => (
                            <option key={u.id} value={u.id}>{u.name}</option>
                          ))}
                        </select>
                      )}
                      {row.isOwed && (
                        <span className="mt-0.5 block text-[11px] text-amber-600 dark:text-amber-500">
                          {tr("تسویه‌نشده — با حذف از فهرست هم ردیفش می‌ماند")}
                        </span>
                      )}
                    </td>

                    <td className="py-1.5 pe-2">
                      <select
                        name="memberRole"
                        className={cellSelect}
                        value={row.roleTagId ?? ''}
                        onChange={(e) => patch(i, { roleTagId: e.target.value ? Number(e.target.value) : null })}
                      >
                        <option value="">{t("— نقشِ خودش —")}</option>
                        {data.roles.map((r) => (
                          <option key={r.id} value={r.id}>{r.name}</option>
                        ))}
                      </select>
                    </td>

                    <td className="py-1.5 pe-2">
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
                    </td>

                    <td className="py-1.5 pe-2">
                      <select
                        name="memberCurrency"
                        className={cellSelect}
                        value={row.currencyId ?? ''}
                        onChange={(e) => patch(i, { currencyId: e.target.value ? Number(e.target.value) : null })}
                      >
                        {data.currencies.map((c) => (
                          <option key={c.id} value={c.id}>{c.code}</option>
                        ))}
                      </select>
                    </td>

                    <td className="py-1.5">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="size-8 text-muted-foreground hover:text-destructive"
                        aria-label={t("حذفِ ردیف")}
                        onClick={() => setRows((rs) => rs.filter((_, idx) => idx !== i))}
                      >
                        <X className="size-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

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
