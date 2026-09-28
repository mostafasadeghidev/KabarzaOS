import { getSettlement } from '@/server/people/settlement-service';
import { getMyProfile } from '@/server/people/profile-service';
import { format } from '@/domain/money/money';
import type { Actor } from '@/domain/access/permissions';
import { BankCard } from './profile/bank-card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableNumericCell, TableRow,
} from '@/components/ui/table';
import { logout } from '@/app/login/actions';
import { t } from '@/i18n/server';
import { Button } from '@/components/ui/button';
import { PageHeader, PageShell, Section } from '@/components/page-shell';
import { LogOut } from 'lucide-react';

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
    <PageShell width="reading">
      <header className="flex items-center justify-between border-b pb-3">
        <strong className="text-sm">{me.name}</strong>
        <form action={logout}>
          <Button type="submit" variant="ghost" size="xs" className="text-muted-foreground">
            <LogOut />
            {t("خروج")}
          </Button>
        </form>
      </header>

      <PageHeader
        title={t("امور مالی شما")}
        description={t("همکاری شما با تیم پایان یافته است. این صفحه فقط برای پیگیریِ تسویهٔ مالیِ شما در دسترس است.")}
      />

      <BankCard bank={me.bank} card={me.bank.card} />

      <Section title={t("وضعیت دریافتی‌های شما")}>
        {settlement.rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("موردی برای نمایش نیست")}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("پروژه")}</TableHead>
                <TableHead numeric>{t("توافق‌شده")}</TableHead>
                <TableHead numeric>{t("پرداخت‌شده")}</TableHead>
                <TableHead numeric>{t("مانده")}</TableHead>
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
      </Section>

      {settlement.noProjectPayouts.length > 0 && (
        <Section title={t("دریافتی‌های بدون پروژه")}>
          <ul className="grid gap-1">
            {settlement.noProjectPayouts.map((p) => (
              <li key={p.id} className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2 text-sm">
                <span className="num font-medium">{format(p.amount)}</span>
                {p.paidAt && <span className="num text-xs text-muted-foreground">{p.paidAt}</span>}
                {p.note && <span className="text-xs text-muted-foreground">{p.note}</span>}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </PageShell>
  );
}
