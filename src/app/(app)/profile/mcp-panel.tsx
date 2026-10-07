'use client';

import { useActionState, useState, useTransition } from 'react';
import { useFormStatus } from 'react-dom';
import { Bot, Check, Copy, Globe, KeyRound, Link2Off, Trash2, TriangleAlert } from 'lucide-react';
import {
  createTokenAction, revokeGrantAction, revokeTokenAction, type McpTokenState,
} from './_form/mcp-actions';
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
import { cn } from '@/lib/utils';

export interface McpTokenView {
  id: number;
  name: string;
  prefix: string;
  scopes: string[];
  lastUsedAt: Date | string | null;
  createdAt: Date | string;
}

/** «اتصالِ وب» (OAuth) — اپی که کاربر در صفحهٔ «اجازه» تأییدش کرده. */
export interface McpGrantView {
  id: number;
  name: string;
  scopes: string[];
  lastUsedAt: Date | string | null;
  createdAt: Date | string;
}

function Submit({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return <Button type="submit" size="sm" disabled={pending}>{pending ? <Spinner /> : <KeyRound className="size-3.5" />}{children}</Button>;
}

/** جعبهٔ متنِ قابلِ کپی — نشانی، توکن و تنظیمِ هر ابزار. */
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

function ScopeBadge({ scopes }: { scopes: string[] }) {
  const tr = useT();
  const write = scopes.includes('write');
  return <Badge variant={write ? 'warning' : 'secondary'}>{write ? tr('خواندن و نوشتن') : tr('فقط خواندن')}</Badge>;
}

/** تنظیمِ هر ابزار با توکن — همان نشانی و همان سرآیند، در قالبِ خودِ آن ابزار. */
function guides(endpoint: string, token: string) {
  const header = { Authorization: `Bearer ${token}` };
  return [
    {
      key: 'claude-code', name: 'Claude Code', where: 'ترمینال',
      text: `claude mcp add --transport http kabarza ${endpoint} --header "Authorization: Bearer ${token}"`,
    },
    {
      key: 'cursor', name: 'Cursor', where: '~/.cursor/mcp.json',
      text: JSON.stringify({ mcpServers: { kabarza: { url: endpoint, headers: header } } }, null, 2),
    },
    {
      key: 'vscode', name: 'VS Code', where: '.vscode/mcp.json',
      text: JSON.stringify({ servers: { kabarza: { type: 'http', url: endpoint, headers: header } } }, null, 2),
    },
    {
      key: 'gemini', name: 'Gemini CLI', where: '~/.gemini/settings.json',
      text: JSON.stringify({ mcpServers: { kabarza: { httpUrl: endpoint, headers: header } } }, null, 2),
    },
    {
      key: 'other', name: 'Claude Desktop / Zed / …', where: 'mcp-remote (Node.js)',
      text: JSON.stringify({
        mcpServers: {
          kabarza: {
            command: 'npx',
            args: ['-y', 'mcp-remote', endpoint, '--header', 'Authorization:${KABARZA_AUTH}'],
            env: { KABARZA_AUTH: `Bearer ${token}` },
          },
        },
      }, null, 2),
    },
  ];
}

/**
 * «دستیارِ هوشِ مصنوعی» در پروفایل (۲.۷.۰، ۲.۸.۰) — هر هوشِ مصنوعی‌ای که
 * MCP بفهمد (Claude، ChatGPT، Cursor، VS Code، Gemini، Zed …) به برنامه وصل
 * می‌شود: از وب با «اجازه» (OAuth)، یا در ابزارهای دسکتاپ با توکنِ شخصی.
 *
 * ⚠️ توکن **فقط یک بار** نشان داده می‌شود (دیتابیس فقط هشش را دارد).
 */
export function McpPanel({ tokens, grants, endpoint }: {
  tokens: McpTokenView[];
  grants: McpGrantView[];
  endpoint: string;
}) {
  const tr = useT();
  const tz = useTimeZone();
  const confirm = useConfirm();
  const { show } = useToast();
  const [state, create] = useActionState<McpTokenState, FormData>(createTokenAction, {});
  const [pending, startTransition] = useTransition();
  const [guide, setGuide] = useState('claude-code');

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

  const disconnect = async (g: McpGrantView) => {
    if (!(await confirm({
      title: tr('اتصالِ «{name}» قطع شود؟', { name: g.name }),
      description: tr('این اپ دیگر به حسابِ شما دسترسی ندارد؛ برای وصلِ دوباره باید از خودِ اپ دوباره اجازه بدهید.'),
    }))) return;
    startTransition(async () => {
      const result = await revokeGrantAction(g.id);
      show(tr(result.error ?? 'اتصال قطع شد.'), result.error ? 'error' : 'success');
    });
  };

  const token = state.token;
  const list = token ? guides(endpoint, token) : [];
  const current = list.find((g) => g.key === guide) ?? list[0];

  return (
    <div className="grid max-w-3xl gap-4">
      <Panel title={tr('دستیارِ هوشِ مصنوعی')}>
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <Bot className="mt-0.5 size-4 shrink-0" aria-hidden />
          {tr('هوشِ مصنوعیِ خودتان را به Kabarza وصل کنید — Claude، ChatGPT، Cursor، VS Code، Gemini، Zed و هر ابزاری که MCP پشتیبانی می‌کند. بعد کافی است بپرسید «امروز چه تسکی دارم؟» یا بگویید «پنجشنبه ۳ ساعت روی پروژهٔ آلفا ثبت کن». همیشه با همان دسترسی‌هایی که خودتان دارید، نه بیشتر.')}
        </p>
      </Panel>

      <Panel title={tr('اتصال از وب و موبایل')}>
        <p className="text-sm text-muted-foreground">
          {tr('برای claude.ai، ChatGPT و اپ‌هایی که «کانکتورِ سفارشی» دارند: این نشانی را در تنظیماتِ کانکتورهای همان اپ اضافه کنید؛ صفحهٔ ورود و «اجازه» ِ Kabarza باز می‌شود و تمام. توکن لازم نیست.')}
        </p>
        <CopyBlock label={tr('نشانیِ سرورِ MCP')} text={endpoint} />
        <ul className="grid gap-1 text-xs text-muted-foreground">
          <li>• {tr('Claude: تنظیمات ← Connectors ← افزودنِ کانکتورِ سفارشی ← نشانی ← Connect.')}</li>
          <li>• {tr('ChatGPT: تنظیمات ← Apps & Connectors (حالتِ developer) ← ساختنِ کانکتور ← نشانی.')}</li>
          <li>• {tr('اتصال در اپِ موبایلِ همان سرویس هم خودبه‌خود در دسترس است.')}</li>
        </ul>

        <h4 className="mt-2 text-xs font-semibold text-muted-foreground">{tr('اتصال‌های فعالِ وب')}</h4>
        {grants.length === 0 ? (
          <p className="text-sm text-muted-foreground">{tr('هنوز اپی از راهِ وب وصل نشده.')}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{tr('اپ')}</TableHead>
                <TableHead>{tr('دسترسی')}</TableHead>
                <TableHead>{tr('آخرین استفاده')}</TableHead>
                <TableActionsHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {grants.map((g) => (
                <TableRow key={g.id}>
                  <TableCell className="font-medium" dir="auto"><Globe className="me-1 inline size-3.5 text-muted-foreground" aria-hidden />{g.name}</TableCell>
                  <TableCell><ScopeBadge scopes={g.scopes} /></TableCell>
                  <TableCell className="text-xs">{g.lastUsedAt ? <span className="num">{formatDateTime(g.lastUsedAt, tz)}</span> : tr('هرگز')}</TableCell>
                  <TableActionsCell>
                    <IconButton
                      variant="ghost" className="size-8 text-muted-foreground hover:text-destructive"
                      label={tr('قطعِ اتصال')} disabled={pending} onClick={() => disconnect(g)}
                    >
                      <Link2Off className="size-3.5" />
                    </IconButton>
                  </TableActionsCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>

      <Panel title={tr('اتصال با توکن (ابزارهای دسکتاپ و برنامه‌نویسی)')}>
        <p className="text-sm text-muted-foreground">
          {tr('برای Claude Code، Cursor، VS Code، Gemini CLI، اپِ دسکتاپِ Claude، Zed و بقیه: یک توکن بسازید و تنظیمِ آمادهٔ همان ابزار را کپی کنید.')}
        </p>

        <form key={token ?? 'new'} action={create} className="flex flex-wrap items-end gap-2 rounded-xl border bg-card p-3">
          <Field className="min-w-48 flex-1">
            <FieldLabel htmlFor="mcp-name">{tr('نامِ توکن')}</FieldLabel>
            <Input id="mcp-name" name="name" placeholder={tr('مثلاً: Cursor ِ لپ‌تاپ')} required maxLength={80} />
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
            {tr('«خواندن و نوشتن» یعنی هوشِ مصنوعی می‌تواند ساعت ثبت کند، تایمر بزند، تسک بسازد، وضعیتِ تسک را عوض کند و کامنت بگذارد. کارهای مالی، حذف و دسترسی‌ها از این راه ممکن نیست. برای هر ابزار یک توکنِ جدا بسازید.')}
          </FieldDescription>
        </form>
        {state.error && <p className="text-sm text-destructive">{tr(state.error)}</p>}

        {token && current && (
          <div className="grid gap-3 rounded-xl border border-amber-500/40 bg-amber-500/5 p-3">
            <p className="flex items-center gap-1.5 text-sm font-medium">
              <TriangleAlert className="size-4 text-amber-600" aria-hidden />
              {tr('توکن را همین حالا کپی کنید — دیگر نمایش داده نمی‌شود.')}
            </p>
            <CopyBlock label={tr('توکن')} text={token} />
            <div className="flex flex-wrap gap-1.5" role="tablist" aria-label={tr('ابزار')}>
              {list.map((g) => (
                <button
                  key={g.key} type="button" role="tab" aria-selected={g.key === current.key}
                  onClick={() => setGuide(g.key)}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs transition-colors',
                    g.key === current.key ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-muted',
                  )}
                >
                  {g.name}
                </button>
              ))}
            </div>
            <CopyBlock label={`${current.name} — ${tr(current.where)}`} text={current.text} />
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
                  <TableCell><ScopeBadge scopes={t.scopes} /></TableCell>
                  <TableCell className="text-xs">{t.lastUsedAt ? <span className="num">{formatDateTime(t.lastUsedAt, tz)}</span> : tr('هرگز')}</TableCell>
                  <TableCell className="text-xs"><span className="num">{formatDateTime(t.createdAt, tz)}</span></TableCell>
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
