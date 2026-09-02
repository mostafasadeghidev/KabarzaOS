'use client';

import { useActionState, useEffect, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Users } from 'lucide-react';
import { setClientsAction, type ClientsFormState } from './clients-actions';
import { Button } from '@/components/ui/button';
import { MultiSelect } from '@/components/ui/multi-select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { useActionToast } from '@/components/ui/toast';
import { useT } from '@/i18n/client';

export interface ClientsFormData {
  projectId: number;
  clientIds: number[];
  candidates: Array<{ id: number; label: string }>;
}

function SaveButton() {
  const { pending } = useFormStatus();
  const tr = useT();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? tr('در حالِ ذخیره…') : tr('ذخیرهٔ کارفرمایان')}
    </Button>
  );
}

/**
 * کارفرمایانِ پروژه — پورتِ چیپ‌های کارفرما با ✕ در فرمِ ویرایشِ نسخهٔ قبلی
 * (`set_clients`: افزودن و **حذف** با diff، کارفرمای اصلی ثابت می‌ماند).
 *
 * ⚠️ پیش از این کارفرما فقط از کارت افزوده می‌شد و هیچ راهی برای حذفش نبود.
 */
export function ClientsDialog({ data }: { data: ClientsFormData }) {
  const tr = useT();
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState<ClientsFormState, FormData>(setClientsAction, {});
  useActionToast(state, {
    success: state.summary
      ? tr('ذخیره شد — {added} افزوده، {removed} حذف.', {
        added: state.summary.added, removed: state.summary.removed,
      })
      : tr('کارفرمایان ذخیره شد.'),
  });

  useEffect(() => {
    if (state.ok) setOpen(false);
  }, [state]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Users className="size-4" />
          {tr('ویرایشِ کارفرمایان')}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{tr('کارفرمایانِ پروژه')}</DialogTitle>
          <DialogDescription>
            {tr('کارفرمای نخست، مخاطبِ تسک‌هایی است که به «کارفرما» سپرده می‌شوند؛ ترتیبش با ویرایش عوض نمی‌شود.')}
          </DialogDescription>
        </DialogHeader>
        {/* ⚠️ هر بار که باز می‌شود از وضعیتِ فعلی شروع می‌کند، نه از آخرین پیش‌نویس. */}
        <form key={open ? 'open' : 'closed'} action={formAction} className="grid gap-3">
          <input type="hidden" name="projectId" value={data.projectId} />
          <MultiSelect
            name="clientId"
            options={data.candidates}
            defaultSelected={data.clientIds}
            placeholder={tr('افزودنِ کارفرما…')}
            emptyText={tr('کارفرمایی برای افزودن نیست.')}
          />
          {state.error && <p className="text-xs text-destructive">{tr(state.error)}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {tr('انصراف')}
            </Button>
            <SaveButton />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
