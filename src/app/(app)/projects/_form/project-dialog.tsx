'use client';

import { useActionState, useEffect, useId, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { X } from 'lucide-react';
import { createProjectAction, updateProjectAction } from './actions';
import type { FormState } from './schema';
import { BootstrapSections, FilePicker, type BootstrapOptions } from './bootstrap-sections';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { useActionToast } from '@/components/ui/toast';
import { useT } from '@/i18n/client';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DatePicker } from '@/components/ui/date-picker';
import { Thumb } from '@/components/thumb';
import { humanSize, MAX_SIZE } from '@/domain/files/upload';

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
  /** تصویرِ شاخصِ فعلی — پیش‌نمایشِ کنارِ انتخابگر در حالتِ ویرایش. */
  thumbnailFileId: number | null;
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
  const tr = useT();
  const id = useId();
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{tr(label)}</Label>
      {children(id)}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && (
        <p className="text-xs text-destructive" data-field-error={name}>
          {tr(error)}
        </p>
      )}
    </div>
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
  const [formTab, setFormTab] = useState<'info' | 'tasks' | 'files' | 'qa'>('info');
  /** بخش‌های اولیه فقط هنگامِ ساخت وجود دارند. */
  const showBootstrap = !isEdit && Boolean(options.bootstrap);
  const [state, formAction] = useActionState<FormState, FormData>(
    isEdit ? updateProjectAction : createProjectAction,
    {},
  );
  useActionToast(state, { success: 'تغییرات ذخیره شد.' });
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
              ? tr('اعضا و تسک‌ها از بخش‌های خودشان مدیریت می‌شوند.')
              : tr('تسک‌ها، فایل‌ها و QA اختیاری‌اند و بلافاصله پس از ساخت اعمال می‌شوند.')}
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="grid gap-4">
          {isEdit && <input type="hidden" name="projectId" value={project.id} />}
          {/*
            ⚠️ تب‌بندی، نه یک فرمِ بلندِ اسکرولی: پروژه ده‌ها فیلد دارد و
            پشتِ‌سرِ هم چیدنشان یعنی کاربر برای دیدنِ «دامنهٔ دسترسی» باید
            از کنارِ «مبلغ» و «مناقصه» رد شود. همان تقسیم‌بندیِ نسخهٔ
            قبلی: اطلاعاتِ پایه، و بقیه.

            ⚠️ هر دو پنل همیشه در DOM اند و فقط پنهان می‌شوند — با unmount
            کردنِ تبِ غیرفعال، فیلدهایش از FormData بیرون می‌افتادند و
            ذخیره بی‌صدا مقادیر را پاک می‌کرد.
          */}
          <Tabs value={formTab} onValueChange={(v) => setFormTab(v as typeof formTab)}>
            <TabsList variant="line">
              {([
                ['info', tr('اطلاعات')],
                ...(showBootstrap
                  ? ([['tasks', tr('تسک‌ها')], ['files', tr('فایل‌ها')], ['qa', 'QA']] as const)
                  : []),
              ] as ReadonlyArray<readonly [typeof formTab, string]>).map(([key, label]) => (
                <TabsTrigger key={key} value={key} className="flex-none">
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <div className={formTab === 'info' ? 'grid gap-4' : 'hidden'}>

          <Field label={tr("عنوان")} name="title" error={fe.title}>
            {(id) => <Input id={id} name="title" defaultValue={keep('title')} required autoFocus />}
          </Field>

          <Field label={tr("توضیحات")} name="description" error={fe.description}>
            {(id) => <Textarea id={id} name="description" defaultValue={keep('description')} rows={2} />}
          </Field>

          {/*
            ⚠️ تصویرِ شاخص کنارِ عنوان و توضیحات می‌نشیند، نه در تبِ فایل‌ها:
            در نسخهٔ قبلی هم جعبه‌اش کنارِ همین دو فیلد بود و کاربر انتظار
            دارد «هویتِ پروژه» یک‌جا پر شود.
            در ویرایش هم همین‌جاست، نه تبِ مدیریت: تصویر یک بار انتخاب می‌شود
            و جایش کنارِ بقیهٔ هویتِ پروژه است، نه میانِ کارهای روزمره. با
            «ذخیرهٔ تغییرات» ثبت می‌شود (← updateProjectAction).
          */}
          {(options.bootstrap || isEdit) && (
            <div className="grid gap-1.5">
              <span className="text-sm font-medium">{tr("تصویرِ شاخص")}</span>
              <p className="text-xs text-muted-foreground">
                {tr('JPEG، PNG، GIF یا WebP — تا {size}.', { size: humanSize(MAX_SIZE.avatar, tr) })}
                {' '}
                {project?.thumbnailFileId
                  ? tr('تصویرِ قبلی پس از ذخیره حذف می‌شود.')
                  : tr("بدونِ تصویر، تک‌نگارِ رنگی نشان داده می‌شود.")}
              </p>
              <div className="flex items-start gap-3">
                {isEdit && (
                  <Thumb id={project.id} title={project.title} fileId={project.thumbnailFileId} size={56} />
                )}
                <div className="min-w-0 flex-1">
                  <FilePicker
                    name="thumbnailFile"
                    accept="image/*"
                    multiple={false}
                    preview
                    addLabel={tr("انتخابِ تصویر")}
                    emptyLabel={tr("تصویری انتخاب نشده")}
                  />
                </div>
              </div>
            </div>
          )}

          {/* فیلدهای فشرده — در نسخهٔ قبلی سه‌تا در هر ردیف. */}
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={tr("تاریخ ثبت")} name="regDate" error={fe.regDate}>
              {(id) => (
                <DatePicker id={id} name="regDate" defaultValue={keep('regDate', options.today)} />
              )}
            </Field>

            <Field label={tr("ددلاین")} name="deadline" error={fe.deadline}>
              {(id) => <DatePicker id={id} name="deadline" defaultValue={keep('deadline')} />}
            </Field>

            <Field label={tr("وضعیت پروژه")} name="statusTagId" error={fe.statusTagId}>
              {(id) => (
                <NativeSelect id={id} name="statusTagId" containerClassName="w-full" defaultValue={keep('statusTagId')}>
                  <NativeSelectOption value="">{tr("— انتخاب —")}</NativeSelectOption>
                  {options.statuses.map((s) => (
                    <NativeSelectOption key={s.id} value={s.id}>{s.label}</NativeSelectOption>
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
                  containerClassName="w-full"
                  defaultValue={keep('currencyId', options.defaultCurrencyId ? String(options.defaultCurrencyId) : '')}
                >
                  {options.currencies.map((c) => (
                    <NativeSelectOption key={c.id} value={c.id}>{c.label}</NativeSelectOption>
                  ))}
                </NativeSelect>
              )}
            </Field>

            <Field label={tr("دفتر")} name="officeId" error={fe.officeId}>
              {(id) => (
                <NativeSelect id={id} name="officeId" containerClassName="w-full" defaultValue={keep('officeId')}>
                  <NativeSelectOption value="">{tr("— هیچ‌کدام —")}</NativeSelectOption>
                  {options.offices.map((o) => (
                    <NativeSelectOption key={o.id} value={o.id}>{o.label}</NativeSelectOption>
                  ))}
                </NativeSelect>
              )}
            </Field>
          </div>


          <Field
            label={tr("پروژهٔ والد (زیرپروژه؟)")}
            name="parentId"
            error={fe.parentId}
            hint={tr("اگر ادامه یا تغییرِ یک پروژهٔ دیگر است (نگهداری)، آن را انتخاب کنید.")}
          >
            {(id) => (
              <SearchableSelect id={id} name="parentId" containerClassName="w-full" defaultValue={keep('parentId')}>
                <NativeSelectOption value="">{tr("— بدونِ والد —")}</NativeSelectOption>
                {options.parents.map((p) => (
                  <NativeSelectOption key={p.id} value={p.id}>{p.label}</NativeSelectOption>
                ))}
              </SearchableSelect>
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
                    <NativeSelect
                      name="tenderRole"
                      containerClassName="w-44"
                      value={row.roleTagId}
                      onChange={(e) => setTenderRows((rows) =>
                        rows.map((r, j) => (j === i ? { ...r, roleTagId: e.target.value } : r)))}
                    >
                      <NativeSelectOption value="">{tr("— نقش —")}</NativeSelectOption>
                      {options.roleTags.map((t) => (
                        <NativeSelectOption key={t.id} value={t.id}>{t.label}</NativeSelectOption>
                      ))}
                    </NativeSelect>

                    <Input
                      name="tenderCap"
                      inputMode="decimal"
                      className="num w-32"
                      placeholder={tr("سقف")}
                      value={row.cap}
                      onChange={(e) => setTenderRows((rows) =>
                        rows.map((r, j) => (j === i ? { ...r, cap: e.target.value } : r)))}
                    />

                    <Button
                      type="button"
                      aria-label={tr("حذفِ ردیف")}
                      onClick={() => setTenderRows((rows) => rows.filter((_, j) => j !== i))} variant="ghost" size="icon-sm" className="text-muted-foreground"
                    >
                      <X className="size-3.5" />
                    </Button>
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
                <NativeSelect id={id} name="scope" containerClassName="w-full" defaultValue={keep('scope', 'company')}>
                  <NativeSelectOption value="company">{tr("شرکتی")}</NativeSelectOption>
                  <NativeSelectOption value="private">{tr("خصوصی")}</NativeSelectOption>
                </NativeSelect>
              )}
            </Field>
          )}

          {/*
            ⚠️ «اعضا» داخلِ همین تبِ اطلاعات است، نه تبِ جدا — همان جایی که
            نسخهٔ قبلی گذاشته: تیمِ پروژه بخشی از شناسنامهٔ آن است، نه یک
            مرحلهٔ بعدی.
          */}
          {showBootstrap && (
            <BootstrapSections options={options.bootstrap!} isUnitBased={isUnitBased} only="team" />
          )}
          </div>

          {/*
            ⚠️ سه پنلِ دیگر بیرونِ پنلِ اطلاعات‌اند ولی همیشه در DOM می‌مانند
            و فقط پنهان می‌شوند: با unmount، ورودی‌هایشان از FormData بیرون
            می‌افتند و ساختِ پروژه بی‌صدا آن بخش را نادیده می‌گیرد.
          */}
          {showBootstrap && (
            <>
              <div className={formTab === 'tasks' ? 'grid gap-4' : 'hidden'}>
                <BootstrapSections options={options.bootstrap!} isUnitBased={isUnitBased} only="tasks" />
              </div>
              <div className={formTab === 'files' ? 'grid gap-4' : 'hidden'}>
                <BootstrapSections options={options.bootstrap!} isUnitBased={isUnitBased} only="files" />
              </div>
              <div className={formTab === 'qa' ? 'grid gap-4' : 'hidden'}>
                <BootstrapSections options={options.bootstrap!} isUnitBased={isUnitBased} only="qa" />
              </div>
            </>
          )}

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
