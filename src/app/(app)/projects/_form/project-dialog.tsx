'use client';

import { useActionState, useEffect, useId, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { X } from 'lucide-react';
import { createProjectAction, updateProjectAction } from './actions';
import type { FormState } from './schema';
import { BootstrapSections, type BootstrapOptions } from './bootstrap-sections';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { useT } from '@/i18n/client';

export interface Option {
  id: number;
  label: string;
}

export interface FormOptions {
  statuses: Option[];
  currencies: Option[];
  offices: Option[];
  parents: Option[];
  defaultCurrencyId: number | null;
  canUsePrivate: boolean;
  today: string;
  /** تگ‌های نقشِ عضو — برای جدولِ نقشِ مناقصه. */
  roleTags: Option[];
  /** فقط در حالتِ ساخت لازم است؛ در ویرایش هر بخش تبِ خودش را دارد. */
  bootstrap?: BootstrapOptions;
}

/** مقادیرِ فعلیِ پروژه در حالتِ ویرایش. */
export interface ProjectDefaults {
  id: number;
  title: string;
  description: string;
  regDate: string;
  deadline: string;
  statusTagId: string;
  price: string;
  currencyId: string;
  officeId: string;
  parentId: string;
  isUnitBased: boolean;
  isTender: boolean;
  /** نقش ← سقف. */
  tenderRoles: Record<string, string | null> | null;
  scope: string;
}

/** یک ردیفِ فیلد با برچسب و خطای زیرِ آن — قالبِ مشترکِ همهٔ فرم‌ها. */
function Field({
  label, name, error, hint, children,
}: {
  label: string;
  name: string;
  error?: string;
  hint?: string;
  children: (id: string) => React.ReactNode;
}) {
  const id = useId();
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children(id)}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && (
        <p className="text-xs text-destructive" data-field-error={name}>
          {error}
        </p>
      )}
    </div>
  );
}

/** select ِ بومی — سبک‌تر از رادیکس و مستقیماً با FormData ِ سرور سازگار. */
function NativeSelect({
  id, name, defaultValue, children,
}: {
  id: string;
  name: string;
  defaultValue?: string;
  children: React.ReactNode;
}) {
  return (
    <select
      id={id}
      name={name}
      defaultValue={defaultValue}
      className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      {children}
    </select>
  );
}

function SubmitButton({ isEdit }: { isEdit: boolean }) {
  const { pending } = useFormStatus();
  // ⚠️ مترجم اینجا هم لازم است: این جزء بیرونِ کامپوننتِ اصلی است و
  // پراپِ ترجمه‌شده نمی‌گیرد، پس بدونِ آن دکمه در هر زبانی فارسی می‌ماند.
  const tr = useT();
  const busy = isEdit ? tr('در حالِ ذخیره…') : tr('در حالِ ساخت…');
  const idle = isEdit ? tr('ذخیرهٔ تغییرات') : tr('ساخت پروژه');
  return <Button type="submit" disabled={pending}>{pending ? busy : idle}</Button>;
}

/**
 * فرمِ پروژه — یک فرم برای ساخت و ویرایش، چون نسخهٔ قبلی هم همین کار را می‌کند:
 * پنلِ «اطلاعات» مودالِ ساخت و متاباکسِ ویرایش دقیقاً یک مجموعه فیلد دارند.
 *
 * ⚠️ اعتبارسنجی روی **سرور** انجام می‌شود (zod در schema.ts). required ِ مرورگر
 * فقط برای بازخوردِ زودهنگام است، نه گارد.
 */
export function ProjectDialog({
  options,
  project,
}: {
  options: FormOptions;
  /** حاضر بودنش یعنی حالتِ ویرایش. */
  project?: ProjectDefaults;
}) {
  const tr = useT();
  const isEdit = project !== undefined;
  const [open, setOpen] = useState(false);
  const [formTab, setFormTab] = useState<'basics' | 'more'>('basics');
  const [state, formAction] = useActionState<FormState, FormData>(
    isEdit ? updateProjectAction : createProjectAction,
    {},
  );
  const [isTender, setIsTender] = useState(false);
  const [tenderRows, setTenderRows] = useState<Array<{ roleTagId: string; cap: string }>>([]);
  const [isUnitBased, setIsUnitBased] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const fe = state.fieldErrors ?? {};

  // React پس از هر action فرم را ریست می‌کند؛ این مقادیر همان چیزی است که
  // کاربر فرستاده بود، پس فرم پس از خطا خالی نمی‌شود.
  const back = state.values;
  // ترتیبِ اولویت: آنچه کاربر فرستاده بود ← مقدارِ فعلیِ پروژه ← پیش‌فرض.
  const current = project as unknown as Record<string, string | boolean> | undefined;
  const keep = (name: string, fallback = '') =>
    back?.[name] ?? (current?.[name] !== undefined ? String(current[name]) : fallback);

  /**
   * ⚠️ چک‌باکس‌ها پس از خطا باید برگردند، و صرفِ برگرداندنِ state کافی نیست:
   * ریستِ React ورودیِ پنهانِ رادیکس را از تیک می‌اندازد بی‌آنکه خودِ رادیکس
   * خبردار شود — نتیجه تیکی که دیده می‌شود ولی ثبت نمی‌شود. با تعویضِ key
   * چک‌باکس دوباره سوار می‌شود و ورودیِ پنهانش هم‌گام می‌ماند.
   */
  useEffect(() => {
    if (!back) return;
    setIsUnitBased(back.isUnitBased === '1');
    setIsTender(back.isTender === '1');
    setFormKey((k) => k + 1);
  }, [back]);

  // در حالتِ ویرایش، وضعیتِ اولیهٔ چک‌باکس‌ها از خودِ پروژه می‌آید.
  useEffect(() => {
    if (!project) return;
    setIsUnitBased(project.isUnitBased);
    setIsTender(project.isTender);
    // ردیف‌های موجودِ مناقصه در حالتِ ویرایش.
    setTenderRows(Object.entries(project.tenderRoles ?? {})
      .map(([roleTagId, cap]) => ({ roleTagId, cap: cap ? String(Number(cap)) : '' })));
  }, [project]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {isEdit ? <Button variant="outline">{tr("ویرایش")}</Button> : <Button>{tr("افزودن پروژه")}</Button>}
      </DialogTrigger>

      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? tr('ویرایشِ پروژه') : tr('افزودن پروژه')}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'اعضا و تسک‌ها از بخش‌های خودشان مدیریت می‌شوند.'
              : 'اطلاعاتِ پایه را ثبت کنید؛ بخش‌های پایین اختیاری‌اند.'}
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="grid gap-4">
          {isEdit && <input type="hidden" name="projectId" value={project.id} />}
          {state.error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {state.error}
            </p>
          )}
          {state.savedId && !state.error && (
            <p className="rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">
              {tr("تغییرات ذخیره شد.")}
            </p>
          )}
          {/*
            ⚠️ تب‌بندی، نه یک فرمِ بلندِ اسکرولی: پروژه ده‌ها فیلد دارد و
            پشتِ‌سرِ هم چیدنشان یعنی کاربر برای دیدنِ «دامنهٔ دسترسی» باید
            از کنارِ «مبلغ» و «مناقصه» رد شود. همان تقسیم‌بندیِ نسخهٔ
            قبلی: اطلاعاتِ پایه، و بقیه.

            ⚠️ هر دو پنل همیشه در DOM اند و فقط پنهان می‌شوند — با unmount
            کردنِ تبِ غیرفعال، فیلدهایش از FormData بیرون می‌افتادند و
            ذخیره بی‌صدا مقادیر را پاک می‌کرد.
          */}
          <div className="flex gap-1 border-b">
            {([
              ['basics', tr('اطلاعات')],
              ['more', tr('تنظیمات و دسترسی')],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setFormTab(key)}
                className={`-mb-px border-b-2 px-3 py-1.5 text-sm transition ${
                  formTab === key
                    ? 'border-primary font-medium text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className={formTab === 'basics' ? 'grid gap-4' : 'hidden'}>

          <Field label={tr("عنوان")} name="title" error={fe.title}>
            {(id) => <Input id={id} name="title" defaultValue={keep('title')} required autoFocus />}
          </Field>

          <Field label={tr("توضیحات")} name="description" error={fe.description}>
            {(id) => <Textarea id={id} name="description" defaultValue={keep('description')} rows={2} />}
          </Field>

          {/* فیلدهای فشرده — در نسخهٔ قبلی سه‌تا در هر ردیف. */}
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={tr("تاریخ ثبت")} name="regDate" error={fe.regDate}>
              {(id) => (
                <Input id={id} type="date" name="regDate" defaultValue={keep('regDate', options.today)} className="num" />
              )}
            </Field>

            <Field label={tr("ددلاین")} name="deadline" error={fe.deadline}>
              {(id) => <Input id={id} type="date" name="deadline" defaultValue={keep('deadline')} className="num" />}
            </Field>

            <Field label={tr("وضعیت پروژه")} name="statusTagId" error={fe.statusTagId}>
              {(id) => (
                <NativeSelect id={id} name="statusTagId" defaultValue={keep('statusTagId')}>
                  <option value="">{tr("— انتخاب —")}</option>
                  {options.statuses.map((s) => (
                    <option key={s.id} value={s.id}>{s.label}</option>
                  ))}
                </NativeSelect>
              )}
            </Field>

            <Field label={tr("مبلغ پروژه")} name="price" error={fe.price}>
              {(id) => (
                <Input id={id} name="price" inputMode="decimal" defaultValue={keep('price', '0')} className="num" />
              )}
            </Field>

            <Field label={tr("ارز")} name="currencyId" error={fe.currencyId}>
              {(id) => (
                <NativeSelect
                  id={id}
                  name="currencyId"
                  defaultValue={keep('currencyId', options.defaultCurrencyId ? String(options.defaultCurrencyId) : '')}
                >
                  {options.currencies.map((c) => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </NativeSelect>
              )}
            </Field>

            <Field label={tr("دفتر")} name="officeId" error={fe.officeId}>
              {(id) => (
                <NativeSelect id={id} name="officeId" defaultValue={keep('officeId')}>
                  <option value="">{tr("— هیچ‌کدام —")}</option>
                  {options.offices.map((o) => (
                    <option key={o.id} value={o.id}>{o.label}</option>
                  ))}
                </NativeSelect>
              )}
            </Field>
          </div>
          </div>

          <div className={formTab === 'more' ? 'grid gap-4' : 'hidden'}>
          <Field
            label={tr("پروژهٔ والد (زیرپروژه؟)")}
            name="parentId"
            error={fe.parentId}
            hint={tr("اگر ادامه یا تغییرِ یک پروژهٔ دیگر است (نگهداری)، آن را انتخاب کنید.")}
          >
            {(id) => (
              <NativeSelect id={id} name="parentId" defaultValue={keep('parentId')}>
                <option value="">{tr("— بدونِ والد —")}</option>
                {options.parents.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </NativeSelect>
            )}
          </Field>

          <div className="rounded-md border p-3">
            <label className="flex items-start gap-2 text-sm font-medium">
              <Checkbox
                key={`unit-${formKey}`}
                name="isUnitBased"
                value="1"
                className="mt-0.5"
                checked={isUnitBased}
                onCheckedChange={(v) => setIsUnitBased(v === true)}
              />
              {tr("پروژهٔ تعدادی (پرداخت به‌ازای هر واحد)")}
            </label>
            <p className="mt-1 ms-6 text-xs text-muted-foreground">
              {tr("به‌جای مبلغِ توافقیِ ثابت، هر عضو «نرخِ هر واحد» دارد و دستمزدش = نرخ × تعدادِ ثبت‌شده.")}
            </p>
          </div>

          <div className="rounded-md border p-3">
            <label className="flex items-start gap-2 text-sm font-medium">
              <Checkbox
                key={`tender-${formKey}`}
                name="isTender"
                value="1"
                className="mt-0.5"
                checked={isTender}
                onCheckedChange={(v) => setIsTender(v === true)}
              />
              {tr("این پروژه یک مناقصه است")}
            </label>
            {isTender && (
              <div className="mt-2 ms-6 grid gap-2">
                <p className="text-xs text-muted-foreground">
                  {tr("نقش‌های موردنیاز و سقفِ قیمتِ هر نقش. سقفِ خالی یعنی «بدونِ سقف».")}
                </p>

                {tenderRows.map((row, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-2">
                    <select
                      name="tenderRole"
                      className="h-9 w-44 rounded-md border border-input bg-transparent px-3 text-sm"
                      value={row.roleTagId}
                      onChange={(e) => setTenderRows((rows) =>
                        rows.map((r, j) => (j === i ? { ...r, roleTagId: e.target.value } : r)))}
                    >
                      <option value="">{tr("— نقش —")}</option>
                      {options.roleTags.map((t) => (
                        <option key={t.id} value={t.id}>{t.label}</option>
                      ))}
                    </select>

                    <Input
                      name="tenderCap"
                      inputMode="decimal"
                      className="num w-32"
                      placeholder={tr("سقف")}
                      value={row.cap}
                      onChange={(e) => setTenderRows((rows) =>
                        rows.map((r, j) => (j === i ? { ...r, cap: e.target.value } : r)))}
                    />

                    <button
                      type="button"
                      aria-label={tr("حذفِ ردیف")}
                      onClick={() => setTenderRows((rows) => rows.filter((_, j) => j !== i))}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-muted"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                ))}

                <div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setTenderRows((rows) => [...rows, { roleTagId: '', cap: '' }])}
                  >
                    {tr("افزودنِ نقش")}
                  </Button>
                </div>

                {/* ⚠️ تیک بدونِ نقش، مناقصه نمی‌سازد — گاردش در سرویس است. */}
                {tenderRows.every((r) => !r.roleTagId) && (
                  <p className="text-xs text-amber-600 dark:text-amber-500">
                    {tr("بدونِ دستِ‌کم یک نقش، پروژه مناقصه ثبت نمی‌شود.")}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* پروژهٔ خصوصی فقط برای کسی که خودش دسترسیِ خصوصی دارد — گاردِ اصلی در سرویس. */}
          {options.canUsePrivate && (
            <Field
              label={tr("دامنهٔ دسترسی")}
              name="scope"
              error={fe.scope}
              hint={tr("پروژهٔ خصوصی فقط برای کسانی دیده می‌شود که دسترسیِ خصوصی دارند.")}
            >
              {(id) => (
                <NativeSelect id={id} name="scope" defaultValue={keep('scope', 'company')}>
                  <option value="company">{tr("شرکتی")}</option>
                  <option value="private">{tr("خصوصی")}</option>
                </NativeSelect>
              )}
            </Field>
          )}

          {/*
            بخش‌های اولیه فقط هنگامِ ساخت — همان کاری که نسخهٔ قبلی پس از
            `bootstrapProject` انجام می‌دهد.
          */}
          {!isEdit && options.bootstrap && (
            <BootstrapSections options={options.bootstrap} isUnitBased={isUnitBased} />
          )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {isEdit ? tr('بستن') : tr('انصراف')}
            </Button>
            <SubmitButton isEdit={isEdit} />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
