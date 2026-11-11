'use client';

import { useMemo, useState } from 'react';
import { ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useT } from '@/i18n/client';

/**
 * متنِ HTML ِ ایمیل (۲.۶۲.۰).
 *
 * ⚠️ امنیت — HTML ِ ایمیل از بیرون می‌آید و هرگز در DOM ِ برنامه نمی‌نشیند:
 * - iframe با `srcdoc` و `sandbox` بی `allow-scripts` و بی `allow-same-origin`:
 *   هیچ اسکریپتی اجرا نمی‌شود و محتوا به کوکی و صفحهٔ برنامه دسترسی ندارد.
 * - CSP درونِ سند: هیچ درخواستی بیرون نمی‌رود (پیکسلِ ردیابی، فونت، فرم)؛ تصاویرِ
 *   بیرونی فقط با دکمهٔ «نمایشِ تصاویر».
 * - پیوندها در زبانهٔ تازه و بی‌ارجاع باز می‌شوند (`<base target="_blank">`).
 */
export function MailFrame({ html }: { html: string }) {
  const tr = useT();
  const [images, setImages] = useState(false);
  const hasRemote = /<img[^>]+src\s*=\s*["']?https?:/i.test(html) || /url\(\s*["']?https?:/i.test(html);

  const doc = useMemo(() => {
    /**
     * ⚠️ `<meta>` و `<base>` ِ خودِ ایمیل حذف می‌شوند: refresh ِ متا می‌توانست قابِ
     * ایمیل را به نشانیِ دیگری ببرد و base پیوندها را جابه‌جا کند. CSP ِ ما پیش از
     * محتوا می‌آید و CSP ِ دوم فقط سخت‌ترش می‌کند، نه آسان‌تر.
     */
    const body = html.replace(/<meta\b[^>]*>/gi, '').replace(/<base\b[^>]*>/gi, '');
    const imgSrc = images ? 'data: https: http:' : 'data:';
    const csp = `default-src 'none'; style-src 'unsafe-inline'; img-src ${imgSrc}; font-src data:; form-action 'none'`;
    return `<!doctype html><html><head><meta charset="utf-8">`
      + `<meta http-equiv="Content-Security-Policy" content="${csp}">`
      + `<meta name="referrer" content="no-referrer"><base target="_blank">`
      + `<style>body{margin:12px;font-family:system-ui,sans-serif;font-size:14px;color:#111;background:#fff;word-break:break-word}img{max-width:100%;height:auto}</style>`
      + `</head><body>${body}</body></html>`;
  }, [html, images]);

  return (
    <div className="grid gap-2">
      {hasRemote && !images && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <ImageIcon className="size-3.5" />
          {tr('تصاویرِ بیرونی برای حفظِ حریمِ خصوصی نشان داده نشد.')}
          <Button size="sm" variant="outline" onClick={() => setImages(true)}>{tr('نمایشِ تصاویر')}</Button>
        </div>
      )}
      <iframe
        title={tr('متنِ ایمیل')}
        srcDoc={doc}
        sandbox="allow-popups allow-popups-to-escape-sandbox"
        referrerPolicy="no-referrer"
        className="h-[70vh] w-full rounded-md border bg-white"
      />
    </div>
  );
}
