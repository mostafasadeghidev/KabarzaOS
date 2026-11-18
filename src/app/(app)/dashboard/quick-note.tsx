'use client';

import { useEffect, useState } from 'react';
import { NotebookPen } from 'lucide-react';
import { useT } from '@/i18n/client';
import { CardHelp } from '@/components/ui/card-help';
import { migrateLegacy, useDashPrefs } from './dash-prefs';

/**
 * یادداشتِ سریعِ خودِ کاربر — روی خودِ کاربر در پایگاه‌داده (۳.۱۸.۰، `users.dashboard_prefs.note`)، پس
 * روی هر دستگاهی یکی است و کسِ دیگری نمی‌بیند. ⚠️ یادداشتِ قدیمیِ مرورگر بارِ اول کوچ داده می‌شود.
 * در «دیدن به‌جای کاربر» فقط خواندنی است.
 */
export function QuickNote({ userId }: { userId: number }) {
  const t = useT();
  const dash = useDashPrefs();
  const key = `kz-dash-note-${userId}`;
  const [text, setText] = useState(dash.initial.note ?? '');
  const [saved, setSaved] = useState(true);
  useEffect(() => {
    if (dash.initial.note !== undefined) return;
    const raw = migrateLegacy(key, dash.readOnly, dash.saveNote);
    if (raw !== null) setText(raw);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useEffect(() => {
    if (saved) return;
    const id = setTimeout(() => {
      void dash.saveNote(text).then((ok) => { if (ok) setSaved(true); });
    }, 600);
    return () => clearTimeout(id);
  }, [text, saved, dash]);

  return (
    <section className="flex h-full min-h-0 flex-col gap-2 rounded-2xl border bg-card p-4">
      <header className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-bold"><NotebookPen className="size-4 text-muted-foreground" />{t('یادداشتِ من')}</h2>
        <span className="flex items-center gap-2">
          {!dash.readOnly && <span className="text-[11px] text-muted-foreground">{saved ? t('ذخیره شد') : t('در حالِ ذخیره…')}</span>}
          <CardHelp />
        </span>
      </header>
      <textarea
        value={text}
        readOnly={dash.readOnly}
        onChange={(e) => { setText(e.target.value); setSaved(false); }}
        placeholder={t('کارهای خودم، یادداشتِ جلسه، هر چیزی… فقط خودتان می‌بینید.')}
        rows={5}
        dir="auto"
        maxLength={20000}
        className="kz-grow min-h-28 w-full resize-y rounded-xl border bg-background/50 p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      />
    </section>
  );
}
