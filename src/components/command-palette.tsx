'use client';

import { UserAvatar } from '@/components/user-avatar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowUpRight, ListChecks, Building2, FolderKanban, Landmark, Search, User, type LucideIcon,
} from 'lucide-react';
import { searchAction } from '@/app/(app)/_actions/search';
import type { SearchHit } from '@/server/search/service';
import {
  Command, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { useT } from '@/i18n/client';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { Spinner } from '@/components/ui/spinner';

const MIN_QUERY = 3;

const KIND_ICON: Record<SearchHit['kind'], LucideIcon> = {
  project: FolderKanban, member: User, client: Building2, account: Landmark, task: ListChecks,
};

const KIND_LABEL: Record<SearchHit['kind'], string> = {
  project: 'پروژه', member: 'عضو', client: 'کارفرما', account: 'حساب', task: 'تسک',
};

interface Item {
  key: string;
  label: string;
  href: string;
  /** برچسبِ کوچکِ کنارِ ردیف — نوعِ رکورد؛ صفحه‌ها ندارند. */
  sub?: string;
  icon?: LucideIcon;
  /** شناسهٔ شخص — آواتار به‌جای آیکون. */
  userId?: number;
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
 *
 * ظاهر و ناوبریِ صفحه‌کلید از `Command` ِ shadcn (cmdk) می‌آید — همان جزئی
 * که فیلدهای جستجوپذیرِ فرم‌ها دارند. فیلترِ خودِ cmdk خاموش است
 * (`shouldFilter={false}`): صفحه‌ها اینجا فیلتر می‌شوند و رکوردها از سرور
 * می‌آیند؛ فیلترِ دوباره نتیجهٔ سرور را که با املای دیگری جور شده بود
 * پنهان می‌کرد.
 */
export function CommandPalette({ pages }: { pages: Array<{ href: string; label: string }> }) {
  const tr = useT();
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);

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

  const [pageItems, hitItems]: [Item[], Item[]] = useMemo(() => {
    const q = query.trim().toLowerCase();
    /**
     * ⚠️ برچسبِ صفحه‌ها **کلید** است، نه متنِ نهایی: چیدمان آنها را در سطحِ
     * ماژول می‌سازد، یعنی پیش از آنکه زبانِ کاربر معلوم باشد. سایدبار هم
     * همین‌جا ترجمه‌شان می‌کند؛ اینجا هم باید — وگرنه پالت فارسی می‌ماند.
     * جستجو نیز روی متنِ ترجمه‌شده انجام می‌شود تا با آنچه کاربر می‌بیند بخواند.
     */
    const pageMatches: Item[] = pages
      .map((p) => ({ key: `page-${p.href}`, label: tr(p.label), href: p.href, icon: ArrowUpRight }))
      .filter((p) => !q || p.label.toLowerCase().includes(q));

    const recordMatches: Item[] = hits.map((h) => ({
      key: `${h.kind}-${h.id}`,
      label: h.label,
      href: h.href,
      sub: tr(KIND_LABEL[h.kind]),
      icon: KIND_ICON[h.kind],
      userId: h.kind === 'member' || h.kind === 'client' ? h.id : undefined,
    }));

    return [pageMatches, recordMatches];
  }, [pages, hits, query]);
  const nothing = pageItems.length === 0 && hitItems.length === 0;

  const go = useCallback((href: string) => {
    setOpen(false);
    setQuery('');
    router.push(href);
  }, [router]);

  const row = (item: Item) => (
    <CommandItem key={item.key} value={item.key} onSelect={() => go(item.href)}>
      {item.userId
        ? <UserAvatar userId={item.userId} name={item.label} size="xs" />
        : item.icon && <item.icon aria-hidden />}
      <span className="flex-1 truncate">{item.label}</span>
      {/* ⚠️ نه `CommandShortcut`: فاصله‌گذاریِ حروفش اتصالِ حروفِ فارسی را می‌شکند. */}
      {item.sub && <span className="text-xs text-muted-foreground">{item.sub}</span>}
    </CommandItem>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="overflow-hidden p-0 sm:max-w-lg" showCloseButton={false}>
        <DialogHeader className="sr-only">
          <DialogTitle>{t("جستجوی سراسری")}</DialogTitle>
          <DialogDescription>
            {tr("نامِ صفحه، پروژه، عضو، کارفرما یا حساب را بنویسید.")}
          </DialogDescription>
        </DialogHeader>

        {/* `loop` — پیمایشِ چرخشی با پیکان‌ها، مثلِ نسخهٔ قبلی. */}
        <Command shouldFilter={false} loop>
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder={t("رفتن به صفحه، یا جستجوی پروژه، عضو، کارفرما و حساب…")}
          />
          <CommandList className="max-h-80">
            {pageItems.length > 0 && (
              <CommandGroup heading={t("صفحه‌ها")}>{pageItems.map(row)}</CommandGroup>
            )}
            {hitItems.length > 0 && (
              <CommandGroup heading={t("نتایج")}>{hitItems.map(row)}</CommandGroup>
            )}

            {searching && (
              <p className="flex items-center gap-2 px-4 py-3 text-xs text-muted-foreground">
                <Spinner />
                {t("در حال جستجو…")}
              </p>
            )}

            {/* «پیدا نشد» فقط وقتی جستجو تمام شده باشد. */}
            {!searching && nothing && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {query.trim().length < MIN_QUERY
                  ? t("برای جستجوی رکوردها دستِ‌کم سه حرف بنویسید.")
                  : t("چیزی پیدا نشد.")}
              </p>
            )}
          </CommandList>
        </Command>
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
    <Button
      type="button"
      aria-label={t("جستجوی سراسری")}
      onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))}
      variant="outline"
      size="sm"
      className="h-7 gap-2 px-2 text-xs font-normal text-muted-foreground"
    >
      <Search className="size-3.5" />
      <span className="hidden sm:inline">{t("جستجو")}</span>
      {/* کلیدِ میان‌بر با کامپوننتِ رسمی — پیش از این `<kbd>` ِ دستی با کلاس‌های خودمان بود. */}
      <Kbd className="num text-[10px]">{isMac ? '⌘K' : 'Ctrl+K'}</Kbd>
    </Button>
  );
}
