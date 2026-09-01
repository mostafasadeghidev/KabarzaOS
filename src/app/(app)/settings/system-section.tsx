'use client';

import { useActionState, useState, useTransition } from 'react';
import { useFormStatus } from 'react-dom';
import {
  saveSystemAction, saveTelegramAction, sendReportTestAction, sendTelegramTestAction, testTelegramAction,
  type SystemState,
} from './_form/actions';
import {
  CHATPOLL_CHOICES, MAX_PURGE_DAYS, PULSE_CHOICES, type SystemConfig,
} from '@/domain/settings/system';
import { IDLE_CHOICES, OFFLINE_CHOICES, PING_CHOICES } from '@/domain/people/presence';
import { WEEKDAYS } from '@/domain/availability/weekly';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useT } from '@/i18n/client';
import { LOCALES, LOCALE_NAMES } from '@/i18n/config';
import { agoParts, type SchedulerHealth } from '@/domain/scheduler/health';
import type { TelegramSettingsView } from '@/server/settings/telegram-service';
import { Activity } from 'lucide-react';

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? 'در حالِ ذخیره…' : 'ذخیره تنظیمات'}
    </Button>
  );
}

/** انتخابِ ثانیه از فهرستِ مجاز — همان مهارِ سمتِ سرور، اینجا هم دیده شود. */
function Seconds({
  id, name, value, choices,
}: {
  id: string; name: string; value: number; choices: readonly number[];
}) {
  const tr = useT();
  return (
    <select
      id={id}
      name={name}
      defaultValue={value}
      className="num h-9 rounded-md border bg-background px-2 text-sm"
    >
      {choices.map((c) => (
        <option key={c} value={c}>{tr('{n} ثانیه', { n: c })}</option>
      ))}
    </select>
  );
}

/**
 * تنظیماتِ سامانه — پورتِ تبِ «عمومی»ِ نسخهٔ قبلی.
 *
 * ⚠️ فاصله‌ها فهرستِ بسته‌اند نه عددِ آزاد: عددِ کوچک روی سرورِ ضعیف خودش
 * می‌شود بار. سرور هم دوباره همین را مهار می‌کند (R-ARCH-01).
 */
/**
 * کارتِ سلامتِ زمان‌بند — پورتِ `settings/health.php`.
 *
 * ⚠️ تنها جایی است که قطع‌شدنِ کرونِ بیرونی دیده می‌شود. بدونِ آن، خرابی
 * کاملاً خاموش است: یادآور نمی‌رسد، پاک‌سازی انجام نمی‌شود، و هیچ خطایی
 * جایی ظاهر نمی‌شود.
 *
 * ⚠️ راهنمای راه‌اندازیِ سامانهٔ قبلی عمداً منتقل نشده —
 * اینجا Next.js است و مسیرِ تیک یک endpoint ِ ساده با رازِ مشترک است.
 */
function HealthCard({ health }: { health: SchedulerHealth }) {
  const tr = useT();
  const tone = {
    ok: 'border-emerald-500/40 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400',
    warn: 'border-amber-500/40 bg-amber-500/5 text-amber-700 dark:text-amber-500',
    bad: 'border-destructive/40 bg-destructive/5 text-destructive',
  }[health.tone];

  const ago = health.minutesAgo === null ? null : agoParts(health.minutesAgo);
  const unitLabel = ago && {
    minute: tr('دقیقه'), hour: tr('ساعت'), day: tr('روز'),
  }[ago.unit];

  return (
    <div className={`grid gap-1.5 rounded-md border p-3 ${tone}`}>
      <p className="flex items-center gap-1.5 text-sm font-medium">
        <Activity className="size-4" />
        {tr('زمان‌بند')}
      </p>
      <p className="num text-sm">
        {ago === null
          ? tr('تا حالا اجرا نشده است.')
          : tr('آخرین اجرا: {value} {unit} پیش', { value: ago.value, unit: unitLabel ?? '' })}
      </p>
      {health.tone !== 'ok' && (
        <p className="text-xs opacity-90">
          {tr('یادآورها، گزارشِ روزانه و پاک‌سازیِ خودکار به این اجرا وابسته‌اند. یک زمان‌بندِ بیرونی باید هر ۵ دقیقه مسیرِ تیک را با هدرِ رازِ مشترک صدا بزند.')}
        </p>
      )}
      <code className="num overflow-x-auto rounded bg-background/60 px-2 py-1 text-[0.7rem]" dir="ltr">
        curl -H &quot;x-cron-secret: $CRON_SECRET&quot; {'<app-url>'}/api/cron/tick
      </code>
    </div>
  );
}

export function SystemSection({ config, health, isOwner, telegram }: {
  config: SystemConfig;
  health: SchedulerHealth;
  /** بلوکِ بات فقط برای مالک. */
  isOwner: boolean;
  /** ⚠️ توکن در این شیء **نیست** — فقط «هست یا نه». */
  telegram: TelegramSettingsView;
}) {
  const tr = useT();
  const t = useT();
  const [state, save] = useActionState(saveSystemAction, {} as SystemState);
  const [botState, setBotState] = useState<SystemState>({});
  const [tgState, saveTelegram] = useActionState(saveTelegramAction, {} as SystemState);
  const [pending, startTransition] = useTransition();

  return (
    <>
    <form action={save} className="grid max-w-2xl gap-5">
      {/* ⚠️ بالای صفحه، پیش از تنظیمات: خرابیِ زمان‌بند باید اول دیده شود. */}
      <HealthCard health={health} />

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="s-brand">{t("نامِ برند")}</Label>
          <Input id="s-brand" name="brandName" defaultValue={config.brandName} placeholder={t("کبرزا")} />
          <p className="text-xs text-muted-foreground">
            {tr("اگر مشخصاتِ شرکت خالی باشد، روی فاکتور همین نام می‌نشیند.")}
          </p>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="s-locale">{t("زبانِ پیش‌فرضِ پنل")}</Label>
          <select
            id="s-locale"
            name="defaultLocale"
            defaultValue={config.defaultLocale}
            className="h-9 rounded-md border bg-background px-2 text-sm"
          >
            {LOCALES.map((code) => (
              <option key={code} value={code}>{LOCALE_NAMES[code]}</option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            {tr("زبانِ کسانی که خودشان زبانی انتخاب نکرده‌اند. انتخابِ هر کاربر همیشه بر این مقدم است.")}
          </p>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="s-week">{t("روزِ شروعِ هفته")}</Label>
          <select
            id="s-week"
            name="weekStart"
            defaultValue={config.weekStart}
            className="h-9 rounded-md border bg-background px-2 text-sm"
          >
            {WEEKDAYS.map((label, i) => (
              <option key={label} value={i}>{tr(label)}</option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            {tr("جدولِ در دسترس‌بودن و نمای هفتگی از همین روز شروع می‌شوند.")}
          </p>
        </div>
      </div>

      <fieldset className="grid gap-3 rounded-md border p-3">
        <legend className="px-1 text-sm font-medium">{t("حضورِ زنده")}</legend>
        <label className="flex items-center gap-1.5 text-sm">
          <input
            type="checkbox" name="presenceEnabled" defaultChecked={config.presenceEnabled}
            className="size-3.5 accent-primary"
          />
          {tr("نمایشِ «چه کسی آنلاین است»")}
        </label>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="grid gap-1.5">
            <Label htmlFor="s-ping">{t("فاصلهٔ ضربان")}</Label>
            <Seconds id="s-ping" name="presencePing" value={config.presencePing} choices={PING_CHOICES} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="s-idle">{t("فعال ← بی‌فعالیت")}</Label>
            <Seconds id="s-idle" name="presenceIdle" value={config.presenceIdle} choices={IDLE_CHOICES} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="s-off">{t("← آفلاین")}</Label>
            <Seconds id="s-off" name="presenceOffline" value={config.presenceOffline} choices={OFFLINE_CHOICES} />
          </div>
        </div>
      </fieldset>

      <fieldset className="grid gap-3 rounded-md border p-3">
        <legend className="px-1 text-sm font-medium">{t("به‌روزرسانیِ زنده")}</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <label className="flex items-center gap-1.5 text-sm">
              <input
                type="checkbox" name="pulseEnabled" defaultChecked={config.pulseEnabled}
                className="size-3.5 accent-primary"
              />
              {tr("نبضِ نشان‌ها")}
            </label>
            <Seconds id="s-pulse" name="pulseInterval" value={config.pulseInterval} choices={PULSE_CHOICES} />
          </div>
          <div className="grid gap-1.5">
            <label className="flex items-center gap-1.5 text-sm">
              <input
                type="checkbox" name="chatPollEnabled" defaultChecked={config.chatPollEnabled}
                className="size-3.5 accent-primary"
              />
              {tr("گفت‌وگویِ زنده")}
            </label>
            <Seconds
              id="s-chat" name="chatPollInterval" value={config.chatPollInterval}
              choices={CHATPOLL_CHOICES}
            />
          </div>
        </div>
      </fieldset>

      <div className="grid max-w-xs gap-1.5">
        <Label htmlFor="s-purge">{t("پاک‌سازیِ خودکارِ پیام‌ها (روز)")}</Label>
        <Input
          id="s-purge" name="msgPurgeDays" type="number" min={0} max={MAX_PURGE_DAYS}
          className="num" defaultValue={config.msgPurgeDays}
        />
        {/* ⚠️ صفر یعنی هرگز — تا کسی ندانسته تاریخچه را نبازد. */}
        <p className="text-xs text-muted-foreground">
          {tr("۰ یعنی پیام‌ها برای همیشه می‌مانند.")}
        </p>
      </div>

      {/* ⚠️ توکنِ بات رازِ مشترک است — فقط مالک، مثلِ تبِ «اطلاع‌رسانی» نسخهٔ قبلی. */}

      <div className="flex items-center gap-3">
        <Submit />
        {(state.error ?? state.message) && (
          <p className={`text-xs ${state.error ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-500'}`}>
            {tr(state.error ?? state.message ?? '')}
          </p>
        )}
      </div>
    </form>

      {isOwner && (
  <fieldset className="grid gap-2 rounded-md border p-3">
          <legend className="px-1 text-sm font-medium">{t("باتِ تلگرام")}</legend>
          {/*
            ⚠️ توکن **هرگز** به کلاینت نمی‌آید؛ فقط می‌دانیم هست یا نه. پس
            فیلدِ خالی یعنی «دست نزن»، نه «پاک کن» — وگرنه هر بار ذخیرهٔ
            تنظیمات، اتصالِ بات را از بین می‌برد.
          */}
          {telegram.fromEnv ? (
            <p className="text-xs text-muted-foreground">
              {tr('توکن از متغیرِ محیطیِ {env} می‌آید و از اینجا قابلِ تغییر نیست.',
                { env: 'TELEGRAM_BOT_TOKEN' })}
            </p>
          ) : (
            <form action={saveTelegram} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <div className="grid gap-1">
                <Label htmlFor="tg-token" className="text-xs">{t("توکنِ بات")}</Label>
                <Input
                  id="tg-token" name="botToken" type="password" autoComplete="off"
                  placeholder={telegram.hasToken ? '••••••••  ' + tr('ثبت‌شده') : '123456:ABC…'}
                />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="tg-user" className="text-xs">{t("نامِ کاربریِ بات")}</Label>
                <Input
                  id="tg-user" name="botUsername" autoComplete="off"
                  defaultValue={telegram.username} placeholder="my_team_bot"
                />
              </div>
              <div className="flex gap-2">
                <Button type="submit" size="sm">{t("ذخیره")}</Button>
                {telegram.hasToken && (
                  <Button type="submit" size="sm" variant="outline" name="clear" value="1">
                    {t("پاک‌کردن")}
                  </Button>
                )}
              </div>
            </form>
          )}
          {(tgState.error ?? tgState.message) && (
            <p className={`text-xs ${tgState.error ? 'text-destructive' : 'text-muted-foreground'}`}>
              {tr(tgState.error ?? tgState.message ?? '')}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            {t('بات را با @BotFather بساز. آزمون‌های زیر پیامی برای کسی نمی‌فرستند مگر آنکه نامشان بگوید.')}
          </p>
          <div className="flex items-center gap-3">
            {/*
              سه آزمون، مثلِ نسخهٔ قبلی — و هر سه چیزِ **متفاوتی** را می‌سنجند:
              توکن، مسیرِ ارسال، و کلِ زنجیرهٔ گزارش. یکی‌شان به‌تنهایی
              نمی‌گوید کجا خراب است.
            */}
            <Button
              type="button" size="sm" variant="outline" disabled={pending}
              onClick={() => startTransition(async () => setBotState(await testTelegramAction()))}
            >
              {tr("آزمونِ اتصال")}
            </Button>
            <Button
              type="button" size="sm" variant="outline" disabled={pending}
              onClick={() => startTransition(async () => setBotState(await sendTelegramTestAction()))}
            >
              {tr("ارسالِ پیامِ تست")}
            </Button>
            <Button
              type="button" size="sm" variant="outline" disabled={pending}
              onClick={() => startTransition(async () => setBotState(await sendReportTestAction()))}
            >
              {tr("تستِ ارسالِ گزارش")}
            </Button>
            {(botState.error ?? botState.message) && (
              <p className={`text-xs ${botState.error ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-500'}`}>
                {tr(botState.error ?? botState.message ?? '')}
              </p>
            )}
          </div>
        </fieldset>
      )}
    </>
  );
}
