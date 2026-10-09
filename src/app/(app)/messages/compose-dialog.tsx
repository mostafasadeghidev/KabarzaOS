'use client';

import { useFreshKey } from '@/hooks/use-fresh-key';
import { UserName } from '@/components/user-avatar';
import { useMemo, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { CircleAlert, X } from 'lucide-react';
import type { MessageState } from './_form/actions';
import type { FilterData, RecipientOption } from './messages-view';
import { AUDIENCE_LABELS, type Audience } from '@/domain/messaging/threads';
import {
  allowedRecipients, audienceIds, keepsProject, matchesName, pickableRecipients, projectTeamIds,
  switchAutoPicks, visibleProjects,
} from '@/domain/messaging/recipient-filter';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldDescription, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { SearchInput } from '@/components/ui/search-input';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { useT } from '@/i18n/client';
import { submitOnModEnter, useModEnterLabel } from '@/lib/submit-shortcut';

/** «افرادِ مشخص» در کنارِ سه مخاطبِ آماده. */
type Mode = 'pick' | Audience;

const MODES: Array<{ value: Mode; label: string }> = [
  { value: 'pick', label: 'افرادِ مشخص' },
  ...(Object.keys(AUDIENCE_LABELS) as Audience[]).map((key) => ({ value: key, label: AUDIENCE_LABELS[key] })),
];

/** دکمهٔ ارسال با شمارِ گیرندگان — تا پیش از ارسال روشن باشد پیام به چند نفر می‌رسد. */
function ComposeSubmit({ count }: { count: number }) {
  const tr = useT();
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending || count === 0}>
      {pending
        ? <Spinner />
        : count > 0 ? tr('ارسال به {n} نفر', { n: count }) : tr('ارسال پیام')}
    </Button>
  );
}

/**
 * دیالوگِ «پیام جدید».
 *
 * ⚠️ وضعیتِ انتخاب همین‌جاست و با بستنِ دیالوگ (که محتوایش را برمی‌چیند) از
 * نو شروع می‌شود؛ پس پس از ارسالِ موفق چیزی برای صفر کردن نمی‌ماند.
 *
 * ⚠️ گیرندگان با ورودیِ پنهان فرستاده می‌شوند، نه با `name` ِ چک‌باکس‌ها:
 * جستجو ردیف‌ها را پنهان می‌کند و چک‌باکسِ پنهان‌شده در فرم نیست — کسی که
 * انتخاب شده و بعد با جستجو از دید رفته بی‌صدا از گیرندگان می‌افتاد.
 */
function ComposeDialogBody({
  open,
  onOpenChange,
  recipients,
  filters,
  canBroadcast,
  formAction,
  state,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipients: RecipientOption[];
  filters: FilterData;
  /** مخاطب‌های آماده («همهٔ اعضا» و …) فقط برای مدیر. */
  canBroadcast: boolean;
  formAction: (formData: FormData) => void;
  state: MessageState;
}) {
  const tr = useT();
  const sendKeys = useModEnterLabel();

  const [mode, setMode] = useState<Mode>('pick');
  /** دفترِ «همهٔ اعضا» — خالی یعنی بی‌توجه به دفتر. */
  const [audienceOffice, setAudienceOffice] = useState<number | null>(null);

  const [picked, setPicked] = useState<Set<number>>(new Set());
  /** تیک‌هایی که انتخابِ پروژه گذاشته و کاربر هنوز دست نزده. */
  const [auto, setAuto] = useState<Set<number>>(new Set());
  const [officeId, setOfficeId] = useState<number | null>(null);
  const [projectId, setProjectId] = useState<number | null>(null);
  const [query, setQuery] = useState('');

  const names = useMemo(() => new Map(recipients.map((r) => [r.id, r.name])), [recipients]);
  const shownProjects = visibleProjects(filters.projects, officeId);
  const allowed = allowedRecipients({
    projects: filters.projects, officeMembers: filters.officeMembers, officeId, projectId,
  });
  const shown = pickableRecipients(recipients, allowed, picked).filter((r) => matchesName(r.name, query));
  const allShownPicked = shown.length > 0 && shown.every((r) => picked.has(r.id));

  const project = projectId ? filters.projects.find((p) => p.id === projectId) : undefined;
  const projectHasClients = !!project && project.clientIds.some((id) => names.has(id));

  const count = mode === 'pick'
    ? picked.size
    : audienceIds({
      audience: mode, officeId: audienceOffice, recipients, officeMembers: filters.officeMembers,
    }).length;

  /**
   * دفتر یا پروژه عوض شد — اعضای تیمِ پروژه خودکار تیک می‌خورند و تیک‌های
   * خودکارِ قبلی برداشته می‌شوند. ⚠️ پروژه‌ای که زیرِ دفترِ تازه دیده نمی‌شود
   * صفر می‌شود؛ وگرنه فیلترِ نامرئی فهرست را خالی نگه می‌داشت.
   */
  const applyFilter = (nextOffice: number | null, nextProject: number | null) => {
    const keptProject = keepsProject(filters.projects, nextProject, nextOffice) ? nextProject : null;
    const team = projectTeamIds({
      projects: filters.projects, officeMembers: filters.officeMembers, recipients,
      officeId: nextOffice, projectId: keptProject,
    });
    const next = switchAutoPicks({ picked, auto, team });
    setOfficeId(nextOffice);
    setProjectId(keptProject);
    setPicked(next.picked);
    setAuto(next.auto);
  };

  /** هر دست‌بردنِ کاربر تیک را «دستی» می‌کند — با عوض‌شدنِ پروژه نمی‌افتد. */
  const setPick = (ids: number[], on: boolean) => {
    setPicked((cur) => {
      const next = new Set(cur);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
    setAuto((cur) => new Set([...cur].filter((id) => !ids.includes(id))));
  };

  const clearAll = () => {
    setPicked(new Set());
    setAuto(new Set());
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{tr('پیام جدید')}</DialogTitle>
          <DialogDescription>
            {tr('به هر گیرنده یک گفتگوی جداگانه فرستاده می‌شود؛ گیرنده‌ها همدیگر را نمی‌بینند.')}
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="grid gap-4">
          {canBroadcast && (
            <FieldSet>
              <FieldLegend variant="label">{tr('به چه کسانی؟')}</FieldLegend>
              <RadioGroup
                value={mode}
                onValueChange={(v) => setMode(v as Mode)}
                className="grid gap-2 sm:grid-cols-2"
              >
                {MODES.map((m) => (
                  <label
                    key={m.value}
                    className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"
                  >
                    <RadioGroupItem value={m.value} />
                    {tr(m.label)}
                  </label>
                ))}
              </RadioGroup>
              {mode !== 'pick' && <input type="hidden" name="audience" value={mode} />}
            </FieldSet>
          )}

          {mode === 'members' && filters.offices.length > 0 && (
            <Field>
              <FieldLabel htmlFor="msg-audience-office">{tr('دفتر')}</FieldLabel>
              <NativeSelect
                id="msg-audience-office"
                name="audienceOffice"
                containerClassName="w-full"
                value={audienceOffice ?? ''}
                onChange={(e) => setAudienceOffice(e.target.value ? Number(e.target.value) : null)}
              >
                <NativeSelectOption value="">{tr('همهٔ اعضا، از هر دفتری')}</NativeSelectOption>
                {filters.offices.map((o) => (
                  <NativeSelectOption key={o.id} value={o.id}>
                    {tr('فقط اعضای «{name}»', { name: o.name })}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
          )}

          {mode !== 'pick' && (
            <p className="text-sm text-muted-foreground">
              {count > 0
                ? tr('این پیام جداگانه برای {n} نفر فرستاده می‌شود.', { n: count })
                : tr('این مخاطب کسی را در بر نمی‌گیرد.')}
            </p>
          )}

          {mode === 'pick' && (
            <FieldSet variant="box">
              <FieldLegend>{tr('گیرندگان')}</FieldLegend>

              <div className="grid gap-2 sm:grid-cols-2">
                <NativeSelect
                  aria-label={tr('فیلترِ دفتر')}
                  containerClassName="w-full"
                  value={officeId ?? ''}
                  onChange={(e) => applyFilter(e.target.value ? Number(e.target.value) : null, projectId)}
                >
                  <NativeSelectOption value="">{tr('همهٔ دفاتر')}</NativeSelectOption>
                  {filters.offices.map((o) => (
                    <NativeSelectOption key={o.id} value={o.id}>{o.name}</NativeSelectOption>
                  ))}
                </NativeSelect>
                <SearchableSelect
                  aria-label={tr('فیلترِ پروژه')}
                  value={projectId ?? ''}
                  onValueChange={(v) => applyFilter(officeId, v ? Number(v) : null)}
                >
                  <NativeSelectOption value="">{tr('همهٔ پروژه‌ها')}</NativeSelectOption>
                  {shownProjects.map((p) => (
                    <NativeSelectOption key={p.id} value={p.id}>{p.title}</NativeSelectOption>
                  ))}
                </SearchableSelect>
              </div>

              {project && (
                <FieldDescription>
                  {tr('اعضای تیمِ این پروژه خودکار انتخاب شدند؛ هر کس را نخواستی تیکش را بردار.')}
                  {projectHasClients && <> {tr('کارفرمای پروژه خودکار انتخاب نمی‌شود.')}</>}
                </FieldDescription>
              )}

              <SearchInput
                aria-label={tr('جستجوی نام')}
                placeholder={tr('جستجوی نام…')}
                containerClassName="sm:w-full"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                // ⚠️ Enter در جستجو نباید فرم را بفرستد.
                onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
              />

              <div className="grid gap-1">
                {shown.length > 1 && (
                  <Button
                    type="button" variant="link" size="xs" className="justify-self-start px-0"
                    onClick={() => setPick(shown.map((r) => r.id), !allShownPicked)}
                  >
                    {allShownPicked
                      ? tr('برداشتنِ همهٔ این فهرست')
                      : tr('انتخابِ همهٔ این فهرست ({n})', { n: shown.length })}
                  </Button>
                )}
                <div className="grid max-h-56 gap-1 overflow-y-auto">
                  {shown.map((r) => (
                    <label key={r.id} className="flex items-center gap-2 rounded-sm px-1 py-0.5 text-sm hover:bg-muted">
                      <Checkbox
                        checked={picked.has(r.id)}
                        onCheckedChange={(v) => setPick([r.id], v === true)}
                      />
                      <UserName userId={r.id} name={r.name} />
                      <span className="text-xs text-muted-foreground">
                        ({r.role === 'client' ? tr('کارفرما') : tr('عضو')})
                      </span>
                    </label>
                  ))}
                  {shown.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      {recipients.length === 0
                        ? tr('مخاطبی برای ارسال نیست.')
                        : query.trim() !== ''
                          ? tr('نامی با این جستجو پیدا نشد.')
                          : tr('با این فیلتر کسی پیدا نشد.')}
                    </p>
                  )}
                </div>
              </div>

              <div className="grid gap-2 border-t pt-3">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className={picked.size === 0 ? 'text-muted-foreground' : 'font-medium'}>
                    {picked.size === 0
                      ? tr('هنوز کسی انتخاب نشده است.')
                      : tr('{n} نفر انتخاب شده', { n: picked.size })}
                  </span>
                  {picked.size > 0 && (
                    <Button type="button" variant="link" size="xs" className="px-0 text-muted-foreground" onClick={clearAll}>
                      {tr('پاک کردن همه')}
                    </Button>
                  )}
                </div>
                {picked.size > 0 && (
                  <div className="flex max-h-24 flex-wrap gap-1 overflow-y-auto">
                    {[...picked].map((id) => (
                      <Badge key={id} variant="outline" className="gap-1 ps-0.5 pe-1">
                        <UserName userId={id} name={names.get(id) ?? '#'} />
                        <button
                          type="button"
                          className="pointer-events-auto rounded-full p-0.5 hover:bg-border"
                          aria-label={tr('برداشتنِ {name}', { name: names.get(id) ?? '' })}
                          onClick={() => setPick([id], false)}
                        >
                          <X className="size-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
                {[...picked].map((id) => (
                  <input key={id} type="hidden" name="recipients" value={id} />
                ))}
              </div>
            </FieldSet>
          )}

          <Field>
            <FieldLabel htmlFor="msg-body">{tr('متن پیام')}</FieldLabel>
            <Textarea
              id="msg-body" name="body" rows={4} required
              placeholder={tr('{keys} برای ارسال', { keys: sendKeys })} onKeyDown={submitOnModEnter}
            />
          </Field>

          <label className="flex items-start gap-2 text-sm">
            <Checkbox name="allowReply" defaultChecked className="mt-0.5" />
            {tr('پاسخ مجاز باشد (برای سؤال)؛ بدون تیک = اعلانِ یک‌طرفه')}
          </label>

          {state.error && (
            <Alert variant="destructive">
              <CircleAlert />
              <AlertDescription>{tr(state.error)}</AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {tr('بستن')}
            </Button>
            <ComposeSubmit count={count} />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * ⚠️ بدنه با هر بار باز شدن از نو ساخته می‌شود (`useFreshKey`، ۲.۱۷.۱) — تغییرِ
 * ذخیره‌نشده با بستنِ پنجره دور ریخته می‌شود، نه اینکه دفعهٔ بعد سرِ جایش بماند.
 */
export function ComposeDialog(props: Parameters<typeof ComposeDialogBody>[0]) {
  const key = useFreshKey(props.open);
  return <ComposeDialogBody key={key} {...props} />;
}
