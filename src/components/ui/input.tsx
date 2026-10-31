"use client"

import * as React from "react"

import { cn } from "@/lib/utils"
import { groupDigits, trimZeros, ungroupDigits } from "@/lib/number-input"

const INPUT_CLASS = [
  "h-9 w-full min-w-0 rounded-md border border-input bg-card px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30",
  "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
  "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
]

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  /**
   * ⚠️ هر خانهٔ مبلغ (`inputMode="decimal"`) سه‌رقم‌سه‌رقم جدا نمایش داده می‌شود
   * (۲.۲۵.۰) — «4000000» هنگامِ تایپ خوانا نبود و احتمالِ صفرِ کم/زیاد بالا بود.
   * یک جا، نه در هر فرم: همهٔ خانه‌های مبلغِ برنامه از همین‌جا رد می‌شوند.
   */
  if (props.inputMode === "decimal" && type !== "number") {
    return <GroupedNumberInput className={cn(INPUT_CLASS, className)} {...props} />
  }
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(INPUT_CLASS, className)}
      {...props}
    />
  )
}

/**
 * خانهٔ عددیِ سه‌رقمی.
 *
 * ⚠️ قرارداد با فرم‌ها دست نخورده: `onChange` و مقدارِ فرستاده‌شده **عددِ خام**
 * است (بی‌ویرگول، رقمِ لاتین). نمایش ویرگول دارد؛ مقدارِ فرم از یک ورودیِ پنهان
 * با همان `name` می‌رود. رقمِ فارسی/عربیِ تایپ‌شده هم لاتین می‌شود.
 */
function GroupedNumberInput({
  value, defaultValue, onChange, name, placeholder, ...props
}: React.ComponentProps<"input">) {
  const controlled = value !== undefined
  /**
   * مقدارِ بیرونی (از پایگاه‌داده) بی‌صفرِ انتهایی؛ ولی چیزی که کاربر همین حالا
   * تایپ کرد دست نمی‌خورد — وگرنه «2.0» پیش از تایپِ «5» به «2» برمی‌گشت.
   */
  const typedValue = React.useRef<string | null>(null)
  const initial = () => trimZeros(ungroupDigits(String(defaultValue ?? "")))
  const [inner, setInner] = React.useState(initial)
  const ref = React.useRef<HTMLInputElement>(null)
  /** چند رقم پیش از مکان‌نما بود — پس از افزوده‌شدنِ ویرگول همان‌جا برمی‌گردد. */
  const caret = React.useRef<number | null>(null)

  // مقدارِ آغازینِ تازه (مقدارِ برگشتی پس از خطای فرم) جایگزین می‌شود.
  React.useEffect(() => {
    if (!controlled) setInner(trimZeros(ungroupDigits(String(defaultValue ?? ""))))
  }, [controlled, defaultValue])

  // ریستِ فرم (React 19 پس از اکشنِ موفق) — state هم باید برگردد.
  React.useEffect(() => {
    const form = ref.current?.form
    if (!form || controlled) return
    const onReset = () => setInner(trimZeros(ungroupDigits(String(defaultValue ?? ""))))
    form.addEventListener("reset", onReset)
    return () => form.removeEventListener("reset", onReset)
  }, [controlled, defaultValue])

  const external = controlled ? ungroupDigits(String(value ?? "")) : null
  const raw = external === null ? inner : external === typedValue.current ? external : trimZeros(external)
  const shown = groupDigits(raw)

  React.useLayoutEffect(() => {
    const el = ref.current
    if (!el || caret.current === null || document.activeElement !== el) return
    let seen = 0
    let pos = 0
    while (pos < shown.length && seen < caret.current) {
      if (shown[pos] !== ",") seen += 1
      pos += 1
    }
    el.setSelectionRange(pos, pos)
    caret.current = null
  }, [shown])

  return (
    <>
      <input
        {...props}
        ref={ref}
        type="text"
        data-slot="input"
        dir={props.dir ?? "ltr"}
        value={shown}
        placeholder={placeholder && /^-?[\d.,]+$/.test(placeholder) ? groupDigits(ungroupDigits(placeholder)) : placeholder}
        onChange={(e) => {
          const typed = e.target.value
          const before = typed.slice(0, e.target.selectionStart ?? typed.length)
          caret.current = ungroupDigits(before).length
          const next = ungroupDigits(typed)
          typedValue.current = next
          if (!controlled) setInner(next)
          if (onChange) {
            // ⚠️ فراخوان‌ها فقط `e.target.value` را می‌خوانند — همان را خام می‌دهیم.
            const target = Object.create(e.target) as HTMLInputElement
            Object.defineProperty(target, "value", { value: next })
            onChange({ ...e, target, currentTarget: target } as React.ChangeEvent<HTMLInputElement>)
          }
        }}
      />
      {name && <input type="hidden" name={name} value={raw} />}
    </>
  )
}

export { Input }
