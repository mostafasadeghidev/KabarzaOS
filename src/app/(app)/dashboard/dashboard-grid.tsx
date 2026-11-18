'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, LayoutGrid, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { useT } from '@/i18n/client';
import { cn } from '@/lib/utils';

/**
 * شبکهٔ بنتوی سفارشی (نمونهٔ محلی) — هر کارتِ داشبورد یک «ویجت» است؛ کاربر انتخاب می‌کند کدام‌ها دیده
 * شوند، به چه ترتیب و با چه اندازه‌ای. ترجیح فعلاً در مرورگر (localStorage) — اگر پسندیده شود باید روی
 * کاربر در پایگاه‌داده بنشیند تا روی هر دستگاهی یکی باشد.
 *
 * اندازه‌ها روی شبکهٔ چهارستونه (۲ ستون در عرضِ متوسط، ۱ ستون روی گوشی):
 *  s = یک خانه · m = دو خانهٔ افقی · l = دو×دو (بلند) · xl = تمام‌عرض
 */

export type WidgetSize = 's' | 'm' | 'l' | 'xl';
export interface WidgetDef {
  id: string;
  title: string;
  group: string;
  size: WidgetSize;
  defaultOn: boolean;
  node: React.ReactNode;
}
interface Prefs { order: string[]; hidden: string[]; shown: string[]; sizes: Record<string, WidgetSize> }

const SIZE_CLASS: Record<WidgetSize, string> = {
  s: '',
  m: '@xl/main:col-span-2',
  l: '@xl/main:col-span-2 @5xl/main:row-span-2',
  xl: '@xl/main:col-span-2 @5xl/main:col-span-4',
};
const SIZE_LABEL: Record<WidgetSize, string> = { s: 'کوچک', m: 'متوسط', l: 'بزرگ', xl: 'تمام‌عرض' };

const EMPTY: Prefs = { order: [], hidden: [], shown: [], sizes: {} };

export function DashboardGrid({ widgets, userId }: { widgets: WidgetDef[]; userId: number }) {
  const t = useT();
  const key = `kz-dash-layout-${userId}`;
  const [prefs, setPrefs] = useState<Prefs>(EMPTY);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    try { const raw = localStorage.getItem(key); if (raw) setPrefs({ ...EMPTY, ...JSON.parse(raw) as Partial<Prefs> }); } catch { /* خصوصی */ }
  }, [key]);
  const save = (p: Prefs) => { setPrefs(p); try { localStorage.setItem(key, JSON.stringify(p)); } catch { /* پر */ } };

  // ترتیب: ترجیحِ کاربر، و ویجت‌های تازه (که در ترجیح نیستند) به ترتیبِ پیش‌فرض در جای خودشان.
  const ordered = useMemo(() => {
    const byId = new Map(widgets.map((w) => [w.id, w]));
    const known = prefs.order.filter((id) => byId.has(id));
    const rest = widgets.filter((w) => !known.includes(w.id)).map((w) => w.id);
    return [...known, ...rest].map((id) => byId.get(id)!);
  }, [widgets, prefs.order]);
  const isOn = (w: WidgetDef) => (prefs.hidden.includes(w.id) ? false : prefs.shown.includes(w.id) ? true : w.defaultOn);
  const sizeOf = (w: WidgetDef) => prefs.sizes[w.id] ?? w.size;

  const toggle = (w: WidgetDef, on: boolean) => save({
    ...prefs,
    order: ordered.map((x) => x.id),
    hidden: on ? prefs.hidden.filter((id) => id !== w.id) : [...new Set([...prefs.hidden, w.id])],
    shown: on ? [...new Set([...prefs.shown, w.id])] : prefs.shown.filter((id) => id !== w.id),
  });
  const move = (i: number, dir: -1 | 1) => {
    const ids = ordered.map((x) => x.id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    save({ ...prefs, order: ids });
  };
  const resize = (w: WidgetDef, size: WidgetSize) => save({ ...prefs, order: ordered.map((x) => x.id), sizes: { ...prefs.sizes, [w.id]: size } });

  const visible = ordered.filter(isOn);
  const groups = [...new Set(ordered.map((w) => w.group))];

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-end gap-3">
        <span className="hidden text-[11px] text-muted-foreground md:inline">{t('میان‌بُر: j / k ردیفِ بعد و قبل، a یا Enter کنشِ اولِ ردیف.')}</span>
        <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
          <LayoutGrid className="size-4" />{t('سفارشی‌سازی')}
        </Button>
      </div>

      {/* grid-flow-row-dense: کارت‌های کوچک جاهای خالیِ کنارِ کارت‌های بزرگ را پر می‌کنند (بنتو). */}
      <div className="grid grid-flow-row-dense grid-cols-1 gap-4 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
        {visible.map((w) => (
          <div key={w.id} className={cn('grid min-w-0', SIZE_CLASS[sizeOf(w)])}>{w.node}</div>
        ))}
      </div>
      {visible.length === 0 && (
        <p className="py-10 text-center text-sm text-muted-foreground">{t('همهٔ کارت‌ها پنهان‌اند. از «سفارشی‌سازی» چند کارت روشن کنید.')}</p>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('سفارشی‌سازیِ داشبورد')}</DialogTitle>
            <DialogDescription>{t('کارت‌ها را روشن یا خاموش کنید، جابه‌جا کنید و اندازه‌شان را بگذارید.')}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            {groups.map((g) => (
              <div key={g} className="grid gap-1.5">
                <h3 className="text-xs font-semibold text-muted-foreground">{t(g)}</h3>
                <ul className="grid divide-y rounded-xl border">
                  {ordered.map((w, i) => w.group !== g ? null : (
                    <li key={w.id} className="flex items-center gap-2 px-3 py-2">
                      <label className="flex min-w-0 flex-1 items-center gap-2 text-sm">
                        <Checkbox checked={isOn(w)} onCheckedChange={(v) => toggle(w, v === true)} />
                        <span className="truncate">{w.title}</span>
                      </label>
                      <NativeSelect
                        size="sm" aria-label={t('اندازه')} className="h-7 text-xs" containerClassName="w-24"
                        value={sizeOf(w)} onChange={(e) => resize(w, e.target.value as WidgetSize)} disabled={!isOn(w)}
                      >
                        {(Object.keys(SIZE_LABEL) as WidgetSize[]).map((sz) => <NativeSelectOption key={sz} value={sz}>{t(SIZE_LABEL[sz])}</NativeSelectOption>)}
                      </NativeSelect>
                      <Button type="button" size="icon-xs" variant="ghost" aria-label={t('بالاتر')} onClick={() => move(i, -1)} disabled={i === 0}><ArrowUp className="size-3.5" /></Button>
                      <Button type="button" size="icon-xs" variant="ghost" aria-label={t('پایین‌تر')} onClick={() => move(i, 1)} disabled={i === ordered.length - 1}><ArrowDown className="size-3.5" /></Button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            <Button type="button" variant="ghost" onClick={() => save(EMPTY)}><RotateCcw className="size-4" />{t('بازگشت به پیش‌فرض')}</Button>
            <Button type="button" onClick={() => setOpen(false)}>{t('تمام')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
