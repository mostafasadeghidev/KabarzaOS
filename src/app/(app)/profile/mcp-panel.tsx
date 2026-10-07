'use client';

import { useActionState, useState, useTransition } from 'react';
import { useFormStatus } from 'react-dom';
import { Check, Copy, KeyRound, Trash2, TriangleAlert } from 'lucide-react';
import { createTokenAction, revokeTokenAction, type McpTokenState } from './_form/mcp-actions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Input } from '@/components/ui/input';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Spinner } from '@/components/ui/spinner';
import {
  Table, TableActionsCell, TableActionsHead, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { useConfirm } from '@/components/ui/confirm';
import { useToast } from '@/components/ui/toast';
import { Panel } from '@/components/page-shell';
import { useT, useTimeZone } from '@/i18n/client';
import { formatDateTime } from '@/i18n/datetime';

export interface McpTokenView {
  id: number;
  name: string;
  prefix: string;
  scopes: string[];
  lastUsedAt: Date | string | null;
  createdAt: Date | string;
}

function Submit({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return <Button type="submit" size="sm" disabled={pending}>{pending ? <Spinner /> : <KeyRound className="size-3.5" />}{children}</Button>;
}

/** جعبهٔ متنِ قابلِ کپی — توکن و دستورهای اتصال. */
function CopyBlock({ text, label }: { text: string; label: string }) {
  const tr = useT();
  const [copied, setCopied] = useState(false);
  return (
    <div className="grid gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="flex items-start gap-2 rounded-lg border bg-muted/40 p-2">
        <code dir="ltr" className="min-w-0 flex-1 text-xs break-all whitespace-pre-wrap">{text}</code>
        <IconButton
          variant="ghost" className="size-7 shrink-0" label={tr('کپی')}
          onClick={async () => {
            try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* بی‌دسترسی به کلیپ‌بورد */ }
          }}
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        </IconButton>
      </div>
    </div>
  );
}

/**
 * «Claude (MCP)» در پروفایل (۲.۷.۰) — توکنِ شخصی برای وصل‌کردنِ Claude به
 * برنامه، و دستورِ آمادهٔ اتصال.
 *
 * ⚠️ توکن **فقط یک بار** نشان داده می‌شود (دیتابیس فقط هشش را دارد)؛ پس از
 * بستنِ این صفحه دیگر قابلِ دیدن نیست — فقط باطل‌کردن و ساختنِ تازه.
 */
export function McpPanel({ tokens, endpoint }: { tokens: McpTokenView[]; endpoint: string }) {
  const tr = useT();
  const tz = useTimeZone();
  const confirm = useConfirm();
  const { show } = useToast();
  const [state, create] = useActionState<McpTokenState, FormData>(createTokenAction, {});
  const [pending, startTransition] = useTransition();

  const revoke = async (t: McpTokenView) => {
    if (!(await confirm({
      title: tr('این توکن باطل شود؟'),
      description: tr('هر جایی که با این توکن وصل شده (Claude Code، دسکتاپ و …) دیگر کار نمی‌کند.'),
    }))) return;
    startTransition(async () => {
      const result = await revokeTokenAction(t.id);
      show(tr(result.error ?? 'توکن باطل شد.'), result.error ? 'error' : 'success');
    });
  };

  const token = state.token;
  const codeCmd = token
    ? `claude mcp add --transport http kabarza ${endpoint} --header "Authorization: Bearer ${token}"`
    : '';
  const desktopJson = token
    ? JSON.stringify({
      mcpServers: {
        kabarza: {
          command: 'npx',
          args: ['-y', 'mcp-remote', endpoint, '--header', 'Authorization:${KABARZA_AUTH}'],
          env: { KABARZA_AUTH: `Bearer ${token}` },
        },
      },
    }, null, 2)
    : '';

  return (
    <div className="grid max-w-3xl gap-4">
      <Panel title={tr('اتصال به Claude (MCP)')}>
        <p className="text-sm text-muted-foreground">
          {tr('با یک توکنِ شخصی، Claude (در Claude Code یا اپِ دسکتاپ) به همین برنامه وصل می‌شود: تسک‌هایتان را می‌بیند، ساعت ثبت می‌کند، تسک می‌سازد و … — دقیقاً با همان دسترسی‌هایی که خودتان دارید، نه بیشتر.')}
        </p>

        <form key={token ?? 'new'} action={create} className="flex flex-wrap items-end gap-2 rounded-xl border bg-card p-3">
          <Field className="min-w-48 flex-1">
            <FieldLabel htmlFor="mcp-name">{tr('نامِ توکن')}</FieldLabel>
            <Input id="mcp-name" name="name" placeholder={tr('مثلاً: لپ‌تاپِ کار')} required maxLength={80} />
          </Field>
          <Field className="w-56">
            <FieldLabel htmlFor="mcp-scope">{tr('دسترسی')}</FieldLabel>
            <NativeSelect id="mcp-scope" name="scope" defaultValue="read" containerClassName="w-full">
              <NativeSelectOption value="read">{tr('فقط خواندن')}</NativeSelectOption>
              <NativeSelectOption value="write">{tr('خواندن و نوشتن')}</NativeSelectOption>
            </NativeSelect>
          </Field>
          <Submit>{tr('ساختنِ توکن')}</Submit>
          <FieldDescription className="w-full">
            {tr('«خواندن و نوشتن» یعنی Claude می‌تواند ساعت ثبت کند، تایمر بزند، تسک بسازد، وضعیتِ تسک را عوض کند و کامنت بگذارد. کارهای مالی، حذف و دسترسی‌ها از این راه ممکن نیست.')}
          </FieldDescription>
        </form>
        {state.error && <p className="text-sm text-destructive">{tr(state.error)}</p>}

        {token && (
          <div className="grid gap-3 rounded-xl border border-amber-500/40 bg-amber-500/5 p-3">
            <p className="flex items-center gap-1.5 text-sm font-medium">
              <TriangleAlert className="size-4 text-amber-600" aria-hidden />
              {tr('توکن را همین حالا کپی کنید — دیگر نمایش داده نمی‌شود.')}
            </p>
            <CopyBlock label={tr('توکن')} text={token} />
            <CopyBlock label={tr('Claude Code — این دستور را در ترمینال اجرا کنید')} text={codeCmd} />
            <CopyBlock label={tr('اپِ دسکتاپِ Claude — به claude_desktop_config.json اضافه کنید (Node.js لازم است)')} text={desktopJson} />
          </div>
        )}
      </Panel>

      <Panel title={tr('توکن‌های من')}>
        {tokens.length === 0 ? (
          <p className="text-sm text-muted-foreground">{tr('هنوز توکنی نساخته‌اید.')}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{tr('نام')}</TableHead>
                <TableHead>{tr('دسترسی')}</TableHead>
                <TableHead>{tr('آخرین استفاده')}</TableHead>
                <TableHead>{tr('ساخته‌شده')}</TableHead>
                <TableActionsHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {tokens.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>
                    <span className="grid">
                      <span className="font-medium">{t.name}</span>
                      <code dir="ltr" className="text-xs text-muted-foreground">{t.prefix}…</code>
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant={t.scopes.includes('write') ? 'warning' : 'secondary'}>
                      {t.scopes.includes('write') ? tr('خواندن و نوشتن') : tr('فقط خواندن')}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs">{t.lastUsedAt ? <span className="num">{formatDateTime(t.lastUsedAt, tz)}</span> : tr('هرگز')}</TableCell>
                  <TableCell className="num text-xs">{formatDateTime(t.createdAt, tz)}</TableCell>
                  <TableActionsCell>
                    <IconButton
                      variant="ghost" className="size-8 text-muted-foreground hover:text-destructive"
                      label={tr('باطل‌کردن')} disabled={pending} onClick={() => revoke(t)}
                    >
                      <Trash2 className="size-3.5" />
                    </IconButton>
                  </TableActionsCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>
    </div>
  );
}
