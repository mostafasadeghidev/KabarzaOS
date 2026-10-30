'use client';

import Link from 'next/link';
import { useActionState, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown, ArrowUp, BookOpenText, Code2, FileText, GitPullRequestArrow, ImagePlus, Lightbulb, Link2, ListChecks,
  Plus, SlidersHorizontal, Trash2,
} from 'lucide-react';
import { Panel } from '@/components/page-shell';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { MultiSelect } from '@/components/ui/multi-select';
import { Spinner } from '@/components/ui/spinner';
import { MediaPicker } from '@/components/media/media-picker';
import { MediaGallery } from '@/components/media/media-gallery';
import { useToast } from '@/components/ui/toast';
import { useT } from '@/i18n/client';
import { cn } from '@/lib/utils';
import {
  defaultPlacement, KIND_HINTS, KIND_LABELS, LANGUAGE_LABELS, LIBRARY_KINDS, LIBRARY_LANGUAGES,
  LIBRARY_OPTION_KINDS, LIBRARY_PLACEMENTS, LIBRARY_PLATFORMS, LIBRARY_STATUSES, OPTION_KIND_LABELS,
  PLACEMENT_HINTS, PLACEMENT_LABELS, PLATFORM_LABELS, STATUS_LABELS, SUGGESTION_NOTE_LIMIT,
  type LibraryKind, type LibraryLanguage, type LibraryOptionKind, type LibraryPlacement,
} from '@/domain/library/model';
import type { EntryDetail, EntryLink, LibraryMedia, ProjectOption } from '@/server/library/service';
import { deleteMediaAction, saveEntryAction, suggestEditAction, type LibraryState } from './_form/actions';

interface BlockDraft {
  key: number;
  label: string;
  language: LibraryLanguage;
  placement: LibraryPlacement;
  placementNote: string;
  code: string;
}

interface OptionDraft {
  key: number;
  name: string;
  kind: LibraryOptionKind;
  description: string;
  defaultValue: string;
}

let seq = 0;
const nextKey = () => ++seq;

const KIND_ICON = { code: Code2, guide: BookOpenText, note: Lightbulb } as const;

const emptyBlock = (language: LibraryLanguage = 'js'): BlockDraft => ({
  key: nextKey(), label: '', language, placement: defaultPlacement(language), placementNote: '', code: '',
});

/**
 * فرمِ ساخت و ویرایشِ موردِ کتابخانه (۲.۳۷.۰).
 *
 * ⚠️ هر بخش برای «نفرِ بعدی» است: هر فیلد یک خط راهنما دارد که می‌گوید
 * چه چیزی آنجا به کارِ کسی می‌آید که شش ماه بعد این کد را نصب می‌کند.
 * ⚠️ داده با یک JSON ِ پنهان می‌رود (تکه‌کد و گزینه آرایه‌اند)؛ تصویرها
 * با همان ورودیِ رسانهٔ بقیهٔ اپ (`MediaPicker`، نامِ `media`).
 * ⚠️ حالتِ «پیشنهاد» (۲.۴۶.۰): همان فرم برای کسی که نویسنده نیست — فقط
 * محتوا؛ نوع، وضعیت، پلتفرم، مبدأ، «کارفرما ببیند»، تصویر و مرتبط‌ها پنهان‌اند
 * چون پیشنهاد آن‌ها را عوض نمی‌کند (`SuggestedContent`).
 */
export function EntryForm({
  entry,
  projects,
  entries,
  topics,
  defaultProjectId = null,
  defaultKind = 'code',
  mode = 'edit',
  initialNote = '',
}: {
  entry: EntryDetail | null;
  projects: ProjectOption[];
  entries: EntryLink[];
  topics: string[];
  /** از تبِ پروژه آمده — پروژهٔ مبدأ و نصبِ خودکار. */
  defaultProjectId?: number | null;
  defaultKind?: LibraryKind;
  /** «پیشنهادِ ویرایش» برای موردِ همکار — ذخیره نمی‌شود، برای نویسنده فرستاده می‌شود. */
  mode?: 'edit' | 'suggest';
  /** پیشنهادِ بازِ قبلیِ خودِ کاربر. */
  initialNote?: string;
}) {
  const tr = useT();
  const { show } = useToast();
  const suggest = mode === 'suggest';
  const [state, formAction, pending] = useActionState<LibraryState, FormData>(
    suggest ? suggestEditAction : saveEntryAction, {},
  );
  const [note, setNote] = useState(initialNote);

  const [kind, setKind] = useState<LibraryKind>(entry?.kind ?? defaultKind);
  const [title, setTitle] = useState(entry?.title ?? '');
  const [summary, setSummary] = useState(entry?.summary ?? '');
  const [platform, setPlatform] = useState<string>(entry?.platform ?? 'webflow');
  const [status, setStatus] = useState<string>(entry?.status ?? 'ready');
  const [topicList, setTopicList] = useState<string[]>(entry?.topics ?? []);
  const [topicDraft, setTopicDraft] = useState('');
  const [origin, setOrigin] = useState<string>(
    entry?.origin ? String(entry.origin.id) : defaultProjectId ? String(defaultProjectId) : '',
  );
  const [steps, setSteps] = useState(entry?.steps ?? '');
  const [warnings, setWarnings] = useState(entry?.warnings ?? '');
  const [dependencies, setDependencies] = useState(entry?.dependencies ?? '');
  const [body, setBody] = useState(entry?.body ?? '');
  const [demoUrl, setDemoUrl] = useState(entry?.demoUrl ?? '');
  const [clientVisible, setClientVisible] = useState(entry?.clientVisible ?? false);
  const [related, setRelated] = useState<number[]>(entry?.related.map((r) => r.id) ?? []);
  const [media, setMedia] = useState<LibraryMedia[]>(entry?.media ?? []);
  const [blocks, setBlocks] = useState<BlockDraft[]>(
    entry ? entry.blocks.map((b) => ({ ...b, key: nextKey() })) : (defaultKind === 'code' ? [emptyBlock()] : []),
  );
  const [options, setOptions] = useState<OptionDraft[]>(entry?.options.map((o) => ({ ...o, key: nextKey() })) ?? []);

  useEffect(() => {
    if (state.error) show(tr(state.error), 'error');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  // مبدأ ِ فعلی ممکن است در فهرستِ پروژه‌های «قابلِ کار» ِ این ویرایشگر نباشد — گمش نکنیم.
  const projectChoices = useMemo(() => {
    const list = [...projects];
    if (entry?.origin && !list.some((p) => p.id === entry.origin!.id)) {
      list.unshift({ id: entry.origin.id, title: entry.origin.title, code: '' });
    }
    return list;
  }, [projects, entry]);

  const payload = JSON.stringify({
    kind, title, summary, platform, status, topics: topicList, body, steps, warnings, dependencies, demoUrl,
    clientVisible, originProjectId: origin ? Number(origin) : null,
    blocks: blocks.map(({ key: _k, ...b }) => b),
    options: options.map(({ key: _k, ...o }) => o),
    relatedIds: related,
  });

  const addTopic = (raw: string) => {
    const t = raw.replace(/^#/, '').trim();
    if (!t) return;
    if (!topicList.some((x) => x.toLowerCase() === t.toLowerCase())) setTopicList([...topicList, t].slice(0, 10));
    setTopicDraft('');
  };

  const move = <T,>(list: T[], from: number, to: number): T[] => {
    if (to < 0 || to >= list.length) return list;
    const next = [...list];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item!);
    return next;
  };

  const patchBlock = (key: number, patch: Partial<BlockDraft>) =>
    setBlocks((list) => list.map((b) => (b.key === key ? { ...b, ...patch } : b)));
  const patchOption = (key: number, patch: Partial<OptionDraft>) =>
    setOptions((list) => list.map((o) => (o.key === key ? { ...o, ...patch } : o)));

  return (
    <form action={formAction} className="grid gap-5">
      <input type="hidden" name="payload" value={payload} />
      {entry && <input type="hidden" name="id" value={entry.id} />}

      {suggest && (
        <Panel
          title={tr('پیشنهادِ شما')}
          icon={<GitPullRequestArrow />}
          description={tr('تغییرها مستقیم ذخیره نمی‌شوند: نویسنده تفاوت را می‌بیند و می‌پذیرد یا رد می‌کند.')}
        >
          <Field>
            <FieldLabel htmlFor="lib-suggest-note">{tr('چه چیزی را بهتر کردید و چرا؟')}</FieldLabel>
            <Textarea
              id="lib-suggest-note"
              name="note"
              rows={3}
              required
              maxLength={SUGGESTION_NOTE_LIMIT}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              dir="auto"
              placeholder={tr('مثلاً: روی موبایل گرید به‌هم می‌ریخت؛ breakpoint اضافه کردم.')}
            />
          </Field>
        </Panel>
      )}

      {/* ---------- نوع ---------- */}
      {!suggest && <Panel title={tr('این چیست؟')} description={tr('نوع تعیین می‌کند کدام بخش‌ها مهم‌اند و چه کسی آن را می‌بیند.')}>
        <div className="grid gap-2 sm:grid-cols-3" role="radiogroup">
          {LIBRARY_KINDS.map((k) => {
            const Icon = KIND_ICON[k];
            const active = kind === k;
            return (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => {
                  setKind(k);
                  if (k === 'code' && blocks.length === 0) setBlocks([emptyBlock()]);
                }}
                className={cn(
                  'grid content-start gap-1.5 rounded-lg border p-3 text-start transition-colors',
                  active ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:bg-muted/60',
                )}
              >
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <Icon className={cn('size-4', active ? 'text-primary' : 'text-muted-foreground')} aria-hidden />
                  {tr(KIND_LABELS[k])}
                </span>
                <span className="text-xs leading-5 text-muted-foreground">{tr(KIND_HINTS[k])}</span>
              </button>
            );
          })}
        </div>
      </Panel>}

      {/* ---------- مشخصات ---------- */}
      <Panel title={tr('مشخصات')} icon={<FileText />}>
        <Field>
          <FieldLabel htmlFor="lib-title">{tr('عنوان')}</FieldLabel>
          <Input
            id="lib-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            required
            dir="auto"
            placeholder={kind === 'guide' ? tr('مثلاً: تغییرِ قیمت‌های ارسال') : tr('مثلاً: گریدِ Masonry برای لیستِ CMS')}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="lib-summary">{tr('در یک جمله: چه کار می‌کند؟')}</FieldLabel>
          <Input
            id="lib-summary"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            maxLength={300}
            dir="auto"
            placeholder={tr('همین جمله روی کارت و بالای صفحه دیده می‌شود.')}
          />
        </Field>
        {!suggest && <div className="grid gap-3 sm:grid-cols-3">
          <Field>
            <FieldLabel htmlFor="lib-platform">{tr('پلتفرم')}</FieldLabel>
            <NativeSelect id="lib-platform" value={platform} onChange={(e) => setPlatform(e.target.value)} containerClassName="w-full">
              {LIBRARY_PLATFORMS.map((p) => <NativeSelectOption key={p} value={p}>{tr(PLATFORM_LABELS[p])}</NativeSelectOption>)}
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel htmlFor="lib-status">{tr('وضعیت')}</FieldLabel>
            <NativeSelect id="lib-status" value={status} onChange={(e) => setStatus(e.target.value)} containerClassName="w-full">
              {LIBRARY_STATUSES.map((s) => <NativeSelectOption key={s} value={s}>{tr(STATUS_LABELS[s])}</NativeSelectOption>)}
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel>{tr('اول برای کدام پروژه نوشته شد؟')}</FieldLabel>
            <SearchableSelect value={origin} onValueChange={setOrigin} containerClassName="w-full">
              <NativeSelectOption value="">{tr('— هیچ‌کدام / عمومی —')}</NativeSelectOption>
              {projectChoices.map((p) => (
                <NativeSelectOption key={p.id} value={String(p.id)}>{p.code ? `${p.title} · ${p.code}` : p.title}</NativeSelectOption>
              ))}
            </SearchableSelect>
          </Field>
        </div>}
        {!entry && origin && (
          <p className="text-xs text-muted-foreground">{tr('پس از ذخیره، روی همین پروژه «نصب‌شده» ثبت می‌شود.')}</p>
        )}
        <Field>
          <FieldLabel htmlFor="lib-topic">{tr('برچسب‌ها')}</FieldLabel>
          <div className="flex flex-wrap items-center gap-1.5 rounded-md border bg-card px-2 py-1.5 focus-within:ring-[3px] focus-within:ring-ring/50">
            {topicList.map((t) => (
              <span key={t} className="flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-xs" dir="auto">
                #{t}
                <button
                  type="button"
                  aria-label={tr('حذف')}
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => setTopicList(topicList.filter((x) => x !== t))}
                >
                  ×
                </button>
              </span>
            ))}
            <input
              id="lib-topic"
              list="lib-topics"
              value={topicDraft}
              onChange={(e) => setTopicDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ',' || e.key === '،') { e.preventDefault(); addTopic(topicDraft); }
                if (e.key === 'Backspace' && !topicDraft && topicList.length) setTopicList(topicList.slice(0, -1));
              }}
              onBlur={() => addTopic(topicDraft)}
              placeholder={topicList.length ? '' : tr('مثلاً CMS، فرم، انیمیشن — با Enter اضافه کنید')}
              className="min-w-40 flex-1 bg-transparent py-0.5 text-sm outline-none"
              dir="auto"
            />
            <datalist id="lib-topics">
              {topics.filter((t) => !topicList.includes(t)).map((t) => <option key={t} value={t} />)}
            </datalist>
          </div>
        </Field>
        {kind === 'guide' && !suggest && (
          <label className="flex items-start gap-3 rounded-lg bg-muted/60 p-3">
            <Switch checked={clientVisible} onCheckedChange={setClientVisible} className="mt-0.5" />
            <span className="grid gap-0.5">
              <span className="text-sm font-medium">{tr('کارفرما ببیند')}</span>
              <span className="text-xs text-muted-foreground">
                {tr('کارفرمای هر پروژه‌ای که این راهنما رویش نصب است، آن را در تبِ «کد و راهنما» ی پروژه‌اش می‌بیند. پیش‌نویس هرگز به کارفرما نشان داده نمی‌شود.')}
              </span>
            </span>
          </label>
        )}
      </Panel>

      {/* ---------- کدها ---------- */}
      {(kind === 'code' || blocks.length > 0) && (
        <Panel
          title={tr('کدها')}
          icon={<Code2 />}
          description={tr('هر تکه را جایی که باید نصب شود ثبت کنید — مثلاً CSS در head و اسکریپت پیش از پایانِ body.')}
        >
          {blocks.map((b, i) => (
            <div key={b.key} className="grid gap-3 rounded-lg bg-muted/60 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-semibold">{tr('تکهٔ {n}', { n: i + 1 })}</span>
                <div className="flex items-center gap-1">
                  <IconButton type="button" variant="ghost" className="size-8" label={tr('بالاتر')} disabled={i === 0} onClick={() => setBlocks(move(blocks, i, i - 1))}>
                    <ArrowUp className="size-3.5" />
                  </IconButton>
                  <IconButton type="button" variant="ghost" className="size-8" label={tr('پایین‌تر')} disabled={i === blocks.length - 1} onClick={() => setBlocks(move(blocks, i, i + 1))}>
                    <ArrowDown className="size-3.5" />
                  </IconButton>
                  <IconButton type="button" variant="ghost" className="size-8" label={tr('حذفِ این تکه')} onClick={() => setBlocks(blocks.filter((x) => x.key !== b.key))}>
                    <Trash2 className="size-3.5" />
                  </IconButton>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-[1fr_9rem]">
                <Field>
                  <FieldLabel htmlFor={`b-label-${b.key}`}>{tr('نام')}</FieldLabel>
                  <Input id={`b-label-${b.key}`} value={b.label} onChange={(e) => patchBlock(b.key, { label: e.target.value })} placeholder={tr('مثلاً: کتابخانهٔ Macy')} dir="auto" maxLength={120} />
                </Field>
                <Field>
                  <FieldLabel htmlFor={`b-lang-${b.key}`}>{tr('زبان')}</FieldLabel>
                  <NativeSelect
                    id={`b-lang-${b.key}`}
                    value={b.language}
                    containerClassName="w-full"
                    onChange={(e) => {
                      const language = e.target.value as LibraryLanguage;
                      // جای نصب فقط وقتی دنبالِ زبان می‌رود که کاربر خودش عوضش نکرده باشد.
                      const placement = b.placement === defaultPlacement(b.language) ? defaultPlacement(language) : b.placement;
                      patchBlock(b.key, { language, placement });
                    }}
                  >
                    {LIBRARY_LANGUAGES.map((l) => <NativeSelectOption key={l} value={l}>{tr(LANGUAGE_LABELS[l])}</NativeSelectOption>)}
                  </NativeSelect>
                </Field>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor={`b-place-${b.key}`}>{tr('کجا نصب شود؟')}</FieldLabel>
                  <NativeSelect id={`b-place-${b.key}`} value={b.placement} containerClassName="w-full" onChange={(e) => patchBlock(b.key, { placement: e.target.value as LibraryPlacement })}>
                    {LIBRARY_PLACEMENTS.map((p) => <NativeSelectOption key={p} value={p}>{tr(PLACEMENT_LABELS[p])}</NativeSelectOption>)}
                  </NativeSelect>
                  <FieldDescription dir="auto">{tr(PLACEMENT_HINTS[b.placement])}</FieldDescription>
                </Field>
                <Field>
                  <FieldLabel htmlFor={`b-note-${b.key}`}>{tr('جای دقیق (اختیاری)')}</FieldLabel>
                  <Input id={`b-note-${b.key}`} value={b.placementNote} onChange={(e) => patchBlock(b.key, { placementNote: e.target.value })} placeholder={tr('مثلاً: درست بعد از لیستِ CMS ِ گالری')} dir="auto" maxLength={500} />
                </Field>
              </div>
              <Field>
                <FieldLabel htmlFor={`b-code-${b.key}`}>{tr('کد')}</FieldLabel>
                <CodeTextarea id={`b-code-${b.key}`} value={b.code} onChange={(code) => patchBlock(b.key, { code })} />
              </Field>
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            {(['js', 'css', 'html'] as const).map((l) => (
              <Button key={l} type="button" size="sm" variant="outline" onClick={() => setBlocks([...blocks, emptyBlock(l)])}>
                <Plus />
                {tr('تکهٔ {l}', { l: LANGUAGE_LABELS[l] })}
              </Button>
            ))}
          </div>
        </Panel>
      )}
      {kind !== 'code' && blocks.length === 0 && (
        <Button type="button" variant="outline" className="w-fit" onClick={() => setBlocks([emptyBlock()])}>
          <Code2 />
          {tr('افزودنِ تکه‌کد')}
        </Button>
      )}

      {/* ---------- راهنمای استفاده ---------- */}
      <Panel
        title={kind === 'guide' ? tr('مراحل') : tr('چطور استفاده شود')}
        icon={<ListChecks />}
        description={kind === 'guide'
          ? tr('قدم‌به‌قدم و به زبانِ ساده — کارفرما همین را می‌خواند.')
          : tr('نفرِ بعدی باید بدونِ پرسیدن از شما بتواند نصبش کند.')}
      >
        <Field>
          <FieldLabel htmlFor="lib-steps">{kind === 'guide' ? tr('گام‌ها') : tr('گام‌های نصب')}</FieldLabel>
          <Textarea
            id="lib-steps"
            rows={5}
            value={steps}
            onChange={(e) => setSteps(e.target.value)}
            dir="auto"
            placeholder={kind === 'guide'
              ? tr('هر خط یک گام، مثلاً:\nDesigner را باز کنید\nدر Navigator المنتِ template-form-wrap را پیدا کنید')
              : tr('هر خط یک گام، مثلاً:\nبه المنتِ لیست ID ِ macy-container بدهید\nتکهٔ ۱ را در head بگذارید')}
          />
          <FieldDescription>{tr('هر خط یک گام؛ شماره‌گذاری خودکار است.')}</FieldDescription>
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="lib-warnings">{tr('هشدارها')}</FieldLabel>
            <Textarea id="lib-warnings" rows={3} value={warnings} onChange={(e) => setWarnings(e.target.value)} dir="auto" placeholder={tr('هر خط یکی — مثلاً: در body نگذارید؛ بعد از لیستِ CMS بگذارید')} />
          </Field>
          <Field>
            <FieldLabel htmlFor="lib-deps">{tr('پیش‌نیازها')}</FieldLabel>
            <Textarea id="lib-deps" rows={3} value={dependencies} onChange={(e) => setDependencies(e.target.value)} dir="auto" placeholder={tr('هر خط یکی — نام یا نشانیِ کتابخانه، مثلاً Finsweet Attributes')} />
          </Field>
        </div>
      </Panel>

      {/* ---------- تنظیمات ---------- */}
      <Panel
        title={tr('تنظیمات و گزینه‌ها')}
        icon={<SlidersHorizontal />}
        description={tr('Attribute، کلاس یا متغیری که بدونِ دست زدن به کد عوض می‌شود — نام، کارش و مقدارِ پیش‌فرض.')}
      >
        {options.length > 0 && (
          <div className="grid gap-2">
            {options.map((o) => (
              <div key={o.key} className="grid gap-2 rounded-lg bg-muted/60 p-2.5 sm:grid-cols-[1fr_7.5rem_1.4fr_7rem_auto] sm:items-start">
                <Input value={o.name} onChange={(e) => patchOption(o.key, { name: e.target.value })} placeholder="data-flow-price" dir="ltr" className="font-mono text-xs" aria-label={tr('نام')} />
                <NativeSelect value={o.kind} containerClassName="w-full" onChange={(e) => patchOption(o.key, { kind: e.target.value as LibraryOptionKind })} aria-label={tr('نوع')}>
                  {LIBRARY_OPTION_KINDS.map((k) => <NativeSelectOption key={k} value={k}>{tr(OPTION_KIND_LABELS[k])}</NativeSelectOption>)}
                </NativeSelect>
                <Input value={o.description} onChange={(e) => patchOption(o.key, { description: e.target.value })} placeholder={tr('چه کار می‌کند — مثلاً: قیمتِ پایه برای کیلومترهای اول')} dir="auto" aria-label={tr('چه کار می‌کند')} />
                <Input value={o.defaultValue} onChange={(e) => patchOption(o.key, { defaultValue: e.target.value })} placeholder={tr('پیش‌فرض')} dir="ltr" className="font-mono text-xs" aria-label={tr('پیش‌فرض')} />
                <IconButton type="button" variant="ghost" className="size-9" label={tr('حذف')} onClick={() => setOptions(options.filter((x) => x.key !== o.key))}>
                  <Trash2 className="size-3.5" />
                </IconButton>
              </div>
            ))}
          </div>
        )}
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="w-fit"
          onClick={() => setOptions([...options, { key: nextKey(), name: '', kind: 'attribute', description: '', defaultValue: '' }])}
        >
          <Plus />
          {tr('افزودنِ گزینه')}
        </Button>
      </Panel>

      {/* ---------- توضیحات و تصویر ---------- */}
      <Panel title={suggest ? tr('توضیحات') : tr('توضیحات، ویدیو و تصویر')} icon={<ImagePlus />}>
        {suggest ? (
          // ⚠️ پیشنهاد تصویر نمی‌برد — فایل صاحب دارد و پیشنهادِ ردشده نباید فایلِ یتیم بسازد.
          <Field>
            <FieldLabel htmlFor="lib-body">{tr('توضیحات')}</FieldLabel>
            <Textarea id="lib-body" rows={6} value={body} onChange={(e) => setBody(e.target.value)} dir="auto" />
          </Field>
        ) : (
          <MediaPicker>
            <Field>
              <FieldLabel htmlFor="lib-body">{tr('توضیحات')}</FieldLabel>
              <Textarea
                id="lib-body"
                rows={6}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                dir="auto"
                placeholder={tr('چرا این‌طور نوشته شد، محدودیت‌ها، راهِ دیگر… پیوندِ Loom یا YouTube همین‌جا پخش می‌شود.')}
              />
              <FieldDescription>{tr('تصویر را بکشید و رها کنید یا Ctrl+V بزنید.')}</FieldDescription>
            </Field>
          </MediaPicker>
        )}
        {!suggest && media.length > 0 && (
          <MediaGallery
            items={media}
            projectId={0}
            size="sm"
            onRemove={async (m) => {
              const r = await deleteMediaAction(entry!.id, m.id);
              if (!r.error) setMedia((list) => list.filter((x) => x.id !== m.id));
              return r;
            }}
          />
        )}
        <Field>
          <FieldLabel htmlFor="lib-demo">{tr('نمونهٔ زنده (اختیاری)')}</FieldLabel>
          <Input id="lib-demo" type="url" value={demoUrl} onChange={(e) => setDemoUrl(e.target.value)} dir="ltr" placeholder="https://…" />
        </Field>
      </Panel>

      {/* ---------- مرتبط ---------- */}
      {!suggest && entries.filter((e) => e.id !== entry?.id).length > 0 && (
        <Panel
          title={tr('موردهای مرتبط')}
          icon={<Link2 />}
          description={tr('مثلاً کدِ قیمت‌گذاری و راهنمای کارفرمایش — هر کدام از دیگری پیدا می‌شود.')}
        >
          <MultiSelect
            name="_related"
            placeholder={tr('انتخاب…')}
            options={entries.filter((e) => e.id !== entry?.id).map((e) => ({ id: e.id, label: `${e.title} · ${tr(KIND_LABELS[e.kind])}` }))}
            defaultSelected={related}
            onChange={setRelated}
          />
        </Panel>
      )}

      <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center justify-end gap-2 border-t bg-background/95 px-1 py-3 backdrop-blur">
        <Button asChild type="button" variant="outline">
          <Link href={entry ? `/library/${entry.id}` : '/library'}>{tr('انصراف')}</Link>
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && <Spinner />}
          {suggest ? <GitPullRequestArrow /> : null}
          {suggest ? tr('فرستادنِ پیشنهاد') : entry ? tr('ذخیرهٔ تغییرها') : tr('ثبت در کتابخانه')}
        </Button>
      </div>
    </form>
  );
}

/**
 * ویرایشگرِ سادهٔ کد — چپ‌به‌راست، تک‌فاصله، Tab دو فاصله می‌گذارد (نه پرشِ
 * فوکوس) و ارتفاع با کد بزرگ می‌شود.
 */
function CodeTextarea({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const rows = Math.min(28, Math.max(6, value.split('\n').length + 1));
  return (
    <Textarea
      ref={ref}
      id={id}
      dir="ltr"
      spellCheck={false}
      rows={rows}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key !== 'Tab' || e.shiftKey) return;
        e.preventDefault();
        const el = e.currentTarget;
        const { selectionStart: s, selectionEnd: end } = el;
        const next = `${value.slice(0, s)}  ${value.slice(end)}`;
        onChange(next);
        requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = s + 2; });
      }}
      placeholder="<script>…</script>"
      className="bg-card font-mono text-[12.5px] leading-5"
    />
  );
}
