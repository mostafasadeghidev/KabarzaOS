'use client';

import { forwardRef, useImperativeHandle, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { embedUrl, PROVIDER_LABEL, type VideoLink } from '@/domain/files/video';
import { useT } from '@/i18n/client';

/** دستهٔ بیرونیِ پخش‌کننده — «برو به ثانیهٔ X» از فهرستِ موارد. */
export interface VideoFrameHandle {
  seek: (seconds: number) => void;
}

/**
 * پخش‌کنندهٔ قاب‌شدهٔ لوم/یوتیوب/ویمئو.
 *
 * ⚠️ پرش به زمان بی‌API ِ هر سرویس: آدرسِ قاب با زمانِ تازه و پخشِ خودکار
 * دوباره ساخته می‌شود. هر سه سرویس پارامترِ زمانِ شروع را می‌فهمند و این
 * راه به اسکریپتِ بیرونی نیاز ندارد.
 */
export const VideoFrame = forwardRef<VideoFrameHandle, { video: VideoLink & { href?: string } }>(
  function VideoFrame({ video }, ref) {
    const t = useT();
    const [src, setSrc] = useState(() => embedUrl(video));
    useImperativeHandle(ref, () => ({
      seek: (seconds) => setSrc(embedUrl(video, seconds, true)),
    }), [video]);

    return (
      <figure className="grid gap-1">
        <div className="relative aspect-video w-full overflow-hidden rounded-lg border bg-black">
          <iframe
            key={src}
            src={src}
            title={PROVIDER_LABEL[video.provider]}
            loading="lazy"
            allow="autoplay; fullscreen; picture-in-picture; clipboard-write"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            className="absolute inset-0 size-full"
          />
        </div>
        {video.href && (
          <figcaption className="flex justify-end">
            <a
              href={video.href}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ExternalLink className="size-3" />
              {t('بازکردن در {provider}', { provider: PROVIDER_LABEL[video.provider] })}
            </a>
          </figcaption>
        )}
      </figure>
    );
  },
);
