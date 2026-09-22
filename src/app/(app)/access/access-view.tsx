'use client';

import { useActionState, useEffect, useMemo, useState, useTransition } from 'react';
import { useFormStatus } from 'react-dom';
import { Download, KeyRound, ListChecks, Pencil, Plus, ShieldAlert, XCircle } from 'lucide-react';
import { CatalogSection } from '../settings/catalog-section';
import {
  deleteServiceAction, grantAccessAction, revokeAccessAction, revokeManyAction,
  saveServiceAction, type AccessState,
} from './_form/actions';
import { format as formatMoney } from '@/domain/money/money';
import {
  GRANT_LEVELS, KIND_LABELS, LEVEL_LABELS, SERVICE_KINDS,
  type GrantLevel, type ServiceKind,
} from '@/domain/access/service-grants';
import type { MemberState } from '@/domain/people/offboarding';
import { stateLabel } from '@/domain/people/offboarding';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { SearchableSelect } from '@/components/ui/searchable-select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useActionToast, useToast } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/confirm';
import { formatDateTime } from '@/i18n/datetime';
import { useT } from '@/i18n/client';

/**
 * دفترِ دسترسی‌های بیرونی.
 *
 * ⚠️ دو تب عمداً در یک صفحه‌اند و نه در «تنظیمات»: کاتالوگِ سرویس‌ها بدونِ
 * فهرستِ گرنت‌ها بی‌معناست، و صفحهٔ تنظیمات گاردِ دیگری دارد
 * (`settings.manage`) که مدیرِ اعضا را بیرون می‌گذاشت.
 */

export interface ServiceRow {
  id: number;
  name: string;
  kind: ServiceKind;
  ownerUserId: number | null;
  adminUrl: string;
  note: string;
  isActive: boolean;
  /** شمارِ دسترسیِ بازِ همین سرویس. */
  openCount: number;
  /** اشتراکِ متناظر در ماژولِ مالی. */
  recurringExpenseId: number | null;
  /** هزینه — فقط برای کسی که `finance.view` دارد؛ وگرنه همیشه null. */
  cost: {
    subscriptionId: number;
    title: string;
    monthly: string;
    perUser: string | null;
    currencyId: number;
    currencyCode: string;
    subscriptionActive: boolean;
  } | null;
}

export interface GrantRow {
  id: number;
  serviceId: number;
  userId: number;
  accountRef: string;
  level: GrantLevel;
  vaultRef: string;
  note: string;
  grantedAt: Date | string;
  revokedAt: Date | string | null;
  userName: string;
  memberState: MemberState;
}

export interface AccessData {
  services: ServiceRow[];
  grants: GrantRow[];
  people: Array<{ id: number; name: string; memberState: MemberState }>;
  risks: Array<{ userId: number; memberState: MemberState; grantIds: number[] }>;
  canManage: boolean;
  /** هزینه دادهٔ مالی است و گاردِ جدا دارد. */
  canSeeCost: boolean;
  subscriptions: Array<{
    id: number; title: string; currencyCode: string | null; isActive: boolean;
  }>;
  costTotals: Array<{ currencyId: number; currencyCode: string; monthly: string }>;
}

type StatusFilter = 'open' | 'revoked' | 'all';

export function AccessView({ data, focusUser }: { data: AccessData; focusUser: number | null }) {
  const tr = useT();
  const { show } = useToast();
  const confirm = useConfirm();
  const [tab, setTab] = useState<'grants' | 'services'>('grants');
  const [person, setPerson] = useState(focusUser ? String(focusUser) : '');
  const [service, setService] = useState('');
  const [status, setStatus] = useState<StatusFilter>('open');
  const [formerOnly, setFormerOnly] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [checklistOpen, setChecklistOpen] = useState(false);
  const [editing, setEditing] = useState<GrantRow | null>(null);
  const [pending, startTransition] = useTransition();

  const serviceName = (id: number) =>
    data.services.find((s) => s.id === id)?.name ?? `#${id}`;
  const personName = (id: number) =>
    data.people.find((p) => p.id === id)?.name ?? `#${id}`;

  const rows = useMemo(() => data.grants.filter((g) => {
    if (person && String(g.userId) !== person) return false;
    if (service && String(g.serviceId) !== service) return false;
    if (status === 'open' && g.revokedAt !== null) return false;
    if (status === 'revoked' && g.revokedAt === null) return false;
    if (formerOnly && g.memberState === 'active') return false;
    return true;
  }), [data.grants, person, service, status, formerOnly]);

  const openGrant = (row: GrantRow | null) => { setEditing(row); setDialogOpen(true); };

  // خروجی دقیقاً همان چیزی را می‌دهد که روی صفحه می‌بینی، نه کلِ دفتر.
  const exportHref = `/access/export?${new URLSearchParams({
    ...(person ? { user: person } : {}),
    ...(service ? { service } : {}),
    status,
    ...(formerOnly ? { former: '1' } : {}),
  }).toString()}`;

  const revoke = (row: GrantRow) => {
    startTransition(async () => {
      const result = await revokeAccessAction(row.id);
      if (result.error) show(tr(result.error), 'error');
      else show(tr('دسترسی قطع شد.'), 'success');
    });
  };

  return (
    <div className="grid gap-4">
      {/*
        ⚠️ هشدارِ اصلیِ این صفحه: عضوی که رفته ولی دسترسی‌اش بیرون از
        KabarzaOS هنوز باز است. تا وقتی این ردیف‌ها بسته نشوند، کارِ
        off-boarding نیمه‌تمام است.
      */}
      {data.risks.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
          <ShieldAlert className="size-4 shrink-0 text-destructive" />
          <p className="flex-1">
            {tr('{people} عضوِ سابق هنوز دسترسیِ باز دارد — مجموعاً {grants} مورد.', {
              people: data.risks.length,
              grants: data.risks.reduce((n, r) => n + r.grantIds.length, 0),
            })}
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => { setTab('grants'); setStatus('open'); setFormerOnly(true); setPerson(''); }}
          >
            {tr("نمایش بده")}
          </Button>
          {data.canManage && (
            <Button size="sm" onClick={() => setChecklistOpen(true)}>
              <ListChecks className="size-4" />
              {tr("چک‌لیستِ قطع")}
            </Button>
          )}
        </div>
      )}

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList variant="line" className="w-max">
          <TabsTrigger value="grants">{tr("دسترسی‌ها")}</TabsTrigger>
          <TabsTrigger value="services">{tr("سرویس‌ها")}</TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === 'grants' && (
        <section className="grid gap-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="grid gap-1.5">
              <Label htmlFor="f-person" className="text-xs text-muted-foreground">{tr("شخص")}</Label>
              <SearchableSelect
                id="f-person"
                value={person}
                onValueChange={setPerson}
                size="sm"
                containerClassName="w-44"
                aria-label={tr("فیلترِ شخص")}
              >
                <NativeSelectOption value="">{tr("همه")}</NativeSelectOption>
                {data.people.map((p) => (
                  <NativeSelectOption key={p.id} value={String(p.id)}>{p.name}</NativeSelectOption>
                ))}
              </SearchableSelect>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="f-service" className="text-xs text-muted-foreground">{tr("سرویس")}</Label>
              <SearchableSelect
                id="f-service"
                value={service}
                onValueChange={setService}
                size="sm"
                containerClassName="w-44"
                aria-label={tr("فیلترِ سرویس")}
              >
                <NativeSelectOption value="">{tr("همه")}</NativeSelectOption>
                {data.services.map((s) => (
                  <NativeSelectOption key={s.id} value={String(s.id)}>{s.name}</NativeSelectOption>
                ))}
              </SearchableSelect>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="f-status" className="text-xs text-muted-foreground">{tr("وضعیت")}</Label>
              <NativeSelect
                id="f-status"
                className="h-8 w-32 text-xs"
                value={status}
                onChange={(e) => setStatus(e.target.value as StatusFilter)}
              >
                <NativeSelectOption value="open">{tr("باز")}</NativeSelectOption>
                <NativeSelectOption value="revoked">{tr("قطع‌شده")}</NativeSelectOption>
                <NativeSelectOption value="all">{tr("همه")}</NativeSelectOption>
              </NativeSelect>
            </div>

            <label className="flex h-8 items-center gap-2 text-xs">
              <Checkbox
                checked={formerOnly}
                onCheckedChange={(v) => setFormerOnly(v === true)}
              />
              {tr("فقط اعضای سابق")}
            </label>

            <div className="ms-auto flex items-center gap-2">
              <Button size="sm" variant="outline" asChild>
                {/* دانلودِ مستقیم؛ نه اکشنِ سرور — فایل از همان مسیرِ گاردشده می‌آید. */}
                <a href={exportHref} download>
                  <Download className="size-4" />
                  {tr("خروجی CSV")}
                </a>
              </Button>
              {data.canManage && (
                <Button size="sm" onClick={() => openGrant(null)}>
                  <Plus className="size-4" />
                  {tr("ثبتِ دسترسی")}
                </Button>
              )}
            </div>
          </div>

          {rows.length === 0 ? (
            <EmptyState
              title={tr("دسترسی‌ای در این فیلتر نیست")}
              description={tr("اول سرویس‌ها را در تبِ «سرویس‌ها» تعریف کنید، بعد به هر نفر دسترسی بدهید.")}
              icon={<KeyRound className="size-5" />}
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{tr("شخص")}</TableHead>
                    <TableHead>{tr("سرویس")}</TableHead>
                    <TableHead>{tr("سطح")}</TableHead>
                    <TableHead>{tr("شناسهٔ حساب")}</TableHead>
                    <TableHead>{tr("از تاریخ")}</TableHead>
                    <TableHead>{tr("وضعیت")}</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => {
                    const former = stateLabel(row.memberState);
                    return (
                      <TableRow key={row.id}>
                        <TableCell>
                          <span className="flex flex-wrap items-center gap-1">
                            {row.userName}
                            {former && <Badge variant="outline">{tr(former)}</Badge>}
                          </span>
                        </TableCell>
                        <TableCell>{serviceName(row.serviceId)}</TableCell>
                        <TableCell>
                          <Badge variant={row.level === 'admin' ? 'default' : 'secondary'}>
                            {tr(LEVEL_LABELS[row.level])}
                          </Badge>
                        </TableCell>
                        <TableCell className="num text-xs" dir="ltr">{row.accountRef || '—'}</TableCell>
                        <TableCell className="num text-xs">
                          {formatDateTime(row.grantedAt).slice(0, 10)}
                        </TableCell>
                        <TableCell>
                          {row.revokedAt === null ? (
                            <Badge variant="success">{tr("باز")}</Badge>
                          ) : (
                            <span className="flex flex-wrap items-center gap-1">
                              <Badge variant="outline">{tr("قطع‌شده")}</Badge>
                              <span className="num text-xs text-muted-foreground">
                                {formatDateTime(row.revokedAt).slice(0, 10)}
                              </span>
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          {data.canManage && row.revokedAt === null && (
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                size="icon"
                                variant="ghost"
                                className="size-8"
                                aria-label={tr("ویرایش")}
                                onClick={() => openGrant(row)}
                              >
                                <Pencil className="size-3.5" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="size-8 text-muted-foreground hover:text-destructive"
                                aria-label={tr("قطعِ دسترسی")}
                                disabled={pending}
                                onClick={async () => {
                                  if (await confirm({
                                    title: tr('این دسترسی قطع شود؟'),
                                    description: tr('ردیف پاک نمی‌شود؛ تاریخِ قطع رویش ثبت می‌شود. قطعِ واقعی را در خودِ سرویس انجام دهید.'),
                                  })) revoke(row);
                                }}
                              >
                                <XCircle className="size-3.5" />
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </section>
      )}

      {tab === 'services' && data.canSeeCost && data.costTotals.length > 0 && (
        <p className="text-sm text-muted-foreground">
          {tr("هزینهٔ ماهانهٔ اشتراک‌های فعال:")}{' '}
          {data.costTotals.map((c) => (
            <span key={c.currencyId} className="num me-3">
              {formatMoney(c.monthly)} {c.currencyCode}
            </span>
          ))}
        </p>
      )}

      {tab === 'services' && (
        <CatalogSection
          title={tr("سرویس‌ها")}
          description={tr("سامانه‌های بیرونی که تیم به آن‌ها دسترسی می‌گیرد. سرویس حذف نمی‌شود؛ غیرفعال می‌شود تا تاریخچه بماند.")}
          addLabel="افزودن سرویس"
          rows={data.services}
          columns={[
            { header: 'نام', cell: (s) => s.name },
            { header: 'دسته', cell: (s) => tr(KIND_LABELS[s.kind]) },
            { header: 'مسئول', cell: (s) => (s.ownerUserId ? personName(s.ownerUserId) : '—') },
            { header: 'کاربران', cell: (s) => s.openCount, numeric: true },
            /**
             * ⚠️ ستونِ هزینه فقط برای کسی ساخته می‌شود که `finance.view` دارد.
             * سرور هم همان را گارد می‌کند؛ این فقط ستونِ خالی را برمی‌دارد.
             */
            ...(data.canSeeCost ? [{
              header: 'ماهانه',
              numeric: true,
              cell: (s: ServiceRow) => (s.cost
                ? (
                  <span className="num">
                    {formatMoney(s.cost.monthly)} {s.cost.currencyCode}
                  </span>
                )
                : '—'),
            }, {
              header: 'سرانه',
              numeric: true,
              cell: (s: ServiceRow) => (s.cost?.perUser
                ? <span className="num">{formatMoney(s.cost.perUser)}</span>
                : '—'),
            }] : []),
            {
              header: 'وضعیت',
              cell: (s) => (
                <span className="flex flex-wrap gap-1">
                  {!s.isActive && <Badge variant="outline">{tr("غیرفعال")}</Badge>}
                  {/*
                    سرویسی که کنار گذاشته‌ای ولی اشتراکش هنوز تمدید می‌شود —
                    همان پولی که بی‌صدا می‌رود.
                  */}
                  {!s.isActive && s.cost?.subscriptionActive && (
                    <Badge variant="destructive">{tr("اشتراک فعال")}</Badge>
                  )}
                </span>
              ),
            },
          ]}
          saveAction={saveServiceAction}
          deleteAction={(s) => deleteServiceAction(s.id)}
          canDelete={(s) => s.isActive}
          renderForm={(edit) => (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="s-name">{tr("نام")}</Label>
                <Input id="s-name" name="name" defaultValue={edit?.name ?? ''} required />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="s-kind">{tr("دسته")}</Label>
                <NativeSelect id="s-kind" name="kind" defaultValue={edit?.kind ?? 'other'}>
                  {SERVICE_KINDS.map((k) => (
                    <NativeSelectOption key={k} value={k}>{tr(KIND_LABELS[k])}</NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="s-owner">{tr("مسئولِ اعطای دسترسی")}</Label>
                <SearchableSelect
                  id="s-owner"
                  name="ownerUserId"
                  defaultValue={edit?.ownerUserId ? String(edit.ownerUserId) : ''}
                  containerClassName="w-full"
                >
                  <NativeSelectOption value="">{tr("تعیین‌نشده")}</NativeSelectOption>
                  {data.people.map((p) => (
                    <NativeSelectOption key={p.id} value={String(p.id)}>{p.name}</NativeSelectOption>
                  ))}
                </SearchableSelect>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="s-url">{tr("پنلِ مدیریت")}</Label>
                <Input id="s-url" name="adminUrl" dir="ltr" defaultValue={edit?.adminUrl ?? ''} placeholder="https://" />
              </div>
              {data.canSeeCost && (
                <div className="grid gap-1.5 sm:col-span-2">
                  <Label htmlFor="s-sub">{tr("اشتراکِ مالی")}</Label>
                  <SearchableSelect
                    id="s-sub"
                    name="recurringExpenseId"
                    defaultValue={edit?.recurringExpenseId ? String(edit.recurringExpenseId) : ''}
                    containerClassName="w-full"
                  >
                    <NativeSelectOption value="">{tr("بدون اشتراک")}</NativeSelectOption>
                    {data.subscriptions.map((sub) => (
                      <NativeSelectOption key={sub.id} value={String(sub.id)}>
                        {sub.title}{sub.currencyCode ? ` — ${sub.currencyCode}` : ''}
                      </NativeSelectOption>
                    ))}
                  </SearchableSelect>
                  <p className="text-xs text-muted-foreground">
                    {tr("مبلغ و دوره از همان هزینهٔ دوره‌ای خوانده می‌شود؛ اینجا چیزی ذخیره نمی‌شود.")}
                  </p>
                </div>
              )}
              <div className="grid gap-1.5 sm:col-span-2">
                <Label htmlFor="s-note">{tr("یادداشت")}</Label>
                <Input id="s-note" name="note" defaultValue={edit?.note ?? ''} />
              </div>
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <Checkbox name="isActive" defaultChecked={edit?.isActive ?? true} />
                {tr("فعال (در فرمِ اعطای دسترسی پیشنهاد می‌شود)")}
              </label>
            </div>
          )}
        />
      )}

      <GrantDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
        services={data.services}
        people={data.people}
      />

      <ChecklistDialog
        open={checklistOpen}
        onOpenChange={setChecklistOpen}
        data={data}
      />
    </div>
  );
}

/**
 * چک‌لیستِ قطعِ دسترسیِ اعضای سابق.
 *
 * ⚠️ نامِ مسئولِ هر سرویس کنارِ ردیف می‌آید: کسی که این فهرست را می‌بندد
 * معمولاً خودش به پنلِ آن سرویس دسترسی ندارد و باید بداند از که بخواهد.
 *
 * ⚠️ تیک‌زدن اینجا فقط **دفتر** را می‌بندد. قطعِ واقعی در خودِ سرویس انجام
 * می‌شود؛ متنِ بالای دیالوگ همین را می‌گوید تا کسی خیال نکند کار تمام است.
 */
function ChecklistDialog({
  open, onOpenChange, data,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: AccessData;
}) {
  const tr = useT();
  const { show } = useToast();
  const [picked, setPicked] = useState<number[]>([]);
  const [pending, startTransition] = useTransition();

  const groups = useMemo(() => data.risks.map((risk) => ({
    userId: risk.userId,
    name: data.people.find((p) => p.id === risk.userId)?.name ?? `#${risk.userId}`,
    state: risk.memberState,
    rows: risk.grantIds.map((id) => {
      const grant = data.grants.find((g) => g.id === id)!;
      const service = data.services.find((s) => s.id === grant.serviceId);
      return {
        id,
        serviceName: service?.name ?? '',
        adminUrl: service?.adminUrl ?? '',
        owner: service?.ownerUserId
          ? data.people.find((p) => p.id === service.ownerUserId)?.name ?? ''
          : '',
      };
    }),
  })), [data]);

  // با هر بازشدن، همه‌چیز از نو تیک می‌خورد — پیش‌فرضِ «همه را ببند».
  useEffect(() => {
    if (open) setPicked(groups.flatMap((g) => g.rows.map((r) => r.id)));
  }, [open, groups]);

  const toggle = (id: number) =>
    setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const submit = () => {
    startTransition(async () => {
      const result = await revokeManyAction(picked);
      if (result.error) show(tr(result.error), 'error');
      else {
        show(tr('دسترسی‌ها در دفتر بسته شدند.'), 'success');
        onOpenChange(false);
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{tr("چک‌لیستِ قطعِ دسترسی")}</DialogTitle>
          <DialogDescription>
            {tr("اول در پنلِ هر سرویس حساب را ببند، بعد اینجا تیکش را نگه دار تا در دفتر هم بسته شود.")}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          {groups.map((group) => (
            <section key={group.userId} className="grid gap-2">
              <h3 className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                {group.name}
                <Badge variant="outline">{tr(stateLabel(group.state) ?? '')}</Badge>
              </h3>
              {group.rows.map((row) => (
                <label key={row.id} className="flex items-start gap-2 rounded-md border p-2 text-sm">
                  <Checkbox
                    className="mt-0.5"
                    checked={picked.includes(row.id)}
                    onCheckedChange={() => toggle(row.id)}
                  />
                  <span className="grid flex-1 gap-0.5">
                    <span>{row.serviceName}</span>
                    {row.owner && (
                      <span className="text-xs text-muted-foreground">
                        {tr("مسئول")}: {row.owner}
                      </span>
                    )}
                  </span>
                  {row.adminUrl && (
                    <a
                      href={row.adminUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs underline"
                    >
                      {tr("پنل")}
                    </a>
                  )}
                </label>
              ))}
            </section>
          ))}
        </div>

        <DialogFooter>
          <Button type="button" size="sm" variant="outline" onClick={() => onOpenChange(false)}>
            {tr("انصراف")}
          </Button>
          <Button size="sm" disabled={pending || picked.length === 0} onClick={submit}>
            {tr('قطعِ {n} مورد', { n: picked.length })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * فرمِ اعطای دسترسی.
 *
 * ⚠️ «ویرایش» و «افزودن» یک فرم‌اند: اگر همان جفتِ (شخص، سرویس) گرنتِ باز
 * داشته باشد، سرور همان ردیف را به‌روز می‌کند (R-ACCESS-03) — پس کاربر
 * هیچ‌وقت خطای «تکراری» نمی‌بیند.
 */
function GrantDialog({
  open, onOpenChange, editing, services, people,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: GrantRow | null;
  services: ServiceRow[];
  people: Array<{ id: number; name: string; memberState: MemberState }>;
}) {
  const tr = useT();
  const [state, formAction] = useActionState<AccessState, FormData>(grantAccessAction, {});
  useActionToast(state, { success: 'ثبت شد.' });

  useEffect(() => { if (state.ok) onOpenChange(false); }, [state, onOpenChange]);

  // فقط سرویسِ فعال و عضوِ فعال — قاعدهٔ سرور، همین‌جا هم در فرم.
  const activeServices = services.filter((s) => s.isActive || s.id === editing?.serviceId);
  const activePeople = people.filter((p) => p.memberState === 'active' || p.id === editing?.userId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? tr('ویرایشِ دسترسی') : tr('ثبتِ دسترسی')}</DialogTitle>
          <DialogDescription>
            {tr("⚠️ رمز، توکن و کلید اینجا ثبت نمی‌شوند. فقط ثبت می‌کنیم چه کسی به چه چیزی دسترسی دارد.")}
          </DialogDescription>
        </DialogHeader>

        <form key={editing?.id ?? 'new'} action={formAction} className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="g-service">{tr("سرویس")}</Label>
            <SearchableSelect
              id="g-service"
              name="serviceId"
              defaultValue={editing ? String(editing.serviceId) : ''}
              containerClassName="w-full"
              required
            >
              {activeServices.map((s) => (
                <NativeSelectOption key={s.id} value={String(s.id)}>{s.name}</NativeSelectOption>
              ))}
            </SearchableSelect>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="g-user">{tr("شخص")}</Label>
            <SearchableSelect
              id="g-user"
              name="userId"
              defaultValue={editing ? String(editing.userId) : ''}
              containerClassName="w-full"
              required
            >
              {activePeople.map((p) => (
                <NativeSelectOption key={p.id} value={String(p.id)}>{p.name}</NativeSelectOption>
              ))}
            </SearchableSelect>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="g-level">{tr("سطحِ دسترسی")}</Label>
            <NativeSelect id="g-level" name="level" defaultValue={editing?.level ?? 'member'}>
              {GRANT_LEVELS.map((l) => (
                <NativeSelectOption key={l} value={l}>{tr(LEVEL_LABELS[l])}</NativeSelectOption>
              ))}
            </NativeSelect>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="g-account">{tr("شناسهٔ حساب")}</Label>
            <Input
              id="g-account"
              name="accountRef"
              dir="ltr"
              defaultValue={editing?.accountRef ?? ''}
              placeholder={tr("ایمیل، نامِ کاربری یا شمارهٔ داخلی")}
            />
          </div>

          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="g-vault">{tr("ارجاعِ محفظهٔ رمز")}</Label>
            <Input
              id="g-vault"
              name="vaultRef"
              defaultValue={editing?.vaultRef ?? ''}
              placeholder={tr("نامِ آیتم در password manager — نه خودِ رمز")}
            />
          </div>

          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="g-note">{tr("یادداشت")}</Label>
            <Input id="g-note" name="note" defaultValue={editing?.note ?? ''} />
          </div>

          <DialogFooter className="sm:col-span-2">
            <Button type="button" size="sm" variant="outline" onClick={() => onOpenChange(false)}>
              {tr("انصراف")}
            </Button>
            <SaveButton />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SaveButton() {
  const { pending } = useFormStatus();
  const tr = useT();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? tr('در حالِ ذخیره…') : tr('ذخیره')}
    </Button>
  );
}
