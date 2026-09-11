'use client';

import { useActionState, useEffect, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Pause, Play, Timer, TriangleAlert } from 'lucide-react';
import {
  confirmPendingAction, resumePendingAction, stopTimerAction,
} from '@/app/(app)/hours/_form/actions';
import { hoursLabel } from '@/domain/timelogs/timer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useActionToast } from '@/components/ui/toast';
import { useT } from '@/i18n/client';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';

/**
 * نوارِ سراسریِ تایمر — پورتِ `timer_banner()` ِ افزونه: روی **هر** صفحه.
 * روشن → ساعتِ زنده + توقف با توضیح؛ پارک‌شده (بیش از ۵ ساعت) → تأیید/اصلاح یا ادامه.
 * ⚠️ عضوی که از /projects کار می‌کند نباید تایمرِ فراموش‌شده را ساعت‌ها نبیند.
 */

function Submit({ children, variant }: { children: React.ReactNode; variant?: 'outline' | 'default' }) {
  const { pending } = useFormStatus();
  const tr = useT();
  return (
    <Button type="submit" size="sm" variant={variant} disabled={pending}>
      {pending ? tr('صبر کنید…') : children}
    </Button>
  );
}

function LiveClock({ from }: { from: number }) {
  const [minutes, setMinutes] = useState(from);
  useEffect(() => {
    setMinutes(from);
    const tick = setInterval(() => setMinutes((m) => m + 1), 60_000);
    return () => clearInterval(tick);
  }, [from]);
  return <span className="num font-semibold">{hoursLabel(minutes)}</span>;
}

export function TimerBanner({
  running,
  pending,
}: {
  running: { projectTitle: string | null; minutes: number } | null;
  pending: { projectTitle: string | null; minutes: number } | null;
}) {
  const t = useT();
  const [stopState, stop] = useActionState(stopTimerAction, {});
  useActionToast(stopState);
  const [confirmState, confirm] = useActionState(confirmPendingAction, {});
  useActionToast(confirmState);

  if (running) {
    // Alert ِ shadcn به شکلِ نوار زیرِ سربرگ: بی‌گوشه و فقط مرزِ پایین.
    return (
      <Alert className="items-center rounded-none border-x-0 border-t-0 bg-primary/5 [&>svg]:translate-y-0">
        <Timer />
        <AlertDescription className="flex flex-wrap items-center gap-3 text-foreground">
          <span>{t('تایمر روشن')}: <b>{running.projectTitle ?? t('کارِ عمومی')}</b> · <LiveClock from={running.minutes} /></span>
          <form action={stop} className="ms-auto flex flex-wrap items-center gap-2">
            <Input name="description" placeholder={t('توضیحات (اختیاری)')} className="h-8 w-56" />
            <Submit variant="outline">
              <Pause className="size-3.5" />
              {t('توقف و ثبت')}
            </Submit>
          </form>
        </AlertDescription>
      </Alert>
    );
  }

  if (pending) {
    return (
      <Alert variant="warning" className="items-center rounded-none border-x-0 border-t-0 [&>svg]:translate-y-0">
        <TriangleAlert />
        <AlertDescription className="flex flex-wrap items-center gap-3 text-foreground">
          <span>
            {t('تایمرِ «{project}» بیش از ۵ ساعت روشن بود؛ مقدار را تأیید/اصلاح کنید یا ادامه دهید.', {
              project: pending.projectTitle ?? t('کارِ عمومی'),
            })}
          </span>
          <form action={confirm} className="ms-auto flex flex-wrap items-center gap-2">
            <Label className="gap-1 text-xs font-normal">
              {t('ساعت')}
              <Input name="hours" type="number" min={0} className="num h-8 w-16" defaultValue={Math.floor(pending.minutes / 60)} />
            </Label>
            <Label className="gap-1 text-xs font-normal">
              {t('دقیقه')}
              <Input name="minutes" type="number" min={0} max={59} className="num h-8 w-16" defaultValue={pending.minutes % 60} />
            </Label>
            <Submit>{t('ثبت')}</Submit>
            <Button type="button" size="sm" variant="ghost" onClick={() => resumePendingAction()}>
              <Play className="size-3.5" />
              {t('ادامهٔ تایمر')}
            </Button>
          </form>
        </AlertDescription>
      </Alert>
    );
  }

  return null;
}
