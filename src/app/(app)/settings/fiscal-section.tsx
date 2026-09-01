'use client';

import { useActionState, useState, useTransition } from 'react';
import { useFormStatus } from 'react-dom';
import { Lock, Unlock } from 'lucide-react';
import { closePeriodAction, reopenPeriodAction, type FiscalState } from './_form/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useT } from '@/i18n/client';

function Notice({ state }: { state: FiscalState }) {
  const t = useT();
  if (!state.error && !state.message) return null;
  return (
    <p className={`text-xs ${state.error ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-500'}`}>
      {t(state.error ?? state.message ?? '')}
    </p>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  const tr = useT();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      <Lock className="size-3.5" />
      {pending ? tr('در حالِ بستن…') : tr('بستنِ دوره')}
    </Button>
  );
}

/**
 * بستن و بازکردنِ دورهٔ مالی — پورتِ تبِ «بستن دورهٔ مالی».
 *
 * ⚠️ این عمل روی **همهٔ** حساب‌ها اثر می‌گذارد و عملاً برگشت‌ناپذیر است:
 * پس از بستن، هیچ ردیفی با تاریخِ آن دوره ثبت، ویرایش یا حذف نمی‌شود.
 * برای همین فقط مدیرِ کل، و با هشدارِ صریح.
 */
export function FiscalSection({ lockDate, today }: { lockDate: string | null; today: string }) {
  const tr = useT();
  const t = useT();
  const [state, close] = useActionState(closePeriodAction, {} as FiscalState);
  const [aux, setAux] = useState<FiscalState>({});
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="grid max-w-2xl gap-5">
      <div className="rounded-md border p-3">
        <h3 className="text-sm font-medium">{t("وضعیتِ فعلی")}</h3>
        {lockDate ? (
          <p className="mt-1 text-sm">
            {tr('دوره تا {date} بسته است؛ ردیف‌های آن بازه تغییر نمی‌کنند.', {
              date: lockDate,
            })}
          </p>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">
            {tr("هیچ دوره‌ای بسته نشده — همهٔ ردیف‌ها قابلِ ویرایش‌اند.")}
          </p>
        )}
      </div>

      <form action={close} className="grid gap-3 rounded-md border p-3">
        <h3 className="text-sm font-medium">{t("بستنِ دوره")}</h3>
        <p className="text-xs text-muted-foreground">
          {tr("برای هر حساب یک خلاصهٔ ثابت (گردش و موجودیِ پایانی) ذخیره می‌شود و دوره تا این تاریخ قفل می‌گردد. ردیف‌ها پاک نمی‌شوند، فقط فقط‌خواندنی می‌شوند.")}
        </p>

        <div className="grid gap-1.5 sm:max-w-xs">
          <Label htmlFor="f-date">{t("تاریخِ بستن")}</Label>
          <Input id="f-date" name="lockDate" type="date" className="num" defaultValue={today} required />
        </div>

        {/*
          ⚠️ اگر قفلی جلوتر از این تاریخ وجود دارد، بستن آن را عقب نمی‌برد
          (R-FISCAL-10) — و کاربر باید این را **پیش** از زدنِ دکمه بداند.
        */}
        {lockDate && (
          <p className="text-xs text-amber-600 dark:text-amber-500">
            {tr('قفلِ فعلی روی {date} است؛ تاریخی قدیمی‌تر از آن، قفل را عقب نمی‌برد.', {
              date: lockDate,
            })}
          </p>
        )}

        <div className="flex items-center gap-3">
          <Submit />
          <Notice state={state} />
        </div>
      </form>

      <div className="grid gap-2 rounded-md border border-dashed p-3">
        <h3 className="text-sm font-medium">{t("بازگشاییِ دوره")}</h3>
        <p className="text-xs text-muted-foreground">
          {tr("قفل برداشته می‌شود و ردیف‌ها دوباره قابلِ تغییر می‌شوند. خلاصه‌های ثبت‌شده پاک نمی‌شوند.")}
        </p>

        <div className="flex items-center gap-3">
          {/* ⚠️ تأییدِ دومرحله‌ای — بازکردن یعنی دادهٔ بسته دوباره قابلِ تغییر است. */}
          {confirming ? (
            <>
              <Button
                type="button" size="sm" variant="destructive" disabled={pending}
                onClick={() => startTransition(async () => {
                  setAux(await reopenPeriodAction());
                  setConfirming(false);
                })}
              >
                <Unlock className="size-3.5" />
                {tr("بله، قفل را بردار")}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(false)}>
                {tr("انصراف")}
              </Button>
            </>
          ) : (
            <Button
              type="button" size="sm" variant="outline"
              disabled={pending || !lockDate}
              onClick={() => setConfirming(true)}
            >
              <Unlock className="size-3.5" />
              {tr("بازگشاییِ دوره")}
            </Button>
          )}
          <Notice state={aux} />
        </div>
      </div>
    </div>
  );
}
