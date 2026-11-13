'use client';

import { useEffect, useState, useTransition } from 'react';
import { AtSign, KeyRound, Mail, Pencil, XCircle } from 'lucide-react';
import { UserName } from '@/components/user-avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { CopyText } from '@/components/copy-text';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { useConfirm } from '@/components/ui/confirm';
import { useToast } from '@/components/ui/toast';
import { LEVEL_LABELS } from '@/domain/access/service-grants';
import { stateLabel } from '@/domain/people/offboarding';
import { humanSize } from '@/domain/files/upload';
import { formatDate } from '@/i18n/datetime';
import { useT, useTimeZone } from '@/i18n/client';
import { SecretReveal } from './secret-reveal';
import { mailboxOfGrantAction, resetMailPasswordAction, setMailAliasesAction } from './_form/actions';
import type { GrantRow } from './access-view';

type Mailbox = {
  accountId: string; address: string; aliases: string[]; otherAliases: string[];
  usedBytes: number; quotaBytes: number | null;
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2 text-sm">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 text-end">{children}</span>
    </div>
  );
}

/**
 * جزئیاتِ یک ردیفِ دفترِ دسترسی (۳.۱.۰) — با کلیک روی ردیف.
 *
 * اگر ردیف مالِ ایمیلِ شرکتی است، بخشِ «ایمیل‌های این شخص» زنده از سرورِ ایمیل
 * خوانده می‌شود: نشانیِ اصلی، نشانی‌های دیگر و حجم، با رمزِ تازه و ویرایشِ نشانی‌ها
 * همین‌جا. صندوق‌های قبلیِ همین شخص (بسته‌شده) هم از خودِ دفتر می‌آیند.
 */
export function GrantDetailsDialog({
  row, serviceName, isMail, canManage, history, onClose, onEdit, onRevoke,
}: {
  row: GrantRow | null;
  serviceName: string;
  isMail: boolean;
  canManage: boolean;
  /** ردیف‌های دیگرِ همین شخص روی همین سرویس — مثلاً صندوقِ قبلی. */
  history: GrantRow[];
  onClose: () => void;
  onEdit: (row: GrantRow) => void;
  onRevoke: (row: GrantRow) => void;
}) {
  const tr = useT();
  const tz = useTimeZone();
  const open = row !== null;
  const former = row ? stateLabel(row.memberState) : null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      {/* ⚠️ فوکوسِ خودکار روی اولین «کپی» راهنمایش را بی‌دلیل باز می‌کرد؛ فوکوس روی خودِ پنجره می‌ماند. */}
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg" onOpenAutoFocus={(e) => e.preventDefault()}>
        {row && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {isMail ? <Mail className="size-4" /> : <KeyRound className="size-4" />}
                {serviceName}
              </DialogTitle>
              <DialogDescription className="flex flex-wrap items-center gap-2">
                <UserName userId={row.userId} name={row.userName} size="sm" />
                {former && <Badge variant="outline">{tr(former)}</Badge>}
                {row.revokedAt === null
                  ? <Badge variant="success">{tr('باز')}</Badge>
                  : <Badge variant="outline">{tr('قطع‌شده')}</Badge>}
              </DialogDescription>
            </DialogHeader>

            <section className="divide-y rounded-lg border px-3">
              <Row label={tr('سطح')}>
                <Badge variant={row.level === 'admin' ? 'default' : 'secondary'}>{tr(LEVEL_LABELS[row.level])}</Badge>
              </Row>
              <Row label={isMail ? tr('نشانی') : tr('شناسهٔ حساب')}>
                {row.accountRef ? <span dir="ltr"><CopyText value={row.accountRef} /></span> : '—'}
              </Row>
              {canManage && (
                <Row label={tr('رمز')}>
                  {row.hasSecret ? <SecretReveal grantId={row.id} /> : <span className="text-muted-foreground">{tr('ثبت نشده')}</span>}
                </Row>
              )}
              {row.vaultRef && <Row label={tr('جای رمز در گاوصندوق')}><span dir="auto">{row.vaultRef}</span></Row>}
              <Row label={tr('از تاریخ')}><span className="num">{formatDate(row.grantedAt, tz)}</span></Row>
              {row.revokedAt !== null && <Row label={tr('تاریخِ قطع')}><span className="num">{formatDate(row.revokedAt, tz)}</span></Row>}
              {row.note && <Row label={tr('یادداشت')}><span className="whitespace-pre-wrap" dir="auto">{row.note}</span></Row>}
            </section>

            {isMail && canManage && row.revokedAt === null && <MailboxSection grantId={row.id} />}

            {history.length > 0 && (
              <section className="grid gap-1.5">
                <h3 className="text-sm font-medium">{isMail ? tr('صندوق‌های قبلیِ این شخص') : tr('ردیف‌های دیگرِ همین سرویس')}</h3>
                <ul className="grid gap-1 text-xs">
                  {history.map((h) => (
                    <li key={h.id} className="flex flex-wrap items-center gap-2 rounded-md border px-2 py-1.5">
                      <span dir="ltr" className="font-medium">{h.accountRef || '—'}</span>
                      <span className="num text-muted-foreground">
                        {formatDate(h.grantedAt, tz)}{h.revokedAt ? ` – ${formatDate(h.revokedAt, tz)}` : ''}
                      </span>
                      {h.revokedAt === null
                        ? <Badge variant="success">{tr('باز')}</Badge>
                        : <Badge variant="outline">{tr('قطع‌شده')}</Badge>}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <DialogFooter className="gap-2 sm:justify-between">
              {canManage && row.revokedAt === null ? (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => onEdit(row)}><Pencil className="size-3.5" />{tr('ویرایش')}</Button>
                  <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" onClick={() => onRevoke(row)}>
                    <XCircle className="size-3.5" />{isMail ? tr('بستنِ صندوق') : tr('قطعِ دسترسی')}
                  </Button>
                </div>
              ) : <span />}
              <Button size="sm" onClick={onClose}>{tr('بستن')}</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** «ایمیل‌های این شخص» — زنده از سرورِ ایمیل، با رمزِ تازه و ویرایشِ نشانی‌ها. */
function MailboxSection({ grantId }: { grantId: number }) {
  const tr = useT();
  const { show } = useToast();
  const confirm = useConfirm();
  const [pending, start] = useTransition();
  const [box, setBox] = useState<Mailbox | null>(null);
  const [error, setError] = useState<{ text: string; params: Record<string, string> } | null>(null);
  const [editing, setEditing] = useState(false);
  const [aliases, setAliases] = useState('');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let alive = true;
    setError(null);
    void mailboxOfGrantAction(grantId).then((r) => {
      if (!alive) return;
      if (r.ok) { setBox(r.mailbox); setAliases(r.mailbox.aliases.map((a) => a.replace(/@.*$/, '')).join(', ')); }
      else setError({ text: r.error, params: r.params });
    });
    return () => { alive = false; };
  }, [grantId, reload]);

  const newPassword = async () => {
    if (!box) return;
    if (!await confirm({
      title: tr('رمزِ تازه برای {address}؟', { address: box.address }),
      description: tr('رمزِ فعلی و همهٔ ورودهای گوشی و Outlook و اتصالِ صندوق در همین برنامه باطل می‌شوند. رمزِ تازه در «دسترسی‌های من» ِ کارمند دیده می‌شود.'),
      confirmLabel: tr('رمزِ تازه'),
      destructive: true,
    })) return;
    start(async () => {
      const result = await resetMailPasswordAction(box.accountId);
      if (result.error) show(tr(result.error, result.params), 'error');
      else show(tr('رمزِ تازه ساخته شد؛ با دکمهٔ چشمِ «رمز» ببینید.'), 'success');
    });
  };

  const saveAliases = () => {
    if (!box) return;
    start(async () => {
      const result = await setMailAliasesAction(box.accountId, aliases);
      if (result.error) { show(tr(result.error, result.params), 'error'); return; }
      show(tr('نشانی‌ها ذخیره شد.'), 'success');
      setEditing(false);
      setReload((n) => n + 1);
    });
  };

  return (
    <section className="grid gap-2">
      <h3 className="flex items-center gap-1.5 text-sm font-medium"><AtSign className="size-4" />{tr('ایمیل‌های این شخص')}</h3>
      {error ? (
        <p className="text-xs text-destructive">{tr(error.text, error.params)}</p>
      ) : !box ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground"><Spinner />{tr('در حالِ خواندن از سرورِ ایمیل…')}</p>
      ) : (
        <>
          <ul className="flex flex-wrap gap-1.5" dir="ltr">
            <li className="rounded-md border bg-primary/10 px-2 py-0.5 text-xs font-medium"><CopyText value={box.address} /></li>
            {[...box.aliases, ...box.otherAliases].map((a) => (
              <li key={a} className="rounded-md border bg-muted/40 px-2 py-0.5 text-xs"><CopyText value={a} /></li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            {tr('اولی نشانیِ اصلی است؛ ایمیلِ همهٔ این نشانی‌ها به همین یک صندوق می‌رسد.')}
            {' · '}
            <span className="num">{humanSize(box.usedBytes, tr)}{box.quotaBytes ? ` / ${humanSize(box.quotaBytes, tr)}` : ''}</span>
          </p>
          {editing ? (
            <div className="grid gap-1.5">
              <Input value={aliases} onChange={(e) => setAliases(e.target.value)} dir="ltr" placeholder="sales, sara.ahmadi" aria-label={tr('aliasها')} />
              <p className="text-xs text-muted-foreground">{tr('فقط بخشِ پیش از @، جداشده با ویرگول. خالی = هیچ alias.')}</p>
              <div className="flex gap-2">
                <Button size="sm" disabled={pending} onClick={saveAliases}>{tr('ذخیره')}</Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>{tr('انصراف')}</Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" disabled={pending} onClick={() => setEditing(true)}>
                <Pencil className="size-3.5" />{tr('ویرایشِ نشانی‌های دیگر')}
              </Button>
              <Button size="sm" variant="outline" disabled={pending} onClick={() => { void newPassword(); }}>
                <KeyRound className="size-3.5" />{tr('رمزِ تازه')}
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
