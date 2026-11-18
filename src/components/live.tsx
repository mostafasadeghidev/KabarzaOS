'use client';

import * as React from 'react';

/**
 * گیرندهٔ خبرهای لحظه‌ای در مرورگر (۳.۱۴.۰) — یک `EventSource` به `/api/live` برای کلِ برنامه.
 *
 * نشان‌ها (`usePulse`) و گفتگوی باز با `useLiveEvents` خبر می‌گیرند و همان لحظه تازه می‌شوند. تا وقتی
 * خط برقرار است، پرسیدنِ دوره‌ای فقط پشتیبان است (خیلی کم‌تکرار)؛ خط که قطع شد، `connected` خاموش
 * می‌شود و همان پرسیدنِ قبلی برمی‌گردد. `EventSource` خودش دوباره وصل می‌شود.
 */

export type LiveKind = 'ready' | 'pulse' | 'm';
type Handler = (kind: LiveKind, data: string) => void;

interface LiveApi { connected: boolean; subscribe: (fn: Handler) => () => void }
const LiveContext = React.createContext<LiveApi>({ connected: false, subscribe: () => () => {} });

export function LiveProvider({ enabled, children }: { enabled: boolean; children: React.ReactNode }) {
  const [connected, setConnected] = React.useState(false);
  const handlers = React.useRef(new Set<Handler>());

  React.useEffect(() => {
    if (!enabled || typeof EventSource === 'undefined') return;
    const es = new EventSource('/api/live');
    const emit = (kind: LiveKind) => (e: MessageEvent) => {
      for (const fn of handlers.current) fn(kind, String(e.data ?? ''));
    };
    const onReady = (e: MessageEvent) => { setConnected(true); emit('ready')(e); };
    es.addEventListener('ready', onReady);
    es.addEventListener('pulse', emit('pulse'));
    es.addEventListener('m', emit('m'));
    // قطع شد (شبکه، استقرارِ تازه، پراکسی) ← پرسیدنِ دوره‌ای تا وصلِ دوباره؛ EventSource خودش تلاش می‌کند.
    es.onerror = () => setConnected(false);
    return () => { es.close(); setConnected(false); };
  }, [enabled]);

  const api = React.useMemo<LiveApi>(() => ({
    connected,
    subscribe(fn) { handlers.current.add(fn); return () => { handlers.current.delete(fn); }; },
  }), [connected]);

  return <LiveContext.Provider value={api}>{children}</LiveContext.Provider>;
}

/** خبرها را می‌گیرد؛ `handler` می‌تواند در هر رندر عوض شود (ref). */
export function useLiveEvents(handler: Handler): boolean {
  const { connected, subscribe } = React.useContext(LiveContext);
  const ref = React.useRef(handler);
  ref.current = handler;
  React.useEffect(() => subscribe((kind, data) => ref.current(kind, data)), [subscribe]);
  return connected;
}
