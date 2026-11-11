'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ExternalLink, Info, Inbox, KeyRound, Mail, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CopyText } from '@/components/copy-text';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { LEVEL_LABELS, type GrantLevel } from '@/domain/access/service-grants';
import { formatDate } from '@/i18n/datetime';
import { useT, useTimeZone } from '@/i18n/client';
import { SecretReveal } from '../access/secret-reveal';

export interface MyAccessRow {
  id: number; serviceName: string; level: GrantLevel;
  accountRef: string; grantedAt: Date | string;
  downloadUrl: string; guide: string; hasSecret: boolean;
  /** `stalwart` = صندوقِ ایمیلِ شرکتی. */
  provider: string;
}

export interface MailSetupView { webmailUrl: string; imapHost: string; imapPort: number; smtpHost: string; smtpPort: number }

/**
 * «دسترسی‌های من» (۲.۶۲.۱): جدولِ کوتاه + پنجرهٔ «جزئیات» برای هر سرویس.
 *
 * ⚠️ پیش از این همه‌چیز در یک سلولِ جدول فشرده بود (راهنما، پیوندها، تنظیماتِ
 * گوشی) و پیوندِ صندوقِ ایمیل «دانلود» نام داشت در حالی که وب‌میل را باز می‌کرد.
 * رمز همچنان فقط با دکمهٔ چشم از سرور خوانده و ثبت می‌شود.
 */
export function MyAccess({ rows, mailSetup }: { rows: MyAccessRow[]; mailSetup: MailSetupView | null }) {
  const tr = useT();
  const tz = useTimeZone();
  const [open, setOpen] = useState<MyAccessRow | null>(null);

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{tr('سرویس')}</TableHead>
            <TableHead>{tr('شناسهٔ حساب')}</TableHead>
            <TableHead>{tr('از تاریخ')}</TableHead>
            <TableHead className="w-0" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell>
                <span className="flex items-center gap-2 font-medium">
                  {row.provider === 'stalwart' ? <Mail className="size-4 text-muted-foreground" /> : <KeyRound className="size-4 text-muted-foreground" />}
                  {row.serviceName}
                </span>
              </TableCell>
              <TableCell className="text-xs" dir="ltr">{row.accountRef ? <CopyText value={row.accountRef} /> : '—'}</TableCell>
              <TableCell className="num text-xs">{formatDate(row.grantedAt, tz)}</TableCell>
              <TableCell>
                <Button size="sm" variant="outline" onClick={() => setOpen(row)}>
                  <Info className="size-3.5" />{tr('جزئیات')}
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={open !== null} onOpenChange={(v) => { if (!v) setOpen(null); }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          {open && <Details row={open} mailSetup={open.provider === 'stalwart' ? mailSetup : null} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 text-sm">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 text-end">{children}</span>
    </div>
  );
}

function Details({ row, mailSetup }: { row: MyAccessRow; mailSetup: MailSetupView | null }) {
  const tr = useT();
  const tz = useTimeZone();
  const isMail = row.provider === 'stalwart';

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          {isMail ? <Mail className="size-4" /> : <KeyRound className="size-4" />}
          {row.serviceName}
        </DialogTitle>
        <DialogDescription className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{tr(LEVEL_LABELS[row.level])}</Badge>
          <span>{tr('از {date}', { date: formatDate(row.grantedAt, tz) })}</span>
        </DialogDescription>
      </DialogHeader>

      <section className="divide-y rounded-lg border px-3">
        <Row label={isMail ? tr('نشانی') : tr('نامِ کاربری')}>
          {row.accountRef ? <span dir="ltr"><CopyText value={row.accountRef} /></span> : '—'}
        </Row>
        <Row label={tr('رمز')}>
          {row.hasSecret ? <SecretReveal grantId={row.id} /> : <span className="text-muted-foreground">{tr('ثبت نشده')}</span>}
        </Row>
      </section>

      {/* کارهای اصلی — دکمه، نه پیوندِ بی‌شکل. */}
      <div className="flex flex-wrap gap-2">
        {isMail && (
          <Button size="sm" asChild>
            <Link href="/mail"><Inbox className="size-4" />{tr('دیدنِ ایمیل‌ها در برنامه')}</Link>
          </Button>
        )}
        {row.downloadUrl && (
          <Button size="sm" variant="outline" asChild>
            <a href={row.downloadUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="size-4" />
              {isMail ? tr('ورود به وب‌میل') : tr('دانلود یا ورود')}
            </a>
          </Button>
        )}
      </div>

      {isMail && mailSetup && (mailSetup.imapHost || mailSetup.smtpHost) && (
        <section className="grid gap-2">
          <h3 className="flex items-center gap-1.5 text-sm font-medium">
            <Smartphone className="size-4" />{tr('تنظیم در گوشی یا Outlook')}
          </h3>
          <div className="divide-y rounded-lg border px-3">
            {mailSetup.imapHost && (
              <Row label={tr('دریافت (IMAP)')}>
                <span dir="ltr" className="font-mono text-xs"><CopyText value={mailSetup.imapHost} /> · {mailSetup.imapPort} · SSL</span>
              </Row>
            )}
            {mailSetup.smtpHost && (
              <Row label={tr('ارسال (SMTP)')}>
                <span dir="ltr" className="font-mono text-xs"><CopyText value={mailSetup.smtpHost} /> · {mailSetup.smtpPort} · SSL</span>
              </Row>
            )}
            <Row label={tr('نامِ کاربری')}>
              <span dir="ltr" className="text-xs"><CopyText value={row.accountRef} /></span>
            </Row>
          </div>
          <p className="text-xs text-muted-foreground">{tr('رمز همان رمزِ بالاست. بعد از اولین ورود، بهتر است از وب‌میل عوضش کنی.')}</p>
        </section>
      )}

      {row.guide && (
        <section className="grid gap-1.5">
          <h3 className="text-sm font-medium">{tr('راهنما')}</h3>
          <p className="whitespace-pre-wrap rounded-lg bg-muted/50 p-3 text-sm leading-7">{row.guide}</p>
        </section>
      )}
    </>
  );
}
