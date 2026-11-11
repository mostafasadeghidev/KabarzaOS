'use client';

import { useActionState, useState, useTransition } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { useActionToast } from '@/components/ui/toast';
import { Panel } from '@/components/page-shell';
import { useT, useTimeZone } from '@/i18n/client';
import { formatDateTime } from '@/i18n/datetime';
import { ALWAYS_RESERVED } from '@/domain/corp-mail/config';
import type { CorpMailSettingsView } from '@/server/corp-mail/settings';
import { saveCorpMailAction, testCorpMailAction, type SystemState } from './_form/actions';

/**
 * ایمیلِ شرکتی — اتصال به سرورِ Stalwart (۲.۵۹.۰). فقط مالک.
 *
 * ⚠️ نشانی و کلیدِ API فقط از env می‌آیند (`STALWART_URL`، `STALWART_API_KEY`)؛
 * اینجا فقط وضعیت و تنظیماتِ ساختنِ حساب است. کلید هرگز به مرورگر نمی‌رسد.
 */
const ERRORS: Record<string, string> = {
  not_configured: 'STALWART_URL یا STALWART_API_KEY تنظیم نشده است.',
  unauthorized: 'کلیدِ API پذیرفته نشد (۴۰۱). کلید یا IP ِ مجاز را در پنلِ Stalwart بررسی کنید.',
  forbidden: 'کلیدِ API مجوزِ کافی ندارد (۴۰۳).',
  network: 'سرورِ ایمیل در دسترس نیست. نشانی و شبکه را بررسی کنید.',
  http: 'سرورِ ایمیل پاسخِ خطا داد.',
  method: 'سرورِ ایمیل درخواست را رد کرد؛ مجوزهای کلید را بررسی کنید.',
  bad_response: 'پاسخِ سرورِ ایمیل قابلِ فهم نبود.',
};

export function CorpMailSection({ view }: { view: CorpMailSettingsView }) {
  const t = useT();
  const tz = useTimeZone();
  const [saveState, save] = useActionState(saveCorpMailAction, {} as SystemState);
  const [state, setState] = useState<SystemState>({});
  const [pending, start] = useTransition();
  useActionToast(saveState);
  useActionToast(state);

  const { config, status } = view;
  const badge = !view.configured
    ? { label: t('تنظیم نشده'), variant: 'secondary' as const }
    : status?.ok
      ? { label: t('وصل'), variant: 'default' as const }
      : { label: t('آزمون نشده'), variant: 'secondary' as const };

  return (
    <Panel
      title={t('ایمیلِ شرکتی')}
      description={t('ساختن و بستنِ حسابِ ایمیلِ کارمندان روی سرورِ ایمیلِ خودتان (Stalwart).')}
      actions={<Badge variant={badge.variant}>{badge.label}</Badge>}
      className="max-w-3xl"
    >
      <div className="grid gap-5">
        {/* ۱ — اتصال */}
        <div className="grid gap-2 text-sm">
          {view.configured ? (
            <p className="text-muted-foreground">
              {t('سرور')}: <span dir="ltr" className="font-mono">{view.host}</span>
            </p>
          ) : (
            <p className="text-muted-foreground">
              {t('برای وصل شدن، در متغیرهای محیطیِ سرور {url} و {key} را بگذارید و برنامه را دوباره راه بیندازید.', {
                url: 'STALWART_URL', key: 'STALWART_API_KEY',
              })}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button" size="sm" variant="outline" disabled={!view.configured || pending}
              onClick={() => start(async () => setState(await testCorpMailAction()))}
            >
              {t('آزمونِ اتصال')}
            </Button>
            {status && (
              <span className={`text-xs ${status.ok ? 'text-muted-foreground' : 'text-destructive'}`}>
                {status.ok
                  ? t('آخرین آزمون موفق — {n} حساب روی سرور', { n: status.accounts ?? 0 })
                  : status.error ? t(ERRORS[status.error] ?? ERRORS.http!) : t('پس از تغییرِ دامنه، دوباره آزمون کنید.')}
                {' · '}<span className="num">{formatDateTime(status.at, tz)}</span>
              </span>
            )}
          </div>
          {status?.ok && config.domain && status.domainId === null && (
            <p className="text-xs text-destructive">
              {t('دامنهٔ {domain} روی سرورِ ایمیل پیدا نشد. دامنه‌های سرور: {list}', {
                domain: config.domain, list: (status.domains ?? []).join('، ') || '—',
              })}
            </p>
          )}
        </div>

        {/* ۲ — تنظیماتِ ساختنِ حساب */}
        <form action={save} className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
            <Field>
              <FieldLabel htmlFor="cm-domain">{t('دامنهٔ نشانی‌ها')}</FieldLabel>
              <Input id="cm-domain" name="domain" dir="ltr" defaultValue={config.domain} placeholder="example.com" />
            </Field>
            <Field>
              <FieldLabel htmlFor="cm-quota">{t('سهمیه (گیگ)')}</FieldLabel>
              <Input id="cm-quota" name="quotaGb" dir="ltr" inputMode="decimal" defaultValue={String(config.quotaGb)} />
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="cm-reserved">{t('نام‌های رزرو')}</FieldLabel>
            <Textarea id="cm-reserved" name="reserved" dir="ltr" rows={2} defaultValue={config.reserved.join(', ')} />
            <FieldDescription>
              {t('نشانی‌هایی که هرگز ساخته نمی‌شوند، مثلاً صندوق‌هایی که جای دیگری (Google) دارند. این‌ها همیشه رزروند: {list}', {
                list: ALWAYS_RESERVED.join(', '),
              })}
            </FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="cm-webmail">{t('لینکِ وب‌میل')}</FieldLabel>
            <Input id="cm-webmail" name="webmailUrl" dir="ltr" defaultValue={config.webmailUrl} placeholder="https://mail.example.com" />
          </Field>
          <div className="grid gap-3 sm:grid-cols-[1fr_6rem_1fr_6rem]">
            <Field>
              <FieldLabel htmlFor="cm-imap">{t('سرورِ IMAP')}</FieldLabel>
              <Input id="cm-imap" name="imapHost" dir="ltr" defaultValue={config.imapHost} placeholder="mail.example.com" />
            </Field>
            <Field>
              <FieldLabel htmlFor="cm-imap-port">{t('پورت')}</FieldLabel>
              <Input id="cm-imap-port" name="imapPort" dir="ltr" inputMode="numeric" defaultValue={String(config.imapPort)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="cm-smtp">{t('سرورِ SMTP')}</FieldLabel>
              <Input id="cm-smtp" name="smtpHost" dir="ltr" defaultValue={config.smtpHost} placeholder="mail.example.com" />
            </Field>
            <Field>
              <FieldLabel htmlFor="cm-smtp-port">{t('پورت')}</FieldLabel>
              <Input id="cm-smtp-port" name="smtpPort" dir="ltr" inputMode="numeric" defaultValue={String(config.smtpPort)} />
            </Field>
          </div>
          <p className="text-xs text-muted-foreground">
            {t('لینکِ وب‌میل و سرورهای IMAP و SMTP به کارمند نشان داده می‌شوند تا ایمیلش را در گوشی یا Outlook تنظیم کند.')}
          </p>
          <Field>
            <FieldLabel htmlFor="cm-app-ips">{t('IP های مجاز برای خواندنِ صندوق')}</FieldLabel>
            <Input id="cm-app-ips" name="appIps" dir="ltr" defaultValue={config.appIps.join(', ')} placeholder="10.0.4.0/24" />
            <FieldDescription>
              {t('رمزِ مخصوصی که برنامه برای خواندنِ صندوقِ هر کارمند می‌گیرد فقط از این IPها پذیرفته می‌شود: همان شبکه‌ای که برنامه از آن به سرورِ ایمیل وصل است. تا خالی است، اتصالِ صندوق خاموش می‌ماند.')}
            </FieldDescription>
          </Field>
          <div>
            <Button type="submit" size="sm">{t('ذخیره')}</Button>
          </div>
        </form>
      </div>
    </Panel>
  );
}
