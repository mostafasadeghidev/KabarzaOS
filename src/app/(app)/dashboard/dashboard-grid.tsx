'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Check, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, EyeOff, GripVertical, LayoutGrid, Pencil, Plus, RotateCcw } from 'lucide-react';
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
 *  s = یک ستون · m = دو ستون · l = سه ستون · xl = تمام‌عرض
 *
 * ارتفاع از محتوای خودِ کارت می‌آید (چیدمانِ آجری): ردیف‌های ۸ پیکسلی و هر کارت به اندازهٔ قدِ واقعی‌اش
 * ردیف می‌گیرد — پس کارت‌ها کش نمی‌آیند و دو کارتِ کوتاه در یک ستون زیرِ هم می‌نشینند.
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
  l: '@xl/main:col-span-2 @5xl/main:col-span-3',
  xl: '@xl/main:col-span-2 @5xl/main:col-span-4',
};
const SIZE_LABEL: Record<WidgetSize, string> = { s: 'کوچک', m: 'متوسط', l: 'بزرگ', xl: 'تمام‌عرض' };

/** ردیفِ پایه و فاصلهٔ شبکه (gap-4) — باید با کلاس‌های شبکه یکی باشد. */
const ROW = 8;
const GAP = 16;
/** نزدیکِ لبهٔ بالا/پایین هنگامِ کشیدن، صفحه خودش اسکرول می‌شود. */
const EDGE = 120;

const EMPTY: Prefs = { order: [], hidden: [], shown: [], sizes: {} };

export function DashboardGrid({ widgets, userId }: { widgets: WidgetDef[]; userId: number }) {
  const t = useT();
  const key = `kz-dash-layout-${userId}`;
  const [prefs, setPrefs] = useState<Prefs>(EMPTY);
  const [open, setOpen] = useState(false);
  /** حالتِ ویرایشِ زنده: کشیدن و رها کردن، اندازه و پنهان کردن روی خودِ کارت. */
  const [editing, setEditing] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  /* چیدمانِ آجری: قدِ هر کارت سنجیده و به تعدادِ ردیفِ ۸ پیکسلی تبدیل می‌شود. */
  const [spans, setSpans] = useState<Record<string, number>>({});
  const roRef = useRef<ResizeObserver | null>(null);
  useEffect(() => () => roRef.current?.disconnect(), []);
  const measureRef = useCallback((el: HTMLDivElement | null) => {
    if (!el || typeof ResizeObserver === 'undefined') return;
    roRef.current ??= new ResizeObserver((entries) => {
      setSpans((prev) => {
        let next = prev;
        for (const e of entries) {
          const id = (e.target as HTMLElement).dataset.measure;
          if (!id) continue;
          const span = Math.max(1, Math.ceil((e.target.getBoundingClientRect().height + GAP) / (ROW + GAP)));
          if (prev[id] !== span) { if (next === prev) next = { ...prev }; next[id] = span; }
        }
        return next;
      });
    });
    roRef.current.observe(el);
  }, []);
  const measured = Object.keys(spans).length > 0;

  /* اسکرولِ خودکار هنگامِ کشیدن: نزدیکِ لبهٔ بالا یا پایین، ظرفِ اسکرول (یا خودِ صفحه) حرکت می‌کند. */
  useEffect(() => {
    if (!dragId) return;
    let scroller: HTMLElement | null = gridRef.current?.parentElement ?? null;
    while (scroller && !(/(auto|scroll)/.test(getComputedStyle(scroller).overflowY) && scroller.scrollHeight > scroller.clientHeight)) {
      scroller = scroller.parentElement;
    }
    const target: HTMLElement = scroller ?? (document.scrollingElement as HTMLElement);
    const onOver = (e: DragEvent) => {
      const y = e.clientY;
      const h = window.innerHeight;
      if (y < EDGE) target.scrollBy({ top: -Math.ceil(((EDGE - y) / EDGE) * 40) });
      else if (y > h - EDGE) target.scrollBy({ top: Math.ceil(((y - (h - EDGE)) / EDGE) * 40) });
    };
    document.addEventListener('dragover', onOver);
    return () => document.removeEventListener('dragover', onOver);
  }, [dragId]);
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
  /** جابه‌جاییِ زنده: کارتِ کشیده‌شده درست پیش از کارتِ زیرِ نشانگر می‌نشیند (روی خودِ آن، بعدش). */
  const dropOn = (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    const ids = ordered.map((x) => x.id).filter((id) => id !== dragId);
    const from = ordered.findIndex((x) => x.id === dragId);
    const to = ordered.findIndex((x) => x.id === targetId);
    const at = ids.indexOf(targetId) + (from < to ? 1 : 0);
    ids.splice(at, 0, dragId);
    save({ ...prefs, order: ids });
  };
  /** جلو/عقب بینِ کارت‌های **پیدا** — جایگزینِ کشیدن روی لمس. */
  const nudge = (id: string, dir: -1 | 1) => {
    const vis = ordered.filter(isOn).map((x) => x.id);
    const i = vis.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= vis.length) return;
    const ids = ordered.map((x) => x.id);
    const a = ids.indexOf(vis[i]!), b = ids.indexOf(vis[j]!);
    [ids[a], ids[b]] = [ids[b]!, ids[a]!];
    save({ ...prefs, order: ids });
  };
  /** یک‌کلیکی به اول یا آخرِ داشبورد — برای وقتی که کشیدن در صفحهٔ بلند سخت است. */
  const moveTo = (id: string, where: 'start' | 'end') => {
    const ids = ordered.map((x) => x.id).filter((x) => x !== id);
    if (where === 'start') ids.unshift(id); else ids.push(id);
    save({ ...prefs, order: ids });
  };
  const resize = (w: WidgetDef, size: WidgetSize) => save({ ...prefs, order: ordered.map((x) => x.id), sizes: { ...prefs.sizes, [w.id]: size } });

  const visible = ordered.filter(isOn);
  const groups = [...new Set(ordered.map((w) => w.group))];

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {!editing && <span className="me-auto hidden text-[11px] text-muted-foreground md:inline">{t('میان‌بُر: j / k ردیفِ بعد و قبل، a یا Enter کنشِ اولِ ردیف.')}</span>}
        {editing ? (
          <>
            <span className="me-auto text-xs text-muted-foreground">{t('کارت‌ها را از دستگیره بکشید و جای دیگری رها کنید؛ اندازه و پنهان‌کردن روی خودِ کارت است.')}</span>
            <Button type="button" size="sm" variant="ghost" onClick={() => save(EMPTY)}><RotateCcw className="size-4" />{t('پیش‌فرض')}</Button>
            <Button type="button" size="sm" onClick={() => setEditing(false)}><Check className="size-4" />{t('تمام')}</Button>
          </>
        ) : (
          <>
            <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(true)}>
              <LayoutGrid className="size-4" />{t('فهرستِ کارت‌ها')}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setEditing(true)}>
              <Pencil className="size-4" />{t('ویرایشِ چیدمان')}
            </Button>
          </>
        )}
      </div>

      {/* حالتِ ویرایش: کارت‌های پنهان برای افزودن با یک کلیک. */}
      {editing && ordered.some((w) => !isOn(w)) && (
        <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-dashed p-2">
          <span className="px-1 text-xs text-muted-foreground">{t('افزودنِ کارت:')}</span>
          {ordered.filter((w) => !isOn(w)).map((w) => (
            <button
              key={w.id}
              type="button"
              onClick={() => toggle(w, true)}
              className="flex items-center gap-1 rounded-full border bg-card px-2.5 py-1 text-xs transition-colors hover:border-primary/40 hover:text-primary"
            >
              <Plus className="size-3" />{w.title}
            </button>
          ))}
        </div>
      )}

      {/* grid-flow-row-dense: کارت‌های کوچک جاهای خالیِ کنارِ کارت‌های بزرگ را پر می‌کنند (بنتو). */}
      <div
        ref={gridRef}
        className={cn('grid grid-flow-row-dense grid-cols-1 gap-4 @xl/main:grid-cols-2 @5xl/main:grid-cols-4', measured && 'auto-rows-[8px]')}
      >
        {visible.map((w) => (
          <div
            key={w.id}
            data-widget={w.id}
            ref={measureRef}
            data-measure={w.id}
            style={spans[w.id] ? { gridRowEnd: `span ${spans[w.id]}` } : undefined}
            className={cn(
              'relative grid min-w-0 content-start self-start', SIZE_CLASS[sizeOf(w)],
              editing && 'rounded-2xl outline-2 outline-offset-2 outline-dashed outline-primary/30 transition-transform',
              editing && overId === w.id && dragId !== w.id && 'outline-solid outline-primary',
              dragId === w.id && 'scale-[0.98] opacity-50',
            )}
            onDragOver={(e) => { if (editing && dragId) { e.preventDefault(); setOverId(w.id); } }}
            onDragLeave={() => setOverId((o) => (o === w.id ? null : o))}
            onDrop={(e) => { e.preventDefault(); dropOn(w.id); setDragId(null); setOverId(null); }}
          >
            {/* در حالتِ ویرایش، محتوای کارت کلیک‌پذیر نیست — فقط کنترل‌های چیدمان. */}
            <div className={cn('grid min-w-0', editing && 'pointer-events-none select-none')}>{w.node}</div>
            {editing && (
              <div className="order-first mb-2 flex flex-wrap items-center gap-1 rounded-xl border bg-popover p-1 shadow-xs">
                <span
                  draggable
                  onDragStart={(e) => { setDragId(w.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', w.id); }}
                  onDragEnd={() => { setDragId(null); setOverId(null); }}
                  className="grid size-7 cursor-grab place-items-center rounded-lg text-muted-foreground hover:bg-muted active:cursor-grabbing"
                  title={t('بکشید')}
                >
                  <GripVertical className="size-4" />
                </span>
                <span className="min-w-16 flex-1 truncate px-1 text-xs font-medium">{w.title}</span>
                <span className="flex items-center rounded-lg bg-muted/60 p-0.5">
                  {(Object.keys(SIZE_LABEL) as WidgetSize[]).map((sz) => (
                    <button
                      key={sz}
                      type="button"
                      onClick={() => resize(w, sz)}
                      aria-pressed={sizeOf(w) === sz}
                      title={t(SIZE_LABEL[sz])}
                      className={cn('h-6 min-w-6 rounded-md px-1 text-[10px] font-semibold uppercase', sizeOf(w) === sz ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground')}
                    >
                      {sz}
                    </button>
                  ))}
                </span>
                <Button type="button" size="icon-xs" variant="ghost" aria-label={t('ببر اول')} title={t('ببر اول')} onClick={() => moveTo(w.id, 'start')}><ChevronsRight className="size-3.5 ltr:rotate-180" /></Button>
                <Button type="button" size="icon-xs" variant="ghost" aria-label={t('عقب‌تر')} onClick={() => nudge(w.id, -1)}><ChevronRight className="size-3.5 ltr:rotate-180" /></Button>
                <Button type="button" size="icon-xs" variant="ghost" aria-label={t('جلوتر')} onClick={() => nudge(w.id, 1)}><ChevronLeft className="size-3.5 ltr:rotate-180" /></Button>
                <Button type="button" size="icon-xs" variant="ghost" aria-label={t('ببر آخر')} title={t('ببر آخر')} onClick={() => moveTo(w.id, 'end')}><ChevronsLeft className="size-3.5 ltr:rotate-180" /></Button>
                <Button type="button" size="icon-xs" variant="ghost" aria-label={t('پنهان کردن')} onClick={() => toggle(w, false)} className="text-muted-foreground hover:text-destructive"><EyeOff className="size-3.5" /></Button>
              </div>
            )}
          </div>
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
