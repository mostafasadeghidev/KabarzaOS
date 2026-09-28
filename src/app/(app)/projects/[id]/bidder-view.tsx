import { Download, FileText, Link2 } from 'lucide-react';
import { MyBidTab, type MyBidData } from './my-bid-tab';
import { t } from '@/i18n/server';
import { PageHeader, PageShell, Section } from '@/components/page-shell';
import {
  Attachment, AttachmentAction, AttachmentActions, AttachmentContent, AttachmentMedia,
  AttachmentTitle, AttachmentTrigger,
} from '@/components/ui/attachment';

export interface BidderData {
  project: { id: number; title: string; description: string | null };
  tasks: Array<{ id: number; title: string; description: string | null }>;
  files: Array<{ id: number; title: string; href: string; isLink: boolean }>;
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
        description={t("شما عضوِ این پروژه نیستید؛ این نما فقط برای پیشنهادِ قیمت است.")}
      />

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
              <li key={t.id} className="rounded-lg border bg-card p-3">
                <p className="text-sm font-medium">{t.title}</p>
                {t.description && (
                  <p className="mt-1 text-xs whitespace-pre-line text-muted-foreground">
                    {t.description}
                  </p>
                )}
              </li>
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
                  <AttachmentMedia>{f.isLink ? <Link2 /> : <FileText />}</AttachmentMedia>
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
