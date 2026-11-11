import { redirect } from 'next/navigation';
import { Download, ExternalLink, FileText, Paperclip } from 'lucide-react';
import { currentActor } from '@/server/auth';
import { mailboxMessage, MailboxError, readMail, type Address } from '@/server/corp-mail/mailbox';
import { corpMailConfig } from '@/server/corp-mail/settings';
import { getSystemConfig } from '@/server/settings/system-service';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { BackLink, PageShell } from '@/components/page-shell';
import { PageCrumb } from '@/components/page-crumb';
import { pageTitle } from '@/i18n/page-title';
import { primeTranslations, t } from '@/i18n/server';
import { formatDateTime } from '@/i18n/datetime';
import { humanSize } from '@/domain/files/upload';
import { MailFrame } from './mail-frame';

export const generateMetadata = pageTitle('ایمیل');
export const dynamic = 'force-dynamic';

const display = (a: Address) => (a.name ? `${a.name} <${a.email}>` : a.email);

/** حرفِ اولِ نام یا نشانی — برای دایرهٔ کنارِ فرستنده. */
const initial = (a: Address | undefined) => (a?.name || a?.email || '?').trim().charAt(0).toUpperCase();

/** یک ایمیل از صندوقِ خودِ کاربر (۲.۶۲.۰؛ ظاهرِ تازه و برگشتِ دیدنی ۲.۶۲.۱). */
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
  const backHref = folder ? `/mail?folder=${encodeURIComponent(folder)}` : '/mail';
  const back = <BackLink href={backHref}>{t('ایمیل')}</BackLink>;

  let mail;
  try {
    mail = await readMail(actor, decodeURIComponent(id));
  } catch (error) {
    if (error instanceof MailboxError) {
      return (
        <PageShell>
          {back}
          <EmptyState title={t(mailboxMessage(error.code))} />
        </PageShell>
      );
    }
    throw error;
  }

  const { timezone } = await getSystemConfig();
  const { webmailUrl } = await corpMailConfig();
  const sender = mail.from[0];
  const subject = mail.subject || t('(بی‌موضوع)');

  return (
    <PageShell>
      {/* مسیرِ نوارِ بالا («ایمیل › موضوع») + دکمهٔ برگشتِ دیدنی بالای صفحه. */}
      <PageCrumb title={subject} backHref={backHref} backLabel={t('ایمیل')} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        {back}
        {webmailUrl && (
          <Button size="sm" variant="outline" asChild>
            <a href={webmailUrl} target="_blank" rel="noopener noreferrer"><ExternalLink className="size-4" />{t('پاسخ در وب‌میل')}</a>
          </Button>
        )}
      </div>

      <article className="grid gap-5 rounded-xl border bg-card p-5 shadow-xs sm:p-6">
        <header className="grid gap-4">
          <h1 dir="auto" className="text-xl font-bold leading-relaxed">{subject}</h1>
          <div className="flex items-start gap-3">
            <div
              aria-hidden
              className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary"
            >
              {initial(sender)}
            </div>
            <div className="grid min-w-0 flex-1 gap-0.5 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span dir="auto" className="font-semibold">{sender?.name || sender?.email || t('بی‌فرستنده')}</span>
                <span className="num text-xs text-muted-foreground">{formatDateTime(mail.receivedAt, timezone)}</span>
              </div>
              {sender?.name && <span dir="ltr" className="text-start text-xs text-muted-foreground break-all">{sender.email}</span>}
              {mail.to.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  {t('به')}: <span dir="ltr" className="break-all">{mail.to.map(display).join('، ')}</span>
                </span>
              )}
              {mail.cc.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  {t('رونوشت')}: <span dir="ltr" className="break-all">{mail.cc.map(display).join('، ')}</span>
                </span>
              )}
            </div>
          </div>
        </header>

        <hr className="border-border" />

        {/* ⚠️ HTML فقط در iframe ِ ایزوله؛ متنِ ساده را React خودش escape می‌کند. */}
        {mail.html
          ? <MailFrame html={mail.html} />
          : <div dir="auto" className="whitespace-pre-wrap break-words text-sm leading-7">{mail.text}</div>}

        {mail.attachments.length > 0 && (
          <section className="grid gap-2 border-t pt-4">
            <h2 className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Paperclip className="size-3.5" />
              {t('{n} پیوست', { n: mail.attachments.length })}
            </h2>
            <ul className="grid gap-2 sm:grid-cols-2">
              {mail.attachments.map((a) => (
                <li key={a.blobId}>
                  <a
                    href={`/api/mail/attachment?email=${encodeURIComponent(mail.id)}&blob=${encodeURIComponent(a.blobId)}`}
                    className="flex items-center gap-3 rounded-lg border bg-background px-3 py-2 text-sm transition-colors hover:bg-muted"
                    download
                  >
                    <FileText className="size-5 shrink-0 text-muted-foreground" />
                    <span className="grid min-w-0 flex-1">
                      <span dir="auto" className="truncate font-medium">{a.name}</span>
                      <span className="num text-xs text-muted-foreground">{humanSize(a.size, t)}</span>
                    </span>
                    <Download className="size-4 shrink-0 text-muted-foreground" />
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}
      </article>
    </PageShell>
  );
}
