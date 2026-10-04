'use client';

import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useFormStatus } from 'react-dom';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowRight, Clapperboard, ExternalLink, Eye, EyeOff, FileText, MessageSquare, Paperclip, Pencil, Play, Plus, Timer,
  Trash2, Users,
} from 'lucide-react';
import {
  addReviewItemAction, deleteReviewAction, loadReviewAction, type ReviewFormState,
} from '../_form/review-actions';
import { ReviewDialog, type ReviewFormValues } from './review-dialog';
import { TaskDialog } from './task-dialog';
import { TaskStatusPicker } from './task-status-picker';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Field, FieldLabel } from '@/components/ui/field';
import { Combobox, MultiSelect } from '@/components/ui/combobox';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { EmptyState } from '@/components/ui/empty-state';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TagChip } from '@/components/ui/tag-chip';
import { useConfirm } from '@/components/ui/confirm';
import { useActionToast } from '@/components/ui/toast';
import { SectionHeader } from '@/components/page-shell';
import { RichText } from '@/components/media/rich-text';
import { MediaGallery } from '@/components/media/media-gallery';
import { MediaPicker } from '@/components/media/media-picker';
import { VideoFrame, type VideoFrameHandle } from '@/components/media/video-frame';
import { formatTimestamp, parseVideoUrl } from '@/domain/files/video';
import { SOURCE_LABELS } from '@/domain/projects/reviews';
import type { ReviewSource } from '@/db/schema/projects';
import { useT, useTimeZone } from '@/i18n/client';
import { formatDateTime } from '@/i18n/datetime';
import { cn } from '@/lib/utils';

/** یک ردیفِ فهرست — همان `listReviews`. */
export interface ReviewListItem {
  id: number;
  title: string;
  source: ReviewSource;
  videoUrl: string | null;
  notes: string;
  clientVisible: boolean;
  createdAt: Date | string;
  createdByName: string | null;
  roles: Array<{ id: number; name: string; color: string | null }>;
  progress: { done: number; total: number; percent: number };
  mediaCount: number;
}

type Loaded = Awaited<ReturnType<typeof loadReviewAction>>;
type Item = Loaded['detail']['items'][number];

/**
 * تبِ «بازبینی‌ها» (۱.۱۱۶.۰) — فهرستِ بازبینی‌ها و نمای کاری‌ِ هر کدام:
 * پخش‌کننده کنارِ فهرستِ موردها، پرش به زمانِ هر مورد، و افزودنِ مورد ← تسک.
 *
 * ⚠️ بازبینیِ باز در آدرس می‌ماند (`?review=`) تا پیوندِ اعلان و «از بازبینیِ …»
 * ِ مودالِ تسک مستقیم به همان برسد.
 */
export function ReviewsTab({
  projectId,
  reviews,
  canCreate,
  roleOptions,
  showAudience,
  initialReviewId,
}: {
  projectId: number;
  reviews: ReviewListItem[];
  /** مدیرِ پروژه و پروژهٔ نامنجمد. */
  canCreate: boolean;
  roleOptions: Array<{ id: number; name: string }>;
  /** نشانِ مخاطب و «پنهان از کارفرما» فقط برای تیم — کارفرما فقط بازبینیِ آشکار را می‌بیند. */
  showAudience: boolean;
  initialReviewId: number | null;
}) {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const [selected, setSelected] = useState<number | null>(initialReviewId);
  const [creating, setCreating] = useState(false);
  useEffect(() => { setSelected(initialReviewId); }, [initialReviewId]);

  const select = (id: number | null) => {
    setSelected(id);
    const next = new URLSearchParams(search?.toString() ?? '');
    next.set('tab', 'reviews');
    if (id === null) next.delete('review'); else next.set('review', String(id));
    router.replace(`${pathname}?${next}`, { scroll: false });
  };

  if (selected !== null) {
    return (
      <ReviewDetail
        key={selected}
        reviewId={selected}
        projectId={projectId}
        roleOptions={roleOptions}
        showAudience={showAudience}
        onBack={() => select(null)}
      />
    );
  }

  return (
    <div className="grid gap-4">
      <SectionHeader
        title={t('بازبینی‌ها')}
        description={t('ویدئوی لوم و هر بررسیِ دیگرِ پروژه، با موردهایی که هر کدام یک تسک است.')}
        actions={canCreate && (
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="size-4" />
            {t('بازبینیِ تازه')}
          </Button>
        )}
      />

      {reviews.length === 0 ? (
        <EmptyState
          icon={<Clapperboard />}
          title={t('هنوز بازبینی‌ای نیست.')}
          description={canCreate ? t('پیوندِ لوم را بگذارید و موردهایش را یکی‌یکی به تسک تبدیل کنید.') : undefined}
        />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {reviews.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => select(r.id)}
                className="grid w-full gap-2.5 rounded-xl border bg-card p-3.5 text-start transition hover:border-primary/40 hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2 font-medium">
                    <Clapperboard className="size-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{r.title}</span>
                  </span>
                  <Badge variant="outline" className="shrink-0">{t(SOURCE_LABELS[r.source])}</Badge>
                </div>
                {showAudience && <AudienceLine roles={r.roles} clientVisible={r.clientVisible} />}
                <div className="grid gap-1">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{t('{done} از {total} مورد انجام شده', { done: r.progress.done, total: r.progress.total })}</span>
                    <span className="num">{r.progress.percent}%</span>
                  </div>
                  <Progress value={r.progress.percent} className="h-1.5" indicatorClassName={r.progress.percent === 100 ? 'bg-emerald-500' : undefined} />
                </div>
                <ReviewMeta createdAt={r.createdAt} createdByName={r.createdByName} mediaCount={r.mediaCount} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {canCreate && (
        <ReviewDialog
          open={creating}
          onOpenChange={setCreating}
          projectId={projectId}
          roleOptions={roleOptions}
          onSaved={(id) => select(id)}
        />
      )}
    </div>
  );
}

function AudienceLine({ roles, clientVisible }: { roles: Array<{ id: number; name: string; color: string | null }>; clientVisible: boolean }) {
  const t = useT();
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      <Users className="size-3.5 text-muted-foreground" aria-label={t('مخاطب')} />
      {roles.length === 0
        ? <span className="text-muted-foreground">{t('کلِ تیمِ پروژه')}</span>
        : roles.map((r) => <TagChip key={r.id} color={r.color}>{r.name}</TagChip>)}
      <span className={cn('ms-auto inline-flex items-center gap-1', clientVisible ? 'text-teal-700 dark:text-teal-400' : 'text-muted-foreground')}>
        {clientVisible ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
        {clientVisible ? t('کارفرما می‌بیند') : t('پنهان از کارفرما')}
      </span>
    </div>
  );
}

function ReviewMeta({ createdAt, createdByName, mediaCount }: { createdAt: Date | string; createdByName: string | null; mediaCount: number }) {
  const tz = useTimeZone();
  return (
    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
      <span>{createdByName ?? '—'}</span>
      <span>·</span>
      <span className="num">{formatDateTime(createdAt, tz)}</span>
      {mediaCount > 0 && (
        <span className="ms-auto inline-flex items-center gap-1"><Paperclip className="size-3" /><span className="num">{mediaCount}</span></span>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * نمای یک بازبینی
 * ------------------------------------------------------------------ */

function ReviewDetail({
  reviewId,
  projectId,
  roleOptions,
  showAudience,
  onBack,
}: {
  reviewId: number;
  projectId: number;
  roleOptions: Array<{ id: number; name: string }>;
  showAudience: boolean;
  onBack: () => void;
}) {
  const t = useT();
  const confirm = useConfirm();
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [openTask, setOpenTask] = useState<number | null>(null);
  const [filter, setFilter] = useState<'all' | 'open' | 'done'>('all');
  const [deleting, startDelete] = useTransition();
  const frame = useRef<VideoFrameHandle>(null);
  const video = useRef<HTMLVideoElement>(null);

  const reload = () => loadReviewAction(reviewId).then(setData).catch(() => setError('بازبینی پیدا نشد یا دسترسی ندارید.'));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { reload(); }, [reviewId]);

  const review = data?.detail.review;
  const embed = review?.videoUrl ? parseVideoUrl(review.videoUrl) : null;
  const uploaded = data?.detail.media.find((m) => m.kind === 'video') ?? null;
  const others = data?.detail.media.filter((m) => m !== uploaded) ?? [];
  const canSeek = Boolean(embed || uploaded);

  /** پرش به زمانِ مورد — پخش‌کنندهٔ قاب‌شده یا ویدئوی بارگذاری‌شده. */
  const seek = (seconds: number) => {
    if (video.current) {
      video.current.currentTime = seconds;
      void video.current.play().catch(() => {});
    } else {
      frame.current?.seek(seconds);
    }
    document.getElementById('review-player')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  const items = useMemo(() => {
    const all = data?.detail.items ?? [];
    return filter === 'all' ? all : all.filter((i) => (filter === 'done' ? i.done : !i.done));
  }, [data, filter]);

  if (error) return (
    <div className="grid gap-3">
      <BackButton onBack={onBack} />
      <p className="text-sm text-destructive">{t(error)}</p>
    </div>
  );
  if (!data || !review) return (
    <div className="grid gap-3">
      <BackButton onBack={onBack} />
      <p className="flex items-center gap-2 text-sm text-muted-foreground"><Spinner />{t('در حالِ بارگذاری…')}</p>
    </div>
  );

  const formValues: ReviewFormValues = {
    id: review.id, title: review.title, videoUrl: review.videoUrl, source: review.source,
    notes: review.notes, roles: review.roles, clientVisible: review.clientVisible,
  };
  const progress = data.detail.progress;

  return (
    <div className="grid gap-4">
      <BackButton onBack={onBack} />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid min-w-0 gap-1.5">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Clapperboard className="size-5 text-muted-foreground" />
            {review.title}
            <Badge variant="outline">{t(SOURCE_LABELS[review.source])}</Badge>
          </h2>
          {showAudience && <AudienceLine roles={review.roles} clientVisible={review.clientVisible} />}
          <ReviewMeta createdAt={review.createdAt} createdByName={review.createdByName} mediaCount={0} />
        </div>
        {data.detail.canManage && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              <Pencil className="size-3.5" />{t('ویرایش')}
            </Button>
            <Button
              size="sm" variant="ghost" className="text-destructive hover:text-destructive" disabled={deleting}
              onClick={async () => {
                if (!(await confirm({
                  title: t('این بازبینی حذف شود؟'),
                  description: t('تسک‌هایی که از آن ساخته شده‌اند می‌مانند؛ فقط پیوندشان به بازبینی برداشته می‌شود.'),
                }))) return;
                startDelete(async () => {
                  const result = await deleteReviewAction(review.id);
                  if (!result.error) onBack();
                });
              }}
            >
              <Trash2 className="size-3.5" />{t('حذف')}
            </Button>
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        {/* ستونِ پخش‌کننده — روی صفحهٔ بزرگ هنگامِ پیمایشِ موردها سرِ جایش می‌ماند. */}
        <div id="review-player" className="grid content-start gap-3 lg:sticky lg:top-4 lg:self-start">
          {embed ? (
            <VideoFrame ref={frame} video={{ ...embed, href: review.videoUrl ?? undefined }} />
          ) : uploaded ? (
            <video
              ref={video}
              src={`/api/files/${uploaded.fileId}`}
              controls
              preload="metadata"
              className="aspect-video w-full rounded-lg border bg-black"
            />
          ) : review.videoUrl ? (
            <a href={review.videoUrl} target="_blank" rel="noopener noreferrer nofollow"
              className="inline-flex items-center gap-1.5 text-sm text-primary underline-offset-4 hover:underline" dir="ltr">
              <ExternalLink className="size-4" />{review.videoUrl}
            </a>
          ) : null}
          {review.notes && (
            <div className="rounded-lg bg-muted/40 p-3"><RichText text={review.notes} /></div>
          )}
          {others.length > 0 && <MediaGallery items={others} projectId={projectId} onChanged={reload} />}
        </div>

        <div className="grid content-start gap-3">
          <div className="grid gap-1.5 rounded-lg border p-3">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">{t('پیشرفت')}</span>
              <span className="text-muted-foreground">
                {t('{done} از {total} مورد انجام شده', { done: progress.done, total: progress.total })}
              </span>
            </div>
            <Progress value={progress.percent} indicatorClassName={progress.percent === 100 ? 'bg-emerald-500' : undefined} />
          </div>

          {data.detail.canManage && data.options && (
            <AddItemForm
              reviewId={review.id}
              reviewRoles={review.roles}
              clientVisible={review.clientVisible}
              options={data.options}
              areas={[...new Set(data.detail.items.map((i) => i.area).filter(Boolean))]}
              currentTime={uploaded ? () => video.current?.currentTime ?? null : null}
              onAdded={reload}
            />
          )}

          <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
            <TabsList>
              <TabsTrigger value="all" className="flex-none px-3">{t('همه')}</TabsTrigger>
              <TabsTrigger value="open" className="flex-none px-3">{t('باز')}</TabsTrigger>
              <TabsTrigger value="done" className="flex-none px-3">{t('انجام‌شده')}</TabsTrigger>
            </TabsList>
          </Tabs>

          {items.length === 0 ? (
            <EmptyState title={data.detail.items.length === 0 ? t('هنوز موردی ثبت نشده.') : t('موردی نیست.')} />
          ) : (
            <ul className="grid gap-2">
              {items.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  statuses={data.statuses}
                  canChangeStatus={data.detail.canInteract && data.statuses.length > 0}
                  showClientHidden={data.detail.seesClientHidden && review.clientVisible}
                  onSeek={canSeek ? seek : null}
                  onOpen={() => setOpenTask(item.id)}
                  onChanged={reload}
                />
              ))}
            </ul>
          )}
        </div>
      </div>

      {data.detail.canManage && (
        <ReviewDialog
          open={editing}
          onOpenChange={setEditing}
          projectId={projectId}
          roleOptions={roleOptions}
          review={formValues}
          onSaved={() => { void reload(); }}
        />
      )}
      <TaskDialog
        taskId={openTask}
        open={openTask !== null}
        onOpenChange={(o) => { if (!o) { setOpenTask(null); void reload(); } }}
      />
    </div>
  );
}

function BackButton({ onBack }: { onBack: () => void }) {
  const t = useT();
  return (
    <div>
      <Button size="sm" variant="ghost" className="px-0 text-muted-foreground hover:bg-transparent" onClick={onBack}>
        <ArrowRight className="size-4 ltr:rotate-180" />
        {t('همهٔ بازبینی‌ها')}
      </Button>
    </div>
  );
}

function ItemRow({
  item, statuses, canChangeStatus, showClientHidden, onSeek, onOpen, onChanged,
}: {
  item: Item;
  statuses: Loaded['statuses'];
  canChangeStatus: boolean;
  showClientHidden: boolean;
  onSeek: ((seconds: number) => void) | null;
  onOpen: () => void;
  onChanged: () => void;
}) {
  const t = useT();
  return (
    <li className={cn('grid gap-1.5 rounded-lg border bg-card p-2.5', item.done && 'opacity-70')}>
      <div className="flex items-start gap-2">
        {item.start !== null && (
          <button
            type="button"
            disabled={!onSeek}
            onClick={() => onSeek?.(item.start!)}
            title={onSeek ? t('پخش از همین لحظه') : undefined}
            className="num inline-flex shrink-0 items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary transition hover:bg-primary/20 disabled:cursor-default disabled:bg-muted disabled:text-muted-foreground"
            dir="ltr"
          >
            <Play className="size-3" />
            {formatTimestamp(item.start)}{item.end !== null ? `–${formatTimestamp(item.end)}` : ''}
          </button>
        )}
        <button type="button" onClick={onOpen} className={cn('min-w-0 flex-1 text-start text-sm font-medium hover:underline', item.done && 'line-through')}>
          {item.title}
        </button>
        <TaskStatusPicker
          task={{ id: item.id, statusTagId: item.statusTagId, statusName: item.statusName, statusColor: item.statusColor, isReview: null }}
          options={statuses}
          canManage={canChangeStatus}
          onChanged={onChanged}
        />
      </div>
      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
        {item.area && <span className="rounded-sm bg-muted px-1.5 py-px">{item.area}</span>}
        {item.priorityName && <TagChip color={item.priorityColor}>{item.priorityName}</TagChip>}
        {item.assigneeName
          ? <span>{item.assigneeName}</span>
          : item.roles.length > 0 && <span>{item.roles.join(t('، '))}</span>}
        {showClientHidden && item.clientHidden && (
          <span className="inline-flex items-center gap-1" title={t('پنهان از کارفرما')}><EyeOff className="size-3" /></span>
        )}
        {item.notesCount > 0 && <span className="inline-flex items-center gap-1"><MessageSquare className="size-3" /><span className="num">{item.notesCount}</span></span>}
        {item.mediaCount > 0 && <span className="inline-flex items-center gap-1"><Paperclip className="size-3" /><span className="num">{item.mediaCount}</span></span>}
        {item.description && <span className="inline-flex items-center gap-1"><FileText className="size-3" /></span>}
      </div>
    </li>
  );
}

function AddButton() {
  const { pending } = useFormStatus();
  const t = useT();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? <><Spinner />{t('در حالِ ثبت…')}</> : <><Plus className="size-4" />{t('افزودنِ مورد')}</>}
    </Button>
  );
}

/**
 * افزودنِ مورد ← تسک. ⚠️ پس از هر ثبت، «بخش» و نقش‌ها می‌مانند و زمان/عنوان
 * خالی می‌شود: موردهای یک ویدئو پشتِ سرِ هم و اغلب در همان بخش ثبت می‌شوند.
 */
function AddItemForm({
  reviewId, reviewRoles, clientVisible, options, areas, currentTime, onAdded,
}: {
  reviewId: number;
  reviewRoles: Array<{ id: number; name: string }>;
  clientVisible: boolean;
  options: NonNullable<Loaded['options']>;
  areas: string[];
  /** فقط ویدئوی بارگذاری‌شده زمانِ جاری را می‌دهد؛ قابِ لوم/یوتیوب نه. */
  currentTime: (() => number | null) | null;
  onAdded: () => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [round, setRound] = useState(0);
  const [area, setArea] = useState('');
  const [roles, setRoles] = useState<number[]>([]);
  const [assignee, setAssignee] = useState<{ id: number | null; label: string }>({ id: null, label: '' });
  const startRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLInputElement>(null);
  const [state, action] = useActionState<ReviewFormState, FormData>(async (prev, formData) => {
    setArea(String(formData.get('area') ?? ''));
    const result = await addReviewItemAction(prev, formData);
    if (result.ok) { setRound((r) => r + 1); setAssignee({ id: null, label: '' }); onAdded(); }
    return result;
  }, {});
  useActionToast(state, { success: 'مورد ثبت شد.' });

  if (!open) {
    return (
      <Button size="sm" variant="outline" className="justify-self-start" onClick={() => setOpen(true)}>
        <Plus className="size-4" />{t('افزودنِ مورد')}
      </Button>
    );
  }

  const stamp = (ref: React.RefObject<HTMLInputElement | null>) => {
    const now = currentTime?.();
    if (now !== null && now !== undefined && ref.current) ref.current.value = formatTimestamp(now);
  };

  return (
    <form key={round} action={action} className="grid gap-3 rounded-lg border border-dashed p-3">
      <input type="hidden" name="reviewId" value={reviewId} />
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-end gap-3">
        <Field>
          <FieldLabel htmlFor="ri-start">{t('زمان')}</FieldLabel>
          <div className="flex items-center gap-1" dir="ltr">
            <Input ref={startRef} id="ri-start" name="start" placeholder="1:23" className="num w-16" autoFocus={round > 0} />
            <span className="text-muted-foreground">–</span>
            <Input ref={endRef} name="end" placeholder="1:40" className="num w-16" aria-label={t('پایان')} />
          </div>
        </Field>
        <Field>
          <FieldLabel htmlFor="ri-area">{t('بخش')}</FieldLabel>
          <Input id="ri-area" name="area" list={`ri-areas-${reviewId}`} defaultValue={area} maxLength={120}
            placeholder={t('مثلاً هدر')} />
          <datalist id={`ri-areas-${reviewId}`}>
            {areas.map((a) => <option key={a} value={a} />)}
          </datalist>
        </Field>
      </div>
      {currentTime && (
        <div className="flex gap-2 text-xs">
          <Button type="button" size="xs" variant="ghost" onClick={() => stamp(startRef)}><Timer className="size-3.5" />{t('شروع = لحظهٔ فعلی')}</Button>
          <Button type="button" size="xs" variant="ghost" onClick={() => stamp(endRef)}><Timer className="size-3.5" />{t('پایان = لحظهٔ فعلی')}</Button>
        </div>
      )}
      <Field>
        <FieldLabel htmlFor="ri-title">{t('عنوانِ مورد')}</FieldLabel>
        <Input id="ri-title" name="title" required maxLength={200} placeholder={t('مثلاً فاصلهٔ منوی موبایل کم است')} />
      </Field>
      <MediaPicker>
        <Textarea name="description" rows={2} placeholder={t('توضیح (اختیاری) — اسکرین‌شات را هم می‌شود چسباند.')} />
      </MediaPicker>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="ri-priority">{t('اولویت…')}</FieldLabel>
          <NativeSelect id="ri-priority" name="priorityTagId" containerClassName="w-full" defaultValue="">
            <NativeSelectOption value="">—</NativeSelectOption>
            {options.priorities.map((p) => <NativeSelectOption key={p.id} value={p.id}>{p.name}</NativeSelectOption>)}
          </NativeSelect>
        </Field>
        {options.assignees.length > 0 && (
          <Field>
            <FieldLabel htmlFor="ri-assignee">{t('تخصیص به…')}</FieldLabel>
            <Combobox
              id="ri-assignee"
              name="assignedTo"
              options={options.assignees.map((a) => ({ value: a.userId, label: a.label }))}
              value={assignee}
              onChange={setAssignee}
              placeholder={t('نامِ عضو را تایپ کنید…')}
            />
          </Field>
        )}
        {assignee.id === null && options.roles.length > 0 && (
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor="ri-roles">{t('تخصیص به نقش')}</FieldLabel>
            <MultiSelect
              id="ri-roles"
              name="roleTagIds"
              options={options.roles.map((r) => ({ value: r.id, label: r.name }))}
              selected={roles}
              onChange={setRoles}
              placeholder={reviewRoles.length > 0
                ? t('نقش‌های بازبینی: {roles}', { roles: reviewRoles.map((r) => r.name).join(t('، ')) })
                : t('نقش‌ها…')}
            />
          </Field>
        )}
      </div>
      {/* پنهان‌کردنِ تک‌مورد فقط وقتی معنا دارد که خودِ بازبینی برای کارفرما آشکار است. */}
      {clientVisible && (
        <label className="flex items-center gap-2 text-sm">
          <Checkbox name="clientHidden" value="1" />
          {t('این مورد پنهان از کارفرما')}
        </label>
      )}
      {state.error && <p className="text-xs text-destructive">{t(state.error)}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>{t('بستن')}</Button>
        <AddButton />
      </div>
    </form>
  );
}
