'use client';

import { useActionState, useState, useTransition } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { useActionToast } from '@/components/ui/toast';
import { Panel } from '@/components/page-shell';
import { useT } from '@/i18n/client';
import type { SmtpSettingsView } from '@/server/settings/smtp-service';
import { saveSmtpAction, sendTestMailAction, type SystemState } from './_form/actions';

/**
 * ایمیلِ خروجی (SMTP) — تبِ «اطلاع‌رسانی» (۲.۳۲.۰). فقط مالک.
 * بازنشانیِ رمز، دعوت‌نامهٔ عضوِ تازه و اعلان‌های ایمیلی از همین می‌روند.
 * ⚠️ رمز هرگز به کلاینت نمی‌آید؛ خانهٔ خالی یعنی «دست نزن».
 */
export function MailSection({ smtp }: { smtp: SmtpSettingsView }) {
  const t = useT();
  const [saveState, save] = useActionState(saveSmtpAction, {} as SystemState);
  const [state, setState] = useState<SystemState>({});
  const [pending, start] = useTransition();
  useActionToast(saveState);
  useActionToast(state);

  return (
    <Panel
      title={t('ایمیلِ خروجی (SMTP)')}
      description={t('بازنشانیِ رمز، دعوت‌نامهٔ اعضای تازه و اعلان‌های ایمیلی از این راه فرستاده می‌شوند.')}
      actions={<Badge variant={smtp.enabled ? 'default' : 'secondary'}>{smtp.enabled ? t('فعال') : t('تنظیم نشده')}</Badge>}
      className="max-w-4xl"
    >
      <div className="grid gap-4">
        {smtp.fromEnv ? (
          <p className="text-xs text-muted-foreground">
            {t('تنظیمات از متغیرهای محیطیِ {env} می‌آید و از اینجا قابلِ تغییر نیست.', { env: 'SMTP_*' })}
            {' '}<span dir="ltr" className="font-mono">{smtp.host}:{smtp.port}</span>
          </p>
        ) : (
          <form action={save} className="grid gap-3">
            <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
              <Field>
                <FieldLabel htmlFor="smtp-host">{t('سرور')}</FieldLabel>
                <Input id="smtp-host" name="smtpHost" dir="ltr" autoComplete="off" defaultValue={smtp.host} placeholder="smtp.example.com" />
              </Field>
              <Field>
                <FieldLabel htmlFor="smtp-port">{t('پورت')}</FieldLabel>
                <Input id="smtp-port" name="smtpPort" dir="ltr" inputMode="numeric" defaultValue={String(smtp.port)} placeholder="587" />
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="smtp-user">{t('نامِ کاربری')}</FieldLabel>
                <Input id="smtp-user" name="smtpUser" dir="ltr" autoComplete="off" defaultValue={smtp.user} placeholder="no-reply@example.com" />
              </Field>
              <Field>
                <FieldLabel htmlFor="smtp-pass">{t('رمز')}</FieldLabel>
                <Input
                  id="smtp-pass" name="smtpPassword" type="password" dir="ltr" autoComplete="new-password"
                  placeholder={smtp.hasPassword ? `•••••••• ${t('ثبت‌شده')}` : ''}
                />
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="smtp-from">{t('نشانیِ فرستنده')}</FieldLabel>
              <Input id="smtp-from" name="smtpFrom" dir="ltr" autoComplete="off" defaultValue={smtp.from} placeholder="Kabarza <no-reply@example.com>" />
              <FieldDescription>
                {t('خالی بماند، همان نامِ کاربری فرستنده است. پورتِ ۴۶۵ با TLS از ابتدا، بقیه با STARTTLS.')}
              </FieldDescription>
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" size="sm">{t('ذخیره')}</Button>
              {smtp.enabled && (
                <Button type="submit" size="sm" variant="outline" name="clear" value="1">{t('پاک‌کردن')}</Button>
              )}
            </div>
          </form>
        )}

        <div className="flex items-center gap-3">
          <Button
            type="button" size="sm" variant="outline" disabled={!smtp.enabled || pending}
            onClick={() => start(async () => setState(await sendTestMailAction()))}
          >
            {t('فرستادنِ ایمیلِ آزمایشی به من')}
          </Button>
          {(state.error ?? state.message) && (
            <p className={`text-xs ${state.error ? 'text-destructive' : 'text-muted-foreground'}`}>
              {t(state.error ?? state.message ?? '')}
            </p>
          )}
        </div>
      </div>
    </Panel>
  );
}
