'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FormFileDrop } from '@/components/media/form-file-drop';
import { Input } from '@/components/ui/input';
import { Combobox, MultiSelect, type Option as ComboOption } from '@/components/ui/combobox';
import type { Option } from './project-dialog';
import { useT } from '@/i18n/client';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Checkbox } from '@/components/ui/checkbox';
import { DatePicker } from '@/components/ui/date-picker';
import { TagChip } from '@/components/ui/tag-chip';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

export interface BootstrapOptions {
  /** اعضای قابلِ افزودن — نامِ فرد به‌علاوهٔ ایمیل برای تفکیکِ هم‌نام‌ها. */
  people: ComboOption[];
  clients: ComboOption[];
  roleTags: Option[];
  priorities: Option[];
  currencies: Option[];
  defaultCurrencyId: number | null;
  /** آیا کتابخانهٔ QA چیزی دارد؟ تبِ خالی نشان داده نمی‌شود. */
  hasQaLibrary: boolean;
  /**
   * آیتم‌های کتابخانه — فقط برای پیش‌نمایشِ «چه چیزی اضافه می‌شود» (پورتِ
   * پیش‌نمایشِ فرمِ ساختِ نسخهٔ قبلی). `roleTagId` صفر یعنی «کارفرما».
   */
  qaItems?: Array<{ id: number; title: string; roleTagId: number; isTask: boolean }>;
  /** نقش‌های امضاشده روی هر عضو — `{ userId: tagId[] }`. */
  memberRoles: Record<number, number[]>;
}

interface MemberRow {
  userId: number | null;
  label: string;
  roleTagId: string;
  agreed: string;
  unitRate: string;
  currencyId: string;
}

interface TaskRow {
  title: string;
  roleTagIds: number[];
  toClient: boolean;
  due: string;
  priorityTagId: string;
}

interface LinkRow {
  url: string;
  label: string;
}

function SectionTitle({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <h3 className="text-sm font-semibold">{children}</h3>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/**
 * انتخابگرِ فایلِ فرمِ پروژه (۲.۱۹.۰) — همان کادرِ «رها کن یا بچسبان» ِ بازبینی
 * (`FormFileDrop`): کلیک، چسباندنِ اسکرین‌شات و کشیدن‌ورهاکردن؛ انتخاب‌ها روی هم
 * انباشته می‌شوند، هر کدام پیش‌نمایش و حذف دارد، و فایل‌ها در ورودیِ نام‌دارِ
 * همین فرم می‌نشینند تا `FormData` بدونِ تغییرِ سمتِ سرور بخواندشان.
 *
 * `accept` که با «image/» شروع شود یعنی فقط تصویر (تصویرِ شاخص). `multiple={false}`:
 * فایلِ تازه جایگزینِ قبلی می‌شود.
 */
export function FilePicker({
  name,
  accept,
  multiple = true,
  compact = false,
}: {
  name: string;
  accept?: string;
  multiple?: boolean;
  /** برای جاهایی که کنارِ چیز دیگری است (تصویرِ شاخص). */
  compact?: boolean;
}) {
  return (
    <FormFileDrop name={name} multiple={multiple} imagesOnly={Boolean(accept?.startsWith('image/'))} compact={compact} />
  );
}

function RemoveButton({ onClick }: { onClick: () => void }) {
  const tr = useT();
  return (
    <Button
      type="button"
      aria-label={tr("حذفِ ردیف")}
      onClick={onClick} variant="ghost" size="icon-sm" className="text-muted-foreground"
    >
      <X className="size-3.5" />
    </Button>
  );
}

/**
 * بخش‌هایی که فرمِ **ساخت** پروژه جمع می‌کند و سرویس بعد از ساخت اعمالشان
 * می‌کند (`bootstrapProject`): اعضا، کارفرمایان، تسک‌های اولیه، چک‌لیستِ QA
 * و لینک‌های بیرونی — دقیقاً همان چیزی که `handle()` ِ نسخهٔ قبلی پس از
 * یک‌جا انجام می‌شود.
 *
 * ⚠️ فقط در حالتِ **ساخت** نشان داده می‌شود. در ویرایش، هر کدام تبِ اختصاصیِ
 * خودش را دارد و نمایشِ دوباره‌شان اینجا یعنی دو منبعِ حقیقت.
 *
 * ⚠️ همهٔ فیلدهای انتخابِ فرد جستجوی زنده دارند: فهرستِ اعضا در تیمِ واقعی
 * ده‌ها نفر است و select ِ ساده عملاً غیرقابلِ استفاده می‌شود.
 */
export function BootstrapSections({
  options,
  isUnitBased,
  only,
}: {
  options: BootstrapOptions;
  /** پروژهٔ تعدادی ← «نرخِ هر واحد» به‌جای «مبلغِ توافقی» (R-FORM ِ اعضا). */
  isUnitBased: boolean;
  /**
   * کدام بخش دیده شود. نوارِ تب **در خودِ مودال** است تا با تبِ «اطلاعات»
   * یک نوارِ واحد بسازد — همان ساختارِ نسخهٔ قبلی، نه تبِ تودرتو.
   *
   * ⚠️ بخش‌های دیگر پنهان می‌شوند نه unmount: با unmount، ورودی‌هایشان از
   * FormData بیرون می‌افتند و آن بخش بی‌صدا نادیده گرفته می‌شود.
   */
  only: 'team' | 'tasks' | 'qa' | 'files';
}) {
  const tr = useT();
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [clientIds, setClientIds] = useState<number[]>([]);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [qaRoles, setQaRoles] = useState<number[]>([]);
  const [qaClient, setQaClient] = useState(false);

  const defaultCurrency = options.defaultCurrencyId ? String(options.defaultCurrencyId) : '';

  /** نقش‌های امضاشده روی یک فرد؛ بدونِ انتخابِ فرد، خالی. */
  const rolesFor = (userId: number | null) => {
    if (userId === null) return [];
    const mine = new Set(options.memberRoles[userId] ?? []);
    return options.roleTags.filter((t) => mine.has(t.id));
  };

  const roleOptions: ComboOption[] = options.roleTags.map((t) => ({ value: t.id, label: t.label }));

  return (
    <div className="grid gap-5">

      <div className={only === "team" ? "grid gap-5" : "hidden"}>
      {/* ------------------------------------------------ اعضا */}
      <section className="grid gap-2">
        <SectionTitle hint={tr("نقش و مبلغِ توافقیِ هر عضو. مبلغ خالی یعنی صفر.")}>{tr("اعضا")}</SectionTitle>

        {members.map((row, i) => (
          <div key={i} className="grid gap-2 rounded-lg border border-dashed p-3 sm:grid-cols-[1fr_auto]">
            <div className="grid gap-2 sm:grid-cols-2">
              <Combobox
                options={options.people}
                value={{ id: row.userId, label: row.label }}
                onChange={(next) => setMembers((rows) => rows.map((r, j) =>
                  (j === i ? { ...r, userId: next.id, label: next.label } : r)))}
                placeholder={tr("جستجوی عضو…")}
              />
              {/*
                ⚠️ همیشه فرستاده می‌شود — حتی خالی. ردیف‌های موازی باید
                هم‌طول بمانند وگرنه نقشِ ردیفِ دوم به عضوِ ردیفِ سوم می‌چسبد.
                ردیفِ بی‌عضو را سرور دور می‌ریزد.
              */}
              <input type="hidden" name="memberUser" value={row.userId ?? ''} />

              <NativeSelect
                name="memberRole"
                value={row.roleTagId}
                onChange={(e) => setMembers((rows) => rows.map((r, j) =>
                  (j === i ? { ...r, roleTagId: e.target.value } : r)))}
              >
                <NativeSelectOption value="">{tr("— نقش —")}</NativeSelectOption>
                {/*
                  ⚠️ فقط نقش‌هایی که روی **خودِ این فرد** امضا شده‌اند.
                  پیش‌تر همهٔ نقش‌های سامانه می‌آمد و می‌شد کسی را با نقشی
                  روی پروژه گذاشت که اصلاً آن را ندارد — و بعد گزارشِ
                  «کارکرد بر حسبِ نقش» چیزی می‌گفت که در واقعیت نبود.

                  ⚠️ تا وقتی عضوی انتخاب نشده، فهرست خالی است نه کامل:
                  فهرستِ کامل یعنی دعوت به انتخابی که بعداً رد می‌شود.
                */}
                {rolesFor(row.userId).map((t) => (
                  <NativeSelectOption key={t.id} value={t.id}>{t.label}</NativeSelectOption>
                ))}
              </NativeSelect>

              {/*
                ⚠️ «مبلغِ توافقی» و «نرخِ هر واحد» جای هم را می‌گیرند، نه اینکه
                کنارِ هم بنشینند: در پروژهٔ تعدادی دستمزد = نرخ × تعداد و مبلغِ
                ثابت بی‌معناست. هر دو نام همیشه فرستاده می‌شوند تا ردیف‌ها
                هم‌طول بمانند.
              */}
              {isUnitBased ? (
                <>
                  <Input
                    name="memberUnitRate"
                    inputMode="decimal"
                    className="num"
                    placeholder={tr("نرخِ هر واحد")}
                    value={row.unitRate}
                    onChange={(e) => setMembers((rows) => rows.map((r, j) =>
                      (j === i ? { ...r, unitRate: e.target.value } : r)))}
                  />
                  <input type="hidden" name="memberAgreed" value="" />
                </>
              ) : (
                <>
                  <Input
                    name="memberAgreed"
                    inputMode="decimal"
                    className="num"
                    placeholder={tr("مبلغِ توافقی")}
                    value={row.agreed}
                    onChange={(e) => setMembers((rows) => rows.map((r, j) =>
                      (j === i ? { ...r, agreed: e.target.value } : r)))}
                  />
                  <input type="hidden" name="memberUnitRate" value="" />
                </>
              )}

              <NativeSelect
                name="memberCurrency"
                value={row.currencyId}
                onChange={(e) => setMembers((rows) => rows.map((r, j) =>
                  (j === i ? { ...r, currencyId: e.target.value } : r)))}
              >
                <NativeSelectOption value="">{tr("— ارز —")}</NativeSelectOption>
                {options.currencies.map((c) => (
                  <NativeSelectOption key={c.id} value={c.id}>{c.label}</NativeSelectOption>
                ))}
              </NativeSelect>
            </div>

            <div className="flex items-start">
              <RemoveButton onClick={() => setMembers((rows) => rows.filter((_, j) => j !== i))} />
            </div>
          </div>
        ))}

        <div>
          <Button
            type="button" size="sm" variant="outline"
            onClick={() => setMembers((rows) => [...rows, {
              userId: null, label: '', roleTagId: '', agreed: '',
              unitRate: '', currencyId: defaultCurrency,
            }])}
          >
            {tr("افزودنِ عضو")}
          </Button>
        </div>
      </section>

      {/* ------------------------------------------------ کارفرما */}
      <section className="grid gap-2">
        <SectionTitle hint={tr("کارفرمای نخست، مخاطبِ تسک‌هایی است که به «کارفرما» سپرده می‌شوند.")}>
          {tr("کارفرمایان")}
        </SectionTitle>
        <MultiSelect
          options={options.clients}
          selected={clientIds}
          onChange={setClientIds}
          placeholder={tr("افزودنِ کارفرما…")}
          name="clientId"
        />
      </section>

      </div>

      <div className={only === "tasks" ? "grid gap-5" : "hidden"}>
      {/* ------------------------------------------------ تسک‌های اولیه */}
      <section className="grid gap-2">
        <SectionTitle hint={tr("به یک یا چند نقش سپرده می‌شوند، نه به یک فرد.")}>
          {tr("تسک‌های اولیه")}
        </SectionTitle>

        {tasks.map((row, i) => (
          <div key={i} className="grid gap-2 rounded-lg border border-dashed p-3">
            <div className="flex items-start gap-2">
              <Input
                name="taskTitle"
                placeholder={tr("عنوانِ تسک")}
                value={row.title}
                onChange={(e) => setTasks((rows) => rows.map((r, j) =>
                  (j === i ? { ...r, title: e.target.value } : r)))}
              />
              <RemoveButton onClick={() => setTasks((rows) => rows.filter((_, j) => j !== i))} />
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
              {/*
                ⚠️ تسکِ کارفرما نقشِ تیمی ندارد: در نسخهٔ قبلی هم «سپردن به
                کارفرما» یعنی صاحبِ کار کارفرماست. پس وقتی تیک خورد، فیلد
                جای خود را به یادداشت می‌دهد و نقش‌های انتخاب‌شده پاک
                می‌شوند — وگرنه تسک هم‌زمان به تیم و کارفرما سپرده می‌شد.
              */}
              {row.toClient ? (
                <div className="flex h-9 items-center rounded-md border border-dashed px-3 text-xs text-muted-foreground">
                  {tr("سپرده‌شده به کارفرما")}
                </div>
              ) : (
                <MultiSelect
                  options={roleOptions}
                  selected={row.roleTagIds}
                  onChange={(next) => setTasks((rows) => rows.map((r, j) =>
                    (j === i ? { ...r, roleTagIds: next } : r)))}
                  placeholder={tr("نقش‌ها…")}
                />
              )}
              <DatePicker
                name="taskDue"
                value={row.due}
                onChange={(v) => setTasks((rows) => rows.map((r, j) =>
                  (j === i ? { ...r, due: v } : r)))}
              />
              <NativeSelect
                name="taskPriority"
                value={row.priorityTagId}
                onChange={(e) => setTasks((rows) => rows.map((r, j) =>
                  (j === i ? { ...r, priorityTagId: e.target.value } : r)))}
              >
                <NativeSelectOption value="">{tr("— اولویت —")}</NativeSelectOption>
                {options.priorities.map((p) => (
                  <NativeSelectOption key={p.id} value={p.id}>{p.label}</NativeSelectOption>
                ))}
              </NativeSelect>
            </div>

            {/*
              ⚠️ نقش‌ها به‌صورتِ یک رشتهٔ کاما-جدا فرستاده می‌شوند تا ردیف‌ها
              هم‌طول بمانند؛ همان کاری که نسخهٔ قبلی با می‌کند.
              توکنِ «client» عمداً در همان رشته است، چون «کارفرما» یک نقشِ
              انتخابی است نه یک فیلدِ جدا.
            */}
            <input
              type="hidden"
              name="taskRoles"
              value={[...row.roleTagIds.map(String), ...(row.toClient ? ['client'] : [])].join(',')}
            />

            <label className="flex items-center gap-1.5 text-xs">
              <Checkbox
                checked={row.toClient}
                onCheckedChange={(c) => setTasks((rows) => rows.map((r, j) =>
                  // تیکِ کارفرما نقش‌های تیمی را پاک می‌کند.
                  (j === i
                    ? { ...r, toClient: (c === true), roleTagIds: (c === true) ? [] : r.roleTagIds }
                    : r)))}
              />
              {tr("سپردن به کارفرما")}
            </label>
          </div>
        ))}

        <div>
          <Button
            type="button" size="sm" variant="outline"
            onClick={() => setTasks((rows) => [...rows, {
              title: '', roleTagIds: [], toClient: false, due: '', priorityTagId: '',
            }])}
          >
            {tr("افزودنِ تسک")}
          </Button>
        </div>
      </section>

      </div>

      <div className={only === "qa" ? "grid gap-5" : "hidden"}>
      {/* ------------------------------------------------ چک‌لیستِ QA */}
      {options.hasQaLibrary && (
        <section className="grid gap-2">
          <SectionTitle hint={tr("آیتم‌های کتابخانهٔ QA برای نقش‌های انتخاب‌شده کپی می‌شوند.")}>
            {tr("چک‌لیستِ کیفیت")}
          </SectionTitle>
          <MultiSelect
            options={roleOptions}
            selected={qaRoles}
            onChange={setQaRoles}
            placeholder={tr("نقش‌های چک‌لیست…")}
            name="qaRole"
          />
          {/* ⚠️ چک‌لیستِ QA معمولاً برای **همهٔ** نقش‌ها لازم است؛ انتخابِ
              یکی‌یکیِ ده نقش کارِ تکراری بود. */}
          <div className="flex gap-2">
            {/* «همه» یعنی کارفرما هم — وگرنه دکمه نیمی از کار را می‌کرد و
                کاربر بعدش هم باید تیکِ کارفرما را جدا می‌زد. */}
            <Button
              type="button" size="sm" variant="outline"
              disabled={qaRoles.length === roleOptions.length && qaClient}
              onClick={() => { setQaRoles(roleOptions.map((o) => o.value)); setQaClient(true); }}
            >
              {tr("انتخابِ همه")}
            </Button>
            <Button
              type="button" size="sm" variant="ghost"
              disabled={qaRoles.length === 0 && !qaClient}
              onClick={() => { setQaRoles([]); setQaClient(false); }}
            >
              {tr("پاک‌کردنِ همه")}
            </Button>
          </div>
          <label className="flex items-center gap-1.5 text-xs">
            <Checkbox
              name="qaClient"
              checked={qaClient}
              onCheckedChange={(c) => setQaClient(c === true)}
            />
            {tr("آیتم‌های کارفرما هم اضافه شوند")}
          </label>
          <QaPreview
            items={options.qaItems ?? []}
            roles={qaRoles}
            client={qaClient}
            roleName={(id) => (id === 0 ? tr('کارفرما') : roleOptions.find((o) => o.value === id)?.label ?? '')}
          />
        </section>
      )}

      </div>

      <div className={only === "files" ? "grid gap-5" : "hidden"}>
      {/* ------------------------------------------------ فایل‌های محلی */}
      <section className="grid gap-2">
        <SectionTitle hint={tr("پس از ساختِ پروژه آپلود می‌شوند.")}>
          {tr("فایل‌های پروژه")}
        </SectionTitle>
        {/*
          ⚠️ `multiple` و نامِ یکسان: `formData.getAll('attachmentFile')` همهٔ
          فایل‌ها را با هم می‌گیرد. پیش از این فقط لینکِ بیرونی ممکن بود و
          کاربر باید پروژه را می‌ساخت، بازش می‌کرد و از تبِ فایل‌ها دوباره
          آپلود می‌کرد.
        */}
        <FilePicker name="attachmentFile" />
      </section>

      {/* ------------------------------------------------ لینک‌ها */}
      <section className="grid gap-2">
        <SectionTitle hint={tr("فایل روی سرور آورده نمی‌شود؛ فقط نشانی ذخیره می‌شود.")}>
          {tr("لینک‌های بیرونی")}
        </SectionTitle>

        {links.map((row, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <Input
              name="linkUrl"
              type="url"
              dir="ltr"
              className="min-w-56 flex-1"
              placeholder="https://…"
              value={row.url}
              onChange={(e) => setLinks((rows) => rows.map((r, j) =>
                (j === i ? { ...r, url: e.target.value } : r)))}
            />
            <Input
              name="linkLabel"
              className="w-40"
              placeholder={tr("برچسب")}
              value={row.label}
              onChange={(e) => setLinks((rows) => rows.map((r, j) =>
                (j === i ? { ...r, label: e.target.value } : r)))}
            />
            <RemoveButton onClick={() => setLinks((rows) => rows.filter((_, j) => j !== i))} />
          </div>
        ))}

        <div>
          <Button
            type="button" size="sm" variant="outline"
            onClick={() => setLinks((rows) => [...rows, { url: '', label: '' }])}
          >
            {tr("افزودنِ لینک")}
          </Button>
        </div>
      </section>
      </div>

    </div>
  );
}

/**
 * پیش‌نمایشِ چک‌لیستِ QA پیش از ساخت — کدام آیتم‌ها برای نقش‌های انتخاب‌شده
 * اضافه می‌شوند، جدا در «تسک‌ها» (کارِ واقعی روی تخته) و «چک‌لیست».
 * ⚠️ پیش از این فقط انتخابِ نقش بود و کاربر تا بعد از ساخت نمی‌دید چه چیزی
 * و چند تسک به پروژه اضافه می‌شود.
 */
function QaPreview({
  items,
  roles,
  client,
  roleName,
}: {
  items: NonNullable<BootstrapOptions['qaItems']>;
  roles: number[];
  client: boolean;
  roleName: (id: number) => string;
}) {
  const tr = useT();
  const picked = items.filter((i) => (i.roleTagId === 0 ? client : roles.includes(i.roleTagId)));
  const taskItems = picked.filter((i) => i.isTask);
  const checkItems = picked.filter((i) => !i.isTask);
  const [view, setView] = useState<'tasks' | 'checklist'>('tasks');
  if (picked.length === 0) return null;
  const list = view === 'tasks' ? taskItems : checkItems;
  return (
    <div className="grid gap-2 rounded-lg bg-muted/60 p-3">
      <Tabs value={view} onValueChange={(v) => setView(v as typeof view)}>
        <TabsList className="w-max">
          <TabsTrigger value="tasks" className="flex-none gap-1.5 px-3">
            {tr('تسک‌ها')}
            <span className="num text-xs text-muted-foreground">{taskItems.length}</span>
          </TabsTrigger>
          <TabsTrigger value="checklist" className="flex-none gap-1.5 px-3">
            {tr('چک‌لیست')}
            <span className="num text-xs text-muted-foreground">{checkItems.length}</span>
          </TabsTrigger>
        </TabsList>
      </Tabs>
      {list.length === 0 ? <p className="text-xs text-muted-foreground">{tr('موردی نیست.')}</p> : (
        <ul className="grid max-h-56 gap-1 overflow-y-auto">
          {list.map((i) => (
            <li key={i.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="min-w-0 truncate">{i.title}</span>
              <TagChip>{roleName(i.roleTagId)}</TagChip>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
