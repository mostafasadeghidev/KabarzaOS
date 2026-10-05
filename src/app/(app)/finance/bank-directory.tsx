'use client';

import { UserName } from '@/components/user-avatar';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { useT } from '@/i18n/client';
import { SearchInput } from '@/components/ui/search-input';
import { Section } from '@/components/page-shell';

export interface BankRow {
  id: number;
  name: string;
  email: string;
  isFormer: boolean;
  phone: string;
  account: string;
  iban: string;
  card: string;
}

/**
 * دفترچهٔ بانکیِ اعضا — پورتِ `payouts/bank-directory.php`.
 *
 * ⚠️ جستجو در **کلاینت** است و عمدی: فهرست کوچک است (اعضای تیم) و رفت‌وبرگشتِ
 * سرور برای هر حرف، تجربه را بدتر می‌کند نه بهتر. فیلترِ ردیف‌های سابقِ
 * تسویه‌شده اما در **سرور** انجام شده — آن یکی تصمیمِ دسترسی است، نه راحتی.
 */
export function BankDirectory({
  rows,
  showPhone,
}: {
  rows: BankRow[];
  showPhone: boolean;
}) {
  const tr = useT();
  const [query, setQuery] = useState('');

  const needle = query.trim().toLowerCase();
  const shown = needle === ''
    ? rows
    : rows.filter((r) => `${r.name} ${r.email}`.toLowerCase().includes(needle));

  return (
    <Section
      title={tr('اطلاعات حساب اعضا')}
      description={tr('عضوِ سابقی که تسویه شده در این فهرست نیست.')}
      actions={(
        <SearchInput
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={tr('جستجوی عضو')}
        />
      )}
    >

      {shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">{tr('کاربری یافت نشد')}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{tr('عضو')}</TableHead>
              {showPhone && <TableHead>{tr('شماره تماس')}</TableHead>}
              <TableHead>{tr('شماره حساب')}</TableHead>
              <TableHead>{tr('شماره شبا')}</TableHead>
              <TableHead>{tr('شماره کارت')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((r) => (
              <TableRow key={r.id}>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    <UserName userId={r.id} name={r.name} size="sm" />
                    {r.isFormer && (
                      <Badge variant="outline" className="text-[0.65rem]">{tr('سابق')}</Badge>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">{r.email}</span>
                </TableCell>
                {showPhone && <TableCell className="num">{r.phone || '—'}</TableCell>}
                <TableCell className="num">{r.account || '—'}</TableCell>
                <TableCell className="num">{r.iban || '—'}</TableCell>
                <TableCell className="num">{r.card || '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Section>
  );
}
