'use client';

import { useState } from 'react';
import { Check, Link2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useT } from '@/i18n/client';

/**
 * نشانِ شمارهٔ تسک (۲.۱۶.۰) — «#325» داخلِ پروژه، «ALZ-325» با کدِ پروژه
 * بیرون از آن. ⚠️ شماره برای کارفرما از سرور null می‌آید و نشان هم نیست.
 * ارقام لاتین و چپ‌به‌راست، تا در متنِ فارسی جابه‌جا نشود.
 */
export function TaskNumber({
  number, code, className,
}: { number?: number | null; code?: string | null; className?: string }) {
  if (!number) return null;
  return (
    <span
      dir="ltr"
      className={cn(
        'num inline-flex shrink-0 items-center rounded border bg-muted/50 px-1 font-mono text-[11px] leading-4 font-normal text-muted-foreground',
        className,
      )}
    >
      {code ? `${code}-${number}` : `#${number}`}
    </span>
  );
}

/** «کپیِ پیوند» — نشانیِ مستقیمِ همین تسک (`/projects/{id}?task={n}`). */
export function CopyTaskLink({ projectId, number }: { projectId: number; number: number }) {
  const tr = useT();
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button" variant="outline" size="sm"
      onClick={async () => {
        const url = `${window.location.origin}/projects/${projectId}?task=${number}`;
        try {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch { /* بی‌دسترسی به کلیپ‌بورد */ }
      }}
    >
      {copied ? <Check className="size-3.5" /> : <Link2 className="size-3.5" />}
      {copied ? tr('کپی شد') : tr('کپیِ پیوند')}
    </Button>
  );
}
