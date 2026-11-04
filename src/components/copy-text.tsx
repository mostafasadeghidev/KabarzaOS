'use client';

import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/toast';
import { Hint } from '@/components/ui/tooltip';
import { useT } from '@/i18n/client';

/**
 * متنی که با کلیک کپی می‌شود (۲.۵۲.۰) — ایمیل و شمارهٔ کارتِ اشخاص.
 * ⚠️ دکمه است، نه span ِ کلیک‌پذیر: با کیبورد هم می‌رسد و صفحه‌خوان «کپی» را می‌خواند.
 * بی‌دسترسی به کلیپ‌بورد (صفحهٔ غیرامن، اجازهٔ مرورگر) پیامِ خطا می‌گیرد، نه سکوت.
 */
export function CopyText({ value, className, children }: { value: string; className?: string; children?: React.ReactNode }) {
  const tr = useT();
  const { show } = useToast();
  return (
    <Hint label={tr('کلیک برای کپی')}>
    <button
      type="button"
      // شماره و ایمیل چپ‌به‌راست‌اند؛ «auto» در کارتِ فارسی جابه‌جایشان نمی‌کند (+98 …).
      dir="auto"
      aria-label={`${tr('کپی')}: ${value}`}
      className={cn(
        'cursor-copy rounded-sm underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
      onClick={async () => {
        if (await copyToClipboard(value)) show(tr('کپی شد'));
        else show(tr('کپی نشد؛ دستی انتخاب و کپی کنید.'), 'error');
      }}
    >
      {children ?? value}
    </button>
    </Hint>
  );
}

/**
 * کلیپ‌بوردِ مدرن، و اگر نشد (نشانیِ غیرامن، اجازهٔ مرورگر، پنجرهٔ بی‌فوکوس)
 * راهِ قدیمیِ `execCommand('copy')` با یک textarea ِ موقت.
 */
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch { /* راهِ قدیمی */ }
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    area.remove();
  }
}
