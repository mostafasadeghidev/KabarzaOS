'use client';

import { UserName, avatarFor } from '@/components/user-avatar';
import { useState } from 'react';
import { CatalogSection } from './catalog-section';
import { deleteOnboardingItemAction, deleteOnboardingMediaAction, saveOnboardingItemAction } from './_form/actions';
import { MediaPicker } from '@/components/media/media-picker';
import { MediaGallery, type MediaEntry } from '@/components/media/media-gallery';
import { Paperclip } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useT } from '@/i18n/client';
import {
  ASSIGNEES, ASSIGNEE_LABELS, KINDS, KIND_LABELS, MAX_DUE_DAY,
  type AssigneeRule, type LibraryItem, type OnboardingKind,
} from '@/domain/onboarding/plan';

type LibraryRow = LibraryItem & { media: MediaEntry[] };

export interface OnboardingLibraryData {
  items: LibraryRow[];
  services: Array<{ id: number; name: string }>;
  people: Array<{ id: number; name: string }>;
  /** «+ ساختِ سرویسِ تازه» — همان گاردِ دفترِ دسترسی‌ها (`members.manage`). */
  canCreateService: boolean;
}

/**
 * «کتابخانهٔ آنبوردینگ» — کارهای روزهای اولِ هر نقش. همان الگوی کتابخانهٔ QA:
 * زیرتبِ هر نقش، و «همهٔ نقش‌ها» برای آیتمی که به هر عضوِ تازه‌ای می‌رسد.
 */
export function OnboardingLibrary({ data, roles }: {
  data: OnboardingLibraryData;
  roles: Array<{ id: number; label: string }>;
}) {
  const tr = useT();
  const [role, setRole] = useState<string>('all');
  const roleName = (id: number | null) => (id === null ? tr('همهٔ نقش‌ها') : roles.find((r) => r.id === id)?.label ?? '—');
  const serviceName = (id: number | null) => data.services.find((s) => s.id === id)?.name;
  const personName = (id: number | null) => data.people.find((p) => p.id === id)?.name;

  const rows = data.items.filter((i) => role === 'all' || (role === 'any' ? i.roleTagId === null : i.roleTagId === Number(role)));

  return (
    <div className="grid gap-4">
      <div className="overflow-x-auto pb-1.5">
        <Tabs value={role} onValueChange={setRole}>
          <TabsList className="w-max">
            <TabsTrigger value="all" className="flex-none gap-1.5 px-3">
              {tr('همه')}<span className="num text-xs text-muted-foreground">{data.items.length}</span>
            </TabsTrigger>
            <TabsTrigger value="any" className="flex-none gap-1.5 px-3">
              {tr('همهٔ نقش‌ها')}
              <span className="num text-xs text-muted-foreground">{data.items.filter((i) => i.roleTagId === null).length}</span>
            </TabsTrigger>
            {roles.map((r) => (
              <TabsTrigger key={r.id} value={String(r.id)} className="flex-none gap-1.5 px-3">
                {r.label}
                <span className="num text-xs text-muted-foreground">{data.items.filter((i) => i.roleTagId === r.id).length}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      <CatalogSection
        title={tr('کتابخانهٔ آنبوردینگ')}
        description={tr('آیتم‌های «همهٔ نقش‌ها» به هر عضوِ تازه می‌رسند و آیتم‌های هر نقش فقط به کسی که آن نقش را دارد. ویرایشِ آیتم با «همگام‌سازی با کتابخانه» به کارهای انجام‌نشدهٔ هر نفر می‌رسد؛ فایل‌های راهنما بی‌درنگ.')}
        addLabel="افزودن آیتم"
        rows={rows}
        columns={[
          {
            header: 'عنوان',
            cell: (i) => (
              <span className="grid gap-0.5">
                <span className="flex items-center gap-1.5 font-medium">
                  {i.title}
                  {i.media.length > 0 && (
                    <span className="inline-flex items-center gap-0.5 text-xs font-normal text-muted-foreground">
                      <Paperclip className="size-3" aria-hidden /><span className="num">{i.media.length}</span>
                    </span>
                  )}
                </span>
                {i.kind === 'access' && serviceName(i.serviceId) && (
                  <span className="text-xs text-muted-foreground">{tr('سرویس: {name}', { name: serviceName(i.serviceId)! })}</span>
                )}
              </span>
            ),
          },
          { header: 'نقش', cell: (i) => roleName(i.roleTagId) },
          { header: 'نوع', cell: (i) => <Badge variant="secondary">{tr(KIND_LABELS[i.kind])}</Badge> },
          {
            header: 'انجام‌دهنده',
            cell: (i) => (i.assignee === 'user'
              ? (personName(i.assigneeUserId) ? <UserName userId={i.assigneeUserId} name={personName(i.assigneeUserId)} /> : '—')
              : tr(ASSIGNEE_LABELS[i.assignee])),
          },
          { header: 'موعد', cell: (i) => tr('روزِ {n}', { n: i.dueDay }) },
        ]}
        saveAction={saveOnboardingItemAction}
        deleteAction={(i) => deleteOnboardingItemAction(i.id)}
        renderForm={(editing) => (
          <ItemFields
            editing={editing}
            defaultRole={role !== 'all' && role !== 'any' ? Number(role) : null}
            roles={roles}
            services={data.services}
            people={data.people}
            canCreateService={data.canCreateService}
          />
        )}
      />
    </div>
  );
}

/**
 * فیلدهای فرم. ⚠️ سرویس و شخص فقط وقتی دیده می‌شوند که معنا دارند (آیتمِ
 * «دسترسی»، «مسئولِ سرویس»، «شخصِ مشخص») — ولی پنهان‌بودن در UI گارد نیست؛
 * سرور همین قاعده را خودش می‌سنجد.
 */
function ItemFields({ editing, defaultRole, roles, services, people, canCreateService }: {
  editing: LibraryRow | null;
  defaultRole: number | null;
  roles: Array<{ id: number; label: string }>;
  services: Array<{ id: number; name: string }>;
  people: Array<{ id: number; name: string }>;
  canCreateService: boolean;
}) {
  const tr = useT();
  const [kind, setKind] = useState<OnboardingKind>(editing?.kind ?? 'task');
  const [assignee, setAssignee] = useState<AssigneeRule>(editing?.assignee ?? 'member');
  const needsService = kind === 'access' || assignee === 'service_owner';
  /** فایل‌هایی که همین حالا حذف شدند — دیالوگ باز می‌ماند و نباید منتظرِ بارِ دوباره بماند. */
  const [gone, setGone] = useState<number[]>([]);
  const currentMedia = (editing?.media ?? []).filter((m) => !gone.includes(m.id));

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field className="sm:col-span-2">
          <FieldLabel htmlFor="ob-title">{tr('عنوان')}</FieldLabel>
          <Input id="ob-title" name="title" defaultValue={editing?.title ?? ''} required />
        </Field>
        <Field>
          <FieldLabel htmlFor="ob-role">{tr('نقش')}</FieldLabel>
          <NativeSelect
            id="ob-role"
            name="roleTagId"
            containerClassName="w-full"
            defaultValue={String(editing ? (editing.roleTagId ?? '') : (defaultRole ?? ''))}
          >
            <NativeSelectOption value="">{tr('همهٔ نقش‌ها')}</NativeSelectOption>
            {roles.map((r) => <NativeSelectOption key={r.id} value={r.id}>{r.label}</NativeSelectOption>)}
          </NativeSelect>
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Field>
          <FieldLabel htmlFor="ob-kind">{tr('نوع')}</FieldLabel>
          <NativeSelect
            id="ob-kind" name="kind" containerClassName="w-full"
            value={kind} onChange={(e) => setKind(e.target.value as OnboardingKind)}
          >
            {KINDS.map((k) => <NativeSelectOption key={k} value={k}>{tr(KIND_LABELS[k])}</NativeSelectOption>)}
          </NativeSelect>
        </Field>
        <Field>
          <FieldLabel htmlFor="ob-assignee">{tr('انجام‌دهنده')}</FieldLabel>
          <NativeSelect
            id="ob-assignee" name="assignee" containerClassName="w-full"
            value={assignee} onChange={(e) => setAssignee(e.target.value as AssigneeRule)}
          >
            {ASSIGNEES.map((a) => <NativeSelectOption key={a} value={a}>{tr(ASSIGNEE_LABELS[a])}</NativeSelectOption>)}
          </NativeSelect>
        </Field>
        <Field>
          <FieldLabel htmlFor="ob-due">{tr('موعد (روزِ چندم)')}</FieldLabel>
          <Input
            id="ob-due" name="dueDay" type="number" min={1} max={MAX_DUE_DAY}
            className="num" defaultValue={editing?.dueDay ?? 1}
          />
        </Field>
      </div>

      {(needsService || assignee === 'user') && (
        <div className="grid gap-3 sm:grid-cols-2">
          {needsService && (
            <Field>
              <FieldLabel htmlFor="ob-service">{tr('سرویس')}</FieldLabel>
              <SearchableSelect
                id="ob-service" name="serviceId" containerClassName="w-full" required
                defaultValue={editing?.serviceId ? String(editing.serviceId) : ''}
                createName={canCreateService ? 'newServiceName' : undefined}
                searchPlaceholder={canCreateService ? tr('جستجو یا نامِ سرویسِ تازه…') : undefined}
              >
                <NativeSelectOption value="">{tr('انتخاب کنید')}</NativeSelectOption>
                {services.map((s) => <NativeSelectOption key={s.id} value={s.id}>{s.name}</NativeSelectOption>)}
              </SearchableSelect>
              <FieldDescription>
                {canCreateService
                  ? tr('از سیاههٔ دسترسی‌ها؛ اگر نیست، نامش را بنویسید تا همین‌جا ساخته شود. با تیک‌خوردنِ این کار، دسترسی همان‌جا ثبت می‌شود — هیچ رمزی ذخیره نمی‌شود.')
                  : tr('از سیاههٔ دسترسی‌ها. با تیک‌خوردنِ این کار، دسترسی همان‌جا ثبت می‌شود — هیچ رمزی ذخیره نمی‌شود.')}
              </FieldDescription>
            </Field>
          )}
          {assignee === 'user' && (
            <Field>
              <FieldLabel htmlFor="ob-user">{tr('شخص')}</FieldLabel>
              <SearchableSelect
                id="ob-user" name="assigneeUserId" containerClassName="w-full" required
                defaultValue={editing?.assigneeUserId ? String(editing.assigneeUserId) : ''}
                renderMedia={avatarFor(people)}
              >
                <NativeSelectOption value="">{tr('انتخاب کنید')}</NativeSelectOption>
                {people.map((p) => <NativeSelectOption key={p.id} value={p.id}>{p.name}</NativeSelectOption>)}
              </SearchableSelect>
            </Field>
          )}
        </div>
      )}

      <Field>
        <FieldLabel htmlFor="ob-link">{tr('پیوند (اختیاری)')}</FieldLabel>
        <Input id="ob-link" name="link" dir="ltr" placeholder="https://…" defaultValue={editing?.link ?? ''} />
      </Field>
      {/*
        فایل‌های راهنما (۲.۶.۰) — تصویر، ویدئو، PDF؛ چند فایل، با کشیدن و رهاکردن
        یا Ctrl+V روی توضیحات. همان ورودیِ رسانهٔ تسک‌ها و همان سقف‌ها.
        روی آیتمِ کتابخانه می‌نشینند، پس به چک‌لیستِ همه بی‌درنگ می‌رسند.
      */}
      <MediaPicker>
        <Field>
          <FieldLabel htmlFor="ob-desc">{tr('توضیحات')}</FieldLabel>
          <Textarea id="ob-desc" name="description" rows={3} defaultValue={editing?.description ?? ''} />
        </Field>
      </MediaPicker>
      {currentMedia.length > 0 && (
        <div className="grid gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">{tr('فایل‌های راهنمای فعلی')}</span>
          <MediaGallery
            items={currentMedia}
            projectId={0}
            size="sm"
            onRemove={async (m) => {
              const result = await deleteOnboardingMediaAction(m.id);
              if (!result.error) setGone((g) => [...g, m.id]);
              return result;
            }}
          />
        </div>
      )}
      <div className="flex items-center gap-2">
        <FieldLabel htmlFor="ob-sort" className="text-xs">{tr('ترتیب')}</FieldLabel>
        <Input id="ob-sort" name="sortOrder" type="number" className="num w-20" defaultValue={editing?.sortOrder ?? 0} />
      </div>
    </>
  );
}
