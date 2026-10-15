'use client';

import { useEffect, useRef, useState } from 'react';
import { useLocale, useT } from '@/i18n/client';
import { TURNSTILE_FIELD } from '@/domain/settings/turnstile';

/**
 * ویجتِ کپچای کلودفلر (۲.۳۱.۰) — رندرِ صریح (`render=explicit`)، نه خودکار:
 * React گرهٔ ویجت را بازسازی می‌کند و حالتِ خودکارِ کلودفلر آن را گم می‌کرد.
 *
 * پاسخ در `<input name="cf-turnstile-response">` می‌نشیند و با فرم می‌رود؛
 * `onToken` برای غیرفعال‌کردنِ دکمه تا وقتی پاسخی نیست.
 * ⚠️ هر پاسخ یک‌بارمصرف است: پس از هر ارسالِ ناموفق `resetSignal` را عوض کن.
 */

interface TurnstileApi {
  render(el: HTMLElement, options: Record<string, unknown>): string;
  reset(id: string): void;
  remove(id: string): void;
}

declare global {
  interface Window { turnstile?: TurnstileApi }
}

const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let loading: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (typeof window !== 'undefined' && window.turnstile) return Promise.resolve();
  loading ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SCRIPT;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => { loading = null; reject(new Error('turnstile script')); };
    document.head.appendChild(s);
  });
  return loading;
}

export function TurnstileWidget({
  siteKey, onToken, resetSignal,
}: {
  siteKey: string;
  onToken?: (token: string | null) => void;
  resetSignal?: unknown;
}) {
  const box = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const [token, setToken] = useState('');
  const [failed, setFailed] = useState(false);
  const locale = useLocale();
  const t = useT();
  const tokenCb = useRef(onToken);
  tokenCb.current = onToken;

  useEffect(() => {
    let cancelled = false;
    const update = (value: string) => { setToken(value); tokenCb.current?.(value || null); };
    loadScript().then(() => {
      if (cancelled || !box.current || !window.turnstile) return;
      widget.current = window.turnstile.render(box.current, {
        sitekey: siteKey,
        language: locale,
        theme: 'auto',
        callback: (value: string) => update(value),
        'expired-callback': () => update(''),
        'error-callback': () => update(''),
      });
    }).catch(() => { if (!cancelled) setFailed(true); });
    return () => {
      cancelled = true;
      if (widget.current && window.turnstile) window.turnstile.remove(widget.current);
      widget.current = null;
    };
  }, [siteKey, locale]);

  // پاسخِ مصرف‌شده (پس از ارسالِ ناموفق) دوباره پذیرفته نمی‌شود — چالشِ تازه.
  useEffect(() => {
    if (resetSignal === undefined || !widget.current || !window.turnstile) return;
    window.turnstile.reset(widget.current);
    setToken('');
    tokenCb.current?.(null);
  }, [resetSignal]);

  return (
    <div className="grid justify-items-center gap-1">
      <div ref={box} />
      <input type="hidden" name={TURNSTILE_FIELD} value={token} />
      {failed && (
        <p className="text-center text-xs text-destructive">
          {t('بررسیِ «ربات نیستم» بارگذاری نشد؛ اتصال را بررسی و صفحه را تازه کنید.')}
        </p>
      )}
    </div>
  );
}

