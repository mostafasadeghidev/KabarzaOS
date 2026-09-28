/**
 * ⚠️ افزودهٔ ما به کدِ رسمی: واریانت‌های success و warning
 * (وضعیتِ پروژه و تسک به آن‌ها نیاز دارند).
 *
 * ⚠️ success، warning و destructive **ملایم**اند (DESIGN.md §۲): زمینهٔ
 * کم‌رنگ با متنِ تیرهٔ همان رنگ. نسخهٔ توپر (سبز با متنِ سفید، زرد با متنِ
 * سیاه) کنارِ هم در یک فهرست، صفحه را پرسروصدا می‌کرد. کنتراستِ متن در هر
 * سه بالای ۵:۱ است.
 *
 * ⚠️ `outline` با وجودِ نامش **قاب ندارد** (DESIGN.md §۶): چیپِ خنثیِ ملایم
 * است. ده‌ها بجِ قاب‌دار («سیستمی»، ویژگی‌ها، روند) هرکدام یک خطِ دورِ دیگر
 * به صفحه اضافه می‌کردند. نام عوض نشد تا جای استفاده‌ها دست نخورد. مقدارِ
 * رنگ‌دارِ تگ اینجا نمی‌آید؛ آن `TagChip` است (نقطهٔ رنگی روی چیپِ خنثی).
 */
import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground [a&]:hover:bg-primary/90",
        secondary:
          "bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90",
        destructive:
          "bg-red-50 text-red-700 focus-visible:ring-destructive/20 dark:bg-red-500/15 dark:text-red-300 dark:focus-visible:ring-destructive/40 [a&]:hover:bg-red-100",
        success:
          "bg-emerald-50 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300 [a&]:hover:bg-emerald-100",
        warning:
          "bg-amber-50 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300 [a&]:hover:bg-amber-100",
        outline:
          "bg-muted text-foreground [a&]:hover:bg-border [a&]:hover:text-accent-foreground",
        ghost: "[a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
        link: "text-primary underline-offset-4 [a&]:hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
