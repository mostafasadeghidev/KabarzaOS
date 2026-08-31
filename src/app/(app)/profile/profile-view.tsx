'use client';

import { useActionState, useState, useTransition } from 'react';
import { useFormStatus } from 'react-dom';
import { Bell, Building2, CreditCard, Clock, Send, Lock } from 'lucide-react';
import {
  changePasswordAction, completeTelegramAction, connectTelegramAction,
  disconnectTelegramAction, setCompanyLogoAction,
  saveCompanyAction, saveNotifyAction, saveTimezoneAction, type ProfileState,
} from './_form/actions';
import { EMAIL_CATEGORIES } from '@/domain/notifications/gateway';
import { COMMON_TIMEZONES, type TelegramState } from '@/domain/people/profile';
import { BankCard } from './bank-card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useT } from '@/i18n/client';

export interface ProfileData {
  name: string;
  email: string;
  timezone: string;
  bank: { account: string; iban: string; card: string };
  hasBank: boolean;
  telegram: TelegramState;
  notify: {
    email: string;
    emailOn: boolean;
    muted: string[];
    telegramOn: boolean;
    /** بدونِ mailer، گزینه‌های ایمیل بی‌اثرند و همین گفته می‌شود. */
    mailerReady: boolean;
  };
  isOwner: boolean;
  company: {
    logoFileId: number | null;
    name: string; address: string; taxId: string; email: string;
    phone: string; website: string; bank: string; invoiceFooter: string;
  };
}

const TABS = [
  { key: 'bank', label: 'حساب بانکی', icon: CreditCard },
  { key: 'prefs', label: 'ترجیحات', icon: Clock },
  { key: 'password', label: 'رمزِ ورود', icon: Lock },
  { key: 'notify', label: 'اعلان‌ها', icon: Bell },
  { key: 'telegram', label: 'تلگرام', icon: Send },
  { key: 'company', label: 'مشخصات شرکت', icon: Building2 },
] as const;

function Notice({ state }: { state: ProfileState }) {
  if (!state.error && !state.message) return null;
  return (
    <p className={`text-xs ${state.error ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-500'}`}>
      {state.error ?? state.message}
    </p>
  );
}

function Submit({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return <Button type="submit" size="sm" disabled={pending}>{pending ? 'در حالِ ذخیره…' : children}</Button>;
}

/** پروفایلِ من — حساب بانکی، ترجیحات، تلگرام، و (برای مالک) مشخصاتِ شرکت. */
export function ProfileView({ data }: { data: ProfileData }) {
  const tr = useT();
  const visible = TABS.filter((t) => t.key !== 'company' || data.isOwner);
  const [tab, setTab] = useState<string>(visible[0]!.key);

  const [tzState, saveTz] = useActionState(saveTimezoneAction, {} as ProfileState);
  const [pwState, changePw] = useActionState(changePasswordAction, {} as ProfileState);
  const [notifyState, saveNotify] = useActionState(saveNotifyAction, {} as ProfileState);
  const [companyState, saveCompany] = useActionState(saveCompanyAction, {} as ProfileState);
  const [logoState, setLogoState] = useState<ProfileState>({});

  const [tgState, setTgState] = useState<ProfileState>({});
  const [pending, startTransition] = useTransition();

  return (
    <div className="grid gap-4">
      <nav className="flex flex-wrap gap-1 border-b">
        {visible.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors ${
              tab === t.key
                ? 'border-primary font-medium text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <t.icon className="size-3.5" />
            {t.label}
          </button>
        ))}
      </nav>

      {tab === 'bank' && (
        <div className="max-w-xl">
          <BankCard bank={data.bank} card={data.bank.card} />
        </div>
      )}

      {tab === 'prefs' && (
        <form action={saveTz} className="grid max-w-md gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="p-tz">{tr("منطقهٔ زمانی")}</Label>
            {/* فهرست پیشنهادی است؛ مقدارِ دلخواه هم پذیرفته می‌شود. */}
            <Input
              id="p-tz" name="timezone" list="tz-list"
              placeholder={tr("پیش‌فرضِ سامانه")} defaultValue={data.timezone}
            />
            <datalist id="tz-list">
              {COMMON_TIMEZONES.map((tz) => <option key={tz} value={tz} />)}
            </datalist>
            <p className="text-xs text-muted-foreground">
              {tr("ساعت‌ها بر مبنای ساعتِ دیواریِ شما نشان داده می‌شوند. خالی یعنی پیش‌فرضِ سامانه.")}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Submit>{tr("ذخیره")}</Submit>
            <Notice state={tzState} />
          </div>
        </form>
      )}

      {tab === 'password' && (
        <form action={changePw} className="grid max-w-md gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="pw-current">{tr("رمزِ فعلی")}</Label>
            <Input id="pw-current" name="current" type="password" autoComplete="current-password" />
            {/*
              ⚠️ رمزِ فعلی لازم است حتی وقتی وارد شده‌اید: نشستِ
              دزدیده‌شده نباید بتواند رمز را عوض کند و شما را بیرون بگذارد.
            */}
            <p className="text-xs text-muted-foreground">
              {tr("اگر مدیر برایتان حساب ساخته و هنوز رمزی نگذاشته‌اید، این را خالی بگذارید.")}
            </p>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="pw-next">{tr("رمزِ تازه")}</Label>
            <Input
              id="pw-next" name="next" type="password" minLength={8}
              autoComplete="new-password" required
              placeholder={tr("دستِ‌کم ۸ نویسه")}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="pw-repeat">{tr("تکرارِ رمزِ تازه")}</Label>
            <Input
              id="pw-repeat" name="repeat" type="password" minLength={8}
              autoComplete="new-password" required
            />
          </div>

          <div className="flex items-center gap-3">
            <Submit>{tr("تغییرِ رمز")}</Submit>
            <Notice state={pwState} />
          </div>
        </form>
      )}

      {tab === 'notify' && (
        <form action={saveNotify} className="grid max-w-xl gap-4">
          <p className="text-sm text-muted-foreground">
            {tr("زنگِ داخلِ اپ همیشه روشن است. این تنظیمات فقط کانال‌های بیرونی را تعیین می‌کنند.")}
          </p>

          <fieldset className="grid gap-3 rounded-md border p-3">
            <legend className="px-1 text-sm font-medium">{tr("ایمیل")}</legend>

            {!data.notify.mailerReady && (
              // ⚠️ حقیقت را می‌گوییم، نه گزینه‌ای که بی‌صدا کار نمی‌کند.
              <p className="text-xs text-amber-600 dark:text-amber-500">
                {tr("فرستندهٔ ایمیل روی این سامانه پیکربندی نشده است؛ فعلاً ایمیلی فرستاده نمی‌شود.")}
              </p>
            )}

            <label className="flex items-center gap-1.5 text-sm">
              <input
                type="checkbox" name="emailOn" defaultChecked={data.notify.emailOn}
                className="size-3.5 accent-primary"
              />
              {tr("دریافتِ اعلان با ایمیل")}
            </label>

            <div className="grid gap-1.5">
              <Label htmlFor="n-email">{tr("ایمیلِ اختصاصیِ اعلان")}</Label>
              <Input
                id="n-email" name="notifyEmail" type="email" className="num"
                defaultValue={data.notify.email} placeholder={data.email}
              />
              <p className="text-xs text-muted-foreground">
                {tr("خالی یعنی همان ایمیلِ ورود.")}
              </p>
            </div>

            <fieldset className="grid gap-2">
              <legend className="text-xs text-muted-foreground">
                {tr("دسته‌هایی که می‌خواهید ایمیلشان را نگیرید:")}
              </legend>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {EMAIL_CATEGORIES.map((c) => (
                  <label key={c.key} className="flex items-center gap-1.5 text-sm">
                    <input
                      type="checkbox" name="muted" value={c.key}
                      defaultChecked={data.notify.muted.includes(c.key)}
                      className="size-3.5 accent-primary"
                    />
                    {c.label}
                  </label>
                ))}
              </div>
            </fieldset>
          </fieldset>

          <fieldset className="grid gap-2 rounded-md border p-3">
            <legend className="px-1 text-sm font-medium">{tr("تلگرام")}</legend>
            <label className="flex items-center gap-1.5 text-sm">
              <input
                type="checkbox" name="telegramOn" defaultChecked={data.notify.telegramOn}
                className="size-3.5 accent-primary"
              />
              {tr("دریافتِ اعلان در تلگرام")}
            </label>
            {/* ⚠️ خاموش‌کردنِ دسته فقط ایمیل را ساکت می‌کند (R-NOTIF-04). */}
            <p className="text-xs text-muted-foreground">
              {data.telegram === 'connected'
                ? 'تلگرام همهٔ رویدادها را می‌گیرد؛ دسته‌بندیِ بالا فقط ایمیل را ساکت می‌کند.'
                : 'برای این گزینه، ابتدا از تبِ «تلگرام» حساب را وصل کنید.'}
            </p>
          </fieldset>

          <div className="flex items-center gap-3">
            <Submit>{tr("ذخیره")}</Submit>
            <Notice state={notifyState} />
          </div>
        </form>
      )}

      {tab === 'telegram' && (
        <div className="grid max-w-xl gap-3">
          {/* ⚠️ بدونِ توکنِ بات، دکمه‌ای که همیشه شکست بخورد نشان نمی‌دهیم. */}
          {data.telegram === 'unavailable' ? (
            <p className="text-sm text-muted-foreground">
              {tr("باتِ تلگرام روی این سامانه پیکربندی نشده است.")}
            </p>
          ) : data.telegram === 'connected' ? (
            <div className="grid gap-2">
              <p className="text-sm">{tr("اعلان‌های شما به تلگرام هم فرستاده می‌شود.")}</p>
              <div>
                <Button
                  type="button" size="sm" variant="destructive" disabled={pending}
                  onClick={() => startTransition(async () => setTgState(await disconnectTelegramAction()))}
                >
                  {tr("قطع اتصال تلگرام")}
                </Button>
              </div>
              <Notice state={tgState} />
            </div>
          ) : (
            <div className="grid gap-2">
              <p className="text-sm text-muted-foreground">
                {tr("برای دریافتِ اعلان در تلگرام، بات را باز کنید و Start را بزنید.")}
              </p>
              <div>
                <Button
                  type="button" size="sm" disabled={pending}
                  onClick={() => startTransition(async () => setTgState(await connectTelegramAction()))}
                >
                  {tr("ساختِ پیوندِ اتصال")}
                </Button>
              </div>
              {tgState.link && (
                <div className="grid gap-2">
                  <a
                    href={tgState.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary underline"
                  >
                    {tr("باز کردن بات و زدن Start ↗")}
                  </a>
                  {/*
                    ⚠️ مرحلهٔ دوم — بدونِ آن اتصال هیچ‌وقت کامل نمی‌شد.
                    سرور وب‌هوک ندارد، پس تا کاربر نگوید «زدم»، راهی نیست
                    بفهمد پیام رسیده. نسخهٔ قبلی هم همین دو مرحله را دارد.
                  */}
                  <div>
                    <Button
                      type="button" size="sm" variant="outline" disabled={pending}
                      onClick={() => startTransition(async () => setTgState(await completeTelegramAction()))}
                    >
                      {tr("Start را زدم — اتصال را کامل کن")}
                    </Button>
                  </div>
                </div>
              )}
              <Notice state={tgState} />
            </div>
          )}
        </div>
      )}

      {tab === 'company' && data.isOwner && (
        <div className="grid max-w-2xl gap-4">
          {/*
            لوگو — فرمِ **جدا** از مشخصات، چون آپلود فایل است نه متن و
            ذخیره‌اش هم مستقل است. ⚠️ فایل از مسیرِ گیت‌شده سِرو می‌شود
            (D-009)، پس اینجا هم `/api/files/…` است نه لینکِ مستقیم.
          */}
          <form
            action={async (fd) => { setLogoState(await setCompanyLogoAction(fd)); }}
            className="flex flex-wrap items-center gap-3 rounded-md border p-3"
          >
            {data.company.logoFileId ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/api/files/${data.company.logoFileId}`}
                alt={tr('لوگوی شرکت')}
                className="h-12 w-auto max-w-[10rem] rounded border object-contain"
              />
            ) : (
              <span className="text-xs text-muted-foreground">{tr('لوگویی ثبت نشده')}</span>
            )}
            <input
              type="file" name="logo" accept="image/*"
              className="text-xs file:me-2 file:rounded-md file:border file:bg-background file:px-2 file:py-1 file:text-xs"
            />
            <Button type="submit" size="sm" variant="outline">{tr('بارگذاری لوگو')}</Button>
            {logoState.error && <span className="text-sm text-destructive">{logoState.error}</span>}
            {logoState.message && (
              <span className="text-sm text-muted-foreground">{logoState.message}</span>
            )}
          </form>

        <form action={saveCompany} className="grid gap-3">
          <p className="text-sm text-muted-foreground">
            {tr("این مشخصات روی فاکتورها چاپ می‌شود.")}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="c-name">{tr("نامِ شرکت")}</Label>
              <Input id="c-name" name="name" defaultValue={data.company.name} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="c-tax">{tr("شناسهٔ مالیاتی")}</Label>
              <Input id="c-tax" name="taxId" className="num" defaultValue={data.company.taxId} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="c-email">{tr("ایمیل")}</Label>
              <Input id="c-email" name="email" type="email" defaultValue={data.company.email} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="c-phone">{tr("تلفن")}</Label>
              <Input id="c-phone" name="phone" className="num" defaultValue={data.company.phone} />
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="c-web">{tr("وب‌سایت")}</Label>
              {/* ⚠️ متنِ ساده، نه type=url — اجبارِ https:// آدرس را روی فاکتور شلوغ می‌کند. */}
              <Input id="c-web" name="website" defaultValue={data.company.website} placeholder="example.com" />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="c-address">{tr("نشانی")}</Label>
            <Textarea id="c-address" name="address" rows={2} defaultValue={data.company.address} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="c-bank">{tr("اطلاعاتِ حسابِ شرکت")}</Label>
            <Textarea id="c-bank" name="bank" rows={2} defaultValue={data.company.bank} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="c-footer">{tr("پانویسِ فاکتور")}</Label>
            <Textarea id="c-footer" name="invoiceFooter" rows={2} defaultValue={data.company.invoiceFooter} />
          </div>
          <div className="flex items-center gap-3">
            <Submit>{tr("ذخیره مشخصات")}</Submit>
            <Notice state={companyState} />
          </div>
        </form>
        </div>
      )}
    </div>
  );
}
