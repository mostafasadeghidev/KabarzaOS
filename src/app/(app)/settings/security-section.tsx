'use client';

import { useActionState, useState, useTransition } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useActionToast } from '@/components/ui/toast';
import { Panel } from '@/components/page-shell';
import { TurnstileWidget } from '@/components/turnstile-widget';
import { useT } from '@/i18n/client';
import type { TurnstileSettingsView } from '@/server/settings/turnstile-service';
import {
  saveTurnstileKeysAction, setTurnstileEnabledAction, testTurnstileAction, type SystemState,
} from './_form/actions';

/**
 * تبِ «امنیت» — کپچای کلودفلر روی ورود و فراموشیِ رمز (۲.۳۱.۰). فقط مالک.
 *
 * سه گام، به همین ترتیب، تا مالک با کلیدِ اشتباه خودش را بیرون نگذارد:
 * ۱. ذخیرهٔ کلیدها (کپچا را خاموش و آزمون را باطل می‌کند)
 * ۲. آزمون: ویجت همین‌جا نشان داده و پاسخش نزدِ کلودفلر سنجیده می‌شود
 * ۳. روشن‌کردن — فقط پس از آزمونِ موفقِ همان کلیدها
 */
export function SecuritySection({ turnstile }: { turnstile: TurnstileSettingsView }) {
  const t = useT();
  const [saveState, save] = useActionState(saveTurnstileKeysAction, {} as SystemState);
  const [state, setState] = useState<SystemState>({});
  const [pending, start] = useTransition();
  const [token, setToken] = useState<string | null>(null);
  useActionToast(saveState);
  useActionToast(state);

  const status = turnstile.killSwitch
    ? { label: t('خاموش با TURNSTILE_DISABLED'), variant: 'secondary' as const }
    : turnstile.active
      ? { label: t('روشن'), variant: 'default' as const }
      : { label: t('خاموش'), variant: 'secondary' as const };

  return (
    <Panel
      title={t('کپچای کلودفلر (Turnstile)')}
      description={t('بررسیِ «ربات نیستم» روی صفحه‌های ورود و فراموشیِ رمز. ربات تلگرام، اتصالِ Claude و APIها دست نمی‌خورند.')}
      actions={<Badge variant={status.variant}>{status.label}</Badge>}
      className="max-w-3xl"
    >
      <div className="grid gap-5">
        {turnstile.killSwitch && (
          <p className="text-xs text-muted-foreground">
            {t('متغیرِ محیطیِ {env} کپچا را خاموش نگه داشته است؛ تا وقتی هست، تنظیماتِ زیر اثر ندارد.', { env: 'TURNSTILE_DISABLED' })}
          </p>
        )}

        {/* ۱ — کلیدها */}
        {turnstile.fromEnv ? (
          <p className="text-xs text-muted-foreground">
            {t('کلیدها از متغیرهای محیطیِ {a} و {b} می‌آیند و از اینجا قابلِ تغییر نیستند.', { a: 'TURNSTILE_SITE_KEY', b: 'TURNSTILE_SECRET_KEY' })}
          </p>
        ) : (
          <form action={save} className="grid gap-3">
            <p className="text-sm font-medium">{t('۱. کلیدها')}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="ts-site">{t('کلیدِ عمومی (Site Key)')}</FieldLabel>
                <Input id="ts-site" name="siteKey" dir="ltr" autoComplete="off" defaultValue={turnstile.siteKey} placeholder="0x4AAAAAAA…" />
              </Field>
              <Field>
                <FieldLabel htmlFor="ts-secret">{t('کلیدِ محرمانه (Secret Key)')}</FieldLabel>
                {/* ⚠️ کلیدِ محرمانه هرگز به کلاینت نمی‌آید؛ خانهٔ خالی یعنی «دست نزن». */}
                <Input
                  id="ts-secret" name="secretKey" type="password" dir="ltr" autoComplete="off"
                  placeholder={turnstile.hasSecret ? `•••••••• ${t('ثبت‌شده')}` : '0x4AAAAAAA…'}
                />
              </Field>
            </div>
            <FieldDescription>
              {t('در داشبوردِ Cloudflare از بخشِ Turnstile یک ویجت با دامنهٔ همین سایت بسازید. ذخیرهٔ کلیدِ تازه کپچا را خاموش می‌کند تا دوباره آزموده شود.')}
            </FieldDescription>
            <div className="flex gap-2">
              <Button type="submit" size="sm">{t('ذخیره')}</Button>
              {(turnstile.siteKey || turnstile.hasSecret) && (
                <Button type="submit" size="sm" variant="outline" name="clear" value="1">{t('پاک‌کردن')}</Button>
              )}
            </div>
          </form>
        )}

        {/* ۲ — آزمون */}
        {!turnstile.fromEnv && turnstile.siteKey && turnstile.hasSecret && (
          <div className="grid gap-3">
            <p className="text-sm font-medium">
              {t('۲. آزمون')}{' '}
              {turnstile.verified && <Badge variant="secondary" className="ms-1">{t('آزموده شد')}</Badge>}
            </p>
            <p className="text-xs text-muted-foreground">
              {t('ویجت را کامل کنید و «آزمون» بزنید؛ پاسخ با کلیدِ محرمانه نزدِ کلودفلر سنجیده می‌شود.')}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <TurnstileWidget key={turnstile.siteKey} siteKey={turnstile.siteKey} onToken={setToken} resetSignal={state} />
              <Button
                type="button" size="sm" variant="outline" disabled={!token || pending}
                onClick={() => start(async () => setState(await testTurnstileAction(token ?? '')))}
              >
                {t('آزمون')}
              </Button>
            </div>
          </div>
        )}

        {/* ۳ — روشن/خاموش */}
        {!turnstile.fromEnv && (
          <div className="flex items-center gap-3">
            <Switch
              id="ts-on"
              checked={turnstile.enabled}
              disabled={pending || (!turnstile.enabled && !turnstile.verified)}
              onCheckedChange={(on) => start(async () => setState(await setTurnstileEnabledAction(on)))}
            />
            <Label htmlFor="ts-on">{t('۳. کپچا روی ورود و فراموشیِ رمز روشن باشد')}</Label>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          {t('اگر بیرون ماندید، {env} را در فایلِ .env ِ سرور بگذارید و برنامه را دوباره راه بیندازید.', { env: 'TURNSTILE_DISABLED=1' })}
        </p>
      </div>
    </Panel>
  );
}
