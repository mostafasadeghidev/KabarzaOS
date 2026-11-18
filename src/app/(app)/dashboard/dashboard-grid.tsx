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
import { HeaderAction } from '@/components/header-actions';
import { ExpandFillProvider } from '@/components/ui/expandable-list';
import { cn } from '@/lib/utils';
import { TaskDialog } from '../projects/[id]/task-dialog';
import { EventDialog } from '../activity/event-dialog';

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

export type WidgetSize = 's' | 'sm' | 'm' | 'l' | 'xl';
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
  /**
   * ستونِ شروعِ هر کارت روی شبکهٔ پایه (۰ = ستونِ اول). نبودن = خودکار (کوتاه‌ترین ستون).
   * ⚠️ پایه از ۴ ستون به ۱۲ ستونِ ریز رفت (اندازهٔ «یک‌سوم»)؛ چیدمانِ بی basis قدیمی است و ×۳ می‌شود (upgrade).
   */
  cols?: Record<string, number>;
  /** پایهٔ ستون‌های cols — ۱۲؛ نبودن = چیدمانِ قدیمیِ چهارستونه. */
  basis?: 12;
  /**
   * قدِ دلخواهِ کارت به پیکسل — **ثابت**، نه حداقل: با دادهٔ زیاد کارت بلند نمی‌شود و آنچه جا نشد پشتِ
   * «مشاهدهٔ بیشتر» می‌رود (ExpandFillProvider). وگرنه هم‌ترازیِ کاربر با اولین روزِ شلوغ می‌شکست.
   * نبودن = قدِ محتوا.
   */
  heights?: Record<string, number>;
  /** فاصلهٔ اضافهٔ بالای کارت به ردیف (هر ردیف ۲۴ پیکسل) — با کشیدنِ لبهٔ بالای کارت. */
  offsets?: Record<string, number>;
  /**
   * گروه‌های «هم‌ردیف»: کارت‌هایی که لبهٔ بالایشان به هم چسبانده شده، همیشه از یک خط شروع می‌کنند
   * (پایین‌ترین جای ممکنِ همه‌شان). ⚠️ فاصلهٔ نسبی (offsets) برای این کار بس نبود: کارتِ بالاییِ هر
   * ستون با داده قدِ متفاوتی می‌کشد و دو کارتِ هم‌ردیف از هم جدا می‌شدند.
   */
  rows?: string[][];
}

/** کارت را از گروه‌های هم‌ردیف بیرون می‌آورد و (اختیاری) به گروهِ کارتِ دیگر می‌برد. */
function regroup(rows: string[][] = [], id: string, withId?: string): string[][] {
  const out = rows.map((g) => g.filter((x) => x !== id));
  if (withId) {
    const g = out.find((x) => x.includes(withId));
    if (g) g.push(id); else out.push([withId, id]);
  }
  return out.filter((g) => g.length > 1);
}
/**
 * شبکهٔ پهن ۱۲ ستونِ ریز دارد تا «یک‌سوم» (۴) کنارِ «یک‌چهارم» (۳) جا شود؛ شبکهٔ متوسط ۲ ستون و گوشی ۱.
 * قدِ هر اندازه روی شبکهٔ پهن برابرِ همان چهارستونهٔ قبلی است (۳ ستونِ ریز + ۲ فاصله = یک ستونِ قدیم).
 */
const BASIS = 12;
const WIDTH12: Record<WidgetSize, number> = { s: 3, sm: 4, m: 6, l: 9, xl: 12 };
const WIDTH2: Record<WidgetSize, number> = { s: 1, sm: 1, m: 2, l: 2, xl: 2 };
const widthOf = (size: WidgetSize, cols: number) => (cols >= BASIS ? WIDTH12[size] : Math.min(cols, WIDTH2[size]));
/** شروع‌های مجاز روی شبکهٔ پهن: مرزِ چهارم‌ها و سوم‌ها — تا کارت‌ها روی خطوطِ معنادار بنشینند، نه هر ستونِ ریز. */
const STARTS = [0, 3, 4, 6, 8, 9];
const startsFor = (cols: number, wd: number) =>
  cols >= BASIS ? STARTS.filter((c) => c <= cols - wd) : Array.from({ length: Math.max(1, cols - wd + 1) }, (_, i) => i);
/** نزدیک‌ترین شروعِ مجاز. */
const snapStart = (c: number, cols: number, wd: number) =>
  startsFor(cols, wd).reduce((a, b) => (Math.abs(b - c) < Math.abs(a - c) ? b : a), 0);
/** چیدمانِ قدیمیِ چهارستونه (ذخیره‌شده یا پیش‌فرض) ← پایهٔ ۱۲. */
function upgrade<T extends { cols?: Record<string, number>; basis?: 12 }>(p: T): T {
  if (p.basis === BASIS || !p.cols) return { ...p, basis: BASIS };
  return { ...p, basis: BASIS, cols: Object.fromEntries(Object.entries(p.cols).map(([k, v]) => [k, v * 3])) };
}
interface Pos { c: number; y: number; wd: number; span: number }

/**
 * جای‌گذاریِ صریح: کارت‌ها به ترتیب، هر کدام در ستونِ انتخابیِ خودش (یا کوتاه‌ترین ستون) و درست زیرِ
 * بلندترین کارتِ آن ستون‌ها می‌نشینند. پس کارتی که به ستونی برده شود همان‌جا می‌ماند و جای خالیِ
 * زیرِ کارت‌ها پر می‌شود — نه مثلِ grid-flow-dense که مرورگر خودش جا را انتخاب می‌کند.
 */
function placeAll(
  list: Array<{ id: string; size: WidgetSize }>, cols: number, spans: Record<string, number>, prefCols: Record<string, number>,
  offsets: Record<string, number> = {},
  rows: string[][] = [],
): Map<string, Pos> | null {
  const heights = Array<number>(cols).fill(0);
  const out = new Map<string, Pos>();
  const placed: Pos[] = [];
  const hits = (c: number, wd: number, y: number, span: number) =>
    placed.some((p) => p.c < c + wd && c < p.c + p.wd && p.y < y + span && y < p.y + p.span);
  const top = (c: number, wd: number) => Math.max(...heights.slice(c, c + wd));
  const colOf = (id: string, wd: number) => {
    const c = Math.floor(((prefCols[id] ?? 0) * cols) / BASIS);
    return cols >= BASIS ? snapStart(c, cols, wd) : Math.min(Math.max(0, c), cols - wd);
  };
  // گروهِ هم‌ردیف فقط بینِ کارت‌های دیده‌شده با ستونِ انتخابی (کارتِ خودکار جایش از پیش معلوم نیست).
  const inList = new Map(list.map((w) => [w.id, w]));
  const groupOf = new Map<string, Array<{ id: string; size: WidgetSize }>>();
  if (cols > 1) {
    for (const g of rows) {
      const members = g.map((id) => inList.get(id)).filter((w): w is { id: string; size: WidgetSize } => !!w && prefCols[w.id] !== undefined);
      if (members.length > 1) for (const m of members) groupOf.set(m.id, members);
    }
  }
  for (const w of list) {
    if (out.has(w.id)) continue;
    const group = groupOf.get(w.id);
    if (group) {
      // همهٔ اعضا با هم، روی پایین‌ترین لبهٔ ستون‌هایشان — یک خطِ شروعِ مشترک.
      if (group.some((g) => !spans[g.id])) return null;
      // ستونِ اعضا بی هم‌پوشانی: با عوض شدنِ اندازه (مثلاً ¼ ← ⅓) شروعِ ذخیره‌شده ممکن است در کارتِ کناری
      // برود؛ عضوِ بعدی به اولین شروعِ مجازِ بعد از قبلی می‌رود، و اگر جا نبود از گروه بیرون و عادی جا می‌گیرد.
      const fitted: Array<{ id: string; c: number; wd: number }> = [];
      let end = 0;
      const byCol = [...group].sort((a, b) => colOf(a.id, widthOf(a.size, cols)) - colOf(b.id, widthOf(b.size, cols)));
      for (const g of byCol) {
        const wd = widthOf(g.size, cols);
        let c = colOf(g.id, wd);
        if (c < end) c = startsFor(cols, wd).find((x) => x >= end) ?? -1;
        if (c < 0) { groupOf.delete(g.id); continue; }
        fitted.push({ id: g.id, c, wd });
        end = c + wd;
      }
      const y = fitted.length ? Math.max(...fitted.map((g) => top(g.c, g.wd))) : 0;
      for (const g of fitted) {
        const { wd, c } = g;
        const span = spans[g.id]!;
        for (let i = c; i < c + wd; i++) heights[i] = Math.max(heights[i]!, y + span);
        placed.push({ c, y, wd, span });
        out.set(g.id, { c, y, wd, span });
      }
      // خودش بیرون ماند (جا نشد): مثلِ کارتِ عادی همین پایین جا می‌گیرد.
      if (out.has(w.id)) continue;
    }
    const own = spans[w.id];
    if (!own) return null;
    // فاصلهٔ بالا جزوِ جای کارت است: کارت از y+off شروع می‌شود و ستون تا انتهای آن پر است.
    const off = Math.max(0, Math.round(offsets[w.id] ?? 0));
    const span = own + off;
    const wd = widthOf(w.size, cols);
    let c: number;
    let y: number;
    const pref = prefCols[w.id];
    if (cols > 1 && pref !== undefined) {
      // ستونِ انتخابیِ کاربر: درست زیرِ آخرین کارتِ همان ستون‌ها (ترتیب = جای عمودی).
      c = colOf(w.id, wd);
      y = top(c, wd);
    } else {
      // خودکار: پایین‌ترین جای خالیِ ممکن در هر ستون — جاهای خالیِ کنارِ کارت‌های پهن پر می‌شوند.
      c = 0; y = Infinity;
      for (const i of startsFor(cols, wd)) {
        const tries = [0, ...placed.filter((p) => p.c < i + wd && i < p.c + p.wd).map((p) => p.y + p.span)].sort((a, b) => a - b);
        const fit = tries.find((ty) => !hits(i, wd, ty, span)) ?? top(i, wd);
        if (fit < y) { y = fit; c = i; }
      }
    }
    for (let i = c; i < c + wd; i++) heights[i] = Math.max(heights[i]!, y + span);
    placed.push({ c, y, wd, span });
    out.set(w.id, { c, y: y + off, wd, span: own });
  }
  return out;
}

const SIZE_CLASS: Record<WidgetSize, string> = {
  s: '@5xl/main:col-span-3',
  sm: '@5xl/main:col-span-4',
  m: '@xl/main:col-span-2 @5xl/main:col-span-6',
  l: '@xl/main:col-span-2 @5xl/main:col-span-9',
  xl: '@xl/main:col-span-2 @5xl/main:col-span-12',
};
const SIZE_LABEL: Record<WidgetSize, string> = { s: 'یک‌چهارم', sm: 'یک‌سوم', m: 'نصف', l: 'سه‌چهارم', xl: 'تمام‌عرض' };
/** برچسبِ کوتاهِ دکمه‌های اندازه روی نوارِ کارت. */
const SIZE_SHORT: Record<WidgetSize, string> = { s: '¼', sm: '⅓', m: '½', l: '¾', xl: '1' };

/** ردیفِ پایه و فاصلهٔ شبکه (gap-4) — باید با کلاس‌های شبکه یکی باشد. */
const ROW = 8;
const GAP = 16;
/** نزدیکِ لبهٔ بالا/پایین هنگامِ کشیدن، صفحه خودش اسکرول می‌شود. */
const EDGE = 120;
/** فاصله‌ای (پیکسل) که لبهٔ کارت در آن به لبهٔ کارتِ دیگر می‌چسبد. */
const SNAP = 10;
const UNIT = ROW + GAP;
/** کمترین قدِ دلخواهِ کارت: سرتیتر + یک ردیف/عدد؛ کمتر از این هیچ کارتی بی‌اسکرول جا نمی‌شود. */
const MIN_H = 96;

const EMPTY: Prefs = { order: [], hidden: [], shown: [], sizes: {} };

/**
 * چیدمانِ پیش‌فرض: ترتیب و ستونِ شروعِ هر کارت (روی شبکهٔ چهارستونه)، و اختیاری همان چیزهایی که کاربر
 * در ویرایش می‌سازد (اندازه، پنهان/نمایش، قد و شروع) — پس چیدمانِ ذخیره‌شدهٔ یک نفر را می‌شود عیناً پیش‌فرض کرد.
 */
export type DefaultLayout = Pick<Prefs, 'order'> & Required<Pick<Prefs, 'cols'>> & Partial<Omit<Prefs, 'order' | 'cols'>>;

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
  const base = useMemo<Prefs>(() => (defaults ? upgrade({ ...EMPTY, ...defaults, sizes: defaults.sizes ?? {} }) : { ...EMPTY, basis: BASIS }), [defaults]);
  const [prefs, setPrefs] = useState<Prefs>(base);
  const [open, setOpen] = useState(false);
  /** حالتِ ویرایشِ زنده: کشیدن و رها کردن، اندازه و پنهان کردن روی خودِ کارت. */
  const [editing, setEditing] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  /** پیش‌نمایشِ کشیدن: کارتِ کشیده‌شده در کدام ستون و پیش از کدام کارت می‌نشیند. */
  const [preview, setPreview] = useState<{ col: number; before: string | null } | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  /** کارتِ انتخاب‌شده در حالتِ ویرایش — نوارِ ابزار و دستگیره‌هایش ثابت دیده می‌شوند (برای لمس). */
  const [selected, setSelected] = useState<string | null>(null);
  /** تنظیمِ زنده با دستگیره: قد یا فاصلهٔ بالای یک کارت، و خطِ راهنمای هم‌راستایی (y نسبت به شبکه). */
  const [adjust, setAdjust] = useState<{ id: string; h?: number; off?: number; guide: number | null } | null>(null);
  /** شمارِ ستون‌های فعلیِ شبکه (۱ گوشی، ۲ متوسط، ۴ پهن) — از خودِ CSS خوانده می‌شود. */
  const [cols, setCols] = useState(1);
  /**
   * مودال‌های درجا: پیوندی با data-open-task / data-open-event داخلِ هر کارت (هر سه داشبورد) به‌جای
   * رفتن از داشبورد، همان مودالِ برنامه را باز می‌کند؛ رفتن به خودِ صفحه از داخلِ مودال است.
   * کلیکِ وسط/Ctrl همچنان پیوند را در زبانهٔ تازه باز می‌کند.
   */
  const [openTask, setOpenTask] = useState<number | null>(null);
  const [openEvent, setOpenEvent] = useState<number | null>(null);
  const openInPlace = (e: React.MouseEvent | React.KeyboardEvent) => {
    if (editing) return false;
    if ('button' in e && (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)) return false;
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-open-task],[data-open-event],a[href],button');
    if (!el || !e.currentTarget.contains(el)) return false;
    const task = Number(el.dataset.openTask);
    const ev = Number(el.dataset.openEvent);
    if (task > 0) setOpenTask(task);
    else if (ev > 0) setOpenEvent(ev);
    else return false;
    e.preventDefault();
    e.stopPropagation();
    return true;
  };
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
    try { const raw = localStorage.getItem(key); if (raw) setPrefs(upgrade({ ...EMPTY, ...JSON.parse(raw) as Partial<Prefs> })); } catch { /* خصوصی */ }
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
  const heightOf: Record<string, number> = { ...Object.fromEntries(Object.entries(prefs.heights ?? {}).map(([k, v]) => [k, Math.max(MIN_H, v)])), ...(adjust?.h !== undefined ? { [adjust.id]: adjust.h } : {}) };
  const offsetOf: Record<string, number> = { ...(prefs.offsets ?? {}), ...(adjust?.off !== undefined ? { [adjust.id]: adjust.off } : {}) };
  const asList = (ws: WidgetDef[]) => ws.map((w) => ({ id: w.id, size: sizeOf(w) }));
  /** ستونِ نمای فعلی ← ستونِ شبکهٔ پایه (همان چیزی که ذخیره می‌شود). */
  const to4 = (c: number) => (cols === BASIS ? c : Math.round((c * BASIS) / cols));

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
  const layout = cols > 1 ? placeAll(asList(shown.list), cols, spans, shown.cols, offsetOf, prefs.rows) : null;

  /**
   * «ثابت کردن»: ستونِ فعلیِ **همهٔ** کارت‌ها ذخیره و ترتیب بر اساسِ جای عمودیِ فعلی مرتب می‌شود، تا با
   * هر جابه‌جایی بقیهٔ کارت‌ها همان‌جا بمانند (کارت‌های خودکار ممکن است جای خالی را پر کرده باشند).
   */
  const freeze = (): { order: string[]; cols: Record<string, number> } => {
    const ids = ordered.map((x) => x.id);
    if (cols <= 1) return { order: ids, cols: prefCols };
    const now = placeAll(asList(visible), cols, spans, prefCols, offsetOf, prefs.rows);
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
    const wd = widthOf(sizeOf(dragged), cols);
    // مرکزِ کارت زیرِ نشانگر، و بعد نزدیک‌ترین شروعِ مجاز.
    const col = snapStart(Math.floor(rel / (colW + GAP)) - Math.floor(wd / 2), cols, wd);
    const row = (y - rect.top) / (ROW + GAP);
    // چیدمانِ بقیه بی کارتِ کشیده‌شده — ثابت، تا پیش‌نمایش نوسان نکند.
    const others = visible.filter((w) => w.id !== dragId);
    const base = placeAll(asList(others), cols, spans, prefCols, offsetOf, prefs.rows);
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
    const starts = startsFor(cols, pos.wd);
    const c = dir > 0 ? (starts.find((x) => x > pos.c) ?? pos.c) : ([...starts].reverse().find((x) => x < pos.c) ?? pos.c);
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
  /**
   * دستگیرهٔ «بوم»: لبهٔ پایین قدِ کارت را عوض می‌کند و لبهٔ بالا شروعش را پایین‌تر می‌برد.
   * هنگامِ کشیدن، لبه به لبهٔ بالا/پایینِ کارت‌های دیگر می‌چسبد (SNAP) و خطِ راهنما دیده می‌شود.
   * ⚠️ کارت‌هایی که در همین ستون‌ها **زیرِ** این کارت‌اند کنار گذاشته می‌شوند: با کشیدن جابه‌جا می‌شوند و
   * چسبیدن به آن‌ها بی‌معناست.
   */
  const startAdjust = (e: React.PointerEvent, w: WidgetDef, mode: 'h' | 'off') => {
    const grid = gridRef.current;
    const el = grid?.querySelector<HTMLElement>(`[data-measure="${CSS.escape(w.id)}"]`);
    if (!grid || !el || cols <= 1) return;
    e.preventDefault();
    e.stopPropagation();
    setSelected(w.id);
    const startY = e.clientY;
    const r0 = el.getBoundingClientRect();
    const g0 = grid.getBoundingClientRect().top;
    const startOff = offsetOf[w.id] ?? 0;
    const frozen = freeze();
    const edges: Array<{ y: number; id: string; top: boolean }> = [];
    for (const x of grid.querySelectorAll<HTMLElement>('[data-measure]')) {
      if (x === el || x.closest('[hidden]')) continue;
      const r = x.getBoundingClientRect();
      const sameCols = r.left < r0.right - 1 && r0.left < r.right - 1;
      if (sameCols && r.top >= r0.top) continue;
      const xid = x.dataset.measure ?? '';
      edges.push({ y: r.top, id: xid, top: true }, { y: r.bottom, id: xid, top: false });
    }
    let h = r0.height;
    let off = startOff;
    /** لبهٔ بالا به لبهٔ بالای کدام کارت چسبید — همان می‌شود گروهِ هم‌ردیف. */
    let rowWith: string | null = null;
    const onMove = (ev: PointerEvent) => {
      const dy = ev.clientY - startY;
      let guide: number | null = null;
      if (mode === 'h') {
        h = Math.max(MIN_H, Math.round(r0.height + dy));
        let best = SNAP + 1;
        const raw = h;
        for (const { y: edge } of edges) {
          const d = Math.abs(r0.top + raw - edge);
          if (d < best) { best = d; h = Math.round(edge - r0.top); guide = edge - g0; }
        }
        setAdjust({ id: w.id, h, guide });
      } else {
        // شروع روی ردیف‌های ۲۴ پیکسلی است؛ لبهٔ کارتِ دیگر هم روی همین ردیف‌هاست، پس گرد کردن هم‌راستا می‌کند.
        const natTop = r0.top - startOff * UNIT;
        off = Math.max(0, Math.round((startOff * UNIT + dy) / UNIT));
        rowWith = null;
        for (const { y: edge, id, top } of edges) {
          const k = Math.round((edge - natTop) / UNIT);
          if (k >= 0 && Math.abs(natTop + k * UNIT - edge) <= 3 && Math.abs(k * UNIT - (startOff * UNIT + dy)) <= SNAP) { off = k; guide = edge - g0; rowWith = top ? id : null; break; }
        }
        setAdjust({ id: w.id, off, guide });
      }
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      setAdjust(null);
      if (mode === 'h') save({ ...prefs, ...frozen, heights: { ...(prefs.heights ?? {}), [w.id]: h } });
      else if (rowWith) {
        // چسبیده به لبهٔ بالای کارتِ دیگر: هم‌ردیف می‌شوند و فاصلهٔ نسبی دیگر لازم نیست.
        const offsets = { ...(prefs.offsets ?? {}) };
        delete offsets[w.id];
        save({ ...prefs, ...frozen, offsets, rows: regroup(prefs.rows, w.id, rowWith) });
      } else save({ ...prefs, ...frozen, offsets: { ...(prefs.offsets ?? {}), [w.id]: off }, rows: regroup(prefs.rows, w.id) });
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };
  /** با صفحه‌کلید: بالا/پایین ۸ پیکسل قد یا یک ردیف شروع. */
  const keyAdjust = (e: React.KeyboardEvent, w: WidgetDef, mode: 'h' | 'off') => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    const dir = e.key === 'ArrowDown' ? 1 : -1;
    const f = freeze();
    if (mode === 'h') {
      const el = gridRef.current?.querySelector<HTMLElement>(`[data-measure="${CSS.escape(w.id)}"]`);
      const cur = heightOf[w.id] ?? el?.getBoundingClientRect().height ?? 0;
      save({ ...prefs, ...f, heights: { ...(prefs.heights ?? {}), [w.id]: Math.max(MIN_H, Math.round(cur + dir * ROW)) } });
    } else {
      save({ ...prefs, ...f, offsets: { ...(prefs.offsets ?? {}), [w.id]: Math.max(0, (offsetOf[w.id] ?? 0) + dir) } });
    }
  };
  /** قد و شروعِ خودکار (دوبار کلیک روی دستگیره، یا دکمهٔ نوار). */
  const resetAdjust = (id: string, which: 'h' | 'off' | 'both') => {
    const heights = { ...(prefs.heights ?? {}) };
    const offsets = { ...(prefs.offsets ?? {}) };
    if (which !== 'off') delete heights[id];
    if (which !== 'h') delete offsets[id];
    save({ ...prefs, ...freeze(), heights, offsets, rows: which !== 'h' ? regroup(prefs.rows, id) : prefs.rows });
  };
  const resize = (w: WidgetDef, size: WidgetSize) => save({ ...prefs, order: ordered.map((x) => x.id), sizes: { ...prefs.sizes, [w.id]: size } });

  const groups = [...new Set(ordered.map((w) => w.group))];

  return (
    <div className="grid gap-3">
      {/* دکمهٔ «ویرایشِ چیدمان» / «تمام» در نوارِ بالای چسبان — همیشه در دسترس، بی‌آنکه ردیفی از صفحه بگیرد. */}
      <HeaderAction>
        {editing ? (
          // در حالتِ ویرایش، همان جای مداد یک تیک (بی‌متن) — با زدنش ویرایش تمام می‌شود.
          <Hint label={t('تمام')}>
            <Button type="button" size="icon-sm" aria-label={t('تمام')} onClick={() => setEditing(false)}><Check className="size-4" /></Button>
          </Hint>
        ) : (
          // فقط آیکونِ مداد (درخواستِ مالک)؛ نام در راهنمای شناور و برای صفحه‌خوان می‌ماند.
          <Hint label={t('ویرایشِ چیدمان')}>
            <Button type="button" size="icon-sm" variant="outline" aria-label={t('ویرایشِ چیدمان')} onClick={() => setEditing(true)}><Pencil className="size-4" /></Button>
          </Hint>
        )}
      </HeaderAction>
      {/* میان‌بُرها فقط در صفِ مدیر کار می‌کنند — داشبوردِ عضو و کارفرما (scope) راهنمایش را نمی‌بینند. */}
      {!editing && !scope && <span className="hidden text-[11px] text-muted-foreground md:inline">{t('میان‌بُر: j / k ردیفِ بعد و قبل، a یا Enter کنشِ اولِ ردیف.')}</span>}
      {/* «فهرستِ کارت‌ها» و «پیش‌فرض» فقط در حالتِ ویرایش. */}
      {editing && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="me-auto text-xs text-muted-foreground">{t('موس را روی کارت ببرید: از دستگیره بکشید تا جابه‌جا شود؛ لبهٔ پایین قد را و لبهٔ بالا شروع را عوض می‌کند و به لبهٔ کارت‌های کناری می‌چسبد.')}</span>
          <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(true)}><LayoutGrid className="size-4" />{t('فهرستِ کارت‌ها')}</Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => save(base)}><RotateCcw className="size-4" />{t('پیش‌فرض')}</Button>
        </div>
      )}

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
          'relative grid grid-cols-1 gap-4 @xl/main:grid-cols-2 @5xl/main:grid-cols-12',
          !layout && 'grid-flow-row-dense',
          measured && 'auto-rows-[8px]',
          // جای رها کردن زیرِ همهٔ کارت‌ها؛ و بالا جای نوارِ شناورِ ردیفِ اول.
          editing && 'pt-12 pb-40',
        )}
        onDragOver={onGridDragOver}
        onDrop={onGridDrop}
        onClickCapture={openInPlace}
        onKeyDownCapture={(e) => { if (e.key === 'Enter' || e.key === ' ') { if ((e.target as HTMLElement).dataset.openEvent) openInPlace(e); } }}
        onClick={(e) => { if (e.target === e.currentTarget) setSelected(null); }}
      >
        {/* خطِ راهنمای هم‌راستایی هنگامِ کشیدنِ لبهٔ کارت. */}
        {adjust?.guide != null && (
          <div aria-hidden className="pointer-events-none absolute inset-x-0 z-40 border-t-2 border-dashed border-primary" style={{ top: adjust.guide }} />
        )}
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
            onClick={editing ? () => setSelected(w.id) : undefined}
            className={cn(
              'group/card relative grid min-w-0 content-start self-start', !pos && SIZE_CLASS[sizeOf(w)],
              editing && 'rounded-2xl outline-2 outline-offset-2 outline-dashed outline-primary/30 hover:z-20',
              editing && (selected === w.id || adjust?.id === w.id) && 'z-20 outline-solid outline-primary/70',
              dragId === w.id && 'opacity-50 outline-solid outline-primary',
            )}
          >
            {/*
              در حالتِ ویرایش، محتوای کارت کلیک‌پذیر نیست — فقط کنترل‌های چیدمان.
              قدِ دلخواه (min-height) فقط روی شبکهٔ چندستونه؛ روی گوشی کارت‌ها زیرِ هم و به قدِ محتوا.
            */}
            <div
              // data-fixed: محتوای کارت خودش را با قدِ کاربر جور می‌کند (.kz-fit در globals.css)؛ آنچه باز هم
              // جا نشد اسکرولِ باریک می‌گیرد، نه بریده شدن.
              data-fixed={pos && heightOf[w.id] ? '' : undefined}
              // kz-card: ظرفِ عرضِ کارت (و با قدِ ثابت، ظرفِ قد) — محتوا با اندازهٔ خودِ کارت جور می‌شود، نه صفحه.
              className={cn('kz-card @container/kzcard grid min-w-0', pos && heightOf[w.id] && 'grid-rows-[minmax(0,1fr)] overflow-x-hidden overflow-y-auto [scrollbar-width:thin]', editing && 'pointer-events-none select-none')}
              style={pos && heightOf[w.id] ? { height: heightOf[w.id] } : undefined}
            >
              {/* قدِ ثابت: فهرست‌های داخلِ کارت جای باقی‌مانده را پر می‌کنند و بقیه پشتِ «مشاهدهٔ بیشتر». */}
              <ExpandFillProvider fill={!!(pos && heightOf[w.id])}>
                <CardHelpProvider text={w.hint}>{w.node}</CardHelpProvider>
              </ExpandFillProvider>
            </div>
            {editing && pos && (
              <>
                {/* دستگیرهٔ لبهٔ بالا: شروعِ کارت را پایین‌تر می‌برد (به ردیف‌های ۲۴ پیکسلی). */}
                <span
                  role="separator"
                  aria-orientation="horizontal"
                  aria-label={t('شروعِ کارت (بکشید؛ دوبار کلیک = خودکار)')}
                  tabIndex={0}
                  onPointerDown={(e) => startAdjust(e, w, 'off')}
                  onKeyDown={(e) => keyAdjust(e, w, 'off')}
                  onDoubleClick={() => resetAdjust(w.id, 'off')}
                  className={cn(
                    'absolute -top-2 left-1/2 z-40 h-3 w-14 -translate-x-1/2 cursor-ns-resize touch-none rounded-full border-2 border-card bg-primary/70 shadow-xs hover:bg-primary',
                    selected === w.id || adjust?.id === w.id ? 'block' : 'hidden group-hover/card:block',
                  )}
                />
                {/* دستگیرهٔ لبهٔ پایین: قدِ کارت؛ به لبهٔ کارت‌های کناری می‌چسبد. */}
                <span
                  role="separator"
                  aria-orientation="horizontal"
                  aria-label={t('قدِ کارت (بکشید؛ دوبار کلیک = خودکار)')}
                  tabIndex={0}
                  onPointerDown={(e) => startAdjust(e, w, 'h')}
                  onKeyDown={(e) => keyAdjust(e, w, 'h')}
                  onDoubleClick={() => resetAdjust(w.id, 'h')}
                  className={cn(
                    'absolute -bottom-2 left-1/2 z-40 h-3 w-14 -translate-x-1/2 cursor-ns-resize touch-none rounded-full border-2 border-card bg-primary/70 shadow-xs hover:bg-primary',
                    selected === w.id || adjust?.id === w.id ? 'block' : 'hidden group-hover/card:block',
                  )}
                />
              </>
            )}
            {editing && (
              /*
                نوارِ شناور بالای کارت (مثلِ ابزارهای طراحی) — جا نمی‌گیرد، پس چیدمانِ حالتِ ویرایش همان
                چیدمانِ نهایی است و لبه‌هایی که اینجا هم‌راستا می‌شوند بعد از «تمام» هم هم‌راستا می‌مانند.
                ⚠️ فاصله با padding است نه margin: موس از کارت به نوار که می‌رود، hover قطع نشود.
              */
              <div className={cn(
                'absolute inset-x-0 bottom-full z-30 pb-2',
                selected === w.id || dragId === w.id ? 'block' : 'hidden group-hover/card:block',
              )}>
              <div className="flex flex-wrap items-center gap-1 rounded-xl border bg-popover p-1 shadow-md">
                <span
                  draggable
                  onDragStart={(e) => { save({ ...prefs, ...freeze() }); setSelected(w.id); setDragId(w.id); setPreview(null); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', w.id); }}
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
                      className={cn('num h-6 min-w-6 rounded-md px-1 text-xs font-semibold', sizeOf(w) === sz ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground')}
                    >
                      {SIZE_SHORT[sz]}
                    </button>
                  ))}
                </span>
                {cols > 1 && <Hint label={t('ستونِ قبلی')}><Button type="button" size="icon-xs" variant="ghost" aria-label={t('ستونِ قبلی')} onClick={() => shiftCol(w.id, -1)}><ChevronRight className="size-3.5 ltr:rotate-180" /></Button></Hint>}
                {cols > 1 && <Hint label={t('ستونِ بعدی')}><Button type="button" size="icon-xs" variant="ghost" aria-label={t('ستونِ بعدی')} onClick={() => shiftCol(w.id, 1)}><ChevronLeft className="size-3.5 ltr:rotate-180" /></Button></Hint>}
                <Hint label={t('بالاتر')}><Button type="button" size="icon-xs" variant="ghost" aria-label={t('بالاتر')} onClick={() => shiftRow(w.id, -1)}><ChevronUp className="size-3.5" /></Button></Hint>
                <Hint label={t('پایین‌تر')}><Button type="button" size="icon-xs" variant="ghost" aria-label={t('پایین‌تر')} onClick={() => shiftRow(w.id, 1)}><ChevronDown className="size-3.5" /></Button></Hint>
                {(prefs.heights?.[w.id] !== undefined || prefs.offsets?.[w.id] !== undefined) && (
                  <Hint label={t('قد و شروعِ خودکار')}><Button type="button" size="icon-xs" variant="ghost" aria-label={t('قد و شروعِ خودکار')} onClick={() => resetAdjust(w.id, 'both')}><RotateCcw className="size-3.5" /></Button></Hint>
                )}
                <Button type="button" size="icon-xs" variant="ghost" aria-label={t('پنهان کردن')} onClick={() => toggle(w, false)} className="text-muted-foreground hover:text-destructive"><EyeOff className="size-3.5" /></Button>
              </div>
              </div>
            )}
          </div>
          );
        })}
      </div>
      <TaskDialog taskId={openTask} open={openTask !== null} onOpenChange={(o) => { if (!o) setOpenTask(null); }} />
      <EventDialog eventId={openEvent} onClose={() => setOpenEvent(null)} onNavigate={setOpenEvent} />
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
