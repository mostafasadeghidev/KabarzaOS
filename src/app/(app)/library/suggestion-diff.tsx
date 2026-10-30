'use client';

import { Fragment } from 'react';
import { useT } from '@/i18n/client';
import { cn } from '@/lib/utils';
import {
  changedParts, formatAllowed, LANGUAGE_LABELS, lineDiff, OPTION_KIND_LABELS, OPTION_ROLE_LABELS, optionKey, PLACEMENT_LABELS,
  SUGGESTION_PART_LABELS, type CleanBlock, type CleanOption, type CleanStep, type DiffLine, type SuggestedContent,
} from '@/domain/library/model';

/**
 * تفاوتِ یک پیشنهادِ ویرایش با نسخهٔ فعلی (۲.۴۶.۰).
 *
 * ⚠️ فقط بخش‌های عوض‌شده می‌آیند و در متن‌های بلند خط‌های بی‌تغییر جمع
 * می‌شوند — بررسی‌کننده باید در چند ثانیه ببیند چه چیزی عوض می‌شود، نه اینکه
 * کلِ کد را دوباره بخواند.
 */
export function SuggestionDiffView({ before, after }: { before: SuggestedContent; after: SuggestedContent }) {
  const tr = useT();
  const parts = changedParts(before, after);
  if (parts.length === 0) {
    return <p className="text-sm text-muted-foreground">{tr('این پیشنهاد با نسخهٔ فعلی فرقی ندارد.')}</p>;
  }
  return (
    <div className="grid gap-4">
      {parts.map((part) => (
        <section key={part} className="grid gap-1.5">
          <h4 className="text-xs font-semibold text-muted-foreground">{tr(SUGGESTION_PART_LABELS[part])}</h4>
          {part === 'title' || part === 'summary' || part === 'demoUrl' || part === 'videoUrl' || part === 'cloneableUrl' ? (
            <InlineChange before={before[part]} after={after[part]} ltr={part !== 'title' && part !== 'summary'} />
          ) : part === 'topics' ? (
            <TopicsChange before={before.topics} after={after.topics} />
          ) : part === 'steps' ? (
            <StepsChange before={before} after={after} />
          ) : part === 'blocks' ? (
            <BlocksChange before={before.blocks} after={after.blocks} />
          ) : part === 'options' ? (
            <OptionsChange before={before.options} after={after.options} />
          ) : (
            <LineDiffView lines={lineDiff(before[part], after[part])} />
          )}
        </section>
      ))}
    </div>
  );
}

const DEL = 'bg-destructive/10 text-destructive';
const ADD = 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-300';

function InlineChange({ before, after, ltr = false }: { before: string; after: string; ltr?: boolean }) {
  const tr = useT();
  return (
    <div className="grid gap-1 text-sm" dir={ltr ? 'ltr' : 'auto'}>
      <p className={cn('rounded-md px-2 py-1 line-through decoration-1', DEL)}>{before || tr('(خالی)')}</p>
      <p className={cn('rounded-md px-2 py-1', ADD)}>{after || tr('(خالی)')}</p>
    </div>
  );
}

function TopicsChange({ before, after }: { before: string[]; after: string[] }) {
  const removed = before.filter((t) => !after.includes(t));
  const added = after.filter((t) => !before.includes(t));
  return (
    <div className="flex flex-wrap gap-1.5 text-xs" dir="auto">
      {removed.map((t) => <span key={`-${t}`} className={cn('rounded-md px-1.5 py-0.5 line-through', DEL)}>#{t}</span>)}
      {added.map((t) => <span key={`+${t}`} className={cn('rounded-md px-1.5 py-0.5', ADD)}>#{t}</span>)}
    </div>
  );
}

/** خط‌های بی‌تغییرِ دور از تغییر جمع می‌شوند؛ سه خط دورِ هر تغییر می‌ماند. */
const CONTEXT = 3;

export function LineDiffView({ lines, code = false }: { lines: DiffLine[]; code?: boolean }) {
  const tr = useT();
  const near = new Array<boolean>(lines.length).fill(false);
  lines.forEach((l, i) => {
    if (l.op === 'same') return;
    for (let k = Math.max(0, i - CONTEXT); k <= Math.min(lines.length - 1, i + CONTEXT); k += 1) near[k] = true;
  });
  const out: Array<{ kind: 'line'; line: DiffLine; key: number } | { kind: 'gap'; n: number; key: number }> = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (near[i]) { out.push({ kind: 'line', line: lines[i]!, key: i }); continue; }
    const last = out[out.length - 1];
    if (last?.kind === 'gap') last.n += 1;
    else out.push({ kind: 'gap', n: 1, key: i });
  }
  return (
    <div
      className={cn('overflow-x-auto rounded-md border bg-card py-1', code ? 'font-mono text-[12px] leading-5' : 'text-[13px] leading-6')}
      dir={code ? 'ltr' : 'auto'}
    >
      {out.map((row) => (
        <Fragment key={row.key}>
          {row.kind === 'gap' ? (
            // ⚠️ dir جدا: داخلِ کدِ چپ‌به‌راست، جملهٔ فارسی وارونه دیده می‌شد.
            <div className="px-2 text-[11px] text-muted-foreground" dir="auto">{tr('… {n} خطِ بی‌تغییر', { n: row.n })}</div>
          ) : (
            <div
              className={cn(
                'flex gap-2 whitespace-pre px-2',
                row.line.op === 'add' && ADD,
                row.line.op === 'del' && DEL,
              )}
            >
              <span className="w-3 shrink-0 select-none text-muted-foreground" aria-hidden>
                {row.line.op === 'add' ? '+' : row.line.op === 'del' ? '−' : ' '}
              </span>
              <span className={cn(!code && 'whitespace-pre-wrap')}>{row.line.text || ' '}</span>
            </div>
          )}
        </Fragment>
      ))}
    </div>
  );
}

function blockMeta(b: CleanBlock, tr: ReturnType<typeof useT>): string {
  return [LANGUAGE_LABELS[b.language], tr(PLACEMENT_LABELS[b.placement]), b.placementNote].filter(Boolean).join(' · ');
}

/** تکه‌ها به ترتیب جفت می‌شوند — همان ترتیبی که در فرم و صفحه دیده می‌شود. */
function BlocksChange({ before, after }: { before: CleanBlock[]; after: CleanBlock[] }) {
  const tr = useT();
  const n = Math.max(before.length, after.length);
  const rows = [];
  for (let i = 0; i < n; i += 1) {
    const a = before[i];
    const b = after[i];
    if (a && b && JSON.stringify(a) === JSON.stringify(b)) continue;
    const name = (b ?? a)!.label || tr('تکهٔ {n}', { n: i + 1 });
    rows.push(
      <div key={i} className="grid gap-1.5 rounded-lg bg-muted/60 p-2.5">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium" dir="auto">{name}</span>
          {!a && <span className={cn('rounded px-1.5 text-[11px]', ADD)}>{tr('تکهٔ تازه')}</span>}
          {!b && <span className={cn('rounded px-1.5 text-[11px]', DEL)}>{tr('حذف می‌شود')}</span>}
        </div>
        {a && b && a.label !== b.label && <InlineChange before={a.label} after={b.label} />}
        {a && b && blockMeta(a, tr) !== blockMeta(b, tr) && (
          <InlineChange before={blockMeta(a, tr)} after={blockMeta(b, tr)} />
        )}
        {!a && b && <p className="text-xs text-muted-foreground" dir="auto">{blockMeta(b, tr)}</p>}
        {(a?.code ?? '') !== (b?.code ?? '') && <LineDiffView lines={lineDiff(a?.code ?? '', b?.code ?? '')} code />}
      </div>,
    );
  }
  return <div className="grid gap-2">{rows}</div>;
}

function optionLine(o: CleanOption, tr: ReturnType<typeof useT>): string {
  return [
    o.value ? `${o.name} = ${o.value}` : o.name,
    tr(OPTION_ROLE_LABELS[o.role]),
    tr(OPTION_KIND_LABELS[o.kind]),
    o.description,
    o.element && `${tr('روی')}: ${o.element}`,
    o.target && `${tr('داخلِ')}: ${o.target}`,
    o.allowedValues.length > 0 && `${tr('مجاز')}: ${formatAllowed(o.allowedValues).replace(/\n/g, ' | ')}`,
    o.defaultValue && `${tr('پیش‌فرض')}: ${o.defaultValue}`,
    o.example && `${tr('مثال')}: ${o.example}`,
    o.important && `${tr('مهم')}: ${o.important}`,
  ].filter(Boolean).join(' · ');
}

/** ارجاع‌های یک گام به زبانِ آدم: «کد: init · گزینه: data-x · ۲ تصویر». */
function stepRefs(s: CleanStep, blocks: readonly CleanBlock[], tr: ReturnType<typeof useT>): string {
  return [
    s.blockIndexes.length > 0 && `${tr('کد')}: ${s.blockIndexes.map((i) => blocks[i]?.label || tr('تکهٔ {n}', { n: i + 1 })).join('، ')}`,
    s.optionNames.length > 0 && `${tr('گزینه')}: ${s.optionNames.join('، ')}`,
    s.mediaIds.length > 0 && tr('{n} تصویر', { n: s.mediaIds.length }),
  ].filter(Boolean).join(' · ');
}

/**
 * گام‌ها به ترتیب جفت می‌شوند — همان ترتیبی که خواننده می‌بیند. عنوان کنارِ
 * هم، توضیح خط‌به‌خط، و ارجاع به کد/گزینه/تصویر به زبانِ آدم.
 */
function StepsChange({ before, after }: { before: SuggestedContent; after: SuggestedContent }) {
  const tr = useT();
  const n = Math.max(before.steps.length, after.steps.length);
  const rows = [];
  for (let i = 0; i < n; i += 1) {
    const a = before.steps[i];
    const b = after.steps[i];
    const refsA = a ? stepRefs(a, before.blocks, tr) : '';
    const refsB = b ? stepRefs(b, after.blocks, tr) : '';
    if (a && b && a.title === b.title && a.body === b.body && refsA === refsB) continue;
    rows.push(
      <div key={i} className="grid gap-1.5 rounded-lg bg-muted/60 p-2.5">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium">{tr('گامِ {n}', { n: i + 1 })}</span>
          {!a && <span className={cn('rounded px-1.5 text-[11px]', ADD)}>{tr('گامِ تازه')}</span>}
          {!b && <span className={cn('rounded px-1.5 text-[11px]', DEL)}>{tr('حذف می‌شود')}</span>}
        </div>
        {(a?.title ?? '') !== (b?.title ?? '') && <InlineChange before={a?.title ?? ''} after={b?.title ?? ''} />}
        {(a?.body ?? '') !== (b?.body ?? '') && <LineDiffView lines={lineDiff(a?.body ?? '', b?.body ?? '')} />}
        {refsA !== refsB && <InlineChange before={refsA} after={refsB} />}
      </div>,
    );
  }
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">{tr('فقط کدهای وصل‌شده جابه‌جا شده‌اند.')}</p>;
  return <div className="grid gap-2">{rows}</div>;
}

/** گزینه‌ها با نام جفت می‌شوند — جابه‌جاییِ ردیف تغییر حساب نمی‌شود. */
function OptionsChange({ before, after }: { before: CleanOption[]; after: CleanOption[] }) {
  const tr = useT();
  const byName = (list: CleanOption[]) => new Map(list.map((o) => [optionKey(o), o]));
  const a = byName(before);
  const b = byName(after);
  const names = [...new Set([...before.map(optionKey), ...after.map(optionKey)])]
    .filter((name) => JSON.stringify(a.get(name)) !== JSON.stringify(b.get(name)));
  if (names.length === 0) return <p className="text-sm text-muted-foreground">{tr('فقط ترتیبِ گزینه‌ها عوض شده است.')}</p>;
  return (
    <div className="grid gap-1 text-sm">
      {names.map((name) => {
        const x = a.get(name);
        const y = b.get(name);
        if (x && y) return <InlineChange key={name} before={optionLine(x, tr)} after={optionLine(y, tr)} />;
        return (
          <p key={name} className={cn('rounded-md px-2 py-1', y ? ADD : `${DEL} line-through`)} dir="auto">
            {optionLine((y ?? x)!, tr)}
          </p>
        );
      })}
    </div>
  );
}
