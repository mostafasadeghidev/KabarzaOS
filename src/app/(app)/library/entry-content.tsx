'use client';

import { AlertTriangle, ExternalLink, ListChecks, Package, SlidersHorizontal } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Panel } from '@/components/page-shell';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { RichText } from '@/components/media/rich-text';
import { MediaGallery, type MediaEntry } from '@/components/media/media-gallery';
import { useT } from '@/i18n/client';
import { lines, OPTION_KIND_LABELS, type LibraryOptionKind } from '@/domain/library/model';
import type { BlockView, OptionView } from '@/server/library/service';
import { CodeView, CopyButton } from './code-view';

/**
 * بدنهٔ یک مورد — «چطور استفاده کنم»، کدها، تنظیمات، توضیح و تصویرها.
 * ⚠️ یک کامپوننت برای صفحهٔ کتابخانه **و** راهنمای کارفرما در تبِ پروژه؛
 * کارفرما همان ترتیب و همان ظاهر را می‌بیند، فقط بی‌کد و بی‌ابزارِ تیم.
 */
export function EntryContent({
  steps,
  warnings,
  dependencies,
  blocks = [],
  options,
  body,
  demoUrl = '',
  media,
  onRemoveMedia,
  /** مقدارهای همین پروژه (تبِ پروژه) — زیرِ جدولِ تنظیمات. */
  valuesNote = '',
}: {
  steps: string;
  warnings: string;
  dependencies: string;
  blocks?: readonly BlockView[];
  options: readonly OptionView[];
  body: string;
  demoUrl?: string;
  media: readonly MediaEntry[];
  onRemoveMedia?: (item: MediaEntry) => Promise<{ error?: string }>;
  valuesNote?: string;
}) {
  const tr = useT();
  const stepList = lines(steps);
  const warningList = lines(warnings);
  const deps = lines(dependencies);

  return (
    <div className="grid gap-4">
      {warningList.length > 0 && (
        <Alert variant="warning">
          <AlertTriangle />
          <AlertTitle>{tr('پیش از استفاده بدانید')}</AlertTitle>
          <AlertDescription>
            <ul className="grid list-disc gap-1 ps-4">
              {warningList.map((w, i) => <li key={i} dir="auto">{w}</li>)}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {(stepList.length > 0 || deps.length > 0) && (
        <Panel title={tr('چطور استفاده کنم')} icon={<ListChecks />}>
          {stepList.length > 0 && (
            <ol className="grid gap-2.5">
              {stepList.map((s, i) => (
                <li key={i} className="flex items-start gap-3 text-sm">
                  <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary tabular-nums">
                    {i + 1}
                  </span>
                  <span className="pt-0.5 leading-6" dir="auto">{s}</span>
                </li>
              ))}
            </ol>
          )}
          {deps.length > 0 && (
            <div className="grid gap-1.5">
              <h4 className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                <Package className="size-3.5" aria-hidden />
                {tr('پیش‌نیازها')}
              </h4>
              <ul className="grid gap-1">
                {deps.map((d, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm">
                    <span className="size-1.5 shrink-0 rounded-full bg-muted-foreground/50" />
                    {/^https?:\/\//i.test(d)
                      ? <a href={d} target="_blank" rel="noopener noreferrer nofollow" dir="ltr" className="break-all font-mono text-xs text-primary hover:underline">{d}</a>
                      : <span dir="auto">{d}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Panel>
      )}

      {blocks.length > 0 && (
        <section className="grid gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-bold">{blocks.length > 1 ? tr('کدها ({n} تکه)', { n: blocks.length }) : tr('کد')}</h2>
            {blocks.length > 1 && (
              <CopyButton
                label={tr('کپیِ همه')}
                text={blocks.map((b) => (b.label ? `<!-- ${b.label} -->\n${b.code}` : b.code)).join('\n\n')}
              />
            )}
          </div>
          {blocks.map((b, i) => (
            <CodeView
              key={b.id}
              code={b.code}
              language={b.language}
              label={b.label}
              placement={b.placement}
              placementNote={b.placementNote}
              index={blocks.length > 1 ? i + 1 : undefined}
            />
          ))}
        </section>
      )}

      {options.length > 0 && (
        <Panel
          title={tr('تنظیمات و گزینه‌ها')}
          description={tr('چیزهایی که بدونِ دست زدن به کد عوض می‌شوند.')}
          icon={<SlidersHorizontal />}
          flush
        >
          <Table frame={false}>
            <TableHeader>
              <TableRow>
                <TableHead>{tr('نام')}</TableHead>
                <TableHead>{tr('چه کار می‌کند')}</TableHead>
                <TableHead>{tr('پیش‌فرض')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {options.map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="align-top">
                    <div className="grid gap-1">
                      <code dir="ltr" className="w-fit rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{o.name}</code>
                      <Badge variant="outline" className="text-[10px]">{tr(OPTION_KIND_LABELS[o.kind as LibraryOptionKind])}</Badge>
                    </div>
                  </TableCell>
                  <TableCell className="align-top whitespace-normal" dir="auto">{o.description || '—'}</TableCell>
                  <TableCell className="align-top">
                    {o.defaultValue
                      ? <code dir="ltr" className="font-mono text-xs">{o.defaultValue}</code>
                      : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {valuesNote && (
            <div className="mx-4 mb-3 rounded-md bg-muted/60 p-3 text-sm">
              <div className="mb-1 text-xs font-semibold text-muted-foreground">{tr('مقدارهای همین پروژه')}</div>
              <p className="whitespace-pre-wrap" dir="auto">{valuesNote}</p>
            </div>
          )}
        </Panel>
      )}

      {(body.trim() || demoUrl) && (
        <Panel title={tr('توضیحات')}>
          {body.trim() && <RichText text={body} />}
          {demoUrl && (
            <Button asChild size="sm" variant="outline" className="w-fit">
              <a href={demoUrl} target="_blank" rel="noopener noreferrer nofollow">
                <ExternalLink />
                {tr('نمونهٔ زنده')}
              </a>
            </Button>
          )}
        </Panel>
      )}

      {media.length > 0 && (
        <Panel title={tr('تصویرها و فایل‌ها')}>
          <MediaGallery items={media} projectId={0} onRemove={onRemoveMedia} />
        </Panel>
      )}
    </div>
  );
}
