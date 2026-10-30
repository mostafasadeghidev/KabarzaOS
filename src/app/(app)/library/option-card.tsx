'use client';

import { useState } from 'react';
import { AlertTriangle, Check, Copy } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Hint } from '@/components/ui/tooltip';
import { useToast } from '@/components/ui/toast';
import { useT } from '@/i18n/client';
import { cn } from '@/lib/utils';
import { textDir } from './entry-bits';
import {
  LIBRARY_OPTION_ROLES, OPTION_KIND_LABELS, OPTION_ROLE_HINTS, OPTION_ROLE_LABELS, optionKey, type CleanOption,
} from '@/domain/library/model';

/**
 * کارتِ کاملِ یک گزینه (۲.۴۷.۰) — نام و مقدار هر کدام با یک کلیک کپی می‌شوند،
 * و هر چیزی که نصب‌کننده لازم دارد کنارش است: روی چه المنتی، داخلِ کدام المنت،
 * مقدارهای مجاز، نکتهٔ «مهم» و مثال.
 *
 * ⚠️ در Webflow نام و مقدارِ attribute دو فیلدِ جدایند؛ برای همین دو دکمهٔ
 * کپیِ جدا، نه یک رشتهٔ «name=value».
 */

/** تکه‌متنی که با کلیک کپی می‌شود — نام، مقدار، مثال. */
export function CopyChip({ text, className, label }: { text: string; className?: string; label?: string }) {
  const tr = useT();
  const { show } = useToast();
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      show(tr('کپی شد.'));
      setTimeout(() => setDone(false), 1200);
    } catch {
      show(tr('کپی نشد؛ دستی انتخاب کنید.'), 'error');
    }
  };
  return (
    <Hint label={tr('کلیک برای کپی')}>
      <button
        type="button"
        onClick={copy}
        aria-label={label ? `${label}: ${text}` : text}
        className={cn(
          'group/chip inline-flex max-w-full items-center gap-1.5 rounded-md border bg-muted/60 px-2 py-1 text-start font-mono text-xs transition-colors hover:border-primary/40 hover:bg-primary/5',
          className,
        )}
        dir="ltr"
      >
        <span className="min-w-0 break-all">{text}</span>
        {done
          ? <Check className="size-3 shrink-0 text-emerald-600" aria-hidden />
          : <Copy className="size-3 shrink-0 text-muted-foreground opacity-60 group-hover/chip:opacity-100" aria-hidden />}
      </button>
    </Hint>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 text-[13px] sm:grid-cols-[7.5rem_minmax(0,1fr)] sm:gap-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function OptionCard({ option, compactRole = false }: { option: CleanOption; compactRole?: boolean }) {
  const tr = useT();
  const o = option;
  return (
    <article className="grid gap-2.5 rounded-lg border bg-card p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <CopyChip text={o.name} label={tr('نام')} className="font-semibold" />
        {o.value && (
          <>
            <span className="text-muted-foreground" aria-hidden>=</span>
            <CopyChip text={o.value} label={tr('مقدار')} />
          </>
        )}
        <span className="ms-auto flex items-center gap-1">
          {!compactRole && o.role === 'required' && <Badge variant="warning">{tr(OPTION_ROLE_LABELS.required)}</Badge>}
          <Badge variant="outline" className="text-[10px]">{tr(OPTION_KIND_LABELS[o.kind])}</Badge>
        </span>
      </div>
      {o.description && <p className="text-sm leading-6" dir={textDir(o.description)}>{o.description}</p>}
      {(o.element || o.target || o.defaultValue || o.allowedValues.length > 0 || o.example) && (
        <div className="grid gap-2 border-t pt-2.5">
          {o.element && <Detail label={tr('روی چه المنتی')}><span dir="auto">{o.element}</span></Detail>}
          {o.target && <Detail label={tr('داخل یا روی')}><span dir="auto">{o.target}</span></Detail>}
          {o.allowedValues.length > 0 && (
            <Detail label={tr('مقدارهای مجاز')}>
              <ul className="grid gap-1.5">
                {o.allowedValues.map((a) => (
                  <li key={a.value} className="flex flex-wrap items-baseline gap-2">
                    <CopyChip text={a.value} />
                    {a.description && <span className="text-[13px] text-muted-foreground" dir="auto">{a.description}</span>}
                    {a.value === o.defaultValue && <Badge variant="secondary" className="text-[10px]">{tr('پیش‌فرض')}</Badge>}
                  </li>
                ))}
              </ul>
            </Detail>
          )}
          {o.defaultValue && !o.allowedValues.some((a) => a.value === o.defaultValue) && (
            <Detail label={tr('پیش‌فرض')}><code dir="ltr" className="font-mono text-xs">{o.defaultValue}</code></Detail>
          )}
          {o.example && <Detail label={tr('مثال')}><CopyChip text={o.example} /></Detail>}
        </div>
      )}
      {o.important && (
        <div className="flex items-start gap-2 rounded-md bg-amber-50 px-2.5 py-2 text-[13px] text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span dir={textDir(o.important)}><strong className="font-semibold">{tr('مهم:')}</strong> {o.important}</span>
        </div>
      )}
    </article>
  );
}

/** گزینه‌ها در سه گروه: لازم، المنتِ اختیاری، تنظیمِ اختیاری. */
export function OptionGroups({ options }: { options: readonly CleanOption[] }) {
  const tr = useT();
  const groups = LIBRARY_OPTION_ROLES.map((role) => ({ role, list: options.filter((o) => o.role === role) }))
    .filter((g) => g.list.length > 0);
  return (
    <div className="grid gap-5">
      {groups.map((g) => (
        <section key={g.role} className="grid gap-2">
          <div className="grid gap-0.5">
            <h3 className="text-sm font-bold">{tr(OPTION_ROLE_LABELS[g.role])}</h3>
            <p className="text-xs text-muted-foreground">{tr(OPTION_ROLE_HINTS[g.role])}</p>
          </div>
          <div className="grid gap-2 @3xl/main:grid-cols-2">
            {g.list.map((o) => <OptionCard key={optionKey(o)} option={o} compactRole />)}
          </div>
        </section>
      ))}
    </div>
  );
}
