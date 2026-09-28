'use client';

/**
 * توست — کدِ رسمیِ shadcn (`toast`, base-nova) روی Toast ِ Base UI.
 *
 * ⚠️ چرا Base UI در اپی که روی Radix است: shadcn برای Radix توستی ندارد (آنجا
 * Sonner است) و این همان قطعه‌ای است که کاربر در مستنداتِ shadcn پسندید:
 * پشته‌شدنِ توست‌ها، باز شدن با نگه‌داشتنِ ماوس (تایمر هم می‌ایستد)، کشیدن
 * برای بستن و دکمهٔ «کار» (`actionProps`). فقط همین فایل از Base UI می‌خواند.
 *
 * تغییرها روی کدِ رسمی:
 *  · RTL (R-I18N-05): `right-4`/`left-auto`/`right-0`/`after:left-0` ←
 *    `end-4`/`start-auto`/`end-0`/`after:inset-x-0`؛ در فارسی توست سمتِ چپ
 *    می‌نشیند و کشیدن برای بستن هم به همان سمت است (`swipeDirection`).
 *  · گوشهٔ `rounded-xl` مثلِ بقیهٔ سطح‌ها (DESIGN.md §۶)، نه `rounded-2xl`.
 *  · `z-[100]`: توستِ «ذخیره شد» باید روی دیالوگِ باز (z-50) دیده شود.
 *  · آیکون‌ها از lucide، و برچسبِ دکمهٔ بستن ترجمه‌شده.
 *
 * ⚠️ API ِ قبلی دست‌نخورده است — `useToast().show(text, kind)` و
 * `useActionToast(state)` — پس هیچ‌کدام از صدازننده‌ها عوض نشدند. برای کارهای
 * تازه `toast.add({ title, description, type, actionProps })` هم هست.
 *
 * ⚠️ توست در **ریشه** سوار می‌شود (layout.tsx): صفحهٔ ورود و پوستهٔ عضوِ
 * سابق هم فرم دارند و بازخوردشان نباید بی‌صدا بماند.
 */

import * as React from 'react';
import { Toast as ToastPrimitive } from '@base-ui/react/toast';
import {
  CircleCheckIcon, InfoIcon, Loader2Icon, OctagonXIcon, TriangleAlertIcon, XIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDirection } from '@/components/ui/direction';
import { useT } from '@/i18n/client';
import { cn } from '@/lib/utils';

const toast = ToastPrimitive.createToastManager();

function ToastProviderRoot({ ...props }: ToastPrimitive.Provider.Props) {
  return <ToastPrimitive.Provider {...props} />;
}

function ToastPortal({ ...props }: ToastPrimitive.Portal.Props) {
  return <ToastPrimitive.Portal data-slot="toast-portal" {...props} />;
}

function ToastViewport({ className, ...props }: ToastPrimitive.Viewport.Props) {
  return (
    <ToastPrimitive.Viewport
      data-slot="toast-viewport"
      className={cn(
        'pointer-events-none fixed inset-x-4 bottom-4 z-[100] mx-auto w-auto max-w-sm outline-none sm:start-auto sm:end-4 sm:mx-0 sm:w-full',
        className,
      )}
      {...props}
    />
  );
}

function Toast({ className, ...props }: ToastPrimitive.Root.Props) {
  return (
    <ToastPrimitive.Root
      data-slot="toast"
      className={cn(
        'group/toast pointer-events-auto absolute end-0 bottom-0 z-[calc(1000-var(--toast-index))] w-full origin-bottom rounded-xl border bg-popover text-popover-foreground shadow-lg will-change-transform outline-none select-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
        '[--gap:0.75rem] [--height:var(--toast-frontmost-height,var(--toast-height))] [--offset-y:calc(var(--toast-offset-y)*-1+calc(var(--toast-index)*var(--gap)*-1)+var(--toast-swipe-movement-y))] [--peek:0.75rem] [--scale:calc(max(0,1-(var(--toast-index)*0.1)))] [--shrink:calc(1-var(--scale))]',
        'h-(--height) [transform:translateX(var(--toast-swipe-movement-x))_translateY(calc(var(--toast-swipe-movement-y)-(var(--toast-index)*var(--peek))-(var(--shrink)*var(--height))))_scale(var(--scale))] [transition:transform_500ms_cubic-bezier(0.22,1,0.36,1),opacity_500ms,height_150ms]',
        "after:absolute after:inset-x-0 after:top-full after:h-[calc(var(--gap)+1px)] after:content-['']",
        'data-expanded:h-(--toast-height) data-expanded:[transform:translateX(var(--toast-swipe-movement-x))_translateY(var(--offset-y))]',
        'data-limited:opacity-0 data-starting-style:[transform:translateY(150%)]',
        '[&[data-ending-style]:not([data-limited]):not([data-swipe-direction])]:[transform:translateY(150%)]',
        'data-ending-style:data-[swipe-direction=down]:[transform:translateY(calc(var(--toast-swipe-movement-y)+150%))]',
        'data-ending-style:data-[swipe-direction=left]:[transform:translateX(calc(var(--toast-swipe-movement-x)-150%))_translateY(var(--offset-y))]',
        'data-ending-style:data-[swipe-direction=right]:[transform:translateX(calc(var(--toast-swipe-movement-x)+150%))_translateY(var(--offset-y))]',
        'data-ending-style:data-[swipe-direction=up]:[transform:translateY(calc(var(--toast-swipe-movement-y)-150%))]',
        'data-expanded:data-ending-style:data-[swipe-direction=down]:[transform:translateY(calc(var(--toast-swipe-movement-y)+150%))]',
        'data-expanded:data-ending-style:data-[swipe-direction=left]:[transform:translateX(calc(var(--toast-swipe-movement-x)-150%))_translateY(var(--offset-y))]',
        'data-expanded:data-ending-style:data-[swipe-direction=right]:[transform:translateX(calc(var(--toast-swipe-movement-x)+150%))_translateY(var(--offset-y))]',
        'data-expanded:data-ending-style:data-[swipe-direction=up]:[transform:translateY(calc(var(--toast-swipe-movement-y)-150%))]',
        className,
      )}
      {...props}
    />
  );
}

function ToastContent({ className, ...props }: ToastPrimitive.Content.Props) {
  return (
    <ToastPrimitive.Content
      data-slot="toast-content"
      className={cn(
        'flex h-full items-center gap-3 overflow-hidden p-4 transition-opacity duration-250 ease-[cubic-bezier(0.22,1,0.36,1)] data-behind:opacity-0 data-expanded:opacity-100',
        className,
      )}
      {...props}
    />
  );
}

function ToastTitle({ className, ...props }: ToastPrimitive.Title.Props) {
  return (
    <ToastPrimitive.Title
      data-slot="toast-title"
      className={cn('text-sm leading-snug font-medium', className)}
      {...props}
    />
  );
}

function ToastDescription({ className, ...props }: ToastPrimitive.Description.Props) {
  return (
    <ToastPrimitive.Description
      data-slot="toast-description"
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  );
}

function ToastAction({
  className,
  render = <Button variant="outline" size="sm" />,
  ...props
}: ToastPrimitive.Action.Props) {
  return (
    <ToastPrimitive.Action
      data-slot="toast-action"
      render={render}
      className={cn('shrink-0', className)}
      {...props}
    />
  );
}

function ToastClose({
  className,
  children,
  render = <Button variant="ghost" size="icon-sm" />,
  ...props
}: ToastPrimitive.Close.Props) {
  const t = useT();
  return (
    <ToastPrimitive.Close
      data-slot="toast-close"
      aria-label={t('بستن')}
      render={render}
      className={cn(
        "relative shrink-0 text-muted-foreground after:absolute after:-inset-2 after:content-[''] hover:text-foreground",
        className,
      )}
      {...props}
    >
      {children ?? <XIcon aria-hidden="true" />}
    </ToastPrimitive.Close>
  );
}

/**
 * آیکونِ نوع — تنها جایی که رنگِ معنایی می‌آید. خودِ کارت خنثی است
 * (DESIGN.md: رنگِ معنایی فقط معنا می‌رساند، نه زمینهٔ کلِ پیام).
 */
function ToastIcon({ type }: { type: string | undefined }) {
  const icon =
    type === 'success' ? <CircleCheckIcon className="text-success" /> :
    type === 'info' ? <InfoIcon className="text-muted-foreground" /> :
    type === 'warning' ? <TriangleAlertIcon className="text-amber-600 dark:text-amber-400" /> :
    type === 'error' ? <OctagonXIcon className="text-destructive" /> :
    type === 'loading' ? <Loader2Icon className="animate-spin text-muted-foreground" /> :
    null;
  if (!icon) return null;
  return (
    <span
      data-slot="toast-icon"
      aria-hidden="true"
      className="shrink-0 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4"
    >
      {icon}
    </span>
  );
}

function ToastList() {
  const { toasts } = ToastPrimitive.useToastManager();
  // ⚠️ توست کنارِ لبهٔ «انتها» می‌نشیند (در فارسی چپ)؛ کشیدن به همان سمت می‌بندد.
  const swipe = useDirection() === 'rtl' ? 'left' : 'right';

  return toasts.map((toastItem) => (
    <Toast key={toastItem.id} toast={toastItem} swipeDirection={['down', swipe]}>
      <ToastContent>
        <ToastIcon type={toastItem.type} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <ToastTitle />
          <ToastDescription />
        </div>
        <ToastAction />
        <ToastClose />
      </ToastContent>
    </Toast>
  ));
}

function Toaster({ children, toastManager = toast, ...props }: ToastPrimitive.Provider.Props) {
  return (
    <ToastProviderRoot toastManager={toastManager} {...props}>
      {children}
      <ToastPortal>
        <ToastViewport>
          <ToastList />
        </ToastViewport>
      </ToastPortal>
    </ToastProviderRoot>
  );
}

const createToastManager = ToastPrimitive.createToastManager;
const useToastManager = ToastPrimitive.useToastManager;

/* ─── API ِ اپ — همان امضای قبلی ─────────────────────────────────────── */

export type ToastKind = 'success' | 'error' | 'info' | 'warning';

interface ToastApi {
  show: (text: string, kind?: ToastKind) => void;
}

/** پس از این مدت خودش می‌رود. خطا کمی بیشتر می‌ماند تا خوانده شود. */
const LIFETIME: Record<ToastKind, number> = {
  success: 3200,
  info: 3600,
  warning: 5200,
  error: 5200,
};

/** در ریشهٔ اپ یک بار — همان جای `ToastProvider` ِ قبلی. */
function ToastProvider({ children }: { children: React.ReactNode }) {
  return <Toaster>{children}</Toaster>;
}

const api: ToastApi = {
  show(text, kind = 'success') {
    const trimmed = text.trim();
    if (trimmed === '') return;
    toast.add({
      title: trimmed,
      type: kind,
      timeout: LIFETIME[kind],
      // ⚠️ خطا فوری اعلام می‌شود؛ پیامِ موفقیت حرفِ صفحه‌خوان را قطع نمی‌کند.
      priority: kind === 'error' ? 'high' : 'low',
    });
  },
};

/** `const { show } = useToast(); show(t('ذخیره شد.'))` — متن **ترجمه‌شده** است. */
function useToast(): ToastApi {
  return api;
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
function useActionToast(
  state: { ok?: boolean; error?: string; message?: string } | null | undefined,
  options: { success?: string } = {},
): void {
  const { show } = useToast();
  const t = useT();
  const seen = React.useRef<unknown>(null);

  React.useEffect(() => {
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

export {
  Toaster,
  Toast,
  ToastAction,
  ToastClose,
  ToastContent,
  ToastDescription,
  ToastPortal,
  ToastProvider,
  ToastTitle,
  ToastViewport,
  createToastManager,
  toast,
  useActionToast,
  useToast,
  useToastManager,
};
