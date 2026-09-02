'use client';

import { useMemo, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Paperclip } from 'lucide-react';
import type { EntryRow, FormOptions } from './ledger-view';
import {
  amountFromSettled, rateFromAmounts, relocateParty, requiresDescription,
  selectableTags, settledCurrencyId, showsBillable, showsRecurring, showsSettled,
  showsUnitPicker, visibleParty, type Direction, type PartyState,
} from '@/domain/ledger/form-rules';
import { humanSize, MAX_SIZE } from '@/domain/files/upload';
import { Button } from '@/components/ui/button';
import { Combobox, MultiSelect, type Option } from '@/components/ui/combobox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { DialogFooter } from '@/components/ui/dialog';
import { useT } from '@/i18n/client';

const selectClass =
  'h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50';

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  const tr = useT();
  return <Button type="submit" disabled={pending}>{pending ? tr('در حالِ ثبت…') : label}</Button>;
}

/**
 * فرمِ ردیفِ دفتر — با **همهٔ** وابستگی‌های فیلدیِ نسخهٔ قبلی.
 *
 * قواعد در `src/domain/ledger/form-rules.ts` خالص و آزموده‌اند؛ اینجا فقط
 * وصلشان می‌کنیم. فهرستِ کامل در `docs/rules/LEDGER-FORM.md`.
 */
export function EntryForm({
  editing,
  options,
  accountId,
  today,
  keep,
  fieldErrors,
  error,
  onCancel,
}: {
  editing: EntryRow | null;
  options: FormOptions;
  accountId: number;
  today: string;
  keep: (name: string, fallback?: string) => string;
  fieldErrors?: Record<string, string | undefined>;
  error?: string;
  onCancel: () => void;
}) {
  const tr = useT();
  const [direction, setDirection] = useState<Direction>(
    // ردیفِ تازه واریز است (پیش‌فرضِ نسخهٔ قبلی)؛ ویرایش جهتِ خودش را نگه می‌دارد.
    (keep('direction', editing?.direction ?? 'in') as Direction),
  );
  /**
   * ⚠️ پیش‌پرشدنِ کاملِ فرمِ ویرایش. پیش از این فقط برچسب‌ها می‌آمدند — نه
   * پیوندِ کاربر، نه دسته‌ها، نه تسویه، نه «قابلِ بازپرداخت» — و ذخیرهٔ بدونِ
   * تغییر همهٔ اینها را می‌انداخت و آینهٔ پرداخت را از خالی می‌ساخت.
   */
  const [party, setParty] = useState<PartyState>({
    payer: { userId: editing?.payerUserId ?? null, label: editing?.payerName ?? editing?.payerLabel ?? '' },
    receiver: { userId: editing?.receiverUserId ?? null, label: editing?.receiverName ?? editing?.receiverLabel ?? '' },
  });
  const [projectId, setProjectId] = useState<number | null>(editing?.projectId ?? null);
  const [projectLabel, setProjectLabel] = useState(editing?.projectTitle ?? '');
  const [tagIds, setTagIds] = useState<number[]>(editing?.tagIds ?? []);
  const [settled, setSettled] = useState(editing?.amountSettled ?? '');
  const [rate, setRate] = useState('');
  const [amount, setAmount] = useState(keep('amount', editing?.amount ?? ''));
  const [descTouched, setDescTouched] = useState(false);
  const [description, setDescription] = useState(keep('description', editing?.description ?? ''));

  const peopleOptions: Option[] = useMemo(
    () => options.people.map((p) => ({ value: p.id, label: p.name, hint: p.email })),
    [options.people],
  );
  const projectOptions: Option[] = useMemo(
    () => options.projects.map((p) => ({ value: p.id, label: p.title })),
    [options.projects],
  );

  /* ── R-FORM-01 — تغییرِ جهت، طرفِ حساب را جابه‌جا می‌کند ── */
  const changeDirection = (next: Direction) => {
    setParty((s) => relocateParty(s, next));
    setDirection(next);
  };

  const shown = visibleParty(direction);
  const receiverUserId = party.receiver.userId;

  /* ── R-FORM-04 — تگ‌ها با جهت فیلتر می‌شوند ── */
  const tagOptions: Option[] = useMemo(
    () => selectableTags(
      options.categories.map((c) => ({ id: c.id, name: c.name, dir: c.dir ?? 'both' })),
      direction,
      tagIds,
    ).map((t) => ({ value: t.id, label: t.name })),
    [options.categories, direction, tagIds],
  );

  /* ── R-FORM-02/03/05/06 ── */
  const billableVisible = showsBillable({
    direction,
    projectId,
    receiverUserId,
    projectMemberIds: projectId ? (options.projectMemberIds[projectId] ?? []) : [],
  });
  const settledVisible = showsSettled(projectId);
  // پورتِ افزونه: فقط برای برداشت و فقط هنگامِ **افزودن** — ردیفِ موجود قالب نمی‌سازد.
  const recurringVisible = showsRecurring(direction) && !editing;
  const unitPickerVisible = showsUnitPicker({ direction, projectId, receiverUserId });

  const settledCurrency = useMemo(() => settledCurrencyId({
    direction,
    projectId,
    receiverUserId,
    memberCurrency: new Map(Object.entries(options.memberCurrency)),
    projectCurrency: new Map(options.projects.map((p) => [p.id, p.currencyId ?? 0])),
    defaultCurrencyId: options.defaultCurrencyId,
  }), [direction, projectId, receiverUserId, options]);

  /* ── نرخِ دوطرفه ── */
  const onSettledChange = (value: string) => {
    setSettled(value);
    const next = amountFromSettled(Number(value), Number(rate));
    if (next !== null) setAmount(String(next));
  };
  const onRateChange = (value: string) => {
    setRate(value);
    const next = amountFromSettled(Number(settled), Number(value));
    if (next !== null) setAmount(String(next));
  };
  const onAmountChange = (value: string) => {
    setAmount(value);
    const next = rateFromAmounts(Number(value), Number(settled));
    if (next !== null) setRate(String(next));
  };

  /* ── R-FORM-07 — توضیحاتِ اجباریِ ردیفِ پروژه‌دار ── */
  const descMissing = requiresDescription(projectId) && !description.trim();

  return (
    <>
      {editing && <input type="hidden" name="entryId" value={editing.id} />}
      <input type="hidden" name="accountId" value={accountId} />
      <input type="hidden" name="projectId" value={projectId ?? ''} />
      <input type="hidden" name="direction" value={direction} />

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="grid gap-1.5">
          <Label htmlFor="l-date">{tr("تاریخ")}</Label>
          <Input
            id="l-date" type="date" name="entryDate" className="num"
            defaultValue={keep('entryDate', editing?.entryDate ?? today)}
            required
          />
          {fieldErrors?.entryDate && <p className="text-xs text-destructive">{tr(fieldErrors.entryDate)}</p>}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="l-dir">{tr("جهت")}</Label>
          <select
            id="l-dir"
            className={selectClass}
            value={direction}
            onChange={(e) => changeDirection(e.target.value as Direction)}
          >
            <option value="out">{tr("برداشت / هزینه")}</option>
            <option value="in">{tr("واریز / درآمد")}</option>
          </select>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="l-project">{tr("بابت (پروژه)")}</Label>
          <Combobox
            id="l-project"
            options={projectOptions}
            value={{ id: projectId, label: projectLabel }}
            onChange={(v) => { setProjectId(v.id); setProjectLabel(v.label); }}
            placeholder={tr("جستجوی پروژه…")}
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="grid gap-1.5">
          <Label htmlFor="l-amount">{tr("مبلغ")}</Label>
          <Input
            id="l-amount" name="amount" inputMode="decimal" className="num"
            value={amount}
            onChange={(e) => onAmountChange(e.target.value)}
            required
          />
          {fieldErrors?.amount && <p className="text-xs text-destructive">{tr(fieldErrors.amount)}</p>}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="l-cur">{tr("ارز")}</Label>
          <select
            id="l-cur" name="currencyId" className={selectClass}
            defaultValue={keep('currencyId',
              String(editing?.currencyId ?? options.defaultCurrencyId ?? ''))}
          >
            {options.currencies.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}
          </select>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="l-real">{tr("مبلغِ واقعیِ رسیده (اختیاری)")}</Label>
          <Input
            id="l-real" name="amountAccountOverride" inputMode="decimal" className="num"
            placeholder={tr("با کارمزد")} defaultValue={keep('amountAccountOverride', editing?.amountAccountOverride ?? '')}
          />
        </div>
      </div>

      {/* ── R-FORM-01 — فقط طرفِ متناسب با جهت ── */}
      <div className="grid gap-3 sm:grid-cols-2">
        {shown === 'payer' ? (
          <div className="grid gap-1.5">
            <Label htmlFor="l-payer">{tr("پرداخت‌کننده")}</Label>
            <Combobox
              id="l-payer"
              name="payerUserId"
              options={peopleOptions}
              value={{ id: party.payer.userId, label: party.payer.label }}
              onChange={(v) => setParty((s) => ({ ...s, payer: { userId: v.id, label: v.label } }))}
              placeholder={tr("جستجوی کاربر یا نامِ آزاد…")}
              allowFreeText
            />
            <input type="hidden" name="payerLabel" value={party.payer.label} />
          </div>
        ) : (
          <div className="grid gap-1.5">
            <Label htmlFor="l-receiver">{tr("دریافت‌کننده")}</Label>
            <Combobox
              id="l-receiver"
              name="receiverUserId"
              options={peopleOptions}
              value={{ id: party.receiver.userId, label: party.receiver.label }}
              onChange={(v) => setParty((s) => ({ ...s, receiver: { userId: v.id, label: v.label } }))}
              placeholder={tr("جستجوی کاربر یا نامِ آزاد…")}
              allowFreeText
            />
            <input type="hidden" name="receiverLabel" value={party.receiver.label} />
          </div>
        )}

        <div className="grid gap-1.5">
          <Label htmlFor="l-tags">{tr("دسته‌ها")}</Label>
          <MultiSelect
            id="l-tags"
            name="categoryTagId"
            options={tagOptions}
            selected={tagIds}
            onChange={setTagIds}
            placeholder={tr("افزودنِ دسته…")}
          />
          <p className="text-xs text-muted-foreground">
            {tr('فقط دسته‌های متناسب با «{kind}» پیشنهاد می‌شوند.',
              { kind: direction === 'out' ? tr('برداشت') : tr('واریز') })}
          </p>
        </div>
      </div>

      {/* ── R-FORM-02 — بازپرداخت از کارفرما ── */}
      {billableVisible && (
        <label className="flex items-start gap-2 rounded-md border p-3 text-sm">
          {/* ⚠️ پیش‌فرض تیک‌خورده — هزینهٔ پروژه معمولاً به کارفرما می‌خورد. */}
          <input
            type="checkbox" name="billable" value="1" defaultChecked={editing ? editing.billable : true}
            className="mt-0.5 size-4 accent-primary"
          />
          <span>
              {tr("قابل بازپرداخت از کارفرما")}
            <span className="block text-xs text-muted-foreground">
              {tr("این هزینه به مطالباتِ همین پروژه اضافه می‌شود.")}
            </span>
          </span>
        </label>
      )}

      {/* ── R-FORM-05 — بلوکِ معادل + نرخِ دوطرفه ── */}
      {settledVisible && (
        <div className="grid gap-2 rounded-md border p-3">
          <Label>{tr("معادل برای محاسبهٔ پروژه/عضو")}</Label>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              name="amountSettled" inputMode="decimal" className="num w-40"
              placeholder={tr("اختیاری")} value={settled}
              onChange={(e) => onSettledChange(e.target.value)}
            />
            <select
              name="settledCurrencyId" className={`${selectClass} w-28`}
              value={String(settledCurrency ?? '')}
              onChange={() => { /* ارز از قاعده می‌آید؛ تغییرِ دستی هم مجاز است */ }}
            >
              {options.currencies.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}
            </select>

            <span className="flex items-center gap-1 text-sm" dir="ltr">
                {tr("۱ =")}
              <Input
                name="fxRate" inputMode="decimal" className="num w-28"
                placeholder={tr("نرخ")} value={rate}
                onChange={(e) => onRateChange(e.target.value)}
              />
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            {tr("معادلِ این پرداخت در ارزِ قرارداد — نرخ را بنویسید تا مبلغ خودکار پر شود، یا برعکس.")}
          </p>
        </div>
      )}

      {/* ── R-FORM-06 — انتخابگرِ کارکرد ── */}
      {unitPickerVisible && (
        <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
          {tr("کارکردهای پرداخت‌نشدهٔ این عضو روی این پروژه، پس از ذخیره در بخشِ مالیِ پروژه قابلِ تسویه‌اند.")}
        </p>
      )}

      <div className="grid gap-1.5">
        <Label htmlFor="l-desc">{tr("توضیحات")}</Label>
        <Textarea
          id="l-desc" name="description" rows={2}
          value={description}
          onChange={(e) => { setDescription(e.target.value); setDescTouched(true); }}
        />
        {/* ⚠️ پیامِ فارسی، نه تولتیپِ انگلیسیِ required ِ مرورگر. */}
        {descMissing && descTouched && (
          <p className="text-xs text-destructive">
            {tr("برای تراکنش‌های مرتبط با پروژه، نوشتن توضیحات الزامی است.")}
          </p>
        )}
      </div>

      <div className="grid gap-2 rounded-md border p-3">
        <Label htmlFor="l-receipt" className="flex items-center gap-1.5">
          <Paperclip className="size-3.5" />
          {tr("رسیدها")}
        </Label>
        {editing && editing.receipts.length > 0 && (
          <ul className="grid gap-1">
            {editing.receipts.map((r) => (
              <li key={r.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox" id={`rm-${r.id}`} name="removeReceipt" value={r.id}
                  className="size-3.5 accent-destructive"
                />
                <Label htmlFor={`rm-${r.id}`} className="text-xs font-normal text-muted-foreground">{tr("حذف")}</Label>
                <a href={r.href} target="_blank" rel="noopener noreferrer" className="flex-1 truncate hover:underline">
                  {r.originalName || `#${r.id}`}
                </a>
                <span className="num shrink-0 text-xs text-muted-foreground">{humanSize(r.size, tr)}</span>
              </li>
            ))}
          </ul>
        )}
        <Input id="l-receipt" name="receipt" type="file" accept="image/*,application/pdf" multiple />
        <p className="text-xs text-muted-foreground">
          {tr('تصویر یا PDF — تا {size} برای هر رسید.', { size: humanSize(MAX_SIZE.receipt, tr) })}
        </p>
      </div>

      {/* ── R-FORM-03 — هزینهٔ دوره‌ای فقط برای برداشت ── */}
      {recurringVisible && (
        <div className="grid gap-2 rounded-md border p-3 text-sm">
          <label className="flex items-start gap-2">
            <input type="checkbox" name="makeRecurring" value="1" className="mt-0.5 size-4 accent-primary" />
            <span>
                {tr("این هزینه را به‌عنوان هزینهٔ دوره‌ای هم ثبت کن")}
              <span className="block text-xs text-muted-foreground">
                {tr("طرف‌حساب، حساب، مبلغ و دسته از همین فرم گرفته می‌شود.")}
              </span>
            </span>
          </label>
          {/* پورتِ re_kind / re_count / re_unit: نوبتِ بعدی یک دوره بعد از این ردیف. */}
          <div className="flex flex-wrap items-center gap-2 ps-6 text-xs">
            <select name="reKind" className="h-8 rounded-md border bg-background px-2" defaultValue="recurring" aria-label={tr('نوع')}>
              <option value="recurring">{tr('دوره‌ای')}</option>
              <option value="once">{tr('یک‌بار')}</option>
            </select>
            <span>{tr('هر')}</span>
            <Input name="reCount" type="number" min={1} defaultValue={1} className="h-8 w-16 num" aria-label={tr('هر چند دوره')} />
            <select name="reUnit" className="h-8 rounded-md border bg-background px-2" defaultValue="month" aria-label={tr('دوره')}>
              <option value="day">{tr('روز')}</option>
              <option value="week">{tr('هفته')}</option>
              <option value="month">{tr('ماه')}</option>
              <option value="year">{tr('سال')}</option>
            </select>
          </div>
        </div>
      )}

      {error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{tr(error)}</p>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>{tr("انصراف")}</Button>
        <SubmitButton label={editing ? tr('به‌روزرسانی ردیف') : tr('ثبت ردیف')} />
      </DialogFooter>
    </>
  );
}
