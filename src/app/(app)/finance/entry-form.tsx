'use client';

import { UserAvatar } from '@/components/user-avatar';
import { useEffect, useMemo, useState } from 'react';
import { useFormStatus } from 'react-dom';
import type { EntryRow, FormOptions } from './ledger-view';
import { ReceiptPicker } from './receipt-picker';
import {
  rateFromAmounts, relocateParty, requiresDescription,
  selectableTags, settledCurrencyId, showsBillable, showsRecurring, showsSettled,
  showsUnitPicker, visibleParty, type Direction, type PartyState,
  billableFromTags, effectiveRateOf, rateOnDate, daysBetween, deductionFromRate,
} from '@/domain/ledger/form-rules';
import { humanSize, MAX_SIZE } from '@/domain/files/upload';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Combobox, MultiSelect, type Option } from '@/components/ui/combobox';
import { Input } from '@/components/ui/input';
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from '@/components/ui/input-group';
import { Label } from '@/components/ui/label';
import { Field, FieldDescription, FieldError, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';
import { DialogFooter } from '@/components/ui/dialog';
import { useT } from '@/i18n/client';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CircleAlert, FileText } from 'lucide-react';
import {
  Attachment, AttachmentActions, AttachmentContent, AttachmentDescription, AttachmentMedia,
  AttachmentTitle, AttachmentTrigger,
} from '@/components/ui/attachment';
import { Toggle } from '@/components/ui/toggle';
import { DatePicker } from '@/components/ui/date-picker';


function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  const tr = useT();
  return <Button type="submit" disabled={pending}>{pending ? <><Spinner />{tr('در حالِ ثبت…')}</> : label}</Button>;
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
  /**
   * «از طلبِ … کم شود» (۲.۲۵.۰) — سه حالت:
   * · `auto`: ارزِ یکسان ← همان مبلغ؛ ارزِ متفاوت ← مبلغ ÷ نرخِ روزِ پرداخت
   * · `rate`: کاربر نرخ را نوشته ← عدد از آن
   * · `settled`: کاربر خودِ عدد را نوشته (یا کارکرد انتخاب شده) ← نرخ از آن
   */
  const [settled, setSettled] = useState(editing?.amountSettled ?? '');
  const [rate, setRate] = useState('');
  const [deductMode, setDeductMode] = useState<'auto' | 'rate' | 'settled'>(
    editing?.amountSettled ? 'settled' : 'auto',
  );
  /** تاریخِ ردیف — نرخِ پیشنهادی از **همین روز** خوانده می‌شود، نه امروز. */
  const [entryDate, setEntryDate] = useState(keep('entryDate', editing?.entryDate ?? today));
  const [amount, setAmount] = useState(keep('amount', editing?.amount ?? ''));
  const [currencyId, setCurrencyId] = useState(
    keep('currencyId', String(editing?.currencyId ?? options.defaultCurrencyId ?? '')),
  );
  /** ارز را کاربر خودش عوض کرده؟ — تا پیشنهادِ ارزِ قرارداد رویش ننشیند (۲.۲۴.۰). */
  const [currencyTouched, setCurrencyTouched] = useState(Boolean(editing));
  /** مبلغِ واقعیِ حساب — کنترل‌شده تا نرخِ مؤثر زیرش نشان داده شود. */
  const [actual, setActual] = useState(keep('amountAccountOverride', editing?.amountAccountOverride ?? ''));
  /** «قابل بازپرداخت از کارفرما» — پیش‌فرض خاموش؛ دستهٔ علامت‌خورده روشنش می‌کند (۲.۲۴.۰). */
  const [billable, setBillable] = useState(editing ? editing.billable : false);
  const [descTouched, setDescTouched] = useState(false);
  const [description, setDescription] = useState(keep('description', editing?.description ?? ''));

  const peopleOptions: Option[] = useMemo(
    () => options.people.map((p) => ({
      value: p.id, label: p.name, hint: p.email,
      media: <UserAvatar userId={p.id} name={p.name} size="xs" />,
    })),
    [options.people],
  );
  /**
   * گیرندهٔ برداشت: اعضا + فروشندگان (پورتِ کاندیدای طرف‌حساب). فروشنده
   * برچسبِ آزاد است، نه کاربر — شناسهٔ منفی فقط برای انتخاب در فهرست است و
   * هرگز به سرور نمی‌رسد (`optionalId` آن را null می‌کند).
   */
  /**
   * ⚠️ وقتی پروژه انتخاب شده (۲.۲۴.۰): اول اعضای همان پروژه؛ کاربرانِ دیگر و
   * طرف‌حساب‌ها فقط با تایپ (`typedOnlyGroups`). نامِ آزادی که دقیقاً نامِ یک
   * کاربر باشد همان کاربر را برمی‌دارد (`Combobox.commitTyped`).
   */
  const membersHere = useMemo(
    () => new Set(projectId ? (options.projectMemberIds[projectId] ?? []) : []),
    [projectId, options.projectMemberIds],
  );
  const groupMembers = tr('اعضای این پروژه');
  const groupOthers = tr('کاربرانِ دیگر');
  const groupVendors = tr('طرف‌حساب‌ها');
  const receiverOptions: Option[] = useMemo(() => {
    const vendorRows = (options.vendors ?? []).filter((v) => v.isActive !== false)
      // طرف‌حسابِ غیرفعال پیشنهاد نمی‌شود؛ نامش را می‌شود دستی نوشت (برچسبِ آزاد است، نه شناسه).
      .map((v) => ({ value: -v.id, label: v.name, hint: tr('فروشنده') }));
    if (membersHere.size === 0) return [...peopleOptions, ...vendorRows];
    return [
      ...peopleOptions.filter((o) => membersHere.has(o.value)).map((o) => ({ ...o, group: groupMembers })),
      ...peopleOptions.filter((o) => !membersHere.has(o.value)).map((o) => ({ ...o, group: groupOthers })),
      ...vendorRows.map((o) => ({ ...o, group: groupVendors })),
    ];
  }, [peopleOptions, options.vendors, membersHere, groupMembers, groupOthers, groupVendors, tr]);

  /* ── R-FORM-01 — تغییرِ جهت، طرفِ حساب را جابه‌جا می‌کند ── */
  const changeDirection = (next: Direction) => {
    setParty((s) => relocateParty(s, next));
    setDirection(next);
  };

  const shown = visibleParty(direction);
  const receiverUserId = party.receiver.userId;

  /**
   * پورتِ باریک‌سازیِ پروژه به طرفِ حساب: وقتی عضو/کارفرمایی انتخاب شده، فقط
   * پروژه‌های او (عضویت یا کارفرمایی) پیشنهاد می‌شوند؛ بی‌طرف یا بی‌پروژه = همه.
   * طرفِ مؤثر همان طرفی است که با جهت دیده می‌شود (R-FORM-01).
   */
  const partyUserId = direction === 'in' ? party.payer.userId : party.receiver.userId;
  const projectOptions: Option[] = useMemo(() => {
    const all = options.projects.map((p) => ({ value: p.id, label: p.title }));
    if (!partyUserId) return all;
    const mine = new Set<number>();
    for (const [pid, ids] of Object.entries(options.projectMemberIds)) {
      if (ids.includes(partyUserId)) mine.add(Number(pid));
    }
    for (const [pid, ids] of Object.entries(options.projectClientIds ?? {})) {
      if (ids.includes(partyUserId)) mine.add(Number(pid));
    }
    const narrowed = all.filter((o) => mine.has(Number(o.value)));
    return narrowed.length > 0 ? narrowed : all;
  }, [options.projects, options.projectMemberIds, options.projectClientIds, partyUserId]);

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
  /**
   * انتخابگرِ کارکرد — پورتِ `unitPicker`/`from_unit`: برداشت به عضوِ پروژه،
   * کارکردهای پرداخت‌نشدهٔ همان «پروژه:عضو»؛ انتخاب معادل و ارز را پر می‌کند و
   * شناسه در فیلدِ پنهان می‌رود تا ذخیره همان کارکرد را «پرداخت‌شده» کند.
   * فقط برای ردیفِ تازه — ویرایشِ ردیفِ موجود کارکردی نمی‌بندد.
   */
  const unitRows = unitPickerVisible && !editing && projectId && receiverUserId
    ? (options.unitUnpaid?.[`${projectId}:${receiverUserId}`] ?? [])
    : [];
  const [fromUnit, setFromUnit] = useState<number | null>(null);
  const pickedUnit = fromUnit !== null && unitRows.some((u) => u.id === fromUnit) ? fromUnit : null;
  /** ارزِ معادل: قاعده پیش‌فرض را می‌دهد؛ انتخابِ کارکرد یا تغییرِ دستی روی آن می‌نشیند. */
  const [settledOverride, setSettledOverride] = useState<number | null>(
    editing?.settledCurrencyId ?? null,
  );

  const settledCurrency = useMemo(() => settledCurrencyId({
    direction,
    projectId,
    receiverUserId,
    memberCurrency: new Map(Object.entries(options.memberCurrency)),
    projectCurrency: new Map(options.projects.map((p) => [p.id, p.currencyId ?? 0])),
    defaultCurrencyId: options.defaultCurrencyId,
  }), [direction, projectId, receiverUserId, options]);
  // ارزِ مبلغ = ارزِ قرارداد/پروژه، تا کاربر خودش ارز را عوض نکرده (۲.۲۴.۰) — «معادل» لازم نشود.
  useEffect(() => {
    if (currencyTouched || !settledCurrency) return;
    setCurrencyId(String(settledCurrency));
  }, [settledCurrency, currencyTouched]);

  const codeOf = (id: number | string | null) =>
    options.currencies.find((c) => String(c.id) === String(id ?? ''))?.code ?? '';
  // ⚠️ ارزِ انتخاب‌شده در خودِ بلوک (اگر دستی عوض شده)، نه فقط پیش‌فرضِ قاعده —
  // وگرنه برچسبِ نرخ «1 EUR =» می‌گفت در حالی که ارزِ معادل IRR بود.
  const settledCode = codeOf(settledOverride ?? settledCurrency ?? null);
  const entryCode = codeOf(currencyId);
  /** حسابِ همین فرم — ارزش برچسبِ «پرداخت‌شده از حساب» را می‌سازد (۲.۲۴.۰). */
  const account = options.accounts.find((a) => a.id === accountId);
  const accountCode = account?.currencyCode ?? '';
  const actualVisible = Boolean(account) && String(account!.currencyId) !== String(currencyId);
  const effectiveRate = effectiveRateOf(Number(amount), Number(actual));

  /**
   * «از طلبِ … کم شود» (۲.۲۵.۰) — جای بلوکِ سه‌خانه‌ایِ «معادل».
   * ارزش همیشه ارزِ قرارداد/پروژه است (انتخابگرِ ارز ندارد). اگر ارزِ مبلغ همان
   * باشد، همان مبلغ کم می‌شود و چیزی نوشته نمی‌شود؛ اگر فرق کند، عدد از نرخِ
   * **روزِ پرداخت** پر می‌شود و کاربر فقط در صورتِ لزوم نرخ یا عدد را عوض می‌کند.
   * ⚠️ مبلغ هرگز بازنویسی نمی‌شود (پورتِ افزونه).
   */
  const contractCurrency = settledOverride ?? settledCurrency ?? null;
  const differs = Boolean(contractCurrency) && String(contractCurrency) !== String(currencyId);
  const suggested = differs
    ? rateOnDate(options.rates ?? [], contractCurrency, Number(currencyId) || null, entryDate)
    : null;
  const usedRate = deductMode === 'rate' ? (Number(rate) > 0 ? Number(rate) : null)
    : deductMode === 'settled' ? rateFromAmounts(Number(amount), Number(settled))
    : suggested?.rate ?? null;
  const deduction = deductMode === 'settled' ? settled
    : differs ? String(deductionFromRate(Number(amount), usedRate ?? 0) ?? '')
    : amount;
  const receiverIsMember = direction === 'out' && Boolean(receiverUserId) && membersHere.has(receiverUserId!);
  const deductWho = (shown === 'payer' ? party.payer.label : party.receiver.label) || projectLabel;
  const deductLabel = receiverIsMember
    ? tr('از طلبِ «{who}» کم شود', { who: deductWho })
    : tr('برای «{who}» حساب شود', { who: deductWho });
  /** فقط وقتی چیزی برای ذخیره هست: ارزِ متفاوت، یا عددِ دستی/کارکرد. */
  const sendSettled = settledVisible && (differs || deductMode === 'settled') && Number(deduction) > 0;

  const onSettledChange = (value: string) => { setSettled(value); setDeductMode('settled'); };
  const onRateChange = (value: string) => { setRate(value); setDeductMode('rate'); };
  const onAmountChange = (value: string) => setAmount(value);

  /* ── R-FORM-07 — توضیحاتِ اجباریِ ردیفِ پروژه‌دار ── */
  const descMissing = requiresDescription(projectId) && !description.trim();

  return (
    <>
      {editing && <input type="hidden" name="entryId" value={editing.id} />}
      <input type="hidden" name="accountId" value={accountId} />
      <input type="hidden" name="projectId" value={projectId ?? ''} />
      <input type="hidden" name="direction" value={direction} />

      {/* ردیفِ ۱ (۲.۲۴.۰): تاریخ · جهت · دسته — دسته بالا، چون پیش‌فرضِ «قابل بازپرداخت» را تعیین می‌کند. */}
      <div className="grid items-start gap-3 sm:grid-cols-3">
        <Field>
          <FieldLabel htmlFor="l-date">{tr("تاریخ")}</FieldLabel>
          <DatePicker
            id="l-date" name="entryDate"
            defaultValue={keep('entryDate', editing?.entryDate ?? today)}
            onChange={setEntryDate}
            required
          />
          {fieldErrors?.entryDate && <FieldError>{tr(fieldErrors.entryDate)}</FieldError>}
        </Field>

        <Field>
          <FieldLabel htmlFor="l-dir">{tr("جهت")}</FieldLabel>
          <NativeSelect
            id="l-dir"
            containerClassName="w-full"
            value={direction}
            onChange={(e) => changeDirection(e.target.value as Direction)}
          >
            <NativeSelectOption value="out">{tr("برداشت / هزینه")}</NativeSelectOption>
            <NativeSelectOption value="in">{tr("واریز / درآمد")}</NativeSelectOption>
          </NativeSelect>
        </Field>

        <Field>
          <FieldLabel htmlFor="l-tags">{tr("دسته‌ها")}</FieldLabel>
          <MultiSelect
            id="l-tags"
            name="categoryTagId"
            options={tagOptions}
            selected={tagIds}
            onChange={(next) => {
              setTagIds(next);
              // دستهٔ «پیش‌فرض قابلِ بازپرداخت» تیک را روشن می‌کند؛ برداشتنش خاموش.
              setBillable(billableFromTags(next, options.categories));
            }}
            placeholder={tr("افزودنِ دسته…")}
          />
          <FieldDescription>
            {tr('فقط دسته‌های متناسب با «{kind}» پیشنهاد می‌شوند.',
              { kind: direction === 'out' ? tr('برداشت') : tr('واریز') })}
          </FieldDescription>
        </Field>
      </div>

      {/* ردیفِ ۲: بابت · طرفِ حساب */}
      <div className="grid items-start gap-3 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="l-project">{tr("بابت (پروژه)")}</FieldLabel>
          <Combobox
            id="l-project"
            options={projectOptions}
            value={{ id: projectId, label: projectLabel }}
            onChange={(v) => { setProjectId(v.id); setProjectLabel(v.label); }}
            placeholder={tr("جستجوی پروژه…")}
          />
        </Field>
        {shown === 'payer' ? (
          <Field>
            <FieldLabel htmlFor="l-payer">{tr("پرداخت‌کننده")}</FieldLabel>
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
          </Field>
        ) : (
          <Field>
            <FieldLabel htmlFor="l-receiver">{tr("دریافت‌کننده")}</FieldLabel>
            <Combobox
              id="l-receiver"
              name="receiverUserId"
              options={receiverOptions}
              typedOnlyGroups={[groupOthers, groupVendors]}
              value={{ id: party.receiver.userId, label: party.receiver.label }}
              onChange={(v) => setParty((s) => ({ ...s, receiver: { userId: v.id !== null && v.id > 0 ? v.id : null, label: v.label } }))}
              placeholder={tr("جستجوی کاربر یا نامِ آزاد…")}
              allowFreeText
            />
            <input type="hidden" name="receiverLabel" value={party.receiver.label} />
          </Field>
        )}
      </div>

      <div className="grid items-start gap-3 sm:grid-cols-3">
        <Field>
          <FieldLabel htmlFor="l-amount">{tr("مبلغ")}</FieldLabel>
          <Input
            id="l-amount" name="amount" inputMode="decimal" className="num"
            value={amount}
            onChange={(e) => onAmountChange(e.target.value)}
            required
          />
          {fieldErrors?.amount && <FieldError>{tr(fieldErrors.amount)}</FieldError>}
        </Field>

        <Field>
          <FieldLabel htmlFor="l-cur">{tr("ارز")}</FieldLabel>
          <NativeSelect
            id="l-cur" name="currencyId" containerClassName="w-full"
            value={currencyId}
            onChange={(e) => { setCurrencyId(e.target.value); setCurrencyTouched(true); }}
          >
            {options.currencies.map((c) => <NativeSelectOption key={c.id} value={c.id}>{c.code}</NativeSelectOption>)}
          </NativeSelect>
        </Field>

        {/*
          مبلغِ واقعی به **ارزِ حساب** (۲.۲۴.۰) — برای برداشت «پرداخت‌شده از حساب»، برای
          واریز «نشسته در حساب». کارمزدِ انتقال همین‌جاست: نرخِ مؤثر زیرش دیده می‌شود.
          فقط وقتی ارزِ مبلغ با ارزِ حساب فرق دارد (یا از قبل مقدار دارد).
        */}
        {(actualVisible || actual !== '') ? (
          <Field>
            <FieldLabel htmlFor="l-real">
              {direction === 'out'
                ? tr('پرداخت‌شده از حساب ({code})', { code: accountCode })
                : tr('نشسته در حساب ({code})', { code: accountCode })}
            </FieldLabel>
            <Input
              id="l-real" name="amountAccountOverride" inputMode="decimal" className="num" dir="ltr"
              placeholder={tr("اختیاری — با کارمزد")} value={actual}
              onChange={(e) => setActual(e.target.value)}
            />
            {effectiveRate !== null && (
              <FieldDescription>
                <span dir="ltr" className="num">1 {entryCode} = {effectiveRate.toLocaleString('en-US')} {accountCode}</span>
                {' '}{tr('(نرخِ مؤثر، با کارمزد)')}
              </FieldDescription>
            )}
          </Field>
        ) : (
          <div />
        )}
      </div>


      {/* ── R-FORM-02 — بازپرداخت از کارفرما ── */}
      {billableVisible && (
        <label className="flex items-start gap-2 rounded-lg bg-muted/60 p-3 text-sm">
          {/* ⚠️ پیش‌فرض تیک‌خورده — هزینهٔ پروژه معمولاً به کارفرما می‌خورد. */}
          {/* ⚠️ پیش‌فرض خاموش (۲.۲۴.۰)؛ دستهٔ «پیش‌فرض قابلِ بازپرداخت» روشنش می‌کند. */}
          <Checkbox name="billable" value="1" checked={billable} onCheckedChange={(v) => setBillable(v === true)} className="mt-0.5"
          />
          <span>
              {tr("قابل بازپرداخت از کارفرما")}
            <span className="block text-xs text-muted-foreground">
              {tr("این هزینه به مطالباتِ همین پروژه اضافه می‌شود.")}
            </span>
          </span>
        </label>
      )}

      {/* ── R-FORM-05/09 — «از طلبِ … کم شود» (۲.۲۵.۰) ── */}
      <input type="hidden" name="amountSettled" value={sendSettled ? deduction : ''} />
      <input type="hidden" name="settledCurrencyId" value={sendSettled ? String(contractCurrency ?? '') : ''} />
      {/* نرخ فقط وقتی کاربر خودش نوشته — پیشنهادِ تاریخچه دوباره ذخیره نمی‌شود. */}
      <input type="hidden" name="fxRate" value={sendSettled && deductMode === 'rate' ? rate : ''} />

      {/* ارزِ یکسان: یک خطِ روشن؛ «عددِ دیگر» فقط برای حالتِ نادری که کسر با مبلغ فرق دارد. */}
      {settledVisible && !differs && deductMode !== 'settled' && Number(amount) > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300">
          <span>
            {deductLabel}: <span dir="ltr" className="num font-medium">{amount} {entryCode}</span>
          </span>
          <Button
            type="button" variant="link" size="sm" className="h-auto p-0 text-xs"
            onClick={() => { setSettled(amount); setDeductMode('settled'); }}
          >
            {tr('عددِ دیگری کم شود')}
          </Button>
        </div>
      )}

      {settledVisible && (differs || deductMode === 'settled') && (
        <FieldSet variant="box">
          <FieldLegend>{deductLabel}</FieldLegend>
          <div className="flex flex-wrap items-center gap-2">
            <InputGroup className="w-48" dir="ltr">
              <InputGroupInput
                inputMode="decimal" className="num" aria-label={deductLabel}
                value={deduction} onChange={(e) => onSettledChange(e.target.value)}
              />
              <InputGroupAddon align="inline-end">
                <InputGroupText className="num">{settledCode}</InputGroupText>
              </InputGroupAddon>
            </InputGroup>

            {differs && (
              <InputGroup className="w-60" dir="ltr">
                <InputGroupAddon>
                  <InputGroupText className="num">1 {settledCode} =</InputGroupText>
                </InputGroupAddon>
                <InputGroupInput
                  inputMode="decimal" className="num"
                  placeholder={tr("نرخ")} aria-label={tr("نرخ")}
                  value={deductMode === 'rate' ? rate : (usedRate !== null ? String(usedRate) : '')}
                  onChange={(e) => onRateChange(e.target.value)}
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupText className="num">{entryCode}</InputGroupText>
                </InputGroupAddon>
              </InputGroup>
            )}
          </div>

          {differs && deductMode === 'auto' && suggested && (
            <FieldDescription>
              {suggested.date === entryDate
                ? tr('نرخِ ثبت‌شده برای همین تاریخ ({date}).', { date: suggested.date })
                : tr('نزدیک‌ترین نرخِ ثبت‌شده: {date} — {days} روز پیش از تاریخِ پرداخت.', {
                    date: suggested.date, days: daysBetween(suggested.date, entryDate),
                  })}
            </FieldDescription>
          )}
          {differs && deductMode === 'auto' && !suggested && (
            <FieldDescription className="text-amber-700 dark:text-amber-400">
              {tr('برای این تاریخ یا پیش از آن نرخی ثبت نشده — نرخ یا عددِ {code} را بنویسید.', { code: settledCode })}
            </FieldDescription>
          )}
          {deductMode !== 'auto' && (
            <FieldDescription>
              {tr('همین عدد ذخیره می‌شود و با تغییرِ نرخ‌ها عوض نمی‌شود.')}{' '}
              <Button
                type="button" variant="link" size="sm" className="h-auto p-0 text-xs"
                onClick={() => { setDeductMode('auto'); setFromUnit(null); }}
              >
                {differs ? tr('برگشت به نرخِ روزِ پرداخت') : tr('برگشت به همان مبلغ')}
              </Button>
            </FieldDescription>
          )}
          <FieldDescription>
            {tr('تاریخِ ردیف را روزِ واقعیِ واریز بگذارید؛ نرخ از همان روز خوانده می‌شود.')}
          </FieldDescription>
        </FieldSet>
      )}

      {/* ── R-FORM-06 — انتخابگرِ کارکرد (پورتِ unitPicker / from_unit) ── */}
      {unitRows.length > 0 && (
        <div className="grid gap-2 rounded-lg bg-muted/60 p-3">
          <p className="text-xs text-muted-foreground">
            {tr("کارکردِ پرداخت‌نشدهٔ این عضو روی این پروژه — با انتخاب، معادل و ارز پر می‌شود و پس از ذخیره «پرداخت‌شده» می‌گردد.")}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {unitRows.map((u) => (
              <Toggle
                key={u.id}
                variant="outline"
                size="sm"
                pressed={pickedUnit === u.id}
                onPressedChange={() => {
                  if (pickedUnit === u.id) {
                    setFromUnit(null);
                    setDeductMode('auto');
                    return;
                  }
                  onSettledChange(String(Number(u.amount)));
                  if (u.currencyId) setSettledOverride(u.currencyId);
                  setFromUnit(u.id);
                }}
                className="num h-7 px-2 text-xs font-normal data-[state=on]:border-primary data-[state=on]:bg-primary/10"
              >
                {u.text}
              </Toggle>
            ))}
          </div>
          <input type="hidden" name="fromUnit" value={pickedUnit ?? ''} />
        </div>
      )}

      <Field>
        <FieldLabel htmlFor="l-desc">{tr("توضیحات")}</FieldLabel>
        <Textarea
          id="l-desc" name="description" rows={2}
          value={description}
          onChange={(e) => { setDescription(e.target.value); setDescTouched(true); }}
        />
        {/* ⚠️ پیامِ فارسی، نه تولتیپِ انگلیسیِ required ِ مرورگر. */}
        {descMissing && descTouched && (
          <FieldError>
            {tr("برای تراکنش‌های مرتبط با پروژه، نوشتن توضیحات الزامی است.")}
          </FieldError>
        )}
      </Field>

      <ReceiptPicker
        name="receipt"
        inputId="l-receipt"
        hint={tr('تصویر یا PDF — تا {size} برای هر رسید.', { size: humanSize(MAX_SIZE.receipt, tr) })}
      >
        {/*
          رسیدهای ذخیره‌شده: تیکِ «حذف» فقط علامت می‌زند و با «ذخیره» پاک می‌شود؛
          کارتِ علامت‌خورده قرمزِ کم‌رنگ می‌شود تا پیش از ذخیره دیده شود.
        */}
        {editing && editing.receipts.length > 0 && (
          <ul className="grid gap-2">
            {editing.receipts.map((r) => {
              const name = r.originalName || `#${r.id}`;
              return (
                <li key={r.id}>
                  <Attachment
                    size="sm"
                    className="w-full has-[[data-slot=checkbox][data-state=checked]]:border-destructive/40 has-[[data-slot=checkbox][data-state=checked]]:bg-destructive/5"
                  >
                    <AttachmentMedia variant={r.kind === 'image' ? 'image' : 'icon'}>
                      {r.kind === 'image' ? <img src={`${r.href}?thumb`} alt="" loading="lazy" /> : <FileText />}
                    </AttachmentMedia>
                    <AttachmentContent>
                      <AttachmentTitle>{name}</AttachmentTitle>
                      <AttachmentDescription>{humanSize(r.size, tr)}</AttachmentDescription>
                    </AttachmentContent>
                    <AttachmentActions className="gap-1.5 pe-1">
                      <Checkbox
                        id={`rm-${r.id}`} name="removeReceipt" value={String(r.id)}
                        className="data-[state=checked]:border-destructive data-[state=checked]:bg-destructive"
                      />
                      <Label htmlFor={`rm-${r.id}`} className="text-xs font-normal text-muted-foreground">{tr("حذف")}</Label>
                    </AttachmentActions>
                    <AttachmentTrigger asChild>
                      <a href={r.href} target="_blank" rel="noopener noreferrer" aria-label={name} />
                    </AttachmentTrigger>
                  </Attachment>
                </li>
              );
            })}
          </ul>
        )}
      </ReceiptPicker>

      {/* ── R-FORM-03 — هزینهٔ دوره‌ای فقط برای برداشت ── */}
      {recurringVisible && (
        <div className="grid gap-2 rounded-lg bg-muted/60 p-3 text-sm">
          <label className="flex items-start gap-2">
            <Checkbox name="makeRecurring" value="1" className="mt-0.5" />
            <span>
                {tr("این هزینه را به‌عنوان هزینهٔ دوره‌ای هم ثبت کن")}
              <span className="block text-xs text-muted-foreground">
                {tr("طرف‌حساب، حساب، مبلغ و دسته از همین فرم گرفته می‌شود.")}
              </span>
            </span>
          </label>
          {/* پورتِ re_kind / re_count / re_unit: نوبتِ بعدی یک دوره بعد از این ردیف. */}
          <div className="flex flex-wrap items-center gap-2 ps-6 text-xs">
            <NativeSelect name="reKind" size="sm" defaultValue="recurring" aria-label={tr('نوع')}>
              <NativeSelectOption value="recurring">{tr('دوره‌ای')}</NativeSelectOption>
              <NativeSelectOption value="once">{tr('یک‌بار')}</NativeSelectOption>
            </NativeSelect>
            <span>{tr('هر')}</span>
            <Input name="reCount" type="number" min={1} defaultValue={1} className="h-8 w-16 num" aria-label={tr('هر چند دوره')} />
            <NativeSelect name="reUnit" size="sm" defaultValue="month" aria-label={tr('دوره')}>
              <NativeSelectOption value="day">{tr('روز')}</NativeSelectOption>
              <NativeSelectOption value="week">{tr('هفته')}</NativeSelectOption>
              <NativeSelectOption value="month">{tr('ماه')}</NativeSelectOption>
              <NativeSelectOption value="year">{tr('سال')}</NativeSelectOption>
            </NativeSelect>
          </div>
        </div>
      )}

      {error && (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertDescription>{tr(error)}</AlertDescription>
        </Alert>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>{tr("انصراف")}</Button>
        <SubmitButton label={editing ? tr('به‌روزرسانی ردیف') : tr('ثبت ردیف')} />
      </DialogFooter>
    </>
  );
}
