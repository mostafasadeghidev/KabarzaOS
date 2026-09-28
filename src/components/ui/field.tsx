"use client"

import { useMemo } from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"

/**
 * ⚠️ کدِ رسمیِ shadcn (`field`, new-york-v4) با چند تغییر — همه به‌خاطرِ
 * چگالیِ این اپ (DESIGN.md §۴: فرم‌ها فشرده‌اند):
 *
 *  ۱. فاصلهٔ برچسب تا فیلد ۶ پیکسل است (`gap-1.5`)، نه ۱۲؛ فاصلهٔ فیلدها در
 *     `FieldGroup` ۱۶، نه ۲۸. همان فاصله‌هایی که پیش از این هر فرم دستی
 *     می‌نوشت (`grid gap-1.5`)، پس چیدمانِ هیچ دیالوگی عوض نمی‌شود.
 *  ۲. راهنما و خطا ۱۲ پیکسل‌اند (`text-xs`) — همان اندازهٔ متنِ کمکیِ فرم‌ها.
 *  ۳. `FieldSet` گروهِ داخلِ فرم است. `variant="box"` قابِ **پُر** است
 *     (`bg-muted/60`، بی‌خط — قاب در قاب ممنوع، DESIGN.md §۸) و عنوانِ
 *     گروه داخلِ همان قاب می‌نشیند: `legend` ِ شناور (`float-start`) دیگر
 *     «لجندِ رسم‌شده» نیست و روی لبهٔ بالایی نمی‌نشیند؛ در گرید یک ردیفِ
 *     عادی می‌شود. آزموده شد.
 *  ۴. RTL: `ml-4` → `ms-4`.
 *
 * کجا: هر «برچسب + فیلد + راهنما/خطا» در هر فرم. `Label` ِ خام فقط برای
 * برچسبِ کنارِ چک‌باکس/رادیو یا برچسبِ نوارِ ابزار می‌ماند.
 */

const fieldSetVariants = cva("grid min-w-0", {
  variants: {
    variant: {
      plain: "gap-1.5",
      box: "gap-2 rounded-lg bg-muted/60 p-3",
    },
  },
  defaultVariants: { variant: "plain" },
})

function FieldSet({
  className,
  variant = "plain",
  ...props
}: React.ComponentProps<"fieldset"> & VariantProps<typeof fieldSetVariants>) {
  return (
    <fieldset
      data-slot="field-set"
      data-variant={variant}
      className={cn(fieldSetVariants({ variant }), className)}
      {...props}
    />
  )
}

function FieldLegend({
  className,
  variant = "label",
  ...props
}: React.ComponentProps<"legend"> & { variant?: "legend" | "label" }) {
  return (
    <legend
      data-slot="field-legend"
      data-variant={variant}
      className={cn(
        "float-start w-full font-medium",
        "data-[variant=legend]:text-base",
        "data-[variant=label]:text-sm",
        className
      )}
      {...props}
    />
  )
}

function FieldGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="field-group"
      className={cn(
        "group/field-group @container/field-group flex w-full flex-col gap-4 data-[slot=checkbox-group]:gap-3 [&>[data-slot=field-group]]:gap-4",
        className
      )}
      {...props}
    />
  )
}

/**
 * ⚠️ عمودی `grid` است، نه `flex-col [&>*]:w-full` ِ رسمی: گرید فقط فرزندِ
 * `auto` را می‌کشد و فیلدِ پهنا‌دار (`w-16`، `w-[9.5rem]`، فهرستِ `w-fit`)
 * را دست نمی‌زند — همان رفتارِ پوششِ قبلی. نسخهٔ رسمی `w-full` را به زور
 * روی همه می‌گذاشت و نوارهای ابزار (ساعتِ کاری، دفترِ کل) به هم می‌ریخت.
 *
 * ⚠️ خودِ Field هم `w-full` ندارد: در نوارِ ابزارِ `flex-wrap` هر فیلد باید
 * به اندازهٔ خودش باشد تا کنارِ هم بنشینند؛ با `w-full` هر فیلد یک ردیفِ
 * کامل می‌گرفت و فیلترِ ساعتِ کاری ستونی می‌شد (دیده شد). در فرمِ عمودی
 * (گرید) فرزندِ `auto` خودش کشیده می‌شود، پس چیزی از دست نمی‌رود.
 */
const fieldVariants = cva(
  "group/field gap-1.5 data-[invalid=true]:text-destructive",
  {
    variants: {
      orientation: {
        vertical: ["grid"],
        horizontal: [
          "flex flex-row items-center",
          "[&>[data-slot=field-label]]:flex-auto",
          "has-[>[data-slot=field-content]]:items-start has-[>[data-slot=field-content]]:[&>[role=checkbox],[role=radio]]:mt-px",
        ],
        responsive: [
          "flex flex-col @md/field-group:flex-row @md/field-group:items-center",
          "@md/field-group:[&>[data-slot=field-label]]:flex-auto",
          "@md/field-group:has-[>[data-slot=field-content]]:items-start @md/field-group:has-[>[data-slot=field-content]]:[&>[role=checkbox],[role=radio]]:mt-px",
        ],
      },
    },
    defaultVariants: {
      orientation: "vertical",
    },
  }
)

function Field({
  className,
  orientation = "vertical",
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof fieldVariants>) {
  return (
    <div
      role="group"
      data-slot="field"
      data-orientation={orientation}
      className={cn(fieldVariants({ orientation }), className)}
      {...props}
    />
  )
}

function FieldContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="field-content"
      className={cn(
        "group/field-content flex flex-1 flex-col gap-1.5 leading-snug",
        className
      )}
      {...props}
    />
  )
}

function FieldLabel({
  className,
  ...props
}: React.ComponentProps<typeof Label>) {
  return (
    /*
     * ⚠️ بی «کارتِ انتخاب» ِ رسمی (`has-data-[state=checked]:bg-primary/5`):
     * آن قاعده برچسبی را که چک‌باکسِ تیک‌خورده دارد آبی می‌کرد — الگویی که
     * این اپ ندارد، و روی برچسبِ سادهٔ چک‌باکس فقط لکهٔ رنگ بود.
     */
    <Label
      data-slot="field-label"
      className={cn(
        "group/field-label peer/field-label flex w-fit gap-2 leading-snug group-data-[disabled=true]/field:opacity-50",
        className
      )}
      {...props}
    />
  )
}

function FieldTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="field-label"
      className={cn(
        "flex w-fit items-center gap-2 text-sm leading-snug font-medium group-data-[disabled=true]/field:opacity-50",
        className
      )}
      {...props}
    />
  )
}

function FieldDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="field-description"
      className={cn(
        "text-xs leading-normal font-normal text-muted-foreground group-has-[[data-orientation=horizontal]]/field:text-balance",
        "[&>a]:underline [&>a]:underline-offset-4 [&>a:hover]:text-primary",
        className
      )}
      {...props}
    />
  )
}

function FieldSeparator({
  children,
  className,
  ...props
}: React.ComponentProps<"div"> & {
  children?: React.ReactNode
}) {
  return (
    <div
      data-slot="field-separator"
      data-content={!!children}
      className={cn(
        "relative -my-2 h-5 text-sm group-data-[variant=outline]/field-group:-mb-2",
        className
      )}
      {...props}
    >
      <Separator className="absolute inset-0 top-1/2" />
      {children && (
        <span
          className="relative mx-auto block w-fit bg-background px-2 text-muted-foreground"
          data-slot="field-separator-content"
        >
          {children}
        </span>
      )}
    </div>
  )
}

function FieldError({
  className,
  children,
  errors,
  ...props
}: React.ComponentProps<"div"> & {
  errors?: Array<{ message?: string } | undefined>
}) {
  const content = useMemo(() => {
    if (children) {
      return children
    }

    if (!errors?.length) {
      return null
    }

    const uniqueErrors = [
      ...new Map(errors.map((error) => [error?.message, error])).values(),
    ]

    if (uniqueErrors?.length == 1) {
      return uniqueErrors[0]?.message
    }

    return (
      <ul className="ms-4 flex list-disc flex-col gap-1">
        {uniqueErrors.map(
          (error, index) =>
            error?.message && <li key={index}>{error.message}</li>
        )}
      </ul>
    )
  }, [children, errors])

  if (!content) {
    return null
  }

  return (
    <div
      role="alert"
      data-slot="field-error"
      className={cn("text-xs font-normal text-destructive", className)}
      {...props}
    >
      {content}
    </div>
  )
}

export {
  Field,
  FieldLabel,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLegend,
  FieldSeparator,
  FieldSet,
  FieldContent,
  FieldTitle,
}
