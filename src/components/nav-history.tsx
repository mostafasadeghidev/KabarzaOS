'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useSyncExternalStore } from 'react';
import { ArrowRight } from 'lucide-react';
import { currentCrumbTitle } from '@/components/page-crumb';

/**
 * تاریخچهٔ ناوبری داخلِ برنامه — «برگشت» به صفحه‌ای که واقعاً از آن آمده‌ای.
 *
 * ⚠️ چرا: پیوندِ برگشتِ بالای صفحه همیشه به **صفحهٔ مادر** می‌رفت. کاربری
 * که از «تیمِ من ← عضو» روی پروژه‌ای کلیک می‌کرد، در صفحهٔ پروژه «پروژه‌ها»
 * می‌دید و برای برگشت به همان عضو باید دوباره از منو راه می‌افتاد.
 *
 * - پشته در `sessionStorage` است: برای همین زبانه، با رفرش می‌ماند و با
 *   زبانهٔ تازه از نو شروع می‌شود.
 * - ورود به مسیری که همان «یکی مانده به آخر» است = برگشت (دکمهٔ برگشتِ مرورگر
 *   یا همین پیوند) → پشته یکی کوتاه می‌شود؛ رفت‌وبرگشتِ A→B→A حلقه نمی‌سازد.
 * - آدرس و عنوانِ صفحه **هنگامِ ترک** ثبت می‌شود (کلیک در فازِ capture، پیش از
 *   ناوبری)؛ پس تبِ انتخاب‌شده (`?tab=`) هم برمی‌گردد.
 * - بی‌تاریخچه (پیوندِ مستقیم، زبانهٔ تازه) همان صفحهٔ مادر می‌ماند.
 */
interface Entry { path: string; href: string; title: string }

const KEY = 'kabarza.nav';
const MAX = 30;
const listeners = new Set<() => void>();
let cache: Entry[] | null = null;

function read(): Entry[] {
  if (cache) return cache;
  try {
    const raw = sessionStorage.getItem(KEY);
    cache = raw ? (JSON.parse(raw) as Entry[]) : [];
  } catch { cache = []; }
  return cache;
}
function write(next: Entry[]) {
  cache = next.slice(-MAX);
  try { sessionStorage.setItem(KEY, JSON.stringify(cache)); } catch { /* حالتِ خصوصی — فقط حافظه */ }
  for (const l of listeners) l();
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

/** عنوانِ صفحهٔ فعلی: عنوانِ سرصفحه، وگرنه عنوانِ زبانه بی‌نامِ برنامه. */
function pageTitle(): string {
  return currentCrumbTitle() ?? document.title.split(' — ')[0]?.trim() ?? '';
}

/** آدرس و عنوانِ صفحهٔ فعلی را روی سرِ پشته به‌روز می‌کند. */
function stampTop() {
  const stack = read();
  const top = stack[stack.length - 1];
  if (!top || top.path !== location.pathname) return;
  const href = location.pathname + location.search + location.hash;
  const title = pageTitle();
  if (top.href === href && top.title === title) return;
  write([...stack.slice(0, -1), { ...top, href, title: title || top.title }]);
}

/** بی‌رندر — یک بار در چیدمانِ برنامه؛ هر تغییرِ مسیر را در پشته ثبت می‌کند. */
export function NavHistory() {
  const pathname = usePathname();

  useEffect(() => {
    const stack = read();
    const top = stack[stack.length - 1];
    if (top?.path === pathname) return;
    const prev = stack[stack.length - 2];
    const href = location.pathname + location.search + location.hash;
    if (prev?.path === pathname) write(stack.slice(0, -1));
    else write([...stack, { path: pathname, href, title: '' }]);
  }, [pathname]);

  // عنوانِ صفحه کمی پس از سوار شدن آماده می‌شود (سرصفحه/metadata)؛ بی‌این،
  // صفحه‌ای که با ورودِ مستقیم باز شده و با کلیک ترک نشده بی‌نام می‌ماند.
  useEffect(() => {
    const timers = [400, 1500].map((ms) => setTimeout(stampTop, ms));
    return () => timers.forEach(clearTimeout);
  }, [pathname]);

  useEffect(() => {
    // capture: پیش از آنکه پیوند/فرم ناوبری را شروع کند.
    const onClick = () => stampTop();
    document.addEventListener('click', onClick, true);
    window.addEventListener('pagehide', onClick);
    return () => {
      document.removeEventListener('click', onClick, true);
      window.removeEventListener('pagehide', onClick);
    };
  }, []);

  return null;
}

/** صفحهٔ قبلی در همین زبانه، اگر باشد. */
function usePrevious(): Entry | null {
  const stack = useSyncExternalStore(subscribe, read, () => null);
  const pathname = usePathname();
  if (!stack) return null;
  const top = stack[stack.length - 1];
  const prev = stack[stack.length - 2];
  return top?.path === pathname && prev && prev.title ? prev : null;
}

/**
 * پیوندِ «برگشت» بالای صفحه — به صفحهٔ قبلی اگر از جای دیگری از برنامه
 * آمده‌ای، وگرنه به صفحهٔ مادر (`href` و `children`).
 */
export function HistoryBackLink({ href, children }: { href: string; children: React.ReactNode }) {
  const prev = usePrevious();
  return (
    <Link
      href={prev?.href ?? href}
      className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      {/* در راست‌به‌چپ «برگشت» به راست است؛ در چپ‌به‌راست به چپ. */}
      <ArrowRight className="size-4 ltr:rotate-180" aria-hidden />
      {prev ? prev.title : children}
    </Link>
  );
}
