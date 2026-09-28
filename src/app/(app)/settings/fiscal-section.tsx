'use client';

import { useActionState, useState, useTransition } from 'react';
import { useFormStatus } from 'react-dom';
import { Lock, Unlock } from 'lucide-react';
import { closePeriodAction, reopenPeriodAction, type FiscalState } from './_form/actions';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Label } from '@/components/ui/label';
import { useActionToast } from '@/components/ui/toast';
import { useT, useTimeZone } from '@/i18n/client';
import { formatDateTime } from '@/i18n/datetime';
import { format } from '@/domain/money/money';
import { DatePicker } from '@/components/ui/date-picker';
import { Panel } from '@/components/page-shell';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableNumericCell, TableRow } from '@/components/ui/table';

function Submit() {
  const { pending } = useFormStatus();
  const tr = useT();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      <Lock className="size-3.5" />
      {pending ? <><Spinner />{tr('در حالِ بستن…')}</> : tr('بستنِ دوره')}
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
/** پیش‌نمایشِ بستن — خروجیِ `closingPreview`. */
export interface ClosingPreview {
  accounts: Array<{ id: number; label: string; balance: string; currencyCode: string | null }>;
  lastChange: { at: string; by: string; lockDate: string | null } | null;
}

export function FiscalSection({
  lockDate,
  today,
  closing,
}: {
  lockDate: string | null;
  today: string;
  /** null وقتی بیننده مالک نیست. */
  closing: ClosingPreview | null;
}) {
  const tr = useT();
  const t = useT();
  const tz = useTimeZone();
  const [state, close] = useActionState(closePeriodAction, {} as FiscalState);
  useActionToast(state);
  const [aux, setAux] = useState<FiscalState>({});
  useActionToast(aux);
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="grid max-w-4xl grid-cols-1 gap-4">
      <Panel title={t("وضعیتِ فعلی")}>
        {lockDate ? (
          <p className="text-sm">
            {tr('دوره تا {date} بسته است؛ ردیف‌های آن بازه تغییر نمی‌کنند.', {
              date: lockDate,
            })}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            {tr("هیچ دوره‌ای بسته نشده — همهٔ ردیف‌ها قابلِ ویرایش‌اند.")}
          </p>
        )}
      </Panel>

      {/* ماندهٔ فعلیِ حساب‌ها — همان ارقامی که با بستن منجمد می‌شوند (پورتِ جدولِ تبِ بستن). */}
      {closing && (
        <Panel
          title={t("ماندهٔ فعلیِ حساب‌ها")}
          description={tr("با بستنِ دوره، همین ارقام برای هر حساب منجمد و در «گزارش‌ها» نگه داشته می‌شوند.")}
          actions={<a href="/finance" className="text-xs text-muted-foreground hover:text-foreground">{t("مرور کامل در حسابداری")}</a>}
        >
          {closing.accounts.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("حسابی تعریف نشده.")}</p>
          ) : (
            // جدولِ مشترک، نه جدولِ خامِ خودش — همان سرستون و فاصله‌ها.
            <Table frame={false}>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("حساب")}</TableHead>
                  <TableHead numeric>{t("مانده")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {closing.accounts.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>{a.label}</TableCell>
                    <TableNumericCell>{format(a.balance)} {a.currencyCode ?? ''}</TableNumericCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Panel>
      )}

      <Panel
        title={t("بستنِ دوره")}
        description={tr("برای هر حساب یک خلاصهٔ ثابت (گردش و موجودیِ پایانی) ذخیره می‌شود و دوره تا این تاریخ قفل می‌گردد. ردیف‌ها پاک نمی‌شوند، فقط فقط‌خواندنی می‌شوند.")}
      >
        <form action={close} className="grid gap-3">

          <div className="grid gap-1.5 sm:max-w-xs">
            <Label htmlFor="f-date">{t("تاریخِ بستن")}</Label>
            <DatePicker id="f-date" name="lockDate" defaultValue={today} required />
          </div>

          {/*
            ⚠️ اگر قفلی جلوتر از این تاریخ وجود دارد، بستن آن را عقب نمی‌برد
            (R-FISCAL-10) — و کاربر باید این را **پیش** از زدنِ دکمه بداند.
          */}
          {lockDate && (
            <p className="text-xs text-amber-700 dark:text-amber-500">
              {tr('قفلِ فعلی روی {date} است؛ تاریخی قدیمی‌تر از آن، قفل را عقب نمی‌برد.', {
                date: lockDate,
              })}
            </p>
          )}

          <div className="flex items-center gap-3">
            <Submit />
          </div>
          {closing?.lastChange && (
            <p className="num text-xs text-muted-foreground">
              {tr('آخرین تغییر: {date} — {who}', {
                date: formatDateTime(closing.lastChange.at, tz),
                who: closing.lastChange.by || '—',
              })}
            </p>
          )}
        </form>
      </Panel>

      <Panel
        title={t("بازگشاییِ دوره")}
        description={tr("قفل برداشته می‌شود و ردیف‌ها دوباره قابلِ تغییر می‌شوند. خلاصه‌های ثبت‌شده پاک نمی‌شوند.")}
      >

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
        </div>
      </Panel>
    </div>
  );
}
