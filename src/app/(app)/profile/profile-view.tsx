'use client';

import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useFormStatus } from 'react-dom';
import { Bell, Bot, Building2, CreditCard, Clock, KeyRound, Send, Lock, UserRound } from 'lucide-react';
import { McpPanel, type McpGrantView, type McpTokenView } from './mcp-panel';
import { AiBotPanel, type AiConnectionInfo, type AiProviderOption } from './ai-bot-panel';
import { Thumb } from '@/components/thumb';
import {
  changePasswordAction, completeTelegramAction, connectTelegramAction,
  disconnectTelegramAction, sendMyTelegramTestAction, setCompanyLogoAction,
  saveCompanyAction, saveNotifyAction, saveTimezoneAction, type ProfileState,
  removeMyAvatarAction, saveAccountAction, setMyAvatarAction,
} from './_form/actions';
import { EMAIL_CATEGORIES } from '@/domain/notifications/gateway';
import { allTimezones, type TelegramState } from '@/domain/people/profile';
import { BankCard } from './bank-card';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Input } from '@/components/ui/input';
import { Field, FieldLabel, FieldDescription } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';
import { useActionToast } from '@/components/ui/toast';
import { useSearchParams } from 'next/navigation';
import { useT, useTimeZone } from '@/i18n/client';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { LEVEL_LABELS, type GrantLevel } from '@/domain/access/service-grants';
import { formatDate } from '@/i18n/datetime';
import { Switch } from '@/components/ui/switch';
import { Panel } from '@/components/page-shell';
import { FileInput } from '@/components/ui/file-input';

export interface ProfileData {
  id: number;
  name: string;
  email: string;
  phone: string;
  /** راهِ دومِ ورود — فقط نمایش (پورتِ پنلِ حساب). */
  username: string | null;
  avatarFileId: number | null;
  timezone: string;
  bank: { account: string; iban: string; card: string };
  hasBank: boolean;
  telegram: TelegramState;
  notify: {
    email: string;
    emailOn: boolean;
    muted: string[];
    telegramOn: boolean;
    /** یادآورهای بی‌صدا در تلگرام و ساعتِ گزارشِ صبحگاهی (۲.۱۴.۰). */
    telegramMuted: string[];
    briefAt: string;
    /** بدونِ mailer، گزینه‌های ایمیل بی‌اثرند و همین گفته می‌شود. */
    mailerReady: boolean;
  };
  /** دسترسی‌های بیرونیِ بازِ خودم — فقط‌خواندنی. */
  myAccess: Array<{
    id: number; serviceName: string; level: GrantLevel;
    accountRef: string; grantedAt: Date | string;
  }>;
  isOwner: boolean;
  /** توکن‌های MCP ِ خودِ کاربر و نشانیِ اتصال (۲.۷.۰). */
  mcp: { tokens: McpTokenView[]; grants: McpGrantView[]; endpoint: string };
  ai: { connections: AiConnectionInfo[]; botUsername: string; providers: AiProviderOption[]; sensitive: boolean };
  company: {
    logoFileId: number | null;
    name: string; address: string; taxId: string; email: string;
    phone: string; website: string; bank: string; invoiceFooter: string;
  };
}

const TABS = [
  { key: 'account', label: 'حساب کاربری', icon: UserRound },
  { key: 'access', label: 'دسترسی‌های من', icon: KeyRound },
  { key: 'bank', label: 'حساب بانکی', icon: CreditCard },
  { key: 'prefs', label: 'ترجیحات', icon: Clock },
  { key: 'password', label: 'رمزِ ورود', icon: Lock },
  // ⚠️ تلگرام زیرِ همین تب است (۲.۹.۲)؛ `?tab=telegram` ِ لینک‌های قدیمی هم اینجا می‌آید.
  { key: 'notify', label: 'اعلان‌ها و تلگرام', icon: Bell },
  { key: 'mcp', label: 'دستیارِ هوشِ مصنوعی', icon: Bot },
] as const;

function Submit({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  const tr = useT();
  return <Button type="submit" size="sm" disabled={pending}>{pending ? <><Spinner />{tr('در حالِ ذخیره…')}</> : children}</Button>;
}

/** پروفایلِ من — حساب بانکی، ترجیحات، تلگرام، و (برای مالک) مشخصاتِ شرکت. */
export function ProfileView({ data }: { data: ProfileData }) {
  const tr = useT();
  const tz = useTimeZone();
  // ⚠️ یک بار محاسبه می‌شود؛ چهارصد رشته است و هر رندر ساختنش بیهوده است.
  const timezones = useMemo(() => allTimezones(), []);
  /**
   * ⚠️ تبِ «دسترسی‌های من» فقط وقتی هست که چیزی برای نشان‌دادن باشد؛
   * تبِ همیشه‌خالی فقط سؤال می‌سازد.
   */
  const visible = TABS
    .filter((x) => x.key !== 'access' || data.myAccess.length > 0);

  /**
   * تبِ آغازین از نشانی خوانده می‌شود.
   *
   * ⚠️ نوارِ یادآورِ تلگرام به `/profile?tab=telegram` لینک می‌دهد، ولی تب
   * فقط state ِ محلی بود و آن پارامتر را نادیده می‌گرفت — یعنی کاربر روی
   * «اتصال تلگرام» می‌زد و روی تبِ «حساب بانکی» می‌افتاد. کلِ کارِ آن نوار
   * همین یک پرش بود.
   *
   * ⚠️ کلیدِ ناشناخته بی‌صدا به تبِ اول برمی‌گردد؛ لینکِ قدیمی نباید صفحهٔ
   * خالی بدهد.
   */
  const params = useSearchParams();
  const asked = params.get('tab') === 'telegram' ? 'notify' : params.get('tab');
  const [tab, setTab] = useState<string>(
    visible.some((x) => x.key === asked) ? asked! : visible[0]!.key,
  );

  const [tzState, saveTz] = useActionState(saveTimezoneAction, {} as ProfileState);
  useActionToast(tzState);
  const [accountState, saveAccount] = useActionState(saveAccountAction, {} as ProfileState);
  useActionToast(accountState);
  const [avatarState, setAvatarState] = useState<ProfileState>({});
  useActionToast(avatarState);
  /**
   * پیش‌نمایشِ فوریِ تصویرِ انتخاب‌شده، پیش از ذخیره — پورتِ FileReader ِ نسخهٔ
   * قبلی. با `createObjectURL` (بی‌خواندنِ کلِ فایل در حافظه) و آزادسازیِ نشانی
   * در هر تعویض، تا حافظه نشت نکند.
   */
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const avatarForm = useRef<HTMLFormElement>(null);
  useEffect(() => () => { if (avatarPreview) URL.revokeObjectURL(avatarPreview); }, [avatarPreview]);
  // ذخیره شد → تصویرِ واقعی از سرور می‌آید؛ پیش‌نمایش و فایلِ انتخاب‌شده پاک شوند.
  useEffect(() => {
    if (avatarState.message) {
      setAvatarPreview(null);
      avatarForm.current?.reset();
    }
  }, [avatarState]);
  const [pwState, changePw] = useActionState(changePasswordAction, {} as ProfileState);
  useActionToast(pwState);
  const [notifyState, saveNotify] = useActionState(saveNotifyAction, {} as ProfileState);
  useActionToast(notifyState);
  const [companyState, saveCompany] = useActionState(saveCompanyAction, {} as ProfileState);
  const [logoState, setLogoState] = useState<ProfileState>({});

  const [tgState, setTgState] = useState<ProfileState>({});
  useActionToast(tgState);
  const [pending, startTransition] = useTransition();

  return (
    /*
     * ⚠️ پهنا را **ردیفِ تب‌ها** تعیین می‌کند (w-fit)، نه عددِ ثابت: با تبِ «دسترسی‌های
     * من» ردیف از max-w-3xl بلندتر می‌شد و اسکرولِ افقی می‌گرفت (۲.۱۱.۰).
     * کمینه ۴۸rem تا با تب‌های کم کادرها باریک نشوند؛ اسکرول فقط وقتی صفحه واقعاً
     * باریک‌تر از ردیف است (موبایل).
     */
    <div className="grid w-fit max-w-full min-w-[min(100%,48rem)] gap-4">
      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        {/* shadcn Tabs (line): پیمایشِ افقی به‌جای شکستنِ خط — در «گزارش‌ها» تب‌ها دو ردیف می‌شدند. */}
        <div className="overflow-x-auto pb-1.5">
          {/* ⚠️ min-w-full: ردیفِ تب‌ها هم‌پهنای کادرِ زیرش کشیده می‌شود؛ w-max روی موبایل پیمایش را نگه می‌دارد. */}
          <TabsList variant="line" className="w-max min-w-full">
            {visible.map((t) => (
              <TabsTrigger key={t.key} value={t.key}>
                <t.icon className="size-3.5" />
                {tr(t.label)}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
      </Tabs>

      {/*
        ⚠️ w-0 + min-w-full: کادرها در پهنای ظرف سهمی ندارند و فقط کشیده می‌شوند؛
        وگرنه یک پاراگرافِ بلند ظرف را تا لبهٔ صفحه پهن می‌کرد.
      */}
      <div className="grid w-0 min-w-full gap-4">

      {/* پورتِ پنلِ «حساب» ِ داشبورد: نام، ایمیل و تلفن به دستِ خودِ کاربر. */}
      {tab === 'account' && (
        // ⚠️ هر گروه یک پنل است؛ پهنا را ظرفِ بیرونی تعیین می‌کند.
        <div className="grid grid-cols-1 gap-4">
          <Panel title={tr("حساب کاربری")}>
            <form action={saveAccount} className="grid gap-3">
              <Field>
                <FieldLabel htmlFor="acc-name">{tr("نام")}</FieldLabel>
                <Input id="acc-name" name="name" defaultValue={data.name} required />
              </Field>
              <Field>
                <FieldLabel htmlFor="acc-email">{tr("ایمیل")}</FieldLabel>
                <Input id="acc-email" name="email" type="email" defaultValue={data.email} required />
              </Field>
              <Field>
                <FieldLabel htmlFor="acc-phone">{tr("تلفن")}</FieldLabel>
                <Input id="acc-phone" name="phone" defaultValue={data.phone} />
              </Field>
              {data.username && (
                <p className="text-xs text-muted-foreground">
                  {tr("نامِ کاربری")}: <span className="num">{data.username}</span>
                </p>
              )}
              <div className="flex items-center gap-3">
                <Submit>{tr("ذخیره")}</Submit>
              </div>
            </form>
          </Panel>

          <Panel title={tr("تصویر پروفایل")}>
            <div className="flex flex-wrap items-end gap-3">
              {avatarPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatarPreview}
                  alt={tr("پیش‌نمایش")}
                  className="size-14 shrink-0 rounded-full object-cover ring-2 ring-primary/40"
                />
              ) : (
                <Thumb id={data.id} title={data.name} fileId={data.avatarFileId} person size={56} className="rounded-full" />
              )}
              <form
                ref={avatarForm}
                className="grid flex-1 gap-1.5"
                onSubmit={(e) => {
                  e.preventDefault();
                  const form = new FormData(e.currentTarget);
                  startTransition(async () => setAvatarState(await setMyAvatarAction(form)));
                }}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <FileInput
                    id="acc-avatar" name="avatar" accept="image/jpeg,image/png,image/gif,image/webp"
                    aria-label={tr("تصویر پروفایل")}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      // فقط تصویر پیش‌نمایش دارد؛ بقیه را خودِ سرور رد می‌کند.
                      setAvatarPreview(file && file.type.startsWith('image/') ? URL.createObjectURL(file) : null);
                    }}
                  />
                  <Button type="submit" size="sm" variant="outline" disabled={pending || !avatarPreview}>{tr("ذخیره تصویر")}</Button>
                  {data.avatarFileId && (
                    <Button
                      type="button" size="sm" variant="ghost" disabled={pending}
                      onClick={() => startTransition(async () => setAvatarState(await removeMyAvatarAction()))}
                    >
                      {tr("حذفِ تصویر")}
                    </Button>
                  )}
                </div>
              </form>
            </div>
          </Panel>
        </div>
      )}

      {/*
        دسترسی‌های بیرونیِ خودِ کاربر — فقط‌خواندنی.
        ⚠️ هیچ رمزی اینجا نیست؛ فقط فهرستِ «به چه چیزهایی دسترسی دارم».
      */}
      {tab === 'access' && (
        <div className="grid grid-cols-1 gap-3">
          <p className="text-sm text-muted-foreground">
            {tr("سامانه‌هایی که به تو دسترسی داده شده. اگر چیزی اینجا درست نیست، به مدیر بگو.")}
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{tr("سرویس")}</TableHead>
                <TableHead>{tr("سطح")}</TableHead>
                <TableHead>{tr("شناسهٔ حساب")}</TableHead>
                <TableHead>{tr("از تاریخ")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.myAccess.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{row.serviceName}</TableCell>
                  <TableCell>{tr(LEVEL_LABELS[row.level])}</TableCell>
                  <TableCell className="num text-xs" dir="ltr">{row.accountRef || '—'}</TableCell>
                  <TableCell className="num text-xs">
                    {formatDate(row.grantedAt, tz)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {tab === 'bank' && (
        <div>
          <BankCard bank={data.bank} card={data.bank.card} />
        </div>
      )}

      {tab === 'prefs' && (
        <Panel title={tr("ترجیحات")}>
          <form action={saveTz} className="grid gap-3">
            <Field>
              <FieldLabel htmlFor="p-tz">{tr("منطقهٔ زمانی")}</FieldLabel>
              {/*
                ⚠️ `datalist` خودش جستجوی زنده است: مرورگر با هر حرفی که تایپ
                شود فهرست را فیلتر می‌کند — بدونِ جاوااسکریپتِ ما و بدونِ
                کامپوننتِ اضافه. فهرست حالا **همهٔ** مناطقِ دنیاست، با
                پرکاربردها در بالا؛ پیش از این فقط هفت‌تا بود و کاربرِ توکیو
                باید نامِ منطقه‌اش را از حفظ می‌نوشت.
              */}
              <Input
                id="p-tz" name="timezone" list="tz-list"
                placeholder={tr("پیش‌فرضِ سامانه")} defaultValue={data.timezone}
              />
              <datalist id="tz-list">
                {timezones.map((tz) => <option key={tz} value={tz} />)}
              </datalist>
              <FieldDescription>
                {tr("ساعت‌ها بر مبنای ساعتِ دیواریِ شما نشان داده می‌شوند. خالی یعنی پیش‌فرضِ سامانه.")}
              </FieldDescription>
            </Field>
            <div className="flex items-center gap-3">
              <Submit>{tr("ذخیره")}</Submit>
            </div>
          </form>
        </Panel>
      )}

      {tab === 'password' && (
        <Panel title={tr("رمزِ ورود")}>
          <form action={changePw} className="grid gap-3">
            <Field>
              <FieldLabel htmlFor="pw-current">{tr("رمزِ فعلی")}</FieldLabel>
              <Input id="pw-current" name="current" type="password" autoComplete="current-password" />
              {/*
                ⚠️ رمزِ فعلی لازم است حتی وقتی وارد شده‌اید: نشستِ
                دزدیده‌شده نباید بتواند رمز را عوض کند و شما را بیرون بگذارد.
              */}
              <FieldDescription>
                {tr("اگر مدیر برایتان حساب ساخته و هنوز رمزی نگذاشته‌اید، این را خالی بگذارید.")}
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="pw-next">{tr("رمزِ تازه")}</FieldLabel>
              <Input
                id="pw-next" name="next" type="password" minLength={8}
                autoComplete="new-password" required
                placeholder={tr("دستِ‌کم ۸ نویسه")}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="pw-repeat">{tr("تکرارِ رمزِ تازه")}</FieldLabel>
              <Input
                id="pw-repeat" name="repeat" type="password" minLength={8}
                autoComplete="new-password" required
              />
            </Field>

            <div className="flex items-center gap-3">
              <Submit>{tr("تغییرِ رمز")}</Submit>
            </div>
          </form>
        </Panel>
      )}

      {tab === 'notify' && (
        // ⚠️ تلهٔ ریستِ فرمِ React 19: Switch/Checkbox ِ Radix پس از ذخیره به مقدارِ
        // لحظهٔ بازشدن برمی‌گشتند. key روی ترجیحاتِ ذخیره‌شده فرم را از نو سوار می‌کند.
        <form key={JSON.stringify(data.notify)} action={saveNotify} className="grid grid-cols-1 gap-4">
          <p className="text-sm text-muted-foreground">
            {tr("زنگِ داخلِ اپ همیشه روشن است. این تنظیمات فقط کانال‌های بیرونی را تعیین می‌کنند.")}
          </p>

          <Panel title={tr("ایمیل")}>

            {!data.notify.mailerReady && (
              // ⚠️ حقیقت را می‌گوییم، نه گزینه‌ای که بی‌صدا کار نمی‌کند.
              <p className="text-xs text-amber-700 dark:text-amber-500">
                {tr("فرستندهٔ ایمیل روی این سامانه پیکربندی نشده است؛ فعلاً ایمیلی فرستاده نمی‌شود.")}
              </p>
            )}

            <label className="flex items-center gap-1.5 text-sm">
              <Switch name="emailOn" defaultChecked={data.notify.emailOn}
              />
              {tr("دریافتِ اعلان با ایمیل")}
            </label>

            <Field>
              <FieldLabel htmlFor="n-email">{tr("ایمیلِ اختصاصیِ اعلان")}</FieldLabel>
              <Input
                id="n-email" name="notifyEmail" type="email" className="num"
                defaultValue={data.notify.email} placeholder={data.email}
              />
              <FieldDescription>
                {tr("خالی یعنی همان ایمیلِ ورود.")}
              </FieldDescription>
            </Field>

            <fieldset className="grid gap-2">
              <legend className="text-xs text-muted-foreground">
                {tr("دسته‌هایی که می‌خواهید ایمیلشان را نگیرید:")}
              </legend>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {EMAIL_CATEGORIES.map((c) => (
                  <label key={c.key} className="flex items-center gap-1.5 text-sm">
                    <Checkbox name="muted" value={String(c.key)}
                      defaultChecked={data.notify.muted.includes(c.key)}
                    />
                    {tr(c.label)}
                  </label>
                ))}
              </div>
            </fieldset>
          </Panel>

          {/*
            ⚠️ اتصالِ تلگرام و کلیدِ «دریافتِ اعلان در تلگرام» یک جا (۲.۹.۲)؛ پیش از این
            دو تبِ جدا بودند و این کلید می‌گفت «اول از تبِ تلگرام وصل کنید».
            دکمه‌های اتصال type="button" هستند و فرمِ اعلان را ارسال نمی‌کنند.
          */}
          {data.telegram !== 'unavailable' && (
            <Panel title={tr("تلگرام")}>
            {/* ⚠️ بدونِ توکنِ بات کلِ این پنل نیست؛ دکمه‌ای که همیشه شکست بخورد نشان نمی‌دهیم. */}
            {data.telegram === 'connected' ? (
              <div className="grid gap-2">
                <p className="text-sm">{tr("اعلان‌های شما به تلگرام هم فرستاده می‌شود.")}</p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button" size="sm" variant="outline" disabled={pending}
                    onClick={() => startTransition(async () => setTgState(await sendMyTelegramTestAction()))}
                  >
                    {tr("ارسال پیام تست")}
                  </Button>
                  <Button
                    type="button" size="sm" variant="destructive" disabled={pending}
                    onClick={() => startTransition(async () => setTgState(await disconnectTelegramAction()))}
                  >
                    {tr("قطع اتصال تلگرام")}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="grid gap-2">
                <p className="text-sm text-muted-foreground">
                  {tr("برای دریافتِ اعلان در تلگرام، بات را باز کنید و Start را بزنید.")}
                </p>
                <div>
                  {/*
                    ⚠️ یک دکمه، نه دو. پیش از این «ساختِ پیوند» را می‌زدی، بعد
                    یک لینکِ آبیِ بی‌استایل ظاهر می‌شد که باید آن را هم
                    می‌زدی — سه کلیک برای کاری که یکی است. حالا همان دکمه
                    پیوند را می‌گیرد و تلگرام را باز می‌کند.
                  */}
                  <Button
                    type="button" size="sm" disabled={pending}
                    onClick={() => {
                      /**
                       * ⚠️ تب **همین‌جا و همگام** باز می‌شود، پیش از هر await.
                       * پیش از این پیوند در همان تب باز می‌شد چون
                       * `window.open` بعد از await بیرون از رویدادِ کلیک است و
                       * مرورگر پاپ‌آپ حسابش می‌کند. راهش این است: اول یک تبِ
                       * خالی — که هنوز داخلِ کلیک است و اجازه دارد — بعد
                       * نشانی‌اش را می‌گذاریم.
                       *
                       * ⚠️ `opener = null` برای reverse tabnabbing: بدونِ آن
                       * صفحهٔ باز‌شده می‌تواند تبِ ما را جای دیگری ببرد.
                       */
                      const tab = window.open('', '_blank');
                      // ⚠️ در try: قطعِ opener جایی مجاز نباشد نباید کلِ اتصال را بشکند.
                      try { if (tab) tab.opener = null; } catch { /* مهم نیست */ }

                      startTransition(async () => {
                        const next = await connectTelegramAction();
                        setTgState(next);
                        if (!next.link) {
                          // پیوندی ساخته نشد — تبِ خالی را باز نگه نمی‌داریم.
                          tab?.close();
                          return;
                        }
                        // ⚠️ پاپ‌آپ‌بلاکر که جلویش را گرفت، همان تب؛ از هیچ بهتر است.
                        if (tab) tab.location.href = next.link;
                        else window.location.href = next.link;
                      });
                    }}
                  >
                    <Send className="size-3.5" />
                    {tr("اتصال به تلگرام")}
                  </Button>
                </div>
                {tgState.link && (
                  /*
                    ⚠️ مرحلهٔ دوم می‌ماند: سرور وب‌هوک ندارد، پس تا کاربر
                    نگوید «Start را زدم» راهی نیست بفهمد پیام رسیده. نسخهٔ
                    قبلی هم همین دو مرحله را دارد.
                  */
                  <div>
                    <Button
                      type="button" size="sm" variant="outline" disabled={pending}
                      onClick={() => startTransition(async () => setTgState(await completeTelegramAction()))}
                    >
                      {tr("Start را زدم — اتصال را کامل کن")}
                    </Button>
                  </div>
                )}
              </div>
            )}
              {data.telegram === 'connected' && (
                <>
                  <label className="flex items-center gap-1.5 text-sm">
                    <Switch name="telegramOn" defaultChecked={data.notify.telegramOn} />
                    {tr("دریافتِ اعلان در تلگرام")}
                  </label>
                  {/* ⚠️ خاموش‌کردنِ دسته فقط ایمیل را ساکت می‌کند (R-NOTIF-04). */}
                  <p className="text-xs text-muted-foreground">
                    {tr('تلگرام همهٔ رویدادها را می‌گیرد؛ دسته‌بندیِ بالا فقط ایمیل را ساکت می‌کند.')}
                  </p>
                  {/*
                    یادآورهای تلگرام (۲.۱۴.۰). ⚠️ هر کدام حداکثر یک بار در روز، فقط روزِ
                    کاری و نه در مرخصی؛ زیرِ هر پیام هم «🔕 دیگر نفرست» هست.
                  */}
                  <input type="hidden" name="tgPrefs" value="1" />
                  <fieldset className="grid gap-2 rounded-lg border p-3">
                    <legend className="px-1 text-xs font-medium text-muted-foreground">{tr('یادآورهای تلگرام')}</legend>
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <label className="flex items-center gap-1.5">
                        <Switch name="tgOn" value="brief" defaultChecked={!data.notify.telegramMuted.includes('brief') && data.notify.briefAt !== ''} />
                        {tr('گزارشِ صبحگاهی ساعتِ')}
                      </label>
                      <Input type="time" name="briefAt" defaultValue={data.notify.briefAt || '08:30'} className="w-28" dir="ltr" />
                    </div>
                    {([
                      ['no_timelog', 'یادآوریِ ثبتِ ساعت (اگر روزِ کاری چیزی ثبت نشده)'],
                      ['timer_running', 'تایمری که خیلی روشن مانده'],
                      ['meeting_soon', 'جلسهٔ نزدیک'],
                      ['onboarding.overdue', 'کارِ آنبوردینگِ عقب‌افتاده'],
                    ] as const).map(([kind, label]) => (
                      <label key={kind} className="flex items-center gap-1.5 text-sm">
                        <Switch name="tgOn" value={kind} defaultChecked={!data.notify.telegramMuted.includes(kind)} />
                        {tr(label)}
                      </label>
                    ))}
                    <p className="text-xs text-muted-foreground">
                      {tr('هر یادآوری حداکثر یک بار در روز، فقط روزهای کاریِ خودتان و نه در مرخصی؛ گزارشِ خالی هم فرستاده نمی‌شود.')}
                    </p>
                  </fieldset>
                </>
              )}
            </Panel>
          )}

          <div className="flex items-center gap-3">
            <Submit>{tr("ذخیره")}</Submit>
          </div>
        </form>
      )}

      {tab === 'mcp' && (
        <McpPanel
          tokens={data.mcp.tokens} grants={data.mcp.grants} endpoint={data.mcp.endpoint}
          bot={<AiBotPanel sensitive={data.ai.sensitive} connections={data.ai.connections} providers={data.ai.providers} telegram={data.telegram} botUsername={data.ai.botUsername} />}
        />
      )}


      </div>
    </div>
  );
}
