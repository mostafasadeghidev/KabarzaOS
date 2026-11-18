'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, EyeOff, GripVertical, LayoutGrid, Pencil, Plus, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { useT } from '@/i18n/client';
import { CardHelpProvider } from '@/components/ui/card-help';
import { Hint } from '@/components/ui/tooltip';
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
  /** متنِ علامتِ سؤالِ کنارِ عنوان: کارت برای چیست و چه نشان می‌دهد. */
  hint?: string;
  node: React.ReactNode;
}
interface Prefs {
  order: string[]; hidden: string[]; shown: string[]; sizes: Record<string, WidgetSize>;
  /** ستونِ شروعِ هر کارت روی شبکهٔ چهارستونه (۰ = ستونِ اول). نبودن = خودکار (کوتاه‌ترین ستون). */
  cols?: Record<string, number>;
}
const WIDTH: Record<WidgetSize, number> = { s: 1, m: 2, l: 3, xl: 4 };
interface Pos { c: number; y: number; wd: number; span: number }

/**
 * جای‌گذاریِ صریح: کارت‌ها به ترتیب، هر کدام در ستونِ انتخابیِ خودش (یا کوتاه‌ترین ستون) و درست زیرِ
 * بلندترین کارتِ آن ستون‌ها می‌نشینند. پس کارتی که به ستونی برده شود همان‌جا می‌ماند و جای خالیِ
 * زیرِ کارت‌ها پر می‌شود — نه مثلِ grid-flow-dense که مرورگر خودش جا را انتخاب می‌کند.
 */
function placeAll(
  list: Array<{ id: string; size: WidgetSize }>, cols: number, spans: Record<string, number>, prefCols: Record<string, number>,
): Map<string, Pos> | null {
  const heights = Array<number>(cols).fill(0);
  const out = new Map<string, Pos>();
  const placed: Pos[] = [];
  const hits = (c: number, wd: number, y: number, span: number) =>
    placed.some((p) => p.c < c + wd && c < p.c + p.wd && p.y < y + span && y < p.y + p.span);
  for (const w of list) {
    const span = spans[w.id];
    if (!span) return null;
    const wd = Math.min(cols, WIDTH[w.size]);
    const top = (c: number) => Math.max(...heights.slice(c, c + wd));
    let c: number;
    let y: number;
    const pref = prefCols[w.id];
    if (cols > 1 && pref !== undefined) {
      // ستونِ انتخابیِ کاربر: درست زیرِ آخرین کارتِ همان ستون‌ها (ترتیب = جای عمودی).
      c = Math.min(Math.max(0, Math.floor((pref * cols) / 4)), cols - wd);
      y = top(c);
    } else {
      // خودکار: پایین‌ترین جای خالیِ ممکن در هر ستون — جاهای خالیِ کنارِ کارت‌های پهن پر می‌شوند.
      c = 0; y = Infinity;
      for (let i = 0; i <= cols - wd; i++) {
        const tries = [0, ...placed.filter((p) => p.c < i + wd && i < p.c + p.wd).map((p) => p.y + p.span)].sort((a, b) => a - b);
        const fit = tries.find((ty) => !hits(i, wd, ty, span)) ?? top(i);
        if (fit < y) { y = fit; c = i; }
      }
    }
    for (let i = c; i < c + wd; i++) heights[i] = Math.max(heights[i]!, y + span);
    const pos = { c, y, wd, span };
    placed.push(pos);
    out.set(w.id, pos);
  }
  return out;
}

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

/** چیدمانِ پیش‌فرض: ترتیب و ستونِ شروعِ هر کارت (روی شبکهٔ چهارستونه). */
export interface DefaultLayout { order: string[]; cols: Record<string, number>; sizes?: Record<string, WidgetSize> }

export function DashboardGrid({ widgets, userId, scope, defaults }: {
  widgets: WidgetDef[];
  userId: number;
  /**
   * چیدمانی که کاربرِ بی‌ترجیح می‌بیند و دکمهٔ «پیش‌فرض» به آن برمی‌گردد. نبودن = ترتیبِ فهرستِ ویجت‌ها و جای خودکار.
   */
  defaults?: DefaultLayout;
  /** چیدمانِ داشبوردِ عضو جدا از مدیر ذخیره می‌شود. */
  scope?: string;
}) {
  const t = useT();
  const key = scope ? `kz-dash-layout-${scope}-${userId}` : `kz-dash-layout-${userId}`;
  const base = useMemo<Prefs>(() => (defaults ? { ...EMPTY, order: defaults.order, cols: defaults.cols, sizes: defaults.sizes ?? {} } : EMPTY), [defaults]);
  const [prefs, setPrefs] = useState<Prefs>(base);
  const [open, setOpen] = useState(false);
  /** حالتِ ویرایشِ زنده: کشیدن و رها کردن، اندازه و پنهان کردن روی خودِ کارت. */
  const [editing, setEditing] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  /** پیش‌نمایشِ کشیدن: کارتِ کشیده‌شده در کدام ستون و پیش از کدام کارت می‌نشیند. */
  const [preview, setPreview] = useState<{ col: number; before: string | null } | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  /** شمارِ ستون‌های فعلیِ شبکه (۱ گوشی، ۲ متوسط، ۴ پهن) — از خودِ CSS خوانده می‌شود. */
  const [cols, setCols] = useState(1);
  useEffect(() => {
    const el = gridRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const read = () => setCols(Math.max(1, getComputedStyle(el).gridTemplateColumns.split(' ').filter(Boolean).length));
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* چیدمانِ آجری: قدِ هر کارت سنجیده و به تعدادِ ردیفِ ۸ پیکسلی تبدیل می‌شود. */
  const [spans, setSpans] = useState<Record<string, number>>({});
  /*
   * ⚠️ ناظر در افکت ساخته می‌شود و عنصرها در یک Set می‌مانند: در حالتِ توسعه React افکت را یک بار
   * می‌بندد و دوباره باز می‌کند، و ref ها دوباره صدا زده نمی‌شوند — ناظرِ قطع‌شده دیگر چیزی نمی‌سنجید.
   */
  const roRef = useRef<ResizeObserver | null>(null);
  const elsRef = useRef(new Set<HTMLElement>());
  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
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
    roRef.current = ro;
    for (const el of elsRef.current) ro.observe(el);
    return () => { ro.disconnect(); roRef.current = null; };
  }, []);
  const measureRef = useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    elsRef.current.add(el);
    roRef.current?.observe(el);
    return () => { elsRef.current.delete(el); roRef.current?.unobserve(el); };
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
  const visible = ordered.filter(isOn);
  const prefCols = prefs.cols ?? {};
  const asList = (ws: WidgetDef[]) => ws.map((w) => ({ id: w.id, size: sizeOf(w) }));
  /** ستونِ نمای فعلی ← ستونِ شبکهٔ چهارستونه (همان چیزی که ذخیره می‌شود). */
  const to4 = (c: number) => (cols === 4 ? c : Math.round((c * 4) / cols));

  // نمای در حالِ کشیدن: ترتیب و ستونِ پیش‌نمایش؛ وگرنه ترجیحِ ذخیره‌شده.
  const shown = useMemo(() => {
    if (!dragId || !preview) return { list: visible, cols: prefCols };
    const others = visible.filter((w) => w.id !== dragId);
    const dragged = visible.find((w) => w.id === dragId);
    if (!dragged) return { list: visible, cols: prefCols };
    const at = preview.before ? others.findIndex((w) => w.id === preview.before) : -1;
    const list = at < 0 ? [...others, dragged] : [...others.slice(0, at), dragged, ...others.slice(at)];
    return { list, cols: { ...prefCols, [dragId]: to4(preview.col) } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragId, preview, visible, prefs]);
  const layout = cols > 1 ? placeAll(asList(shown.list), cols, spans, shown.cols) : null;

  /**
   * «ثابت کردن»: ستونِ فعلیِ **همهٔ** کارت‌ها ذخیره و ترتیب بر اساسِ جای عمودیِ فعلی مرتب می‌شود، تا با
   * هر جابه‌جایی بقیهٔ کارت‌ها همان‌جا بمانند (کارت‌های خودکار ممکن است جای خالی را پر کرده باشند).
   */
  const freeze = (): { order: string[]; cols: Record<string, number> } => {
    const ids = ordered.map((x) => x.id);
    if (cols <= 1) return { order: ids, cols: prefCols };
    const now = placeAll(asList(visible), cols, spans, prefCols);
    if (!now) return { order: ids, cols: prefCols };
    const out: Record<string, number> = { ...prefCols };
    for (const [id, pos] of now) out[id] = to4(pos.c);
    const vis = [...now.entries()].sort((a, b) => a[1].y - b[1].y || a[1].c - b[1].c).map(([id]) => id);
    return { order: [...vis, ...ids.filter((id) => !now.has(id))], cols: out };
  };

  /** از جای نشانگر: ستون (با رعایتِ راست‌به‌چپ) و کارتی که باید پیش از آن نشست. */
  const pointTo = (x: number, y: number) => {
    const el = gridRef.current;
    const dragged = visible.find((w) => w.id === dragId);
    if (!el || !dragged || cols <= 1) return null;
    const rect = el.getBoundingClientRect();
    const colW = (rect.width - GAP * (cols - 1)) / cols;
    const rtl = getComputedStyle(el).direction === 'rtl';
    const rel = rtl ? rect.right - x : x - rect.left;
    const wd = Math.min(cols, WIDTH[sizeOf(dragged)]);
    const col = Math.min(Math.max(0, Math.floor(rel / (colW + GAP))), cols - wd);
    const row = (y - rect.top) / (ROW + GAP);
    // چیدمانِ بقیه بی کارتِ کشیده‌شده — ثابت، تا پیش‌نمایش نوسان نکند.
    const others = visible.filter((w) => w.id !== dragId);
    const base = placeAll(asList(others), cols, spans, prefCols);
    if (!base) return null;
    let before: string | null = null;
    let bestY = Infinity;
    for (const w of others) {
      const pos = base.get(w.id)!;
      const overlaps = pos.c < col + wd && col < pos.c + pos.wd;
      if (overlaps && pos.y + pos.span / 2 > row && pos.y < bestY) { bestY = pos.y; before = w.id; }
    }
    return { col, before };
  };
  const onGridDragOver = (e: React.DragEvent) => {
    if (!editing || !dragId) return;
    e.preventDefault();
    const next = pointTo(e.clientX, e.clientY);
    if (next && (next.col !== preview?.col || next.before !== preview?.before)) setPreview(next);
  };
  const onGridDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (dragId && preview) {
      const base = prefCols;
      const ids = prefs.order.length ? prefs.order.filter((id) => id !== dragId) : ordered.map((x) => x.id).filter((id) => id !== dragId);
      const at = preview.before ? ids.indexOf(preview.before) : -1;
      if (at < 0) ids.push(dragId); else ids.splice(at, 0, dragId);
      save({ ...prefs, order: ids, cols: { ...base, [dragId]: to4(preview.col) } });
    }
    setDragId(null);
    setPreview(null);
  };

  /** ستونِ قبلی/بعدی — جایگزینِ کشیدن روی لمس. */
  const shiftCol = (id: string, dir: -1 | 1) => {
    const pos = layout?.get(id);
    if (!pos) return;
    const c = Math.min(Math.max(0, pos.c + dir), cols - pos.wd);
    if (c === pos.c) return;
    const f = freeze();
    save({ ...prefs, order: f.order, cols: { ...f.cols, [id]: to4(c) } });
  };
  /** بالاتر/پایین‌تر: جای ترتیبِ کارت با نزدیک‌ترین کارتِ بالا یا پایینِ همان ستون‌ها عوض می‌شود. */
  const shiftRow = (id: string, dir: -1 | 1) => {
    const f = freeze();
    const ids = f.order;
    const pos = layout?.get(id);
    let other: string | null = null;
    if (pos) {
      let best = dir < 0 ? -Infinity : Infinity;
      for (const [oid, o] of layout!) {
        if (oid === id || !(o.c < pos.c + pos.wd && pos.c < o.c + o.wd)) continue;
        if (dir < 0 ? o.y < pos.y && o.y > best : o.y > pos.y && o.y < best) { best = o.y; other = oid; }
      }
    } else {
      const vis = visible.map((w) => w.id);
      other = vis[vis.indexOf(id) + dir] ?? null;
    }
    if (!other) return;
    const a = ids.indexOf(id), b = ids.indexOf(other);
    [ids[a], ids[b]] = [ids[b]!, ids[a]!];
    save({ ...prefs, order: ids, cols: f.cols });
  };
  const resize = (w: WidgetDef, size: WidgetSize) => save({ ...prefs, order: ordered.map((x) => x.id), sizes: { ...prefs.sizes, [w.id]: size } });

  const groups = [...new Set(ordered.map((w) => w.group))];

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {/* میان‌بُرها فقط در صفِ مدیر کار می‌کنند — داشبوردِ عضو و کارفرما (scope) راهنمایش را نمی‌بینند. */}
        {!editing && !scope && <span className="me-auto hidden text-[11px] text-muted-foreground md:inline">{t('میان‌بُر: j / k ردیفِ بعد و قبل، a یا Enter کنشِ اولِ ردیف.')}</span>}
        {editing ? (
          <>
            <span className="me-auto text-xs text-muted-foreground">{t('کارت‌ها را از دستگیره بکشید و جای دیگری رها کنید؛ اندازه و پنهان‌کردن روی خودِ کارت است.')}</span>
            <Button type="button" size="sm" variant="ghost" onClick={() => save(base)}><RotateCcw className="size-4" />{t('پیش‌فرض')}</Button>
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
        data-dash-editing={editing ? '1' : undefined}
        className={cn(
          'grid grid-cols-1 gap-4 @xl/main:grid-cols-2 @5xl/main:grid-cols-4',
          !layout && 'grid-flow-row-dense',
          measured && 'auto-rows-[8px]',
          // جای رها کردن زیرِ همهٔ کارت‌ها.
          editing && 'pb-40',
        )}
        onDragOver={onGridDragOver}
        onDrop={onGridDrop}
      >
        {shown.list.map((w) => {
          const pos = layout?.get(w.id);
          return (
          <div
            key={w.id}
            data-widget={w.id}
            ref={measureRef}
            data-measure={w.id}
            style={pos
              ? { gridColumn: `${pos.c + 1} / span ${pos.wd}`, gridRow: `${pos.y + 1} / span ${pos.span}` }
              : spans[w.id] ? { gridRowEnd: `span ${spans[w.id]}` } : undefined}
            className={cn(
              'relative grid min-w-0 content-start self-start', !pos && SIZE_CLASS[sizeOf(w)],
              editing && 'rounded-2xl outline-2 outline-offset-2 outline-dashed outline-primary/30',
              dragId === w.id && 'opacity-50 outline-solid outline-primary',
            )}
          >
            {/* در حالتِ ویرایش، محتوای کارت کلیک‌پذیر نیست — فقط کنترل‌های چیدمان. */}
            <div className={cn('grid min-w-0', editing && 'pointer-events-none select-none')}><CardHelpProvider text={w.hint}>{w.node}</CardHelpProvider></div>
            {editing && (
              <div className="order-first mb-2 flex flex-wrap items-center gap-1 rounded-xl border bg-popover p-1 shadow-xs">
                <span
                  draggable
                  onDragStart={(e) => { save({ ...prefs, ...freeze() }); setDragId(w.id); setPreview(null); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', w.id); }}
                  onDragEnd={() => { setDragId(null); setPreview(null); }}
                  className="grid size-7 cursor-grab place-items-center rounded-lg text-muted-foreground hover:bg-muted active:cursor-grabbing"
                  aria-label={t('بکشید')}
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
                      aria-label={t(SIZE_LABEL[sz])}
                      className={cn('h-6 min-w-6 rounded-md px-1 text-[10px] font-semibold uppercase', sizeOf(w) === sz ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground')}
                    >
                      {sz}
                    </button>
                  ))}
                </span>
                {cols > 1 && <Hint label={t('ستونِ قبلی')}><Button type="button" size="icon-xs" variant="ghost" aria-label={t('ستونِ قبلی')} onClick={() => shiftCol(w.id, -1)}><ChevronRight className="size-3.5 ltr:rotate-180" /></Button></Hint>}
                {cols > 1 && <Hint label={t('ستونِ بعدی')}><Button type="button" size="icon-xs" variant="ghost" aria-label={t('ستونِ بعدی')} onClick={() => shiftCol(w.id, 1)}><ChevronLeft className="size-3.5 ltr:rotate-180" /></Button></Hint>}
                <Hint label={t('بالاتر')}><Button type="button" size="icon-xs" variant="ghost" aria-label={t('بالاتر')} onClick={() => shiftRow(w.id, -1)}><ChevronUp className="size-3.5" /></Button></Hint>
                <Hint label={t('پایین‌تر')}><Button type="button" size="icon-xs" variant="ghost" aria-label={t('پایین‌تر')} onClick={() => shiftRow(w.id, 1)}><ChevronDown className="size-3.5" /></Button></Hint>
                <Button type="button" size="icon-xs" variant="ghost" aria-label={t('پنهان کردن')} onClick={() => toggle(w, false)} className="text-muted-foreground hover:text-destructive"><EyeOff className="size-3.5" /></Button>
              </div>
            )}
          </div>
          );
        })}
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
            <Button type="button" variant="ghost" onClick={() => save(base)}><RotateCcw className="size-4" />{t('بازگشت به پیش‌فرض')}</Button>
            <Button type="button" onClick={() => setOpen(false)}>{t('تمام')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
