'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, CloudUpload, RotateCw, WifiOff, X } from 'lucide-react';
import { useT } from '@/i18n/client';
import { useToast } from '@/components/ui/toast';
import { humanSize } from '@/domain/files/upload';
import { cn } from '@/lib/utils';
import { loadUploads, removeUpload, saveUpload, type StoredUpload } from './upload-store';

/**
 * مدیرِ آپلود (۳.۱۰.۰) — در چیدمانِ اصلی سوار است، پس با رفتن به صفحه‌های دیگرِ برنامه قطع نمی‌شود.
 *
 *  · فایل تکه‌تکه (۸ مگ) به `/api/uploads` می‌رود؛ سرور هر تکه را مستقیم به مقصدِ نهایی
 *    (Nextcloud یا S3) می‌فرستد.
 *  · اینترنت قطع شد ← «منتظرِ اینترنت…»؛ وصل شد ← سرور می‌گوید کدام تکه‌ها رسیده‌اند و از تکهٔ
 *    بعدی ادامه می‌دهد. خطای گذرا با فاصلهٔ فزاینده دوباره تلاش می‌شود.
 *  · صفحه بسته یا تازه شد ← فایل در IndexedDB مانده و دفعهٔ بعد خودش ادامه می‌دهد.
 *  · یکی‌یکی، به ترتیب — پهنای باند میانِ چند فایل تقسیم نمی‌شود و اولی زودتر تمام می‌شود.
 */

type Status = 'queued' | 'uploading' | 'waiting' | 'finishing' | 'done' | 'error';

interface Item {
  localId: string;
  name: string;
  size: number;
  status: Status;
  sent: number;
  error?: string;
}

interface UploadApi {
  add: (files: File[], options: { projectId: number; label: string }) => void;
}

const UploadContext = React.createContext<UploadApi | null>(null);

/** `add` برای فرم‌ها؛ بیرون از provider (مثلاً صفحهٔ ورود) null است. */
export function useUploads(): UploadApi | null {
  return React.useContext(UploadContext);
}

/** خطایی که تلاشِ دوباره درستش نمی‌کند (نوعِ نامجاز، بی‌دسترسی، پروژهٔ منجمد). */
class FatalUpload extends Error {}
class Canceled extends Error {}

const BACKOFF = [1, 2, 4, 8, 15, 30];
const RETRYABLE = new Set([0, 408, 409, 425, 500, 502, 503, 504]);

export function UploadProvider({ userId, children }: { userId: number; children: React.ReactNode }) {
  const t = useT();
  const router = useRouter();
  const { show } = useToast();
  const [items, setItems] = React.useState<Item[]>([]);
  const [open, setOpen] = React.useState(true);
  const files = React.useRef(new Map<string, StoredUpload>());
  const queue = React.useRef<string[]>([]);
  const canceled = React.useRef(new Set<string>());
  const running = React.useRef(false);
  const xhr = React.useRef<XMLHttpRequest | null>(null);
  const wake = React.useRef<(() => void) | null>(null);

  const patch = React.useCallback((localId: string, p: Partial<Item>) => {
    setItems((list) => list.map((i) => (i.localId === localId ? { ...i, ...p } : i)));
  }, []);

  /** صبر تا وصل شدنِ اینترنت یا گذشتنِ زمان — هر کدام زودتر. لغو هم بیدارش می‌کند. */
  const pause = (ms: number) => new Promise<void>((resolve) => {
    const done = () => { clearTimeout(timer); window.removeEventListener('online', done); wake.current = null; resolve(); };
    const timer = setTimeout(done, ms);
    window.addEventListener('online', done);
    wake.current = done;
  });

  /** یک درخواست با تلاشِ دوباره؛ خطای قطعی ← FatalUpload با پیامِ سرور. */
  const request = React.useCallback(async (localId: string, run: () => Promise<Response>): Promise<Response> => {
    for (let attempt = 0; ; attempt++) {
      if (canceled.current.has(localId)) throw new Canceled();
      if (!navigator.onLine) { patch(localId, { status: 'waiting' }); await pause(30_000); continue; }
      let res: Response | null = null;
      try { res = await run(); } catch { res = null; }
      if (res && res.ok) return res;
      const status = res?.status ?? 0;
      const body = res ? await res.json().catch(() => ({})) as { error?: string; retry?: boolean } : {};
      if (!RETRYABLE.has(status) && !body.retry) throw new FatalUpload(body.error ?? t('آپلود انجام نشد.'));
      patch(localId, { status: 'waiting' });
      await pause(BACKOFF[Math.min(attempt, BACKOFF.length - 1)]! * 1000);
    }
  }, [patch, t]);

  /** یک تکه با XHR — چون fetch پیشرفتِ ارسال را نمی‌دهد. */
  const sendChunk = (uploadId: string, n: number, body: Blob, onProgress: (loaded: number) => void) =>
    new Promise<Response>((resolve, reject) => {
      const x = new XMLHttpRequest();
      xhr.current = x;
      x.open('PUT', `/api/uploads/${uploadId}/${n}`);
      x.setRequestHeader('Content-Type', 'application/octet-stream');
      x.upload.onprogress = (e) => onProgress(e.loaded);
      x.onload = () => resolve(new Response(x.responseText || null, { status: x.status }));
      x.onerror = () => reject(new TypeError('network'));
      x.onabort = () => reject(new Canceled());
      x.send(body);
    }).finally(() => { xhr.current = null; });

  const runOne = React.useCallback(async (localId: string) => {
    const item = files.current.get(localId);
    if (!item) return;
    const json = (method: string, url: string, body?: unknown) => () => fetch(url, {
      method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined,
    });
    patch(localId, { status: 'uploading', error: undefined });
    try {
      let status: { chunkSize: number; totalChunks: number; received: number[] } | null = null;
      for (let restarts = 0; !status; restarts++) {
        if (!item.uploadId) {
          const started = await (await request(localId, json('POST', '/api/uploads', {
            projectId: item.projectId, name: item.file.name, size: item.file.size, mime: item.file.type, label: item.label,
          }))).json() as { id: string };
          item.uploadId = started.id;
          await saveUpload(item);
        }
        const res = await fetch(`/api/uploads/${item.uploadId}`).catch(() => null);
        // جلسه پاک شده (۴۸ ساعت رها مانده بود) ← یک بار از نو شروع کن.
        if (res?.status === 404 && restarts < 1) { item.uploadId = undefined; continue; }
        status = res?.ok ? await res.json() : await (await request(localId, () => fetch(`/api/uploads/${item.uploadId}`))).json();
      }
      const { chunkSize, totalChunks } = status;
      const got = new Set(status.received);
      const lengthOf = (n: number) => Math.min(chunkSize, item.file.size - n * chunkSize);
      let done = [...got].reduce((s, n) => s + lengthOf(n), 0);
      patch(localId, { sent: done, status: 'uploading' });

      for (let n = 0; n < totalChunks; n++) {
        if (got.has(n)) continue;
        const blob = item.file.slice(n * chunkSize, n * chunkSize + lengthOf(n));
        await request(localId, () => {
          patch(localId, { status: 'uploading' });
          return sendChunk(item.uploadId!, n, blob, (loaded) => patch(localId, { sent: done + loaded }));
        });
        done += blob.size;
        patch(localId, { sent: done });
      }

      patch(localId, { status: 'finishing' });
      await request(localId, json('POST', `/api/uploads/${item.uploadId}/complete`));
      patch(localId, { status: 'done', sent: item.file.size });
      files.current.delete(localId);
      await removeUpload(localId);
      show(t('«{name}» بارگذاری شد.', { name: item.file.name }), 'success');
      router.refresh();
      setTimeout(() => setItems((list) => list.filter((i) => i.localId !== localId)), 4000);
    } catch (error) {
      if (error instanceof Canceled) return;
      const message = error instanceof FatalUpload ? error.message : t('آپلود انجام نشد.');
      patch(localId, { status: 'error', error: message });
      show(`${item.file.name}: ${message}`, 'error');
    }
  }, [patch, request, router, show, t]);

  const pump = React.useCallback(async () => {
    if (running.current) return;
    running.current = true;
    try {
      while (queue.current.length > 0) {
        const next = queue.current.shift()!;
        if (!canceled.current.has(next)) await runOne(next);
      }
    } finally {
      running.current = false;
    }
  }, [runOne]);

  const enqueue = React.useCallback((stored: StoredUpload, initial: Status = 'queued') => {
    files.current.set(stored.localId, stored);
    queue.current.push(stored.localId);
    setItems((list) => [...list, { localId: stored.localId, name: stored.file.name, size: stored.file.size, status: initial, sent: 0 }]);
  }, []);

  // آپلودهای نیمه‌کارهٔ همین کاربر (پس از تازه شدن یا بستنِ صفحه) خودشان ادامه می‌دهند.
  React.useEffect(() => {
    let alive = true;
    void loadUploads(userId).then((saved) => {
      if (!alive || saved.length === 0) return;
      for (const s of saved) if (!files.current.has(s.localId)) enqueue(s);
      void pump();
    });
    return () => { alive = false; };
  }, [userId, enqueue, pump]);

  // هشدارِ مرورگر پیش از بستنِ صفحه وسطِ آپلود — ادامه ممکن است، ولی کاربر بداند.
  const busy = items.some((i) => i.status !== 'done' && i.status !== 'error');
  React.useEffect(() => {
    if (!busy) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [busy]);

  const api = React.useMemo<UploadApi>(() => ({
    add(list, { projectId, label }) {
      list.forEach((file, index) => {
        const stored: StoredUpload = {
          localId: crypto.randomUUID(), userId, projectId, file, addedAt: Date.now() + index,
          // چند فایل با یک برچسب ← شماره می‌گیرند (مثلِ آپلودِ قبلی).
          label: list.length > 1 && label ? `${label} ${index + 1}` : label,
        };
        void saveUpload(stored);
        enqueue(stored);
      });
      setOpen(true);
      void pump();
    },
  }), [userId, enqueue, pump]);

  const cancel = async (localId: string) => {
    canceled.current.add(localId);
    xhr.current?.abort();
    wake.current?.();
    const stored = files.current.get(localId);
    files.current.delete(localId);
    queue.current = queue.current.filter((id) => id !== localId);
    setItems((list) => list.filter((i) => i.localId !== localId));
    await removeUpload(localId);
    if (stored?.uploadId) await fetch(`/api/uploads/${stored.uploadId}`, { method: 'DELETE' }).catch(() => undefined);
  };

  const retry = (localId: string) => {
    canceled.current.delete(localId);
    queue.current.push(localId);
    patch(localId, { status: 'queued', error: undefined });
    void pump();
  };

  return (
    <UploadContext.Provider value={api}>
      {children}
      {items.length > 0 && (
        <UploadPanel items={items} open={open} onToggle={() => setOpen((o) => !o)} onCancel={cancel} onRetry={retry} />
      )}
    </UploadContext.Provider>
  );
}

function UploadPanel({ items, open, onToggle, onCancel, onRetry }: {
  items: Item[];
  open: boolean;
  onToggle: () => void;
  onCancel: (id: string) => void;
  onRetry: (id: string) => void;
}) {
  const t = useT();
  const active = items.filter((i) => i.status !== 'done').length;
  const total = items.reduce((s, i) => s + i.size, 0);
  const sent = items.reduce((s, i) => s + Math.min(i.sent, i.size), 0);
  const percent = total > 0 ? Math.floor((sent / total) * 100) : 0;
  const label: Record<Status, string> = {
    queued: t('در صف'),
    uploading: '',
    waiting: t('منتظرِ اینترنت…'),
    finishing: t('در حالِ ثبت…'),
    done: t('بارگذاری شد'),
    error: '',
  };

  return (
    <section
      data-upload-panel
      aria-live="polite"
      className="fixed bottom-24 end-4 z-50 md:bottom-4 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-lg"
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-start text-sm font-medium hover:bg-muted/60"
      >
        <CloudUpload className="size-4 text-primary" />
        <span className="flex-1">
          {active > 0 ? t('در حالِ آپلود ({n})', { n: active }) : t('آپلودها تمام شد')}
        </span>
        {active > 0 && <span className="num text-xs text-muted-foreground">{percent}%</span>}
        <ChevronDown className={cn('size-4 transition-transform', !open && 'rotate-180')} />
      </button>
      {open && (
        <ul className="grid max-h-72 gap-2 overflow-y-auto border-t p-3">
          {items.map((i) => {
            const p = i.size > 0 ? Math.min(100, Math.floor((i.sent / i.size) * 100)) : 0;
            return (
              <li key={i.localId} className="grid gap-1.5">
                <div className="flex items-center gap-2 text-sm">
                  {i.status === 'waiting' && <WifiOff className="size-3.5 shrink-0 text-amber-700 dark:text-amber-500" />}
                  <span className="min-w-0 flex-1 truncate" dir="auto">{i.name}</span>
                  {i.status === 'error' ? (
                    <button type="button" onClick={() => onRetry(i.localId)} aria-label={`${t('تلاشِ دوباره')} — ${i.name}`}
                      className="grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
                      <RotateCw className="size-3.5" />
                    </button>
                  ) : null}
                  {i.status !== 'done' && i.status !== 'finishing' && (
                    <button type="button" onClick={() => onCancel(i.localId)} aria-label={`${t('لغوِ آپلود')} — ${i.name}`}
                      className="grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-destructive">
                      <X className="size-3.5" />
                    </button>
                  )}
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={p} aria-valuemin={0} aria-valuemax={100} aria-label={i.name}>
                  <div
                    className={cn('h-full rounded-full transition-[width] duration-300',
                      i.status === 'error' ? 'bg-destructive' : i.status === 'waiting' ? 'bg-amber-500' : 'bg-primary')}
                    style={{ width: `${p}%` }}
                  />
                </div>
                <p className={cn('flex justify-between gap-2 text-[11px]', i.status === 'error' ? 'text-destructive' : 'text-muted-foreground')}>
                  <span>{i.status === 'error' ? i.error : label[i.status] || `${p}%`}</span>
                  <span className="num">{humanSize(Math.min(i.sent, i.size), t)} / {humanSize(i.size, t)}</span>
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
