'use client';

import { useEffect, useState } from 'react';
import Script from 'next/script';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Spinner } from '@/components/ui/spinner';
import { useT } from '@/i18n/client';

interface TelegramWebApp {
  initData: string;
  ready: () => void;
  expand: () => void;
}
declare global {
  interface Window { Telegram?: { WebApp?: TelegramWebApp } }
}

const MESSAGES: Record<string, string> = {
  outside: 'این صفحه فقط از داخلِ ربات تلگرام باز می‌شود؛ در ربات دکمهٔ «باز کردنِ برنامه» را بزنید.',
  not_linked: 'این حسابِ تلگرام به کاربری وصل نیست. یک بار با ایمیل و رمز وارد شوید و از پروفایل ← «اعلان‌ها و تلگرام» وصلش کنید.',
  inactive: 'دسترسیِ این حساب فعال نیست.',
  off: 'ربات تلگرام روی این سامانه راه‌اندازی نشده است.',
  invalid: 'ورود از تلگرام تأیید نشد؛ مینی‌اپ را ببندید و دوباره از ربات باز کنید.',
  network: 'به سرور وصل نشد؛ دوباره امتحان کنید.',
};

/**
 * ورودِ خودکار در مینی‌اپ. ⚠️ فقط `initData` (رشتهٔ امضاشده) فرستاده می‌شود؛
 * سرور امضا را با توکنِ ربات می‌سنجد.
 */
export function MiniAppLogin({ next }: { next: string }) {
  const tr = useT();
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loaded) return;
    const app = window.Telegram?.WebApp;
    if (!app || !app.initData) {
      setError('outside');
      return;
    }
    app.ready();
    app.expand();
    (async () => {
      try {
        const res = await fetch('/api/telegram/webapp-login', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ initData: app.initData, next }),
        });
        const data = await res.json().catch(() => null) as { ok?: boolean; to?: string; reason?: string } | null;
        if (data?.ok && data.to) window.location.replace(data.to);
        else setError(data?.reason ?? 'invalid');
      } catch {
        setError('network');
      }
    })();
  }, [loaded, next]);

  return (
    <>
      <Script src="https://telegram.org/js/telegram-web-app.js" strategy="afterInteractive" onReady={() => setLoaded(true)} onError={() => setError('outside')} />
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{tr(MESSAGES[error] ?? MESSAGES.invalid!)}</AlertDescription>
        </Alert>
      ) : (
        <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Spinner />{tr('در حالِ ورود از تلگرام…')}
        </p>
      )}
    </>
  );
}
