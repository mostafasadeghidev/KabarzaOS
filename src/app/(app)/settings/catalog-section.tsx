'use client';

import { useActionState, useEffect, useState, useTransition } from 'react';
import { useFormStatus } from 'react-dom';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import type { SettingsState } from './_form/actions';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { useActionToast, useToast } from '@/components/ui/toast';
import { useT } from '@/i18n/client';
import { useConfirm } from '@/components/ui/confirm';

/**
 * الگوی مشترکِ هر فهرستِ پایه: جدول + فرم در دیالوگ + حذف.
 *
 * ⚠️ چرا دیالوگ و نه فرمِ درجا: فرم پیش‌تر بالای جدول باز می‌شد و صفحه را
 * به اندازهٔ خودش پایین می‌راند؛ روی فهرست‌های بلند، جدول از دید بیرون
 * می‌رفت و کاربر نمی‌دانست چه چیزی را ویرایش می‌کند.
 *
 * ⚠️ یک جزءِ مشترک برای همهٔ فهرست‌ها، تا رفتارِ حذف و پیام‌های خطا
 * همه‌جا یکسان بماند.
 */

/**
 * ⚠️ `title` و `description` هم مثلِ `header` **کلیدِ ترجمه**اند، نه متنِ
 * نهایی: از راهِ پراپ می‌رسند و هرگز داخلِ `t()` نمی‌آیند، پس اگر فراخوان
 * ترجمه‌شان کند، در زمانِ ساختِ آرایه ترجمه می‌شوند — پیش از آنکه زبانِ
 * کاربر معلوم باشد.
 */
export interface Column<T> {
  /**
   * ⚠️ **کلیدِ ترجمه**، نه متنِ نهایی: خودِ جدول ترجمه‌اش می‌کند. اگر
   * فراخوان `t()` بزند، رشته در زمانِ ساختِ آرایه ترجمه می‌شود — پیش از
   * آنکه زبانِ کاربر معلوم باشد — و برای همه فارسی می‌ماند.
   */
  header: string;
  cell: (row: T) => React.ReactNode;
  numeric?: boolean;
}

export function CatalogSection<T extends { id: number }>({
  title,
  description,
  rows,
  columns,
  saveAction,
  deleteAction,
  renderForm,
  addLabel,
  rowActions,
  canDelete,
}: {
  title: string;
  description?: string;
  rows: T[];
  columns: Array<Column<T>>;
  saveAction: (prev: SettingsState, formData: FormData) => Promise<SettingsState>;
  deleteAction: (row: T) => Promise<SettingsState>;
  /** فرم برای ردیفِ در حالِ ویرایش، یا null برای افزودن. */
  renderForm: (editing: T | null) => React.ReactNode;
  addLabel: string;
  /** دکمه‌های اضافیِ هر ردیف (مثلاً «پیش‌فرض کن»). */
  rowActions?: (row: T) => React.ReactNode;
  /** ردیفی که حذف ندارد (مثلاً تگِ سیستمی) — دکمه اصلاً کشیده نمی‌شود (پورتِ «delete link hidden for protected»). */
  canDelete?: (row: T) => boolean;
}) {
  const tr = useT();
  const { show } = useToast();
  const confirm = useConfirm();
  const t = useT();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<T | null>(null);
  const [pending, startTransition] = useTransition();
  const [state, formAction] = useActionState<SettingsState, FormData>(saveAction, {});
  useActionToast(state, { success: 'ذخیره شد.' });

  useEffect(() => {
    if (state.ok) { setOpen(false); setEditing(null); }
  }, [state]);

  return (
    <section className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">{tr(title)}</h2>
          {description && <p className="text-xs text-muted-foreground">{tr(description)}</p>}
        </div>
        <Button
          size="sm"
          onClick={() => { setEditing(null); setOpen(true); }}
        >
          <Plus className="size-4" />
          {tr(addLabel)}
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? tr('ویرایش') : tr(addLabel)}</DialogTitle>
          </DialogHeader>
          {/* key: با باز/بستهٔ دیالوگ، مقادیرِ پیش‌فرضِ فرم از نو خوانده شوند. */}
          <form key={editing?.id ?? 'new'} action={formAction} className="grid gap-3">
            {editing && <input type="hidden" name="id" value={editing.id} />}
            {renderForm(editing)}
            <DialogFooter>
              <Button type="button" size="sm" variant="outline" onClick={() => setOpen(false)}>
                {tr("انصراف")}
              </Button>
              <SaveButton />
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {rows.length === 0 ? (
        <EmptyState title={t("موردی ثبت نشده")} />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((c) => <TableHead key={c.header}>{tr(c.header)}</TableHead>)}
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  {columns.map((c) => (
                    <TableCell key={c.header} className={c.numeric ? 'num' : undefined}>
                      {c.cell(row)}
                    </TableCell>
                  ))}
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      {rowActions?.(row)}
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-8"
                        aria-label={t("ویرایش")}
                        onClick={() => { setEditing(row); setOpen(true); }}
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      {(canDelete?.(row) ?? true) && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-8 text-muted-foreground hover:text-destructive"
                          aria-label={t("حذف")}
                          disabled={pending}
                          onClick={async () => {
                            // پورتِ `confirm('حذف شود؟')` ِ هر ردیفِ کاتالوگ — حذفِ یک‌کلیکی نه.
                            if (!(await confirm({ title: t('حذف شود؟') }))) return;
                            startTransition(async () => {
                              const result = await deleteAction(row);
                              if (result.error) show(t(result.error), 'error');
                              else show(t('حذف شد.'), 'success');
                            });
                          }}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}

function SaveButton() {
  const { pending } = useFormStatus();
  const tr = useT();
  return <Button type="submit" size="sm" disabled={pending}>{pending ? tr('در حالِ ذخیره…') : tr('ذخیره')}</Button>;
}
