import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { currentActor } from '@/server/auth';
import { getInvoice } from '@/server/finance/invoice-service';
import { ForbiddenError } from '@/domain/access/guard';
import { format, type Currency } from '@/domain/money/money';
import { EmptyState } from '@/components/ui/empty-state';
import { primeTranslations, t } from '@/i18n/server';
import { PrintButton } from '@/components/print-button';

/**
 * فاکتورِ پروژه — سندِ قابلِ چاپ.
 *
 * ⚠️ صفحهٔ جدا و ساده است تا `Ctrl+P` سندِ تمیز بدهد: بدونِ سایدبار،
 * بدونِ دکمه (کلاسِ `print:hidden`)، و با جدولی که در چاپ نمی‌شکند.
 */
export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  /**
   * ⚠️ هر صفحه **خودش** ترجمه را آماده می‌کند و به چیدمان تکیه نمی‌کند:
   * در ناوبریِ سمتِ کلاینت، Next فقط بخشِ صفحه را دوباره رندر می‌کند و
   * چیدمان را از درختِ کش‌شده برمی‌دارد — پس `primeTranslations()` ِ
   * چیدمان اجرا نمی‌شود و `t()` رشتهٔ فارسیِ مبدأ را برمی‌گرداند.
   * `cache()` تضمین می‌کند در هر درخواست فقط یک بار اجرا شود.
   */
  await primeTranslations();

  const actor = await currentActor();
  if (!actor) redirect('/login');

  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();

  let data;
  try {
    data = await getInvoice(actor, id);
  } catch (error) {
    if (error instanceof ForbiddenError) {
      // پورتِ افزونه: شناسهٔ ناموجود «پروژه یافت نشد» می‌گوید، نه «دسترسی ندارید».
      if (error.message === 'project.not_found') {
        return <main className="p-6"><EmptyState title={t("پروژه یافت نشد")} /></main>;
      }
      return (
        <main className="p-6">
          <EmptyState title={t("دسترسی ندارید")} description={t("دیدنِ فاکتور مجوزِ مالی می‌خواهد.")} />
        </main>
      );
    }
    throw error;
  }

  const cur = data.currencyCode ?? '';
  // پورتِ `Money::format`: اعشار از خودِ ارز (تومان = ۰).
  const currency = { id: 0, code: cur, symbol: '', decimals: data.currencyDecimals } as Currency;
  const money = (v: string) => `${format(v, currency)} ${cur}`.trim();

  return (
    <main className="mx-auto grid max-w-3xl gap-6 p-6 print:max-w-none print:p-0">
      <div className="flex items-center justify-between print:hidden">
        <Link href={`/projects/${id}`} className="text-xs text-muted-foreground hover:underline">
          {t("← بازگشت به پروژه")}
        </Link>
        <div className="flex items-center gap-3">
          {!data.issuable && (
            <span className="text-xs text-amber-600 dark:text-amber-500">
              {t("این پروژه کارفرما یا مبلغی ندارد؛ فاکتور صرفاً پیش‌نمایش است.")}
            </span>
          )}
          {data.rateMissing > 0 && (
            <span className="text-xs text-destructive">
              {t('{n} ردیف نرخِ تبدیل به ارزِ پروژه ندارد و صفر شمرده شده.', { n: data.rateMissing })}
            </span>
          )}
          <PrintButton />
        </div>
      </div>

      <header className="flex flex-wrap items-start justify-between gap-4 border-b pb-4">
        <div className="grid gap-0.5">
          {/*
            ⚠️ لوگو از مسیرِ گیت‌شدهٔ فایل می‌آید (D-009)، نه لینکِ مستقیمِ
            ذخیره‌گاه. `next/image` اینجا لازم نیست: فاکتور چاپ می‌شود و
            بهینه‌سازیِ تصویر فقط یک لایهٔ اضافه است.
          */}
          {data.issuer.logoFileId && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/files/${data.issuer.logoFileId}`}
              alt={data.issuer.name}
              className="mb-2 h-14 w-auto max-w-[12rem] object-contain"
            />
          )}
          {data.issuer.name && <h1 className="text-lg font-bold">{data.issuer.name}</h1>}
          {data.issuer.address && (
            <p className="text-xs whitespace-pre-line text-muted-foreground">{data.issuer.address}</p>
          )}
          {data.issuer.taxId && (
            <p className="num text-xs text-muted-foreground">{t('شناسهٔ مالیاتی: {id}', { id: data.issuer.taxId })}</p>
          )}
          {(data.issuer.phone || data.issuer.email) && (
            <p className="text-xs text-muted-foreground">
              {[data.issuer.phone, data.issuer.email].filter(Boolean).join(' · ')}
            </p>
          )}
          {data.issuer.website && (
            <p className="text-xs text-muted-foreground">{data.issuer.website}</p>
          )}
        </div>

        <table className="text-sm">
          <tbody>
            <tr>
              <td className="pe-3 text-muted-foreground">{t("شمارهٔ فاکتور")}</td>
              <td className="num font-semibold" dir="ltr">{data.number}</td>
            </tr>
            <tr>
              <td className="pe-3 text-muted-foreground">{t("تاریخ")}</td>
              <td className="num" dir="ltr">{data.issuedOn}</td>
            </tr>
          </tbody>
        </table>
      </header>

      <section className="grid gap-0.5">
        <p className="text-xs text-muted-foreground">{t("صورت‌حساب برای")}</p>
        {data.clients.length > 0 && (
          <p className="font-medium">{data.clients.join(t('، '))}</p>
        )}
        <p className="text-sm text-muted-foreground">{t('پروژه: {title}', { title: data.project.title })}</p>
      </section>

      <section>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-start">
              <th className="py-2 text-start font-medium">{t("شرح")}</th>
              <th className="py-2 text-start font-medium">{t("تاریخ")}</th>
              <th className="py-2 text-end font-medium">{t("مبلغ")}</th>
            </tr>
          </thead>
          <tbody>
            {data.charges.map((line, i) => (
              <tr key={i} className="border-b last:border-0">
                <td className="py-2">{t(line.description)}</td>
                <td className="num py-2" dir="ltr">{line.date ?? '—'}</td>
                <td className="num py-2 text-end">{money(line.amount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2">
              <th colSpan={2} className="py-2 text-start">{t("مجموع صورت‌حساب")}</th>
              <th className="num py-2 text-end">{money(data.totals.totalDue)}</th>
            </tr>
          </tfoot>
        </table>
      </section>

      {data.receipts.length > 0 && (
        <section className="grid gap-2">
          <h2 className="text-sm font-semibold">{t("پرداخت‌های دریافت‌شده")}</h2>
          <table className="w-full text-sm">
            <tbody>
              {data.receipts.map((line, i) => (
                <tr key={i} className="border-b last:border-0">
                  <td className="py-2">{t(line.description)}</td>
                  <td className="num py-2" dir="ltr">{line.date ?? '—'}</td>
                  <td className="num py-2 text-end">{money(line.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="flex justify-end">
        <table className="min-w-72 text-sm">
          <tbody>
            <tr>
              <td className="py-1.5 text-muted-foreground">{t("مجموع صورت‌حساب")}</td>
              <td className="num py-1.5 text-end">{money(data.totals.totalDue)}</td>
            </tr>
            <tr>
              <td className="py-1.5 text-muted-foreground">{t("پرداخت‌شده")}</td>
              <td className="num py-1.5 text-end">{money(data.totals.paid)}</td>
            </tr>
            <tr className="border-t-2">
              <td className="py-2 font-bold text-destructive">{t("ماندهٔ قابل پرداخت")}</td>
              <td className="num py-2 text-end text-base font-bold text-destructive">
                {money(data.totals.remaining)}
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      {data.issuer.bank && (
        <section className="grid gap-1 border-t pt-4">
          <h2 className="text-sm font-semibold">{t("اطلاعاتِ پرداخت")}</h2>
          <p className="text-xs whitespace-pre-line text-muted-foreground">{data.issuer.bank}</p>
        </section>
      )}

      {data.issuer.footer && (
        <p className="border-t pt-4 text-xs whitespace-pre-line text-muted-foreground">
          {data.issuer.footer}
        </p>
      )}
    </main>
  );
}
