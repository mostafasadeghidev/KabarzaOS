'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle, Archive, ArchiveRestore, BookOpen, Check, Copy, FolderKanban, GitBranch, GitFork, GitPullRequestArrow,
  History, Info, Link2, MoreHorizontal, Package, Pencil, Plus, RotateCcw, Trash2, Undo2, X, Zap,
} from 'lucide-react';
import { PageHeader, Panel } from '@/components/page-shell';
import { dropPrevious } from '@/components/nav-history';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { NativeSelectOption } from '@/components/ui/native-select';
import { Spinner } from '@/components/ui/spinner';
import { useConfirm } from '@/components/ui/confirm';
import { useToast } from '@/components/ui/toast';
import { useT, useTimeZone } from '@/i18n/client';
import { formatDate, formatDateTime } from '@/i18n/datetime';
import { Badge } from '@/components/ui/badge';
import { UserAvatar } from '@/components/user-avatar';
import { KIND_LABELS, SUGGESTION_PART_LABELS, SUGGESTION_STATUS_LABELS } from '@/domain/library/model';
import type {
  EntryDetail, EntryLink, InstallView, ProjectOption, Snapshot, SuggestionDiff, SuggestionView,
} from '@/server/library/service';
import {
  deleteEntryAction, deleteMediaAction, forkAction, installAction, removeInstallAction, restoreRevisionAction,
  reviewSuggestionAction, revisionAction, setArchivedAction, suggestionDiffAction, updateInstallAction,
  withdrawSuggestionAction,
} from '../_form/actions';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SuggestionDiffView } from '../suggestion-diff';
import { EntryContent } from '../entry-content';
import { QuickCard } from '../quick-card';
import {
  CategoryBadge, FreshBadge, KindBadge, KindIcon, PlatformBadge, StatusBadge, textDir, TopicChips, VersionLabel,
} from '../entry-bits';

/** نمای انتخاب‌شده (آموزشِ کامل / کارتِ سریع) در همین مرورگر می‌ماند. */
const VIEW_KEY = 'kz.libraryView';

function useEntryMode(): ['guide' | 'quick', (mode: 'guide' | 'quick') => void] {
  const [mode, setMode] = useState<'guide' | 'quick'>('guide');
  useEffect(() => {
    try {
      if (window.localStorage.getItem(VIEW_KEY) === 'quick') setMode('quick');
    } catch {
      // مرورگرِ بی‌ذخیره — همان آموزشِ کامل.
    }
  }, []);
  return [mode, (next) => {
    setMode(next);
    try { window.localStorage.setItem(VIEW_KEY, next); } catch { /* بی‌ذخیره */ }
  }];
}

export function EntryView({
  entry,
  projects,
  justSaved,
  justSuggested = false,
  openSuggestion = null,
}: {
  entry: EntryDetail;
  projects: ProjectOption[];
  justSaved: boolean;
  /** پس از «فرستادنِ پیشنهاد». */
  justSuggested?: boolean;
  /** از اعلان آمده — همان پیشنهاد باز می‌شود. */
  openSuggestion?: number | null;
}) {
  const tr = useT();
  const tz = useTimeZone();
  const router = useRouter();
  const { show } = useToast();
  const confirm = useConfirm();
  const [pending, startTransition] = useTransition();

  // ⚠️ ref: در حالتِ توسعه اثر دو بار اجرا می‌شود و پیام دو بار می‌آمد.
  const announced = useRef(false);
  useEffect(() => {
    if (!justSaved || announced.current) return;
    announced.current = true;
    show(tr('ذخیره شد.'));
    // فرمِ پشتِ سر جای «برگشت» نیست. ⚠️ پس از اثرِ چیدمان (والد دیرتر از فرزند
    // اجرا می‌شود و صفحهٔ فعلی را تازه روی پشته می‌گذارد).
    setTimeout(() => dropPrevious((path) => path === '/library/new' || /^\/library\/\d+\/edit$/.test(path)), 0);
    router.replace(`/library/${entry.id}`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [justSaved]);

  useEffect(() => {
    if (!justSuggested || announced.current) return;
    announced.current = true;
    show(tr('پیشنهاد برای نویسنده فرستاده شد.'));
    setTimeout(() => dropPrevious((path) => /^\/library\/\d+\/suggest$/.test(path)), 0);
    router.replace(`/library/${entry.id}`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [justSuggested]);

  const pendingSuggestions = entry.suggestions.filter((s) => s.status === 'pending');
  const myPending = pendingSuggestions.some((s) => s.canWithdraw);
  const [mode, setMode] = useEntryMode();
  // کارتِ سریع فقط وقتی معنا دارد که چیزی برای کپی هست.
  const hasQuick = entry.blocks.length > 0 || entry.options.length > 0;

  const archive = (archived: boolean) => startTransition(async () => {
    const r = await setArchivedAction(entry.id, archived);
    show(tr(r.error ?? r.message ?? 'انجام شد.'), r.error ? 'error' : 'success');
  });

  const remove = async () => {
    const ok = await confirm({
      title: tr('این مورد حذف شود؟'),
      description: tr('کد، تنظیمات، تصویرها و تاریخچه‌اش برای همیشه پاک می‌شوند.'),
      destructive: true,
      confirmLabel: tr('حذف'),
    });
    if (!ok) return;
    startTransition(async () => {
      const r = await deleteEntryAction(entry.id);
      if (r?.error) show(tr(r.error), 'error');
    });
  };

  return (
    <div className="grid gap-6">
      <PageHeader
        back={{ href: '/library', label: tr('کتابخانهٔ کد') }}
        title={entry.versionLabel ? <span className="inline-flex flex-wrap items-center gap-2">{entry.title}<VersionLabel label={entry.versionLabel} className="text-xs" /></span> : entry.title}
        media={<KindIcon kind={entry.kind} className="size-11" />}
        description={entry.summary ? <p dir={textDir(entry.summary)}>{entry.summary}</p> : undefined}
        actions={entry.canSuggest ? (
          entry.archived ? undefined : (
            <Button asChild variant={myPending ? 'outline' : 'default'}>
              <Link href={`/library/${entry.id}/suggest`}>
                <GitPullRequestArrow />
                {myPending ? tr('ویرایشِ پیشنهادِ من') : tr('پیشنهادِ ویرایش')}
              </Link>
            </Button>
          )
        ) : entry.canEdit ? (
          <>
            <Button asChild>
              <Link href={`/library/${entry.id}/edit`}><Pencil />{tr('ویرایش')}</Link>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <IconButton variant="outline" label={tr('بیشتر')} disabled={pending}>
                  {pending ? <Spinner /> : <MoreHorizontal />}
                </IconButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {entry.archived ? (
                  <DropdownMenuItem onSelect={() => archive(false)}><ArchiveRestore />{tr('درآوردن از بایگانی')}</DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onSelect={() => archive(true)}><Archive />{tr('بایگانی')}</DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  disabled={!entry.canDelete}
                  onSelect={remove}
                >
                  <Trash2 />
                  {entry.canDelete ? tr('حذف') : tr('حذف (اول از پروژه‌ها بردارید)')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        ) : undefined}
      >
        <KindBadge kind={entry.kind} />
        <CategoryBadge category={entry.category} />
        <StatusBadge status={entry.status} />
        <PlatformBadge platform={entry.platform} />
        <FreshBadge createdAt={entry.createdAt} updatedAt={entry.updatedAt} changeNote={entry.changeNote} />
        {entry.clientVisible && <span className="text-xs text-emerald-700 dark:text-emerald-300">{tr('کارفرمای پروژه‌ها می‌بیند')}</span>}
        <TopicChips topics={entry.topics} />
      </PageHeader>

      {entry.canEdit && pendingSuggestions.length > 0 && (
        <Alert>
          <GitPullRequestArrow />
          <AlertDescription>
            {pendingSuggestions.length === 1
              ? tr('یک پیشنهادِ ویرایش منتظرِ بررسیِ شماست — در بخشِ «پیشنهادها» بازش کنید.')
              : tr('{n} پیشنهادِ ویرایش منتظرِ بررسیِ شماست — در بخشِ «پیشنهادها» بازشان کنید.', { n: pendingSuggestions.length })}
          </AlertDescription>
        </Alert>
      )}
      {entry.archived && (
        <Alert>
          <Archive />
          <AlertDescription>{tr('این مورد بایگانی شده است: در فهرست و انتخابگرها نمی‌آید و روی پروژهٔ تازه نصب نمی‌شود.')}</AlertDescription>
        </Alert>
      )}
      {entry.supersededBy ? (
        <Alert variant="warning">
          <GitBranch />
          <AlertDescription>
            {tr('نسخهٔ تازه‌تری جای این را گرفته است:')}{' '}
            <Link href={`/library/${entry.supersededBy.id}`} className="font-medium text-primary hover:underline" dir="auto">
              {entry.supersededBy.title}{entry.supersededBy.versionLabel ? ` · ${entry.supersededBy.versionLabel}` : ''}
            </Link>
          </AlertDescription>
        </Alert>
      ) : entry.status === 'deprecated' && (
        <Alert variant="warning">
          <Info />
          <AlertDescription>{tr('منسوخ: برای پروژهٔ تازه از این استفاده نکنید.')}{entry.forks.length > 0 && ` ${tr('نسخه‌های تازه‌تر پایینِ صفحه‌اند.')}`}</AlertDescription>
        </Alert>
      )}
      {entry.changeNote && entry.updatedAt.getTime() - entry.createdAt.getTime() > 3_600_000 && (
        <p className="-mt-2 text-xs text-muted-foreground" dir="auto">
          <span className="font-medium">{tr('آخرین تغییر:')}</span> {entry.changeNote}
        </p>
      )}

      <div className="grid items-start gap-6 @5xl/main:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="grid min-w-0 gap-4">
          {hasQuick && (
            <Tabs value={mode} onValueChange={(v) => setMode(v as 'guide' | 'quick')}>
              <TabsList>
                <TabsTrigger value="guide" className="px-3"><BookOpen />{tr('آموزشِ کامل')}</TabsTrigger>
                <TabsTrigger value="quick" className="px-3"><Zap />{tr('کارتِ سریع')}</TabsTrigger>
              </TabsList>
            </Tabs>
          )}
          {hasQuick && mode === 'quick' ? <QuickCard entry={entry} /> : (
            <EntryContent
              content={entry}
              onRemoveMedia={async (m) => deleteMediaAction(entry.id, m.id)}
            />
          )}
        </div>

        <aside className="grid gap-4">
          <InstallsPanel entry={entry} projects={projects} />

          <Panel title={tr('دربارهٔ این مورد')} icon={<Info />}>
            <dl className="grid gap-2 text-sm">
              <Row label={tr('نوع')}>{tr(KIND_LABELS[entry.kind])}</Row>
              <Row label={tr('نویسنده')}>{entry.authorName ?? '—'}</Row>
              <Row label={tr('ساخته شد')}><span className="num">{formatDate(entry.createdAt, tz)}</span></Row>
              <Row label={tr('آخرین ویرایش')}>
                <span className="num">{formatDate(entry.updatedAt, tz)}</span>
                {entry.updatedByName && <span className="text-muted-foreground"> · {entry.updatedByName}</span>}
              </Row>
              {entry.origin && (
                <Row label={tr('اول برای پروژهٔ')}>
                  <Link href={`/projects/${entry.origin.id}`} className="text-primary hover:underline">{entry.origin.title}</Link>
                </Row>
              )}
              {entry.forkedFrom && (
                <Row label={tr('نسخه‌ای از')}>
                  <Link href={`/library/${entry.forkedFrom.id}`} className="text-primary hover:underline">{entry.forkedFrom.title}</Link>
                </Row>
              )}
            </dl>
            {entry.forks.length > 0 && (
              <div className="grid gap-1.5 border-t pt-3">
                <h4 className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                  <GitFork className="size-3.5" aria-hidden />{tr('نسخه‌های جدا برای پروژه‌ها')}
                </h4>
                {entry.forks.map((f) => (
                  <Link key={f.id} href={`/library/${f.id}`} className="text-sm text-primary hover:underline">{f.title}</Link>
                ))}
              </div>
            )}
          </Panel>

          {(entry.olderVersionList.length > 0 || entry.supersededBy) && (
            <Panel title={tr('نسخه‌ها')} icon={<GitBranch />}>
              <ul className="grid gap-1.5">
                {entry.supersededBy && (
                  <LinkRow link={entry.supersededBy} hint={tr('تازه‌تر')} />
                )}
                <li className="flex items-center gap-2 rounded-md bg-muted/60 p-1.5 text-sm font-medium">
                  <KindIcon kind={entry.kind} className="size-7" />
                  <span className="min-w-0 truncate" dir="auto">{entry.title}</span>
                  <VersionLabel label={entry.versionLabel} />
                  <span className="ms-auto text-[11px] text-muted-foreground">{tr('همین')}</span>
                </li>
                {entry.olderVersionList.map((v) => <LinkRow key={v.id} link={v} hint={tr('قدیمی‌تر')} />)}
              </ul>
            </Panel>
          )}

          {entry.related.length > 0 && (
            <Panel title={tr('با این کار می‌کند')} icon={<Link2 />}>
              <ul className="grid gap-2">
                {entry.related.map((r) => (
                  <li key={r.id} className="grid gap-1">
                    <Link href={`/library/${r.id}`} className="flex items-center gap-2 rounded-md p-1 -m-1 hover:bg-muted">
                      <KindIcon kind={r.kind} className="size-7" />
                      <span className="grid min-w-0">
                        <span className="truncate text-sm font-medium" dir="auto">{r.title}</span>
                        <span className="text-xs text-muted-foreground">{tr(KIND_LABELS[r.kind])}</span>
                      </span>
                    </Link>
                    {r.note && <p className="ps-9 text-xs leading-5 text-muted-foreground" dir="auto">{r.note}</p>}
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          {entry.requiredBy.length > 0 && (
            <Panel title={tr('این را لازم دارند')} icon={<Package />} description={tr('ویرایشِ این مورد به این‌ها هم می‌رسد.')}>
              <ul className="grid gap-1.5">
                {entry.requiredBy.map((r) => <LinkRow key={r.id} link={r} />)}
              </ul>
            </Panel>
          )}

          {entry.suggestions.length > 0 && <SuggestionsPanel entry={entry} openId={openSuggestion} />}
          {entry.revisions.length > 0 && <HistoryPanel entry={entry} />}
        </aside>
      </div>
    </div>
  );
}

function LinkRow({ link, hint }: { link: EntryLink; hint?: string }) {
  return (
    <li>
      <Link href={`/library/${link.id}`} className="flex items-center gap-2 rounded-md p-1.5 text-sm hover:bg-muted">
        <KindIcon kind={link.kind} className="size-7" />
        <span className="min-w-0 truncate" dir="auto">{link.title}</span>
        <VersionLabel label={link.versionLabel} />
        {hint && <span className="ms-auto shrink-0 text-[11px] text-muted-foreground">{hint}</span>}
      </Link>
    </li>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-end">{children}</dd>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * نصب روی پروژه‌ها
 * ------------------------------------------------------------------ */

function InstallsPanel({ entry, projects }: { entry: EntryDetail; projects: ProjectOption[] }) {
  const tr = useT();
  const tz = useTimeZone();
  const { show } = useToast();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<InstallView | 'new' | null>(null);
  const [pending, startTransition] = useTransition();
  const installedIds = new Set(entry.installList.map((i) => i.projectId));
  const free = projects.filter((p) => !installedIds.has(p.id));

  const remove = async (i: InstallView) => {
    if (!await confirm({ title: tr('از «{p}» برداشته شود؟', { p: i.projectTitle }), confirmLabel: tr('برداشتن') })) return;
    startTransition(async () => {
      const r = await removeInstallAction(entry.id, i.projectId, i.id);
      show(tr(r.error ?? r.message ?? 'انجام شد.'), r.error ? 'error' : 'success');
    });
  };

  const fork = async (i: InstallView) => {
    const ok = await confirm({
      title: tr('نسخهٔ جدا برای «{p}»؟', { p: i.projectTitle }),
      description: tr('یک کپی از همین مورد ساخته و به‌جای این روی همان پروژه ثبت می‌شود؛ تغییرهایش به بقیهٔ پروژه‌ها نمی‌رسد.'),
      confirmLabel: tr('ساختِ نسخه'),
    });
    if (!ok) return;
    startTransition(async () => {
      const r = await forkAction(entry.id, i.projectId);
      if (r?.error) show(tr(r.error), 'error');
    });
  };

  const total = entry.installList.length + entry.hiddenInstalls;

  return (
    <Panel
      title={tr('نصب روی پروژه‌ها')}
      icon={<FolderKanban />}
      description={total === 0
        ? tr('هنوز روی پروژه‌ای ثبت نشده.')
        : total === 1 ? tr('فقط روی یک پروژه — اختصاصی.') : tr('روی {n} پروژه — مشترک.', { n: total })}
      actions={!entry.archived && free.length > 0 ? (
        <Button size="sm" variant="outline" onClick={() => setEditing('new')}><Plus />{tr('پروژهٔ دیگر')}</Button>
      ) : undefined}
    >
      {entry.installList.length > 0 && (
        <ul className="grid gap-2">
          {entry.installList.map((i) => (
            <li key={i.id} className="grid gap-1 rounded-lg bg-muted/60 p-2.5">
              <div className="flex items-start justify-between gap-2">
                <Link href={`/projects/${i.projectId}?tab=library`} className="min-w-0 font-medium text-primary hover:underline">
                  {i.projectTitle}
                  {i.projectCode && <span className="ms-1 font-mono text-xs text-muted-foreground" dir="ltr">{i.projectCode}</span>}
                </Link>
                {i.canChange && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <IconButton variant="ghost" className="-my-1 size-7" label={tr('بیشتر')} disabled={pending}>
                        <MoreHorizontal className="size-3.5" />
                      </IconButton>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => setEditing(i)}><Pencil />{tr('یادداشت و مقدارها')}</DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => fork(i)}><Copy />{tr('نسخهٔ جدا برای این پروژه')}</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" onSelect={() => remove(i)}><Trash2 />{tr('برداشتن از پروژه')}</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
              {i.note && <p className="text-[13px]" dir="auto">{i.note}</p>}
              {i.valuesNote && <p className="whitespace-pre-wrap text-xs text-muted-foreground" dir="auto">{i.valuesNote}</p>}
              <p className="text-[11px] text-muted-foreground">
                {i.installedByName ?? '—'} · <span className="num">{formatDate(i.createdAt, tz)}</span>
              </p>
            </li>
          ))}
        </ul>
      )}
      {entry.hiddenInstalls > 0 && (
        <p className="text-xs text-muted-foreground">{tr('و {n} پروژهٔ دیگر که به آن دسترسی ندارید.', { n: entry.hiddenInstalls })}</p>
      )}
      {editing && (
        <InstallDialog
          entryId={entry.id}
          install={editing === 'new' ? null : editing}
          projects={free}
          onClose={() => setEditing(null)}
        />
      )}
    </Panel>
  );
}

export function InstallDialog({
  entryId,
  install,
  projects,
  fixedProjectId,
  onClose,
}: {
  entryId: number;
  install: InstallView | null;
  projects: ProjectOption[];
  /** تبِ پروژه — پروژه معلوم است و انتخابگر نمی‌آید. */
  fixedProjectId?: number;
  onClose: () => void;
}) {
  const tr = useT();
  const { show } = useToast();
  const [projectId, setProjectId] = useState(install ? String(install.projectId) : fixedProjectId ? String(fixedProjectId) : '');
  const [note, setNote] = useState(install?.note ?? '');
  const [values, setValues] = useState(install?.valuesNote ?? '');
  const [pending, startTransition] = useTransition();

  const save = () => startTransition(async () => {
    const pid = Number(projectId);
    if (!pid) { show(tr('یک پروژه انتخاب کنید.'), 'error'); return; }
    const r = install
      ? await updateInstallAction(entryId, pid, install.id, note, values)
      : await installAction(entryId, pid, note, values);
    show(tr(r.error ?? r.message ?? 'انجام شد.'), r.error ? 'error' : 'success');
    if (!r.error) onClose();
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{install ? tr('نصب روی «{p}»', { p: install.projectTitle }) : tr('ثبتِ نصب روی پروژه')}</DialogTitle>
          <DialogDescription>{tr('بنویسید کجای سایت نصب شده و چه مقدارهایی با پیش‌فرض فرق دارد — نفرِ بعدی دقیقاً همین را لازم دارد.')}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          {!install && !fixedProjectId && (
            <div className="grid gap-1.5">
              <Label>{tr('پروژه')}</Label>
              <SearchableSelect value={projectId} onValueChange={setProjectId} containerClassName="w-full">
                <NativeSelectOption value="">{tr('— انتخابِ پروژه —')}</NativeSelectOption>
                {projects.map((p) => (
                  <NativeSelectOption key={p.id} value={String(p.id)}>{p.code ? `${p.title} · ${p.code}` : p.title}</NativeSelectOption>
                ))}
              </SearchableSelect>
            </div>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor="install-note">{tr('کجای سایت')}</Label>
            <Textarea id="install-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder={tr('مثلاً: صفحهٔ قیمت‌ها، داخلِ فرمِ سفارش')} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="install-values">{tr('مقدارهای این پروژه (اختیاری)')}</Label>
            <Textarea id="install-values" rows={3} dir="auto" value={values} onChange={(e) => setValues(e.target.value)} placeholder="data-flow-price = 150" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{tr('انصراف')}</Button>
          <Button onClick={save} disabled={pending}>{pending && <Spinner />}{tr('ذخیره')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ *
 * تاریخچه
 * ------------------------------------------------------------------ */

function HistoryPanel({ entry }: { entry: EntryDetail }) {
  const tr = useT();
  const tz = useTimeZone();
  const { show } = useToast();
  const confirm = useConfirm();
  const [viewing, setViewing] = useState<{ id: number; when: Date; snapshot: Snapshot } | null>(null);
  const [pending, startTransition] = useTransition();

  const open = (id: number, when: Date) => startTransition(async () => {
    const r = await revisionAction(entry.id, id);
    if (r.snapshot) setViewing({ id, when, snapshot: r.snapshot });
    else show(tr(r.error ?? 'پیدا نشد.'), 'error');
  });

  const restore = async (id: number) => {
    const ok = await confirm({
      title: tr('این نسخه بازگردانده شود؟'),
      description: tr('نسخهٔ فعلی هم در تاریخچه می‌ماند و می‌شود دوباره به آن برگشت.'),
      confirmLabel: tr('بازگرداندن'),
    });
    if (!ok) return;
    startTransition(async () => {
      const r = await restoreRevisionAction(entry.id, id);
      show(tr(r.error ?? r.message ?? 'انجام شد.'), r.error ? 'error' : 'success');
      if (!r.error) setViewing(null);
    });
  };

  return (
    <Panel title={tr('تاریخچه')} icon={<History />} description={tr('نسخهٔ پیش از هر ویرایش نگه داشته می‌شود.')}>
      <ul className="grid gap-1">
        {entry.revisions.map((r) => (
          <li key={r.id}>
            <button
              type="button"
              disabled={pending}
              onClick={() => open(r.id, r.createdAt)}
              className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-start text-sm hover:bg-muted"
            >
              <span className="num">{formatDateTime(r.createdAt, tz)}</span>
              <span className="truncate text-xs text-muted-foreground">{r.authorName ?? '—'}</span>
            </button>
          </li>
        ))}
      </ul>
      {viewing && (
        <Dialog open onOpenChange={(o) => !o && setViewing(null)}>
          <DialogContent className="sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle>{tr('نسخهٔ پیش از ویرایشِ {d}', { d: formatDateTime(viewing.when, tz) })}</DialogTitle>
              <DialogDescription>
                {viewing.snapshot.entry.title}
                {viewing.snapshot.entry.changeNote && <span className="block text-xs">{viewing.snapshot.entry.changeNote}</span>}
              </DialogDescription>
            </DialogHeader>
            <div className="grid max-h-[60vh] gap-3 overflow-y-auto">
              {viewing.snapshot.entry.summary && <p className="text-sm text-muted-foreground" dir={textDir(viewing.snapshot.entry.summary)}>{viewing.snapshot.entry.summary}</p>}
              {/* همان چیدمانِ صفحه — نسخهٔ قدیمیِ راهنما هم گام‌ها و گزینه‌هایش را نشان می‌دهد، نه فقط کد.
                  ⚠️ تصویرها از نسخهٔ فعلی: تصویری که از آن روز هنوز هست، سرِ جایش دیده می‌شود. */}
              <EntryContent
                content={{
                  ...viewing.snapshot.entry,
                  steps: viewing.snapshot.steps,
                  blocks: viewing.snapshot.blocks,
                  options: viewing.snapshot.options,
                  media: entry.media,
                }}
              />
            </div>
            {entry.canEdit && (
              <DialogFooter>
                <Button variant="outline" onClick={() => setViewing(null)}>{tr('بستن')}</Button>
                <Button onClick={() => restore(viewing.id)} disabled={pending}>
                  {pending ? <Spinner /> : <RotateCcw />}
                  {tr('بازگرداندنِ این نسخه')}
                </Button>
              </DialogFooter>
            )}
          </DialogContent>
        </Dialog>
      )}
    </Panel>
  );
}

/* ------------------------------------------------------------------ *
 * پیشنهادهای ویرایش (۲.۴۶.۰)
 * ------------------------------------------------------------------ */

const SUGGESTION_TONE: Record<SuggestionView['status'], 'warning' | 'success' | 'destructive' | 'secondary'> = {
  pending: 'warning',
  accepted: 'success',
  rejected: 'destructive',
  withdrawn: 'secondary',
};

function SuggestionsPanel({ entry, openId }: { entry: EntryDetail; openId: number | null }) {
  const tr = useT();
  const tz = useTimeZone();
  const { show } = useToast();
  const [viewing, setViewing] = useState<SuggestionDiff | null>(null);
  const [pending, startTransition] = useTransition();

  const open = (id: number) => startTransition(async () => {
    const r = await suggestionDiffAction(id);
    if (r.diff) setViewing(r.diff);
    else show(tr(r.error ?? 'پیدا نشد.'), 'error');
  });

  // از اعلان آمده — همان یکی را باز کن. ⚠️ ref: اثرِ دوباره در حالتِ توسعه.
  const opened = useRef(false);
  useEffect(() => {
    if (!openId || opened.current) return;
    opened.current = true;
    if (entry.suggestions.some((s) => s.id === openId)) open(openId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId]);

  return (
    <Panel
      title={tr('پیشنهادها')}
      icon={<GitPullRequestArrow />}
      description={tr('تغییرهایی که همکاران برای این مورد فرستاده‌اند.')}
    >
      <ul className="grid gap-1">
        {entry.suggestions.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              disabled={pending}
              onClick={() => open(s.id)}
              className="grid w-full gap-1 rounded-md px-2 py-1.5 text-start hover:bg-muted"
            >
              <span className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5 text-sm">
                  {s.authorId && <UserAvatar userId={s.authorId} name={s.authorName ?? ''} size="xs" presence={false} />}
                  <span className="truncate font-medium">{s.authorName ?? tr('نامشخص')}</span>
                </span>
                <Badge variant={SUGGESTION_TONE[s.status]} className="shrink-0">{tr(SUGGESTION_STATUS_LABELS[s.status])}</Badge>
              </span>
              {s.note && <span className="line-clamp-2 text-xs text-muted-foreground" dir="auto">{s.note}</span>}
              <span className="flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
                <span className="num">{formatDate(s.updatedAt, tz)}</span>
                {s.parts.length > 0 && <span>· {s.parts.map((p) => tr(SUGGESTION_PART_LABELS[p])).join('، ')}</span>}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {viewing && <SuggestionDialog entryId={entry.id} diff={viewing} onClose={() => setViewing(null)} />}
    </Panel>
  );
}

function SuggestionDialog({ entryId, diff, onClose }: { entryId: number; diff: SuggestionDiff; onClose: () => void }) {
  const tr = useT();
  const tz = useTimeZone();
  const { show } = useToast();
  const confirm = useConfirm();
  const [reply, setReply] = useState('');
  const [pending, startTransition] = useTransition();
  const s = diff.suggestion;

  const decide = (decision: 'accept' | 'reject') => startTransition(async () => {
    const r = await reviewSuggestionAction(s.id, decision, reply);
    show(tr(r.error ?? r.message ?? 'انجام شد.'), r.error ? 'error' : 'success');
    if (!r.error) onClose();
  });

  const accept = async () => {
    const ok = await confirm({
      title: tr('این پیشنهاد اعمال شود؟'),
      description: tr('نسخهٔ فعلی در تاریخچه می‌ماند و می‌شود به آن برگشت. تغییر به همهٔ پروژه‌هایی که این مورد رویشان نصب است می‌رسد.'),
      confirmLabel: tr('پذیرفتن و اعمال'),
    });
    if (ok) decide('accept');
  };

  const withdraw = () => startTransition(async () => {
    const r = await withdrawSuggestionAction(s.id);
    show(tr(r.error ?? r.message ?? 'انجام شد.'), r.error ? 'error' : 'success');
    if (!r.error) onClose();
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            {tr('پیشنهادِ {name}', { name: s.authorName ?? tr('نامشخص') })}
            <Badge variant={SUGGESTION_TONE[s.status]}>{tr(SUGGESTION_STATUS_LABELS[s.status])}</Badge>
          </DialogTitle>
          <DialogDescription className="num">{formatDateTime(s.updatedAt, tz)}</DialogDescription>
        </DialogHeader>
        <div className="grid max-h-[62vh] gap-4 overflow-y-auto">
          {s.note && <p className="whitespace-pre-wrap rounded-lg bg-muted/60 p-3 text-sm" dir="auto">{s.note}</p>}
          {s.stale && (
            <Alert variant="warning">
              <AlertTriangle />
              <AlertDescription>
                {tr('این مورد بعد از فرستادنِ پیشنهاد ویرایش شده است. تفاوتِ زیر با نسخهٔ فعلی است؛ اگر تغییری از قلم افتاده، با پذیرفتن برمی‌گردد.')}
              </AlertDescription>
            </Alert>
          )}
          {s.status === 'pending' ? (
            <SuggestionDiffView before={diff.before} after={diff.after} />
          ) : (
            <p className="text-sm text-muted-foreground">
              {s.reviewedByName
                ? tr('{status} · {name} · {date}', {
                  status: tr(SUGGESTION_STATUS_LABELS[s.status]),
                  name: s.reviewedByName,
                  date: s.reviewedAt ? formatDateTime(s.reviewedAt, tz) : '',
                })
                : tr(SUGGESTION_STATUS_LABELS[s.status])}
            </p>
          )}
          {s.reviewNote && (
            <p className="whitespace-pre-wrap border-s-2 ps-3 text-sm" dir="auto">{s.reviewNote}</p>
          )}
          {s.canReview && (
            <div className="grid gap-1.5">
              <Label htmlFor="suggestion-reply">{tr('پیام به پیشنهاددهنده (اختیاری)')}</Label>
              <Textarea
                id="suggestion-reply"
                rows={2}
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                dir="auto"
                placeholder={tr('مثلاً: ممنون! / این حالت روی Safari جواب نمی‌دهد چون…')}
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{tr('بستن')}</Button>
          {s.canWithdraw && (
            <>
              <Button variant="outline" onClick={withdraw} disabled={pending}><Undo2 />{tr('پس گرفتن')}</Button>
              <Button asChild variant="outline">
                <Link href={`/library/${entryId}/suggest`}><Pencil />{tr('ویرایشِ پیشنهاد')}</Link>
              </Button>
            </>
          )}
          {s.canReview && (
            <>
              <Button variant="outline" onClick={() => decide('reject')} disabled={pending}><X />{tr('رد')}</Button>
              <Button onClick={accept} disabled={pending}>{pending ? <Spinner /> : <Check />}{tr('پذیرفتن و اعمال')}</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
