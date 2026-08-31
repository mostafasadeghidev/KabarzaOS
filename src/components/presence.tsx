'use client';

import { useEffect, useRef } from 'react';
import { PRESENCE_DEFAULTS, PRESENCE_LABELS, type PresenceState } from '@/domain/people/presence';
import { useT } from '@/i18n/client';

/**
 * ضربانِ حضور.
 *
 * ⚠️ سه رفتار که بدونشان حضور دروغ می‌گوید:
 *  ۱. هر ضربان می‌گوید تب **متمرکز** است یا نه — از همین، حالتِ میانیِ
 *     «باز ولی بی‌فعالیت» ساخته می‌شود.
 *  ۲. بستنِ تب فوراً آفلاین می‌کند؛ وگرنه کاربر تا پنج دقیقه «آنلاین» می‌ماند.
 *  ۳. برگشتن به تب بی‌درنگ یک ضربان می‌فرستد، نه اینکه تا تیکِ بعدی صبر کند.
 */
export function PresenceHeartbeat({ ping = PRESENCE_DEFAULTS.ping }: { ping?: number }) {
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  // ⚠️ فاصله از تنظیماتِ سامانه می‌آید؛ مقدارِ نامعتبر به پیش‌فرض برمی‌گردد.
  const interval = ping > 0 ? ping : PRESENCE_DEFAULTS.ping;

  useEffect(() => {
    const beat = (focused: boolean) => {
      void fetch(`/api/presence?focused=${focused ? '1' : '0'}`, {
        method: 'POST',
        keepalive: true,
      }).catch(() => {
        // شکستِ ضربان بی‌اهمیت است؛ نباید چیزی در UI بشکند.
      });
    };

    const isFocused = () => document.visibilityState === 'visible' && document.hasFocus();

    beat(isFocused());
    timer.current = setInterval(() => beat(isFocused()), interval * 1000);

    const onVisible = () => {
      if (document.visibilityState === 'visible') beat(true);
    };
    const onLeave = () => {
      // بستنِ تب — sendBeacon تضمین می‌کند درخواست فرستاده شود.
      navigator.sendBeacon?.('/api/presence?state=offline');
    };

    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    window.addEventListener('pagehide', onLeave);

    return () => {
      if (timer.current) clearInterval(timer.current);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      window.removeEventListener('pagehide', onLeave);
    };
  }, [interval]);

  return null;
}

const DOT_CLASS: Record<PresenceState, string> = {
  active: 'bg-emerald-500',
  idle: 'bg-amber-400',
  offline: 'bg-muted-foreground/40',
};

/** نقطهٔ حضور — سه رنگ برای سه حالت. */
export function PresenceDot({
  state,
  className = '',
}: {
  state: PresenceState;
  className?: string;
}) {
  const t = useT();
  return (
    <span
      title={t(PRESENCE_LABELS[state])}
      aria-label={t(PRESENCE_LABELS[state])}
      className={`inline-block size-2 shrink-0 rounded-full ${DOT_CLASS[state]} ${className}`}
    />
  );
}
