"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Tabs as TabsPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      orientation={orientation}
      /**
       * ⚠️ `min-w-0`: ریشهٔ تب اغلب فرزندِ یک grid است و نوارِ تبِ پیمایشی
       * (`w-max` داخلِ `overflow-x-auto`) حداقل‌عرضِ خودش را به ستونِ grid
       * تحمیل می‌کرد — روی موبایل کلِ صفحه پهن‌تر از صفحه‌نمایش می‌شد (گزارش‌ها
       * ۹۷۵px، تنظیمات ۷۷۲px) به‌جای آنکه فقط نوارِ تب پیمایش بخورد.
       */
      className={cn(
        "group/tabs flex min-w-0 gap-2 data-[orientation=horizontal]:flex-col",
        className
      )}
      {...props}
    />
  )
}

const tabsListVariants = cva(
  "group/tabs-list inline-flex w-fit items-center justify-center rounded-lg p-[3px] text-muted-foreground group-data-[orientation=horizontal]/tabs:h-9 group-data-[orientation=vertical]/tabs:h-fit group-data-[orientation=vertical]/tabs:flex-col data-[variant=line]:rounded-none",
  {
    variants: {
      variant: {
        default: "bg-muted",
        line: "gap-1 bg-transparent",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

/**
 * نشانگرِ لغزانِ تبِ فعال — یک خط (line) یا یک قرص (default) که با
 * انتخابِ تبِ تازه نرم از جای قبلی به جای تازه می‌رود، به‌جای پریدن.
 *
 * ⚠️ جای تبِ فعال با offsetLeft/offsetWidth سنجیده می‌شود (در راست‌به‌چپ هم درست، چون هر دو
 * فیزیکی‌اند). با تغییرِ data-state ِ تب‌ها (MutationObserver) و تغییرِ اندازه (ResizeObserver)
 * دوباره سنجیده می‌شود. بارِ اول بی‌حرکت می‌نشیند تا از گوشهٔ صفحه نلغزد.
 */
/**
 * با عوض شدنِ تب، محتوای زیرِ نوارِ تب نرم ظاهر می‌شود — همه‌جا یکسان.
 *
 * ⚠️ هیچ صفحه‌ای از TabsContent استفاده نمی‌کند؛ هر صفحه محتوای تبش را خودش زیرِ نوار می‌گذارد.
 * پس «محتوا» = خواهرهای بعدیِ نزدیک‌ترین نیایی از ریشهٔ Tabs که خواهرِ بعدی دارد (حداکثر ۶ پله، تا مرزِ main یا پنجره).
 * نسخهٔ سنجشِ OverflowTabs (`data-measure`) کنار گذاشته می‌شود.
 */
function animatePanel(list: HTMLElement) {
  if (list.querySelector("[data-measure]")) return
  if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return
  /*
   * ⚠️ خواهرِ «واقعی»: نسخهٔ پنهانِ سنجشِ OverflowTabs (aria-hidden، `data-measure`) درست کنارِ
   * نوارِ تب است؛ پیش از این همان انیمیت می‌شد و محتوای تب‌های صفحهٔ پروژه بی‌حرکت می‌ماند.
   */
  const skip = (x: Element) =>
    // اسکریپت/استایل چیزی برای نشان دادن ندارند.
    x.matches("script, style, template, link, noscript") ||
    x.getAttribute("aria-hidden") === "true" || !!x.querySelector("[data-measure]") || getComputedStyle(x).display === "none" ||
    // پایینِ پنجره (بستن/ذخیره) با عوض شدنِ تب نباید تکان بخورد.
    x.matches("[data-slot='dialog-footer'], [data-slot='sheet-footer'], [data-slot='alert-dialog-footer']") ||
    // ابزارِ کنارِ نوار (جعبهٔ جستجو، فیلتر): فقط کنترل، بی متن — محتوا نیست (صفحهٔ پروژه‌ها).
    (!!x.matches("input, select, textarea, [data-slot='input-group'], [role='search']") || !!x.querySelector("input, select, textarea")) && !(x.textContent ?? "").trim()
  const real = (el: Element | null) => {
    let x = el
    while (x && skip(x)) x = x.nextElementSibling
    return x as HTMLElement | null
  }
  let node: HTMLElement | null = list.closest<HTMLElement>('[data-slot="tabs"]') ?? list
  /*
   * ⚠️ مرز: بالا رفتن در «main»، پنجره یا کشو می‌ایستد. وقتی تبِ تازه خالی است، پیش از این
   * از صفحه بیرون می‌زد و چیزی بیرون از محتوا (اسکریپتِ سایدبار، اعلان‌ها) را انیمیت می‌کرد.
   */
  const boundary = "main, [data-slot='dialog-content'], [data-slot='sheet-content'], [data-slot='alert-dialog-content'], [data-slot='popover-content']"
  for (let i = 0; node && i < 6 && !real(node.nextElementSibling); i++) {
    if (node.matches(boundary)) return
    node = node.parentElement
  }
  if (!node || node.matches(boundary)) return
  let sib = real(node.nextElementSibling)
  for (let n = 0; sib && n < 6; n++, sib = real(sib.nextElementSibling)) {
    /*
     * ⚠️ یکدستی: محتوایی که کارت‌های تازه‌سوارش خودشان همین حالا انیمیشنِ ورود (wp-rise) دارند
     * دوباره انیمیت نمی‌شود — وگرنه «مشخصاتِ شرکت» دو انیمیشنِ روی هم داشت و بقیه یکی.
     * هر دو دقیقاً یک شکل‌اند (همان مدت، فاصله و منحنی) تا فرقی دیده نشود.
     */
    const cardsRising = [sib, ...sib.querySelectorAll<HTMLElement>('[data-slot="card"]')].some((el) =>
      el.getAnimations?.().some((a) => (a as CSSAnimation).animationName === "wp-rise" && a.playState !== "finished"))
    if (cardsRising) continue
    sib.animate?.(
      [{ opacity: 0, transform: "translateY(8px) scale(0.99)" }, { opacity: 1, transform: "none" }],
      { duration: 450, delay: n * 40, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)", fill: "backwards" },
    )
  }
}

function useActiveIndicator(list: React.RefObject<HTMLDivElement | null>) {
  const [box, setBox] = React.useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const [ready, setReady] = React.useState(false)
  React.useLayoutEffect(() => {
    const el = list.current
    if (!el) return
    const measure = () => {
      const active = el.querySelector<HTMLElement>(':scope > [data-slot="tabs-trigger"][data-state="active"]')
      if (!active || active.offsetWidth === 0) { setBox(null); return }
      setBox({ x: active.offsetLeft, y: active.offsetTop, w: active.offsetWidth, h: active.offsetHeight })
    }
    measure()
    const raf = requestAnimationFrame(() => setReady(true))
    let lastActive = el.querySelector<HTMLElement>(':scope > [data-slot="tabs-trigger"][data-state="active"]')
    const onMutate = () => {
      measure()
      const now = el.querySelector<HTMLElement>(':scope > [data-slot="tabs-trigger"][data-state="active"]')
      // فقط وقتی تبِ فعال واقعاً عوض شد — نه با هر تغییرِ دیگرِ DOM.
      if (now && lastActive && (now.id || now) !== (lastActive.id || lastActive)) animatePanel(el)
      if (now) lastActive = now
    }
    const mo = new MutationObserver(onMutate)
    mo.observe(el, { subtree: true, attributes: true, attributeFilter: ["data-state"], childList: true })
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null
    ro?.observe(el)
    void document.fonts?.ready.then(measure)
    return () => { cancelAnimationFrame(raf); mo.disconnect(); ro?.disconnect() }
  }, [list])
  return { box, ready }
}

function TabsList({
  className,
  variant = "default",
  children,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List> &
  VariantProps<typeof tabsListVariants>) {
  const ref = React.useRef<HTMLDivElement>(null)
  const { box, ready } = useActiveIndicator(ref)
  return (
    <TabsPrimitive.List
      ref={ref}
      data-slot="tabs-list"
      data-variant={variant}
      data-indicator={box ? "" : undefined}
      className={cn(tabsListVariants({ variant }), "relative", className)}
      {...props}
    >
      {box && (
        <span
          aria-hidden
          data-slot="tabs-indicator"
          data-ready={ready ? "" : undefined}
          style={{ transform: `translate(${box.x}px, ${box.y}px)`, width: box.w, height: box.h }}
        />
      )}
      {children}
    </TabsPrimitive.List>
  )
}

/**
 * ⚠️ دو تغییرِ ما در کدِ رسمی (DESIGN.md §۷):
 * - تبِ فعالِ قرصی `bg-card` است، نه `bg-background`: زمینهٔ صفحه حالا کاغذِ
 *   رنگی است و قرصِ فعال باید سطحِ سفید باشد تا از بقیه جدا دیده شود.
 * - متنِ تبِ غیرفعال `text-muted-foreground` است، نه `text-foreground/60` که
 *   روی زمینهٔ `muted` فقط ۴٫۴۶ کنتراست داشت.
 */
function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "relative inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap text-muted-foreground transition-all group-data-[orientation=vertical]/tabs:w-full group-data-[orientation=vertical]/tabs:justify-start hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 group-data-[variant=default]/tabs-list:data-[state=active]:shadow-sm group-data-[variant=line]/tabs-list:data-[state=active]:shadow-none dark:text-muted-foreground dark:hover:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        "group-data-[variant=line]/tabs-list:bg-transparent group-data-[variant=line]/tabs-list:data-[state=active]:bg-transparent dark:group-data-[variant=line]/tabs-list:data-[state=active]:border-transparent dark:group-data-[variant=line]/tabs-list:data-[state=active]:bg-transparent",
        "data-[state=active]:bg-card data-[state=active]:text-foreground dark:data-[state=active]:border-input dark:data-[state=active]:bg-input/30 dark:data-[state=active]:text-foreground",
        "after:absolute after:bg-foreground after:opacity-0 after:transition-opacity group-data-[orientation=horizontal]/tabs:after:inset-x-0 group-data-[orientation=horizontal]/tabs:after:bottom-[-5px] group-data-[orientation=horizontal]/tabs:after:h-0.5 group-data-[orientation=vertical]/tabs:after:inset-y-0 group-data-[orientation=vertical]/tabs:after:-right-1 group-data-[orientation=vertical]/tabs:after:w-0.5 group-data-[variant=line]/tabs-list:data-[state=active]:after:opacity-100",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("flex-1 outline-none", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants }
