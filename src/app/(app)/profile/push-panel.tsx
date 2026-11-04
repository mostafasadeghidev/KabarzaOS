'use client';

import { useEffect, useState, useTransition } from 'react';
import { BellRing } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Panel } from '@/components/page-shell';
import { useToast } from '@/components/ui/toast';
import { useT } from '@/i18n/client';
import {
  pushSetupAction, subscribePushAction, testPushAction, unsubscribePushAction,
} from '../_actions/push';

type State = 'loading' | 'unsupported' | 'ios-install' | 'off-server' | 'blocked' | 'off' | 'on';

/** کلیدِ عمومیِ VAPID (base64url) → بایت، همان شکلی که `pushManager.subscribe` می‌خواهد. */
function keyBytes(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function registration() {
  return (await navigator.serviceWorker.getRegistration('/')) ?? navigator.serviceWorker.register('/sw.js', { scope: '/' });
}

const MESSAGES: Partial<Record<State, string>> = {
  unsupported: 'این مرورگر اعلانِ فوری را پشتیبانی نمی‌کند.',
  'ios-install': 'در آیفون اول برنامه را از Share ← «Add to Home Screen» به صفحهٔ اصلی اضافه کنید و از همان آیکون باز کنید؛ بعد اینجا روشنش کنید.',
  'off-server': 'اعلانِ فوری در تنظیماتِ سامانه خاموش است.',
  blocked: 'اعلان برای این سایت در مرورگر مسدود شده است. از تنظیماتِ سایت در مرورگر اجازه دهید و صفحه را تازه کنید.',
};

/**
 * «اعلان روی این دستگاه» (۲.۵۶.۰). هر دستگاه جدا روشن می‌شود — گوشی و کامپیوتر دو اشتراک‌اند.
 * ⚠️ آیفون فقط وقتی اعلانِ وب می‌دهد که برنامه به صفحهٔ اصلی اضافه شده باشد (iOS ۱۶٫۴+).
 * ⚠️ دکمه‌ها type="button" اند: پنل داخلِ فرمِ تنظیماتِ اعلان نشسته است.
 */
export function PushPanel() {
  const tr = useT();
  const { show } = useToast();
  const [state, setState] = useState<State>('loading');
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    (async () => {
      const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
      const standalone = window.matchMedia('(display-mode: standalone)').matches
        || (navigator as Navigator & { standalone?: boolean }).standalone === true;
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        setState(ios && !standalone ? 'ios-install' : 'unsupported');
        return;
      }
      const setup = await pushSetupAction();
      if (!setup.enabled || !setup.publicKey) { setState('off-server'); return; }
      setPublicKey(setup.publicKey);
      if (Notification.permission === 'denied') { setState('blocked'); return; }
      const sub = await (await registration()).pushManager.getSubscription();
      setState(sub ? 'on' : 'off');
    })().catch(() => setState('unsupported'));
  }, []);

  const enable = () => start(async () => {
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') { setState(permission === 'denied' ? 'blocked' : 'off'); return; }
      const reg = await registration();
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey!) });
      const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
      const result = await subscribePushAction({ endpoint: json.endpoint, keys: json.keys });
      if (result.error) { await sub.unsubscribe(); show(tr(result.error), 'error'); return; }
      setState('on');
      show(tr('اعلان روی این دستگاه روشن شد.'));
    } catch {
      show(tr('روشن کردنِ اعلان روی این دستگاه نشد.'), 'error');
    }
  });

  const disable = () => start(async () => {
    const sub = await (await registration()).pushManager.getSubscription();
    if (sub) {
      await unsubscribePushAction(sub.endpoint).catch(() => {});
      await sub.unsubscribe().catch(() => {});
    }
    setState('off');
    show(tr('اعلان روی این دستگاه خاموش شد.'));
  });

  const test = () => start(async () => {
    await testPushAction();
    show(tr('فرستاده شد؛ چند ثانیه بعد باید برسد.'));
  });

  const message = MESSAGES[state];
  return (
    <Panel title={tr('اعلان روی این دستگاه')}>
      <div className="grid gap-3">
        <p className="text-sm text-muted-foreground">
          {tr('اعلان‌های برنامه روی همین گوشی یا کامپیوتر هم می‌آیند، حتی وقتی برنامه بسته است. هر دستگاه جدا روشن می‌شود.')}
        </p>
        {state === 'loading' ? (
          <Spinner />
        ) : message ? (
          <p className="text-sm text-amber-700 dark:text-amber-500">{tr(message)}</p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {state === 'on' ? (
              <>
                <span className="flex items-center gap-1.5 text-sm text-emerald-700 dark:text-emerald-500">
                  <BellRing className="size-4" />{tr('روشن است')}
                </span>
                <Button type="button" size="sm" variant="outline" disabled={pending} onClick={test}>
                  {tr('ارسالِ اعلانِ آزمایشی')}
                </Button>
                <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={disable}>
                  {tr('خاموش کردن')}
                </Button>
              </>
            ) : (
              <Button type="button" size="sm" disabled={pending} onClick={enable}>
                {pending && <Spinner />}
                {tr('روشن کردنِ اعلان روی این دستگاه')}
              </Button>
            )}
          </div>
        )}
      </div>
    </Panel>
  );
}
