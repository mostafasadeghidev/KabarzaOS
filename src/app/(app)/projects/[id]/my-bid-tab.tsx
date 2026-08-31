'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Gavel } from 'lucide-react';
import { submitBidAction, type BidState } from '../_form/tab-actions';
import { format } from '@/domain/money/money';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useT } from '@/i18n/client';

export interface MyBidData {
  projectId: number;
  isOpen: boolean;
  wonRoles: string[];
  openRoles: Array<{
    roleTagId: number;
    roleName: string;
    cap: string | null;
    myAmount: string;
    myNote: string;
    hasBid: boolean;
  }>;
}

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return <Button type="submit" size="sm" disabled={pending}>{pending ? 'صبر کنید…' : label}</Button>;
}

function RoleBid({ projectId, role }: { projectId: number; role: MyBidData['openRoles'][number] }) {
  const t = useT();
  const [state, action] = useActionState(submitBidAction, {} as BidState);
  const cap = Number(role.cap ?? 0);

  return (
    <form action={action} className="grid gap-2 rounded-md border p-3">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="roleTagId" value={role.roleTagId} />

      <h4 className="text-sm font-semibold">
        {role.roleName}
        {/* ⚠️ سقفِ صفر یعنی «بدونِ سقف»، نه سقفِ صفر. */}
        <span className="ms-2 text-xs font-normal text-muted-foreground">
          سقف: {cap > 0 ? format(role.cap!) : 'بدون سقف'}
        </span>
      </h4>

      <div className="flex flex-wrap items-end gap-2">
        <div className="grid gap-1.5">
          <Label htmlFor={`bid-${role.roleTagId}`}>{t("قیمت پیشنهادی شما")}</Label>
          <Input
            id={`bid-${role.roleTagId}`}
            name="amount"
            inputMode="decimal"
            className="num w-40"
            // راهنمای کاربر است؛ گاردِ واقعی روی سرور.
            max={cap > 0 ? role.cap! : undefined}
            defaultValue={role.myAmount}
            required
          />
        </div>
        <div className="grid flex-1 gap-1.5">
          <Label htmlFor={`note-${role.roleTagId}`}>{t("توضیحات")}</Label>
          <Input id={`note-${role.roleTagId}`} name="note" defaultValue={role.myNote} />
        </div>
        <Submit label={role.hasBid ? 'به‌روزرسانی' : 'ثبت'} />
      </div>

      {(state.error || state.message) && (
        <p className={`text-xs ${state.error ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-500'}`}>
          {state.error ?? state.message}
        </p>
      )}
    </form>
  );
}

/**
 * مناقصه از نگاهِ عضو — پورتِ `tender_member_view()`.
 * ⚠️ فقط پیشنهادِ خودش را می‌بیند؛ دیدنِ قیمتِ رقبا مناقصه را بی‌معنا می‌کند.
 */
export function MyBidTab({ data }: { data: MyBidData }) {
  const tr = useT();
  const t = useT();
  return (
    <div className="grid gap-3">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold">
        <Gavel className="size-4" />
        {tr("پیشنهادِ من")}
      </h3>

      {data.wonRoles.map((role) => (
        <p
          key={role}
          className="rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400"
        >
          پیشنهادِ شما برای نقش «{role}» تأیید شد. 🎉
        </p>
      ))}

      {!data.isOpen && (
        <p className="text-xs text-muted-foreground">
          {tr("مناقصه بسته است (پروژه شروع شده)؛ پیشنهادِ تازه پذیرفته نمی‌شود.")}
        </p>
      )}

      {data.openRoles.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("مناقصهٔ بازی برای نقش‌های شما نیست.")}</p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            {tr("برای هر نقش، قیمتِ پیشنهادیِ خود را جداگانه وارد کنید.")}
          </p>
          {data.openRoles.map((role) => (
            <RoleBid key={role.roleTagId} projectId={data.projectId} role={role} />
          ))}
        </>
      )}
    </div>
  );
}
