'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Unplug } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm';
import { useToast } from '@/components/ui/toast';
import { useT } from '@/i18n/client';
import { disconnectMailboxAction } from './actions';

/** قطعِ اتصالِ صندوق از برنامه — کلیدِ برنامه پاک می‌شود؛ خودِ صندوق دست نمی‌خورد. */
export function DisconnectButton() {
  const tr = useT();
  const router = useRouter();
  const confirm = useConfirm();
  const { show } = useToast();
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm" variant="ghost" className="text-muted-foreground" disabled={pending}
      onClick={async () => {
        if (!await confirm({
          title: tr('اتصالِ صندوق قطع شود؟'),
          description: tr('ایمیل‌ها دیگر اینجا دیده نمی‌شوند. خودِ صندوق و ایمیل‌هایت دست نمی‌خورند و هر وقت خواستی دوباره وصل می‌کنی.'),
        })) return;
        start(async () => {
          const result = await disconnectMailboxAction();
          if (result.error) show(tr(result.error), 'error');
          else router.refresh();
        });
      }}
    >
      <Unplug className="size-3.5" />{tr('قطعِ اتصال')}
    </Button>
  );
}
