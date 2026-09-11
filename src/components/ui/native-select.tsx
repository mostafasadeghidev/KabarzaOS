/**
 * ⚠️ کدِ رسمیِ shadcn (`native-select`, new-york-v4) با دو تغییر:
 *
 *  ۱. RTL (R-I18N-05): `pr-9` → `pe-9` و `right-3.5` → `end-3.5`؛ وگرنه در
 *     فارسی فلش روی متن می‌نشیند و فاصلهٔ خالی سمتِ دیگر می‌ماند.
 *  ۲. `containerClassName` — افزودهٔ ما. کدِ رسمی `className` را روی خودِ
 *     `<select>` می‌گذارد و پوسته `w-fit` است، پس `className="w-full"` فقط
 *     درونِ پوسته پهن می‌شد و فیلدِ فرم تمام‌عرض نمی‌شد.
 *
 * ⚠️ چرا Native Select و نه Select ِ Radix: تقریباً همهٔ فهرست‌های این اپ با
 * `name` داخلِ فرم فرستاده می‌شوند (FormData) و `value`/`defaultValue`/`onChange`
 * دارند. این یکی همان `<select>` ِ واقعی است با ظاهرِ shadcn، پس جایگزینی
 * هیچ منطقی را عوض نمی‌کند.
 */
import * as React from "react"
import { ChevronDownIcon } from "lucide-react"

import { cn } from "@/lib/utils"

function NativeSelect({
  className,
  containerClassName,
  size = "default",
  ...props
}: Omit<React.ComponentProps<"select">, "size"> & {
  size?: "sm" | "default"
  /** کلاسِ پوسته — مثلاً `w-full` برای فیلدِ تمام‌عرضِ فرم. */
  containerClassName?: string
}) {
  return (
    <div
      className={cn(
        "group/native-select relative w-fit has-[select:disabled]:opacity-50",
        containerClassName
      )}
      data-slot="native-select-wrapper"
    >
      <select
        data-slot="native-select"
        data-size={size}
        className={cn(
          "h-9 w-full min-w-0 appearance-none rounded-md border border-input bg-transparent px-3 py-2 pe-9 text-sm shadow-xs transition-[color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed data-[size=sm]:h-8 data-[size=sm]:py-1 dark:bg-input/30 dark:hover:bg-input/50",
          "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
          "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
          className
        )}
        {...props}
      />
      <ChevronDownIcon
        className="pointer-events-none absolute top-1/2 end-3.5 size-4 -translate-y-1/2 text-muted-foreground opacity-50 select-none"
        aria-hidden="true"
        data-slot="native-select-icon"
      />
    </div>
  )
}

function NativeSelectOption({
  className,
  ...props
}: React.ComponentProps<"option">) {
  return (
    <option
      data-slot="native-select-option"
      className={cn("bg-[Canvas] text-[CanvasText]", className)}
      {...props}
    />
  )
}

function NativeSelectOptGroup({
  className,
  ...props
}: React.ComponentProps<"optgroup">) {
  return (
    <optgroup
      data-slot="native-select-optgroup"
      className={cn("bg-[Canvas] text-[CanvasText]", className)}
      {...props}
    />
  )
}

export { NativeSelect, NativeSelectOptGroup, NativeSelectOption }
