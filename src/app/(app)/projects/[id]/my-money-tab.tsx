'use client';

import { useActionState, useState, useTransition } from 'react';
import { useFormStatus } from 'react-dom';
import { cancelRequestAction, requestPaymentAction, type MoneyState } from './_form/money-actions';
import { format } from '@/domain/money/money';
import { REQUEST_STATUS_LABELS } from '@/domain/finance/member-money';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Input } from '@/components/ui/input';
import { Field, FieldLabel } from '@/components/ui/field';
import { useActionToast } from '@/components/ui/toast';
import { useT, useTimeZone } from '@/i18n/client';
import { formatDate } from '@/i18n/datetime';
import { Section } from '@/components/page-shell';

export interface UnitRow {
  id: number;
  userId: number;
  userName: string | null;
  /** نامِ یکتای ردیف (۲.۲۱.۰) — خالی = بی‌نام. */
  name: string;
  /** جمعِ ساعتِ ثبت‌شده روی ردیف، به دقیقه. */
  minutes: number;
  /** وضعیتِ کارِ ردیف (۲.۲۲.۰) — جدا از وضعیتِ پرداخت. */
  workStatusTagId: number | null;
  workStatusName: string | null;
  workStatusColor: string | null;
  workStatusGroup: string | null;
  entryDate: string;
  quantity: string;
  amount: string;
  note: string;
  status: string;
  currencyCode: string | null;
  openRequest: { id: number; status: string } | null;
  isMine: boolean;
}

export interface RequestRow {
  id: number;
  amount: string;
  status: string;
  note: string;
  decisionNote: string;
  currencyCode: string | null;
  cancellable: boolean;
  /** رسیدِ ردیفِ دفترِ آینه — فقط پس از پرداخت پر است. */
  receiptIds: number[] | null;
  createdAt: Date | string;
}

/** ردیفِ واقعیِ پرداخت به من — پورتِ فهرستِ `member_payout`. */
export interface PayoutRow {
  id: number;
  paidAt: string | null;
  amount: string;
  amountSettled: string | null;
  currencyCode: string | null;
  note: string;
  receiptIds: number[] | null;
}

export interface MyMoneyData {
  projectId: number;
  /** کارکردِ همهٔ اعضا را می‌بیند و برای هر عضوی ثبت می‌کند (مدیرِ سراسری). */
  seesAll: boolean;
  /** عضوِ پروژه برای خودش — درخواستِ پرداخت می‌دهد (حتی اگر مدیرِ پروژه/تیم باشد). */
  asMember: boolean;
  isFrozen: boolean;
  /**
   * ⚠️ بخشِ «کارکردِ تعدادی» فقط برای پروژهٔ تعدادی است — همان شرطِ
   * `Projects::is_unit_based()` ِ نسخهٔ قبلی. روی پروژهٔ توافقی، ثبتِ تعداد
   * معنایی ندارد (نرخِ هر واحدی وجود ندارد) و فرمش گمراه‌کننده بود.
   * «درخواستِ پرداخت» اما همیشه می‌ماند؛ به تعدادی‌بودن ربطی ندارد.
   */
  isUnitBased: boolean;
  /** مسئولِ پروژه مبلغِ هر ردیف را بزند؟ (۲.۲۰.۰) — خالی‌گذاشتن = نرخِ توافقی. */
  unitManualAmount: boolean;
  units: UnitRow[];
  myUnpaidUnits: string;
  requests: RequestRow[];
  remaining: string;
  /** پورتِ «مبلغ توافقی شما» · «به شما پرداخت‌شده» · «مانده (وضعیت)». */
  agreed: string;
  paid: string;
  /** ارزِ قرارداد — همهٔ ارقامِ خلاصه و درخواست در این ارزند. */
  currencyCode: string | null;
  status: string;
  payouts: PayoutRow[];
  available: string;
  outstanding: string;
  members: Array<{ id: number; name: string }>;
  today: string;
}


/** برچسبِ وضعیتِ تسویه — پورتِ `Payments::status_label`. */
export const PAY_STATUS_LABELS: Record<string, string> = {
  unpaid: 'پرداخت‌نشده',
  partial: 'پرداختِ جزئی',
  paid: 'تسویه‌شده',
};

function Submit({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  const tr = useT();
  return <Button type="submit" size="sm" disabled={pending}>{pending ? <><Spinner />{tr('صبر کنید…')}</> : children}</Button>;
}

/**
 * «پولِ من» — کارکردِ تعدادی و درخواستِ پرداخت.
 *
 * ⚠️ این تب **مجوزِ مالی نمی‌خواهد**: پولِ خودِ عضو است و در نسخهٔ قبلی هم روی
 * داشبوردِ خودش دیده می‌شود. عضو فقط ردیف‌های خودش را می‌بیند؛ مدیر همه را.
 */
export function MyMoneyTab({ data }: { data: MyMoneyData }) {
  const tr = useT();
  const t = useT();
  const tz = useTimeZone();
  const [reqState, requestPayment] = useActionState(requestPaymentAction, {} as MoneyState);
  useActionToast(reqState);
  const [pending, startTransition] = useTransition();
  const [rowError, setRowError] = useState<string | null>(null);

  const run = (fn: () => Promise<MoneyState>) =>
    startTransition(async () => setRowError((await fn()).error ?? null));

  return (
    <div className="grid gap-4">

      {/*
        ── پولِ من روی این پروژه ──
        ⚠️ خلاصه (توافقی/پرداختی/مانده) و ردیف‌های پرداخت برای **مدیری که
        خودش هم عضو است** هم نشان داده می‌شود؛ پیش از این کلِ بخش با
        `!canManage` بسته می‌شد و تبِ مالیِ چنین کاربری خالی بود. فرمِ
        «درخواستِ پرداخت» فقط برای مدیرِ سراسری نمی‌آید (`asMember`) — مدیرِ
        پروژه/تیم که خودش عضو است، مثلِ هر عضوی درخواست می‌دهد.
      */}
      {(
        <Section title={t("درخواستِ پرداخت")}>

          <div className="flex flex-wrap gap-4 text-sm">
            <span>{t("مبلغ توافقی شما:")} <b className="num">{format(data.agreed)} {data.currencyCode}</b></span>
            <span>{t("به شما پرداخت‌شده:")} <b className="num">{format(data.paid)} {data.currencyCode}</b></span>
            <span>
              {t("ماندهٔ قرارداد:")} <b className="num">{format(data.remaining)} {data.currencyCode}</b>
              <Badge variant={data.status === 'paid' ? 'success' : data.status === 'partial' ? 'warning' : 'outline'} className="ms-1">
                {t(PAY_STATUS_LABELS[data.status] ?? data.status)}
              </Badge>
            </span>
            <span>{t("درخواست‌های باز:")} <b className="num">{format(data.outstanding)} {data.currencyCode}</b></span>
            <span>{t("قابلِ درخواست:")} <b className="num">{format(data.available)} {data.currencyCode}</b></span>
          </div>

          {data.requests.length > 0 && (
            <ul className="grid gap-1">
              {data.requests.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm">
                  <b className="num">{format(r.amount)}</b>
                  <span className="num text-xs text-muted-foreground">{formatDate(r.createdAt, tz)}</span>
                  <Badge variant={r.status === 'paid' ? 'success' : 'outline'}>
                    {t(REQUEST_STATUS_LABELS[r.status] ?? r.status)}
                  </Badge>
                  {/* رسیدِ پرداخت — پورتِ ستونِ «رسید» ِ نسخهٔ قبلی در پولِ من. */}
                  {r.status === 'paid' && (r.receiptIds?.length ?? 0) > 0 && (
                    <a
                      href={`/api/files/${r.receiptIds![0]}`}
                      target="_blank"
                      rel="noopener"
                      className="text-xs text-primary hover:underline"
                    >
                      {t('رسید')}
                    </a>
                  )}
                  {r.note && <span className="text-xs text-muted-foreground">{r.note}</span>}
                  {r.decisionNote && (
                    <span className="text-xs text-muted-foreground">· {r.decisionNote}</span>
                  )}
                  {/* ⚠️ فقط درخواستِ «در انتظار» لغو می‌شود؛ تأییدشده تصمیمِ حسابدار است. */}
                  {r.cancellable && (
                    <Button
                      size="sm" variant="ghost" className="ms-auto" disabled={pending}
                      onClick={() => run(() => cancelRequestAction(r.id, data.projectId))}
                    >
                      {tr("لغو")}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {/* پورتِ «پرداختی‌های شما»: ردیف‌های واقعیِ حسابداری با رسید. */}
          <div className="grid gap-1">
            <h4 className="text-xs font-semibold text-muted-foreground">{t("پرداختی‌های شما")}</h4>
            {data.payouts.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("هنوز پرداختی برای شما ثبت نشده.")}</p>
            ) : (
              <ul className="grid gap-1">
                {data.payouts.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm">
                    <span className="num text-xs text-muted-foreground">{p.paidAt ?? '—'}</span>
                    <b className="num">{format(p.amountSettled ?? p.amount)} {p.currencyCode ?? ''}</b>
                    {p.note && <span className="text-xs text-muted-foreground">{p.note}</span>}
                    {(p.receiptIds?.length ?? 0) > 0 && (
                      <a href={`/api/files/${p.receiptIds![0]}`} target="_blank" rel="noopener" className="text-xs text-primary hover:underline">
                        {t('رسید')}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* فرمِ درخواست برای عضو — مدیرِ سراسری پرداخت را خودش در حسابداری ثبت می‌کند. */}
          {!data.asMember ? null : Number(data.available) > 0 ? (
            <form action={requestPayment} className="flex flex-wrap items-end gap-2 rounded-xl border bg-card p-3">
              <input type="hidden" name="projectId" value={data.projectId} />
              <Field>
                <FieldLabel htmlFor="r-amount">{t("مبلغ")}</FieldLabel>
                <Input
                  id="r-amount" name="amount" inputMode="decimal" className="num w-36" required
                  placeholder={format(data.available)}
                />
              </Field>
              <Field className="flex-1">
                <FieldLabel htmlFor="r-note">{t("توضیح")}</FieldLabel>
                <Input id="r-note" name="note" placeholder={t("اختیاری")} />
              </Field>
              <Submit>{t("ثبتِ درخواست")}</Submit>
            </form>
          ) : data.requests.some((r) => r.status === 'pending' || r.status === 'approved') ? null : (
            /* ⚠️ با درخواستِ باز پیام لازم نیست — خودِ درخواست بالاتر دیده می‌شود (نسخهٔ قبلی هم پنهانش می‌کرد). */
            <p className="text-xs text-muted-foreground">
              {/* ⚠️ قراردادِ صفر یعنی مدیر هنوز مبلغِ توافقی را تعیین نکرده — نه اینکه همه‌اش پرداخت شده. */}
              {data.isUnitBased
                ? tr("برای پروژهٔ تعدادی، کارکرد را بالا ثبت کنید و کنارِ هر ردیف «درخواست پرداخت» را بزنید.")
                : Number(data.agreed) > 0
                  ? tr("مبلغِ قابلِ درخواستی ندارید — یا مانده صفر است یا درخواستِ بازی دارید.")
                  : tr("مبلغِ توافقیِ شما در این پروژه هنوز تعیین نشده؛ پس از تعیین، اینجا درخواست می‌دهید.")}
            </p>
          )}
        </Section>
      )}
    </div>
  );
}
