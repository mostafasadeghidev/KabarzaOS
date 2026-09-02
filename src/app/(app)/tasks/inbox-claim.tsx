'use client';

import { useState, useTransition } from 'react';
import { Hand } from 'lucide-react';
import { claimTaskAction } from '@/app/(app)/projects/_form/tab-actions';
import { Button } from '@/components/ui/button';
import { useT } from '@/i18n/client';

/**
 * دکمهٔ «این تسک را برمی‌دارم» — روی ردیفِ صندوق و در مودالِ تسک
 * (پورتِ `claim_button()`). قاعدهٔ نمایش در سرور سنجیده شده (`claimable`).
 */
export function ClaimTaskButton({
  taskId,
  projectId,
  onDone,
}: {
  taskId: number;
  projectId: number;
  onDone?: () => void;
}) {
  const tr = useT();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <span className="flex items-center gap-2">
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => startTransition(async () => {
          const result = await claimTaskAction(taskId, projectId);
          setError(result?.error ?? null);
          if (!result?.error) onDone?.();
        })}
      >
        <Hand className="size-3.5" />
        {pending ? tr('صبر کنید…') : tr('برمی‌دارم')}
      </Button>
      {error && <span className="text-xs text-destructive">{tr(error)}</span>}
    </span>
  );
}
