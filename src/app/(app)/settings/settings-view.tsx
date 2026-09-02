'use client';

import { useState, useTransition } from 'react';
import { Star } from 'lucide-react';
const tagSelectClass =
  'h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none'
  + ' focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50';

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
  deleteTagAction, deleteVendorAction, saveCurrencyAction, saveOfficeAction,
  saveQaItemAction, saveRateAction, saveTagAction, saveVendorAction,
} from './_form/actions';
import { StaffSection, type StaffRow } from './staff-section';
import { ReportSection } from './report-section';
import { SystemSection } from './system-section';
import type { TelegramSettingsView } from '@/server/settings/telegram-service';
import { FiscalSection } from './fiscal-section';
import type { SystemConfig } from '@/domain/settings/system';
import type { ReportConfig } from '@/domain/scheduler/daily-report';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useLocale, useT } from '@/i18n/client';
import { GRANTABLE_CAPS } from '@/domain/access/project-scope';
import type { SchedulerHealth } from '@/domain/scheduler/health';
import { DEFAULT_LOCALE, isRtl, LOCALE_NAMES, LOCALES } from '@/i18n/config';

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
  lockDate: string | null;
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
    sortOrder: number; grantsCap: string;
    nameI18n: Record<string, string> | null;
  }>;
  offices: Array<{
    id: number; name: string; location: string;
    defaultCurrencyId: number | null; isActive: boolean;
  }>;
  vendors: Array<{ id: number; name: string; note: string }>;
  qaItems: Array<{
    id: number; title: string; description: string;
    roleTagId: number | null; isTask: boolean; sortOrder: number;
  }>;
}

/** نوعِ تگ‌ها — همان پنج نوعِ نسخهٔ قبلی. */
const TAG_TYPES: Array<{ key: TagType; label: string }> = [
  { key: 'member_role', label: 'نقشِ عضو' },
  { key: 'project_status', label: 'وضعیتِ پروژه' },
  { key: 'task_status', label: 'وضعیتِ تسک' },
  { key: 'task_priority', label: 'اولویتِ تسک' },
  { key: 'ledger_category', label: 'دستهٔ دفتر' },
];

const TABS = [
  { key: 'currencies', label: 'ارزها و نرخ‌ها', ownerOnly: false },
  { key: 'tags', label: 'تگ‌ها', ownerOnly: false },
  { key: 'offices', label: 'دفاتر', ownerOnly: false },
  { key: 'vendors', label: 'طرف‌حساب‌ها', ownerOnly: false },
  { key: 'qa', label: 'کتابخانهٔ QA', ownerOnly: false },
  /**
   * ⚠️ سه تبِ مالکانه — همان تفکیکِ نسخهٔ قبلی: تب‌های کاتالوگی
   * را باز می‌کرد و `manage_options` این‌ها را. حسابدار نباید حتی ببیندشان؛
   * دکمه‌ای که همیشه «فقط مدیرِ کل» جواب بدهد فقط اعتماد را می‌خورد.
   */
  { key: 'company', label: 'مشخصاتِ شرکت', ownerOnly: true },
  { key: 'staff', label: 'دسترسی همکاران', ownerOnly: true },
  { key: 'system', label: 'سامانه', ownerOnly: false },
  { key: 'fiscal', label: 'دورهٔ مالی', ownerOnly: true },
] as const;

const field = 'h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50';

export function SettingsView({ data }: { data: SettingsData }) {
  const tr = useT();
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('currencies');
  const locale = useLocale();
  const [tagType, setTagType] = useState<TagType>('member_role');
  const [pending, startTransition] = useTransition();

  const currencyName = (id: number | null) =>
    data.currencies.find((c) => c.id === id)?.code ?? '—';

  return (
    <div className="grid gap-4">
      <nav className="flex flex-wrap gap-1 border-b">
        {TABS.filter((t) => !t.ownerOnly || data.isOwner).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm transition-colors ${
              tab === t.key
                ? 'border-primary font-medium text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tr(t.label)}
          </button>
        ))}
      </nav>

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
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-8"
                  aria-label={tr("تنظیم به‌عنوانِ پیش‌فرض")}
                  title={tr("تنظیم به‌عنوانِ پیش‌فرض")}
                  disabled={pending}
                  onClick={() => startTransition(async () => {
                    const { setDefaultCurrencyAction } = await import('./_form/actions');
                    await setDefaultCurrencyAction(c.id);
                  })}
                >
                  <Star className="size-3.5" />
                </Button>
              )
            }
            renderForm={(editing) => (
              <div className="grid gap-3 sm:grid-cols-4">
                <div className="grid gap-1.5">
                  <Label htmlFor="c-code">{tr("کد")}</Label>
                  <Input id="c-code" name="code" className="num" defaultValue={editing?.code ?? ''} required />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="c-name">{tr("نام")}</Label>
                  <Input id="c-name" name="name" defaultValue={editing?.name ?? ''} required />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="c-symbol">{tr("نماد")}</Label>
                  <Input id="c-symbol" name="symbol" defaultValue={editing?.symbol ?? ''} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="c-dec">{tr("اعشار")}</Label>
                  <Input id="c-dec" name="decimals" type="number" className="num" defaultValue={editing?.decimals ?? 2} />
                </div>
                <label className="flex items-center gap-2 text-sm sm:col-span-4">
                  <input type="checkbox" name="isActive" defaultChecked={editing?.isActive ?? true} className="size-4 accent-primary" />
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
              { header: 'نرخ', cell: (r) => r.rate, numeric: true },
              { header: 'تاریخ', cell: (r) => r.effectiveDate, numeric: true },
            ]}
            saveAction={saveRateAction}
            deleteAction={(r) => deleteRateAction(r.fromCurrencyId, r.toCurrencyId)}
            renderForm={() => (
              <div className="grid gap-3 sm:grid-cols-4">
                <div className="grid gap-1.5">
                  <Label htmlFor="r-from">{tr("از ارز")}</Label>
                  <select id="r-from" name="fromCurrencyId" className={field} defaultValue="">
                    <option value="">{tr("— انتخاب —")}</option>
                    {data.currencies.map((c) => (
                      <option key={c.id} value={c.id}>{c.code}</option>
                    ))}
                  </select>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="r-to">{tr("به ارز")}</Label>
                  <select id="r-to" name="toCurrencyId" className={field} defaultValue="">
                    <option value="">{tr("— انتخاب —")}</option>
                    {data.currencies.map((c) => (
                      <option key={c.id} value={c.id}>{c.code}</option>
                    ))}
                  </select>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="r-rate">{tr("نرخ")}</Label>
                  <Input id="r-rate" name="rate" inputMode="decimal" className="num" required />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="r-date">{tr("تاریخ")}</Label>
                  <Input
                    id="r-date"
                    name="effectiveDate"
                    type="date"
                    className="num"
                    defaultValue={new Date().toISOString().slice(0, 10)}
                  />
                </div>
              </div>
            )}
          />
        </div>
      )}

      {tab === 'tags' && (
        <div className="grid gap-3">
          <div className="flex flex-wrap gap-1">
            {TAG_TYPES.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTagType(t.key)}
                className={`rounded-md px-2.5 py-1 text-xs ${
                  tagType === t.key ? 'bg-primary/10 text-foreground' : 'text-muted-foreground hover:bg-muted'
                }`}
              >
                {tr(t.label)}
              </button>
            ))}
          </div>

          <CatalogSection
            title={TAG_TYPES.find((t) => t.key === tagType)!.label}
            description={tr("تگِ در حالِ استفاده حذف نمی‌شود.")}
            addLabel="افزودن تگ"
            rows={data.tags.filter((t) => t.type === tagType)}
            columns={[
              /*
                ⚠️ نامِ تگ **به زبانِ جاری**، نه ستونِ خام. بقیهٔ اپ ترجمه را
                نشان می‌دهد؛ اگر این جدول تنها جایی باشد که نامِ پایه را
                می‌دهد، کاربر فکر می‌کند ترجمه کار نکرده.
                نامِ پایه وقتی با ترجمه فرق دارد به‌عنوانِ راهنما می‌آید،
                چون همان است که در فرم ویرایش می‌شود.
              */
              {
                header: 'نام',
                // ⚠️ فقط نامِ زبانِ جاری. نامِ پایه زیرش نمی‌آید: ستون را
                // شلوغ می‌کرد و کاربر آن را «ترجمه‌نشده» می‌خواند، نه راهنما.
                // نامِ پایه در فرمِ ویرایش دیده می‌شود، که جای درستش است.
                // انگلیسی پلِ میان‌زبانی است (R-I18N-15) — همان قاعدهٔ tagName().
                cell: (t) => t.nameI18n?.[locale] || t.nameI18n?.en || t.name,
              },
              {
                header: 'رنگ',
                cell: (t) => t.color
                  ? <span className="inline-block size-4 rounded" style={{ backgroundColor: t.color }} />
                  : '—',
              },
              /*
                ⚠️ برچسبِ خوانا، نه کلیدِ خام: ستون پیش‌تر `in_progress` نشان
                می‌داد، که برای کسی که اسکیما را ندیده هیچ معنایی ندارد.
                عنوانِ ستون هم با نوعِ تگ عوض می‌شود، چون معنای مقدار
                عوض می‌شود.
              */
              // ⚠️ نقشِ عضو و اولویت گروه ندارند؛ ستون برایشان کشیده نمی‌شود
              // به‌جای اینکه سرستونِ بی‌معنا و ستونی پر از «—» بگیرد.
              ...(groupChoices(tagType).length > 0
                ? [{
                    header: groupFieldLabel(tagType),
                    // ⚠️ برچسب‌های `groups.ts` ثابتِ فارسی‌اند — کلیدِ ترجمه‌اند،
                    // نه متنِ نهایی.
                    cell: (t: { statusGroup: string }) => {
                      const found = groupChoices(tagType).find((c) => c.value === t.statusGroup);
                      return found ? tr(found.label) : (t.statusGroup || '—');
                    },
                  }]
                : []),
              ...(supportsGrant(tagType)
                ? [{
                    header: 'دسترسی',
                    // ⚠️ برچسبِ ثابتِ فارسی است؛ بدونِ tr() در هر زبانی فارسی می‌ماند.
                    cell: (t: { grantsCap: string }) => {
                      const found = GRANTABLE_CAPS.find((c) => c.value === t.grantsCap);
                      return found ? tr(found.label) : '—';
                    },
                  }]
                : []),
              ...(supportsClosed(tagType)
                ? [{
                    header: 'تمام‌شده',
                    cell: (t: { isClosed: boolean }) => (t.isClosed ? '✓' : '—'),
                  }]
                : []),
              { header: 'ترتیب', cell: (t) => t.sortOrder, numeric: true },
            ]}
            saveAction={saveTagAction}
            deleteAction={(t) => deleteTagAction(t.id)}
            renderForm={(editing) => (
              <>
                <input type="hidden" name="type" value={tagType} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="grid gap-1.5">
                    <Label htmlFor="t-name">{tr("نام")}</Label>
                    <Input id="t-name" name="name" defaultValue={editing?.name ?? ''} required />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="t-sort">{tr("ترتیب")}</Label>
                    <Input id="t-sort" name="sortOrder" type="number" className="num" defaultValue={editing?.sortOrder ?? 0} />
                  </div>
                </div>

                <div className="grid gap-1.5">
                  <Label htmlFor="t-color">{tr("رنگ")}</Label>
                  <ColorPicker id="t-color" name="color" defaultValue={editing?.color || '#6c5ce7'} />
                </div>

                {/*
                  ⚠️ `status_group` معنایش با نوعِ تگ عوض می‌شود: ستونِ کانبان،
                  تبِ خط‌لوله، یا جهتِ حسابداری. پیش‌تر یک ورودیِ متنیِ آزاد
                  بود و کاربر باید رشته‌هایی مثل `in_progress` را از بر
                  می‌بود — عملاً غیرقابلِ استفاده.
                */}
                {groupChoices(tagType).length > 0 && (
                  <div className="grid gap-1.5">
                    <Label htmlFor="t-group">{tr(groupFieldLabel(tagType))}</Label>
                    <select
                      id="t-group" name="statusGroup" className={tagSelectClass}
                      defaultValue={editing?.statusGroup ?? ''}
                    >
                      {groupChoices(tagType).map((c) => (
                        <option key={c.value || 'none'} value={c.value}>{tr(c.label)}</option>
                      ))}
                    </select>
                  </div>
                )}

                {(supportsClosed(tagType) || supportsReview(tagType)) && (
                  <div className="grid gap-2 rounded-md border p-3">
                    {supportsClosed(tagType) && (
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox" name="isClosed" value="1"
                          defaultChecked={editing?.isClosed ?? false}
                          className="size-4 accent-primary"
                        />
                        {tagType === 'task_status'
                          ? tr("این وضعیت یعنی تسک تمام‌شده است")
                          : tr("این وضعیت یعنی پروژه بسته شده است")}
                      </label>
                    )}
                    {supportsReview(tagType) && (
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox" name="isReview" value="1"
                          defaultChecked={editing?.isReview ?? false}
                          className="size-4 accent-primary"
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
                <details className="rounded-md border p-2">
                  <summary className="cursor-pointer text-sm">
                    {tr("ترجمهٔ نام به زبان‌های دیگر")}
                  </summary>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {LOCALES.filter((l) => l !== DEFAULT_LOCALE).map((code) => (
                      <div key={code} className="grid gap-1">
                        <Label htmlFor={`t-name-${code}`} className="text-xs">
                          {LOCALE_NAMES[code]}
                        </Label>
                        <Input
                          id={`t-name-${code}`}
                          name={`name-${code}`}
                          defaultValue={editing?.nameI18n?.[code] ?? ''}
                          placeholder={editing?.name ?? ''}
                          dir={isRtl(code) ? 'rtl' : 'ltr'}
                        />
                      </div>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {tr("خالی یعنی همان نامِ اصلی دیده می‌شود.")}
                  </p>
                </details>

                {/*
                  ⚠️ فقط تگِ **نقشِ عضو** می‌تواند دسترسی بدهد: این تگ همان
                  چیزی است که عضو با آن روی پروژه امضا می‌شود، و اختیارِ
                  «مدیرِ پروژه» از همان‌جا می‌آید (R-RBAC-12).
                */}
                {supportsGrant(tagType) && (
                  <div className="grid gap-1.5">
                    <Label htmlFor="t-cap">{tr("دسترسی‌ای که این نقش می‌دهد")}</Label>
                    <select
                      id="t-cap"
                      name="grantsCap"
                      defaultValue={editing?.grantsCap ?? ''}
                      className={tagSelectClass}
                    >
                      {GRANTABLE_CAPS.map((c) => (
                        <option key={c.value || 'none'} value={c.value}>{tr(c.label)}</option>
                      ))}
                    </select>
                    <p className="text-xs text-muted-foreground">
                      {tr("دسترسی را اضافه می‌کند؛ هرگز چیزی را پس نمی‌گیرد.")}
                    </p>
                  </div>
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
              <div className="grid gap-1.5">
                <Label htmlFor="o-name">{tr("نام")}</Label>
                <Input id="o-name" name="name" defaultValue={editing?.name ?? ''} required />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="o-loc">{tr("مکان")}</Label>
                <Input id="o-loc" name="location" defaultValue={editing?.location ?? ''} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="o-cur">{tr("ارزِ پیش‌فرض")}</Label>
                <select
                  id="o-cur"
                  name="defaultCurrencyId"
                  className={field}
                  defaultValue={editing?.defaultCurrencyId ? String(editing.defaultCurrencyId) : ''}
                >
                  <option value="">{tr("— هیچ‌کدام —")}</option>
                  {data.currencies.map((c) => (
                    <option key={c.id} value={c.id}>{c.code}</option>
                  ))}
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm sm:col-span-3">
                <input
                  type="checkbox" name="isActive"
                  defaultChecked={editing ? editing.isActive : true}
                  className="size-4 accent-primary"
                />
                {tr("فعال")}
              </label>
            </div>
          )}
        />
      )}

      {tab === 'vendors' && (
        <CatalogSection
          title={tr("طرف‌حساب‌ها")}
          description={tr("فروشندگان و طرف‌حساب‌های هزینه.")}
          addLabel="افزودن طرف‌حساب"
          rows={data.vendors}
          columns={[
            { header: 'نام', cell: (v) => v.name },
            { header: 'یادداشت', cell: (v) => v.note || '—' },
          ]}
          saveAction={saveVendorAction}
          deleteAction={(v) => deleteVendorAction(v.id)}
          renderForm={(editing) => (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="v-name">{tr("نام")}</Label>
                <Input id="v-name" name="name" defaultValue={editing?.name ?? ''} required />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="v-note">{tr("یادداشت")}</Label>
                <Input id="v-note" name="note" defaultValue={editing?.note ?? ''} />
              </div>
            </div>
          )}
        />
      )}

      {tab === 'qa' && (
        <CatalogSection
          title={tr("کتابخانهٔ QA")}
          description={tr("آیتمِ «تسک‌ساز» هنگامِ اعمال یک تسکِ واقعی می‌سازد (R-PROJ-18).")}
          addLabel="افزودن آیتم"
          rows={data.qaItems}
          columns={[
            { header: 'عنوان', cell: (q) => q.title },
            {
              header: 'نقش',
              cell: (q) => data.tags.find((t) => t.id === q.roleTagId)?.name ?? tr('کارفرما'),
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
                <div className="grid gap-1.5 sm:col-span-2">
                  <Label htmlFor="q-title">{tr("عنوان")}</Label>
                  <Input id="q-title" name="title" defaultValue={editing?.title ?? ''} required />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="q-role">{tr("نقش")}</Label>
                  <select
                    id="q-role"
                    name="roleTagId"
                    className={field}
                    defaultValue={editing?.roleTagId ? String(editing.roleTagId) : ''}
                  >
                    {/* R-QA-02 — نقشِ خالی یعنی مخاطبِ «کارفرما». */}
                    <option value="">{tr("کارفرما")}</option>
                    {data.tags.filter((t) => t.type === 'member_role').map((t) => (
                      <option key={t.id} value={t.id}>{t.nameI18n?.[locale] || t.nameI18n?.en || t.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="q-desc">{tr("توضیحات")}</Label>
                <Input id="q-desc" name="description" defaultValue={editing?.description ?? ''} />
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="isTask"
                    defaultChecked={editing?.isTask ?? false}
                    className="size-4 accent-primary"
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
      )}

      {tab === 'staff' && <StaffSection staff={data.staff} candidates={data.staffCandidates} />}


      {tab === 'company' && data.company && <CompanySection company={data.company} />}

      {/*
        ⚠️ گزارشِ روزانه زیرِ «سامانه» است، نه تبِ جدا: هر دو تنظیمِ خودِ
        سامانه‌اند و هر دو به زمان‌بند وابسته‌اند — جداکردنشان یعنی کاربر
        برای یک کار در دو تب می‌گشت.
      */}
      {tab === 'system' && (
        <div className="grid gap-6">
          <SystemSection config={data.systemConfig} health={data.health} isOwner={data.isOwner} telegram={data.telegram} />
          {data.isOwner && (
            <>
              <Separator />
              <ReportSection config={data.reportConfig} />
            </>
          )}
        </div>
      )}

      {tab === 'fiscal' && <FiscalSection lockDate={data.lockDate} today={data.today} />}
    </div>
  );
}
