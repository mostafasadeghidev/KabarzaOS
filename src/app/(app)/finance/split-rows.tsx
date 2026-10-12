'use client';

import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { FormOptions } from './ledger-view';
import {
  deductionFromRate, grossFromNet, rateOnDate, settledCurrencyId, type Direction,
} from '@/domain/ledger/form-rules';
import { groupDigits } from '@/lib/number-input';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Combobox, type Option } from '@/components/ui/combobox';
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from '@/components/ui/input-group';
import { FieldDescription, FieldLegend, FieldSet } from '@/components/ui/field';
import { useT } from '@/i18n/client';

interface Row { key: number; projectId: number | null; label: string; share: string }

/**
 * «یک واریز برای چند پروژه» (۲.۲۷.۰) — سهمِ هر پروژه از مبلغِ کل.
 *
 * برای هر سهم همان قاعدهٔ ردیفِ تکی: ارزِ قراردادِ همان پروژه، نرخِ روزِ پرداخت
 * (یا نرخِ مشترکی که کاربر برای این واریز می‌نویسد) و هزینهٔ انتقالِ مشترک. خروجی
 * یک ورودیِ پنهانِ JSON (`splits`) است؛ سرور هر سهم را ردیفِ جدا می‌سازد.
 * ⚠️ تا جمعِ سهم‌ها با مبلغِ کل برابر نشود `onValidity(false)` — دکمهٔ ثبت خاموش.
 */
export function SplitRows({
  options, projectOptions, direction, receiverUserId, receiverIsMemberOf, currencyId, entryCode, entryDate, amount,
  onValidity,
}: {
  options: FormOptions;
  projectOptions: Option[];
  direction: Direction;
  receiverUserId: number | null;
  /** گیرنده عضوِ این پروژه است؟ — هزینهٔ انتقال فقط برای پرداخت به عضو. */
  receiverIsMemberOf: (projectId: number) => boolean;
  currencyId: string;
  entryCode: string;
  entryDate: string;
  amount: string;
  onValidity: (ok: boolean) => void;
}) {
  const t = useT();
  const [rows, setRows] = useState<Row[]>([
    { key: 1, projectId: null, label: '', share: '' },
    { key: 2, projectId: null, label: '', share: '' },
  ]);
  const [sharedRate, setSharedRate] = useState('');
  const [fee, setFee] = useState('');
  const codeOf = (id: number | null) => options.currencies.find((c) => c.id === id)?.code ?? '';

  const memberCurrency = useMemo(() => new Map(Object.entries(options.memberCurrency)), [options.memberCurrency]);
  const projectCurrency = useMemo(() => new Map(options.projects.map((p) => [p.id, p.currencyId ?? 0])), [options.projects]);
  const total = Number(amount) || 0;

  const computed = rows.map((r) => {
    const contract = r.projectId ? settledCurrencyId({
      direction, projectId: r.projectId, receiverUserId, memberCurrency, projectCurrency,
      defaultCurrencyId: options.defaultCurrencyId,
    }) : null;
    const share = Number(r.share) || 0;
    const differs = Boolean(contract) && String(contract) !== String(currencyId);
    const suggested = differs ? rateOnDate(options.rates ?? [], contract, Number(currencyId) || null, entryDate) : null;
    const rate = differs ? (Number(sharedRate) > 0 ? Number(sharedRate) : suggested?.rate ?? null) : null;
    const net = differs ? deductionFromRate(share, rate ?? 0) : (share > 0 ? share : null);
    const pct = r.projectId && receiverIsMemberOf(r.projectId) && Number(fee) > 0 && Number(fee) < 100 ? Number(fee) : 0;
    const deduction = net === null ? null : pct > 0 ? grossFromNet(net, pct) : net;
    return { row: r, contract, differs, rate, net, deduction, pct };
  });

  const sum = rows.reduce((s, r) => s + (Number(r.share) || 0), 0);
  const left = Math.round((total - sum) * 100) / 100;
  const missingRate = computed.some((c) => c.differs && c.row.share && c.rate === null);
  const ok = total > 0 && rows.length >= 2 && rows.every((r) => r.projectId && Number(r.share) > 0)
    && Math.abs(left) <= 0.01 && !missingRate;
  useEffect(() => { onValidity(ok); }, [ok, onValidity]);

  const anyDiffers = computed.some((c) => c.differs);
  const anyMember = rows.some((r) => r.projectId && receiverIsMemberOf(r.projectId));
  const parts = computed.filter((c) => c.row.projectId && Number(c.row.share) > 0).map((c) => ({
    projectId: c.row.projectId,
    amount: c.row.share,
    amountSettled: (c.differs || c.pct > 0) && c.deduction !== null ? String(c.deduction) : null,
    settledCurrencyId: c.contract,
    // نرخِ بازار برای جدولِ نرخ‌ها — نه نرخِ آلوده به کارمزد (همان قاعدهٔ ردیفِ تکی).
    fxRate: c.differs && (Number(sharedRate) > 0 || c.pct > 0) && c.rate !== null ? String(c.rate) : null,
  }));

  const set = (key: number, patch: Partial<Row>) => setRows((list) => list.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  /** تقسیمِ مساوی؛ باقی‌ماندهٔ گرد‌کردن به آخری. */
  const splitEqually = () => {
    if (!(total > 0)) return;
    const each = Math.floor((total / rows.length) * 100) / 100;
    setRows((list) => list.map((r, i) => ({
      ...r, share: String(i === list.length - 1 ? Math.round((total - each * (list.length - 1)) * 100) / 100 : each),
    })));
  };

  return (
    <FieldSet variant="box">
      <FieldLegend>{t('تقسیمِ این واریز بین پروژه‌ها')}</FieldLegend>
      <input type="hidden" name="splits" value={JSON.stringify(parts)} />
      <input type="hidden" name="transferFeePct" value={anyMember && Number(fee) > 0 && Number(fee) < 100 ? fee : ''} />

      <div className="grid gap-2">
        {computed.map((c, i) => (
          <div key={c.row.key} className="grid gap-1 rounded-lg border bg-card p-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="num w-5 text-center text-xs text-muted-foreground">{i + 1}</span>
              <div className="min-w-48 flex-1">
                <Combobox
                  options={projectOptions}
                  value={{ id: c.row.projectId, label: c.row.label }}
                  onChange={(v) => set(c.row.key, { projectId: v.id, label: v.label })}
                  placeholder={t('جستجوی پروژه…')}
                />
              </div>
              <InputGroup className="w-48" dir="ltr">
                <InputGroupInput
                  inputMode="decimal" className="num" aria-label={t('سهم از واریز')}
                  placeholder="0" value={c.row.share} onChange={(e) => set(c.row.key, { share: e.target.value })}
                />
                <InputGroupAddon align="inline-end"><InputGroupText className="num">{entryCode}</InputGroupText></InputGroupAddon>
              </InputGroup>
              {rows.length > 2 && (
                <IconButton
                  variant="ghost" className="size-8 text-muted-foreground hover:text-destructive" label={t('حذف')}
                  onClick={() => setRows((list) => list.filter((r) => r.key !== c.row.key))}
                >
                  <Trash2 className="size-3.5" />
                </IconButton>
              )}
            </div>
            {c.row.projectId && c.deduction !== null && (
              <p className="ps-7 text-xs text-muted-foreground">
                {c.pct > 0
                  ? t('به دستش رسید {net} · از طلبش کم می‌شود {gross}', {
                      net: `${groupDigits(String(c.net))} ${codeOf(c.contract)}`,
                      gross: `${groupDigits(String(c.deduction))} ${codeOf(c.contract)}`,
                    })
                  : t('برای این پروژه حساب می‌شود: {amount}', { amount: `${groupDigits(String(c.deduction))} ${codeOf(c.contract)}` })}
              </p>
            )}
            {c.row.projectId && c.differs && c.rate === null && Number(c.row.share) > 0 && (
              <p className="ps-7 text-xs text-amber-700 dark:text-amber-400">
                {t('برای این تاریخ نرخی ثبت نشده — نرخِ این واریز را بنویسید.')}
              </p>
            )}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="outline"
          onClick={() => setRows((list) => [...list, { key: Math.max(...list.map((r) => r.key)) + 1, projectId: null, label: '', share: '' }])}
        >
          <Plus className="size-4" />{t('افزودنِ پروژه')}
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={!(total > 0)} onClick={splitEqually}>
          {t('تقسیمِ مساوی')}
        </Button>
        {anyDiffers && (
          <InputGroup className="w-60" dir="ltr">
            <InputGroupAddon><InputGroupText className="num">1 {codeOf(computed.find((c) => c.differs)?.contract ?? null)} =</InputGroupText></InputGroupAddon>
            <InputGroupInput
              inputMode="decimal" className="num" aria-label={t('نرخِ این واریز')}
              placeholder={t('نرخِ روز')} value={sharedRate} onChange={(e) => setSharedRate(e.target.value)}
            />
            <InputGroupAddon align="inline-end"><InputGroupText className="num">{entryCode}</InputGroupText></InputGroupAddon>
          </InputGroup>
        )}
        {anyMember && (
          <InputGroup className="w-48">
            <InputGroupAddon><InputGroupText>{t('هزینهٔ انتقال')}</InputGroupText></InputGroupAddon>
            <InputGroupInput
              inputMode="decimal" className="num" aria-label={t('هزینهٔ انتقال')}
              placeholder="0" value={fee} onChange={(e) => setFee(e.target.value)}
            />
            <InputGroupAddon align="inline-end"><InputGroupText>%</InputGroupText></InputGroupAddon>
          </InputGroup>
        )}
      </div>

      <FieldDescription className={Math.abs(left) > 0.01 ? 'text-destructive' : 'text-emerald-700 dark:text-emerald-400'}>
        {Math.abs(left) <= 0.01
          ? t('جمعِ سهم‌ها = مبلغِ کل ✓')
          : left > 0
            ? t('جمعِ سهم‌ها {sum} از {total} — {left} مانده است.', { sum: groupDigits(String(sum)), total: groupDigits(String(total)), left: groupDigits(String(left)) })
            : t('جمعِ سهم‌ها {sum} از {total} — {left} بیشتر است.', { sum: groupDigits(String(sum)), total: groupDigits(String(total)), left: groupDigits(String(-left)) })}
      </FieldDescription>
      <FieldDescription>
        {t('هر پروژه ردیفِ جدای خودش را با همین تاریخ و رسید می‌گیرد؛ در دفترکل با نشانِ «۱ از n» کنارِ هم دیده می‌شوند.')}
      </FieldDescription>
    </FieldSet>
  );
}
