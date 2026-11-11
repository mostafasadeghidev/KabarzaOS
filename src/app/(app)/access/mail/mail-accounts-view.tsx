'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { AtSign, KeyRound, Lock, Mail, MailPlus, MoreHorizontal, Pencil, Sparkles } from 'lucide-react';
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
import { useToast } from '@/components/ui/toast';
import { humanSize } from '@/domain/files/upload';
import { useT } from '@/i18n/client';
import type { MailAccountRow, MailAccountsView as Data } from '@/server/corp-mail/accounts';
import {
  closeMailAccountAction, createMailAccountAction, linkMailAccountAction, resetMailPasswordAction, setMailAliasesAction,
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
  const [creating, setCreating] = useState(createFor !== null);
  /** رمزِ تازه یا صندوقِ تازه — مدیر یک بار ببیند و تحویل دهد. */
  const [handover, setHandover] = useState<{ grantId: number; address: string } | null>(null);

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

  const resetPassword = async (account: MailAccountRow) => {
    if (!await confirm({
      title: tr('رمزِ تازه برای {address}؟', { address: account.emailAddress }),
      description: tr('رمزِ فعلی و همهٔ ورودهای گوشی و Outlook و اتصالِ صندوق در همین برنامه باطل می‌شوند. رمزِ تازه در «دسترسی‌های من» ِ کارمند دیده می‌شود.'),
      confirmLabel: tr('رمزِ تازه'),
      destructive: true,
    })) return;
    start(async () => {
      const result = await resetMailPasswordAction(account.id);
      if (result.error) { show(tr(result.error, result.params), 'error'); return; }
      show(tr('رمزِ تازه ساخته شد.'), 'success');
      if (result.grantId) setHandover({ grantId: result.grantId, address: account.emailAddress });
    });
  };

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
              <TableRow key={account.id}>
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
                <TableCell>
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
                <TableActionsCell>
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
                      {/* ⚠️ رمزِ تازه فقط برای صندوقِ وصل: رمز در ردیفِ دفترِ همان عضو می‌نشیند. */}
                      {account.link && (
                        <DropdownMenuItem onSelect={() => { void resetPassword(account); }}>
                          <KeyRound className="size-3.5" />{tr('رمزِ تازه')}
                        </DropdownMenuItem>
                      )}
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
      <CreateDialog
        open={creating}
        onOpenChange={setCreating}
        domain={data.domain}
        people={data.people.filter((p) => !linkedUsers.has(p.id))}
        initialUser={createFor}
        onCreated={(created) => { setCreating(false); setHandover(created); }}
      />
      <HandoverDialog value={handover} onClose={() => setHandover(null)} />
    </div>
  );
}

/** صندوقِ تازه: عضو، نامِ پیش از @ و aliasهای اختیاری. */
function CreateDialog({ open, onOpenChange, domain, people, initialUser, onCreated }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  domain: string;
  people: Array<{ id: number; name: string }>;
  initialUser: number | null;
  onCreated: (created: { grantId: number; address: string }) => void;
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
      if (state.grantId && state.address) {
        show(tr('صندوقِ {address} ساخته شد.', { address: state.address }), 'success');
        onCreated({ grantId: state.grantId, address: state.address });
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
            {tr('حساب روی سرورِ ایمیل با رمزِ تصادفی ساخته می‌شود و رمز در «دسترسی‌های من» ِ کارمند دیده می‌شود.')}
          </DialogDescription>
        </DialogHeader>
        <form key={`${open}-${fallbackUser}`} onSubmit={submit} className="grid gap-3">
          <Field>
            <FieldLabel htmlFor="cm-user">{tr('عضو')}</FieldLabel>
            <SearchableSelect id="cm-user" name="userId" defaultValue={fallbackUser} containerClassName="w-full" required renderMedia={avatarFor(people)}>
              <NativeSelectOption value="">{tr('— انتخاب —')}</NativeSelectOption>
              {people.map((p) => <NativeSelectOption key={p.id} value={String(p.id)}>{p.name}</NativeSelectOption>)}
            </SearchableSelect>
            <FieldDescription>{tr('فقط اعضای فعالی که صندوق ندارند.')}</FieldDescription>
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

/** پس از ساختن یا رمزِ تازه: نشانی و رمز (پشتِ چشم، با ثبتِ دیدن) برای تحویل. */
function HandoverDialog({ value, onClose }: { value: { grantId: number; address: string } | null; onClose: () => void }) {
  const tr = useT();
  return (
    <Dialog open={value !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{tr('صندوق آماده است')}</DialogTitle>
          <DialogDescription>
            {tr('کارمند همین نشانی و رمز را در «پروفایل ← دسترسی‌های من» می‌بیند. رمز را از راهِ پیامِ بیرونی نفرستید.')}
          </DialogDescription>
        </DialogHeader>
        {value && (
          <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">{tr('نشانی')}</dt>
            <dd dir="ltr" className="text-start font-medium">{value.address}</dd>
            <dt className="text-muted-foreground">{tr('رمز')}</dt>
            <dd><SecretReveal grantId={value.grantId} /></dd>
          </dl>
        )}
        <DialogFooter>
          <Button onClick={onClose}>{tr('بستن')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
