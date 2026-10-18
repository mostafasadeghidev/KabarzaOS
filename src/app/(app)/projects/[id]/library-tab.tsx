'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { BookOpenText, ChevronDown, Copy, Library, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { SectionHeader } from '@/components/page-shell';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { EmptyState } from '@/components/ui/empty-state';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { NativeSelectOption } from '@/components/ui/native-select';
import { Spinner } from '@/components/ui/spinner';
import { useConfirm } from '@/components/ui/confirm';
import { useToast } from '@/components/ui/toast';
import { useT, useTimeZone } from '@/i18n/client';
import { formatDate } from '@/i18n/datetime';
import { KIND_LABELS, LANGUAGE_LABELS, LIBRARY_KINDS } from '@/domain/library/model';
import type { ClientGuide, EntryLink, ProjectLibraryItem } from '@/server/library/service';
import { forkAction, installAction, removeInstallAction, updateInstallAction } from '../../library/_form/actions';
import { KindIcon, StatusBadge } from '../../library/entry-bits';
import { EntryContent } from '../../library/entry-content';

export interface ProjectLibraryData {
  items: ProjectLibraryItem[];
  /** بیننده روی پروژه کار می‌کند و پروژه منجمد نیست. */
  canAdd: boolean;
  /** انتخابگرِ «افزودن از کتابخانه». */
  entries: EntryLink[];
}

/**
 * تبِ «کد و راهنما» ی پروژه (۲.۳۷.۰) — کدهای سفارشی‌ای که روی سایتِ همین
 * پروژه نصب است، هر کدام با جای نصب و مقدارهای همین پروژه.
 *
 * ⚠️ دو نما: تیم فهرستِ نصب‌ها را با پیوند به کتابخانه می‌بیند؛ کارفرما فقط
 * راهنماهای «کارفرما ببیند» را، کامل و همین‌جا (او صفحهٔ کتابخانه را ندارد).
 */
export function LibraryTab({
  projectId,
  data,
  clientGuides,
}: {
  projectId: number;
  data: ProjectLibraryData | null;
  clientGuides: ClientGuide[] | null;
}) {
  if (data) return <TeamView projectId={projectId} data={data} />;
  return <ClientView guides={clientGuides ?? []} />;
}

function TeamView({ projectId, data }: { projectId: number; data: ProjectLibraryData }) {
  const tr = useT();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<ProjectLibraryItem | null>(null);
  const installed = new Set(data.items.map((i) => i.id));
  const available = data.entries.filter((e) => !installed.has(e.id));

  const actions = data.canAdd ? (
    <>
      {available.length > 0 && (
        <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
          <Library />
          {tr('افزودن از کتابخانه')}
        </Button>
      )}
      <Button asChild size="sm">
        <Link href={`/library/new?project=${projectId}`}><Plus />{tr('ثبتِ کدِ تازه')}</Link>
      </Button>
    </>
  ) : undefined;

  return (
    <div className="grid gap-4">
      <SectionHeader
        title={tr('کد و راهنمای این پروژه')}
        description={tr('کدهای سفارشی‌ای که روی سایتِ این پروژه نصب است — تا نفرِ بعدی بداند چه چیزی کجاست.')}
        actions={data.items.length > 0 ? actions : undefined}
      />

      {data.items.length === 0 ? (
        <EmptyState
          icon={<Library />}
          title={tr('هنوز کدی برای این پروژه ثبت نشده')}
          description={tr('هر کدِ اختصاصی که برای این سایت می‌نویسید اینجا ثبت کنید؛ اگر در کتابخانه از قبل هست، فقط به این پروژه وصلش کنید.')}
        >
          {actions && <div className="flex flex-wrap justify-center gap-2">{actions}</div>}
        </EmptyState>
      ) : (
        LIBRARY_KINDS.filter((k) => data.items.some((i) => i.kind === k)).map((k) => (
          <section key={k} className="grid gap-2">
            <h3 className="text-xs font-semibold text-muted-foreground">{tr(KIND_LABELS[k])}</h3>
            <ul className="grid gap-2">
              {data.items.filter((i) => i.kind === k).map((item) => (
                <InstallRow
                  key={item.installId}
                  projectId={projectId}
                  item={item}
                  canChange={data.canAdd}
                  onEdit={() => setEditing(item)}
                />
              ))}
            </ul>
          </section>
        ))
      )}

      {adding && <AddDialog projectId={projectId} entries={available} onClose={() => setAdding(false)} />}
      {editing && <EditDialog projectId={projectId} item={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function InstallRow({
  projectId,
  item,
  canChange,
  onEdit,
}: {
  projectId: number;
  item: ProjectLibraryItem;
  canChange: boolean;
  onEdit: () => void;
}) {
  const tr = useT();
  const tz = useTimeZone();
  const { show } = useToast();
  const confirm = useConfirm();
  const [pending, startTransition] = useTransition();

  const remove = async () => {
    if (!await confirm({ title: tr('«{t}» از این پروژه برداشته شود؟', { t: item.title }), description: tr('خودِ مورد در کتابخانه می‌ماند.'), confirmLabel: tr('برداشتن') })) return;
    startTransition(async () => {
      const r = await removeInstallAction(item.id, projectId, item.installId);
      show(tr(r.error ?? r.message ?? 'انجام شد.'), r.error ? 'error' : 'success');
    });
  };

  const fork = async () => {
    const ok = await confirm({
      title: tr('نسخهٔ جدا برای این پروژه؟'),
      description: item.installs > 1
        ? tr('این مورد روی {n} پروژه نصب است. یک کپی برای این پروژه ساخته می‌شود تا تغییرهایش به بقیه نرسد.', { n: item.installs })
        : tr('یک کپی برای این پروژه ساخته می‌شود و اصلی دست نمی‌خورد.'),
      confirmLabel: tr('ساختِ نسخه'),
    });
    if (!ok) return;
    startTransition(async () => {
      const r = await forkAction(item.id, projectId);
      if (r?.error) show(tr(r.error), 'error');
    });
  };

  return (
    <li className="flex items-start gap-3 rounded-xl border bg-card p-3.5">
      <KindIcon kind={item.kind} />
      <div className="grid min-w-0 flex-1 gap-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <Link href={`/library/${item.id}`} className="font-semibold hover:text-primary hover:underline" dir="auto">{item.title}</Link>
          <StatusBadge status={item.status} />
          {item.languages.map((l) => (
            <span key={l} className="rounded-md border px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground" dir="ltr">{LANGUAGE_LABELS[l]}</span>
          ))}
          {item.installs > 1 && (
            <span className="text-[11px] text-muted-foreground">{tr('مشترک با {n} پروژهٔ دیگر', { n: item.installs - 1 })}</span>
          )}
          {item.kind === 'guide' && item.clientVisible && (
            <span className="text-[11px] text-emerald-700 dark:text-emerald-300">{tr('کارفرما می‌بیند')}</span>
          )}
        </div>
        {item.summary && <p className="text-[13px] text-muted-foreground" dir="auto">{item.summary}</p>}
        {item.note && (
          <p className="text-[13px]" dir="auto"><span className="text-muted-foreground">{tr('کجا:')}</span> {item.note}</p>
        )}
        {item.valuesNote && (
          <p className="w-fit rounded-md bg-muted/60 px-2 py-1 font-mono text-xs whitespace-pre-wrap" dir="auto">{item.valuesNote}</p>
        )}
        <p className="text-[11px] text-muted-foreground">
          {tr('ثبت: {who}', { who: item.installedByName ?? '—' })} · <span className="num">{formatDate(item.installedAt, tz)}</span>
        </p>
      </div>
      {canChange && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton variant="ghost" className="size-8" label={tr('بیشتر')} disabled={pending}>
              {pending ? <Spinner /> : <MoreHorizontal className="size-4" />}
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onEdit}><Pencil />{tr('جای نصب و مقدارها')}</DropdownMenuItem>
            <DropdownMenuItem onSelect={fork}><Copy />{tr('نسخهٔ جدا برای این پروژه')}</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={remove}><Trash2 />{tr('برداشتن از پروژه')}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </li>
  );
}

function NoteFields({
  note, setNote, values, setValues,
}: { note: string; setNote: (v: string) => void; values: string; setValues: (v: string) => void }) {
  const tr = useT();
  return (
    <>
      <div className="grid gap-1.5">
        <Label htmlFor="lib-install-note">{tr('کجای سایت')}</Label>
        <Textarea id="lib-install-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder={tr('مثلاً: صفحهٔ قیمت‌ها، داخلِ فرمِ سفارش')} dir="auto" />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="lib-install-values">{tr('مقدارهای این پروژه (اختیاری)')}</Label>
        <Textarea id="lib-install-values" rows={3} value={values} onChange={(e) => setValues(e.target.value)} placeholder="data-flow-price = 150" dir="auto" />
      </div>
    </>
  );
}

function AddDialog({ projectId, entries, onClose }: { projectId: number; entries: EntryLink[]; onClose: () => void }) {
  const tr = useT();
  const { show } = useToast();
  const [entryId, setEntryId] = useState('');
  const [note, setNote] = useState('');
  const [values, setValues] = useState('');
  const [pending, startTransition] = useTransition();

  const save = () => startTransition(async () => {
    if (!Number(entryId)) { show(tr('یک مورد انتخاب کنید.'), 'error'); return; }
    const r = await installAction(Number(entryId), projectId, note, values);
    show(tr(r.error ?? r.message ?? 'انجام شد.'), r.error ? 'error' : 'success');
    if (!r.error) onClose();
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{tr('افزودن از کتابخانه')}</DialogTitle>
          <DialogDescription>{tr('کدی که قبلاً نوشته شده، بی‌کپی به این پروژه هم وصل می‌شود؛ اصلاحِ بعدی‌اش همه‌جا می‌رسد.')}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label>{tr('مورد')}</Label>
            <SearchableSelect value={entryId} onValueChange={setEntryId} containerClassName="w-full">
              <NativeSelectOption value="">{tr('— انتخاب —')}</NativeSelectOption>
              {entries.map((e) => (
                <NativeSelectOption key={e.id} value={String(e.id)}>{`${e.title} · ${tr(KIND_LABELS[e.kind])}`}</NativeSelectOption>
              ))}
            </SearchableSelect>
          </div>
          <NoteFields note={note} setNote={setNote} values={values} setValues={setValues} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{tr('انصراف')}</Button>
          <Button onClick={save} disabled={pending}>{pending && <Spinner />}{tr('افزودن')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditDialog({ projectId, item, onClose }: { projectId: number; item: ProjectLibraryItem; onClose: () => void }) {
  const tr = useT();
  const { show } = useToast();
  const [note, setNote] = useState(item.note);
  const [values, setValues] = useState(item.valuesNote);
  const [pending, startTransition] = useTransition();

  const save = () => startTransition(async () => {
    const r = await updateInstallAction(item.id, projectId, item.installId, note, values);
    show(tr(r.error ?? r.message ?? 'انجام شد.'), r.error ? 'error' : 'success');
    if (!r.error) onClose();
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{item.title}</DialogTitle>
          <DialogDescription>{tr('جای نصب و مقدارهایی که در این پروژه با پیش‌فرض فرق دارد.')}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <NoteFields note={note} setNote={setNote} values={values} setValues={setValues} />
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
 * نمای کارفرما
 * ------------------------------------------------------------------ */

function ClientView({ guides }: { guides: ClientGuide[] }) {
  const tr = useT();
  const tz = useTimeZone();
  if (guides.length === 0) {
    return <EmptyState icon={<BookOpenText />} title={tr('راهنمایی برای این پروژه نیست')} />;
  }
  return (
    <div className="grid gap-3">
      <SectionHeader
        title={tr('راهنماها')}
        description={tr('چیزهایی که خودتان می‌توانید در سایت عوض کنید، قدم‌به‌قدم.')}
      />
      {guides.map((g, i) => (
        <Collapsible key={g.id} defaultOpen={guides.length === 1 || i === 0} className="rounded-xl border bg-card">
          <CollapsibleTrigger className="group flex w-full items-center gap-3 p-4 text-start">
            <KindIcon kind="guide" />
            <span className="grid min-w-0 flex-1 gap-0.5">
              <span className="font-semibold" dir="auto">{g.title}</span>
              {g.summary && <span className="text-[13px] text-muted-foreground" dir="auto">{g.summary}</span>}
              <span className="text-[11px] text-muted-foreground">
                {tr('آخرین به‌روزرسانی')} <span className="num">{formatDate(g.updatedAt, tz)}</span>
              </span>
            </span>
            <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
          </CollapsibleTrigger>
          <CollapsibleContent className="border-t p-4">
            {g.note && <p className="mb-3 text-sm text-muted-foreground" dir="auto">{g.note}</p>}
            <EntryContent
              steps={g.steps}
              warnings={g.warnings}
              dependencies=""
              options={g.options}
              body={g.body}
              media={g.media}
              valuesNote={g.valuesNote}
            />
          </CollapsibleContent>
        </Collapsible>
      ))}
    </div>
  );
}
