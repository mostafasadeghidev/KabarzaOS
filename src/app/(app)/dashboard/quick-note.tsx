'use client';

import { useEffect, useState } from 'react';
import { NotebookPen } from 'lucide-react';
import { useT } from '@/i18n/client';

/**
 * یادداشتِ سریعِ خودِ مدیر (نمونهٔ محلی) — فقط روی همین مرورگر ذخیره می‌شود (localStorage) و کسِ
 * دیگری نمی‌بیند. اگر پسندیده شود، باید به پایگاه‌داده برود تا روی هر دستگاهی یکی باشد.
 */
export function QuickNote({ userId }: { userId: number }) {
  const t = useT();
  const key = `kz-dash-note-${userId}`;
  const [text, setText] = useState('');
  const [saved, setSaved] = useState(true);
  useEffect(() => {
    try { setText(localStorage.getItem(key) ?? ''); } catch { /* خصوصی */ }
  }, [key]);
  useEffect(() => {
    if (saved) return;
    const id = setTimeout(() => {
      try { localStorage.setItem(key, text); } catch { /* پر */ }
      setSaved(true);
    }, 500);
    return () => clearTimeout(id);
  }, [text, saved, key]);

  return (
    <section className="grid content-start gap-2 rounded-2xl border bg-card p-4">
      <header className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-bold"><NotebookPen className="size-4 text-muted-foreground" />{t('یادداشتِ من')}</h2>
        <span className="text-[11px] text-muted-foreground">{saved ? t('ذخیره شد') : t('در حالِ ذخیره…')}</span>
      </header>
      <textarea
        value={text}
        onChange={(e) => { setText(e.target.value); setSaved(false); }}
        placeholder={t('کارهای خودم، یادداشتِ جلسه، هر چیزی… فقط خودتان می‌بینید.')}
        rows={5}
        dir="auto"
        className="min-h-28 w-full resize-y rounded-xl border bg-background/50 p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      />
    </section>
  );
}
