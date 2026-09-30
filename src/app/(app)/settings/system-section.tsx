'use client';

import { useActionState, useState, useTransition } from 'react';
import { useFormStatus } from 'react-dom';
import {
  recheckBucketAction, saveSystemAction, saveTelegramAction, sendReportTestAction, sendTelegramTestAction,
  testTelegramAction, type SystemState,
} from './_form/actions';
import {
  CHATPOLL_CHOICES, MAX_PURGE_DAYS, PULSE_CHOICES, type SystemConfig,
} from '@/domain/settings/system';
import { IDLE_CHOICES, OFFLINE_CHOICES, PING_CHOICES } from '@/domain/people/presence';
import { allTimezones } from '@/domain/people/profile';
import { WEEKDAYS } from '@/domain/availability/weekly';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Field, FieldLabel, FieldDescription } from '@/components/ui/field';
import { useActionToast } from '@/components/ui/toast';
import { useT } from '@/i18n/client';
import { LOCALES, LOCALE_NAMES } from '@/i18n/config';
import { agoParts, type SchedulerHealth } from '@/domain/scheduler/health';
import type { TelegramSettingsView } from '@/server/settings/telegram-service';
import { Activity, HardDrive, RefreshCw } from 'lucide-react';
import type { BucketCheck } from '@/server/files/bucket-probe';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Switch } from '@/components/ui/switch';
import { Panel } from '@/components/page-shell';

function Submit() {
  const { pending } = useFormStatus();
  const tr = useT();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? <><Spinner />{tr('در حالِ ذخیره…')}</> : tr('ذخیره تنظیمات')}
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
    <NativeSelect
      id={id}
      name={name}
      defaultValue={value}
    >
      {choices.map((c) => (
        <NativeSelectOption key={c} value={c}>{tr('{n} ثانیه', { n: c })}</NativeSelectOption>
      ))}
    </NativeSelect>
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
  // ⚠️ همان رنگ‌های ملایمِ نشان‌های معنایی (badge.tsx): متنِ قرمزِ پایه روی
  // زمینهٔ قرمزِ کم‌رنگ فقط ۴٫۰ کنتراست داشت؛ ۷۰۰/۸۰۰ روی ۵۰ بالای ۵ است.
  const tone = {
    ok: 'border-emerald-500/40 bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300',
    warn: 'border-amber-500/40 bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300',
    bad: 'border-red-500/40 bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300',
  }[health.tone];

  const ago = health.minutesAgo === null ? null : agoParts(health.minutesAgo);
  const unitLabel = ago && {
    minute: tr('دقیقه'), hour: tr('ساعت'), day: tr('روز'),
  }[ago.unit];

  return (
    <div className={`grid gap-1.5 rounded-xl border p-3 ${tone}`}>
      <p className="flex items-center gap-1.5 text-sm font-medium">
        <Activity className="size-4" />
        {tr('زمان‌بند')}
      </p>
      <p className="text-sm tabular-nums">
        {ago === null
          ? tr('تا حالا اجرا نشده است.')
          : tr('آخرین اجرا: {value} {unit} پیش', { value: ago.value, unit: unitLabel ?? '' })}
      </p>
      {health.tone !== 'ok' && (
        <p className="text-xs">
          {tr('یادآورها، گزارشِ روزانه و پاک‌سازیِ خودکار به این اجرا وابسته‌اند. یک زمان‌بندِ بیرونی باید هر ۵ دقیقه مسیرِ تیک را با هدرِ رازِ مشترک صدا بزند.')}
        </p>
      )}
      <code className="num overflow-x-auto rounded bg-card/70 px-2 py-1 text-[0.7rem]" dir="ltr">
        curl -H &quot;x-cron-secret: $CRON_SECRET&quot; {'<app-url>'}/api/cron/tick
      </code>
    </div>
  );
}

/**
 * کارتِ «فایل‌های خصوصی» — پورتِ کارتِ سلامتِ `Private_Files`: باکت به روی
 * درخواستِ بی‌احراز بسته است؟ با «بررسی دوباره» (`handle_recheck`).
 */
function BucketCard({ bucket }: { bucket: BucketCheck }) {
  const tr = useT();
  const [pending, start] = useTransition();
  const [state, setState] = useState<SystemState>({});
  useActionToast(state);
  const view = {
    protected: { label: 'محافظت‌شده', tone: 'border-emerald-500/40 bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300' },
    exposed: { label: 'در معرض دسترسی!', tone: 'border-red-500/40 bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300' },
    unknown: { label: 'نامشخص', tone: 'border-amber-500/40 bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300' },
  }[bucket.status];
  return (
    <div className={`grid gap-1.5 rounded-xl border p-3 ${view.tone}`}>
      <p className="flex items-center gap-1.5 text-sm font-medium">
        <HardDrive className="size-4" />
        {tr('فایل‌های خصوصی')}
        <span className="ms-auto">{tr(view.label)}</span>
      </p>
      {bucket.status === 'exposed' && (
        <p className="text-xs">
          {tr('باکتِ فایل‌ها بدونِ ورود هم خوانده می‌شود: هر رسید یا قرارداد با حدسِ نشانی‌اش دیده می‌شود. سیاستِ دسترسیِ باکت را در سرویسِ ذخیره‌سازی خصوصی کنید (دسترسیِ ناشناس را بردارید) و دوباره بررسی کنید.')}
        </p>
      )}
      {bucket.status === 'unknown' && (
        <p className="text-xs">
          {tr('درخواستِ آزمایشی به سرویسِ ذخیره‌سازی نرسید. دستی بررسی کنید که باکت بدونِ اعتبارنامه خوانده نشود.')}
        </p>
      )}
      <div>
        <Button
          type="button" size="sm" variant="outline" disabled={pending}
          onClick={() => start(async () => setState(await recheckBucketAction()))}
        >
          {pending ? <Spinner /> : <RefreshCw />}
          {tr('بررسی دوباره')}
        </Button>
      </div>
    </div>
  );
}

export function SystemSection({ config, health, bucket, isOwner }: {
  config: SystemConfig;
  health: SchedulerHealth;
  bucket: BucketCheck | null;
  /** کارت‌های سلامتِ زمان‌بند و باکت فقط برای مالک. */
  isOwner: boolean;
}) {
  const tr = useT();
  const t = useT();
  const [state, save] = useActionState(saveSystemAction, {} as SystemState);
  useActionToast(state);

  return (
    /**
     * ⚠️ `key` = مقدارِ ذخیره‌شده: React پس از هر ذخیرهٔ موفق فرم را «ریست»
     * می‌کند و کلیدهای Radix (Switch) و `<select>` به مقدارِ **لحظهٔ بازشدنِ
     * صفحه** برمی‌گشتند. «تیمِ من» روشن ذخیره می‌شد ولی خاموش دیده می‌شد، و
     * ذخیرهٔ بعدی واقعاً خاموشش می‌کرد. با کلید، فرم با مقدارِ تازه از نو سوار می‌شود.
     */
    <form key={JSON.stringify(config)} action={save} className="grid max-w-4xl gap-4">
      {/* ⚠️ بالای صفحه، پیش از تنظیمات: خرابیِ زمان‌بند باید اول دیده شود. فقط مالک (پورتِ تبِ Health). */}
      {isOwner && <HealthCard health={health} />}
      {isOwner && bucket && <BucketCard bucket={bucket} />}

      {/* هر گروهِ فیلد یک پنل است؛ فیلدِ آزاد روی زمینه کنارِ پنل‌ها ناهمسان بود. */}
      <Panel title={t("عمومی")}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="s-locale">{t("زبانِ پیش‌فرضِ پنل")}</FieldLabel>
            <NativeSelect
              id="s-locale"
              name="defaultLocale"
              defaultValue={config.defaultLocale}
            >
              {LOCALES.map((code) => (
                <NativeSelectOption key={code} value={code}>{LOCALE_NAMES[code]}</NativeSelectOption>
              ))}
            </NativeSelect>
            <FieldDescription>
              {tr("زبانِ کسانی که خودشان زبانی انتخاب نکرده‌اند. انتخابِ هر کاربر همیشه بر این مقدم است.")}
            </FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="s-week">{t("روزِ شروعِ هفته")}</FieldLabel>
            <NativeSelect
              id="s-week"
              name="weekStart"
              defaultValue={config.weekStart}
            >
              {WEEKDAYS.map((label, i) => (
                <NativeSelectOption key={label} value={i}>{tr(label)}</NativeSelectOption>
              ))}
            </NativeSelect>
            <FieldDescription>
              {tr("جدولِ در دسترس‌بودن و نمای هفتگی از همین روز شروع می‌شوند.")}
            </FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="s-tz">{t("منطقهٔ زمانیِ سامانه")}</FieldLabel>
            <SearchableSelect
              id="s-tz"
              name="timezone"
              defaultValue={config.timezone}
            >
              <NativeSelectOption value="">{tr("پیش‌فرضِ سرور")}</NativeSelectOption>
              {allTimezones().map((zone) => (
                <NativeSelectOption key={zone} value={zone}>{zone}</NativeSelectOption>
              ))}
            </SearchableSelect>
            <FieldDescription>
              {tr("ساعتِ ارسالِ گزارشِ روزانه و یادآوریِ جلسات با همین منطقه سنجیده می‌شود.")}
            </FieldDescription>
          </Field>
        </div>

        {/*
          ⚠️ برای همهٔ کسانی که این فرم را ذخیره می‌کنند دیده می‌شود، نه فقط مالک:
          کلیدِ خاموش در FormData نیست، پس اگر برای همکارِ ادمین پنهان بود، ذخیرهٔ
          او بی‌صدا خاموشش می‌کرد.
        */}
        <div className="grid gap-1">
          <label className="flex items-center gap-1.5 text-sm">
            <Switch name="ownerTeamView" defaultChecked={config.ownerTeamView} />
            {tr("«تیمِ من» برای مدیرِ کل")}
          </label>
          <p className="text-xs text-muted-foreground">
            {tr("مدیرِ کل بدونِ اینکه مدیرِ دفتری باشد، منوی «تیمِ من» را با همهٔ دفاتر می‌بیند.")}
          </p>
        </div>
        <div className="grid gap-1">
          <label className="flex items-center gap-1.5 text-sm">
            <Switch name="onboardingEnabled" defaultChecked={config.onboardingEnabled} />
            {tr("آنبوردینگِ اعضای تازه")}
          </label>
          <p className="text-xs text-muted-foreground">
            {tr("برای هر عضوِ تازه از «کتابخانهٔ آنبوردینگ» چک‌لیستِ روزهای اول ساخته می‌شود. خاموش‌کردن داده‌ها را پاک نمی‌کند؛ فقط منو و کارت‌ها پنهان می‌شوند.")}
          </p>
        </div>
      </Panel>

      <Panel title={t("حضورِ زنده")}>
        <label className="flex items-center gap-1.5 text-sm">
          <Switch name="presenceEnabled" defaultChecked={config.presenceEnabled}
          />
          {tr("نمایشِ «چه کسی آنلاین است»")}
        </label>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field>
            <FieldLabel htmlFor="s-ping">{t("فاصلهٔ ضربان")}</FieldLabel>
            <Seconds id="s-ping" name="presencePing" value={config.presencePing} choices={PING_CHOICES} />
          </Field>
          <Field>
            <FieldLabel htmlFor="s-idle">{t("فعال ← بی‌فعالیت")}</FieldLabel>
            <Seconds id="s-idle" name="presenceIdle" value={config.presenceIdle} choices={IDLE_CHOICES} />
          </Field>
          <Field>
            <FieldLabel htmlFor="s-off">{t("← آفلاین")}</FieldLabel>
            <Seconds id="s-off" name="presenceOffline" value={config.presenceOffline} choices={OFFLINE_CHOICES} />
          </Field>
        </div>
      </Panel>

      <Panel title={t("به‌روزرسانیِ زنده")}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <label className="flex items-center gap-1.5 text-sm">
              <Switch name="pulseEnabled" defaultChecked={config.pulseEnabled}
              />
              {tr("نبضِ نشان‌ها")}
            </label>
            <Seconds id="s-pulse" name="pulseInterval" value={config.pulseInterval} choices={PULSE_CHOICES} />
          </div>
          <div className="grid gap-1.5">
            <label className="flex items-center gap-1.5 text-sm">
              <Switch name="chatPollEnabled" defaultChecked={config.chatPollEnabled}
              />
              {tr("گفت‌وگویِ زنده")}
            </label>
            <Seconds
              id="s-chat" name="chatPollInterval" value={config.chatPollInterval}
              choices={CHATPOLL_CHOICES}
            />
          </div>
        </div>
      </Panel>

      <Panel title={t("پیام‌ها")}>
        <Field className="max-w-xs">
          <FieldLabel htmlFor="s-purge">{t("پاک‌سازیِ خودکارِ پیام‌ها (روز)")}</FieldLabel>
          <Input
            id="s-purge" name="msgPurgeDays" type="number" min={0} max={MAX_PURGE_DAYS}
            className="num" defaultValue={config.msgPurgeDays}
          />
          {/* ⚠️ صفر یعنی هرگز — تا کسی ندانسته تاریخچه را نبازد. */}
          <FieldDescription>
            {tr("۰ یعنی پیام‌ها برای همیشه می‌مانند.")}
          </FieldDescription>
        </Field>
      </Panel>

      <div className="flex items-center gap-3">
        <Submit />
      </div>
    </form>
  );
}

/**
 * باتِ تلگرام — در تبِ «اطلاع‌رسانی»، کنارِ گزارشِ روزانه (نه زیرِ «سامانه»).
 * ⚠️ توکنِ بات رازِ مشترک است — فقط مالک، مثلِ تبِ «اطلاع‌رسانی» نسخهٔ قبلی.
 */
export function TelegramSection({ telegram }: {
  /** ⚠️ توکن در این شیء **نیست** — فقط «هست یا نه». */
  telegram: TelegramSettingsView;
}) {
  const tr = useT();
  const t = useT();
  const [botState, setBotState] = useState<SystemState>({});
  useActionToast(botState);
  const [tgState, saveTelegram] = useActionState(saveTelegramAction, {} as SystemState);
  const [pending, startTransition] = useTransition();

  return (
        <Panel title={t("باتِ تلگرام")} className="max-w-4xl">
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
              {tr("ارسالِ گزارش به چتِ من")}
            </Button>
          </div>
        </Panel>
  );
}
