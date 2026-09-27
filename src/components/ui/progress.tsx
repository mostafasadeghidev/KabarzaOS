"use client"

import * as React from "react"
import { Progress as ProgressPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

// ⚠️ نسخهٔ رسمی نشانگر را با `translateX(-…)` از چپ پر می‌کند؛ در راست‌به‌چپ
// نوار باید از راست پر شود — `rtl:-scale-x-100` کلِ نوار را آینه می‌کند.
// `indicatorClassName` افزوده به نسخهٔ رسمی است: رنگِ نوار گاهی معنا دارد
// (نزدیکیِ ددلاین روی کارتِ پروژه).
// ⚠️ نسخهٔ رسمی `value` را به Root نمی‌دهد: نوار برای صفحه‌خوان «نامعین»
// می‌ماند و `aria-valuenow` خالی است. مقدارها در این اپ همه ۰ تا ۱۰۰ اند.
function Progress({
  className,
  indicatorClassName,
  value,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root> & { indicatorClassName?: string }) {
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      value={value}
      className={cn(
        "relative h-2 w-full overflow-hidden rounded-full bg-primary/20 rtl:-scale-x-100",
        className
      )}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className={cn("h-full w-full flex-1 bg-primary transition-all", indicatorClassName)}
        style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
      />
    </ProgressPrimitive.Root>
  )
}

export { Progress }
