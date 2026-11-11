'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { AtSign, Mail, Pencil, Sparkles } from 'lucide-react';
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
import { linkMailAccountAction, setMailAliasesAction } from '../_form/actions';

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

export function MailAccountsView({ data }: { data: Data }) {
  const tr = useT();
  const { show } = useToast();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<MailAccountRow | null>(null);

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

  const linked = data.accounts.filter((a) => a.link).length;

  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted-foreground">
        {tr('{n} صندوق روی سرور · {m} وصل به عضو', { n: data.accounts.length, m: linked })}
      </p>

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
                  <IconButton variant="ghost" size="icon-sm" label={tr('ویرایشِ نشانی‌های دیگر')} onClick={() => setEditing(account)}>
                    <Pencil className="size-3.5" />
                  </IconButton>
                </TableActionsCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <AliasDialog account={editing} domain={data.domain} onClose={() => setEditing(null)} />
    </div>
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
