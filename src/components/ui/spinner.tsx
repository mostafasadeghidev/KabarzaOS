/** چرخِ انتظار — روی دکمه‌های در حالِ ارسال. */
import { cn } from "@/lib/utils"
import { Loader2Icon } from "lucide-react"

function Spinner({ className, ...props }: React.ComponentProps<"svg">) {
  return (
    <Loader2Icon
      /**
       * ⚠️ تزئینی است، نه اعلان: هرجا این چرخ می‌چرخد، متنِ کنارش
       * («در حالِ ذخیره…») خودش وضعیت را می‌گوید. با `role="status"` ِ
       * پیش‌فرض، صفحه‌خوان یک بار «Loading» ِ انگلیسی را هم می‌خواند.
       */
      aria-hidden="true"
      className={cn("size-4 animate-spin", className)}
      {...props}
    />
  )
}

export { Spinner }
