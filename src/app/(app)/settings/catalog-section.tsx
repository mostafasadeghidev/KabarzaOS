'use client';

import { useActionState, useEffect, useState, useTransition } from 'react';
import { useFormStatus } from 'react-dom';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import type { SettingsState } from './_form/actions';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { useT } from '@/i18n/client';

/**
 * الگوی مشترکِ هر فهرستِ پایه: جدول + فرمِ درجا + حذف.
 *
 * ⚠️ چون همهٔ این فهرست‌ها یک شکل دارند (,
 * در نسخهٔ قبلی هم تقریباً یکی‌اند)، یک جزء
 * مشترک ساخته شده تا رفتارِ حذف و پیام‌های خطا همه‌جا یکسان بماند.
 */

export interface Column<T> {
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
}) {
  const tr = useT();
  const t = useT();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<T | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [state, formAction] = useActionState<SettingsState, FormData>(saveAction, {});

  useEffect(() => {
    if (state.ok) { setOpen(false); setEditing(null); setNotice(null); }
    else if (state.error) setNotice(state.error);
  }, [state.ok, state.error]);

  return (
    <section className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">{title}</h2>
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
        <Button
          size="sm"
          onClick={() => { setEditing(null); setOpen(true); setNotice(null); }}
        >
          <Plus className="size-4" />
          {addLabel}
        </Button>
      </div>

      {notice && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{notice}</p>
      )}

      {open && (
        <form key={editing?.id ?? 'new'} action={formAction} className="grid gap-3 rounded-md border p-3">
          {editing && <input type="hidden" name="id" value={editing.id} />}
          {renderForm(editing)}
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => setOpen(false)}>
              {tr("انصراف")}
            </Button>
            <SaveButton />
          </div>
        </form>
      )}

      {rows.length === 0 ? (
        <EmptyState title={t("موردی ثبت نشده")} />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((c) => <TableHead key={c.header}>{c.header}</TableHead>)}
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
                        onClick={() => { setEditing(row); setOpen(true); setNotice(null); }}
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-8 text-muted-foreground hover:text-destructive"
                        aria-label={t("حذف")}
                        disabled={pending}
                        onClick={() =>
                          startTransition(async () => {
                            const result = await deleteAction(row);
                            setNotice(result.error ?? null);
                          })
                        }
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
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
  return <Button type="submit" size="sm" disabled={pending}>{pending ? 'در حالِ ذخیره…' : 'ذخیره'}</Button>;
}
