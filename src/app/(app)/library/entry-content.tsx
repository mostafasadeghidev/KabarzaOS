'use client';

import Link from 'next/link';
import { Fragment, useState } from 'react';
import {
  AlertTriangle, Code2, Copy as CopyIcon, ExternalLink, Layers, ListChecks, Package, PlayCircle, SlidersHorizontal,
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Panel } from '@/components/page-shell';
import { RichText } from '@/components/media/rich-text';
import { MediaGallery, type MediaEntry } from '@/components/media/media-gallery';
import { VideoFrame } from '@/components/media/video-frame';
import { Lightbox } from '@/components/lightbox';
import { useT } from '@/i18n/client';
import { linkify, parseVideoUrl } from '@/domain/files/video';
import { lines, optionKey, type CleanBlock, type CleanOption, type CleanStep } from '@/domain/library/model';
import type { EntryLink } from '@/server/library/service';
import { CodeView, PlacementCopyBar } from './code-view';
import { CopyChip, OptionCard, OptionGroups } from './option-card';
import { KindIcon, textDir, VersionLabel } from './entry-bits';

/** هر چیزی که بدنهٔ یک مورد نشان می‌دهد — صفحهٔ کتابخانه، تاریخچه، راهنمای کارفرما. */
export interface EntryBody {
  steps: readonly CleanStep[];
  warnings: string;
  dependencies: string;
  /** پیش‌نیازهای کتابخانه‌ای — کارفرما ندارد. */
  requires?: readonly EntryLink[];
  blocks?: readonly CleanBlock[];
  options: readonly CleanOption[];
  instances?: string;
  body: string;
  demoUrl?: string;
  videoUrl?: string;
  cloneableUrl?: string;
  media: readonly MediaEntry[];
}

/**
 * بدنهٔ یک مورد (۲.۴۷.۰) — ترتیب همان ترتیبِ کارِ نصب‌کننده است:
 * ویدیو و نمونه ← «پیش از استفاده بدانید» ← پیش‌نیازها ← گام‌ها (هر گام با
 * تصویر، کد و گزینه‌های خودش) ← کدها و گزینه‌هایی که به گامی وصل نیستند ←
 * استفادهٔ چندباره ← توضیحات.
 *
 * ⚠️ یک کامپوننت برای صفحهٔ کتابخانه، تاریخچه **و** راهنمای کارفرما در تبِ
 * پروژه؛ کارفرما همان ترتیب و همان ظاهر را می‌بیند، فقط بی‌کد و بی‌ابزارِ تیم.
 */
export function EntryContent({
  content,
  onRemoveMedia,
  /** مقدارهای همین پروژه (تبِ پروژه) — زیرِ گزینه‌ها. */
  valuesNote = '',
}: {
  content: EntryBody;
  onRemoveMedia?: (item: MediaEntry) => Promise<{ error?: string }>;
  valuesNote?: string;
}) {
  const tr = useT();
  const c = content;
  const blocks = c.blocks ?? [];
  const warningList = lines(c.warnings);
  const deps = lines(c.dependencies);
  const requires = c.requires ?? [];
  const instances = lines(c.instances ?? '');

  // آنچه داخلِ گامی آمده، دوباره پایین تکرار نمی‌شود.
  const usedBlocks = new Set(c.steps.flatMap((s) => s.blockIndexes));
  const usedOptions = new Set(c.steps.flatMap((s) => s.optionNames));
  const usedMedia = new Set(c.steps.flatMap((s) => s.mediaIds));
  const looseBlocks = blocks.map((b, i) => ({ b, i })).filter(({ i }) => !usedBlocks.has(i));
  const looseOptions = c.options.filter((o) => !usedOptions.has(optionKey(o)));
  const looseMedia = c.media.filter((m) => !usedMedia.has(m.id));
  const mediaById = new Map(c.media.map((m) => [m.id, m]));
  const optionByKey = new Map(c.options.map((o) => [optionKey(o), o]));
  const video = c.videoUrl ? parseVideoUrl(c.videoUrl) : null;
  /**
   * ⚠️ ویدیو جمع‌شده شروع می‌شود: قابِ ۱۶:۹ ِ تمام‌عرض گام‌ها را یک صفحه پایین
   * می‌برد و کسی که فقط کد می‌خواهد باید از رویش رد شود. فقط وقتی ویدیو خودِ
   * محتواست (بی‌گام و بی‌کد) باز است.
   */
  const [showVideo, setShowVideo] = useState(c.steps.length === 0 && blocks.length === 0);

  return (
    <div className="grid gap-4">
      {(c.demoUrl || c.cloneableUrl || c.videoUrl) && (
        <div className="flex flex-wrap gap-2">
          {video && (
            <Button type="button" size="sm" variant={showVideo ? 'secondary' : 'default'} onClick={() => setShowVideo((v) => !v)} aria-expanded={showVideo}>
              <PlayCircle />
              {showVideo ? tr('بستنِ ویدیو') : tr('ویدیوی آموزشی')}
            </Button>
          )}
          {c.demoUrl && (
            <Button asChild size="sm" variant="outline">
              <a href={c.demoUrl} target="_blank" rel="noopener noreferrer nofollow"><ExternalLink />{tr('نمونهٔ زنده')}</a>
            </Button>
          )}
          {c.cloneableUrl && (
            <Button asChild size="sm" variant="outline">
              <a href={c.cloneableUrl} target="_blank" rel="noopener noreferrer nofollow"><CopyIcon />{tr('Cloneable')}</a>
            </Button>
          )}
          {c.videoUrl && !video && (
            <Button asChild size="sm" variant="outline">
              <a href={c.videoUrl} target="_blank" rel="noopener noreferrer nofollow"><PlayCircle />{tr('ویدیوی آموزشی')}</a>
            </Button>
          )}
        </div>
      )}
      {video && showVideo && <VideoFrame video={{ ...video, href: c.videoUrl }} />}

      {warningList.length > 0 && (
        <Alert variant="warning">
          <AlertTriangle />
          <AlertTitle>{tr('پیش از استفاده بدانید')}</AlertTitle>
          <AlertDescription>
            <ul className="grid list-disc gap-1 ps-4">
              {warningList.map((w, i) => <li key={i}><InlineText text={w} inline /></li>)}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {(requires.length > 0 || deps.length > 0) && (
        <Panel title={tr('پیش‌نیازها')} icon={<Package />}>
          {requires.length > 0 && (
            <div className="grid gap-1.5">
              <p className="text-xs text-muted-foreground">
                {tr('از همین کتابخانه — با نصبِ این مورد روی پروژه، این‌ها هم اگر نباشند نصب می‌شوند.')}
              </p>
              <ul className="grid gap-1.5 @2xl/main:grid-cols-2">
                {requires.map((r) => (
                  <li key={r.id}>
                    <Link href={`/library/${r.id}`} className="flex items-center gap-2 rounded-lg border p-2 hover:border-primary/40">
                      <KindIcon kind={r.kind} className="size-7" />
                      <span className="min-w-0 truncate text-sm font-medium" dir="auto">{r.title}</span>
                      <VersionLabel label={r.versionLabel} />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {deps.length > 0 && (
            <ul className="grid gap-1">
              {deps.map((d, i) => (
                <li key={i} className="flex items-center gap-2 text-sm">
                  <span className="size-1.5 shrink-0 rounded-full bg-muted-foreground/50" />
                  {/^https?:\/\//i.test(d)
                    ? <a href={d} target="_blank" rel="noopener noreferrer nofollow" dir="ltr" className="break-all font-mono text-xs text-primary hover:underline">{d}</a>
                    : <InlineText text={d} inline />}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}

      {c.steps.length > 0 && (
        <Panel title={tr('چطور استفاده کنم')} icon={<ListChecks />}>
          {/* ⚠️ داخلِ بدنه، نه سرِ پنل: چند دکمه در سرتیتر روی صفحهٔ باریک به‌هم می‌ریخت. */}
          {blocks.length > 1 && <PlacementCopyBar blocks={blocks} className="-mt-1 border-b pb-3" />}
          <ol className="grid gap-6">
            {c.steps.map((s, i) => (
              <li key={i} className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-x-3">
                <span className="flex size-7 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground tabular-nums">
                  {i + 1}
                </span>
                <div className="grid min-w-0 gap-2.5 pt-0.5">
                  {s.title && <h3 className="text-[15px] font-semibold leading-6" dir={textDir(s.title)}>{s.title}</h3>}
                  {s.body && <InlineText text={s.body} />}
                  {s.mediaIds.length > 0 && (
                    <StepImages items={s.mediaIds.map((id) => mediaById.get(id)).filter((m): m is MediaEntry => !!m)} />
                  )}
                  {s.blockIndexes.map((bi) => {
                    const b = blocks[bi];
                    return b ? (
                      <CodeView
                        key={`b${bi}`}
                        code={b.code}
                        language={b.language}
                        label={b.label}
                        placement={b.placement}
                        placementNote={b.placementNote}
                      />
                    ) : null;
                  })}
                  {s.optionNames.map((n) => {
                    const o = optionByKey.get(n);
                    return o ? <OptionCard key={`o${n}`} option={o} /> : null;
                  })}
                </div>
              </li>
            ))}
          </ol>
        </Panel>
      )}

      {looseBlocks.length > 0 && (
        <section className="grid gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-base font-bold">
              <Code2 className="size-4 text-muted-foreground" aria-hidden />
              {c.steps.length > 0
                ? tr('کدهای دیگر')
                : looseBlocks.length > 1 ? tr('کدها ({n} تکه)', { n: looseBlocks.length }) : tr('کد')}
            </h2>
            {c.steps.length === 0 && <PlacementCopyBar blocks={blocks} />}
          </div>
          {looseBlocks.map(({ b, i }, k) => (
            <CodeView
              key={i}
              code={b.code}
              language={b.language}
              label={b.label}
              placement={b.placement}
              placementNote={b.placementNote}
              index={looseBlocks.length > 1 ? k + 1 : undefined}
            />
          ))}
        </section>
      )}

      {(looseOptions.length > 0 || valuesNote) && (
        <Panel
          title={usedOptions.size > 0 ? tr('گزینه‌های دیگر') : tr('تنظیمات و گزینه‌ها')}
          description={looseOptions.length > 0 ? tr('روی نام یا مقدار کلیک کنید تا کپی شود.') : undefined}
          icon={<SlidersHorizontal />}
        >
          {looseOptions.length > 0 && <OptionGroups options={looseOptions} />}
          {valuesNote && (
            <div className="rounded-md bg-muted/60 p-3 text-sm">
              <div className="mb-1 text-xs font-semibold text-muted-foreground">{tr('مقدارهای همین پروژه')}</div>
              <p className="whitespace-pre-wrap" dir="auto">{valuesNote}</p>
            </div>
          )}
        </Panel>
      )}

      {instances.length > 0 && (
        <Panel
          title={tr('استفادهٔ چندباره در یک صفحه')}
          description={tr('اگر همین را دو بار یا بیشتر در یک صفحه لازم دارید.')}
          icon={<Layers />}
        >
          <ul className="grid list-disc gap-1.5 ps-4 text-sm">
            {instances.map((line, i) => <li key={i}><InlineText text={line} inline /></li>)}
          </ul>
        </Panel>
      )}

      {(c.body.trim() || looseMedia.length > 0) && (
        <Panel title={tr('توضیحات')}>
          {c.body.trim() && <RichText text={c.body} />}
          {looseMedia.length > 0 && <MediaGallery items={looseMedia} projectId={0} size="lg" onRemove={onRemoveMedia} />}
        </Panel>
      )}
    </div>
  );
}

/**
 * متنِ گام: پیوند کلیک‌پذیر، و `کد` بین دو بک‌تیک یک تکهٔ کپی‌شدنی —
 * نامِ کلاس یا attribute ای که وسطِ جمله آمده یک کلیک تا کپی فاصله دارد.
 * ⚠️ هیچ HTML ای از متن ساخته نمی‌شود؛ همه رشته‌اند و React فرارشان می‌دهد.
 */
export function InlineText({ text, inline = false }: { text: string; inline?: boolean }) {
  const pieces = text.split(/(`[^`\n]+`)/g);
  const body = pieces.map((piece, i) => {
    if (/^`[^`\n]+`$/.test(piece)) {
      return <CopyChip key={i} text={piece.slice(1, -1)} className="mx-0.5 px-1.5 py-0.5 align-middle" />;
    }
    return (
      <Fragment key={i}>
        {linkify(piece).map((part, j) => (part.kind === 'link'
          ? <a key={j} href={part.href} target="_blank" rel="noopener noreferrer nofollow" className="break-all text-primary underline-offset-4 hover:underline" dir="ltr">{part.text}</a>
          : <Fragment key={j}>{part.text}</Fragment>))}
      </Fragment>
    );
  });
  if (inline) return <span dir={textDir(text)}>{body}</span>;
  return <p className="text-sm leading-7 whitespace-pre-wrap" dir={textDir(text)}>{body}</p>;
}

/**
 * تصویرهای یک گام — بزرگ و با نسبتِ خودشان (اسکرین‌شاتِ Designer باید
 * خوانا باشد)، با بزرگ‌نماییِ تمام‌صفحه و قبلی/بعدی.
 */
function StepImages({ items }: { items: readonly MediaEntry[] }) {
  const tr = useT();
  const [zoom, setZoom] = useState<number | null>(null);
  const images = items.filter((m) => m.kind === 'image');
  const rest = items.filter((m) => m.kind !== 'image');
  const current = zoom === null ? null : images[zoom] ?? null;
  return (
    <div className="grid gap-2">
      {images.length > 0 && (
        <div className={images.length > 1 ? 'grid items-start gap-2 @2xl/main:grid-cols-2' : 'grid'}>
          {images.map((m, i) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setZoom(i)}
              aria-label={tr('بزرگ‌نمایی — {name}', { name: m.name })}
              className="block w-fit max-w-full overflow-hidden rounded-lg border bg-muted transition hover:opacity-95 focus-visible:ring-2 focus-visible:ring-ring"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- مسیرِ گیت‌شدهٔ فایل */}
              <img src={`/api/files/${m.fileId}`} alt={m.name} loading="lazy" className="max-h-96 w-auto max-w-full object-contain" />
            </button>
          ))}
        </div>
      )}
      {rest.length > 0 && <MediaGallery items={rest} projectId={0} />}
      <Lightbox
        src={current ? `/api/files/${current.fileId}` : null}
        alt={current?.name}
        onClose={() => setZoom(null)}
        onPrev={images.length > 1 ? () => setZoom((z) => (z === null ? z : (z - 1 + images.length) % images.length)) : undefined}
        onNext={images.length > 1 ? () => setZoom((z) => (z === null ? z : (z + 1) % images.length)) : undefined}
        position={images.length > 1 && zoom !== null ? `${zoom + 1} / ${images.length}` : undefined}
      />
    </div>
  );
}
