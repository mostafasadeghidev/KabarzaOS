'use client';

import { useState, useTransition } from 'react';
import { Ban, Undo2 } from 'lucide-react';
import { setProjectAccessAction } from './members-actions';
import { Button } from '@/components/ui/button';
import { useT } from '@/i18n/client';

/**
 * قطع/وصلِ دسترسیِ یک نفر به این پروژه.
 *
 * ⚠️ چرا کنارِ حذف و نه به‌جایش: حذف ردیفِ عضویت را برمی‌دارد و آن ردیف
 * حاملِ پول است — برای همین وقتی تسویه‌نشده باشد سرویس جلویش را می‌گیرد.
 * این دکمه همان‌جا راهِ سوم می‌دهد: پول و سابقه بماند، دیدن قطع شود.
 */
export function MemberAccessToggle({
  projectId,
  userId,
  blocked,
}: {
  projectId: number;
  userId: number;
  blocked: boolean;
}) {
  const t = useT();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <span className="flex items-center justify-end gap-1">
      {error && <span className="text-[11px] text-destructive">{t(error)}</span>}
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className={`size-8 ${blocked ? 'text-amber-600 dark:text-amber-500' : 'text-muted-foreground hover:text-destructive'}`}
        disabled={pending}
        aria-label={blocked ? t('بازگرداندنِ دسترسی') : t('قطعِ دسترسی به این پروژه')}
        title={blocked ? t('بازگرداندنِ دسترسی') : t('قطعِ دسترسی به این پروژه')}
        onClick={() =>
          startTransition(async () => {
            const result = await setProjectAccessAction(projectId, userId, !blocked);
            setError(result.error ?? null);
          })
        }
      >
        {blocked ? <Undo2 className="size-3.5" /> : <Ban className="size-3.5" />}
      </Button>
    </span>
  );
}
