import { cn } from '@/lib/utils';
import { linkify, videosIn, type VideoLink } from '@/domain/files/video';
import { VideoFrame } from './video-frame';

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
}: {
  text: string;
  className?: string;
  /** کارت‌های فشرده پیوند را کلیک‌پذیر می‌خواهند، نه پخش‌کننده. */
  embeds?: boolean;
}) {
  if (text.trim() === '') return null;
  const parts = linkify(text);
  const videos: Array<VideoLink & { href: string }> = embeds ? videosIn(text) : [];
  return (
    <div className="grid gap-2">
      <p className={cn('text-sm break-words whitespace-pre-wrap', className)}>
        {parts.map((part, i) => (part.kind === 'text' ? (
          <span key={i}>{part.text}</span>
        ) : (
          <a
            key={i}
            href={part.href}
            target="_blank"
            rel="noopener noreferrer nofollow"
            dir="ltr"
            className="break-all text-primary underline-offset-4 hover:underline"
          >
            {part.text}
          </a>
        )))}
      </p>
      {videos.map((v) => <VideoFrame key={`${v.provider}:${v.id}`} video={v} />)}
    </div>
  );
}
