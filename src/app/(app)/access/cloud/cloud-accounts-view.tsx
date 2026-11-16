'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import {
  Ban, Cloud, ExternalLink, KeyRound, MoreHorizontal, Pencil, Power, Sparkles, UserPlus,
} from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/empty-state';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { NativeSelectOption } from '@/components/ui/native-select';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { useConfirm } from '@/components/ui/confirm';
import { useToast } from '@/components/ui/toast';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Table, TableActionsCell, TableActionsHead, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { avatarFor } from '@/components/user-avatar';
import { CopyText } from '@/components/copy-text';
import { cn } from '@/lib/utils';
import { humanSize } from '@/domain/files/upload';
import { suggestCloudUserId } from '@/domain/cloud/nextcloud';
import { useT, useTimeZone } from '@/i18n/client';
import { formatDate } from '@/i18n/datetime';
import type { CloudAccountRow, CloudAccountsView as Data } from '@/server/cloud/accounts';
import { SecretReveal } from '../secret-reveal';
import { NewPasswordDialog } from '../mail/new-password-dialog';
import {
  createCloudAccountAction, linkCloudAccountAction, resetCloudPasswordAction, setCloudEnabledAction, setCloudQuotaAction,
} from '../_form/actions';

/**
 * حساب‌های فضای ابری (۳.۴.۰): فهرستِ گروهِ اتصال، جفت با اعضا، ساختن، حجم، رمز، قطع و وصل.
 *
 * ⚠️ انتخابِ عضو بی‌درنگ ذخیره می‌شود؛ جداکردن ردیفِ دفتر را قطع می‌کند و تاریخچه می‌ماند.
 * «قطعِ حساب» آن را روی Nextcloud غیرفعال می‌کند؛ فایل‌ها پاک نمی‌شوند.
 */
const ERRORS: Record<string, string> = {
  unauthorized: 'فضای ابری نام‌کاربری یا رمزِ برنامه را نپذیرفت.',
  forbidden: 'حسابِ اتصال اجازهٔ دیدنِ این گروه را ندارد؛ باید «مدیرِ گروهِ» همین گروه باشد.',
  not_configured: 'رمزِ برنامهٔ این اتصال ذخیره نشده یا دیگر باز نمی‌شود؛ در «تنظیمات ← فضای ابری» دوباره بگذاریدش.',
  not_found: 'گروهِ این اتصال روی فضای ابری پیدا نشد.',
  server: 'فضای ابری پاسخ نداد؛ کمی بعد دوباره امتحان کنید.',
};

const PASSWORD_NOTES = {
  linked: 'رمزِ فعلی و همهٔ ورودهای اپِ دسکتاپ و موبایل باطل می‌شوند و باید دوباره وارد شوند. رمزِ تازه در «دسترسی‌های من» ِ کارمند دیده می‌شود.',
  shared: 'رمزِ فعلی باطل می‌شود. این حساب صاحبی در برنامه ندارد، پس رمزِ تازه فقط همین یک بار نشان داده می‌شود.',
};

export function CloudAccountsView({ data, isOwner }: { data: Data; isOwner: boolean }) {
  const tr = useT();
  const { show } = useToast();
  const confirm = useConfirm();
  const [pending, start] = useTransition();
  const [detail, setDetail] = useState<CloudAccountRow | null>(null);
  const [pwTarget, setPwTarget] = useState<CloudAccountRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [handover, setHandover] = useState<Handover | null>(null);
  const conn = data.current;

  if (!conn) {
    return (
      <EmptyState
        icon={<Cloud className="size-5" />}
        title={tr('هنوز فضای ابری‌ای وصل نیست')}
        description={tr('اتصال به Nextcloud در «تنظیمات ← فضای ابری» است و فقط مالک آن را می‌بیند.')}
      >
        {isOwner && <Button size="sm" variant="outline" asChild><Link href="/settings?tab=cloud">{tr('تنظیمات')}</Link></Button>}
      </EmptyState>
    );
  }

  const tabs = data.connections.length > 1 && (
    <div className="flex flex-wrap gap-1.5">
      {data.connections.map((c) => (
        <Button key={c.id} size="sm" variant={c.id === conn.id ? 'secondary' : 'ghost'} asChild>
          <Link href={`/access/cloud?c=${c.id}`} aria-current={c.id === conn.id ? 'page' : undefined}>{c.name}</Link>
        </Button>
      ))}
    </div>
  );

  if (data.error) {
    return (
      <div className="grid gap-3">
        {tabs}
        <EmptyState
          icon={<Cloud className="size-5" />}
          title={tr(ERRORS[data.error] ?? ERRORS.server!)}
          description={tr('اتصال را در «تنظیمات ← فضای ابری» با دکمهٔ «آزمونِ اتصال» بررسی کنید.')}
        >
          {isOwner && <Button size="sm" variant="outline" asChild><Link href="/settings?tab=cloud">{tr('تنظیمات')}</Link></Button>}
        </EmptyState>
      </div>
    );
  }

  const link = (account: CloudAccountRow, value: string) => {
    const memberId = value ? Number(value) : null;
    start(async () => {
      const result = await linkCloudAccountAction(conn.id, account.id, memberId);
      if (result.error) show(tr(result.error, result.params), 'error');
      else show(tr(memberId ? 'حساب به عضو وصل شد.' : 'حساب از عضو جدا شد.'), 'success');
    });
  };

  const toggle = async (account: CloudAccountRow) => {
    if (account.enabled && !await confirm({
      title: tr('حسابِ {id} قطع شود؟', { id: account.id }),
      description: tr('حساب روی فضای ابری غیرفعال می‌شود: دیگر نمی‌تواند وارد شود و اپ‌های دسکتاپ و موبایل همگام‌سازی را متوقف می‌کنند. فایل‌ها پاک نمی‌شوند و با «وصلِ دوباره» برمی‌گردد. ردیفِ دفترش هم قطع می‌شود.'),
      confirmLabel: tr('قطعِ حساب'),
      destructive: true,
    })) return;
    start(async () => {
      const result = await setCloudEnabledAction(conn.id, account.id, !account.enabled);
      if (result.error) show(tr(result.error, result.params), 'error');
      else { show(tr(account.enabled ? 'حساب قطع شد.' : 'حساب دوباره وصل شد.'), 'success'); setDetail(null); }
    });
  };

  const linked = data.accounts.filter((a) => a.link).length;
  const linkedUsers = new Set(data.accounts.flatMap((a) => (a.link ? [a.link.userId] : [])));
  const used = data.accounts.reduce((sum, a) => sum + a.usedBytes, 0);

  return (
    <div className="grid gap-3">
      {tabs}
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex-1 text-sm text-muted-foreground">
          {tr('{n} حساب در گروه · {m} وصل به عضو', { n: data.accounts.length, m: linked })}
          {' · '}<span className="num">{humanSize(used, tr)}</span>
        </p>
        <Button size="sm" variant="ghost" asChild>
          <a href={conn.baseUrl} target="_blank" rel="noopener noreferrer"><ExternalLink className="size-4" />{tr('باز کردنِ فضای ابری')}</a>
        </Button>
        <Button size="sm" onClick={() => setCreating(true)}><UserPlus className="size-4" />{tr('حسابِ تازه')}</Button>
      </div>

      {data.accounts.length === 0 ? (
        <EmptyState icon={<Cloud className="size-5" />} title={tr('این گروه هنوز حسابی ندارد')} />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{tr('حساب')}</TableHead>
              <TableHead>{tr('حجم')}</TableHead>
              <TableHead>{tr('آخرین ورود')}</TableHead>
              <TableHead>{tr('عضو')}</TableHead>
              <TableActionsHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.accounts.map((account) => {
              const suggested = account.suggestedUserId !== null
                ? data.people.find((p) => p.id === account.suggestedUserId) : null;
              return (
                <TableRow
                  key={account.id}
                  className={cn('cursor-pointer', !account.enabled && 'opacity-60')}
                  tabIndex={0}
                  onClick={() => setDetail(account)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && e.target === e.currentTarget) setDetail(account); }}
                >
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium" dir="ltr">{account.id}</span>
                      {!account.enabled && <Badge variant="secondary">{tr('قطع')}</Badge>}
                    </div>
                    {account.displayName !== account.id && <div className="text-xs text-muted-foreground">{account.displayName}</div>}
                  </TableCell>
                  <TableCell className="whitespace-nowrap"><Usage account={account} /></TableCell>
                  <LastLogin value={account.lastLogin} />
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <div className="grid gap-1">
                      <SearchableSelect
                        value={account.link ? String(account.link.userId) : ''}
                        onValueChange={(v) => link(account, v)}
                        size="sm"
                        containerClassName="w-48"
                        disabled={pending || !account.enabled}
                        aria-label={tr('عضوِ صاحبِ حساب')}
                        renderMedia={avatarFor(data.people)}
                      >
                        <NativeSelectOption value="">{tr('— بی عضو —')}</NativeSelectOption>
                        {data.people.map((p) => <NativeSelectOption key={p.id} value={String(p.id)}>{p.name}</NativeSelectOption>)}
                      </SearchableSelect>
                      {suggested && (
                        <button
                          type="button" disabled={pending} onClick={() => link(account, String(suggested.id))}
                          className="inline-flex items-center gap-1 text-start text-xs text-primary hover:underline"
                        >
                          <Sparkles className="size-3" />
                          {tr('پیشنهاد: {name} — وصل کن', { name: suggested.name })}
                        </button>
                      )}
                    </div>
                  </TableCell>
                  <TableActionsCell onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <IconButton variant="ghost" size="icon-sm" label={tr('کارهای این حساب')} disabled={pending}>
                          <MoreHorizontal className="size-4" />
                        </IconButton>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => setDetail(account)}><Pencil className="size-3.5" />{tr('جزئیات و حجم')}</DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setPwTarget(account)}><KeyRound className="size-3.5" />{tr('رمزِ تازه')}</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {account.enabled ? (
                          <DropdownMenuItem variant="destructive" onSelect={() => { void toggle(account); }}><Ban className="size-3.5" />{tr('قطعِ حساب')}</DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem onSelect={() => { void toggle(account); }}><Power className="size-3.5" />{tr('وصلِ دوباره')}</DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableActionsCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      <DetailsDialog
        account={detail}
        connectionId={conn.id}
        baseUrl={conn.baseUrl}
        onClose={() => setDetail(null)}
        onNewPassword={(a) => { setDetail(null); setPwTarget(a); }}
        onToggle={(a) => { void toggle(a); }}
      />
      <CreateDialog
        open={creating}
        onOpenChange={setCreating}
        connectionId={conn.id}
        defaultQuotaGb={conn.defaultQuotaGb}
        people={data.people.filter((p) => !linkedUsers.has(p.id))}
        onCreated={(created) => { setCreating(false); setHandover(created); }}
      />
      <HandoverDialog value={handover} baseUrl={conn.baseUrl} onClose={() => setHandover(null)} />
      <NewPasswordDialog
        target={pwTarget ? { accountId: pwTarget.id, address: pwTarget.id, linked: pwTarget.link !== null } : null}
        onClose={() => setPwTarget(null)}
        submit={(accountId, custom) => resetCloudPasswordAction(conn.id, accountId, custom)}
        notes={PASSWORD_NOTES}
        onDone={(r) => {
          const id = pwTarget?.id ?? '';
          if (r.grantId || r.password) setHandover({ grantId: r.grantId, userId: id, password: r.password });
        }}
      />
    </div>
  );
}

/** استفاده‌شده / سقف، با نوارِ پرشدن. */
function Usage({ account }: { account: CloudAccountRow }) {
  const tr = useT();
  const ratio = account.quotaBytes ? Math.min(1, account.usedBytes / account.quotaBytes) : 0;
  return (
    <div className="grid w-32 gap-1">
      {/* ⚠️ `num` فقط دورِ عدد — «بی‌سقف» ِ فارسی بیرونش (آزمونِ bidi). */}
      <span className="text-xs">
        <span className="num">{humanSize(account.usedBytes, tr)}</span>
        <span className="text-muted-foreground"> / {account.quotaBytes !== null ? <span className="num">{humanSize(account.quotaBytes, tr)}</span> : tr('بی‌سقف')}</span>
      </span>
      {account.quotaBytes !== null && (
        <span className="h-1 overflow-hidden rounded-full bg-muted">
          <span className={cn('block h-full rounded-full', ratio > 0.9 ? 'bg-destructive' : 'bg-primary')} style={{ width: `${Math.round(ratio * 100)}%` }} />
        </span>
      )}
    </div>
  );
}

function LastLogin({ value }: { value: number | null }) {
  const tr = useT();
  const tz = useTimeZone();
  return (
    <TableCell className="text-xs whitespace-nowrap text-muted-foreground">
      {value ? <span className="num">{formatDate(new Date(value), tz)}</span> : tr('هرگز')}
    </TableCell>
  );
}

type Handover = { grantId: number | null; userId: string; password?: string };

function CreateDialog({ open, onOpenChange, connectionId, defaultQuotaGb, people, onCreated }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connectionId: number;
  defaultQuotaGb: number;
  people: Data['people'];
  onCreated: (created: Handover) => void;
}) {
  const tr = useT();
  const { show } = useToast();
  const [pending, start] = useTransition();
  const [member, setMember] = useState('');
  const [userId, setUserId] = useState('');
  const [quota, setQuota] = useState(String(defaultQuotaGb));

  const reset = () => { setMember(''); setUserId(''); setQuota(String(defaultQuotaGb)); };

  const pick = (value: string) => {
    setMember(value);
    const person = people.find((p) => String(p.id) === value);
    // پیشنهادِ نامِ کاربری فقط وقتی مدیر هنوز چیزی ننوشته یا همان پیشنهادِ قبلی است.
    if (person) setUserId(suggestCloudUserId(person));
  };

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    start(async () => {
      const state = await createCloudAccountAction(connectionId, { memberId: Number(member), userId, quotaGb: Number(quota) });
      if (state.error) { show(tr(state.error, state.params), 'error'); return; }
      if (state.grantId && state.userId) {
        show(tr('حسابِ {id} ساخته شد.', { id: state.userId }), 'success');
        reset();
        onCreated({ grantId: state.grantId, userId: state.userId });
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><UserPlus className="size-4" />{tr('حسابِ تازه')}</DialogTitle>
          <DialogDescription>
            {tr('حساب در گروهِ همین فضا با رمزِ تصادفی ساخته می‌شود و رمز در «دسترسی‌های من» ِ کارمند دیده می‌شود.')}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-3">
          <Field>
            <FieldLabel htmlFor="cl-member">{tr('عضو')}</FieldLabel>
            <SearchableSelect id="cl-member" value={member} onValueChange={pick} containerClassName="w-full" required renderMedia={avatarFor(people)}>
              <NativeSelectOption value="">{tr('— انتخاب —')}</NativeSelectOption>
              {people.map((p) => <NativeSelectOption key={p.id} value={String(p.id)}>{p.name}</NativeSelectOption>)}
            </SearchableSelect>
            <FieldDescription>{tr('فقط اعضای فعالی که روی این فضا حساب ندارند.')}</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="cl-user">{tr('نامِ کاربری')}</FieldLabel>
            <Input id="cl-user" required dir="ltr" autoComplete="off" value={userId} onChange={(e) => setUserId(e.target.value.toLowerCase())} placeholder="sara" />
            <FieldDescription>{tr('۲ تا ۳۲ نویسه: حروفِ کوچکِ لاتین، رقم، نقطه، خط تیره و زیرخط. بعداً عوض نمی‌شود.')}</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="cl-quota">{tr('حجم (گیگابایت)')}</FieldLabel>
            <Input id="cl-quota" type="number" min={0.1} max={10000} step="any" dir="ltr" className="num w-32" value={quota} onChange={(e) => setQuota(e.target.value)} />
          </Field>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>{tr('انصراف')}</Button>
            <Button type="submit" disabled={pending || !member || !userId}>{tr('ساختن')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** پس از ساختن یا رمزِ تازه: نامِ کاربری و رمز برای تحویل. */
function HandoverDialog({ value, baseUrl, onClose }: { value: Handover | null; baseUrl: string; onClose: () => void }) {
  const tr = useT();
  return (
    <Dialog open={value !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{tr('حساب آماده است')}</DialogTitle>
          <DialogDescription>
            {value?.grantId !== null
              ? tr('کارمند همین نامِ کاربری و رمز را در «پروفایل ← دسترسی‌های من» می‌بیند. رمز را از راهِ پیامِ بیرونی نفرستید.')
              : tr('این حساب صاحبی در برنامه ندارد؛ رمز فقط همین یک بار نشان داده می‌شود.')}
          </DialogDescription>
        </DialogHeader>
        {value && (
          <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">{tr('نشانی')}</dt>
            <dd dir="ltr" className="text-start"><CopyText value={baseUrl} /></dd>
            <dt className="text-muted-foreground">{tr('نامِ کاربری')}</dt>
            <dd dir="ltr" className="text-start font-medium"><CopyText value={value.userId} /></dd>
            <dt className="text-muted-foreground">{tr('رمز')}</dt>
            <dd>
              {value.grantId !== null
                ? <SecretReveal grantId={value.grantId} />
                : value.password ? <span dir="ltr" className="font-mono"><CopyText value={value.password} /></span> : '—'}
            </dd>
          </dl>
        )}
        <DialogFooter><Button onClick={onClose}>{tr('بستن')}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DetailsDialog({ account, connectionId, baseUrl, onClose, onNewPassword, onToggle }: {
  account: CloudAccountRow | null;
  connectionId: number;
  baseUrl: string;
  onClose: () => void;
  onNewPassword: (account: CloudAccountRow) => void;
  onToggle: (account: CloudAccountRow) => void;
}) {
  const tr = useT();
  const tz = useTimeZone();
  const row = (label: string, value: React.ReactNode) => (
    <div className="flex items-start justify-between gap-3 py-2 text-sm">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 text-end">{value}</span>
    </div>
  );
  return (
    <Dialog open={account !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg" onOpenAutoFocus={(e) => e.preventDefault()}>
        {account && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Cloud className="size-4" /><span dir="ltr">{account.id}</span>
                {!account.enabled && <Badge variant="secondary">{tr('قطع')}</Badge>}
              </DialogTitle>
              <DialogDescription>
                {account.link ? tr('صاحب: {name}', { name: account.link.userName }) : tr('به هیچ عضوی وصل نیست.')}
              </DialogDescription>
            </DialogHeader>
            <section className="divide-y rounded-lg border px-3">
              {row(tr('نشانی'), <span dir="ltr"><CopyText value={baseUrl} /></span>)}
              {row(tr('نامِ کاربری'), <span dir="ltr"><CopyText value={account.id} /></span>)}
              {account.displayName !== account.id && row(tr('نامِ نمایشی'), account.displayName)}
              {account.email && row(tr('ایمیل'), <span dir="ltr">{account.email}</span>)}
              {row(tr('رمز'), account.link ? <SecretReveal grantId={account.link.grantId} /> : <span className="text-xs text-muted-foreground">{tr('در برنامه نیست — «رمزِ تازه» بگیرید.')}</span>)}
              {row(tr('حجم'), <QuotaEditor key={account.id} account={account} connectionId={connectionId} />)}
              {row(tr('آخرین ورود'), <span className="text-xs">{account.lastLogin ? <span className="num">{formatDate(new Date(account.lastLogin), tz)}</span> : tr('هرگز')}</span>)}
            </section>
            <ul className="grid list-disc gap-1 ps-4 text-xs text-muted-foreground">
              <li>{tr('اپِ Nextcloud برای ویندوز، مک، اندروید و iOS: نشانیِ بالا، همین نامِ کاربری و رمز.')}</li>
              <li>{tr('قطعِ حساب فایل‌ها را پاک نمی‌کند؛ فقط ورود و همگام‌سازی بسته می‌شود.')}</li>
            </ul>
            <DialogFooter className="gap-2 sm:justify-between">
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => onNewPassword(account)}><KeyRound className="size-3.5" />{tr('رمزِ تازه')}</Button>
                <Button size="sm" variant={account.enabled ? 'outline' : 'secondary'} onClick={() => onToggle(account)}>
                  {account.enabled ? <><Ban className="size-3.5" />{tr('قطعِ حساب')}</> : <><Power className="size-3.5" />{tr('وصلِ دوباره')}</>}
                </Button>
              </div>
              <Button size="sm" onClick={onClose}>{tr('بستن')}</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function QuotaEditor({ account, connectionId }: { account: CloudAccountRow; connectionId: number }) {
  const tr = useT();
  const { show } = useToast();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState<number | null>(account.quotaBytes);
  const [gb, setGb] = useState(String(account.quotaBytes ? Math.round(account.quotaBytes / 1024 ** 3 * 10) / 10 : 10));

  const save = () => {
    const n = Number(gb);
    if (!Number.isFinite(n) || n < 0.1 || n > 10000) { show(tr('حجم باید بینِ ۰٫۱ تا ۱۰۰۰۰ گیگابایت باشد.'), 'error'); return; }
    start(async () => {
      const result = await setCloudQuotaAction(connectionId, account.id, n);
      if (result.error) { show(tr(result.error, result.params), 'error'); return; }
      setSaved(Math.round(n * 10) / 10 * 1024 ** 3);
      setEditing(false);
      show(tr('حجم ذخیره شد.'), 'success');
    });
  };

  if (editing) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <Input
          type="number" min={0.1} max={10000} step="any" value={gb} onChange={(e) => setGb(e.target.value)}
          className="num h-8 w-24" aria-label={tr('حجم (گیگابایت)')} dir="ltr"
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } if (e.key === 'Escape') setEditing(false); }}
        />
        <span className="text-xs text-muted-foreground">GB</span>
        <Button size="sm" disabled={pending} onClick={save}>{tr('ذخیره')}</Button>
        <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>{tr('انصراف')}</Button>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-2">
      <span className="text-xs">
        <span className="num">{humanSize(account.usedBytes, tr)}</span> / {saved !== null ? <span className="num">{humanSize(saved, tr)}</span> : tr('بی‌سقف')}
      </span>
      <Button size="sm" variant="outline" onClick={() => setEditing(true)}><Pencil className="size-3.5" />{tr('تغییرِ حجم')}</Button>
    </span>
  );
}
