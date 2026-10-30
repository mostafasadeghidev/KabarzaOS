'use client';

import Link from 'next/link';
import { AlertTriangle, Zap } from 'lucide-react';
import { useT } from '@/i18n/client';
import { lines, LIBRARY_OPTION_ROLES, OPTION_ROLE_LABELS, optionKey, PLACEMENT_SHORT_LABELS } from '@/domain/library/model';
import type { EntryDetail } from '@/server/library/service';
import { CodeView, PlacementCopyBar } from './code-view';
import { CopyChip } from './option-card';
import { VersionLabel } from './entry-bits';

/**
 * «کارتِ سریع» (۲.۴۷.۰) — برای کسی که این مورد را قبلاً نصب کرده و فقط
 * می‌خواهد کپی کند: پیش‌نیازها، همهٔ کدها و همهٔ گزینه‌ها در یک صفحهٔ فشرده،
 * هر نام و مقدار با یک کلیک. ⚠️ توضیح و تصویر عمداً نیست — آموزشِ کامل یک
 * کلیک آن‌طرف‌تر است.
 */
export function QuickCard({ entry }: { entry: EntryDetail }) {
  const tr = useT();
  const warnings = lines(entry.warnings);
  const deps = lines(entry.dependencies);
  const important = entry.options.filter((o) => o.important);
  return (
    <div className="grid gap-4 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-bold">
          <Zap className="size-4 text-primary" aria-hidden />
          {tr('کارتِ سریع')}
        </h2>
        <PlacementCopyBar blocks={entry.blocks} />
      </div>

      {(entry.requires.length > 0 || deps.length > 0) && (
        <section className="grid gap-1.5">
          <h3 className="text-xs font-semibold text-muted-foreground">{tr('پیش‌نیازها')}</h3>
          <div className="flex flex-wrap gap-1.5">
            {entry.requires.map((r) => (
              <Link key={r.id} href={`/library/${r.id}`} className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs hover:border-primary/40" dir="auto">
                {r.title}
                <VersionLabel label={r.versionLabel} />
              </Link>
            ))}
            {deps.map((d) => <span key={d} className="rounded-md bg-muted px-2 py-1 text-xs" dir="auto">{d}</span>)}
          </div>
        </section>
      )}

      {entry.blocks.length > 0 && (
        <section className="grid gap-2">
          <h3 className="text-xs font-semibold text-muted-foreground">{tr('کدها')}</h3>
          {entry.blocks.map((b, i) => (
            <CodeView
              key={i}
              code={b.code}
              language={b.language}
              label={b.label || tr(PLACEMENT_SHORT_LABELS[b.placement])}
              placement={b.placement}
              placementNote={b.placementNote}
              collapseAt={8}
            />
          ))}
        </section>
      )}

      {entry.options.length > 0 && (
        <section className="grid gap-3">
          <h3 className="text-xs font-semibold text-muted-foreground">{tr('گزینه‌ها')}</h3>
          {LIBRARY_OPTION_ROLES.map((role) => {
            const list = entry.options.filter((o) => o.role === role);
            if (list.length === 0) return null;
            return (
              <div key={role} className="grid gap-1.5">
                <span className="text-[11px] font-medium text-muted-foreground">{tr(OPTION_ROLE_LABELS[role])}</span>
                <ul className="grid gap-1.5">
                  {list.map((o) => (
                    <li key={optionKey(o)} className="flex flex-wrap items-center gap-1.5">
                      <CopyChip text={o.name} />
                      {o.value && <><span className="text-muted-foreground" aria-hidden>=</span><CopyChip text={o.value} /></>}
                      {!o.value && o.allowedValues.length > 0 && (
                        <>
                          <span className="text-muted-foreground" aria-hidden>=</span>
                          {o.allowedValues.map((a) => <CopyChip key={a.value} text={a.value} className="opacity-90" />)}
                        </>
                      )}
                      {o.element && <span className="text-[11px] text-muted-foreground" dir="auto">· {o.element}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </section>
      )}

      {(warnings.length > 0 || important.length > 0) && (
        <section className="grid gap-1 rounded-lg bg-amber-50 p-3 text-[13px] text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
          <span className="flex items-center gap-1.5 text-xs font-semibold"><AlertTriangle className="size-3.5" aria-hidden />{tr('مهم')}</span>
          <ul className="grid list-disc gap-0.5 ps-4">
            {warnings.map((w) => <li key={w} dir="auto">{w}</li>)}
            {important.map((o) => <li key={optionKey(o)} dir="auto"><code dir="ltr" className="font-mono text-xs">{o.name}</code>: {o.important}</li>)}
          </ul>
        </section>
      )}
    </div>
  );
}
