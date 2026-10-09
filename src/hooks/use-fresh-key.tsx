'use client';

import { createContext, useContext, useState, type ComponentType } from 'react';

/**
 * کلیدی که با **هر بار باز شدنِ** یک پنجره عوض می‌شود (۲.۱۷.۱).
 *
 * ⚠️ چرا: حالتِ فرمی که بیرون از محتوای دیالوگ نگه داشته شده (ردیف‌های اعضا،
 * انتخاب‌های فرم) با بستنِ پنجره پاک نمی‌شد؛ کاربر عضوی اضافه می‌کرد، «ذخیره»
 * نمی‌زد، می‌بست و دوباره باز می‌کرد — همان تغییرِ ذخیره‌نشده هنوز آنجا بود.
 * بدنهٔ دیالوگ را با این کلید رندر کنید تا هر باز شدن از دادهٔ ذخیره‌شده شروع شود.
 *
 * تغییرِ حالت در حینِ رندر الگوی مجازِ React برای «حالتِ مشتق از prop» است.
 */
export function useFreshKey(open: boolean): number {
  const [generation, setGeneration] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setGeneration((g) => g + 1);
  }
  return generation;
}

type OpenState = [boolean, (open: boolean) => void];
const OpenContext = createContext<OpenState | null>(null);

/**
 * حالتِ «باز بودن» ِ دیالوگی که با `withFreshOpen` پوشیده شده — بیرون از آن
 * همان `useState(false)` ِ معمولی است.
 */
export function useDialogOpen(): OpenState {
  const shared = useContext(OpenContext);
  const local = useState(false);
  return shared ?? local;
}

/**
 * دیالوگِ خودبسنده (دکمه + پنجره در یک کامپوننت) ← هر باز شدن بدنه را از نو
 * می‌سازد. بدنه به‌جای `useState(false)` از `useDialogOpen()` استفاده می‌کند.
 */
export function withFreshOpen<P extends object>(Body: ComponentType<P>) {
  function Fresh(props: P) {
    const [open, setOpen] = useState(false);
    const key = useFreshKey(open);
    return (
      <OpenContext.Provider value={[open, setOpen]}>
        <Body key={key} {...props} />
      </OpenContext.Provider>
    );
  }
  Fresh.displayName = `Fresh(${Body.displayName ?? Body.name})`;
  return Fresh;
}
