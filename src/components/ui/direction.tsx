/**
 * کدِ رسمیِ shadcn (`direction`, new-york-v4).
 *
 * ⚠️ Radix جهتِ `<html dir>` را **نمی‌خواند**. بدونِ این فراهم‌کننده هر
 * کامپوننتِ Radix (Tabs، ToggleGroup، RadioGroup، منوها) روی خودش
 * `dir="ltr"` می‌گذارد: در فارسی ترتیبِ تب‌ها برعکس می‌شد و کلیدهای جهت‌دارِ
 * صفحه‌کلید وارونه کار می‌کردند.
 */
"use client"

import * as React from "react"
import { Direction } from "radix-ui"

function DirectionProvider({
  dir,
  direction,
  children,
}: React.ComponentProps<typeof Direction.DirectionProvider> & {
  direction?: React.ComponentProps<typeof Direction.DirectionProvider>["dir"]
}) {
  return (
    <Direction.DirectionProvider dir={direction ?? dir}>
      {children}
    </Direction.DirectionProvider>
  )
}

const useDirection = Direction.useDirection

export { DirectionProvider, useDirection }
