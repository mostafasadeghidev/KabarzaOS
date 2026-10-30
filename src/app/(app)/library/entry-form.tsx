'use client';

import Link from 'next/link';
import { useActionState, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown, ArrowUp, BookOpenText, Check, Code2, FileText, GitBranch, GitPullRequestArrow, ImagePlus, Lightbulb,
  Link2, ListChecks, Package, PlayCircle, Plus, SlidersHorizontal, Star, Trash2, X,
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
  CATEGORY_LABELS, defaultPlacement, KIND_HINTS, KIND_LABELS, LANGUAGE_LABELS, LIBRARY_CATEGORIES, LIBRARY_KINDS,
  LIBRARY_LANGUAGES, LIBRARY_PLACEMENTS, LIBRARY_PLATFORMS, LIBRARY_STATUSES, PLACEMENT_HINTS, PLACEMENT_LABELS,
  optionKey, PLATFORM_LABELS, STATUS_LABELS, SUGGESTION_NOTE_LIMIT,
  type CleanBlock, type CleanOption, type CleanStep, type LibraryKind, type LibraryLanguage, type LibraryPlacement,
} from '@/domain/library/model';
import type { EntryDetail, EntryLink, LibraryMedia, ProjectOption } from '@/server/library/service';
import { deleteMediaAction, saveEntryAction, suggestEditAction, type LibraryState } from './_form/actions';
import { optionDraft, optionPayload, OptionsEditor, type OptionDraft } from './_form/options-editor';
import { StepsEditor, type StepDraft } from './_form/steps-editor';

interface BlockDraft {
  key: number;
  label: string;
  language: LibraryLanguage;
  placement: LibraryPlacement;
  placementNote: string;
  code: string;
}

interface RelatedDraft {
  key: number;
  id: string;
  note: string;
}

let seq = 0;
const nextKey = () => ++seq;

const KIND_ICON = { code: Code2, guide: BookOpenText, note: Lightbulb } as const;

const emptyBlock = (language: LibraryLanguage = 'js'): BlockDraft => ({
  key: nextKey(), label: '', language, placement: defaultPlacement(language), placementNote: '', code: '',
});

/** محتوای اولیهٔ فرم — از خودِ مورد، یا از پیشنهادِ بازِ قبلیِ کاربر. */
export interface FormContent {
  title: string;
  summary: string;
  topics: string[];
  body: string;
  warnings: string;
  dependencies: string;
  instances: string;
  demoUrl: string;
  videoUrl: string;
  cloneableUrl: string;
  steps: CleanStep[];
  blocks: CleanBlock[];
  options: CleanOption[];
}

/**
 * فرمِ ساخت و ویرایشِ موردِ کتابخانه (۲.۳۷.۰؛ ساختارِ تازه ۲.۴۷.۰).
 *
 * ⚠️ ترتیبِ بخش‌ها ترتیبِ نوشتن است: اول کدها و گزینه‌ها، بعد گام‌ها — گام
 * فقط چیزی را می‌تواند تیک بزند که بالاتر نوشته شده.
 * ⚠️ داده با یک JSON ِ پنهان می‌رود؛ تصویرها با ورودیِ رسانهٔ بقیهٔ اپ
 * (`MediaPicker`): `media` برای توضیحات و `stepmedia-<key>` برای هر گام.
 * ⚠️ حالتِ «پیشنهاد» (۲.۴۶.۰): همان فرم برای کسی که نویسنده نیست — فقط
 * محتوا؛ نوع، وضعیت، پلتفرم، دسته، نسخه، مبدأ، «کارفرما ببیند»، تصویرِ تازه،
 * مرتبط‌ها و پیش‌نیازها پنهان‌اند چون پیشنهاد آن‌ها را عوض نمی‌کند.
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
  initialContent,
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
  /** محتوای پیشنهادِ بازِ قبلی — به‌جای محتوای مورد. */
  initialContent?: FormContent | null;
}) {
  const tr = useT();
  const { show } = useToast();
  const suggest = mode === 'suggest';
  const [state, formAction, pending] = useActionState<LibraryState, FormData>(
    suggest ? suggestEditAction : saveEntryAction, {},
  );
  const start: FormContent | null = initialContent ?? entry;
  const [note, setNote] = useState(initialNote);

  const [kind, setKind] = useState<LibraryKind>(entry?.kind ?? defaultKind);
  const [title, setTitle] = useState(start?.title ?? '');
  const [summary, setSummary] = useState(start?.summary ?? '');
  const [platform, setPlatform] = useState<string>(entry?.platform ?? 'webflow');
  const [status, setStatus] = useState<string>(entry?.status ?? 'ready');
  const [category, setCategory] = useState<string>(entry?.category ?? '');
  const [versionLabel, setVersionLabel] = useState(entry?.versionLabel ?? '');
  const [topicList, setTopicList] = useState<string[]>(start?.topics ?? []);
  const [topicDraft, setTopicDraft] = useState('');
  const [origin, setOrigin] = useState<string>(
    entry?.origin ? String(entry.origin.id) : defaultProjectId ? String(defaultProjectId) : '',
  );
  const [warnings, setWarnings] = useState(start?.warnings ?? '');
  const [dependencies, setDependencies] = useState(start?.dependencies ?? '');
  const [instances, setInstances] = useState(start?.instances ?? '');
  const [body, setBody] = useState(start?.body ?? '');
  const [demoUrl, setDemoUrl] = useState(start?.demoUrl ?? '');
  const [videoUrl, setVideoUrl] = useState(start?.videoUrl ?? '');
  const [cloneableUrl, setCloneableUrl] = useState(start?.cloneableUrl ?? '');
  const [changeNote, setChangeNote] = useState('');
  const [clientVisible, setClientVisible] = useState(entry?.clientVisible ?? false);
  const [related, setRelated] = useState<RelatedDraft[]>(
    entry?.related.map((r) => ({ key: nextKey(), id: String(r.id), note: r.note })) ?? [],
  );
  const [requires, setRequires] = useState<number[]>(entry?.requires.map((r) => r.id) ?? []);
  const [replaces, setReplaces] = useState<string>(entry?.olderVersionList[0] ? String(entry.olderVersionList[0].id) : '');
  const [cover, setCover] = useState<number | null>(entry?.coverAttachmentId ?? null);
  const [media, setMedia] = useState<LibraryMedia[]>(entry?.media ?? []);
  const [blocks, setBlocks] = useState<BlockDraft[]>(
    start ? start.blocks.map((b) => ({ ...b, key: nextKey() })) : (defaultKind === 'code' ? [emptyBlock()] : []),
  );
  const [options, setOptions] = useState<OptionDraft[]>(start?.options.map((o) => optionDraft(nextKey(), o)) ?? []);
  // ⚠️ گام‌ها به تکه و گزینه با key ِ همان پیش‌نویس وصل می‌شوند؛ اینجا یک بار از جایگاه/نام ترجمه می‌شوند.
  const [steps, setSteps] = useState<StepDraft[]>(() => (start?.steps ?? []).map((s) => ({
    key: nextKey(),
    title: s.title,
    body: s.body,
    blockKeys: s.blockIndexes.map((i) => blocks[i]?.key).filter((k): k is number => k !== undefined),
    optionKeys: s.optionNames.map((n) => options.find((o) => optionKey(o) === n)?.key).filter((k): k is number => k !== undefined),
    mediaIds: [...s.mediaIds],
  })));

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
  const others = entries.filter((e) => e.id !== entry?.id);
  const images = media.filter((m) => m.kind === 'image');

  const blockIndex = new Map(blocks.map((b, i) => [b.key, i]));
  // ⚠️ همان شناسه‌ای که سرور می‌سازد (نام، یا «نام=مقدار»)؛ فاصلهٔ دو سر مثلِ سرور بریده می‌شود.
  const optionName = new Map(options.map((o) => [o.key, optionKey({ name: o.name.trim(), value: o.value.trim() })]));
  const payload = JSON.stringify({
    kind, title, summary, platform, status, category, versionLabel, topics: topicList, body, warnings, dependencies,
    instances, demoUrl, videoUrl, cloneableUrl, changeNote, clientVisible,
    originProjectId: origin ? Number(origin) : null,
    blocks: blocks.map(({ key: _k, ...b }) => b),
    options: options.map(optionPayload),
    steps: steps.map((s) => ({
      key: String(s.key),
      title: s.title,
      body: s.body,
      blockIndexes: s.blockKeys.map((k) => blockIndex.get(k)).filter((i): i is number => i !== undefined),
      optionNames: s.optionKeys.map((k) => optionName.get(k)).filter((n): n is string => Boolean(n?.trim())),
      mediaIds: s.mediaIds,
    })),
    related: related.filter((r) => Number(r.id) > 0).map((r) => ({ id: Number(r.id), note: r.note })),
    requiresIds: requires,
    replacesId: replaces ? Number(replaces) : null,
    coverMediaId: cover,
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
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem]">
          <Field>
            <FieldLabel htmlFor="lib-title">{tr('عنوان')}</FieldLabel>
            <Input
              id="lib-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              required
              dir="auto"
              placeholder={kind === 'guide' ? tr('مثلاً: تغییرِ قیمت‌های ارسال') : tr('مثلاً: اسلایدرِ Swiper با کنترلِ سفارشی')}
            />
          </Field>
          {!suggest && (
            <Field>
              <FieldLabel htmlFor="lib-version">{tr('نسخه')}</FieldLabel>
              <Input id="lib-version" value={versionLabel} onChange={(e) => setVersionLabel(e.target.value)} maxLength={30} dir="ltr" placeholder="v1.0" className="font-mono" />
            </Field>
          )}
        </div>
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
        {!suggest && <div className="grid gap-3 sm:grid-cols-2 @3xl/main:grid-cols-4">
          <Field>
            <FieldLabel htmlFor="lib-category">{tr('دسته')}</FieldLabel>
            <NativeSelect id="lib-category" value={category} onChange={(e) => setCategory(e.target.value)} containerClassName="w-full">
              <NativeSelectOption value="">{tr('— بی‌دسته —')}</NativeSelectOption>
              {LIBRARY_CATEGORIES.map((c) => <NativeSelectOption key={c} value={c}>{tr(CATEGORY_LABELS[c])}</NativeSelectOption>)}
            </NativeSelect>
          </Field>
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
              placeholder={topicList.length ? '' : tr('مثلاً GSAP، Finsweet، موبایل — با Enter اضافه کنید')}
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
        {!suggest && others.length > 0 && (
          <Field>
            <FieldLabel className="flex items-center gap-1.5"><GitBranch className="size-3.5" aria-hidden />{tr('نسخهٔ تازهٔ کدام مورد است؟ (اختیاری)')}</FieldLabel>
            <SearchableSelect value={replaces} onValueChange={setReplaces} containerClassName="w-full">
              <NativeSelectOption value="">{tr('— هیچ‌کدام —')}</NativeSelectOption>
              {others.map((e) => (
                <NativeSelectOption key={e.id} value={String(e.id)}>{e.versionLabel ? `${e.title} · ${e.versionLabel}` : e.title}</NativeSelectOption>
              ))}
            </SearchableSelect>
            <FieldDescription>{tr('موردِ قدیمی «منسوخ» می‌شود و در فهرست زیرِ همین نسخه جمع می‌شود؛ صفحه‌اش به این نسخه پیوند می‌دهد.')}</FieldDescription>
          </Field>
        )}
      </Panel>

      {/* ---------- ویدیو و نمونه ---------- */}
      <Panel title={tr('ویدیو و نمونه')} icon={<PlayCircle />} description={tr('ویدیوی آموزشی بالای صفحه پخش می‌شود؛ Loom، YouTube یا Vimeo.')}>
        <div className="grid gap-3 @3xl/main:grid-cols-3">
          <Field>
            <FieldLabel htmlFor="lib-video">{tr('ویدیوی آموزشی')}</FieldLabel>
            <Input id="lib-video" type="url" value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} dir="ltr" placeholder="https://www.loom.com/share/…" />
          </Field>
          <Field>
            <FieldLabel htmlFor="lib-demo">{tr('نمونهٔ زنده')}</FieldLabel>
            <Input id="lib-demo" type="url" value={demoUrl} onChange={(e) => setDemoUrl(e.target.value)} dir="ltr" placeholder="https://…" />
          </Field>
          <Field>
            <FieldLabel htmlFor="lib-clone">{tr('Cloneable / Read-only')}</FieldLabel>
            <Input id="lib-clone" type="url" value={cloneableUrl} onChange={(e) => setCloneableUrl(e.target.value)} dir="ltr" placeholder="https://webflow.com/made-in-webflow/…" />
          </Field>
        </div>
      </Panel>

      {/* ---------- کدها ---------- */}
      {(kind === 'code' || blocks.length > 0) && (
        <Panel
          title={tr('کدها')}
          icon={<Code2 />}
          description={tr('هر تکه را جایی که باید نصب شود ثبت کنید — مثلاً CSS در head و اسکریپت پیش از پایانِ body. پایین‌تر، هر گام می‌تواند تکهٔ خودش را نشان دهد.')}
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
                  <Input id={`b-label-${b.key}`} value={b.label} onChange={(e) => patchBlock(b.key, { label: e.target.value })} placeholder={tr('مثلاً: کتابخانهٔ Swiper')} dir="auto" maxLength={120} />
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

      {/* ---------- گزینه‌ها ---------- */}
      <Panel
        title={tr('گزینه‌ها: attribute، کلاس، متغیر')}
        icon={<SlidersHorizontal />}
        description={tr('هر چیزی که نصب‌کننده روی المنت‌ها می‌گذارد یا عوض می‌کند. «لازم» یعنی بی‌آن کار نمی‌کند؛ بقیه اختیاری‌اند.')}
      >
        <OptionsEditor options={options} setOptions={setOptions} nextKey={nextKey} />
      </Panel>

      {/* ---------- گام‌ها ---------- */}
      <Panel
        title={kind === 'guide' ? tr('مراحل') : tr('چطور استفاده شود')}
        icon={<ListChecks />}
        description={kind === 'guide'
          ? tr('قدم‌به‌قدم و به زبانِ ساده — کارفرما همین را می‌خواند. برای هر گام یک اسکرین‌شات بگذارید.')
          : tr('نفرِ بعدی باید بدونِ پرسیدن از شما بتواند نصبش کند. هر گام تصویر، کد و گزینه‌های خودش را دارد.')}
      >
        <StepsEditor
          steps={steps}
          setSteps={setSteps}
          blocks={blocks}
          options={options}
          media={media}
          allowUpload={!suggest}
          nextKey={nextKey}
        />
      </Panel>

      {/* ---------- پیش از استفاده ---------- */}
      <Panel title={tr('هشدارها، پیش‌نیازها و استفادهٔ چندباره')} icon={<Package />}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="lib-warnings">{tr('هشدارها')}</FieldLabel>
            <Textarea id="lib-warnings" rows={3} value={warnings} onChange={(e) => setWarnings(e.target.value)} dir="auto" placeholder={tr('هر خط یکی — مثلاً: در body نگذارید؛ بعد از لیستِ CMS بگذارید')} />
          </Field>
          <Field>
            <FieldLabel htmlFor="lib-deps">{tr('پیش‌نیازهای بیرونی')}</FieldLabel>
            <Textarea id="lib-deps" rows={3} value={dependencies} onChange={(e) => setDependencies(e.target.value)} dir="auto" placeholder={tr('هر خط یکی — نام یا نشانیِ کتابخانه، مثلاً Finsweet Attributes')} />
          </Field>
        </div>
        {!suggest && others.length > 0 && (
          <Field>
            <FieldLabel>{tr('پیش‌نیاز از همین کتابخانه')}</FieldLabel>
            <MultiSelect
              name="_requires"
              placeholder={tr('مثلاً اسکریپتِ GSAP یا Swiper…')}
              options={others.map((e) => ({ id: e.id, label: e.versionLabel ? `${e.title} · ${e.versionLabel}` : e.title }))}
              defaultSelected={requires}
              onChange={setRequires}
            />
            <FieldDescription>{tr('با نصبِ این مورد روی پروژه، پیش‌نیازها هم اگر نباشند نصب می‌شوند و در «کدِ یک‌جای پروژه» فقط یک بار می‌آیند.')}</FieldDescription>
          </Field>
        )}
        <Field>
          <FieldLabel htmlFor="lib-instances">{tr('استفادهٔ چندباره در یک صفحه')}</FieldLabel>
          <Textarea id="lib-instances" rows={2} value={instances} onChange={(e) => setInstances(e.target.value)} dir="auto" placeholder={tr('هر خط یک نکته — مثلاً: به هر اسلایدر یک `data-slider-id` ِ یکتا بدهید')} />
        </Field>
      </Panel>

      {/* ---------- توضیحات و تصویر ---------- */}
      <Panel title={suggest ? tr('توضیحات') : tr('توضیحات و تصویر')} icon={<ImagePlus />}>
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
              <FieldDescription>{tr('تصویرِ کلی را بکشید و رها کنید یا Ctrl+V بزنید؛ تصویرِ هر گام را در همان گام بگذارید.')}</FieldDescription>
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
              if (!r.error) {
                setMedia((list) => list.filter((x) => x.id !== m.id));
                setSteps((list) => list.map((s) => ({ ...s, mediaIds: s.mediaIds.filter((id) => id !== m.id) })));
                if (cover === m.id) setCover(null);
              }
              return r;
            }}
          />
        )}
        {!suggest && images.length > 0 && (
          <Field>
            <FieldLabel className="flex items-center gap-1.5"><Star className="size-3.5" aria-hidden />{tr('تصویرِ شاخص')}</FieldLabel>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                aria-pressed={cover === null}
                onClick={() => setCover(null)}
                className={cn(
                  'flex h-14 items-center rounded-md border-2 px-3 text-xs',
                  cover === null ? 'border-primary text-primary' : 'border-dashed text-muted-foreground hover:text-foreground',
                )}
              >
                {tr('خودکار (اولین تصویر)')}
              </button>
              {images.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  aria-pressed={cover === m.id}
                  aria-label={m.name}
                  onClick={() => setCover(m.id)}
                  className={cn(
                    'relative size-14 overflow-hidden rounded-md border-2',
                    cover === m.id ? 'border-primary' : 'border-transparent opacity-70 hover:opacity-100',
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- مسیرِ گیت‌شدهٔ فایل */}
                  <img src={`/api/files/${m.fileId}?thumb`} alt="" className="size-full object-cover" />
                  {cover === m.id && (
                    <span className="absolute end-0.5 top-0.5 grid size-4 place-items-center rounded-full bg-primary text-primary-foreground">
                      <Check className="size-3" aria-hidden />
                    </span>
                  )}
                </button>
              ))}
            </div>
            <FieldDescription>{tr('روی کارتِ فهرست دیده می‌شود.')}</FieldDescription>
          </Field>
        )}
      </Panel>

      {/* ---------- با این کار می‌کند ---------- */}
      {!suggest && others.length > 0 && (
        <Panel
          title={tr('با این کار می‌کند')}
          icon={<Link2 />}
          description={tr('مثلاً کدِ قیمت‌گذاری و راهنمای کارفرمایش — با یک جمله که چطور با هم. از هر دو طرف دیده می‌شود.')}
        >
          {related.map((r) => (
            <div key={r.key} className="grid gap-2 rounded-lg bg-muted/60 p-2.5 sm:grid-cols-[minmax(0,16rem)_minmax(0,1fr)_auto] sm:items-start">
              <SearchableSelect value={r.id} onValueChange={(v) => setRelated((list) => list.map((x) => (x.key === r.key ? { ...x, id: v } : x)))} containerClassName="w-full">
                <NativeSelectOption value="">{tr('— انتخاب —')}</NativeSelectOption>
                {others.filter((e) => String(e.id) === r.id || !related.some((x) => x.id === String(e.id))).map((e) => (
                  <NativeSelectOption key={e.id} value={String(e.id)}>{`${e.title} · ${tr(KIND_LABELS[e.kind])}`}</NativeSelectOption>
                ))}
              </SearchableSelect>
              <Input
                value={r.note}
                onChange={(e) => setRelated((list) => list.map((x) => (x.key === r.key ? { ...x, note: e.target.value } : x)))}
                placeholder={tr('چطور با هم؟ مثلاً: مقدارِ اسلایدر فیلترِ لیست را تنظیم می‌کند')}
                dir="auto"
                maxLength={500}
                aria-label={tr('چطور با هم')}
              />
              <IconButton type="button" variant="ghost" className="size-9" label={tr('حذف')} onClick={() => setRelated((list) => list.filter((x) => x.key !== r.key))}>
                <X className="size-3.5" />
              </IconButton>
            </div>
          ))}
          <Button type="button" size="sm" variant="outline" className="w-fit" onClick={() => setRelated((list) => [...list, { key: nextKey(), id: '', note: '' }])}>
            <Plus />
            {tr('افزودنِ موردِ مرتبط')}
          </Button>
        </Panel>
      )}

      <div className="sticky bottom-0 z-10 -mx-1 grid gap-2 border-t bg-background/95 px-1 py-3 backdrop-blur sm:flex sm:flex-wrap sm:items-center sm:justify-end">
        {entry && !suggest && (
          <Input
            value={changeNote}
            onChange={(e) => setChangeNote(e.target.value)}
            maxLength={300}
            dir="auto"
            placeholder={tr('چه چیزی عوض شد؟ (اختیاری — کنارِ نشانِ «به‌روز شد» دیده می‌شود)')}
            aria-label={tr('چه چیزی عوض شد؟')}
            className="sm:me-auto sm:max-w-md"
          />
        )}
        <div className="flex justify-end gap-2">
          <Button asChild type="button" variant="outline">
            <Link href={entry ? `/library/${entry.id}` : '/library'}>{tr('انصراف')}</Link>
          </Button>
          <Button type="submit" disabled={pending}>
            {pending && <Spinner />}
            {suggest ? <GitPullRequestArrow /> : null}
            {suggest ? tr('فرستادنِ پیشنهاد') : entry ? tr('ذخیرهٔ تغییرها') : tr('ثبت در کتابخانه')}
          </Button>
        </div>
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

