'use client';

import { useEffect } from 'react';

/**
 * برچسبِ خودکارِ جدول‌های پشته‌ای (۳.۱۵.۱) — برای هر `table[data-stack]`، متنِ سرستونِ هر ستون روی
 * خانه‌های همان ستون `data-label` می‌شود تا کارتِ گوشی بگوید هر عدد چیست. یک بار در چیدمان سوار است
 * و با MutationObserver جدول‌های تازه (تب، صفحه‌بندی، فیلتر) را هم می‌گیرد.
 *
 * ⚠️ قواعد:
 *  · برچسبی که خودِ خانه دارد (`data-label` ِ دستی) دست نمی‌خورد.
 *  · ستونِ اول برچسب نمی‌گیرد — عنوانِ کارت است.
 *  · سرستونِ خالی (ستونِ کنش‌ها) برچسب نمی‌دهد.
 *  · فقط خانه‌های بی colSpan؛ ردیفِ گروه (یک خانهٔ تمام‌عرض) همان‌طور می‌ماند.
 *  · خانهٔ بی‌مقدار («—») در کارت پنهان است (`data-stack-empty`) — کارتِ دفترکل پنج سطرِ «—» داشت.
 */
function label(root: ParentNode) {
  for (const table of root.querySelectorAll<HTMLTableElement>('table[data-stack]')) {
    const heads = [...table.querySelectorAll<HTMLTableCellElement>(':scope > thead > tr:last-child > th')]
      .map((th) => th.innerText.trim().replace(/\s+/g, ' '));
    if (heads.length === 0) continue;
    for (const row of table.querySelectorAll<HTMLTableRowElement>(':scope > tbody > tr')) {
      const cells = [...row.cells];
      if (cells.length !== heads.length) continue;
      cells.forEach((cell, i) => {
        // ⚠️ خانهٔ بی‌مقدار («—» یا خالی، بی دکمه و تصویر) در کارت پنهان می‌شود؛ هر بار از نو سنجیده
        // می‌شود چون مقدار ممکن است عوض شود. خانهٔ اول (عنوان) همیشه می‌ماند.
        const blank = i > 0 && /^[\s—–-]*$/.test(cell.textContent ?? '')
          && !cell.querySelector('button, a, input, select, textarea, img, svg, [role]');
        if (blank) cell.setAttribute('data-stack-empty', '');
        else cell.removeAttribute('data-stack-empty');
        if (i === 0 || cell.hasAttribute('data-label') || !heads[i]) return;
        cell.setAttribute('data-label', heads[i]!);
      });
    }
  }
}

export function TableStackLabels() {
  useEffect(() => {
    let raf = 0;
    const run = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => label(document)); };
    run();
    const observer = new MutationObserver(run);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => { observer.disconnect(); cancelAnimationFrame(raf); };
  }, []);
  return null;
}
