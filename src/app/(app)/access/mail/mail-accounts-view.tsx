'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { AtSign, ExternalLink, KeyRound, Lock, Mail, MailPlus, MoreHorizontal, Pencil, Smartphone, Sparkles } from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { useConfirm } from '@/components/ui/confirm';
import { SecretReveal } from '../secret-reveal';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { EmptyState } from '@/components/ui/empty-state';
import { Textarea } from '@/components/ui/textarea';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { NativeSelectOption } from '@/components/ui/native-select';
import { SearchableSelect } from '@/components/ui/searchable-select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Table, TableActionsCell, TableActionsHead, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { avatarFor } from '@/components/user-avatar';
import { CopyText } from '@/components/copy-text';
import { NewPasswordDialog } from './new-password-dialog';
import { useToast } from '@/components/ui/toast';
import { humanSize } from '@/domain/files/upload';
import { useT } from '@/i18n/client';
import type { MailAccountRow, MailAccountsView as Data } from '@/server/corp-mail/accounts';
import {
  closeMailAccountAction, createMailAccountAction, linkMailAccountAction, resetMailPasswordAction, setMailAliasesAction,
  setMailQuotaAction, revealSharedMailSecretAction,
} from '../_form/actions';

/**
 * فهرستِ صندوق‌های سرورِ ایمیل و جفت‌کردنشان با اعضا (۲.۶۰.۰).
 *
 * ⚠️ انتخابِ عضو بی‌درنگ ذخیره می‌شود (مثلِ تیکِ چک‌لیست)؛ جداکردن ردیفِ دفتر
 * را قطع می‌کند و تاریخچه می‌ماند. خودِ صندوق روی سرور دست نمی‌خورد.
 */
const ERRORS: Record<string, string> = {
  no_domain: 'دامنهٔ ایمیل تنظیم نشده یا روی سرورِ ایمیل پیدا نشد.',
  not_configured: 'ایمیلِ شرکتی وصل نیست؛ در تنظیمات اتصال را بررسی کنید.',
  stalwart: 'سرورِ ایمیل پاسخ نداد؛ کمی بعد دوباره امتحان کنید.',
};

export function MailAccountsView({ data, createFor = null }: {
  data: Data;
  /** `?create=` — از منوی کارتِ عضو، دیالوگِ ساختن روی همان عضو باز می‌شود. */
  createFor?: number | null;
}) {
  const tr = useT();
  const { show } = useToast();
  const confirm = useConfirm();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<MailAccountRow | null>(null);
  /** «رمزِ تازه» (۳.۳.۰) — پنجرهٔ خودکار/دستی. */
  const [pwTarget, setPwTarget] = useState<MailAccountRow | null>(null);
  /** صندوقی که پنجرهٔ جزئیاتش باز است (۳.۲.۰) — با کلیک روی ردیف. */
  const [detail, setDetail] = useState<MailAccountRow | null>(null);
  const [creating, setCreating] = useState(createFor !== null);
  /** رمزِ تازه یا صندوقِ تازه — مدیر یک بار ببیند و تحویل دهد. */
  const [handover, setHandover] = useState<Handover | null>(null);

  if (!data.configured || data.error) {
    return (
      <EmptyState
        icon={<Mail className="size-5" />}
        title={tr(data.configured ? (ERRORS[data.error ?? ''] ?? ERRORS.stalwart!) : ERRORS.not_configured!)}
        description={tr('تنظیمِ اتصال در «تنظیمات ← ایمیلِ شرکتی» است و فقط مالک آن را می‌بیند.')}
      >
        <Button size="sm" variant="outline" asChild><Link href="/settings?tab=corpmail">{tr('تنظیمات')}</Link></Button>
      </EmptyState>
    );
  }

  const link = (account: MailAccountRow, value: string) => {
    const userId = value ? Number(value) : null;
    start(async () => {
      const result = await linkMailAccountAction(account.id, userId);
      if (result.error) show(tr(result.error, result.params), 'error');
      else show(tr(userId ? 'صندوق به عضو وصل شد.' : 'صندوق از عضو جدا شد.'), 'success');
    });
  };

  /** «رمزِ تازه» — پنجرهٔ خودکار/دستی (۳.۳.۰)؛ نتیجه در پنجرهٔ تحویل. */
  const resetPassword = async (account: MailAccountRow) => { setPwTarget(account); };

  const close = async (account: MailAccountRow) => {
    if (!await confirm({
      title: tr('صندوقِ {address} بسته شود؟', { address: account.emailAddress }),
      description: tr('رمز به مقداری نامعلوم عوض می‌شود و نشانی‌های دیگرش خاموش می‌شوند؛ دیگر کسی نمی‌تواند واردش شود. ایمیل‌های قبلی پاک نمی‌شوند و پاک‌کردنِ نهایی کارِ دستیِ مدیرِ سرورِ ایمیل است.'),
      confirmLabel: tr('بستنِ صندوق'),
      destructive: true,
    })) return;
    start(async () => {
      const result = await closeMailAccountAction(account.id);
      if (result.error) show(tr(result.error, result.params), 'error');
      else show(tr('صندوق بسته شد.'), 'success');
    });
  };

  const linked = data.accounts.filter((a) => a.link).length;
  const linkedUsers = new Set(data.accounts.flatMap((a) => (a.link ? [a.link.userId] : [])));

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex-1 text-sm text-muted-foreground">
          {tr('{n} صندوق روی سرور · {m} وصل به عضو', { n: data.accounts.length, m: linked })}
        </p>
        <Button size="sm" onClick={() => setCreating(true)}>
          <MailPlus className="size-4" />
          {tr('صندوقِ تازه')}
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{tr('نشانی')}</TableHead>
            <TableHead>{tr('نشانی‌های دیگر')}</TableHead>
            <TableHead>{tr('حجم')}</TableHead>
            <TableHead>{tr('عضو')}</TableHead>
            <TableActionsHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.accounts.map((account) => {
            const suggested = account.suggestedUserId !== null
              ? data.people.find((p) => p.id === account.suggestedUserId) : null;
            return (
              // ۳.۲.۰ — کلیک روی ردیف = جزئیات و راهنمای اتصال؛ انتخابگر و منو کلیکِ خودشان را دارند.
              <TableRow
                key={account.id}
                className="cursor-pointer"
                tabIndex={0}
                onClick={() => setDetail(account)}
                onKeyDown={(e) => { if (e.key === 'Enter' && e.target === e.currentTarget) setDetail(account); }}
              >
                <TableCell>
                  <div className="font-medium" dir="ltr">{account.emailAddress}</div>
                  {account.description && <div className="text-xs text-muted-foreground">{account.description}</div>}
                </TableCell>
                <TableCell className="max-w-72 whitespace-normal">
                  <div className="flex flex-wrap gap-1" dir="ltr">
                    {account.aliases.map((a) => <Badge key={a} variant="secondary">{a}@{data.domain}</Badge>)}
                    {account.otherAliases.map((a) => <Badge key={a} variant="outline" className="text-muted-foreground">{a}</Badge>)}
                    {account.aliases.length + account.otherAliases.length === 0 && <span className="text-muted-foreground">—</span>}
                  </div>
                </TableCell>
                <TableCell className="num text-xs whitespace-nowrap">
                  {humanSize(account.usedBytes, tr)}
                  {account.quotaBytes ? <span className="text-muted-foreground"> / {humanSize(account.quotaBytes, tr)}</span> : null}
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <div className="grid gap-1">
                    <SearchableSelect
                      value={account.link ? String(account.link.userId) : ''}
                      onValueChange={(v) => link(account, v)}
                      size="sm"
                      containerClassName="w-48"
                      disabled={pending}
                      aria-label={tr('عضوِ صاحبِ صندوق')}
                      renderMedia={avatarFor(data.people)}
                    >
                      <NativeSelectOption value="">{tr('— بی عضو —')}</NativeSelectOption>
                      {data.people.map((p) => (
                        <NativeSelectOption key={p.id} value={String(p.id)}>{p.name}</NativeSelectOption>
                      ))}
                    </SearchableSelect>
                    {suggested && (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => link(account, String(suggested.id))}
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
                      <IconButton variant="ghost" size="icon-sm" label={tr('کارهای این صندوق')} disabled={pending}>
                        <MoreHorizontal className="size-4" />
                      </IconButton>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => setEditing(account)}>
                        <Pencil className="size-3.5" />{tr('ویرایشِ نشانی‌های دیگر')}
                      </DropdownMenuItem>
                      {/*
                        رمزِ تازه: صندوقِ وصل ← در دفترِ همان عضو؛ صندوقِ بی‌صاحب ← فقط یک بار
                        به مدیر نشان داده می‌شود (۲.۶۷.۰). حسابِ محافظت‌شده را سرور رد می‌کند.
                      */}
                      <DropdownMenuItem onSelect={() => { void resetPassword(account); }}>
                        <KeyRound className="size-3.5" />{tr('رمزِ تازه')}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" onSelect={() => { void close(account); }}>
                        <Lock className="size-3.5" />{tr('بستنِ صندوق')}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableActionsCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <AliasDialog account={editing} domain={data.domain} onClose={() => setEditing(null)} />
      <MailboxDetailsDialog
        account={detail}
        domain={data.domain}
        setup={data.setup}
        onClose={() => setDetail(null)}
        onEditAliases={(a) => { setDetail(null); setEditing(a); }}
        onNewPassword={(a) => { setDetail(null); void resetPassword(a); }}
      />
      <CreateDialog
        open={creating}
        onOpenChange={setCreating}
        domain={data.domain}
        people={data.people.filter((p) => !linkedUsers.has(p.id))}
        initialUser={createFor}
        onCreated={(created) => { setCreating(false); setHandover(created); }}
      />
      <HandoverDialog value={handover} onClose={() => setHandover(null)} />
      <NewPasswordDialog
        target={pwTarget ? { accountId: pwTarget.id, address: pwTarget.emailAddress, linked: pwTarget.link !== null } : null}
        onClose={() => setPwTarget(null)}
        onDone={(r) => {
          const address = pwTarget?.emailAddress ?? '';
          if (r.grantId || r.password) setHandover({ grantId: r.grantId, address, password: r.password });
        }}
      />
    </div>
  );
}

/** آنچه پس از ساختن یا رمزِ تازه به مدیر نشان داده می‌شود. */
type Handover = {
  /** ردیفِ دفترِ عضو — رمز پشتِ چشم؛ `null` برای صندوقِ بی‌صاحب. */
  grantId: number | null;
  address: string;
  /** فقط صندوقِ بی‌صاحب: رمزی که هیچ‌جا ذخیره نشده و همین یک بار دیده می‌شود. */
  password?: string;
};

/** صندوقِ تازه: عضو (یا بی‌صاحب)، نامِ پیش از @ و aliasهای اختیاری. */
function CreateDialog({ open, onOpenChange, domain, people, initialUser, onCreated }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  domain: string;
  people: Array<{ id: number; name: string }>;
  initialUser: number | null;
  onCreated: (created: Handover) => void;
}) {
  const tr = useT();
  const { show } = useToast();
  const [pending, start] = useTransition();

  /**
   * ⚠️ onSubmit، نه `action`: React 19 فرمِ کنترل‌نشده را پس از هر اکشن خالی
   * می‌کند و مدیر پس از خطای «نام گرفته است» باید همه‌چیز را دوباره می‌نوشت.
   */
  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    start(async () => {
      const state = await createMailAccountAction({}, form);
      if (state.error) { show(tr(state.error, state.params), 'error'); return; }
      if (state.address && (state.grantId || state.password)) {
        show(tr('صندوقِ {address} ساخته شد.', { address: state.address }), 'success');
        onCreated({ grantId: state.grantId ?? null, address: state.address, password: state.password });
      }
    });
  };

  const fallbackUser = initialUser !== null && people.some((p) => p.id === initialUser) ? String(initialUser) : '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><MailPlus className="size-4" />{tr('صندوقِ تازه')}</DialogTitle>
          <DialogDescription>
            {tr('حساب روی سرورِ ایمیل با رمزِ تصادفی ساخته می‌شود و رمز در «دسترسی‌های من» ِ کارمند دیده می‌شود. صندوقِ بی‌صاحب (مثلاً noreply) را کسی در برنامه نمی‌بیند؛ رمزش در همین صفحه پشتِ دکمهٔ چشم می‌ماند.')}
          </DialogDescription>
        </DialogHeader>
        <form key={`${open}-${fallbackUser}`} onSubmit={submit} className="grid gap-3">
          <Field>
            <FieldLabel htmlFor="cm-user">{tr('عضو')}</FieldLabel>
            <SearchableSelect id="cm-user" name="userId" defaultValue={fallbackUser} containerClassName="w-full" required renderMedia={avatarFor(people)}>
              <NativeSelectOption value="">{tr('— انتخاب —')}</NativeSelectOption>
              <NativeSelectOption value="shared">{tr('بی‌صاحب (صندوقِ مشترک، مثلاً noreply)')}</NativeSelectOption>
              {people.map((p) => <NativeSelectOption key={p.id} value={String(p.id)}>{p.name}</NativeSelectOption>)}
            </SearchableSelect>
            <FieldDescription>{tr('فقط اعضای فعالی که صندوق ندارند. صندوقِ بی‌صاحب را بعداً هم می‌شود به عضوی وصل کرد.')}</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="cm-local">{tr('نشانی')}</FieldLabel>
            <div className="flex items-center gap-1.5" dir="ltr">
              <Input id="cm-local" name="local" required autoComplete="off" placeholder="sara" className="flex-1" />
              <span className="text-sm text-muted-foreground">@{domain}</span>
            </div>
          </Field>
          <Field>
            <FieldLabel htmlFor="cm-aliases">{tr('aliasها')}</FieldLabel>
            <Input id="cm-aliases" name="aliases" dir="ltr" autoComplete="off" placeholder="sara.ahmadi, sales" />
            <FieldDescription>{tr('اختیاری؛ فقط بخشِ پیش از @، جداشده با ویرگول.')}</FieldDescription>
          </Field>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>{tr('انصراف')}</Button>
            <Button type="submit" disabled={pending}>{tr('ساختن')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * پس از ساختن یا رمزِ تازه: نشانی و رمز برای تحویل.
 *  · صندوقِ عضو: رمز پشتِ چشم (با ثبتِ دیدن) از ردیفِ دفتر.
 *  · صندوقِ بی‌صاحب (۲.۶۷.۰): رمز همین‌جا و فقط همین یک بار — هیچ‌جا ذخیره نشده.
 */
function HandoverDialog({ value, onClose }: { value: Handover | null; onClose: () => void }) {
  const tr = useT();
  const shared = value !== null && value.grantId === null;
  return (
    <Dialog open={value !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{tr('صندوق آماده است')}</DialogTitle>
          <DialogDescription>
            {shared
              ? tr('این صندوق صاحبی ندارد. رمز رمزگذاری‌شده در برنامه می‌ماند و هر وقت لازم شد از پنجرهٔ همین صندوق (دکمهٔ چشم) دیده می‌شود.')
              : tr('کارمند همین نشانی و رمز را در «پروفایل ← دسترسی‌های من» می‌بیند. رمز را از راهِ پیامِ بیرونی نفرستید.')}
          </DialogDescription>
        </DialogHeader>
        {value && (
          <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">{tr('نشانی')}</dt>
            <dd dir="ltr" className="text-start font-medium">{value.address}</dd>
            <dt className="text-muted-foreground">{tr('رمز')}</dt>
            <dd>
              {value.grantId !== null
                ? <SecretReveal grantId={value.grantId} />
                : value.password
                  ? <span dir="ltr" className="font-mono"><CopyText value={value.password} /></span>
                  : '—'}
            </dd>
          </dl>
        )}
        <DialogFooter>
          <Button onClick={onClose}>{tr('بستن')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * جزئیاتِ یک صندوق (۳.۲.۰): نشانی‌ها، صاحب، حجم و راهنمای اتصال در گوشی، Outlook یا
 * SMTP ِ برنامه‌های دیگر — همان راهنمای «دسترسی‌های من» ِ کارمند.
 *
 * ⚠️ رمز: صندوقِ وصل‌شده رمزش را در دفترِ صاحبش دارد (دکمهٔ چشم). صندوقِ بی‌صاحب رمزی
 * در برنامه ندارد؛ اگر گم شده، «رمزِ تازه» یک بار نشانش می‌دهد.
 */
function MailboxDetailsDialog({ account, domain, setup, onClose, onEditAliases, onNewPassword }: {
  account: MailAccountRow | null;
  domain: string;
  setup: Data['setup'];
  onClose: () => void;
  onEditAliases: (account: MailAccountRow) => void;
  onNewPassword: (account: MailAccountRow) => void;
}) {
  const tr = useT();
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
              <DialogTitle className="flex items-center gap-2"><Mail className="size-4" /><span dir="ltr">{account.emailAddress}</span></DialogTitle>
              <DialogDescription>
                {account.link ? tr('صاحب: {name}', { name: account.link.userName }) : tr('بی‌صاحب — کسی در برنامه این صندوق را نمی‌بیند.')}
              </DialogDescription>
            </DialogHeader>

            <section className="divide-y rounded-lg border px-3">
              {row(tr('نشانی'), <span dir="ltr"><CopyText value={account.emailAddress} /></span>)}
              {row(tr('رمز'), account.link
                ? <SecretReveal grantId={account.link.grantId} />
                // ۳.۳.۰ — صندوقِ بی‌صاحب هم رمزش را (رمزگذاری‌شده) دارد؛ با هر دیدن ثبت می‌شود.
                : <SecretReveal load={() => revealSharedMailSecretAction(account.id)} />)}
              {row(tr('حجم'), <QuotaEditor account={account} />)}
            </section>

            <section className="grid gap-2">
              <h3 className="flex items-center gap-1.5 text-sm font-medium"><AtSign className="size-4" />{tr('نشانی‌های دیگرِ همین صندوق')}</h3>
              {account.aliases.length + account.otherAliases.length === 0 ? (
                <p className="text-xs text-muted-foreground">{tr('ندارد.')}</p>
              ) : (
                <ul className="flex flex-wrap gap-1.5" dir="ltr">
                  {account.aliases.map((a) => <li key={a} className="rounded-md border bg-muted/40 px-2 py-0.5 text-xs"><CopyText value={`${a}@${domain}`} /></li>)}
                  {account.otherAliases.map((a) => <li key={a} className="rounded-md border bg-muted/40 px-2 py-0.5 text-xs"><CopyText value={a} /></li>)}
                </ul>
              )}
            </section>

            {(setup.imapHost || setup.smtpHost) && (
              <section className="grid gap-2">
                <h3 className="flex items-center gap-1.5 text-sm font-medium"><Smartphone className="size-4" />{tr('تنظیم در گوشی، Outlook یا برنامه‌های دیگر')}</h3>
                <div className="divide-y rounded-lg border px-3">
                  {setup.imapHost && row(tr('دریافت (IMAP)'), <span dir="ltr" className="font-mono text-xs"><CopyText value={setup.imapHost} /> · {setup.imapPort} · SSL</span>)}
                  {setup.smtpHost && row(tr('ارسال (SMTP)'), <span dir="ltr" className="font-mono text-xs"><CopyText value={setup.smtpHost} /> · {setup.smtpPort} · SSL</span>)}
                  {row(tr('نامِ کاربری'), <span dir="ltr" className="text-xs"><CopyText value={account.emailAddress} /></span>)}
                </div>
                <ul className="grid list-disc gap-1 ps-4 text-xs text-muted-foreground">
                  <li>{tr('رمز همان رمزِ صندوق است. اگر ندارید، «رمزِ تازه» بگیرید؛ هر جا با رمزِ قبلی وصل است باید عوض شود.')}</li>
                  <li>{tr('برای ارسالِ ایمیل‌های این برنامه (دعوت، فراموشیِ رمز، اعلان‌ها) همین «ارسال (SMTP)» را با این نامِ کاربری و رمز در «تنظیمات ← اعلان‌ها» بگذارید.')}</li>
                </ul>
              </section>
            )}

            <DialogFooter className="gap-2 sm:justify-between">
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => onNewPassword(account)}><KeyRound className="size-3.5" />{tr('رمزِ تازه')}</Button>
                <Button size="sm" variant="outline" onClick={() => onEditAliases(account)}><Pencil className="size-3.5" />{tr('ویرایشِ نشانی‌های دیگر')}</Button>
                {setup.webmailUrl && (
                  <Button size="sm" variant="outline" asChild>
                    <a href={setup.webmailUrl} target="_blank" rel="noopener noreferrer"><ExternalLink className="size-3.5" />{tr('ورود به وب‌میل')}</a>
                  </Button>
                )}
              </div>
              <Button size="sm" onClick={onClose}>{tr('بستن')}</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** استفاده‌شده / سقف، با تغییرِ سقف به گیگابایت (۳.۲.۰). */
function QuotaEditor({ account }: { account: MailAccountRow }) {
  const tr = useT();
  const { show } = useToast();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const initial = account.quotaBytes ? Math.round(account.quotaBytes / 1024 ** 3 * 10) / 10 : 5;
  const [gb, setGb] = useState(String(initial));
  const [saved, setSaved] = useState<number | null>(account.quotaBytes);

  const save = () => {
    const n = Number(gb);
    if (!Number.isFinite(n) || n < 0.1 || n > 1000) { show(tr('حجم باید بینِ ۰٫۱ تا ۱۰۰۰ گیگابایت باشد.'), 'error'); return; }
    start(async () => {
      const result = await setMailQuotaAction(account.id, n);
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
          type="number" min={0.1} max={1000} step={0.5} value={gb} onChange={(e) => setGb(e.target.value)}
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
      <span className="num text-xs">
        {humanSize(account.usedBytes, tr)}{saved ? ` / ${humanSize(saved, tr)}` : ''}
      </span>
      <Button size="sm" variant="outline" onClick={() => setEditing(true)}><Pencil className="size-3.5" />{tr('تغییرِ حجم')}</Button>
    </span>
  );
}

function AliasDialog({ account, domain, onClose }: { account: MailAccountRow | null; domain: string; onClose: () => void }) {
  const tr = useT();
  const { show } = useToast();
  const [pending, start] = useTransition();

  const submit = (form: FormData) => {
    if (!account) return;
    start(async () => {
      const result = await setMailAliasesAction(account.id, String(form.get('aliases') ?? ''));
      if (result.error) { show(tr(result.error, result.params), 'error'); return; }
      show(tr('نشانی‌ها ذخیره شد.'), 'success');
      onClose();
    });
  };

  return (
    <Dialog open={account !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><AtSign className="size-4" />{tr('نشانی‌های دیگرِ این صندوق')}</DialogTitle>
          <DialogDescription dir="ltr" className="text-start">{account?.emailAddress}</DialogDescription>
        </DialogHeader>
        {account && (
          <form key={account.id} action={submit} className="grid gap-3">
            <Field>
              <FieldLabel htmlFor="aliases">{tr('aliasها')}</FieldLabel>
              <Textarea id="aliases" name="aliases" dir="ltr" rows={3} defaultValue={account.aliases.join(', ')} placeholder="sales, sara.ahmadi" />
              <FieldDescription>
                {tr('فقط بخشِ پیش از @، جداشده با ویرگول. ایمیلِ همهٔ این نشانی‌ها (@{domain}) به همین صندوق می‌رسد. خالی = هیچ alias.', { domain })}
              </FieldDescription>
            </Field>
            {account.otherAliases.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {tr('این‌ها دست نمی‌خورند:')} <span dir="ltr">{account.otherAliases.join('، ')}</span>
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={onClose}>{tr('انصراف')}</Button>
              <Button type="submit" disabled={pending}>{tr('ذخیره')}</Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
