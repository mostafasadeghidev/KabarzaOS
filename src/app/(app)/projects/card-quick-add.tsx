'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Plus } from 'lucide-react';
import { addClientAction, addMemberAction, type CardActionState } from './_form/card-actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useActionToast } from '@/components/ui/toast';
import { useT } from '@/i18n/client';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';

/**
 * افزودنِ سریعِ عضو و کارفرما از خودِ کارت.:
 * دو دکمهٔ کوچک که فرمِ درجا را باز می‌کنند.
 */

export interface CardOptions {
  team: Array<{ id: number; name: string }>;
  roles: Array<{ id: number; name: string }>;
  clients: Array<{ id: number; name: string }>;
  /**
   * نقش‌های امضاشده روی هر عضو — `{ userId: tagId[] }`.
   * ⚠️ فهرستِ نقش به انتخابِ عضو گره می‌خورد: پیش از این همهٔ نقش‌های سامانه
   * را می‌داد و می‌شد کسی را با نقشی روی پروژه نشاند که ندارد.
   */
  roleMap: Record<number, number[]>;
}


function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" className="h-7 px-2 text-xs" disabled={pending}>
      {pending ? '…' : label}
    </Button>
  );
}

export function CardQuickAdd({ projectId, options }: { projectId: number; options: CardOptions }) {
  const tr = useT();
  const t = useT();
  const [openForm, setOpenForm] = useState<'member' | 'client' | null>(null);
  const [pickedUser, setPickedUser] = useState('');
  const [memberState, memberAction] = useActionState<CardActionState, FormData>(addMemberAction, {});
  useActionToast(memberState, { success: 'عضو اضافه شد.' });
  const [clientState, clientAction] = useActionState<CardActionState, FormData>(addClientAction, {});
  useActionToast(clientState, { success: 'کارفرما اضافه شد.' });

  const toggle = (which: 'member' | 'client') =>
    setOpenForm((cur) => (cur === which ? null : which));

  return (
    <div className="grid gap-1.5">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => toggle('member')}
          className="flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <Plus className="size-3" />
          {tr("افزودن عضو")}
        </button>
        <button
          type="button"
          onClick={() => toggle('client')}
          className="flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <Plus className="size-3" />
          {tr("افزودن کارفرما")}
        </button>
      </div>

      {openForm === 'member' && (
        <form action={memberAction} className="grid gap-1">
          <input type="hidden" name="projectId" value={projectId} />
          <div className="flex flex-wrap items-center gap-1">
            <NativeSelect
              name="userId"
              size="sm" className="h-7 text-xs" containerClassName="min-w-0 flex-1"
              value={pickedUser}
              onChange={(e) => setPickedUser(e.target.value)}
            >
              <NativeSelectOption value="">{t("— عضو —")}</NativeSelectOption>
              {options.team.map((u) => (
                <NativeSelectOption key={u.id} value={u.id}>{u.name}</NativeSelectOption>
              ))}
            </NativeSelect>
            {/*
              ⚠️ تا عضوی انتخاب نشده، نقشی هم پیشنهاد نمی‌شود: نقشِ معتبر به
              خودِ فرد بستگی دارد. پس از انتخاب، فقط نقش‌های همان فرد می‌مانند.
            */}
            <NativeSelect
              name="roleTagId"
              size="sm" className="h-7 text-xs" containerClassName="min-w-0 flex-1"
              defaultValue=""
              key={pickedUser}
              disabled={pickedUser === ''}
            >
              <NativeSelectOption value="">{t("— نقشِ خودش —")}</NativeSelectOption>
              {options.roles
                .filter((r) => (options.roleMap[Number(pickedUser)] ?? []).includes(r.id))
                .map((r) => (
                  <NativeSelectOption key={r.id} value={r.id}>{r.name}</NativeSelectOption>
                ))}
            </NativeSelect>
            <Input name="amount" inputMode="decimal" placeholder={t("مبلغ")} className="num h-7 w-20 text-xs" />
            <Submit label={t("افزودن")} />
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              onClick={() => setOpenForm(null)}
            >
              {tr("لغو")}
            </Button>
          </div>
          {memberState.error && <p className="text-[11px] text-destructive">{tr(memberState.error)}</p>}
        </form>
      )}

      {openForm === 'client' && (
        <form action={clientAction} className="grid gap-1">
          <input type="hidden" name="projectId" value={projectId} />
          <div className="flex flex-wrap items-center gap-1">
            <NativeSelect name="userId" size="sm" className="h-7 text-xs" containerClassName="min-w-0 flex-1" defaultValue="">
              <NativeSelectOption value="">{t("— کارفرما —")}</NativeSelectOption>
              {options.clients.map((u) => (
                <NativeSelectOption key={u.id} value={u.id}>{u.name}</NativeSelectOption>
              ))}
            </NativeSelect>
            <Submit label={t("افزودن")} />
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              onClick={() => setOpenForm(null)}
            >
              {tr("لغو")}
            </Button>
          </div>
          {clientState.error && <p className="text-[11px] text-destructive">{tr(clientState.error)}</p>}
        </form>
      )}
    </div>
  );
}
