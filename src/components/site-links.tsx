'use client';

import { useState } from 'react';
import { Check, Copy, ExternalLink, FlaskConical, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Hint } from '@/components/ui/tooltip';
import { siteHost } from '@/domain/projects/site-links';
import { useT } from '@/i18n/client';

/**
 * لینک‌های سایتِ پروژه (۲.۱۹.۰) — دامنهٔ اصلی (آیکنِ کره) و آدرسِ آزمایشی
 * (آیکنِ فلاسک). آدرس‌ها چپ‌به‌راست‌اند تا در متنِ فارسی جابه‌جا نشوند.
 * ⚠️ کارفرمای بی‌تیک این‌جا مقدارِ خالی می‌گیرد (ماسک در سرویس)، نه پنهان‌سازی در UI.
 */

/** چیپ‌های فشرده برای کارتِ پروژه — بی‌ردیف اگر هر دو خالی باشند. */
export function SiteLinkPills({ liveUrl, testUrl }: { liveUrl: string; testUrl: string }) {
  const t = useT();
  if (!liveUrl && !testUrl) return null;
  const pill = 'inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:border-input hover:text-foreground';
  return (
    <div className="flex flex-wrap gap-1.5">
      {liveUrl && (
        <Hint label={t('دامنهٔ اصلی')}>
          <a href={liveUrl} target="_blank" rel="noopener noreferrer" dir="ltr" className={pill}>
            <Globe className="size-3 shrink-0" aria-hidden />
            <span className="truncate">{siteHost(liveUrl)}</span>
          </a>
        </Hint>
      )}
      {testUrl && (
        <Hint label={t('دامنهٔ آزمایشی')}>
          <a href={testUrl} target="_blank" rel="noopener noreferrer" dir="ltr" className={pill}>
            <FlaskConical className="size-3 shrink-0" aria-hidden />
            <span className="truncate">{siteHost(testUrl)}</span>
          </a>
        </Hint>
      )}
    </div>
  );
}

function LinkRow({ icon, label, url }: { icon: React.ReactNode; label: string; url: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-3 border-t py-2 first:border-t-0 first:pt-0 last:pb-0">
      <span className="flex min-w-28 items-center gap-1.5 text-sm text-muted-foreground">
        {icon}
        {label}
      </span>
      <a
        href={url} target="_blank" rel="noopener noreferrer" dir="ltr"
        className="min-w-0 flex-1 truncate text-start text-sm hover:underline"
      >
        {url}
      </a>
      <Button
        type="button" variant="outline" size="icon-sm" aria-label={copied ? t('کپی شد') : t('کپی')}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch { /* بی‌دسترسی به کلیپ‌بورد */ }
        }}
      >
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      </Button>
      <Button asChild variant="outline" size="icon-sm" aria-label={t('باز کردن')}>
        <a href={url} target="_blank" rel="noopener noreferrer"><ExternalLink className="size-3.5" /></a>
      </Button>
    </div>
  );
}

/** بدنهٔ کارتِ «سایتِ پروژه» در تبِ اطلاعات. */
export function SiteLinksBody({ liveUrl, testUrl }: { liveUrl: string; testUrl: string }) {
  const t = useT();
  return (
    <div className="grid">
      {liveUrl && <LinkRow icon={<Globe className="size-4" aria-hidden />} label={t('دامنهٔ اصلی')} url={liveUrl} />}
      {testUrl && <LinkRow icon={<FlaskConical className="size-4" aria-hidden />} label={t('دامنهٔ آزمایشی')} url={testUrl} />}
    </div>
  );
}
