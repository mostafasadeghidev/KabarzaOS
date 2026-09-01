'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { searchAction } from '@/app/(app)/_actions/search';
import type { SearchHit } from '@/server/search/service';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { useT } from '@/i18n/client';

const MIN_QUERY = 3;

const KIND_ICON: Record<SearchHit['kind'], string> = {
  project: '📁', member: '👤', client: '🏢', account: '🏦',
};

const KIND_LABEL: Record<SearchHit['kind'], string> = {
  project: 'پروژه', member: 'عضو', client: 'کارفرما', account: 'حساب',
};

interface Item {
  key: string;
  label: string;
  href: string;
  /** برچسبِ کوچکِ کنارِ ردیف — نوعِ رکورد؛ صفحه‌ها ندارند. */
  sub?: string;
  icon?: string;
}

/**
 * پالتِ فرمان — پورتِ `admin-cmdk.js`.
 *
 * ⚠️ سه رفتارِ نسخهٔ قبلی که بدونِ آن‌ها پالت حس نمی‌دهد:
 * ۱. **صفحه‌ها فوری** فیلتر می‌شوند (سمتِ کلاینت)، رکوردها با تأخیر و از سه
 * حرف به بالا — تایپ هیچ‌وقت کند نیست.
 * ۲. تا وقتی جستجو در جریان است «چیزی پیدا نشد» نشان داده نمی‌شود؛ وگرنه
 * کاربر پیش از رسیدنِ پاسخ فکر می‌کند نتیجه‌ای نیست.
 * ۳. گاردِ ترتیب: پاسخِ کوئریِ قدیمی‌تر که دیر برسد دور ریخته می‌شود.
 *
 * ⚠️ فهرستِ صفحه‌ها از چیدمان می‌آید که **روی سرور** با مجوز فیلتر شده
 * (R-RBAC-05) — پالت میان‌بُری به صفحه‌ای که کاربر حق ندارد نمی‌دهد.
 */
export function CommandPalette({ pages }: { pages: Array<{ href: string; label: string }> }) {
  const tr = useT();
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState(0);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // جستجوی رکوردها — با تأخیر، و فقط از سه حرف به بالا.
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const q = query.trim();

    if (q.length < MIN_QUERY) {
      setHits([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    timer.current = setTimeout(() => {
      const my = ++seq.current;
      void searchAction(q).then((result) => {
        if (my !== seq.current) return; // پاسخِ کهنه — دور ریخته می‌شود.
        setHits(result);
        setSearching(false);
      });
    }, 200);

    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [query]);

  const items: Item[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    /**
     * ⚠️ برچسبِ صفحه‌ها **کلید** است، نه متنِ نهایی: چیدمان آنها را در سطحِ
     * ماژول می‌سازد، یعنی پیش از آنکه زبانِ کاربر معلوم باشد. سایدبار هم
     * همین‌جا ترجمه‌شان می‌کند؛ اینجا هم باید — وگرنه پالت فارسی می‌ماند.
     * جستجو نیز روی متنِ ترجمه‌شده انجام می‌شود تا با آنچه کاربر می‌بیند بخواند.
     */
    const pageItems: Item[] = pages
      .map((p) => ({ key: `page-${p.href}`, label: tr(p.label), href: p.href, icon: '↗' }))
      .filter((p) => !q || p.label.toLowerCase().includes(q));

    const hitItems: Item[] = hits.map((h) => ({
      key: `${h.kind}-${h.id}`,
      label: h.label,
      href: h.href,
      sub: tr(KIND_LABEL[h.kind]),
      icon: KIND_ICON[h.kind],
    }));

    return [...pageItems, ...hitItems];
  }, [pages, hits, query]);

  useEffect(() => { setSelected(0); }, [query, hits]);

  const go = useCallback((href: string) => {
    setOpen(false);
    setQuery('');
    router.push(href);
  }, [router]);

  const onInputKey = (e: React.KeyboardEvent) => {
    if (items.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected((s) => (s + 1) % items.length); // چرخشی، مثلِ نسخهٔ قبلی
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected((s) => (s - 1 + items.length) % items.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = items[selected];
      if (item) go(item.href);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[70vh] overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="px-4 pt-4">
          <DialogTitle className="sr-only">{t("جستجوی سراسری")}</DialogTitle>
          <DialogDescription className="sr-only">
            {tr("نامِ صفحه، پروژه، عضو، کارفرما یا حساب را بنویسید.")}
          </DialogDescription>
          <div className="flex items-center gap-2 rounded-md border px-3">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onInputKey}
              placeholder={t("رفتن به صفحه، یا جستجوی پروژه، عضو، کارفرما و حساب…")}
              className="border-0 shadow-none focus-visible:ring-0"
            />
          </div>
        </DialogHeader>

        <div className="max-h-80 overflow-y-auto px-2 pb-3">
          <ul>
            {items.map((item, i) => (
              <li key={item.key}>
                <button
                  type="button"
                  onMouseEnter={() => setSelected(i)}
                  onClick={() => go(item.href)}
                  className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-start text-sm ${
                    i === selected ? 'bg-muted' : ''
                  }`}
                >
                  <span aria-hidden className="w-4 text-center">{item.icon}</span>
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.sub && <span className="text-xs text-muted-foreground">{item.sub}</span>}
                </button>
              </li>
            ))}
          </ul>

          {searching && <p className="p-3 text-xs text-muted-foreground">{t("⏳ در حالِ جستجو…")}</p>}

          {/* «پیدا نشد» فقط وقتی جستجو تمام شده باشد. */}
          {!searching && items.length === 0 && (
            <p className="p-3 text-xs text-muted-foreground">
              {query.trim().length < MIN_QUERY
                ? t('برای جستجوی رکوردها دستِ‌کم سه حرف بنویسید.')
                : t('چیزی پیدا نشد.')}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * کلیدِ نمایانِ پالت — در نسخهٔ قبلی هم کنارِ نوارِ بالا با همین نشانِ Ctrl+K بود.
 * ⚠️ بدونِ آن، میان‌بُر برای کسی که نمی‌داند اصلاً وجود ندارد.
 */
export function CommandPaletteTrigger() {
  const t = useT();
  const [isMac, setIsMac] = useState(false);

  // بعد از mount خوانده می‌شود تا رندرِ سرور و کلاینت یکی باشند.
  useEffect(() => { setIsMac(/mac/i.test(navigator.userAgent)); }, []);

  return (
    <button
      type="button"
      aria-label={t("جستجوی سراسری")}
      onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))}
      className="flex items-center gap-2 rounded-md border px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
    >
      <Search className="size-3.5" />
      <span className="hidden sm:inline">{t("جستجو")}</span>
      <kbd className="num rounded bg-muted px-1 py-0.5 text-[10px]">{isMac ? '⌘K' : 'Ctrl+K'}</kbd>
    </button>
  );
}
