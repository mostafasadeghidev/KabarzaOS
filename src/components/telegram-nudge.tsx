'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Send, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useT } from '@/i18n/client';
import { snoozeTelegramNudgeAction } from '@/app/(app)/_actions/telegram-nudge';

/**
 * بنرِ ملایمِ «تلگرامت را وصل کن» — پورتِ `telegram_nudge_banner()`.
 *
 * ⚠️ سه شرطش را **سرور** سنجیده (توکنِ بات هست، کاربر وصل نیست، خواب
 * نزده) و این کامپوننت فقط وقتی رندر می‌شود که هر سه برقرار باشند —
 * وگرنه هر بارگذاریِ صفحه یک فلشِ بنری داشت که بلافاصله غیب می‌شد.
 *
 * «بعداً» هفت روز می‌خواباند (همان بازهٔ نسخهٔ قبلی)؛ وصل‌شدن برای همیشه
 * خاموشش می‌کند چون شرطِ دوم دیگر برقرار نیست.
 */
export function TelegramNudge() {
  const tr = useT();
  const [hidden, setHidden] = useState(false);
  const [pending, startTransition] = useTransition();

  if (hidden) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 border-b bg-muted/40 px-4 py-2 text-sm">
      <Send className="size-3.5 shrink-0 text-primary" />
      <span className="min-w-0 flex-1">
        {tr('برای اینکه هیچ اعلانی را از دست ندهید، تلگرامتان را وصل کنید.')}
      </span>
      <Button asChild size="sm" variant="outline" className="h-7">
        <Link href="/profile?tab=telegram">{tr('اتصال تلگرام')}</Link>
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="h-7 text-muted-foreground"
        disabled={pending}
        onClick={() => startTransition(async () => {
          await snoozeTelegramNudgeAction();
          setHidden(true);
        })}
      >
        <X className="me-1 size-3" />
        {tr('بعداً')}
      </Button>
    </div>
  );
}
