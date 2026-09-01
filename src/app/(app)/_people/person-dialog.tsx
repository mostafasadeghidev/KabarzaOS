'use client';

import { useActionState, useEffect, useRef, useState, useTransition } from 'react';
import { useFormStatus } from 'react-dom';
import { savePersonAction, type PersonFormState } from './_form/actions';
import { setAvatarAction } from './_form/access-actions';
import { humanSize, MAX_SIZE } from '@/domain/files/upload';
import { Thumb } from '@/components/thumb';
import type { PersonView, SectionConfig } from './person-card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MultiSelect } from '@/components/ui/multi-select';
import { Combobox } from '@/components/ui/combobox';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { useT } from '@/i18n/client';

export interface PersonFormOptions {
  roleTags: Array<{ id: number; name: string }>;
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
  if (pending) return <Button type="submit" disabled>{tr("در حالِ ذخیره…")}</Button>;
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
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<{ text: string; isError: boolean } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = () => {
    const file = inputRef.current?.files?.[0];
    if (!file) return setNotice({ text: tr('تصویری انتخاب نشده است.'), isError: true });

    const data = new FormData();
    data.set('avatar', file);
    startTransition(async () => {
      const result = await setAvatarAction(person.id, data);
      setNotice({ text: result.error ?? result.message!, isError: Boolean(result.error) });
      if (!result.error && inputRef.current) inputRef.current.value = '';
    });
  };

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-md border p-3">
      <Thumb
        id={person.id}
        title={person.name}
        fileId={person.avatarFileId}
        size={56}
        className="rounded-full"
      />
      <div className="grid flex-1 gap-1.5">
        <Label htmlFor="p-avatar">{tr("تصویر پروفایل")}</Label>
        <Input id="p-avatar" ref={inputRef} type="file" accept="image/*" />
        <p className="text-xs text-muted-foreground">
          {tr('JPEG، PNG، GIF یا WebP — تا {size}.', { size: humanSize(MAX_SIZE.avatar, tr) })}
        </p>
        {notice && (
          <p className={`text-xs ${notice.isError ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-500'}`}>
            {notice.text}
          </p>
        )}
      </div>
      <Button type="button" size="sm" variant="outline" disabled={pending} onClick={upload}>
        {pending ? tr('در حالِ ارسال…') : tr('ذخیره تصویر')}
      </Button>
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
  const isEdit = person !== null;
  /** کاربرِ موجودِ انتخاب‌شده — null یعنی «کاربرِ نو بساز». */
  const [picked, setPicked] = useState<PersonFormOptions['candidates'][number] | null>(null);

  // بستن و بازکردنِ دوبارهٔ پنجره نباید انتخابِ قبلی را نگه دارد.
  useEffect(() => { if (!open) setPicked(null); }, [open]);

  useEffect(() => {
    if (state.ok) onOpenChange(false);
  }, [state.ok, onOpenChange]);

  const keep = (name: string, fallback = '') => state.values?.[name] ?? fallback;
  const tagIds = new Set(person?.tags.map((t) => t.id) ?? []);
  const officeIds = new Set(person?.offices.map((o) => o.id) ?? []);
  const managedIds = new Set(person?.offices.filter((o) => o.manages).map((o) => o.id) ?? []);

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
            انتخابگرِ کاربرِ موجود.
            ⚠️ فقط در حالتِ افزودن، و فقط وقتی کاندیدی هست. کاربری که همین
            نقش را دارد در فهرست نیست، چون انتخابش هیچ اثری ندارد.
          */}
          {!isEdit && options.candidates.length > 0 && (
            <div className="grid gap-1.5 rounded-md border border-dashed p-3">
              <Label htmlFor="p-existing">{tr("کاربرِ موجودِ سامانه")}</Label>
              <Combobox
                id="p-existing"
                options={options.candidates.map((c) => ({
                  value: c.id, label: c.name, hint: c.email,
                }))}
                value={{ id: picked?.id ?? null, label: picked?.name ?? '' }}
                onChange={(next) => setPicked(
                  options.candidates.find((c) => c.id === next.id) ?? null,
                )}
                placeholder={tr("نام یا ایمیل را تایپ کنید…")}
              />
              {picked && <input type="hidden" name="existingUserId" value={picked.id} />}
              <p className="text-xs text-muted-foreground">
                {picked
                  ? tr('این کاربر با همان نام و ایمیلِ فعلی‌اش به این بخش اضافه می‌شود.')
                  : tr('یک کاربرِ ثبت‌شده را انتخاب کنید، یا فیلدهای زیر را برای ساختِ کاربرِ نو پر کنید.')}
              </p>
            </div>
          )}

          <div className="grid gap-1.5">
            <Label htmlFor="p-name">{tr("نام")}</Label>
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
              <p className="text-xs text-destructive">{state.fieldErrors.name}</p>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="p-email">{tr("ایمیل")}</Label>
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
                <p className="text-xs text-destructive">{state.fieldErrors.email}</p>
              )}
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="p-phone">{tr("تلفن")}</Label>
              <Input
                id="p-phone"
                name="phone"
                inputMode="tel"
                className="num"
                defaultValue={keep('phone', person?.phone ?? '')}
              />
            </div>
          </div>

          {/*
            رمزِ ورود — فقط هنگامِ **ساخت**.
            ⚠️ در ویرایش نمی‌آید: تعیینِ رمز کارِ جداگانه‌ای است (دکمهٔ
            «رمزِ ورود» روی کارتِ فرد) تا با یک ذخیرهٔ اتفاقیِ فرم، رمزِ
            کسی بی‌خبر عوض نشود.
          */}
          {/*
            نامِ کاربری — راهِ دومِ ورود، کنارِ ایمیل.
            ⚠️ فقط هنگامِ ساخت: عوض‌کردنش بعداً یعنی کسی که با آن وارد
            می‌شده ناگهان نمی‌تواند، و آن باید تصمیمِ آگاهانه باشد نه
            عارضهٔ یک ذخیرهٔ فرم.
          */}
          {!person && (
            <div className="grid gap-1.5">
              <Label htmlFor="p-username">{tr("نامِ کاربری (اختیاری)")}</Label>
              <Input
                id="p-username"
                name="username"
                autoComplete="off"
                dir="ltr"
                placeholder="ali_ahmadi"
              />
              <p className="text-xs text-muted-foreground">
                {tr("با ایمیل هم می‌تواند وارد شود؛ این فقط راهِ دوم است.")}
              </p>
              {state.fieldErrors?.username && (
                <p className="text-xs text-destructive">{state.fieldErrors.username}</p>
              )}
            </div>
          )}

          {!person && (
            <div className="grid gap-1.5">
              <Label htmlFor="p-password">{tr("رمزِ ورود (اختیاری)")}</Label>
              <Input
                id="p-password"
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                placeholder={tr("دستِ‌کم ۸ نویسه")}
              />
              <p className="text-xs text-muted-foreground">
                {tr("خالی بگذارید و بعداً از دکمهٔ «رمزِ ورود» تعیینش کنید؛ تا آن موقع این فرد نمی‌تواند وارد شود.")}
              </p>
              {state.fieldErrors?.password && (
                <p className="text-xs text-destructive">{state.fieldErrors.password}</p>
              )}
            </div>
          )}

          {/*
            ⚠️ فقط برای کسی که خودش دیدِ خصوصی دارد. دیدنِ دادهٔ خصوصی یک
            **گرنت** است نه نقش، پس با تگ و دفتر یک جا نمی‌نشیند و کادرِ
            خودش را دارد.
          */}
          {options.canGrantPrivate && (
            <fieldset className="grid gap-1.5 rounded-md border border-dashed p-3">
              <legend className="px-1 text-sm font-medium">{tr("دسترسیِ ویژه")}</legend>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox" name="privateAccess" value="1"
                  defaultChecked={person?.privateAccess ?? false}
                  className="size-4 accent-primary"
                />
                {tr("دیدنِ پروژه‌های خصوصی")}
              </label>
              <p className="text-xs text-muted-foreground">
                {tr("جدا از نقش است، پس پس‌گرفتنش تنزلِ نقشِ فرد نیست.")}
              </p>
            </fieldset>
          )}

          {section.supportsTags && (
          <fieldset className="grid gap-1.5 rounded-md border border-dashed p-3">
            <legend className="px-1 text-sm font-medium">{tr("نقش‌ها")}</legend>
            <MultiSelect
              name="tagIds"
              options={options.roleTags.map((t) => ({ id: t.id, label: t.name }))}
              defaultSelected={[...tagIds]}
              placeholder={tr("انتخابِ نقش‌ها…")}
              emptyText={tr("هنوز نقشی تعریف نشده.")}
            />
          </fieldset>
          )}

          {section.supportsOffices && (
          <fieldset className="grid gap-3 rounded-md border border-dashed p-3">
            <legend className="px-1 text-sm font-medium">{tr("دفاتر")}</legend>
            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">{tr("عضوِ این دفاتر")}</Label>
              <MultiSelect
                name="officeIds"
                options={options.offices.map((o) => ({ id: o.id, label: o.name }))}
                defaultSelected={[...officeIds]}
                placeholder={tr("انتخابِ دفاتر…")}
                emptyText={tr("هنوز دفتری تعریف نشده.")}
              />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">{tr("مدیرِ این دفاتر")}</Label>
              <MultiSelect
                name="managedOfficeIds"
                options={options.offices.map((o) => ({ id: o.id, label: o.name }))}
                defaultSelected={[...managedIds]}
                placeholder={tr("هیچ‌کدام")}
                emptyText={tr("هنوز دفتری تعریف نشده.")}
              />
              <p className="text-xs text-muted-foreground">
                {tr("مدیریت جداست از عضویت — می‌تواند دفتری را بگرداند بی‌آنکه عضوش باشد.")}
              </p>
            </div>
          </fieldset>
          )}

          {state.error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {tr(state.error)}
            </p>
          )}

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
