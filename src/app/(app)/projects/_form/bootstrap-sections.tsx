'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Combobox, MultiSelect, type Option as ComboOption } from '@/components/ui/combobox';
import type { Option } from './project-dialog';
import { useT } from '@/i18n/client';

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
      <h3 className="text-sm font-medium">{children}</h3>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function RemoveButton({ onClick }: { onClick: () => void }) {
  const tr = useT();
  return (
    <button
      type="button"
      aria-label={tr("حذفِ ردیف")}
      onClick={onClick}
      className="rounded-md p-1.5 text-muted-foreground hover:bg-muted"
    >
      <X className="size-3.5" />
    </button>
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
}: {
  options: BootstrapOptions;
  /** پروژهٔ تعدادی ← «نرخِ هر واحد» به‌جای «مبلغِ توافقی» (R-FORM ِ اعضا). */
  isUnitBased: boolean;
}) {
  const tr = useT();
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [clientIds, setClientIds] = useState<number[]>([]);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [qaRoles, setQaRoles] = useState<number[]>([]);
  const [qaClient, setQaClient] = useState(false);

  const defaultCurrency = options.defaultCurrencyId ? String(options.defaultCurrencyId) : '';

  const [tab, setTab] = useState<'team' | 'tasks' | 'qa' | 'files'>('team');
  /** نقش‌های امضاشده روی یک فرد؛ بدونِ انتخابِ فرد، خالی. */
  const rolesFor = (userId: number | null) => {
    if (userId === null) return [];
    const mine = new Set(options.memberRoles[userId] ?? []);
    return options.roleTags.filter((t) => mine.has(t.id));
  };

  const roleOptions: ComboOption[] = options.roleTags.map((t) => ({ value: t.id, label: t.label }));

  return (
    <div className="grid gap-5 rounded-md border p-3">
      <p className="text-xs text-muted-foreground">
        {tr("این بخش‌ها اختیاری‌اند و بلافاصله پس از ساختِ پروژه اعمال می‌شوند.")}
      </p>

      {/*
        ⚠️ تب‌بندی مثلِ نسخهٔ قبلی: ساختِ پروژه پنج بخش دارد و پشتِ‌سرِ هم
        چیدنشان یعنی برای رسیدن به «فایل‌ها» باید از تسک‌ها و QA رد شوی.

        ⚠️ همهٔ پنل‌ها در DOM می‌مانند و فقط پنهان می‌شوند — با unmount
        کردنِ تبِ غیرفعال، ورودی‌هایش از FormData بیرون می‌افتادند و
        ساختِ پروژه بی‌صدا آن بخش را نادیده می‌گرفت.
      */}
      <div className="flex flex-wrap gap-1 border-b">
        {([
          ['team', tr('تیم')],
          ['tasks', tr('تسک‌ها')],
          ['qa', tr('QA')],
          ['files', tr('فایل‌ها')],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`-mb-px border-b-2 px-3 py-1.5 text-sm transition ${
              tab === key
                ? 'border-primary font-medium text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className={tab === "team" ? "grid gap-5" : "hidden"}>
      {/* ------------------------------------------------ اعضا */}
      <section className="grid gap-2">
        <SectionTitle hint={tr("نقش و مبلغِ توافقیِ هر عضو. مبلغ خالی یعنی صفر.")}>{tr("اعضا")}</SectionTitle>

        {members.map((row, i) => (
          <div key={i} className="grid gap-2 rounded-md border border-dashed p-2 sm:grid-cols-[1fr_auto]">
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

              <select
                name="memberRole"
                value={row.roleTagId}
                onChange={(e) => setMembers((rows) => rows.map((r, j) =>
                  (j === i ? { ...r, roleTagId: e.target.value } : r)))}
                className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
              >
                <option value="">{tr("— نقش —")}</option>
                {/*
                  ⚠️ فقط نقش‌هایی که روی **خودِ این فرد** امضا شده‌اند.
                  پیش‌تر همهٔ نقش‌های سامانه می‌آمد و می‌شد کسی را با نقشی
                  روی پروژه گذاشت که اصلاً آن را ندارد — و بعد گزارشِ
                  «کارکرد بر حسبِ نقش» چیزی می‌گفت که در واقعیت نبود.

                  ⚠️ تا وقتی عضوی انتخاب نشده، فهرست خالی است نه کامل:
                  فهرستِ کامل یعنی دعوت به انتخابی که بعداً رد می‌شود.
                */}
                {rolesFor(row.userId).map((t) => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>

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

              <select
                name="memberCurrency"
                value={row.currencyId}
                onChange={(e) => setMembers((rows) => rows.map((r, j) =>
                  (j === i ? { ...r, currencyId: e.target.value } : r)))}
                className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
              >
                <option value="">{tr("— ارز —")}</option>
                {options.currencies.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
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

      <div className={tab === "tasks" ? "grid gap-5" : "hidden"}>
      {/* ------------------------------------------------ تسک‌های اولیه */}
      <section className="grid gap-2">
        <SectionTitle hint={tr("به یک یا چند نقش سپرده می‌شوند، نه به یک فرد.")}>
          {tr("تسک‌های اولیه")}
        </SectionTitle>

        {tasks.map((row, i) => (
          <div key={i} className="grid gap-2 rounded-md border border-dashed p-2">
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
              <MultiSelect
                options={roleOptions}
                selected={row.roleTagIds}
                onChange={(next) => setTasks((rows) => rows.map((r, j) =>
                  (j === i ? { ...r, roleTagIds: next } : r)))}
                placeholder={tr("نقش‌ها…")}
              />
              <Input
                name="taskDue"
                type="date"
                className="num"
                value={row.due}
                onChange={(e) => setTasks((rows) => rows.map((r, j) =>
                  (j === i ? { ...r, due: e.target.value } : r)))}
              />
              <select
                name="taskPriority"
                value={row.priorityTagId}
                onChange={(e) => setTasks((rows) => rows.map((r, j) =>
                  (j === i ? { ...r, priorityTagId: e.target.value } : r)))}
                className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
              >
                <option value="">{tr("— اولویت —")}</option>
                {options.priorities.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
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
              <input
                type="checkbox"
                checked={row.toClient}
                onChange={(e) => setTasks((rows) => rows.map((r, j) =>
                  (j === i ? { ...r, toClient: e.target.checked } : r)))}
                className="size-3.5 accent-primary"
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

      <div className={tab === "qa" ? "grid gap-5" : "hidden"}>
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
          <label className="flex items-center gap-1.5 text-xs">
            <input
              type="checkbox"
              name="qaClient"
              checked={qaClient}
              onChange={(e) => setQaClient(e.target.checked)}
              className="size-3.5 accent-primary"
            />
            {tr("آیتم‌های کارفرما هم اضافه شوند")}
          </label>
        </section>
      )}

      </div>

      <div className={tab === "files" ? "grid gap-5" : "hidden"}>
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
