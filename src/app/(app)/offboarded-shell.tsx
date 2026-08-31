import { getSettlement } from '@/server/people/settlement-service';
import { getMyProfile } from '@/server/people/profile-service';
import { format } from '@/domain/money/money';
import type { Actor } from '@/domain/access/permissions';
import { BankCard } from './profile/bank-card';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableNumericCell, TableRow,
} from '@/components/ui/table';
import { logout } from '@/app/login/actions';
import { t } from '@/i18n/server';

/**
 * نمای عضوِ سابقِ «فقط مالی» — پورتِ `render_offboarded_finance()`.
 *
 * ⚠️ این نما **جای کلِ اپ** را می‌گیرد، نه اینکه یک صفحهٔ دیگر باشد: هر
 * آدرسی که بزند همین را می‌بیند. عمداً هیچ پیمایشی ندارد — نه پروژه، نه
 * تسک، نه فایل، نه پیام، نه دکمهٔ «درخواستِ پرداخت». فقط:
 *  · اطلاعاتِ بانکیِ **قابلِ ویرایش**، تا تسویهٔ نهایی به او پرداخت شود
 *  · ماندهٔ طلبش روی همهٔ پروژه‌هایی که کار کرده
 */
export async function OffboardedShell({ actor }: { actor: Actor }) {
  const [me, settlement] = await Promise.all([
    getMyProfile(actor),
    getSettlement(actor),
  ]);

  return (
    <div className="mx-auto grid max-w-3xl gap-5 p-6">
      <header className="flex items-center justify-between border-b pb-3">
        <strong className="text-sm">{me.name}</strong>
        <form action={logout}>
          <button type="submit" className="text-xs text-muted-foreground hover:text-foreground">
            {t("⎋ خروج")}
          </button>
        </form>
      </header>

      <div>
        <h1 className="text-xl font-semibold">{t("امور مالی شما")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("همکاری شما با تیم پایان یافته است. این صفحه فقط برای پیگیریِ تسویهٔ مالیِ شما در دسترس است.")}
        </p>
      </div>

      <BankCard bank={me.bank} card={me.bank.card} />

      <section className="grid gap-2">
        <h2 className="text-sm font-semibold">{t("وضعیت دریافتی‌های شما")}</h2>
        {settlement.rows.length === 0 ? (
          <EmptyState title={t("موردی برای نمایش نیست")} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("پروژه")}</TableHead>
                <TableHead>{t("توافق‌شده")}</TableHead>
                <TableHead>{t("پرداخت‌شده")}</TableHead>
                <TableHead>{t("مانده")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {settlement.rows.map((row) => (
                <TableRow key={row.projectId}>
                  {/* ⚠️ برچسبِ ساده، نه پیوند. */}
                  <TableCell>{row.title}</TableCell>
                  <TableNumericCell>{format(row.agreed)} {row.currencyCode}</TableNumericCell>
                  <TableNumericCell>{format(row.paid)} {row.currencyCode}</TableNumericCell>
                  <TableNumericCell className="font-semibold">
                    {format(row.remaining)} {row.currencyCode}
                  </TableNumericCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      {settlement.noProjectPayouts.length > 0 && (
        <section className="grid gap-2">
          <h2 className="text-sm font-semibold">{t("دریافتی‌های بدون پروژه")}</h2>
          <ul className="grid gap-1">
            {settlement.noProjectPayouts.map((p) => (
              <li key={p.id} className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm">
                <span className="num font-medium">{format(p.amount)}</span>
                {p.paidAt && <span className="num text-xs text-muted-foreground">{p.paidAt}</span>}
                {p.note && <span className="text-xs text-muted-foreground">{p.note}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
