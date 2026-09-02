'use client';

import { useState, useTransition } from 'react';
import { UserMinus } from 'lucide-react';
import { removeMemberAction } from './tab-actions';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm';
import { useT } from '@/i18n/client';

/**
 * حذفِ صریحِ یک ردیفِ عضویت — پورتِ `remove_member` ِ افزونه.
 *
 * ⚠️ ویرایشِ دسته‌جمعیِ اعضا عضوِ طلبکار را حذف نمی‌کند (R-PROJ-23)؛ این دکمه
 * همان راهِ فرارِ مستندِ افزونه است: فقط مدیرِ پروژه، با تأیید، و پول/سابقه
 * (پرداخت‌ها) سرِ جایشان می‌مانند.
 */
export function MemberRemoveButton({
  projectId,
  memberRowId,
  name,
}: {
  projectId: number;
  memberRowId: number;
  name: string;
}) {
  const t = useT();
  const confirm = useConfirm();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <span className="inline-flex items-center gap-1">
      {error && <span className="text-[11px] text-destructive">{t(error)}</span>}
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="size-8 text-muted-foreground hover:text-destructive"
        disabled={pending}
        aria-label={t('حذف از پروژه')}
        title={t('حذف از پروژه')}
        onClick={async () => {
          const ok = await confirm({
            title: t('حذفِ عضو از پروژه'),
            description: t('{name} از این پروژه برداشته می‌شود؛ پرداخت‌های ثبت‌شده‌اش می‌مانند.', { name }),
            confirmLabel: t('حذف'),
            destructive: true,
          });
          if (!ok) return;
          startTransition(async () => {
            const result = await removeMemberAction(projectId, memberRowId);
            setError(result.error ?? null);
          });
        }}
      >
        <UserMinus className="size-3.5" />
      </Button>
    </span>
  );
}
