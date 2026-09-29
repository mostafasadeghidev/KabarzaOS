'use client';

import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useT } from '@/i18n/client';
import { CatalogSection } from '../settings/catalog-section';
import { deleteVendorAction, saveVendorAction } from '../settings/_form/actions';

export interface VendorRow {
  id: number;
  name: string;
  note: string;
  isActive: boolean;
  expenseCount: number;
}

/**
 * تبِ «طرف‌حساب‌ها» ی امور مالی — پورتِ `Vendors_Page`: نام، یادداشت، شمارِ
 * هزینه‌ها (پیوند به فهرستِ هزینه‌های همین طرف‌حساب) و فعال/غیرفعال.
 * ⚠️ حذفِ طرف‌حسابی که ردیف یا هزینه دارد رد می‌شود و پیام می‌گوید غیرفعالش
 * کنید — تاریخچه دست‌نخورده می‌ماند.
 */
export function VendorsView({ rows }: { rows: VendorRow[] }) {
  const tr = useT();
  return (
    <CatalogSection
      title="طرف‌حساب‌ها"
      description="فروشندگان و طرف‌حساب‌های هزینه. طرف‌حسابِ غیرفعال در انتخابگرهای تازه پیشنهاد نمی‌شود."
      addLabel="افزودن طرف‌حساب"
      rows={rows}
      columns={[
        { header: 'نام', cell: (v) => v.name },
        { header: 'یادداشت', cell: (v) => v.note || '—' },
        {
          header: 'هزینه‌ها',
          numeric: true,
          cell: (v) => (v.expenseCount > 0 ? (
            <Link
              href={`/finance?tab=expenses&vendor=${encodeURIComponent(v.name)}`}
              className="num underline-offset-4 hover:underline"
            >
              {v.expenseCount}
            </Link>
          ) : <span className="num text-muted-foreground">0</span>),
        },
        {
          header: 'وضعیت',
          cell: (v) => (v.isActive
            ? <Badge variant="secondary">{tr('فعال')}</Badge>
            : <Badge variant="outline" className="text-muted-foreground">{tr('غیرفعال')}</Badge>),
        },
      ]}
      saveAction={saveVendorAction}
      deleteAction={(v) => deleteVendorAction(v.id)}
      renderForm={(editing) => (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="v-name">{tr('نام')}</FieldLabel>
            <Input id="v-name" name="name" defaultValue={editing?.name ?? ''} required />
          </Field>
          <Field>
            <FieldLabel htmlFor="v-note">{tr('یادداشت')}</FieldLabel>
            <Input id="v-note" name="note" defaultValue={editing?.note ?? ''} />
          </Field>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <Checkbox name="isActive" defaultChecked={editing ? editing.isActive : true} />
            {tr('فعال')}
          </label>
        </div>
      )}
    />
  );
}
