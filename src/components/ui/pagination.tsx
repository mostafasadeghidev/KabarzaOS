import * as React from "react"
import { ChevronLeftIcon, ChevronRightIcon, MoreHorizontalIcon } from "lucide-react"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"
import { buttonVariants, type Button } from "@/components/ui/button"

/**
 * ⚠️ کدِ رسمیِ shadcn (`pagination`, new-york-v4) با سه تغییر:
 *
 *  ۱. RTL (R-I18N-05): پیکانِ «قبلی/بعدی» در راست‌چین برعکس است — `rtl:rotate-180`؛
 *     `sm:pl-2.5`/`sm:pr-2.5` → `ps`/`pe`.
 *  ۲. بی‌متنِ انگلیسیِ ثابت: «Previous»/«Next» و برچسب‌های دسترس‌پذیری از
 *     فراخوان می‌آیند (ترجمه‌شده)، نه از این‌جا.
 *  ۳. `asChild` روی `PaginationLink` تا `<Link>` ِ Next داخلش بنشیند (پیمایشِ
 *     کلاینتی، نه بارگذاریِ کاملِ صفحه).
 *
 * یک صفحه‌بندِ آمادهٔ اپ روی همین‌ها سوار است: `@/components/ui/pager`.
 */

function Pagination({ className, ...props }: React.ComponentProps<"nav">) {
  return (
    <nav
      role="navigation"
      data-slot="pagination"
      className={cn("mx-auto flex w-full justify-center", className)}
      {...props}
    />
  )
}

function PaginationContent({
  className,
  ...props
}: React.ComponentProps<"ul">) {
  return (
    <ul
      data-slot="pagination-content"
      className={cn("flex flex-row items-center gap-1", className)}
      {...props}
    />
  )
}

function PaginationItem({ ...props }: React.ComponentProps<"li">) {
  return <li data-slot="pagination-item" {...props} />
}

type PaginationLinkProps = {
  isActive?: boolean
  asChild?: boolean
} & Pick<React.ComponentProps<typeof Button>, "size"> &
  React.ComponentProps<"a">

function PaginationLink({
  className,
  isActive,
  asChild = false,
  size = "icon",
  ...props
}: PaginationLinkProps) {
  const Comp = asChild ? Slot.Root : "a"
  return (
    <Comp
      aria-current={isActive ? "page" : undefined}
      data-slot="pagination-link"
      data-active={isActive}
      className={cn(
        buttonVariants({
          variant: isActive ? "outline" : "ghost",
          size,
        }),
        className
      )}
      {...props}
    />
  )
}

function PaginationPrevious({
  className,
  children,
  ...props
}: React.ComponentProps<typeof PaginationLink>) {
  return (
    <PaginationLink
      size="default"
      className={cn("gap-1 px-2.5 sm:ps-2.5", className)}
      {...props}
    >
      <ChevronLeftIcon className="rtl:rotate-180" />
      {children && <span className="hidden sm:block">{children}</span>}
    </PaginationLink>
  )
}

function PaginationNext({
  className,
  children,
  ...props
}: React.ComponentProps<typeof PaginationLink>) {
  return (
    <PaginationLink
      size="default"
      className={cn("gap-1 px-2.5 sm:pe-2.5", className)}
      {...props}
    >
      {children && <span className="hidden sm:block">{children}</span>}
      <ChevronRightIcon className="rtl:rotate-180" />
    </PaginationLink>
  )
}

function PaginationEllipsis({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      aria-hidden
      data-slot="pagination-ellipsis"
      className={cn("flex size-9 items-center justify-center", className)}
      {...props}
    >
      <MoreHorizontalIcon className="size-4" />
    </span>
  )
}

export {
  Pagination,
  PaginationContent,
  PaginationLink,
  PaginationItem,
  PaginationPrevious,
  PaginationNext,
  PaginationEllipsis,
}
