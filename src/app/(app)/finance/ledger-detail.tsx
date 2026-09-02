'use client';

import { useState } from 'react';
import { Paperclip } from 'lucide-react';
import type { EntryRow, ReceiptView } from './ledger-view';
import { format } from '@/domain/money/money';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Lightbox } from '@/components/lightbox';
import { formatDateTime } from '@/i18n/datetime';
import { useT, useTimeZone } from '@/i18n/client';

/**
 * بندانگشتیِ رسید — تصویر با بزرگ‌نمایی، فایلِ دیگر با پیوندِ تبِ جدید
 * (پورتِ `receipt_thumb_ro()`). همیشه از مسیرِ گیت‌شده، نه S3 (R-FILE-01).
 */
export function ReceiptThumb({
  receipt,
  index,
  size = 40,
  onZoom,
}: {
  receipt: ReceiptView;
  index: number;
  size?: number;
  onZoom: (src: string) => void;
}) {
  if (receipt.kind === 'image') {
    return (
      <button
        type="button"
        onClick={() => onZoom(receipt.href)}
        title={receipt.originalName || `#${index}`}
        className="shrink-0 overflow-hidden rounded-md border"
        style={{ width: size, height: size }}
      >
        {/* نسخهٔ کوچک — اصلِ چندمگابایتی فقط در بزرگ‌نمایی می‌آید (R-FILE-16). */}
        <img src={`${receipt.href}?thumb`} alt="" loading="lazy" className="size-full object-cover" />
      </button>
    );
  }
  return (
    <a
      href={receipt.href} target="_blank" rel="noopener noreferrer" title={receipt.originalName}
      className="inline-flex items-center gap-0.5 text-muted-foreground hover:text-foreground"
    >
      <Paperclip className="size-3" /><span className="num text-xs">{index}</span>
    </a>
  );
}

/**
 * جزئیاتِ ردیفِ دفتر — پورتِ مودالِ `row_detail_html()`: همهٔ فیلدها،
 * رسیدها با بندانگشتی و بزرگ‌نمایی، و تاریخچهٔ که/کِی.
 */
export function LedgerDetail({
  entry,
  onClose,
  currencyCode,
  showEur,
  tagName,
  currencyCodeOf,
}: {
  entry: EntryRow | null;
  onClose: () => void;
  currencyCode: string | null;
  showEur: boolean;
  tagName: Map<number, string>;
  currencyCodeOf: (id: number) => string;
}) {
  const t = useT();
  const tz = useTimeZone();
  const [zoom, setZoom] = useState<string | null>(null);

  const rows: Array<[string, string]> = [];
  if (entry) {
    const tags = entry.tagIds.map((id) => tagName.get(id)).filter((n): n is string => Boolean(n));
    rows.push([t('تاریخ'), entry.entryDate]);
    rows.push([t('جهت'), entry.direction === 'out' ? t('برداشت / هزینه') : t('واریز / درآمد')]);
    rows.push([t('مبلغ'), `${entry.direction === 'out' ? '−' : '+'}${format(entry.amountAccount)} ${currencyCode ?? ''}`.trim()]);
    if (showEur) rows.push([t('معادل یورو'), entry.eurDisplay === null ? '—' : format(entry.eurDisplay)]);
    if (entry.amountSettled) {
      const code = entry.settledCurrencyId ? currencyCodeOf(entry.settledCurrencyId) : '';
      rows.push([t('معادلِ تسویه'), `${format(entry.amountSettled)} ${code}`.trim()]);
    }
    rows.push([t('پرداخت‌کننده'), entry.payerName || entry.payerLabel || '—']);
    rows.push([t('دریافت‌کننده'), entry.receiverName || entry.receiverLabel || '—']);
    rows.push([t('بابت'), entry.projectTitle ?? '—']);
    rows.push([t('تگ‌ها'), tags.length > 0 ? tags.join('، ') : '—']);
    rows.push([t('توضیحات'), entry.description || '—']);
  }

  return (
    <>
      <Dialog open={entry !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
        <DialogContent dismissable className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center gap-2">
              {t('جزئیات ردیف')}
              {entry?.isTransfer && <Badge variant="secondary" className="font-normal">{t('انتقال')}</Badge>}
            </DialogTitle>
            <DialogDescription className="num">#{entry?.id ?? ''}</DialogDescription>
          </DialogHeader>

          {entry && (
            <div className="grid gap-4 text-sm">
              <table className="w-full">
                <tbody>
                  {rows.map(([label, value]) => (
                    <tr key={label} className="border-t first:border-t-0">
                      <th className="w-36 py-1.5 pe-3 text-start font-normal text-muted-foreground">{label}</th>
                      <td className="py-1.5 break-words">{value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {entry.receipts.length > 0 && (
                <div className="grid gap-2">
                  <h4 className="font-medium">{t('رسیدها')}</h4>
                  <ul className="flex flex-wrap gap-3">
                    {entry.receipts.map((r, n) => (
                      <li key={r.id} className="flex w-24 flex-col items-center gap-1 text-center">
                        <ReceiptThumb receipt={r} index={n + 1} size={72} onZoom={setZoom} />
                        <a
                          href={r.href} target="_blank" rel="noopener noreferrer"
                          className="w-full truncate text-[11px] text-muted-foreground hover:underline"
                          title={r.originalName}
                        >
                          {r.originalName || `#${r.id}`}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="grid gap-2">
                <h4 className="font-medium">{t('تاریخچهٔ تغییرات')}</h4>
                {entry.timeline.length === 0 ? (
                  <p className="text-muted-foreground">—</p>
                ) : (
                  <ul className="grid gap-1">
                    {entry.timeline.map((e, i) => (
                      <li key={i} className="flex flex-wrap items-baseline gap-1">
                        <b>{e.name || '—'}</b>
                        <span>— {e.action === 'create' ? t('ساخت') : t('ویرایش')} ·</span>
                        <span className="num text-xs text-muted-foreground">{formatDateTime(e.at, tz)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <Lightbox src={zoom} onClose={() => setZoom(null)} />
    </>
  );
}
