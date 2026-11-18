'use client';

import { createContext, useContext } from 'react';
import { CircleHelp } from 'lucide-react';
import { Hint } from '@/components/ui/tooltip';
import { useT } from '@/i18n/client';

/**
 * علامتِ سؤالِ کنارِ عنوانِ کارت — با بردنِ موس (یا فوکوس) می‌گوید کارت برای چیست و چه نشان می‌دهد.
 *
 * متن از **بافتار** می‌آید، نه پراپ: شبکهٔ داشبورد هر کارت را در `CardHelpProvider` با متنِ همان کارت
 * می‌پیچد و سرتیترها (Panel، MetricCard، صف‌ها…) فقط `<CardHelp />` می‌گذارند. بیرون از داشبورد
 * بافتاری نیست و چیزی رندر نمی‌شود — پس افزودنش به Panel ِ مشترک بی‌خطر است.
 */
const Ctx = createContext<string | undefined>(undefined);

export function CardHelpProvider({ text, children }: { text?: string; children: React.ReactNode }) {
  return <Ctx.Provider value={text}>{children}</Ctx.Provider>;
}

export function CardHelp() {
  const text = useContext(Ctx);
  const t = useT();
  if (!text) return null;
  return (
    <Hint label={<span className="block max-w-64 text-start leading-relaxed">{text}</span>} side="bottom">
      {/* ⚠️ span، نه button: بعضی کارت‌ها (MetricCard) خودشان پیوندند و دکمه داخلِ پیوند نامعتبر است. */}
      <span
        role="img"
        tabIndex={0}
        aria-label={t('این کارت چیست؟')}
        className="inline-grid size-4 shrink-0 cursor-help place-items-center rounded-full text-muted-foreground/60 outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        <CircleHelp className="size-3.5" />
      </span>
    </Hint>
  );
}
