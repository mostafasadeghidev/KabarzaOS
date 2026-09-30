'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { PRESENCE_DEFAULTS, PRESENCE_LABELS, type PresenceState } from '@/domain/people/presence';
import {
  dropTab, markTab, otherTabsAlive, shouldBeat, tabWindowMs, type TabRegistry,
} from '@/domain/people/presence-tabs';
import { useT } from '@/i18n/client';
import { Hint } from '@/components/ui/tooltip';

/** دفترچهٔ مشترکِ تب‌ها و زمانِ آخرین ضربانِ فرستاده‌شده — فقط در همین مرورگر. */
const TABS_KEY = 'kbz-presence-tabs';
const SENT_KEY = 'kbz-presence-sent';

/**
 * ⚠️ localStorage ممکن است نباشد یا خطا بدهد (پنجرهٔ خصوصی، دادهٔ مسدود)؛
 * آن‌وقت هر تب مثلِ قبل تنها رفتار می‌کند — بدتر از پیش نمی‌شود.
 */
function readTabs(): TabRegistry {
  try {
    const parsed = JSON.parse(localStorage.getItem(TABS_KEY) ?? '{}') as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as TabRegistry) : {};
  } catch {
    return {};
  }
}
function writeTabs(registry: TabRegistry) {
  try { localStorage.setItem(TABS_KEY, JSON.stringify(registry)); } catch { /* بی‌اهمیت */ }
}
function readSent(): number | null {
  try {
    const n = Number(localStorage.getItem(SENT_KEY));
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}
function writeSent(at: number) {
  try { localStorage.setItem(SENT_KEY, String(at)); } catch { /* بی‌اهمیت */ }
}

interface LivePresence {
  states: Record<number, PresenceState>;
  register: (id: number) => () => void;
}

const PresenceContext = createContext<LivePresence | null>(null);

/**
 * حضورِ زنده — ضربانِ خودِ کاربر **و** تازه‌نگه‌داشتنِ نقطه‌های صفحه.
 *
 * ⚠️ سه رفتارِ پیشین سرِ جایشان‌اند (بدونشان حضور دروغ می‌گوید):
 *  ۱. هر ضربان می‌گوید تب **متمرکز** است یا نه — حالتِ میانیِ «باز ولی بی‌فعالیت».
 *  ۲. بستنِ تب آفلاین می‌کند — ولی حالا فقط اگر **آخرین** تب باشد.
 *  ۳. برگشتن به تب بی‌درنگ ضربان می‌فرستد.
 *
 * دو رفتارِ تازه:
 *  ۴. چند تبِ باز یک صدا دارند: تبِ پس‌زمینه وقتی تبِ دیگری تازه فرستاده، نمی‌فرستد.
 *  ۵. نقطه‌های حضورِ صفحه (`PresenceDot` با `userId`) هر ضربان با یک درخواستِ
 *     سبک تازه می‌شوند؛ پیش از این تا رفرشِ دستی همان رنگِ لحظهٔ بازشدن را داشتند.
 */
export function PresenceProvider({
  enabled,
  ping = PRESENCE_DEFAULTS.ping,
  children,
}: {
  enabled: boolean;
  ping?: number;
  children: React.ReactNode;
}) {
  const interval = ping > 0 ? ping : PRESENCE_DEFAULTS.ping;
  const [states, setStates] = useState<Record<number, PresenceState>>({});
  // شناسه ← تعدادِ نقطه‌های سوارشده با آن شناسه.
  const watched = useRef(new Map<number, number>());

  const register = useCallback((id: number) => {
    watched.current.set(id, (watched.current.get(id) ?? 0) + 1);
    return () => {
      const n = (watched.current.get(id) ?? 1) - 1;
      if (n <= 0) watched.current.delete(id);
      else watched.current.set(id, n);
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const tabId = crypto.randomUUID();
    const windowMs = tabWindowMs(interval);
    let alive = true;

    const isFocused = () => document.visibilityState === 'visible' && document.hasFocus();

    const beat = (focused: boolean) => {
      const now = Date.now();
      writeTabs(markTab(readTabs(), tabId, now, windowMs));
      if (!shouldBeat(focused, readSent(), now, interval)) return;
      writeSent(now);
      void fetch(`/api/presence?focused=${focused ? '1' : '0'}`, { method: 'POST', keepalive: true })
        .catch(() => { /* شکستِ ضربان بی‌اهمیت است */ });
    };

    // ⚠️ تبِ پنهان نقطه‌ها را تازه نمی‌کند — کسی نگاهش نمی‌کند.
    const refresh = () => {
      if (document.visibilityState !== 'visible' || watched.current.size === 0) return;
      const ids = [...watched.current.keys()].join(',');
      void fetch(`/api/presence?ids=${ids}`, { cache: 'no-store' })
        .then((r) => (r.ok ? (r.json() as Promise<Record<number, PresenceState>>) : null))
        .then((data) => { if (alive && data) setStates(data); })
        .catch(() => { /* رنگِ فعلی سرِ جایش می‌ماند */ });
    };

    const tick = () => { beat(isFocused()); refresh(); };

    beat(isFocused());
    const timer = setInterval(tick, interval * 1000);

    const onVisible = () => { if (document.visibilityState === 'visible') tick(); };
    const onLeave = () => {
      const now = Date.now();
      const registry = dropTab(readTabs(), tabId);
      writeTabs(registry);
      // ⚠️ فقط آخرین تب آفلاین می‌کند؛ تبِ دیگری که باز است ضربانش را ادامه می‌دهد.
      if (otherTabsAlive(registry, tabId, now, windowMs)) return;
      navigator.sendBeacon?.('/api/presence?state=offline');
    };

    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    window.addEventListener('pagehide', onLeave);

    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      window.removeEventListener('pagehide', onLeave);
      writeTabs(dropTab(readTabs(), tabId));
    };
  }, [enabled, interval]);

  const value = useMemo(() => ({ states, register }), [states, register]);
  return <PresenceContext.Provider value={enabled ? value : null}>{children}</PresenceContext.Provider>;
}

const DOT_CLASS: Record<PresenceState, string> = {
  active: 'bg-emerald-500',
  idle: 'bg-amber-400',
  offline: 'bg-muted-foreground/40',
};

/**
 * نقطهٔ حضور — سه رنگ برای سه حالت.
 * با `userId` زنده می‌ماند: رنگِ لحظهٔ رندرِ سرور نقطهٔ شروع است و هر ضربان
 * جایش را حالتِ تازه می‌گیرد. بی‌`userId` همان رنگِ ثابت.
 */
export function PresenceDot({
  state,
  userId,
  className = '',
}: {
  state: PresenceState;
  userId?: number;
  className?: string;
}) {
  const t = useT();
  const live = useContext(PresenceContext);
  const register = live?.register;
  useEffect(() => (userId && register ? register(userId) : undefined), [userId, register]);

  const shown = (userId && live?.states[userId]) || state;
  return (
    <Hint label={t(PRESENCE_LABELS[shown])}>
      <span
        aria-label={t(PRESENCE_LABELS[shown])}
        className={`inline-block size-2 shrink-0 rounded-full ${DOT_CLASS[shown]} ${className}`}
      />
    </Hint>
  );
}
