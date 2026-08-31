'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { saveCompanyAction, setCompanyLogoAction, type ProfileState } from '../profile/_form/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useT } from '@/i18n/client';

/**
 * مشخصاتِ شرکت — روی فاکتور و سربرگ می‌نشیند.
 *
 * ⚠️ اینجا و نه در پروفایل: پروفایل دربارهٔ **خودِ کاربر** است و مشخصاتِ
 * شرکت دادهٔ سازمان است، نه شخصی. جای درستش تنظیماتِ سامانه است.
 */
export function CompanySection({ company }: {
  company: {
    name: string; address: string; taxId: string; email: string; phone: string;
    website: string; bank: string; invoiceFooter: string; logoFileId: number | null;
  };
}) {
  const t = useT();
  const tr = useT();
  const [companyState, saveCompany] = useActionState(saveCompanyAction, {} as ProfileState);
  const [logoState, setLogoState] = useState<ProfileState>({});
  const data = { company };

  return (
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
  );
}

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
