'use client';

import { useActionState, useTransition } from 'react';
import { useFormStatus } from 'react-dom';
import { Trash2 } from 'lucide-react';
import {
  deleteAbsenceAction, saveAbsenceAction, type AbsenceState,
} from './_form/absence-actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableNumericCell, TableRow,
} from '@/components/ui/table';
import { useT } from '@/i18n/client';

export interface MyAbsence {
  id: number;
  fromDate: string;
  toDate: string;
  note: string;
}

export interface AbsencePanelData {
  /** مرخصی‌های خودِ کاربر — گذشته و آینده. */
  mine: MyAbsence[];
  /** اعضایی که می‌شود برایشان ثبت کرد؛ یک نفره یعنی فقط خودش. */
  targets: Array<{ id: number; name: string }>;
  meId: number;
  today: string;
}

function Submit() {
  const tr = useT();
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? tr('در حالِ ذخیره…') : tr('ثبتِ مرخصی')}
    </Button>
  );
}

/**
 * ثبت و حذفِ مرخصیِ موردی — پورتِ فرم‌های `handle_add_absence` /
 * `handle_manager_add_absence` نسخهٔ قبلی.
 *
 * ⚠️ انتخابگرِ «برای چه کسی» فقط وقتی دیده می‌شود که کاربر واقعاً بیش از
 * خودش را مدیریت کند؛ فهرستِ تک‌نفره فقط جای فرم را می‌گیرد. سرور در هر حال
 * دوباره بررسی می‌کند.
 */
export function AbsencePanel({ data }: { data: AbsencePanelData }) {
  const tr = useT();
  const [state, formAction] = useActionState(saveAbsenceAction, {} as AbsenceState);
  const [pending, startTransition] = useTransition();
  const canPickPerson = data.targets.length > 1;

  return (
    <div className="grid gap-4">
      <form action={formAction} className="grid gap-3 rounded-md border p-3">
        <p className="text-sm font-medium">{tr('ثبتِ مرخصی')}</p>

        <div className="grid gap-3 @md/main:grid-cols-4">
          {canPickPerson ? (
            <div className="grid gap-1.5">
              <Label htmlFor="a-user">{tr('برای')}</Label>
              <select
                id="a-user"
                name="userId"
                defaultValue={data.meId}
                className="h-9 rounded-md border bg-background px-2 text-sm"
              >
                {data.targets.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.id === data.meId ? tr('خودم') : p.name}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <input type="hidden" name="userId" value={data.meId} />
          )}

          <div className="grid gap-1.5">
            <Label htmlFor="a-from">{tr('از تاریخ')}</Label>
            <Input id="a-from" name="from" type="date" className="num" defaultValue={data.today} required />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="a-to">{tr('تا تاریخ')}</Label>
            <Input id="a-to" name="to" type="date" className="num" defaultValue={data.today} required />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="a-note">{tr('توضیح (اختیاری)')}</Label>
            <Input id="a-note" name="note" placeholder={tr('سفر، بیماری…')} />
          </div>
        </div>

        {/* ⚠️ ادغام رفتارِ عمدی است، نه خطا — کاربر باید بداند چرا دو ردیف یکی شد. */}
        <p className="text-xs text-muted-foreground">
          {tr('بازه‌ای که با مرخصیِ موجود همپوشانی یا هم‌مرزی داشته باشد، با آن یکی می‌شود.')}
        </p>

        <div className="flex items-center gap-3">
          <Submit />
          {state.error && <span className="text-sm text-destructive">{tr(state.error)}</span>}
          {state.message && <span className="text-sm text-muted-foreground">{tr(state.message)}</span>}
        </div>
      </form>

      <div className="grid gap-2">
        <p className="text-sm font-medium">{tr('مرخصی‌های من')}</p>
        {data.mine.length === 0 ? (
          <EmptyState title={tr('مرخصی‌ای ثبت نکرده‌اید')} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{tr('از')}</TableHead>
                <TableHead>{tr('تا')}</TableHead>
                <TableHead>{tr('توضیح')}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.mine.map((a) => (
                <TableRow key={a.id}>
                  <TableNumericCell>{a.fromDate}</TableNumericCell>
                  <TableNumericCell>{a.toDate}</TableNumericCell>
                  <TableCell>{a.note || '—'}</TableCell>
                  <TableCell>
                    <div className="flex justify-end">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-8 text-muted-foreground hover:text-destructive"
                        aria-label={tr('حذف')}
                        disabled={pending}
                        onClick={() => startTransition(async () => { await deleteAbsenceAction(a.id); })}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
