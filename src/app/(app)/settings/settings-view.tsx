'use client';

import { useState, useTransition } from 'react';
import { ChevronDown, Star } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { CatalogSection } from './catalog-section';
import { CompanySection } from './company-section';
import { Separator } from '@/components/ui/separator';
import { ColorPicker } from '@/components/ui/color-picker';
import {
  groupChoices, groupFieldLabel, supportsClosed, supportsGrant, supportsReview,
} from '@/domain/tags/groups';
import type { TagType } from '@/db/schema/base';
import {
  deleteCurrencyAction, deleteOfficeAction, deleteQaItemAction, deleteRateAction,
  deleteTagAction, saveCurrencyAction, saveOfficeAction,
  saveQaItemAction, saveRateAction, saveTagAction,
} from './_form/actions';
import { StaffSection, type StaffRow } from './staff-section';
import { ReportSection } from './report-section';
import { SystemSection, TelegramSection } from './system-section';
import { OnboardingLibrary, type OnboardingLibraryData } from './onboarding-library';
import { BackupSection, type BackupView } from './backup-section';
import type { TelegramSettingsView } from '@/server/settings/telegram-service';
import { FiscalSection, type ClosingPreview } from './fiscal-section';
import type { SystemConfig } from '@/domain/settings/system';
import type { ReportConfig } from '@/domain/scheduler/daily-report';
import { Badge } from '@/components/ui/badge';
import { IconButton } from '@/components/ui/icon-button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Field, FieldLabel, FieldDescription } from '@/components/ui/field';
import { useLocale, useT } from '@/i18n/client';
// ⚠️ `tagLabel` نه ترکیبِ دستی: پلهٔ زبانِ پایه را هم دارد — تگی که از فرم ذخیره شده
// ترجمهٔ فارسی در نقشه ندارد و بینندهٔ فارسی نامِ انگلیسی می‌دید (B6).
import { tagLabel } from '@/domain/settings/tag-label';
import { GRANTABLE_CAPS } from '@/domain/access/project-scope';
import type { SchedulerHealth } from '@/domain/scheduler/health';
import type { BucketCheck } from '@/server/files/bucket-probe';
import { DEFAULT_LOCALE, isRtl, LOCALE_NAMES, LOCALES } from '@/i18n/config';
import { trimRate } from '@/domain/currency/rates';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { DatePicker } from '@/components/ui/date-picker';

export interface SettingsData {
  /** برای پنهان‌کردنِ تب‌های مالکانه از دیدِ حسابدار. */
  isOwner: boolean;
  telegram: TelegramSettingsView;
  company: {
    name: string; address: string; taxId: string; email: string; phone: string;
    website: string; bank: string; invoiceFooter: string; logoFileId: number | null;
  };
  staff: StaffRow[];
  /** کاربرانی که می‌توانند همکارِ ادمین شوند — برای مالک، وگرنه خالی. */
  staffCandidates: Array<{ id: number; name: string; email: string }>;
  reportConfig: ReportConfig;
  systemConfig: SystemConfig;
  health: SchedulerHealth;
  /** خودآزماییِ باکت — فقط برای مالک (null برای بقیه). */
  bucket: BucketCheck | null;
  lockDate: string | null;
  /** پیش‌نمایشِ بستنِ دوره — فقط مالک؛ برای بقیه null. */
  closing: ClosingPreview | null;
  today: string;
  currencies: Array<{
    id: number; code: string; name: string; symbol: string;
    decimals: number; isDefault: boolean; isActive: boolean;
  }>;
  rates: Array<{
    fromCurrencyId: number; toCurrencyId: number; rate: string; effectiveDate: string;
  }>;
  tags: Array<{
    id: number; name: string; type: TagType; color: string;
    statusGroup: string; isReview: boolean; isClosed: boolean;
    sortOrder: number; grantsCap: string; isProtected: boolean;
    nameI18n: Record<string, string> | null;
  }>;
  offices: Array<{
    id: number; name: string; location: string;
    defaultCurrencyId: number | null; isActive: boolean;
  }>;
  /** کتابخانهٔ آنبوردینگ — `null` وقتی خاموش است یا مجوز نیست (تب پنهان). */
  onboarding: OnboardingLibraryData | null;
  /** پشتیبان‌گیری — فقط برای مالک؛ برای بقیه `null`. */
  backup: BackupView | null;
  qaItems: Array<{
    id: number; title: string; description: string;
    roleTagId: number | null; isTask: boolean; sortOrder: number;
  }>;
}

/**
 * نوعِ تگ‌ها — پنج نوعِ نسخهٔ قبلی، به‌علاوهٔ دستهٔ سرویس‌های دفترِ دسترسی
 * (۱.۸۶.۰) که پیش از آن فهرستی ثابت در کد بود.
 */
const TAG_TYPES: Array<{ key: TagType; label: string }> = [
  { key: 'member_role', label: 'نقشِ عضو' },
  { key: 'project_status', label: 'وضعیتِ پروژه' },
  { key: 'task_status', label: 'وضعیتِ تسک' },
  { key: 'task_priority', label: 'اولویتِ تسک' },
  { key: 'ledger_category', label: 'دستهٔ دفتر' },
  { key: 'service_category', label: 'دستهٔ سرویس' },
];

const TABS = [
  { key: 'currencies', label: 'ارزها و نرخ‌ها', ownerOnly: false },
  { key: 'tags', label: 'تگ‌ها', ownerOnly: false },
  { key: 'offices', label: 'دفاتر', ownerOnly: false },
  // ⚠️ «طرف‌حساب‌ها» به امور مالی رفت (کاتالوگِ مالی، همان جای نسخهٔ قبلی).
  { key: 'qa', label: 'کتابخانهٔ QA', ownerOnly: false },
  // فقط وقتی آنبوردینگ روشن است (← TabsList).
  { key: 'onboarding', label: 'کتابخانهٔ آنبوردینگ', ownerOnly: false },
  /**
   * ⚠️ سه تبِ مالکانه — همان تفکیکِ نسخهٔ قبلی: تب‌های کاتالوگی را مجوزِ
   * مدیریتِ تنظیمات باز می‌کرد و `manage_options` این‌ها را. حسابدار نباید حتی ببیندشان؛
   * دکمه‌ای که همیشه «فقط مدیرِ کل» جواب بدهد فقط اعتماد را می‌خورد.
   */
  { key: 'company', label: 'مشخصاتِ شرکت', ownerOnly: false },
  { key: 'staff', label: 'دسترسی همکاران', ownerOnly: true },
  { key: 'system', label: 'سامانه', ownerOnly: false },
  // باتِ تلگرام و گزارشِ روزانه — جدا از «سامانه» تا هر تب یک دکمهٔ ذخیره داشته باشد.
  { key: 'notify', label: 'اطلاع‌رسانی', ownerOnly: true },
  { key: 'backup', label: 'پشتیبان‌گیری', ownerOnly: true },
  { key: 'fiscal', label: 'دورهٔ مالی', ownerOnly: true },
] as const;


type SettingsTab = (typeof TABS)[number]['key'];

/**
 * تبِ آغازین از نشانی (`?tab=tags&type=service_category`) — تا پیوندی مثلِ
 * «مدیریتِ دسته‌ها» در فرمِ سرویس مستقیم روی همان فهرست باز شود. مقدارِ
 * ناشناخته، یا تبِ مالکانه برای غیرمالک، به پیش‌فرض برمی‌گردد.
 */
function startTab(key: string | undefined, isOwner: boolean): SettingsTab {
  return TABS.find((t) => t.key === key && (!t.ownerOnly || isOwner))?.key ?? 'currencies';
}

function startTagType(key: string | undefined): TagType {
  return TAG_TYPES.find((t) => t.key === key)?.key ?? 'member_role';
}

export function SettingsView({
  data, open = {},
}: { data: SettingsData; open?: { tab?: string; type?: string } }) {
  const tr = useT();
  const [tab, setTab] = useState<SettingsTab>(() => startTab(open.tab, data.isOwner));
  /** زیرتبِ نقش در کتابخانهٔ QA — `all`، شناسهٔ نقش، یا `client` (core #360). */
  const [qaRole, setQaRole] = useState<string>('all');
  const locale = useLocale();
  const [tagType, setTagType] = useState<TagType>(() => startTagType(open.type));
  const [pending, startTransition] = useTransition();

  const currencyName = (id: number | null) =>
    data.currencies.find((c) => c.id === id)?.code ?? '—';

  return (
    <div className="grid gap-4">
      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        {/* shadcn Tabs (line): پیمایشِ افقی به‌جای شکستنِ خط — در «گزارش‌ها» تب‌ها دو ردیف می‌شدند. */}
        <div className="overflow-x-auto pb-1.5">
          <TabsList variant="line" className="w-max">
            {TABS.filter((t) => (!t.ownerOnly || data.isOwner) && (t.key !== 'onboarding' || data.onboarding)).map((t) => (
              <TabsTrigger key={t.key} value={t.key} className="flex-none">
                {tr(t.label)}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
      </Tabs>

      {tab === 'currencies' && (
        <div className="grid gap-6">
          <CatalogSection
            title={tr("ارزها")}
            description={tr("ارزِ پیش‌فرض پایهٔ گزارشِ بین‌ارزی است و حذف نمی‌شود.")}
            addLabel="افزودن ارز"
            rows={data.currencies}
            columns={[
              { header: 'کد', cell: (c) => <span className="num">{c.code}</span> },
              { header: 'نام', cell: (c) => c.name },
              { header: 'نماد', cell: (c) => c.symbol || '—' },
              {
                header: 'وضعیت',
                cell: (c) => (
                  <span className="flex gap-1">
                    {c.isDefault && <Badge variant="success">{tr("پیش‌فرض")}</Badge>}
                    {!c.isActive && <Badge variant="outline">{tr("غیرفعال")}</Badge>}
                  </span>
                ),
              },
            ]}
            saveAction={saveCurrencyAction}
            deleteAction={(c) => deleteCurrencyAction(c.id)}
            rowActions={(c) =>
              c.isDefault ? null : (
                <IconButton
                  variant="ghost"
                  className="size-8"
                  label={tr("تنظیم به‌عنوانِ پیش‌فرض")}
                  title={tr("تنظیم به‌عنوانِ پیش‌فرض")}
                  disabled={pending}
                  onClick={() => startTransition(async () => {
                    const { setDefaultCurrencyAction } = await import('./_form/actions');
                    await setDefaultCurrencyAction(c.id);
                  })}
                >
                  <Star className="size-3.5" />
                </IconButton>
              )
            }
            renderForm={(editing) => (
              <div className="grid gap-3 sm:grid-cols-4">
                <Field>
                  <FieldLabel htmlFor="c-code">{tr("کد")}</FieldLabel>
                  <Input id="c-code" name="code" className="num" defaultValue={editing?.code ?? ''} required />
                </Field>
                <Field>
                  <FieldLabel htmlFor="c-name">{tr("نام")}</FieldLabel>
                  <Input id="c-name" name="name" defaultValue={editing?.name ?? ''} required />
                </Field>
                <Field>
                  <FieldLabel htmlFor="c-symbol">{tr("نماد")}</FieldLabel>
                  <Input id="c-symbol" name="symbol" defaultValue={editing?.symbol ?? ''} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="c-dec">{tr("اعشار")}</FieldLabel>
                  <Input id="c-dec" name="decimals" type="number" className="num" defaultValue={editing?.decimals ?? 2} />
                </Field>
                <label className="flex items-center gap-2 text-sm sm:col-span-4">
                  <Checkbox name="isActive" defaultChecked={editing?.isActive ?? true} />
                  {tr("فعال (در فرم‌ها پیشنهاد می‌شود)")}
                </label>
              </div>
            )}
          />

          <CatalogSection
            title={tr("نرخ‌های تبدیل")}
            description={tr("جدیدترین نرخِ هر جفت مبنای تبدیل است.")}
            addLabel="افزودن نرخ"
            rows={data.rates.map((r, i) => ({ ...r, id: i + 1 }))}
            columns={[
              { header: 'از', cell: (r) => currencyName(r.fromCurrencyId) },
              { header: 'به', cell: (r) => currencyName(r.toCurrencyId) },
              { header: 'نرخ', cell: (r) => trimRate(r.rate), numeric: true },
              { header: 'تاریخ', cell: (r) => r.effectiveDate, numeric: true },
            ]}
            saveAction={saveRateAction}
            deleteAction={(r) => deleteRateAction(r.fromCurrencyId, r.toCurrencyId)}
            renderForm={(editing) => (
              <div className="grid gap-3 sm:grid-cols-4">
                <Field>
                  <FieldLabel htmlFor="r-from">{tr("از ارز")}</FieldLabel>
                  <NativeSelect id="r-from" name="fromCurrencyId" containerClassName="w-full" defaultValue={editing ? String(editing.fromCurrencyId) : ''}>
                    <NativeSelectOption value="">{tr("— انتخاب —")}</NativeSelectOption>
                    {data.currencies.map((c) => (
                      <NativeSelectOption key={c.id} value={c.id}>{c.code}</NativeSelectOption>
                    ))}
                  </NativeSelect>
                </Field>
                <Field>
                  <FieldLabel htmlFor="r-to">{tr("به ارز")}</FieldLabel>
                  <NativeSelect id="r-to" name="toCurrencyId" containerClassName="w-full" defaultValue={editing ? String(editing.toCurrencyId) : ''}>
                    <NativeSelectOption value="">{tr("— انتخاب —")}</NativeSelectOption>
                    {data.currencies.map((c) => (
                      <NativeSelectOption key={c.id} value={c.id}>{c.code}</NativeSelectOption>
                    ))}
                  </NativeSelect>
                </Field>
                <Field>
                  <FieldLabel htmlFor="r-rate">{tr("نرخ")}</FieldLabel>
                  <Input id="r-rate" name="rate" inputMode="decimal" className="num" defaultValue={editing ? trimRate(editing.rate) : ''} required />
                </Field>
                <Field>
                  <FieldLabel htmlFor="r-date">{tr("تاریخ")}</FieldLabel>
                  <DatePicker
                    id="r-date"
                    name="effectiveDate"
                    defaultValue={editing?.effectiveDate ?? new Date().toISOString().slice(0, 10)}
                  />
                </Field>
              </div>
            )}
          />
        </div>
      )}

      {tab === 'tags' && (
        <div className="grid gap-3">
          <div className="overflow-x-auto overflow-y-hidden">
            <Tabs value={tagType} onValueChange={(v) => setTagType(v as TagType)}>
              <TabsList className="w-max">
                {TAG_TYPES.map((t) => (
                  <TabsTrigger key={t.key} value={t.key} className="flex-none px-3">
                    {tr(t.label)}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>

          <CatalogSection
            title={TAG_TYPES.find((t) => t.key === tagType)!.label}
            description={tr("تگِ در حالِ استفاده حذف نمی‌شود.")}
            addLabel="افزودن تگ"
            rows={data.tags.filter((t) => t.type === tagType)}
            /*
              ⚠️ همهٔ نوع‌های تگ **یک** مجموعه ستون دارند، با پهنای ثابت: پیش از این
              هر نوع ستون‌های خودش را داشت (گروه، دسترسی، تمام‌شده) و جدول با هر
              تعویضِ نوع سرستون‌هایش را جابه‌جا می‌کرد. آنچه مخصوصِ یک نوع است
              حالا نشانی در ستونِ «ویژگی‌ها»ست؛ راهنمای هر نشان نامِ فیلدِ آن است.
            */
            fixed
            columns={[
              /*
                ⚠️ نامِ تگ **به زبانِ جاری**، نه ستونِ خام. بقیهٔ اپ ترجمه را
                نشان می‌دهد؛ اگر این جدول تنها جایی باشد که نامِ پایه را
                می‌دهد، کاربر فکر می‌کند ترجمه کار نکرده.
              */
              {
                header: 'نام',
                // انگلیسی پلِ میان‌زبانی است (R-I18N-15) — همان قاعدهٔ tagName().
                cell: (t) => (
                  <span className="inline-flex items-center gap-1.5">
                    {tagLabel(t, locale)}
                    {/* پورتِ نشانِ «سیستمی»: تگِ محافظت‌شده حذف نمی‌شود. */}
                    {t.isProtected && <Badge variant="outline" className="font-normal">{tr("سیستمی")}</Badge>}
                  </span>
                ),
              },
              {
                header: 'رنگ',
                className: 'w-20',
                cell: (t) => t.color
                  ? <span className="inline-block size-4 rounded" style={{ backgroundColor: t.color }} />
                  : '—',
              },
              {
                header: 'ویژگی‌ها',
                className: 'w-80',
                cell: (t) => {
                  const traits = tagTraits(t, tr);
                  return traits.length === 0 ? '—' : (
                    <span className="flex flex-wrap gap-1">
                      {traits.map((b) => (
                        <Badge key={b.label} variant="outline" className="font-normal" title={b.hint}>{b.label}</Badge>
                      ))}
                    </span>
                  );
                },
              },
              { header: 'ترتیب', className: 'w-20', cell: (t) => t.sortOrder, numeric: true },
            ]}
            saveAction={saveTagAction}
            deleteAction={(t) => deleteTagAction(t.id)}
            canDelete={(t) => !t.isProtected}
            renderForm={(editing) => (
              <>
                <input type="hidden" name="type" value={tagType} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field>
                    {/* پورتِ «نام (پایه — فارسی)»: زبانِ نامِ پایه همان زبانِ پیش‌فرضِ سامانه است. */}
                    <FieldLabel htmlFor="t-name">{tr('نام (پایه — {lang})', { lang: LOCALE_NAMES[DEFAULT_LOCALE] })}</FieldLabel>
                    <Input id="t-name" name="name" defaultValue={editing?.name ?? ''} required />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="t-sort">{tr("ترتیب")}</FieldLabel>
                    <Input id="t-sort" name="sortOrder" type="number" className="num" defaultValue={editing?.sortOrder ?? 0} />
                  </Field>
                </div>

                <Field>
                  <FieldLabel htmlFor="t-color">{tr("رنگ")}</FieldLabel>
                  <ColorPicker id="t-color" name="color" defaultValue={editing?.color || '#6c5ce7'} />
                </Field>

                {/*
                  ⚠️ `status_group` معنایش با نوعِ تگ عوض می‌شود: ستونِ کانبان،
                  تبِ خط‌لوله، یا جهتِ حسابداری. پیش‌تر یک ورودیِ متنیِ آزاد
                  بود و کاربر باید رشته‌هایی مثل `in_progress` را از بر
                  می‌بود — عملاً غیرقابلِ استفاده.
                */}
                {groupChoices(tagType).length > 0 && (
                  <Field>
                    <FieldLabel htmlFor="t-group">{tr(groupFieldLabel(tagType))}</FieldLabel>
                    <NativeSelect
                      id="t-group" name="statusGroup" containerClassName="w-full"
                      defaultValue={editing?.statusGroup ?? ''}
                    >
                      {groupChoices(tagType).map((c) => (
                        <NativeSelectOption key={c.value || 'none'} value={c.value}>{tr(c.label)}</NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </Field>
                )}

                {(supportsClosed(tagType) || supportsReview(tagType)) && (
                  <div className="grid gap-2 rounded-lg bg-muted/60 p-3">
                    {supportsClosed(tagType) && (
                      <label className="flex items-center gap-2 text-sm">
                        <Checkbox name="isClosed" value="1"
                          defaultChecked={editing?.isClosed ?? false}
                        />
                        {tagType === 'task_status'
                          ? tr("این وضعیت یعنی تسک تمام‌شده است")
                          : tr("این وضعیت یعنی پروژه بسته شده است")}
                      </label>
                    )}
                    {supportsReview(tagType) && (
                      <label className="flex items-center gap-2 text-sm">
                        <Checkbox name="isReview" value="1"
                          defaultChecked={editing?.isReview ?? false}
                        />
                        {tr("این وضعیت ستونِ «نیازمندِ بررسی» است")}
                      </label>
                    )}
                  </div>
                )}
                {/*
                  ترجمهٔ نامِ تگ — پورتِ `$i18n_fields` ِ نسخهٔ قبلی.

                  ⚠️ جمع‌شونده است، نه هشت فیلدِ باز: فرمِ تگ کوچک است و
                  بازکردنِ همیشگیِ هشت ورودی، کارِ روزمره (ساختِ یک تگ) را
                  زیرِ چیزی دفن می‌کرد که کمتر لازم می‌شود.
                */}
                {/*
                  ⚠️ `forceMount`: ورودی‌های بسته‌شده هم باید در DOM بمانند و با فرم
                  بروند (مثلِ `<details>` ِ قبلی). بدونِ آن، Radix محتوای بسته را
                  حذف می‌کند و ذخیرهٔ تگی که بخشش باز نشده بود ترجمه‌ها را پاک می‌کرد.
                  ⚠️ شمارنده `num` نیست: `direction: ltr` روی «۳ از ۸ ترجمه شده»
                  ترتیبِ کلمه‌های فارسی را برعکس می‌کرد.
                */}
                <Collapsible className="group/i18n rounded-lg bg-muted/60">
                  <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-start text-sm outline-none hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50">
                    <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]/i18n:rotate-180" />
                    <span className="min-w-0 flex-1">{tr("ترجمهٔ نام به زبان‌های دیگر")}</span>
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                      {tr('{done} از {total} ترجمه شده', {
                        done: LOCALES.filter((l) => l !== DEFAULT_LOCALE && Boolean(editing?.nameI18n?.[l])).length,
                        total: LOCALES.filter((l) => l !== DEFAULT_LOCALE).length,
                      })}
                    </span>
                  </CollapsibleTrigger>
                  <CollapsibleContent forceMount className="px-3 pb-3 data-[state=closed]:hidden">
                  <div className="grid gap-2 sm:grid-cols-2">
                    {LOCALES.filter((l) => l !== DEFAULT_LOCALE).map((code) => (
                      <div key={code} className="grid gap-1">
                        {/* «✓» یعنی ترجمه دارد — پورتِ نشانه‌گذاریِ ویرایشگرِ ترجمه. */}
                        <Label htmlFor={`t-name-${code}`} className="text-xs">
                          {LOCALE_NAMES[code]}{editing?.nameI18n?.[code] ? ' ✓' : ''}
                        </Label>
                        <Input
                          id={`t-name-${code}`}
                          name={`name-${code}`}
                          defaultValue={editing?.nameI18n?.[code] ?? ''}
                          placeholder={tr('نام به {lang}', { lang: LOCALE_NAMES[code] })}
                          dir={isRtl(code) ? 'rtl' : 'ltr'}
                        />
                      </div>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {tr("خالی یعنی همان نامِ اصلی دیده می‌شود.")}
                  </p>
                  </CollapsibleContent>
                </Collapsible>

                {/*
                  ⚠️ فقط تگِ **نقشِ عضو** می‌تواند دسترسی بدهد: این تگ همان
                  چیزی است که عضو با آن روی پروژه امضا می‌شود، و اختیارِ
                  «مدیرِ پروژه» از همان‌جا می‌آید (R-RBAC-12).
                */}
                {supportsGrant(tagType) && (
                  <Field>
                    <FieldLabel htmlFor="t-cap">{tr("دسترسی‌ای که این نقش می‌دهد")}</FieldLabel>
                    <NativeSelect
                      id="t-cap"
                      name="grantsCap"
                      defaultValue={editing?.grantsCap ?? ''}
                      containerClassName="w-full"
                    >
                      {GRANTABLE_CAPS.map((c) => (
                        <NativeSelectOption key={c.value || 'none'} value={c.value}>{tr(c.label)}</NativeSelectOption>
                      ))}
                    </NativeSelect>
                    <FieldDescription>
                      {tr("دسترسی را اضافه می‌کند؛ هرگز چیزی را پس نمی‌گیرد.")}
                    </FieldDescription>
                  </Field>
                )}
              </>
            )}
          />
        </div>
      )}

      {tab === 'offices' && (
        <CatalogSection
          title={tr("دفاتر")}
          description={tr("دفتر حذف نمی‌شود؛ غیرفعال می‌شود تا ارجاع‌های قدیمی نشکنند.")}
          addLabel="افزودن دفتر"
          rows={data.offices}
          columns={[
            { header: 'نام', cell: (o) => o.name },
            { header: 'مکان', cell: (o) => o.location || '—' },
            { header: 'ارزِ پیش‌فرض', cell: (o) => currencyName(o.defaultCurrencyId) },
            {
              header: 'وضعیت',
              cell: (o) => (o.isActive ? null : <Badge variant="outline">{tr("غیرفعال")}</Badge>),
            },
          ]}
          saveAction={saveOfficeAction}
          deleteAction={(o) => deleteOfficeAction(o.id)}
          renderForm={(editing) => (
            <div className="grid gap-3 sm:grid-cols-3">
              <Field>
                <FieldLabel htmlFor="o-name">{tr("نام")}</FieldLabel>
                <Input id="o-name" name="name" defaultValue={editing?.name ?? ''} required />
              </Field>
              <Field>
                <FieldLabel htmlFor="o-loc">{tr("مکان")}</FieldLabel>
                <Input id="o-loc" name="location" defaultValue={editing?.location ?? ''} />
              </Field>
              <Field>
                <FieldLabel htmlFor="o-cur">{tr("ارزِ پیش‌فرض")}</FieldLabel>
                <NativeSelect
                  id="o-cur"
                  name="defaultCurrencyId"
                  containerClassName="w-full"
                  defaultValue={editing?.defaultCurrencyId ? String(editing.defaultCurrencyId) : ''}
                >
                  <NativeSelectOption value="">{tr("— هیچ‌کدام —")}</NativeSelectOption>
                  {data.currencies.map((c) => (
                    <NativeSelectOption key={c.id} value={c.id}>{c.code}</NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
              <label className="flex items-center gap-2 text-sm sm:col-span-3">
                <Checkbox name="isActive"
                  defaultChecked={editing ? editing.isActive : true}
                />
                {tr("فعال")}
              </label>
            </div>
          )}
        />
      )}

      {tab === 'qa' && (
        <div className="grid gap-3">
        {/*
          پورتِ زیرتب‌های نقشِ کتابخانهٔ QA: یک تب برای هر نقشِ عضو و یکی برای
          کارفرما، تا فهرستِ بلند یک‌جا ریخته نشود. بی‌نقشِ عضو، آیتمِ نقش‌دار
          ساختنی نیست — پیامِ راهنما همان‌جا گفته می‌شود.
        */}
        {data.tags.every((t) => t.type !== 'member_role') ? (
          <p className="text-sm text-muted-foreground">
            {tr('هنوز نقشِ عضوی تعریف نشده؛ برای آیتم‌های نقش‌دار اول در تبِ «تگ‌ها» نقش بسازید. آیتمِ کارفرما همین حالا هم ساختنی است.')}
          </p>
        ) : (
          <div className="overflow-x-auto pb-1.5">
            <Tabs value={qaRole} onValueChange={setQaRole}>
              <TabsList className="w-max">
                <TabsTrigger value="all" className="flex-none gap-1.5 px-3">
                  {tr('همه')}<span className="num text-xs text-muted-foreground">{data.qaItems.length}</span>
                </TabsTrigger>
                {data.tags.filter((t) => t.type === 'member_role').map((t) => (
                  <TabsTrigger key={t.id} value={String(t.id)} className="flex-none gap-1.5 px-3">
                    {tagLabel(t, locale)}
                    <span className="num text-xs text-muted-foreground">{data.qaItems.filter((q) => q.roleTagId === t.id).length}</span>
                  </TabsTrigger>
                ))}
                <TabsTrigger value="client" className="flex-none gap-1.5 px-3">
                  {tr('کارفرما')}<span className="num text-xs text-muted-foreground">{data.qaItems.filter((q) => !q.roleTagId).length}</span>
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        )}
        <CatalogSection
          title={tr("کتابخانهٔ QA")}
          description={tr("آیتمِ «تسک‌ساز» هنگامِ اعمال یک تسکِ واقعی می‌سازد (R-PROJ-18).")}
          addLabel="افزودن آیتم"
          rows={data.qaItems.filter((q) => qaRole === 'all'
            || (qaRole === 'client' ? !q.roleTagId : q.roleTagId === Number(qaRole)))}
          columns={[
            { header: 'عنوان', cell: (q) => q.title },
            {
              header: 'نقش',
              cell: (q) => {
                const role = data.tags.find((t) => t.id === q.roleTagId);
                return role ? tagLabel(role, locale) : tr('کارفرما');
              },
            },
            {
              header: 'نوع',
              cell: (q) => (q.isTask ? <Badge>{tr("تسک‌ساز")}</Badge> : <Badge variant="secondary">{tr("چک‌لیست")}</Badge>),
            },
            { header: 'ترتیب', cell: (q) => q.sortOrder, numeric: true },
          ]}
          saveAction={saveQaItemAction}
          deleteAction={(q) => deleteQaItemAction(q.id)}
          renderForm={(editing) => (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field className="sm:col-span-2">
                  <FieldLabel htmlFor="q-title">{tr("عنوان")}</FieldLabel>
                  <Input id="q-title" name="title" defaultValue={editing?.title ?? ''} required />
                </Field>
                <Field>
                  <FieldLabel htmlFor="q-role">{tr("نقش")}</FieldLabel>
                  <NativeSelect
                    id="q-role"
                    name="roleTagId"
                    containerClassName="w-full"
                    defaultValue={editing?.roleTagId ? String(editing.roleTagId) : ''}
                  >
                    {/* R-QA-02 — نقشِ خالی یعنی مخاطبِ «کارفرما». */}
                    <NativeSelectOption value="">{tr("کارفرما")}</NativeSelectOption>
                    {data.tags.filter((t) => t.type === 'member_role').map((t) => (
                      <NativeSelectOption key={t.id} value={t.id}>{tagLabel(t, locale)}</NativeSelectOption>
                    ))}
                  </NativeSelect>
                </Field>
              </div>
              <Field>
                <FieldLabel htmlFor="q-desc">{tr("توضیحات")}</FieldLabel>
                {/*
                  ⚠️ چندخطی: توضیحِ آیتمِ QA یک دستورالعملِ بررسی است («این را
                  باز کن، آن را بزن…») و در یک خط جا نمی‌شد. حالا در تبِ QA
                  هم با حفظِ شکستِ خط نشان داده می‌شود.
                */}
                <Textarea id="q-desc" name="description" rows={3} defaultValue={editing?.description ?? ''} />
              </Field>
              <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    name="isTask"
                    defaultChecked={editing?.isTask ?? false}
                  />
                  {tr("تسک‌ساز (هنگامِ اعمال یک تسکِ واقعی می‌سازد)")}
                </label>
                <div className="flex items-center gap-2">
                  <Label htmlFor="q-sort" className="text-xs">{tr("ترتیب")}</Label>
                  <Input
                    id="q-sort"
                    name="sortOrder"
                    type="number"
                    className="num w-20"
                    defaultValue={editing?.sortOrder ?? 0}
                  />
                </div>
              </div>
            </>
          )}
        />
        </div>
      )}

      {tab === 'onboarding' && data.onboarding && (
        <OnboardingLibrary
          data={data.onboarding}
          roles={data.tags.filter((t) => t.type === 'member_role').map((t) => ({ id: t.id, label: tagLabel(t, locale) }))}
        />
      )}

      {tab === 'staff' && <StaffSection staff={data.staff} candidates={data.staffCandidates} />}


      {tab === 'company' && data.company && <CompanySection company={data.company} isOwner={data.isOwner} />}

      {/*
        ⚠️ پیش از این بات و گزارشِ روزانه زیرِ «سامانه» بودند و تب سه دکمهٔ ذخیره
        داشت: کاربر کارتِ اول را عوض می‌کرد و دکمهٔ تهِ صفحه (مالِ گزارش) را
        می‌زد و چیزی ذخیره نمی‌شد. حالا هر تب یک فرم و یک دکمه.
      */}
      {tab === 'system' && (
        <SystemSection config={data.systemConfig} health={data.health} bucket={data.bucket} isOwner={data.isOwner} />
      )}

      {tab === 'backup' && data.isOwner && data.backup && <BackupSection view={data.backup} />}

      {tab === 'notify' && data.isOwner && (
        <div className="grid gap-6">
          <TelegramSection telegram={data.telegram} />
          <Separator />
          <ReportSection config={data.reportConfig} />
        </div>
      )}

      {tab === 'fiscal' && <FiscalSection lockDate={data.lockDate} today={data.today} closing={data.closing} />}
    </div>
  );
}

/**
 * نشان‌های ستونِ «ویژگی‌ها» ی جدولِ تگ — همان فیلدهایی که فرم برای این نوع
 * نشان می‌دهد. ⚠️ برچسب‌های `groups.ts` و `GRANTABLE_CAPS` ثابتِ فارسی‌اند،
 * یعنی کلیدِ ترجمه‌اند نه متنِ نهایی.
 */
function tagTraits(
  t: SettingsData['tags'][number],
  tr: (key: string) => string,
): Array<{ label: string; hint?: string }> {
  const out: Array<{ label: string; hint?: string }> = [];
  // ⚠️ مقدارِ خالی همیشه «هیچ» نیست: در دستهٔ دفتر یعنی «هردو (واریز و برداشت)».
  const group = groupChoices(t.type).find((c) => c.value === t.statusGroup);
  if (group) out.push({ label: tr(group.label), hint: tr(groupFieldLabel(t.type)) });
  if (supportsGrant(t.type)) {
    const cap = GRANTABLE_CAPS.find((c) => c.value === t.grantsCap && c.value !== '');
    // برچسبِ دسترسی «نام — توضیح» است؛ در نشان فقط نام، توضیح در راهنما.
    const full = cap ? tr(cap.label) : '';
    if (cap) out.push({ label: full.split(' — ')[0]!, hint: full });
  }
  if (supportsClosed(t.type) && t.isClosed) out.push({ label: tr('تمام‌شده') });
  if (supportsReview(t.type) && t.isReview) out.push({ label: tr('نیازمند بررسی') });
  return out;
}
