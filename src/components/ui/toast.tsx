'use client';

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react';
import { CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useT } from '@/i18n/client';

/**
 * توست — بازخوردِ کوتاهِ هر کارِ موفق یا ناموفق.
 *
 * ⚠️ چرا لازم شد: بازخورد تا امروز **درجا** بود — یک خطِ سبز داخلِ همان
 * فرم. روی فرمی که پس از ذخیره بسته می‌شود، آن خط با خودِ فرم ناپدید
 * می‌شد و کاربر نمی‌فهمید کار انجام شده یا نه؛ و روی فهرست‌های بلند،
 * پیام بالای صفحه می‌ماند بیرون از دید.
 *
 * ⚠️ چرا از صفر و نه یک کتابخانه: تنها چیزی که لازم بود صفی از پیام‌ها با
 * شمارندهٔ خودکار است. `sonner` برای همین یک وابستگیِ زمانِ اجرا و یک
 * پورتالِ اضافه می‌آورد، و رنگ و جهتش را باز باید با پالتِ خودمان و RTL
 * هماهنگ می‌کردیم.
 *
 * ⚠️ RTL: جای توست با `start`/`end` تعیین می‌شود نه `left`/`right`، پس در
 * فارسی سمتِ چپ و در انگلیسی سمتِ راست می‌نشیند — همان‌جایی که چشم پس از
 * خواندنِ سطر می‌رسد.
 */

export type ToastKind = 'success' | 'error' | 'info';

export interface ToastItem {
  id: number;
  kind: ToastKind;
  /** متنِ **ترجمه‌شده**. توست خودش ترجمه نمی‌کند. */
  text: string;
}

interface ToastApi {
  show: (text: string, kind?: ToastKind) => void;
}

const ToastContext = createContext<ToastApi>({ show: () => {} });

/** پس از این مدت خودش می‌رود. خطا کمی بیشتر می‌ماند تا خوانده شود. */
const LIFETIME: Record<ToastKind, number> = {
  success: 3200,
  info: 3600,
  error: 5200,
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  /** ⚠️ تایمرها باید هنگامِ unmount پاک شوند وگرنه روی state ِ مرده می‌نشینند. */
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: number) => {
    setItems((list) => list.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const show = useCallback((text: string, kind: ToastKind = 'success') => {
    const trimmed = text.trim();
    if (trimmed === '') return;
    seq.current += 1;
    const id = seq.current;
    setItems((list) => [...list.slice(-3), { id, kind, text: trimmed }]);
    timers.current.set(id, setTimeout(() => dismiss(id), LIFETIME[kind]));
  }, [dismiss]);

  useEffect(() => {
    const map = timers.current;
    return () => {
      for (const timer of map.values()) clearTimeout(timer);
      map.clear();
    };
  }, []);

  const api = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <Viewport items={items} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

const STYLE: Record<ToastKind, { box: string; Icon: typeof CheckCircle2 }> = {
  success: {
    box: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300',
    Icon: CheckCircle2,
  },
  error: {
    box: 'border-destructive/30 bg-destructive/10 text-destructive',
    Icon: XCircle,
  },
  info: {
    box: 'border-border bg-card text-foreground',
    Icon: Info,
  },
};

function Viewport({
  items,
  onDismiss,
}: {
  items: ToastItem[];
  onDismiss: (id: number) => void;
}) {
  const t = useT();
  if (items.length === 0) return null;

  return (
    /**
     * ⚠️ `aria-live="polite"` و نه `assertive`: پیامِ موفقیت نباید حرفِ
     * صفحه‌خوان را وسطِ کار قطع کند.
     * ⚠️ `pointer-events-none` روی ظرف تا کلیک از کنارِ توست به صفحه برسد؛
     * خودِ کارت دوباره فعالش می‌کند.
     */
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed bottom-4 end-4 z-[100] flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2"
    >
      {items.map((item) => {
        const { box, Icon } = STYLE[item.kind];
        return (
          <div
            key={item.id}
            className={cn(
              'pointer-events-auto flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm shadow-lg',
              'animate-in fade-in slide-in-from-bottom-2 duration-200',
              box,
            )}
          >
            <Icon className="mt-0.5 size-4 shrink-0" />
            <span className="flex-1 leading-snug">{item.text}</span>
            <button
              type="button"
              onClick={() => onDismiss(item.id)}
              aria-label={t('بستن')}
              className="shrink-0 opacity-60 transition-opacity hover:opacity-100"
            >
              <X className="size-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

export function useToast(): ToastApi {
  return useContext(ToastContext);
}

/**
 * پلِ میانِ `useActionState` و توست.
 *
 * ⚠️ چرا یک قلابِ جدا: تقریباً هر فرمِ اپ همین سه خط را لازم دارد —
 * «اگر ok شد پیام را نشان بده، اگر error شد خطا را» — و نوشتنِ دستی‌اش در
 * هر فرم یعنی جا افتادنِ یکی‌شان.
 *
 * ⚠️ روی **هر تغییرِ state** یک بار عمل می‌کند، نه روی هر رندر: `useEffect`
 * به خودِ شیءِ state وابسته است و هر پاسخِ اکشن شیءِ تازه‌ای است.
 */
export function useActionToast(
  state: { ok?: boolean; error?: string; message?: string } | null | undefined,
  options: { success?: string } = {},
): void {
  const { show } = useToast();
  const t = useT();
  const seen = useRef<unknown>(null);

  useEffect(() => {
    if (!state || state === seen.current) return;
    seen.current = state;

    if (state.error) {
      show(t(state.error), 'error');
      return;
    }
    if (state.ok || state.message) {
      show(t(state.message ?? options.success ?? 'انجام شد.'), 'success');
    }
  }, [state, show, t, options.success]);
}
