'use client';

import { useMemo, useState } from 'react';
import hljs from 'highlight.js/lib/core';
import xml from 'highlight.js/lib/languages/xml';
import css from 'highlight.js/lib/languages/css';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import php from 'highlight.js/lib/languages/php';
import { Check, ChevronDown, Copy, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import { useT } from '@/i18n/client';
import { cn } from '@/lib/utils';
import {
  LANGUAGE_LABELS, LIBRARY_PLACEMENTS, pasteReady, PLACEMENT_HINTS, PLACEMENT_LABELS, PLACEMENT_SHORT_LABELS, type CleanBlock,
  type LibraryLanguage, type LibraryPlacement,
} from '@/domain/library/model';

hljs.registerLanguage('xml', xml);
hljs.registerLanguage('css', css);
hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('json', json);
hljs.registerLanguage('php', php);

/** زبانِ کتابخانه ← نامِ زبان در highlight.js؛ Liquid مثلِ HTML رنگ می‌گیرد. */
const HLJS: Record<LibraryLanguage, string | null> = {
  html: 'xml', css: 'css', js: 'javascript', json: 'json', php: 'php', liquid: 'xml', text: null,
};

/** کدِ بلندتر از این، اول جمع‌شده دیده می‌شود. */
const COLLAPSE_AT = 24;

/**
 * چند تکه یکجا، هر کدام با یک خطِ توضیح که از کجا آمده — آمادهٔ چسباندن در
 * یک کادرِ Custom code (`pasteReady`).
 */
export function joinBlocks(blocks: readonly Pick<CleanBlock, 'label' | 'language' | 'code'>[]): string {
  return blocks.map((b) => (b.label ? `<!-- ${b.label.replace(/--/g, '—')} -->\n${pasteReady(b)}` : pasteReady(b))).join('\n\n');
}

/**
 * «کپیِ همهٔ Head ِ سایت» و مانندش (۲.۴۷.۰) — وقتی چند تکه یک جا می‌روند،
 * نصب‌کننده یک بار کپی و یک بار می‌چسباند.
 */
export function PlacementCopyBar({ blocks, className }: { blocks: readonly CleanBlock[]; className?: string }) {
  const tr = useT();
  const groups = LIBRARY_PLACEMENTS.map((p) => ({ p, list: blocks.filter((b) => b.placement === p) }))
    .filter((g) => g.list.length > 0);
  if (blocks.length < 2) return null;
  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <CopyButton label={tr('کپیِ همهٔ کدها ({n})', { n: blocks.length })} text={joinBlocks(blocks)} />
      {groups.length > 1 && groups.map((g) => (
        <CopyButton
          key={g.p}
          label={tr('{p} ({n})', { p: tr(PLACEMENT_SHORT_LABELS[g.p]), n: g.list.length })}
          text={joinBlocks(g.list)}
        />
      ))}
    </div>
  );
}

/**
 * کدِ رنگ‌بندی‌شده — HTML ِ خروجی را خودِ highlight.js از متنِ **فرارداده‌شده**
 * می‌سازد (هر `<` ِ کد `&lt;` می‌شود)، پس کدِ کاربر هرگز اجرا یا تفسیر نمی‌شود.
 */
function highlighted(code: string, language: LibraryLanguage): string[] {
  const name = HLJS[language];
  const html = name
    ? hljs.highlight(code, { language: name, ignoreIllegals: true }).value
    : code.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
  /**
   * ⚠️ شکستن به خط بعد از رنگ‌بندی، با بستن و دوباره‌بازکردنِ spanهای باز —
   * وگرنه کامنتِ چندخطی یا رشتهٔ چندخطی رنگِ خط‌های بعد را از دست می‌داد.
   */
  const out: string[] = [];
  let open: string[] = [];
  for (const line of html.split('\n')) {
    let rendered = open.join('') + line;
    const stack = [...open];
    for (const m of line.matchAll(/<span[^>]*>|<\/span>/g)) {
      if (m[0] === '</span>') stack.pop();
      else stack.push(m[0]);
    }
    rendered += '</span>'.repeat(stack.length);
    open = stack;
    out.push(rendered);
  }
  return out;
}

/**
 * «کجا نصب شود» — برچسب، جای دقیقِ نوشته‌شده و مسیرِ همان تنظیم در Webflow.
 * ⚠️ مسیر آشکار است، نه در راهنمای شناور: نصب‌کننده باید بی‌حدس بداند کجا برود.
 * ⚠️ هر تکه جهتِ خودش را دارد؛ در یک نشانِ واحد، فارسی و «body» درهم می‌شدند.
 */
export function PlacementChip({ placement, note }: { placement: LibraryPlacement; note?: string }) {
  const tr = useT();
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md bg-muted/60 px-2.5 py-1.5 text-xs">
      <MapPin className="size-3.5 shrink-0 text-primary" aria-hidden />
      <span className="font-medium">{tr(PLACEMENT_LABELS[placement])}</span>
      {note && <span className="text-foreground/80" dir="auto">— {note}</span>}
      <span className="text-[11px] text-muted-foreground" dir="auto">{tr(PLACEMENT_HINTS[placement])}</span>
    </div>
  );
}

export function CopyButton({ text, label, className }: { text: string; label?: string; className?: string }) {
  const tr = useT();
  const { show } = useToast();
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      show(tr('کپی شد.'));
      setTimeout(() => setDone(false), 1500);
    } catch {
      show(tr('کپی نشد؛ دستی انتخاب کنید.'), 'error');
    }
  };
  return (
    <Button type="button" size="sm" variant="outline" className={className} onClick={copy}>
      {done ? <Check /> : <Copy />}
      {label ?? tr('کپی')}
    </Button>
  );
}

export function CodeView({
  code,
  language,
  label,
  placement,
  placementNote,
  index,
  collapseAt = COLLAPSE_AT,
}: {
  code: string;
  language: LibraryLanguage;
  label?: string;
  placement?: LibraryPlacement;
  placementNote?: string;
  /** شمارهٔ تکه در موردی که چند تکه دارد — «تکهٔ ۲». */
  index?: number;
  /** کارتِ سریع کوتاه‌تر جمع می‌شود. */
  collapseAt?: number;
}) {
  const tr = useT();
  const rows = useMemo(() => highlighted(code, language), [code, language]);
  const long = rows.length > collapseAt;
  const [expanded, setExpanded] = useState(!long);
  const shown = expanded ? rows : rows.slice(0, collapseAt);

  return (
    <div className="grid gap-2 rounded-lg border bg-card p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {index !== undefined && (
            <span className="flex size-6 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary tabular-nums">
              {index}
            </span>
          )}
          <span className="text-sm font-semibold">{label || tr(LANGUAGE_LABELS[language])}</span>
          <Badge variant="secondary" className="font-mono" dir="ltr">{LANGUAGE_LABELS[language]}</Badge>
        </div>
        <CopyButton text={code} />
      </div>
      {placement && <PlacementChip placement={placement} note={placementNote} />}
      {/* ⚠️ کد همیشه چپ‌به‌راست است، حتی در صفحهٔ فارسی. */}
      <div dir="ltr" className="code-view relative overflow-hidden rounded-md bg-muted/60">
        <pre className="overflow-x-auto py-3 text-[12.5px] leading-5">
          <code className="grid font-mono">
            {shown.map((html, i) => (
              <span key={i} className="flex">
                <span aria-hidden className="w-10 shrink-0 select-none pe-3 text-end text-muted-foreground/70 tabular-nums">
                  {i + 1}
                </span>
                {/* eslint-disable-next-line react/no-danger -- خروجیِ فرارداده‌شدهٔ highlight.js */}
                <span className="whitespace-pre pe-4" dangerouslySetInnerHTML={{ __html: html || ' ' }} />
              </span>
            ))}
          </code>
        </pre>
        {!expanded && (
          <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-muted to-transparent" />
        )}
      </div>
      {long && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className={cn('justify-self-center text-muted-foreground')}
          onClick={() => setExpanded((v) => !v)}
        >
          <ChevronDown className={cn('transition-transform', expanded && 'rotate-180')} />
          {expanded ? tr('جمع کن') : tr('نمایشِ همهٔ {n} خط', { n: rows.length })}
        </Button>
      )}
    </div>
  );
}
