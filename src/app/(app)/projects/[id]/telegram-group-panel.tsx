'use client';

import { useEffect, useState, useTransition } from 'react';
import { Link2Off, MailPlus, Send } from 'lucide-react';
import {
  projectGroupDisconnectAction, projectGroupInviteAction, projectGroupLinkAction, projectGroupStatusAction,
} from './_form/telegram-group-actions';
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
  const [status, setStatus] = useState<{ connected: boolean; botReady: boolean; inviteReady: boolean } | null>(null);
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

  // ۲.۳۶.۰ — دعوتِ دوبارهٔ همهٔ تیم (مثلاً پس از مدیر کردنِ ربات).
  const invite = () => startTransition(async () => {
    const r = await projectGroupInviteAction(projectId);
    if (r.error) show(t(r.error), 'error');
    else { setStatus({ ...status, inviteReady: true }); show(t('دعوت برای {n} نفر فرستاده شد.', { n: r.sent ?? 0 }), 'success'); }
  });

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
        {t('در تلگرام یک گروه بسازید و با این دکمه ربات را (به‌عنوانِ مدیر) به آن اضافه کنید. ربات به اعضای تیمِ پروژه لینکِ عضویت می‌فرستد، فقط همان‌ها را می‌پذیرد و هر کس از پروژه برداشته شود از گروه بیرون می‌رود. کامنت‌ها و تسک‌های تازه و انجام‌شده هم آنجا می‌آیند؛ تسکِ خصوصی و «پنهان از کارفرما» هرگز.')}
      </p>
      {status.connected && !status.inviteReady && (
        <p className="text-xs text-amber-700 dark:text-amber-500">
          {t('ربات هنوز مدیرِ گروه نیست؛ در تلگرام مدیرش کنید (با اجازهٔ «افزودنِ اعضا» و «محدود کردنِ اعضا») تا اعضا دعوت شوند.')}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {status.connected && <Badge variant="success">{t('وصل است')}</Badge>}
        <Button type="button" size="sm" variant={status.connected ? 'outline' : 'default'} disabled={pending} onClick={connect}>
          <Send className="size-3.5" />{status.connected ? t('وصل به گروهِ دیگر') : t('افزودنِ ربات به گروه')}
        </Button>
        {status.connected && (
          <Button type="button" size="sm" variant="outline" disabled={pending} onClick={invite}>
            <MailPlus className="size-3.5" />{t('دعوتِ دوبارهٔ اعضا')}
          </Button>
        )}
        {status.connected && (
          <Button type="button" size="sm" variant="ghost" className="text-destructive" disabled={pending} onClick={disconnect}>
            <Link2Off className="size-3.5" />{t('جدا کردن')}
          </Button>
        )}
      </div>
    </Panel>
  );
}
