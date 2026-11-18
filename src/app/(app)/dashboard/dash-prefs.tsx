'use client';

import { createContext, useContext, useMemo } from 'react';
import { saveDashLayoutAction, saveDashNoteAction, saveHoursGoalAction } from './_actions';
import type { DashPrefs, DashScope } from '@/server/dashboard-prefs';

/**
 * ترجیحاتِ داشبورد در مرورگر (۳.۱۸.۰): آنچه سرور داد (`initial`) و راهِ ذخیره روی سرور.
 * ⚠️ `readOnly` = «دیدن به‌جای کاربر»: چیدمان و یادداشتِ همان کاربر دیده می‌شود ولی هیچ چیز ذخیره
 * نمی‌شود و دکمهٔ ویرایش پنهان است (سرور هم با requireActor رد می‌کند).
 *
 * کوچ از localStorage: اگر سرور برای کلیدی چیزی ندارد ولی مرورگر دارد (پیش از ۳.۱۸.۰)، همان یک بار
 * به سرور فرستاده می‌شود و **فقط پس از ذخیرهٔ موفق** از مرورگر پاک می‌شود — پس چیزی گم نمی‌شود.
 */
interface Ctx {
  initial: DashPrefs;
  readOnly: boolean;
  /** همه true برمی‌گردانند اگر روی سرور نشست. */
  saveLayout: (scope: DashScope, layout: unknown) => Promise<boolean>;
  saveNote: (note: string) => Promise<boolean>;
  saveGoal: (goal: number) => Promise<boolean>;
}

const NO = async () => false;
const DashPrefsCtx = createContext<Ctx>({ initial: {}, readOnly: false, saveLayout: NO, saveNote: NO, saveGoal: NO });

export function DashPrefsProvider({ initial, readOnly, children }: { initial: DashPrefs; readOnly: boolean; children: React.ReactNode }) {
  const value = useMemo<Ctx>(() => ({
    initial,
    readOnly,
    saveLayout: async (scope, layout) => !readOnly && !(await saveDashLayoutAction(scope, layout)).error,
    saveNote: async (note) => !readOnly && !(await saveDashNoteAction(note)).error,
    saveGoal: async (goal) => !readOnly && !(await saveHoursGoalAction(goal)).error,
  }), [initial, readOnly]);
  return <DashPrefsCtx.Provider value={value}>{children}</DashPrefsCtx.Provider>;
}

export function useDashPrefs() {
  return useContext(DashPrefsCtx);
}

/**
 * کوچِ یک کلیدِ قدیمیِ مرورگر: اگر هست، `save` را صدا می‌زند و فقط با موفقیت پاکش می‌کند.
 * مقدار را برمی‌گرداند تا همان لحظه نمایش داده شود. در حالتِ فقط‌خواندنی هیچ (مرورگرِ مالک است، نه کاربر).
 */
export function migrateLegacy(key: string, readOnly: boolean, save: (raw: string) => Promise<boolean>): string | null {
  if (readOnly) return null;
  let raw: string | null = null;
  try { raw = localStorage.getItem(key); } catch { return null; }
  if (raw === null) return null;
  void save(raw).then((ok) => { if (ok) { try { localStorage.removeItem(key); } catch { /* خصوصی */ } } });
  return raw;
}
