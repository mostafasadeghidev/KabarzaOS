import { cn } from '@/lib/utils';
import { linkify, videosIn, type VideoLink } from '@/domain/files/video';
import { VideoFrame } from './video-frame';
import { LinkCard } from './link-card';
import { extractLinkCards, linkTitle, providerName } from '@/domain/files/link-preview';

/**
 * متنِ کاربر با پیوندهای قابلِ کلیک — و ویدئوی لوم/یوتیوب/ویمئو که داخلِ متن
 * آمده، زیرِ آن پخش می‌شود (توضیحِ تسک، یادداشت، کامنت).
 *
 * ⚠️ هیچ HTML ای از متنِ کاربر ساخته نمی‌شود: تکه‌ها رشته‌اند و React
 * فرارشان می‌دهد؛ پیوند فقط http/https است و قابِ ویدئو فقط روی دامنهٔ ثابتِ
 * همان سرویس (`domain/files/video`).
 */
export function RichText({
  text,
  className,
  embeds = true,
  linkCards = false,
}: {
  text: string;
  className?: string;
  /** کارت‌های فشرده پیوند را کلیک‌پذیر می‌خواهند، نه پخش‌کننده. */
  embeds?: boolean;
  /**
   * خط‌های تک‌پیوند («Figma: https://…») کارت می‌شوند و پیوندِ وسطِ جمله به
   * نامِ کوتاهش کوتاه می‌شود (۲.۳.۰) — برای توضیحِ پروژه که نشانی‌های بلندِ
   * فیگما ناخوانایش می‌کرد.
   */
  linkCards?: boolean;
}) {
  if (text.trim() === '') return null;
  const split = linkCards ? extractLinkCards(text) : { text, cards: [] };
  const parts = split.text ? linkify(split.text) : [];
  const videos: Array<VideoLink & { href: string }> = embeds ? videosIn(text) : [];
  return (
    <div className="grid gap-2">
      {parts.length > 0 && (
      // ⚠️ dir="auto": متنِ انگلیسیِ کاربر در صفحهٔ راست‌به‌چپ نقطه‌اش را به اولِ خط می‌برد.
      <p dir="auto" className={cn('text-sm break-words whitespace-pre-wrap', className)}>
        {parts.map((part, i) => (part.kind === 'text' ? (
          <span key={i}>{part.text}</span>
        ) : (
          <a
            key={i}
            href={part.href}
            target="_blank"
            rel="noopener noreferrer nofollow"
            dir="ltr"
            title={linkCards ? part.href : undefined}
            className="break-all text-primary underline-offset-4 hover:underline"
          >
            {linkCards ? `${providerName(part.href)}: ${linkTitle(part.href)}` : part.text}
          </a>
        )))}
      </p>
      )}
      {split.cards.length > 0 && (
        <div className="grid max-w-3xl gap-2 @xl/main:grid-cols-2">
          {split.cards.map((c, i) => <LinkCard key={`${c.href}-${i}`} href={c.href} label={c.label} />)}
        </div>
      )}
      {videos.map((v) => <VideoFrame key={`${v.provider}:${v.id}`} video={v} />)}
    </div>
  );
}
