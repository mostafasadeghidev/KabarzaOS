import { UserName } from '@/components/user-avatar';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableDateCell, TableNumericCell, TableRow,
} from '@/components/ui/table';
import { Section } from '@/components/page-shell';
import { t } from '@/i18n/server';

/** مرخصی‌های تیم در ۳۰ روزِ اخیر — پیش‌تر تبِ «فعالیت ← مرخصی‌ها». */
export function TeamAbsences({
  rows,
}: {
  rows: Array<{ id: number; userId?: number | null; userName: string | null; fromDate: string; toDate: string; note: string }>;
}) {
  return (
    <Section title={t("مرخصی‌های تیم (۳۰ روزِ اخیر)")}>
      {rows.length === 0 ? <p className="text-sm text-muted-foreground">{t("مرخصی‌ای در این بازه نیست")}</p> : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("عضو")}</TableHead>
              <TableHead>{t("از")}</TableHead>
              <TableHead>{t("تا")}</TableHead>
              <TableHead>{t("توضیح")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((a) => (
              <TableRow key={a.id}>
                <TableCell><UserName userId={a.userId} name={a.userName ?? '—'} size="sm" /></TableCell>
                <TableDateCell>{a.fromDate}</TableDateCell>
                <TableDateCell>{a.toDate}</TableDateCell>
                <TableCell>{a.note || '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Section>
  );
}
