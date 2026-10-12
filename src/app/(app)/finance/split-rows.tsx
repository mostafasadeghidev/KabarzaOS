'use client';

import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { FormOptions } from './ledger-view';
import {
  deductionFromRate, grossFromNet, rateOnDate, settledCurrencyId, splitByDeduction, type Direction,
} from '@/domain/ledger/form-rules';
import { groupDigits } from '@/lib/number-input';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Combobox, type Option } from '@/components/ui/combobox';
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from '@/components/ui/input-group';
import { FieldDescription, FieldLegend, FieldSet } from '@/components/ui/field';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useT } from '@/i18n/client';

interface Row {
  key: number;
  projectId: number | null;
  label: string;
  /** سهم از واریز، به ارزِ حساب (حالتِ «به ارزِ حساب»). */
  share: string;
  /** کسر از طلب، به ارزِ قرارداد (حالتِ «به ارزِ قرارداد»). */
  deduction: string;
  /** درصدِ هزینهٔ انتقالِ همین پروژه؛ خالی = درصدِ مشترک. */
  fee: string;
}

const emptyRow = (key: number): Row => ({ key, projectId: null, label: '', share: '', deduction: '', fee: '' });
const money = (n: number) => groupDigits(String(Math.round(n * 100) / 100));

/**
 * «یک واریز برای چند پروژه» (۲.۲۷.۰، دو حالت از ۲.۲۸.۰).
 *
 * · **به ارزِ قرارداد** (پیش‌فرض): برای هر پروژه یوروی کسر از طلب را می‌نویسی؛
 *   نرخ از «مبلغِ کل ÷ جمعِ یوروی رسیده» درمی‌آید (`splitByDeduction`) و سهمِ هر
 *   پروژه از مبلغِ کل خودکار — جمعش همیشه دقیقاً مبلغِ کل است.
 * · **به ارزِ حساب**: سهمِ هر پروژه را می‌نویسی و یورو با نرخِ روز (یا نرخِ نوشته‌شده)
 *   پر می‌شود — همان قاعدهٔ ردیفِ تکی.
 * هزینهٔ انتقال اختیاری است: یک درصدِ مشترک و برای هر پروژه قابلِ تغییر؛ یوروی
 * رسیده = کسر × (۱ − درصد). فقط برای پروژه‌ای که گیرنده عضوش است.
 * ⚠️ تا سهم‌ها کامل و جمع درست نباشد `onValidity(false)` — دکمهٔ ثبت خاموش.
 */
export function SplitRows({
  options, projectOptions, direction, receiverUserId, receiverIsMemberOf, currencyId, entryCode, entryDate, amount,
  onValidity, onLabels,
}: {
  options: FormOptions;
  projectOptions: Option[];
  direction: Direction;
  receiverUserId: number | null;
  receiverIsMemberOf: (projectId: number) => boolean;
  currencyId: string;
  entryCode: string;
  entryDate: string;
  amount: string;
  onValidity: (ok: boolean) => void;
  /** نامِ پروژه‌های انتخاب‌شده — برچسبِ خودکارِ «بابت پروژه» در خانهٔ توضیحات (۲.۲۹.۰). */
  onLabels?: (labels: string[]) => void;
}) {
  const t = useT();
  const [mode, setMode] = useState<'contract' | 'account'>('contract');
  const [rows, setRows] = useState<Row[]>([emptyRow(1), emptyRow(2)]);
  const [sharedRate, setSharedRate] = useState('');
  const [fee, setFee] = useState('');
  const codeOf = (id: number | null) => options.currencies.find((c) => c.id === id)?.code ?? '';

  const memberCurrency = useMemo(() => new Map(Object.entries(options.memberCurrency)), [options.memberCurrency]);
  const projectCurrency = useMemo(() => new Map(options.projects.map((p) => [p.id, p.currencyId ?? 0])), [options.projects]);
  const total = Number(amount) || 0;
  const typedRate = Number(sharedRate) > 0 ? Number(sharedRate) : null;

  const base = rows.map((r) => {
    const contract = r.projectId ? settledCurrencyId({
      direction, projectId: r.projectId, receiverUserId, memberCurrency, projectCurrency,
      defaultCurrencyId: options.defaultCurrencyId,
    }) : null;
    const member = r.projectId ? receiverIsMemberOf(r.projectId) : false;
    const raw = r.fee.trim() !== '' ? Number(r.fee) : Number(fee);
    const pct = member && raw > 0 && raw < 100 ? raw : 0;
    return { row: r, contract, member, pct, differs: Boolean(contract) && String(contract) !== String(currencyId) };
  });

  // حالتِ «به ارزِ قرارداد» فقط وقتی همهٔ پروژه‌ها یک ارزِ قرارداد دارند — وگرنه «یوروی کل» معنا ندارد.
  const contracts = new Set(base.filter((b) => b.contract).map((b) => b.contract));
  const mixed = contracts.size > 1;
  const effectiveMode = mixed ? 'account' : mode;
  const contractCode = codeOf(base.find((b) => b.contract)?.contract ?? null);

  const byDeduction = splitByDeduction(total, base.map((b) => ({ deduction: Number(b.row.deduction) || 0, feePct: b.pct })), typedRate);

  const computed = base.map((b, i) => {
    if (effectiveMode === 'contract') {
      const deduction = Number(b.row.deduction) > 0 ? Number(b.row.deduction) : null;
      return { ...b, share: byDeduction.shares[i] ?? 0, net: byDeduction.nets[i] ?? 0, deduction, rate: byDeduction.rate };
    }
    const share = Number(b.row.share) || 0;
    const suggested = b.differs ? rateOnDate(options.rates ?? [], b.contract, Number(currencyId) || null, entryDate) : null;
    const rate = b.differs ? (typedRate ?? suggested?.rate ?? null) : null;
    const net = b.differs ? deductionFromRate(share, rate ?? 0) : (share > 0 ? share : null);
    const deduction = net === null ? null : b.pct > 0 ? grossFromNet(net, b.pct) : net;
    return { ...b, share, net: net ?? 0, deduction, rate };
  });

  const sum = computed.reduce((s, c) => s + (c.share || 0), 0);
  const left = Math.round((total - sum) * 100) / 100;
  const filled = computed.every((c) => c.row.projectId && (effectiveMode === 'contract' ? Number(c.row.deduction) > 0 : c.share > 0));
  const missingRate = computed.some((c) => c.differs && c.rate === null && (c.share > 0 || Number(c.row.deduction) > 0));
  const ok = total > 0 && rows.length >= 2 && filled && !missingRate && Math.abs(left) <= 0.01;
  useEffect(() => { onValidity(ok); }, [ok, onValidity]);
  const labelsKey = rows.filter((r) => r.projectId && r.label).map((r) => r.label).join('\u0001');
  useEffect(() => { onLabels?.(labelsKey ? labelsKey.split('\u0001') : []); }, [labelsKey, onLabels]);

  const anyMember = base.some((b) => b.member);
  const anyDiffers = base.some((b) => b.differs);
  const parts = computed.filter((c) => c.row.projectId && c.share > 0).map((c) => ({
    projectId: c.row.projectId,
    amount: (Math.round(c.share * 100) / 100).toString(),
    amountSettled: (c.differs || c.pct > 0 || effectiveMode === 'contract') && c.deduction !== null ? String(c.deduction) : null,
    settledCurrencyId: c.contract,
    // نرخِ بازار برای جدولِ نرخ‌ها — بی‌کارمزد (یوروی رسیده، نه کسر).
    fxRate: c.differs && c.rate !== null && (effectiveMode === 'contract' || typedRate !== null || c.pct > 0) ? String(c.rate) : null,
    transferFeePct: c.pct > 0 ? String(c.pct) : null,
  }));

  const set = (key: number, patch: Partial<Row>) => setRows((list) => list.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  /** تقسیمِ مساوی؛ باقی‌ماندهٔ گرد‌کردن به آخری (فقط حالتِ «به ارزِ حساب»). */
  const splitEqually = () => {
    if (!(total > 0)) return;
    const each = Math.floor((total / rows.length) * 100) / 100;
    setRows((list) => list.map((r, i) => ({
      ...r, share: String(i === list.length - 1 ? Math.round((total - each * (list.length - 1)) * 100) / 100 : each),
    })));
  };

  const totalDeduction = computed.reduce((s, c) => s + (c.deduction ?? 0), 0);
  const totalNet = computed.reduce((s, c) => s + (c.net || 0), 0);

  return (
    <FieldSet variant="box">
      <FieldLegend>{t('تقسیمِ این واریز بین پروژه‌ها')}</FieldLegend>
      <input type="hidden" name="splits" value={JSON.stringify(parts)} />

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">{t('سهمِ هر پروژه را بنویسم به')}</span>
        <ToggleGroup
          type="single" variant="outline" size="sm" value={effectiveMode}
          onValueChange={(v) => { if (v) setMode(v as typeof mode); }}
        >
          <ToggleGroupItem value="contract" disabled={mixed}>{t('ارزِ قرارداد ({code})', { code: contractCode || '—' })}</ToggleGroupItem>
          <ToggleGroupItem value="account">{t('ارزِ حساب ({code})', { code: entryCode })}</ToggleGroupItem>
        </ToggleGroup>
        {mixed && <span className="text-xs text-amber-700 dark:text-amber-400">{t('ارزِ قراردادِ پروژه‌ها یکی نیست؛ سهم را به ارزِ حساب بنویسید.')}</span>}
      </div>

      <div className="grid gap-2">
        {computed.map((c, i) => (
          <div key={c.row.key} className="grid gap-1 rounded-lg border bg-card p-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="num w-5 text-center text-xs text-muted-foreground">{i + 1}</span>
              <div className="min-w-44 flex-1">
                <Combobox
                  options={projectOptions}
                  value={{ id: c.row.projectId, label: c.row.label }}
                  onChange={(v) => set(c.row.key, { projectId: v.id, label: v.label })}
                  placeholder={t('جستجوی پروژه…')}
                />
              </div>
              {effectiveMode === 'contract' ? (
                <InputGroup className="w-40" dir="ltr">
                  <InputGroupInput
                    inputMode="decimal" className="num" aria-label={t('از طلب کم شود')}
                    placeholder="0" value={c.row.deduction} onChange={(e) => set(c.row.key, { deduction: e.target.value })}
                  />
                  <InputGroupAddon align="inline-end"><InputGroupText className="num">{codeOf(c.contract) || contractCode}</InputGroupText></InputGroupAddon>
                </InputGroup>
              ) : (
                <InputGroup className="w-44" dir="ltr">
                  <InputGroupInput
                    inputMode="decimal" className="num" aria-label={t('سهم از واریز')}
                    placeholder="0" value={c.row.share} onChange={(e) => set(c.row.key, { share: e.target.value })}
                  />
                  <InputGroupAddon align="inline-end"><InputGroupText className="num">{entryCode}</InputGroupText></InputGroupAddon>
                </InputGroup>
              )}
              {c.member && (
                <InputGroup className="w-24" dir="ltr">
                  <InputGroupInput
                    inputMode="decimal" className="num" aria-label={t('هزینهٔ انتقالِ این پروژه')}
                    placeholder={fee || '0'} value={c.row.fee} onChange={(e) => set(c.row.key, { fee: e.target.value })}
                  />
                  <InputGroupAddon align="inline-end"><InputGroupText>%</InputGroupText></InputGroupAddon>
                </InputGroup>
              )}
              {rows.length > 2 && (
                <IconButton
                  variant="ghost" className="size-8 text-muted-foreground hover:text-destructive" label={t('حذف')}
                  onClick={() => setRows((list) => list.filter((r) => r.key !== c.row.key))}
                >
                  <Trash2 className="size-3.5" />
                </IconButton>
              )}
            </div>
            {c.row.projectId && c.deduction !== null && c.share > 0 && (
              <p className="ps-7 text-xs text-muted-foreground">
                {t('سهم از واریز {share} · به دستش رسید {net} · از طلبش کم می‌شود {gross}', {
                  share: `${money(c.share)} ${entryCode}`,
                  net: `${money(c.net)} ${codeOf(c.contract)}`,
                  gross: `${money(c.deduction)} ${codeOf(c.contract)}`,
                })}
                {c.pct > 0 && ` · ${t('هزینهٔ انتقال {pct}٪', { pct: c.pct })}`}
              </p>
            )}
            {c.row.projectId && c.differs && c.rate === null && (c.share > 0 || Number(c.row.deduction) > 0) && (
              <p className="ps-7 text-xs text-amber-700 dark:text-amber-400">
                {t('برای این تاریخ نرخی ثبت نشده — نرخِ این واریز را بنویسید.')}
              </p>
            )}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="outline"
          onClick={() => setRows((list) => [...list, emptyRow(Math.max(...list.map((r) => r.key)) + 1)])}
        >
          <Plus className="size-4" />{t('افزودنِ پروژه')}
        </Button>
        {effectiveMode === 'account' && (
          <Button type="button" size="sm" variant="outline" disabled={!(total > 0)} onClick={splitEqually}>
            {t('تقسیمِ مساوی')}
          </Button>
        )}
        {anyMember && (
          <InputGroup className="w-56">
            <InputGroupAddon><InputGroupText>{t('هزینهٔ انتقال (همه)')}</InputGroupText></InputGroupAddon>
            <InputGroupInput
              inputMode="decimal" className="num" aria-label={t('هزینهٔ انتقال (همه)')}
              placeholder="0" value={fee} onChange={(e) => setFee(e.target.value)}
            />
            <InputGroupAddon align="inline-end"><InputGroupText>%</InputGroupText></InputGroupAddon>
          </InputGroup>
        )}
        {anyDiffers && (
          <InputGroup className="w-60" dir="ltr">
            <InputGroupAddon><InputGroupText className="num">1 {contractCode} =</InputGroupText></InputGroupAddon>
            <InputGroupInput
              inputMode="decimal" className="num" aria-label={t('نرخِ این واریز')}
              placeholder={effectiveMode === 'contract' && byDeduction.rate ? money(byDeduction.rate) : t('نرخِ روز')}
              value={sharedRate} onChange={(e) => setSharedRate(e.target.value)}
            />
            <InputGroupAddon align="inline-end"><InputGroupText className="num">{entryCode}</InputGroupText></InputGroupAddon>
          </InputGroup>
        )}
      </div>

      {effectiveMode === 'contract' && byDeduction.rate !== null && totalNet > 0 && (
        <FieldDescription>
          {t('از طلب کم می‌شود {gross} · به دستش رسید {net} · نرخِ این واریز: {rate}', {
            gross: `${money(totalDeduction)} ${contractCode}`,
            net: `${money(totalNet)} ${contractCode}`,
            rate: `1 ${contractCode} = ${money(byDeduction.rate)} ${entryCode}`,
          })}
          {typedRate === null && ` ${t('(مبلغِ کل ÷ یوروی رسیده)')}`}
        </FieldDescription>
      )}
      <FieldDescription className={Math.abs(left) > 0.01 ? 'text-destructive' : 'text-emerald-700 dark:text-emerald-400'}>
        {Math.abs(left) <= 0.01
          ? t('جمعِ سهم‌ها = مبلغِ کل ✓')
          : left > 0
            ? t('جمعِ سهم‌ها {sum} از {total} — {left} مانده است.', { sum: money(sum), total: money(total), left: money(left) })
            : t('جمعِ سهم‌ها {sum} از {total} — {left} بیشتر است.', { sum: money(sum), total: money(total), left: money(-left) })}
      </FieldDescription>
    </FieldSet>
  );
}
