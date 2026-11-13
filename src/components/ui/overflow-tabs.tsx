'use client';

import * as React from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useT } from '@/i18n/client';
import { cn } from '@/lib/utils';

export interface OverflowTabItem {
  value: string;
  /** متنِ تب (ترجمه‌شده) — در منوی «بیشتر» هم همین می‌آید. */
  label: string;
  /** عددِ کنارِ تب؛ undefined یعنی بی‌عدد. */
  count?: number;
}

/**
 * نوارِ تب با منوی «بیشتر» (۳.۲.۰) — تب‌هایی که جا نمی‌شوند زیرِ یک دکمه جمع می‌شوند.
 *
 * ⚠️ قاعده‌ها:
 *  · ترتیب همان ترتیبِ `items` است؛ از آخر به منو می‌روند (پس مهم‌ترها را اول بدهید).
 *  · **تبِ فعال هیچ‌وقت پنهان نمی‌شود**: اگر جا نباشد، آخرین تبِ پیدا جایش به منو
 *    می‌رود. کاربر همیشه می‌بیند کجاست.
 *  · عرض زنده سنجیده می‌شود (ResizeObserver) از یک نسخهٔ نامرئی از همهٔ تب‌ها —
 *    پس با زبان، فونت و عددهای متفاوت هم درست کار می‌کند. نوارِ پیمایشِ افقی ندارد.
 *  · پیش از سنجش (رندرِ سرور) همهٔ تب‌ها کشیده می‌شوند و قاب سرریز را می‌بُرد.
 */
export function OverflowTabs({
  items, value, onValueChange, variant = 'default', className, renderCount,
}: {
  items: OverflowTabItem[];
  value: string;
  onValueChange: (value: string) => void;
  variant?: 'default' | 'line';
  className?: string;
  /** شکلِ عددِ کنارِ تب (Badge، متنِ کم‌رنگ…)؛ پیش‌فرض متنِ کوچک. */
  renderCount?: (count: number, active: boolean) => React.ReactNode;
}) {
  const t = useT();
  const wrap = React.useRef<HTMLDivElement>(null);
  const measure = React.useRef<HTMLDivElement>(null);
  const [visible, setVisible] = React.useState<string[] | null>(null);
  /** تا سنجشِ اول نوار نامرئی است (جایش محفوظ) — وگرنه رندرِ سرور تب‌های بریده را یک لحظه نشان می‌داد. */
  const [measured, setMeasured] = React.useState(false);

  const count = (item: OverflowTabItem, active: boolean) => (
    item.count === undefined ? null
      : renderCount ? renderCount(item.count, active)
        : <span className="num text-xs text-muted-foreground">{item.count}</span>
  );

  const recompute = React.useCallback(() => {
    const box = wrap.current;
    const m = measure.current;
    if (!box || !m) return;
    const list = m.querySelector<HTMLElement>('[data-slot="tabs-list"]');
    if (!list) return;
    const style = getComputedStyle(list);
    const gap = parseFloat(style.columnGap || '0') || 0;
    const pad = (parseFloat(style.paddingInlineStart) || 0) + (parseFloat(style.paddingInlineEnd) || 0);
    const width = new Map<string, number>();
    list.querySelectorAll<HTMLElement>('[data-measure]').forEach((el) => width.set(el.dataset.measure!, el.getBoundingClientRect().width));
    const moreW = (m.querySelector<HTMLElement>('[data-measure-more]')?.getBoundingClientRect().width ?? 80) + gap;
    const avail = box.clientWidth - pad - 1;
    const total = items.reduce((s, i) => s + (width.get(i.value) ?? 0), 0) + gap * Math.max(0, items.length - 1);
    setMeasured(true);
    if (total <= avail) { setVisible(null); return; }

    let used = 0;
    const shown: OverflowTabItem[] = [];
    for (const item of items) {
      const w = (width.get(item.value) ?? 0) + (shown.length ? gap : 0);
      if (used + w + moreW > avail) break;
      shown.push(item);
      used += w;
    }
    // تبِ فعال همیشه پیدا — جای آخرین تب‌های پیدا را می‌گیرد.
    if (!shown.some((i) => i.value === value)) {
      const active = items.find((i) => i.value === value);
      if (active) {
        const aw = (width.get(active.value) ?? 0) + gap;
        while (shown.length > 0 && used + aw + moreW > avail) {
          const dropped = shown.pop()!;
          used -= (width.get(dropped.value) ?? 0) + (shown.length ? gap : 0);
        }
        shown.push(active);
      }
    }
    setVisible(shown.map((i) => i.value));
  }, [items, value]);

  React.useLayoutEffect(() => { recompute(); }, [recompute]);
  React.useEffect(() => {
    const box = wrap.current;
    if (!box || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => recompute());
    ro.observe(box);
    // فونتِ وب دیرتر می‌رسد و پهنای تب‌ها را عوض می‌کند.
    void document.fonts?.ready.then(() => recompute());
    return () => ro.disconnect();
  }, [recompute]);

  const shown = visible === null ? items : items.filter((i) => visible.includes(i.value));
  const hidden = visible === null ? [] : items.filter((i) => !visible.includes(i.value));
  /*
   * ⚠️ روی دکمهٔ «بیشتر» جمعِ عددها نمی‌آید: تب‌ها هم‌پوشانی دارند («همه»، «گذشته از
   * ددلاین» که پروژه‌های تب‌های دیگر را هم می‌شمارد) و جمعشان عددِ دروغ می‌شد.
   * عددِ هر تب داخلِ منو کنارِ خودش است.
   */

  const moreClass = cn(
    'inline-flex h-[calc(100%-1px)] flex-none items-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap text-muted-foreground transition-all hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
  );

  return (
    <div ref={wrap} className={cn('relative min-w-0 overflow-hidden', className)}>
      <Tabs value={value} onValueChange={onValueChange} className={measured ? undefined : 'invisible'}>
        <TabsList variant={variant} className="w-max max-w-full">
          {shown.map((item) => (
            <TabsTrigger key={item.value} value={item.value} className="flex-none px-3">
              {item.label}
              {count(item, item.value === value)}
            </TabsTrigger>
          ))}
          {hidden.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className={moreClass} aria-label={t('تب‌های بیشتر')}>
                  {t('بیشتر')}
                  <ChevronDown className="size-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-48">
                {hidden.map((item) => (
                  <DropdownMenuItem key={item.value} onSelect={() => onValueChange(item.value)}>
                    {item.value === value ? <Check className="size-3.5" /> : <span className="size-3.5" />}
                    <span className="flex-1">{item.label}</span>
                    {item.count !== undefined && <span className="num text-xs text-muted-foreground">{item.count}</span>}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </TabsList>
      </Tabs>

      {/*
        نسخهٔ نامرئی برای سنجش — همان کلاس‌ها، بیرون از جریان و دسترس‌پذیری.
        ⚠️ قابِ صفرعرض: پهنای کاملِ تب‌ها (گاهی ۹۰۰px) وگرنه صفحه را روی موبایل پهن می‌کرد؛
        خودِ تب‌ها داخلش همان پهنای واقعی را دارند و سنجش درست می‌ماند.
      */}
      <div ref={measure} aria-hidden="true" className="pointer-events-none invisible absolute start-0 top-0 h-0 w-0 overflow-hidden">
        <Tabs value={value}>
          <TabsList variant={variant} className="w-max">
            {items.map((item) => (
              <TabsTrigger key={item.value} value={item.value} data-measure={item.value} tabIndex={-1} className="flex-none px-3">
                {item.label}
                {count(item, item.value === value)}
              </TabsTrigger>
            ))}
            <span data-measure-more className={moreClass}>
              {t('بیشتر')}<ChevronDown className="size-3.5" />
            </span>
          </TabsList>
        </Tabs>
      </div>
    </div>
  );
}
