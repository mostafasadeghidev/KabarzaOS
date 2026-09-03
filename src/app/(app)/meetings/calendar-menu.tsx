'use client';

import { CalendarPlus, Download, ExternalLink } from 'lucide-react';
import { CALENDAR_TARGETS, type CalendarEvent } from '@/domain/meetings/calendar-links';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useT } from '@/i18n/client';

/**
 * «افزودن به تقویم» — منوی کوچکی به‌جای دانلودِ مستقیمِ فایل.
 *
 * ⚠️ چرا منو و نه فقط ICS: بیشترِ کاربران تقویمشان روی وب است (گوگل یا
 * اوت‌لوک) و آنجا یک کلیک کافی است؛ فایل برای همان‌ها یعنی دانلود، پیداکردن و
 * باز کردن. فایل می‌ماند، ولی به‌عنوانِ گزینهٔ همگانی — روی موبایل هم همین
 * فایل تقویمِ خودِ دستگاه را باز می‌کند.
 */
export function CalendarMenu({
  meetingId,
  title,
  description,
  location,
  meetAt,
}: {
  meetingId: number;
  title: string;
  description: string;
  location: string;
  meetAt: Date | string;
}) {
  const tr = useT();
  const t = useT();

  const event: CalendarEvent = {
    title,
    description,
    location,
    start: meetAt instanceof Date ? meetAt : new Date(meetAt),
  };
  const icsHref = `/api/meetings/${meetingId}/ics`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="ghost">
          <CalendarPlus className="size-3.5" />
          {tr("افزودن به تقویم")}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground">
          {t("در کدام تقویم؟")}
        </DropdownMenuLabel>
        {CALENDAR_TARGETS.map((target) => (
          <DropdownMenuItem key={target.key} asChild>
            <a
              href={target.href(event, icsHref)}
              {...(target.download
                ? { download: true }
                : { target: '_blank', rel: 'noopener noreferrer' })}
              className="flex items-center gap-2"
            >
              {target.download
                ? <Download className="size-3.5 text-muted-foreground" />
                : <ExternalLink className="size-3.5 text-muted-foreground" />}
              {tr(target.label)}
            </a>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
