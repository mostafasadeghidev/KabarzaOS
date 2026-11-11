import { redirect } from 'next/navigation';
import { Download, ExternalLink, Paperclip } from 'lucide-react';
import { currentActor } from '@/server/auth';
import { mailboxMessage, MailboxError, readMail, type Address } from '@/server/corp-mail/mailbox';
import { corpMailConfig } from '@/server/corp-mail/settings';
import { getSystemConfig } from '@/server/settings/system-service';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { PageHeader, PageShell } from '@/components/page-shell';
import { pageTitle } from '@/i18n/page-title';
import { primeTranslations, t } from '@/i18n/server';
import { formatDateTime } from '@/i18n/datetime';
import { humanSize } from '@/domain/files/upload';
import { MailFrame } from './mail-frame';

export const generateMetadata = pageTitle('ایمیل');
export const dynamic = 'force-dynamic';

const who = (list: Address[]) => list.map((a) => (a.name ? `${a.name} <${a.email}>` : a.email)).join('، ');

/** یک ایمیل از صندوقِ خودِ کاربر (۲.۶۲.۰). */
export default async function MailMessagePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ folder?: string }>;
}) {
  await primeTranslations();
  const actor = await currentActor();
  if (!actor) redirect('/login');
  const { id } = await params;
  const { folder } = await searchParams;
  const back = { href: folder ? `/mail?folder=${encodeURIComponent(folder)}` : '/mail', label: t('ایمیل') };

  let mail;
  try {
    mail = await readMail(actor, decodeURIComponent(id));
  } catch (error) {
    if (error instanceof MailboxError) {
      return (
        <PageShell>
          <PageHeader back={back} title={t('ایمیل')} />
          <EmptyState title={t(mailboxMessage(error.code))} />
        </PageShell>
      );
    }
    throw error;
  }

  const { timezone } = await getSystemConfig();
  const { webmailUrl } = await corpMailConfig();

  return (
    <PageShell>
      <PageHeader
        back={back}
        title={<span dir="auto">{mail.subject || t('(بی‌موضوع)')}</span>}
        actions={webmailUrl ? (
          <Button size="sm" variant="outline" asChild>
            <a href={webmailUrl} target="_blank" rel="noopener noreferrer"><ExternalLink className="size-4" />{t('پاسخ در وب‌میل')}</a>
          </Button>
        ) : undefined}
      />
      <div className="grid gap-4">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted-foreground">{t('از')}</dt>
          <dd dir="ltr" className="text-start break-all">{who(mail.from)}</dd>
          <dt className="text-muted-foreground">{t('به')}</dt>
          <dd dir="ltr" className="text-start break-all">{who(mail.to)}</dd>
          {mail.cc.length > 0 && (
            <>
              <dt className="text-muted-foreground">{t('رونوشت')}</dt>
              <dd dir="ltr" className="text-start break-all">{who(mail.cc)}</dd>
            </>
          )}
          <dt className="text-muted-foreground">{t('تاریخ')}</dt>
          <dd className="num">{formatDateTime(mail.receivedAt, timezone)}</dd>
        </dl>

        {mail.attachments.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {mail.attachments.map((a) => (
              <li key={a.blobId}>
                <a
                  href={`/api/mail/attachment?email=${encodeURIComponent(mail.id)}&blob=${encodeURIComponent(a.blobId)}`}
                  className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs hover:bg-muted"
                  download
                >
                  <Paperclip className="size-3.5" />
                  <span dir="auto" className="max-w-56 truncate">{a.name}</span>
                  <span className="num text-muted-foreground">{humanSize(a.size, t)}</span>
                  <Download className="size-3.5" />
                </a>
              </li>
            ))}
          </ul>
        )}

        {/* ⚠️ HTML فقط در iframe ِ ایزوله؛ متنِ ساده را React خودش escape می‌کند. */}
        {mail.html
          ? <MailFrame html={mail.html} />
          : <pre dir="auto" className="whitespace-pre-wrap break-words rounded-md border bg-card p-4 font-sans text-sm">{mail.text}</pre>}
      </div>
    </PageShell>
  );
}
