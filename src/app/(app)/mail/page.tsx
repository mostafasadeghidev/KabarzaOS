import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AtSign, ChevronLeft, ChevronRight, ExternalLink, Inbox, Paperclip } from 'lucide-react';
import { currentActor } from '@/server/auth';
import { listMail, mailboxMessage, mailboxState, MailboxError } from '@/server/corp-mail/mailbox';
import { corpMailConfig } from '@/server/corp-mail/settings';
import { ownMailAliases } from '@/server/corp-mail/accounts';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PageHeader, PageShell, Panel } from '@/components/page-shell';
import { pageTitle } from '@/i18n/page-title';
import { primeTranslations, t } from '@/i18n/server';
import { formatDateTime } from '@/i18n/datetime';
import { getSystemConfig } from '@/server/settings/system-service';
import { db } from '@/db/client';
import { serviceGrants, services } from '@/db/schema';
import { and, eq, isNull } from 'drizzle-orm';
import { cn } from '@/lib/utils';
import { ConnectMailboxForm } from './connect-form';
import { DisconnectButton } from './disconnect-button';

export const generateMetadata = pageTitle('ایمیل');
export const dynamic = 'force-dynamic';

/**
 * صندوقِ ایمیلِ شرکتیِ خودِ کاربر (۲.۶۲.۰) — فقط خواندن؛ پاسخ و نوشتن در وب‌میل.
 * ⚠️ همه‌چیز از سرور خوانده می‌شود و فقط صندوقِ خودِ بیننده.
 */
export default async function MailPage({
  searchParams,
}: {
  searchParams: Promise<{ folder?: string; p?: string }>;
}) {
  await primeTranslations();
  const actor = await currentActor();
  if (!actor) redirect('/login');
  const { folder: folderId, p } = await searchParams;
  const config = await corpMailConfig();
  const header = (
    <PageHeader
      title={t('ایمیل')}
      actions={config.webmailUrl ? (
        <Button size="sm" variant="outline" asChild>
          <a href={config.webmailUrl} target="_blank" rel="noopener noreferrer"><ExternalLink className="size-4" />{t('وب‌میل')}</a>
        </Button>
      ) : undefined}
    />
  );

  if (actor.viewOnly) {
    return <PageShell>{header}<EmptyState title={t(mailboxMessage('view_only'))} /></PageShell>;
  }

  const state = await mailboxState(actor.id);
  if (state === 'none') {
    return <PageShell>{header}<EmptyState icon={<Inbox className="size-5" />} title={t(mailboxMessage('no_mailbox'))} /></PageShell>;
  }

  const [grant] = await db.select({ address: serviceGrants.accountRef }).from(serviceGrants)
    .innerJoin(services, eq(services.id, serviceGrants.serviceId))
    .where(and(eq(serviceGrants.userId, actor.id), isNull(serviceGrants.revokedAt), eq(services.provider, 'stalwart')));

  const connect = (
    <PageShell>
      {header}
      <Panel title={t('اتصالِ صندوق به برنامه')} description={t('برای دیدنِ ایمیل‌ها اینجا، یک بار صندوقت را وصل کن.')}>
        <ConnectMailboxForm address={grant?.address ?? ''} />
      </Panel>
    </PageShell>
  );
  if (state === 'linked') return connect;

  let data;
  // ۳.۳.۰ — نشانی‌های دیگرِ همین صندوق برای سطرِ «این صندوق»؛ شکستش صفحه را نمی‌شکند.
  const aliasesP = ownMailAliases(actor.id).catch(() => [] as string[]);
  try {
    data = await listMail(actor, { folderId, position: Number(p) || 0 });
  } catch (error) {
    if (error instanceof MailboxError && error.code === 'not_connected') return connect;
    if (error instanceof MailboxError) {
      return <PageShell>{header}<EmptyState title={t(mailboxMessage(error.code))} /></PageShell>;
    }
    throw error;
  }

  const [{ timezone }, aliases] = await Promise.all([getSystemConfig(), aliasesP]);
  const folderName = (f: { name: string; role: string | null }) => {
    const roles: Record<string, string> = { inbox: 'صندوقِ ورودی', sent: 'فرستاده‌ها', drafts: 'پیش‌نویس‌ها', archive: 'بایگانی', junk: 'هرزنامه', trash: 'سطلِ زباله' };
    return f.role && roles[f.role] ? t(roles[f.role]!) : f.name;
  };
  const href = (folder: string, position = 0) => `/mail?folder=${encodeURIComponent(folder)}${position ? `&p=${position}` : ''}`;
  const pageSize = 30;

  return (
    <PageShell>
      {header}
      {/*
        ۳.۳.۰ — کدام صندوق اینجا وصل است: نشانیِ اصلی و نشانی‌های دیگری (alias) که ایمیلشان
        هم به همین صندوق می‌رسد.
      */}
      {grant?.address && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border bg-card px-3 py-2 text-sm">
          <AtSign className="size-4 shrink-0 text-muted-foreground" />
          <span className="text-muted-foreground">{t('این صندوق:')}</span>
          <span dir="ltr" className="font-medium">{grant.address}</span>
          {aliases.length > 0 && (
            <>
              <span className="text-muted-foreground">· {t('نشانی‌های دیگر:')}</span>
              {aliases.map((a) => <span key={a} dir="ltr" className="rounded-md bg-muted px-1.5 py-0.5 text-xs">{a}</span>)}
            </>
          )}
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-[13rem_1fr]">
        <nav className="flex gap-1 overflow-x-auto md:flex-col" aria-label={t('پوشه‌ها')}>
          {data.folders.map((f) => (
            <Link
              key={f.id}
              href={href(f.id)}
              className={cn(
                'flex shrink-0 items-center justify-between gap-2 rounded-md px-3 py-1.5 text-sm hover:bg-muted',
                data.folder?.id === f.id && 'bg-muted font-medium',
              )}
            >
              <span className="truncate">{folderName(f)}</span>
              {f.unread > 0 && <Badge variant="secondary" className="num">{f.unread}</Badge>}
            </Link>
          ))}
          <div className="mt-2 hidden md:block"><DisconnectButton /></div>
        </nav>

        <div className="grid min-w-0 gap-2">
          {data.items.length === 0 ? (
            <EmptyState icon={<Inbox className="size-5" />} title={t('ایمیلی در این پوشه نیست.')} />
          ) : (
            <ul className="divide-y rounded-lg border bg-card">
              {data.items.map((m) => {
                const from = m.from[0];
                return (
                  <li key={m.id}>
                    <Link
                      href={`/mail/${encodeURIComponent(m.id)}?folder=${encodeURIComponent(data.folder!.id)}`}
                      className="grid gap-0.5 px-4 py-2.5 hover:bg-muted/50"
                    >
                      <div className="flex items-center gap-2">
                        <span className={cn('min-w-0 flex-1 truncate text-sm', m.unread && 'font-semibold')} dir="auto">
                          {from?.name || from?.email || t('بی‌فرستنده')}
                        </span>
                        {m.hasAttachment && <Paperclip className="size-3.5 shrink-0 text-muted-foreground" aria-label={t('پیوست')} />}
                        <span className="num shrink-0 text-xs text-muted-foreground">{formatDateTime(m.receivedAt, timezone)}</span>
                      </div>
                      <div className={cn('truncate text-sm', m.unread ? 'font-medium' : 'text-muted-foreground')} dir="auto">
                        {m.subject || t('(بی‌موضوع)')}
                      </div>
                      <div className="truncate text-xs text-muted-foreground" dir="auto">{m.preview}</div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}

          {data.total > pageSize && data.folder && (
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {t('{from}–{to} از {total}', {
                  from: data.position + 1, to: Math.min(data.position + pageSize, data.total), total: data.total,
                })}
              </span>
              <div className="flex gap-1">
                {/* ⚠️ پیوندِ غیرفعال دکمهٔ غیرفعال است، نه Link با disabled (روی <a> بی‌اثر است). */}
                {data.position === 0
                  ? <Button size="sm" variant="ghost" disabled aria-label={t('تازه‌تر')}><ChevronRight className="size-4" /></Button>
                  : (
                    <Button size="sm" variant="ghost" asChild>
                      <Link href={href(data.folder.id, Math.max(0, data.position - pageSize))} aria-label={t('تازه‌تر')}>
                        <ChevronRight className="size-4" />
                      </Link>
                    </Button>
                  )}
                {data.position + pageSize >= data.total
                  ? <Button size="sm" variant="ghost" disabled aria-label={t('قدیمی‌تر')}><ChevronLeft className="size-4" /></Button>
                  : (
                    <Button size="sm" variant="ghost" asChild>
                      <Link href={href(data.folder.id, data.position + pageSize)} aria-label={t('قدیمی‌تر')}>
                        <ChevronLeft className="size-4" />
                      </Link>
                    </Button>
                  )}
              </div>
            </div>
          )}
        </div>
      </div>
    </PageShell>
  );
}
