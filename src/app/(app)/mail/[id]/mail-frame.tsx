'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useT } from '@/i18n/client';

/**
 * متنِ HTML ِ ایمیل (۲.۶۲.۰، ظاهرِ هماهنگ ۲.۶۲.۱).
 *
 * ⚠️ امنیت — HTML ِ ایمیل از بیرون می‌آید و هرگز در DOM ِ برنامه نمی‌نشیند:
 * - iframe با `srcdoc` و `sandbox` ِ **بی `allow-scripts`**: هیچ اسکریپتی اجرا
 *   نمی‌شود. `allow-same-origin` فقط برای این است که صفحه ارتفاعِ محتوا را بخواند
 *   — بی اسکریپت، محتوا خودش به هیچ چیزِ برنامه دست نمی‌زند.
 * - CSP درونِ سند پیش از محتوا: هیچ درخواستی بیرون نمی‌رود (پیکسلِ ردیابی، فونت،
 *   فرم)؛ تصاویرِ بیرونی فقط با «نمایشِ تصاویر». CSP ِ دوم فقط سخت‌ترش می‌کند.
 * - `<meta>` و `<base>` ِ خودِ ایمیل حذف می‌شوند (refresh و جابه‌جاییِ پیوندها).
 * - پیوندها در زبانهٔ تازه و بی‌ارجاع.
 *
 * ظاهر: ایمیلِ ساده رنگ و قلمِ برنامه را می‌گیرد (روشن یا تیره). ایمیلِ «طراحی‌شده»
 * (پس‌زمینه یا جدولِ خودش را دارد) روی کاغذِ سفید می‌ماند تا متنِ تیره‌اش روی
 * زمینهٔ تیره گم نشود.
 */
export function MailFrame({ html }: { html: string }) {
  const tr = useT();
  const frame = useRef<HTMLIFrameElement>(null);
  const [images, setImages] = useState(false);
  const [height, setHeight] = useState(160);
  const [theme, setTheme] = useState<{ fg: string; link: string; font: string; scheme: string } | null>(null);
  const hasRemote = /<img[^>]+src\s*=\s*["']?https?:/i.test(html) || /url\(\s*["']?https?:/i.test(html);
  const designed = /\b(bgcolor|background(-color)?\s*[:=])|<table\b/i.test(html);

  // رنگ و قلمِ همین لحظهٔ برنامه — با عوض شدنِ پوسته (روشن/تیره) هم به‌روز می‌شود.
  useEffect(() => {
    const read = () => {
      const s = getComputedStyle(document.body);
      const probe = document.createElement('a');
      probe.className = 'text-primary';
      document.body.appendChild(probe);
      const link = getComputedStyle(probe).color;
      probe.remove();
      // ⚠️ همان color-scheme ِ صفحه: اگر قاب و صفحه فرق کنند، مرورگر زمینهٔ قاب را مات (سفید) می‌کند.
      const scheme = getComputedStyle(document.documentElement).colorScheme || 'normal';
      setTheme({ fg: s.color, link, font: s.fontFamily, scheme });
    };
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] });
    return () => observer.disconnect();
  }, []);

  const doc = useMemo(() => {
    const body = html.replace(/<meta\b[^>]*>/gi, '').replace(/<base\b[^>]*>/gi, '');
    const imgSrc = images ? 'data: https: http:' : 'data:';
    const csp = `default-src 'none'; style-src 'unsafe-inline'; img-src ${imgSrc}; font-src data:; form-action 'none'`;
    const style = designed || !theme
      ? 'html{color-scheme:light}body{margin:0;padding:20px;background:#fff;color:#111;font-family:system-ui,sans-serif;font-size:14px;line-height:1.6}'
      : `html{color-scheme:${theme.scheme};background:transparent}body{margin:0;padding:4px 2px;background:transparent;color:${theme.fg};font-family:${theme.font};font-size:14px;line-height:1.8}a{color:${theme.link}}blockquote{margin:8px 0;padding-inline-start:12px;border-inline-start:3px solid currentColor;opacity:.75}`;
    return `<!doctype html><html><head><meta charset="utf-8">`
      + `<meta http-equiv="Content-Security-Policy" content="${csp}">`
      + `<meta name="referrer" content="no-referrer"><base target="_blank">`
      + `<style>${style}body{word-break:break-word;overflow-wrap:anywhere}img{max-width:100%;height:auto}table{max-width:100%}pre{white-space:pre-wrap}</style>`
      + `</head><body dir="auto">${body}</body></html>`;
  }, [html, images, designed, theme]);

  /** ارتفاعِ واقعیِ محتوا — قاب به اندازهٔ ایمیل، نه یک پنجرهٔ ثابت با اسکرولِ دوم. */
  const measure = useCallback(() => {
    const d = frame.current?.contentDocument;
    if (!d?.documentElement) return;
    setHeight(Math.max(120, Math.ceil(d.documentElement.scrollHeight) + 2));
  }, []);

  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    let observer: ResizeObserver | null = null;
    const onLoad = () => {
      measure();
      const d = el.contentDocument;
      if (d?.body) {
        observer?.disconnect();
        observer = new ResizeObserver(measure);
        observer.observe(d.body);
      }
    };
    el.addEventListener('load', onLoad);
    return () => { el.removeEventListener('load', onLoad); observer?.disconnect(); };
  }, [measure, doc]);

  return (
    <div className="grid gap-3">
      {hasRemote && !images && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
          <ImageIcon className="size-3.5" />
          <span className="flex-1">{tr('تصاویرِ بیرونی برای حفظِ حریمِ خصوصی نشان داده نشد.')}</span>
          <Button size="sm" variant="outline" onClick={() => setImages(true)}>{tr('نمایشِ تصاویر')}</Button>
        </div>
      )}
      <iframe
        ref={frame}
        title={tr('متنِ ایمیل')}
        srcDoc={doc}
        sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        referrerPolicy="no-referrer"
        style={{ height }}
        className={designed ? 'w-full rounded-lg border bg-white' : 'w-full bg-transparent'}
      />
    </div>
  );
}
