'use client';

import { UserAvatar } from '@/components/user-avatar';
import { useActionState, useEffect, useRef, useState, useTransition } from 'react';
import { useFormStatus } from 'react-dom';
import { savePersonAction, type PersonFormState } from './_form/actions';
import { removeAvatarAction, setAvatarAction } from './_form/access-actions';
import { humanSize, MAX_SIZE } from '@/domain/files/upload';
import { Thumb } from '@/components/thumb';
import type { PersonView, SectionConfig } from './person-card';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Input } from '@/components/ui/input';
import { MultiSelect } from '@/components/ui/multi-select';
import { Combobox } from '@/components/ui/combobox';
import { Field, FieldDescription, FieldError, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { useActionToast, useToast } from '@/components/ui/toast';
import { useT } from '@/i18n/client';
import { OFFICE_MANAGER_CAP } from '@/domain/access/project-scope';
import { Checkbox } from '@/components/ui/checkbox';
import { FileInput } from '@/components/ui/file-input';

export interface PersonFormOptions {
  /** `grantsCap` تعیین می‌کند کدام نقش «مدیرِ تیم» است. */
  roleTags: Array<{ id: number; name: string; grantsCap?: string }>;
  offices: Array<{ id: number; name: string }>;
  /** کاربرانی که این نقش را ندارند — انتخابگرِ «کاربرِ موجود» در حالتِ افزودن. */
  candidates: Array<{ id: number; name: string; email: string; phone: string }>;
  /**
   * بازیگر خودش دیدِ خصوصی دارد؟ فقط او می‌تواند این گرنت را بدهد.
   * ⚠️ این فقط **نمایش** را کنترل می‌کند؛ گاردِ واقعی در سرویس است.
   */
  canGrantPrivate: boolean;
}

function SubmitButton({ label }: { label: string }) {
  const tr = useT();
  const { pending } = useFormStatus();
  if (pending) return <Button type="submit" disabled><Spinner />{tr("در حالِ ذخیره…")}</Button>;
  return <Button type="submit">{label}</Button>;
}

/**
 * فرمِ افزودن/ویرایشِ فرد — `person_form_html()`:
 * نام · ایمیل · تلفن · تگ‌های نقش · دفاتر (و دفترِ تحتِ مدیریت).
 *
 * بخش‌های تگ و دفتر با پرچم‌های `section` روشن/خاموش می‌شوند.
 */
/** انتخاب و بارگذاریِ تصویرِ پروفایل. */
function AvatarPicker({ person }: { person: PersonView }) {
  const tr = useT();
  const { show } = useToast();
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = () => {
    const file = inputRef.current?.files?.[0];
    if (!file) { show(tr('تصویری انتخاب نشده است.'), 'error'); return; }

    const data = new FormData();
    data.set('avatar', file);
    startTransition(async () => {
      const result = await setAvatarAction(person.id, data);
      show(tr(result.error ?? result.message!), result.error ? 'error' : 'success');
      if (!result.error && inputRef.current) inputRef.current.value = '';
    });
  };

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg bg-muted/60 p-3">
      <Thumb
        id={person.id}
        title={person.name}
        fileId={person.avatarFileId} person
        size={56}
        className="rounded-full"
      />
      <Field className="flex-1">
        <FieldLabel htmlFor="p-avatar">{tr("تصویر پروفایل")}</FieldLabel>
        <FileInput id="p-avatar" ref={inputRef} accept="image/*" />
        <FieldDescription>
          {tr('JPEG، PNG، GIF یا WebP — تا {size}.', { size: humanSize(MAX_SIZE.avatar, tr) })}
        </FieldDescription>
      </Field>
      <Button type="button" size="sm" variant="outline" disabled={pending} onClick={upload}>
        {pending ? <><Spinner />{tr('در حالِ ارسال…')}</> : tr('ذخیره تصویر')}
      </Button>
      {person.avatarFileId && (
        <Button
          type="button" size="sm" variant="ghost" disabled={pending}
          onClick={() => startTransition(async () => {
            const result = await removeAvatarAction(person.id);
            show(tr(result.error ?? result.message!), result.error ? 'error' : 'success');
          })}
        >
          {tr('حذفِ تصویر')}
        </Button>
      )}
    </div>
  );
}

export function PersonDialog({
  open,
  onOpenChange,
  person,
  options,
  section,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null یعنی حالتِ افزودن. */
  person: PersonView | null;
  options: PersonFormOptions;
  section: SectionConfig;
}) {
  const tr = useT();
  const [state, formAction] = useActionState<PersonFormState, FormData>(savePersonAction, {});
  useActionToast(state, { success: 'ذخیره شد.' });
  const isEdit = person !== null;
  /** کاربرِ موجودِ انتخاب‌شده — null یعنی «کاربرِ نو بساز». */
  const [picked, setPicked] = useState<PersonFormOptions['candidates'][number] | null>(null);

  // بستن و بازکردنِ دوبارهٔ پنجره نباید انتخابِ قبلی را نگه دارد.
  useEffect(() => { if (!open) setPicked(null); }, [open]);

  useEffect(() => {
    if (state.ok) onOpenChange(false);
  }, [state, onOpenChange]);

  const keep = (name: string, fallback = '') => state.values?.[name] ?? fallback;
  const tagIds = new Set(person?.tags.map((t) => t.id) ?? []);
  const officeIds = new Set(person?.offices.map((o) => o.id) ?? []);
  const managedIds = new Set(person?.offices.filter((o) => o.manages).map((o) => o.id) ?? []);

  /**
   * «مدیرِ این دفاتر» فقط وقتی معنا دارد که فرد نقشِ **مدیرِ تیم** داشته باشد
   * (تگی که `office_manager` می‌دهد). کارفرما اصلاً این فیلد را نمی‌بیند.
   *
   * ⚠️ پیش‌تر شرطِ «یا از قبل دفترِ تحتِ مدیریت دارد» هم بود، تا بشود پسش
   * گرفت. نتیجه‌اش عکسِ آن شد: با برداشتنِ نقشِ «مدیرِ تیم» فیلد سرِ جایش
   * می‌ماند، همان دفاتر دوباره فرستاده می‌شدند و آدم پس از ذخیره **هنوز
   * مدیر بود**. حالا نقش دروازه است — و سرور هم همین را اعمال می‌کند
   * (`managedOfficesFor`)، پس فرم نمی‌تواند دورش بزند.
   */
  const managerTagIds = new Set(
    options.roleTags.filter((t) => t.grantsCap === OFFICE_MANAGER_CAP).map((t) => t.id),
  );
  const [pickedTags, setPickedTags] = useState<number[]>([...tagIds]);
  /**
   * ⚠️ این دیالوگ یک بار برای کلِ صفحه سوار می‌شود و فقط `person` ِ آن عوض
   * می‌شود. بدونِ این، نقش‌های انتخاب‌شده همان مقدارِ بارِ اول (خالی) می‌ماند،
   * فیلدِ «مدیرِ این دفاتر» برای مدیرِ تیم اصلاً دیده نمی‌شد و ذخیرهٔ فرم
   * دفاترِ تحتِ مدیریتش را پاک می‌کرد (اتفاقی که برای دو مدیرِ تیم افتاد).
   */
  useEffect(() => {
    if (open) setPickedTags(person?.tags.map((t) => t.id) ?? []);
  }, [open, person]);
  const hasManagerTag = pickedTags.some((id) => managerTagIds.has(id));
  const showsManagedOffices = section.supportsTags && hasManagerTag;
  /** نقش برداشته شده ولی دفترِ تحتِ مدیریت هنوز ثبت است — با ذخیره پاک می‌شود. */
  const managedWillClear = section.supportsTags && !hasManagerTag && managedIds.size > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{tr(isEdit ? section.editLabel : section.addLabel)}</DialogTitle>
          <DialogDescription>
            {section.supportsOffices
              ? tr('نقش‌ها و دفاترِ عضو، دسترسی و گزارش‌هایش را تعیین می‌کنند.')
              : tr('کارفرما به پروژه‌هایی که به او وصل شده‌اند دسترسی دارد.')}
          </DialogDescription>
        </DialogHeader>

        {/* ⚠️ بیرونِ فرمِ اصلی — فرمِ تودرتو در HTML معتبر نیست. تصویر هم
            مستقل ذخیره می‌شود، پس منتظرِ ذخیرهٔ بقیهٔ فیلدها نمی‌ماند. */}
        {isEdit && <AvatarPicker person={person} />}

        {/* key باعث می‌شود فرم با تعویضِ فرد از نو ساخته شود و مقادیرِ قبلی نماند. */}
        <form key={person?.id ?? 'new'} action={formAction} className="grid gap-3">
          {isEdit && <input type="hidden" name="userId" value={person.id} />}
          <input type="hidden" name="role" value={section.role} />

          {/*
            ⚠️ تصویر در **همان فرمِ ساخت**: پیش از این فقط `AvatarPicker` ِ
            بالا وجود داشت که تنها در ویرایش دیده می‌شود، پس کاربر باید فرد
            را می‌ساخت، دوباره بازش می‌کرد و آن‌وقت عکس می‌گذاشت. اکشن پس از
            ساخت آپلودش می‌کند (شناسه لازم است).
          */}
          {!isEdit && (
            <Field>
              <FieldLabel htmlFor="p-new-avatar">{tr("تصویر پروفایل")}</FieldLabel>
              <FileInput id="p-new-avatar" name="avatar" accept="image/*" />
            </Field>
          )}

          {/*
            انتخابگرِ کاربرِ موجود.
            ⚠️ فقط در حالتِ افزودن، و فقط وقتی کاندیدی هست. کاربری که همین
            نقش را دارد در فهرست نیست، چون انتخابش هیچ اثری ندارد.
          */}
          {!isEdit && options.candidates.length > 0 && (
            <Field className="rounded-lg bg-muted/60 p-3">
              <FieldLabel htmlFor="p-existing">{tr("کاربرِ موجودِ سامانه")}</FieldLabel>
              <Combobox
                id="p-existing"
                options={options.candidates.map((c) => ({
                  value: c.id, label: c.name, hint: c.email,
                  media: <UserAvatar userId={c.id} name={c.name} size="xs" />,
                }))}
                value={{ id: picked?.id ?? null, label: picked?.name ?? '' }}
                onChange={(next) => setPicked(
                  options.candidates.find((c) => c.id === next.id) ?? null,
                )}
                placeholder={tr("نام یا ایمیل را تایپ کنید…")}
              />
              {picked && <input type="hidden" name="existingUserId" value={picked.id} />}
              <FieldDescription>
                {picked
                  ? tr('این کاربر با همان نام و ایمیلِ فعلی‌اش به این بخش اضافه می‌شود.')
                  : tr('یک کاربرِ ثبت‌شده را انتخاب کنید، یا فیلدهای زیر را برای ساختِ کاربرِ نو پر کنید.')}
              </FieldDescription>
            </Field>
          )}

          <Field>
            <FieldLabel htmlFor="p-name">{tr("نام")}</FieldLabel>
            {/* ⚠️ با انتخابِ کاربرِ موجود، نام و ایمیل از خودِ او می‌آید و
                دست نمی‌خورد — پس نه پر می‌شود نه اجباری است. */}
            <Input
              id="p-name" name="name"
              defaultValue={keep('name', person?.name ?? '')}
              value={picked ? picked.name : undefined}
              readOnly={picked !== null}
              required={picked === null}
            />
            {state.fieldErrors?.name && (
              <FieldError>{tr(state.fieldErrors.name)}</FieldError>
            )}
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="p-email">{tr("ایمیل")}</FieldLabel>
              <Input
                id="p-email"
                name="email"
                type="email"
                className="num"
                defaultValue={keep('email', person?.email ?? '')}
                value={picked ? picked.email : undefined}
                readOnly={picked !== null}
                required={picked === null}
              />
              {state.fieldErrors?.email && (
                <FieldError>{tr(state.fieldErrors.email)}</FieldError>
              )}
            </Field>

            <Field>
              <FieldLabel htmlFor="p-phone">{tr("تلفن")}</FieldLabel>
              <Input
                id="p-phone"
                name="phone"
                inputMode="tel"
                className="num"
                defaultValue={keep('phone', person?.phone ?? '')}
              />
            </Field>
          </div>

          {/*
            رمزِ ورود — فقط هنگامِ **ساخت**.
            ⚠️ در ویرایش نمی‌آید: تعیینِ رمز کارِ جداگانه‌ای است (دکمهٔ
            «رمزِ ورود» روی کارتِ فرد) تا با یک ذخیرهٔ اتفاقیِ فرم، رمزِ
            کسی بی‌خبر عوض نشود.
          */}
          {/*
            نامِ کاربری — راهِ دومِ ورود، کنارِ ایمیل.

            ⚠️ در ویرایش هم می‌آید و پر شده. پیش از این فقط هنگامِ ساخت
            نشان داده می‌شد تا کسی با یک ذخیرهٔ اتفاقی نامِ کاربریِ دیگری را
            عوض نکند — ولی نتیجه‌اش این بود که نامِ کاربریِ موجود **هیچ‌جا
            دیده نمی‌شد**: نه می‌شد فهمید چیست، نه اصلاحش کرد، و فردی که
            بدونِ نامِ کاربری ساخته شده بود برای همیشه بی‌نام می‌ماند.
            دیدنِ مقدارِ فعلی خودش همان هشدار است.
          */}
          <Field>
            <FieldLabel htmlFor="p-username">{tr("نامِ کاربری (اختیاری)")}</FieldLabel>
            <Input
              id="p-username"
              name="username"
              defaultValue={person?.username ?? ''}
              autoComplete="off"
              dir="ltr"
              placeholder="ali_ahmadi"
            />
            <FieldDescription>
              {person
                ? tr("عوض‌کردنش یعنی نامِ کاربریِ قبلی دیگر برای ورود کار نمی‌کند.")
                : tr("با ایمیل هم می‌تواند وارد شود؛ این فقط راهِ دوم است.")}
            </FieldDescription>
            {state.fieldErrors?.username && (
              <FieldError>{tr(state.fieldErrors.username)}</FieldError>
            )}
          </Field>

          {!person && (
            <Field>
              <FieldLabel htmlFor="p-password">{tr("رمزِ ورود (اختیاری)")}</FieldLabel>
              <Input
                id="p-password"
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                placeholder={tr("دستِ‌کم ۸ نویسه")}
              />
              <FieldDescription>
                {tr("خالی بگذارید و بعداً از دکمهٔ «رمزِ ورود» تعیینش کنید؛ تا آن موقع این فرد نمی‌تواند وارد شود.")}
              </FieldDescription>
              {state.fieldErrors?.password && (
                <FieldError>{tr(state.fieldErrors.password)}</FieldError>
              )}
            </Field>
          )}

          {/*
            ⚠️ فقط برای کسی که خودش دیدِ خصوصی دارد. دیدنِ دادهٔ خصوصی یک
            **گرنت** است نه نقش، پس با تگ و دفتر یک جا نمی‌نشیند و کادرِ
            خودش را دارد.
          */}
          {options.canGrantPrivate && (
            <FieldSet variant="box">
              <FieldLegend>{tr("دسترسیِ ویژه")}</FieldLegend>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox name="privateAccess" value="1"
                  defaultChecked={person?.privateAccess ?? false}
                />
                {tr("دیدنِ پروژه‌های خصوصی")}
              </label>
              <FieldDescription>
                {tr("جدا از نقش است، پس پس‌گرفتنش تنزلِ نقشِ فرد نیست.")}
              </FieldDescription>
            </FieldSet>
          )}

          {section.supportsTags && (
          <FieldSet variant="box">
            <FieldLegend>{tr("نقش‌ها")}</FieldLegend>
            <MultiSelect
              name="tagIds"
              options={options.roleTags.map((t) => ({ id: t.id, label: t.name }))}
              defaultSelected={[...tagIds]}
              onChange={setPickedTags}
              placeholder={tr("انتخابِ نقش‌ها…")}
              emptyText={tr("هنوز نقشی تعریف نشده.")}
            />
          </FieldSet>
          )}

          {section.supportsOffices && (
          <FieldSet variant="box" className="gap-3">
            <FieldLegend>{tr("دفاتر")}</FieldLegend>
            <Field>
              <FieldLabel className="text-xs text-muted-foreground">{tr("عضوِ این دفاتر")}</FieldLabel>
              <MultiSelect
                name="officeIds"
                options={options.offices.map((o) => ({ id: o.id, label: o.name }))}
                defaultSelected={[...officeIds]}
                placeholder={tr("انتخابِ دفاتر…")}
                emptyText={tr("هنوز دفتری تعریف نشده.")}
              />
            </Field>
            {/*
              ⚠️ «مدیرِ این دفاتر» فقط برای کسی که نقشِ **مدیرِ تیم** دارد:
              کارفرما اصلاً دفتری را نمی‌گرداند، و عضوِ معمولی هم نه. پیش از
              این فیلد همیشه بود و می‌شد ناخواسته به هرکس مدیریتِ دفتر داد —
              دسترسی‌ای که پروژه‌ها و ساعتِ کلِ آن دفتر را باز می‌کند.
            */}
            {/*
              ⚠️ خبر می‌دهد، بی‌صدا پاک نمی‌کند: کاربر باید بداند برداشتنِ نقش
              چه چیزِ دیگری را هم برمی‌دارد.
            */}
            {managedWillClear && (
              <p className="text-xs text-amber-700 dark:text-amber-500">
                {tr("با برداشتنِ نقشِ «مدیرِ تیم»، دفاترِ تحتِ مدیریتِ این فرد هم با ذخیره برداشته می‌شوند.")}
              </p>
            )}
            {showsManagedOffices && (
            <Field>
              <FieldLabel className="text-xs text-muted-foreground">{tr("مدیرِ این دفاتر")}</FieldLabel>
              {/* نشانگر: «فیلد در فرم بود» — بی‌آن سرور دفاترِ تحتِ مدیریت را دست نمی‌زند. */}
              <input type="hidden" name="managedOfficesField" value="1" />
              <MultiSelect
                name="managedOfficeIds"
                options={options.offices.map((o) => ({ id: o.id, label: o.name }))}
                defaultSelected={[...managedIds]}
                placeholder={tr("هیچ‌کدام")}
                emptyText={tr("هنوز دفتری تعریف نشده.")}
              />
              <FieldDescription>
                {tr("مدیریت جداست از عضویت — می‌تواند دفتری را بگرداند بی‌آنکه عضوش باشد.")}
              </FieldDescription>
            </Field>
            )}
          </FieldSet>
          )}

          {/* پورتِ چک‌باکسِ «ارسالِ دعوت‌نامه»: تازه → لینکِ تعیینِ رمزِ ۳روزه؛ موجود → آدرسِ داشبورد. */}
          <label className="flex items-center gap-2 text-sm">
            <Checkbox name="sendInvite" defaultChecked={!isEdit} />
            {tr("ارسالِ دعوت‌نامه با ایمیل")}
          </label>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {tr("انصراف")}
            </Button>
            <SubmitButton label={isEdit ? tr('ذخیرهٔ تغییرات') : tr(section.addLabel)} />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
