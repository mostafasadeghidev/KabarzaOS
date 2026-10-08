'use client';

import { useEffect, useState, useTransition } from 'react';
import { Link2Off, Send } from 'lucide-react';
import { projectGroupDisconnectAction, projectGroupLinkAction, projectGroupStatusAction } from './_form/telegram-group-actions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm';
import { useToast } from '@/components/ui/toast';
import { Panel } from '@/components/page-shell';
import { useT } from '@/i18n/client';

/**
 * گروهِ تلگرامِ پروژه (۲.۱۴.۰) — مدیر لینکِ «افزودنِ ربات به گروه» را می‌گیرد؛
 * ربات در همان گروه به پروژه وصل می‌شود و کامنت‌ها و تسک‌های تازه/انجام‌شده را
 * آنجا هم می‌گذارد. ⚠️ تسکِ خصوصی و «پنهان از کارفرما» هرگز به گروه نمی‌رود.
 */
export function TelegramGroupPanel({ projectId }: { projectId: number }) {
  const t = useT();
  const confirm = useConfirm();
  const { show } = useToast();
  const [status, setStatus] = useState<{ connected: boolean; botReady: boolean } | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let alive = true;
    projectGroupStatusAction(projectId).then((s) => { if (alive) setStatus(s); });
    return () => { alive = false; };
  }, [projectId]);

  if (!status || !status.botReady) return null;

  const connect = () => {
    // ⚠️ تب همین‌جا و همگام باز می‌شود (پاپ‌آپ‌بلاکر)، بعد نشانی‌اش.
    const tab = window.open('', '_blank');
    try { if (tab) tab.opener = null; } catch { /* مهم نیست */ }
    startTransition(async () => {
      const r = await projectGroupLinkAction(projectId);
      if (!r.link) { tab?.close(); show(t(r.error ?? 'انجام نشد.'), 'error'); return; }
      if (tab) tab.location.href = r.link; else window.location.href = r.link;
    });
  };

  const disconnect = async () => {
    if (!(await confirm({ title: t('گروهِ تلگرام جدا شود؟'), description: t('رویدادهای پروژه دیگر به آن گروه نمی‌روند.') }))) return;
    startTransition(async () => {
      const r = await projectGroupDisconnectAction(projectId);
      if (r.error) show(t(r.error), 'error');
      else { setStatus({ ...status, connected: false }); show(t('جدا شد.'), 'success'); }
    });
  };

  return (
    <Panel title={t('گروهِ تلگرامِ پروژه')}>
      <p className="text-xs text-muted-foreground">
        {t('ربات را به گروهِ تلگرامیِ پروژه اضافه کنید تا کامنت‌های تازه و تسک‌های تازه و انجام‌شده آنجا هم بیاید. تسکِ خصوصی و «پنهان از کارفرما» هرگز فرستاده نمی‌شود؛ ربات در گروه به هیچ پرسشی جواب نمی‌دهد.')}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {status.connected && <Badge variant="success">{t('وصل است')}</Badge>}
        <Button type="button" size="sm" variant={status.connected ? 'outline' : 'default'} disabled={pending} onClick={connect}>
          <Send className="size-3.5" />{status.connected ? t('وصل به گروهِ دیگر') : t('افزودنِ ربات به گروه')}
        </Button>
        {status.connected && (
          <Button type="button" size="sm" variant="ghost" className="text-destructive" disabled={pending} onClick={disconnect}>
            <Link2Off className="size-3.5" />{t('جدا کردن')}
          </Button>
        )}
      </div>
    </Panel>
  );
}
