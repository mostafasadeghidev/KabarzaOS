'use client';

import { useState } from 'react';
import { Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { useT } from '@/i18n/client';

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
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium">{tr('اطلاعات حساب اعضا')}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {tr('عضوِ سابقی که تسویه شده در این فهرست نیست.')}
          </p>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute inset-inline-start-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={tr('جستجوی عضو')}
            className="h-9 w-56 ps-8"
          />
        </div>
      </div>

      {shown.length === 0 ? (
        <EmptyState title={tr('کاربری یافت نشد')} />
      ) : (
        <div className="overflow-x-auto">
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
                      {r.name}
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
        </div>
      )}
    </div>
  );
}
