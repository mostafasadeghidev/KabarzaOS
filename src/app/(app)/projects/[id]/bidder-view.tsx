import { Download, FileText, Link2, Video } from 'lucide-react';
import { Thumb } from '@/components/thumb';
import { TagChip } from '@/components/ui/tag-chip';
import { Badge } from '@/components/ui/badge';
import { format } from '@/domain/money/money';
import { ltr } from '@/i18n/bidi';
import { MyBidTab, type MyBidData } from './my-bid-tab';
import { t } from '@/i18n/server';
import { PageHeader, PageShell, Section } from '@/components/page-shell';
import { Item, ItemContent, ItemDescription, ItemTitle } from '@/components/ui/item';
import {
  Attachment, AttachmentAction, AttachmentActions, AttachmentContent, AttachmentMedia,
  AttachmentTitle, AttachmentTrigger,
} from '@/components/ui/attachment';

export interface BidderData {
  project: {
    id: number; title: string; description: string | null;
    thumbnailFileId?: number | null; statusName?: string | null; statusColor?: string | null;
  };
  /** همهٔ نقش‌های مناقصه — باز، مالِ من، یا واگذارشده به دیگری. */
  roles?: Array<{ roleTagId: number; roleName: string; cap: string | null; state: 'open' | 'mine' | 'awarded' }>;
  tasks: Array<{
    id: number; title: string; description: string | null;
    priorityName?: string | null; priorityColor?: string | null;
  }>;
  files: Array<{ id: number; title: string; href: string; isLink: boolean; kind?: string }>;
  bid: MyBidData;
}

/**
 * نمای مناقصه‌گر — کسی که عضوِ پروژه نیست ولی نقشِ بازی دارد.
 *
 * ⚠️ عمداً تنگ است: عنوان و توضیحِ پروژه، **فقط تسک‌های نقشِ خودش**
 * (فقط‌خواندنی)، فایل‌ها، و فرمِ پیشنهاد. نه کامنت، نه مالی، نه اعضا، نه
 * تسکِ بقیه. این تنها راهی است که یک غیرعضو به پروژه می‌رسد.
 */
export function BidderView({ data }: { data: BidderData }) {
  return (
    // ⚠️ عرضِ خواندنی: همان قاعدهٔ تبِ «پیشنهادِ من» — متن و فرم، نه جدول.
    <PageShell width="reading">
      <PageHeader
        back={{ href: '/projects', label: t("پروژه‌ها") }}
        title={data.project.title}
        media={<Thumb id={data.project.id} title={data.project.title} fileId={data.project.thumbnailFileId ?? null} size={56} />}
        description={(
          <span className="flex flex-wrap items-center gap-2">
            {data.project.statusName && <TagChip color={data.project.statusColor}>{data.project.statusName}</TagChip>}
            {t("شما عضوِ این پروژه نیستید؛ این نما فقط برای پیشنهادِ قیمت است.")}
          </span>
        )}
      />

      {/*
        همهٔ نقش‌های مناقصه با سقف — «واگذار شد» برای نقشی که به دیگری رسید
        (dash-2 #159). مناقصه‌گر می‌بیند کلِ کار چیست، نه فقط سهمِ خودش.
      */}
      {data.roles && data.roles.length > 0 && (
        <Section title={t("نقش‌های مناقصه")}>
          <ul className="flex flex-wrap gap-2">
            {data.roles.map((r) => (
              <li key={r.roleTagId} className="flex items-center gap-1.5 rounded-lg border bg-card px-2.5 py-1.5 text-sm">
                <span className="font-medium">{r.roleName}</span>
                {/* ⚠️ بی `num`: جملهٔ فارسی است؛ فقط خودِ عدد چپ‌به‌راست می‌شود (ltr). */}
                <span className="text-xs text-muted-foreground">
                  {r.cap ? t('سقف {cap}', { cap: ltr(format(r.cap)) }) : t('بدون سقف')}
                </span>
                {r.state === 'awarded' && <Badge variant="outline">{t('واگذار شد')}</Badge>}
                {r.state === 'mine' && <Badge variant="success">{t('برنده')}</Badge>}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {data.project.description && (
        <section className="rounded-xl border bg-card p-3 text-sm whitespace-pre-line">
          {data.project.description}
        </section>
      )}

      {/* ⚠️ بی‌قابِ بیرونی: خودِ فرمِ پیشنهاد قاب دارد و دو مرزِ تودرتو شلوغ بود. */}
      <MyBidTab data={data.bid} />

      {data.tasks.length > 0 && (
        <Section
          title={t("تسک‌های نقشِ شما")}
          description={t("فقط‌خواندنی — برای برآوردِ کار پیش از قیمت‌دادن.")}
        >
          <ul className="grid gap-2">
            {data.tasks.map((t) => (
              <Item key={t.id} asChild variant="outline" size="sm" className="p-3">
                <li>
                  <ItemContent>
                    <ItemTitle className="flex-wrap">
                      {t.title}
                      {t.priorityName && <TagChip color={t.priorityColor}>{t.priorityName}</TagChip>}
                    </ItemTitle>
                    {t.description && (
                      <ItemDescription className="line-clamp-none text-xs whitespace-pre-line">
                        {t.description}
                      </ItemDescription>
                    )}
                  </ItemContent>
                </li>
              </Item>
            ))}
          </ul>
        </Section>
      )}

      {data.files.length > 0 && (
        <Section title={t("فایل‌ها")}>
          <ul className="grid gap-2">
            {data.files.map((f) => (
              <li key={f.id}>
                <Attachment size="sm" className="w-full">
                  {/* پیش‌نمایشِ تصویر و نشانِ ویدئو (dash-2 #157) — نسخهٔ کوچکِ گیت‌شده، نه اصلِ فایل. */}
                  <AttachmentMedia>
                    {f.kind === 'image'
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={`${f.href}?thumb`} alt="" className="size-full rounded-[inherit] object-cover" loading="lazy" />
                      : f.kind === 'video' ? <Video /> : f.isLink ? <Link2 /> : <FileText />}
                  </AttachmentMedia>
                  <AttachmentContent>
                    <AttachmentTitle>{f.title}</AttachmentTitle>
                  </AttachmentContent>
                  {!f.isLink && (
                    <AttachmentActions>
                      <AttachmentAction asChild aria-label={`${t("دانلود")} — ${f.title}`}>
                        <a href={`${f.href}?dl`}><Download /></a>
                      </AttachmentAction>
                    </AttachmentActions>
                  )}
                  <AttachmentTrigger asChild>
                    <a href={f.href} target="_blank" rel="noopener noreferrer" aria-label={f.title} />
                  </AttachmentTrigger>
                </Attachment>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </PageShell>
  );
}
