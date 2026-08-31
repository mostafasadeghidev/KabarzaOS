import Link from 'next/link';
import { Download, FileText } from 'lucide-react';
import { MyBidTab, type MyBidData } from './my-bid-tab';
import { t } from '@/i18n/server';

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
    <main className="@container/main flex flex-col gap-4 p-4 lg:p-6">
      <header className="grid gap-1">
        <Link href="/projects" className="text-xs text-muted-foreground hover:underline">
          {t("← پروژه‌ها")}
        </Link>
        <h1 className="text-xl font-semibold">{data.project.title}</h1>
        <p className="text-sm text-muted-foreground">
          {t("شما عضوِ این پروژه نیستید؛ این نما فقط برای پیشنهادِ قیمت است.")}
        </p>
      </header>

      {data.project.description && (
        <section className="rounded-md border p-3 text-sm whitespace-pre-line">
          {data.project.description}
        </section>
      )}

      <section className="rounded-md border p-3">
        <MyBidTab data={data.bid} />
      </section>

      {data.tasks.length > 0 && (
        <section className="grid gap-2">
          <h2 className="text-sm font-semibold">{t("تسک‌های نقشِ شما")}</h2>
          <p className="text-xs text-muted-foreground">
            {t("فقط‌خواندنی — برای برآوردِ کار پیش از قیمت‌دادن.")}
          </p>
          <ul className="grid gap-2">
            {data.tasks.map((t) => (
              <li key={t.id} className="rounded-md border p-3">
                <p className="text-sm font-medium">{t.title}</p>
                {t.description && (
                  <p className="mt-1 text-xs whitespace-pre-line text-muted-foreground">
                    {t.description}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.files.length > 0 && (
        <section className="grid gap-2">
          <h2 className="text-sm font-semibold">{t("فایل‌ها")}</h2>
          <ul className="grid gap-1">
            {data.files.map((f) => (
              <li key={f.id} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                <a
                  href={f.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 truncate hover:underline"
                >
                  {f.title}
                </a>
                {!f.isLink && (
                  <a href={`${f.href}?dl`} aria-label={t("دانلود")} className="text-muted-foreground">
                    <Download className="size-3.5" />
                  </a>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
