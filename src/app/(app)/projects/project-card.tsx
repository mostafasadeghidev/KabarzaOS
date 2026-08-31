'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ChevronDown, CornerDownLeft, MessageSquare, ListChecks } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { format } from '@/domain/money/money';
import { summarizeProject } from '@/domain/team-money/payments';
import { deadlineBar, deadlineLabel, taskProgress } from '@/domain/projects/deadline';
import type { ProjectListRow } from '@/server/projects/repository';
import { Thumb } from '@/components/thumb';
import { StatusPicker, type StatusOption } from './status-picker';
import { CardQuickAdd, type CardOptions } from './card-quick-add';
import { useT } from '@/i18n/client';

/**
 * کارتِ پروژه — بازسازیِ.
 *
 * ترتیبِ بخش‌ها عیناً همان است: سرصفحه (عنوان + چیپِ وضعیت + مونوگرام) ←
 * پیوندِ والد/فرزند ← مبلغِ پنهان ← نوارِ ددلاین ← شمارنده‌های ریویو ←
 * نوارِ پیشرفت ← چیپِ کارفرما و تیم ← دکمهٔ مشاهده.
 */

/** رنگِ نوارِ ددلاین بر پایهٔ فوریت — همان پله‌های نسخهٔ قبلی. */
const URGENCY: Record<string, { bar: string; text: string }> = {
  normal: { bar: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400' },
  warn: { bar: 'bg-amber-500', text: 'text-amber-600 dark:text-amber-500' },
  soon: { bar: 'bg-orange-500', text: 'text-orange-600 dark:text-orange-500' },
  over: { bar: 'bg-destructive', text: 'text-destructive' },
};

/**
 * مبلغ به‌صورتِ پیش‌فرض پوشانده است — دقیقاً مثلِ نسخهٔ قبلی.
 * ⚠️ عمدی است: کارت‌ها روی نمایشگرِ مشترک باز می‌مانند و مبلغِ پروژه نباید
 * بی‌اجازه دیده شود.
 */
function MaskedPrice({ value }: { value: string }) {
  const t = useT();
  const [shown, setShown] = useState(false);
  return (
    <button
      type="button"
      onClick={() => setShown((s) => !s)}
      title={t("برای نمایش/پنهان‌کردن کلیک کنید")}
      className="num font-semibold tracking-wider text-foreground tabular-nums"
    >
      {shown ? value : '•••••'}
    </button>
  );
}

export function ProjectCard({
  project,
  today,
  statuses,
  cardOptions,
}: {
  project: ProjectListRow;
  today: string;
  statuses: StatusOption[];
  /** حاضر بودنش یعنی کاربر مجوزِ مدیریت دارد. */
  cardOptions: CardOptions | null;
}) {
  const tr = useT();
  const t = useT();
  const bar = deadlineBar(project.deadline, project.regDate, today);
  const percent = taskProgress(project.doneTaskCount, project.totalTaskCount);
  const urgency = bar ? URGENCY[bar.urgency]! : null;

  return (
    <Card className="relative gap-3 overflow-hidden py-4 shadow-xs transition-colors hover:bg-muted/30">
      {/* نوارهای گوشه — بایگانی و مناقصه، مثلِ ribbonهای نسخهٔ قبلی. */}
      <div className="absolute top-0 end-0 flex">
        {project.isArchived && (
          <span className="bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
            بایگانی
            {/* R-PROJ-07 — «سبک» یعنی جزئیاتش پاک و خلاصه‌اش منجمد شده. */}
            {project.isLightened && ' · سبک'}
          </span>
        )}
        {project.isTender && (
          <span className="bg-violet-600 px-2 py-0.5 text-[10px] text-white">
            مناقصه
            {project.bidCount > 0 && <> · <span className="num">{project.bidCount}</span></>}
          </span>
        )}
      </div>

      <CardHeader className="gap-2 px-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <Link
              href={`/projects/${project.id}`}
              className="block text-sm leading-snug font-semibold hover:underline"
            >
              {project.title}
            </Link>
            <div className="mt-1">
              <StatusPicker
                projectId={project.id}
                name={project.statusName}
                group={project.statusGroup}
                options={statuses}
                canManage={cardOptions !== null}
              />
            </div>
          </div>
          <Thumb id={project.id} title={project.title} fileId={project.thumbnailFileId} />
        </div>

        {/* والد یا فرزندان — پیوند به کارتِ آن پروژه. */}
        {project.parentId !== null ? (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <CornerDownLeft className="size-3" />
              {tr("پیروِ:")}
            <Link href={`/projects/${project.parentId}`} className="text-foreground hover:underline">
              {project.parentTitle}
            </Link>
          </div>
        ) : project.children.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
            <ChevronDown className="size-3" />
            زیرپروژه‌ها:
            {project.children.map((c, i) => (
              <span key={c.id}>
                <Link href={`/projects/${c.id}`} className="text-foreground hover:underline">
                  {c.title}
                </Link>
                {i < project.children.length - 1 && '، '}
              </span>
            ))}
          </div>
        ) : null}
      </CardHeader>

      <CardContent className="grid gap-3 px-4">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">{t("مبلغ")}</span>
          {/*
            R-TEAM-04 — «مبلغ» جمعِ قیمت و هزینه‌های قابلِ‌صورتحساب است،
            نه قیمتِ تنها؛ کارفرما همین جمع را بدهکار است.
          */}
          <MaskedPrice
            value={format(
              String(summarizeProject(project.price, project.billableExpenses, '0').totalDue),
            )}
          />
        </div>

        {/* نوارِ ددلاین — پر می‌شود و روزهای مانده را نشان می‌دهد. */}
        {bar && urgency && (
          <div className="grid gap-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground">{t("ددلاین")}</span>
              <span className={urgency.text}>{deadlineLabel(bar.daysLeft)}</span>
              <span className="num text-muted-foreground">{project.deadline}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div className={`h-full ${urgency.bar}`} style={{ width: `${bar.percent}%` }} />
            </div>
          </div>
        )}

        {/* دو شمارندهٔ ریویو — تسک و کامنت. */}
        <div className="flex gap-4 text-xs">
          <Link
            href={`/projects/${project.id}`}
            className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
            title={t("تسک‌های نیازمند ریویو")}
          >
            <ListChecks className="size-3.5" />
              {tr("تسک‌ها")}
            <b className="num">{project.reviewCount}</b>
          </Link>
          <Link
            href={`/projects/${project.id}`}
            className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
            title={t("کامنت‌های نیازمند بررسی")}
          >
            <MessageSquare className="size-3.5" />
              {tr("کامنت")}
            <b className="num">{project.commentReviewCount}</b>
          </Link>
        </div>

        {/* پیشرفتِ تسک‌ها. */}
        <Link href={`/projects/${project.id}`} className="grid gap-1" title={t("مشاهدهٔ تسک‌ها")}>
          <div className="relative h-4 overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-primary/70" style={{ width: `${percent}%` }} />
            <b className="num absolute inset-0 flex items-center justify-center text-[10px] font-semibold">
              {percent}%
            </b>
          </div>
          <small className="num text-[11px] text-muted-foreground">
            {project.doneTaskCount}/{project.totalTaskCount} تسک
          </small>
        </Link>

        {/* جعبهٔ چیپ‌ها — کارفرمایان بالا، اعضا پایین. */}
        <div className="rounded-md border border-dashed p-2">
          {project.clients.length === 0 && project.members.length === 0 ? (
            <span className="text-xs text-muted-foreground">{t("هنوز کسی ساین نشده")}</span>
          ) : (
            <div className="flex flex-wrap gap-1">
              {project.clients.map((name, i) => (
                <Badge key={`c${i}`} className="bg-sky-600 text-white hover:bg-sky-600">
                  {name}
                </Badge>
              ))}
              {project.members.map((m, i) => (
                <Badge key={`m${i}`} variant="secondary">
                  {m.name}
                  {m.roleName && <> · {m.roleName}</>}
                </Badge>
              ))}
            </div>
          )}
        </div>

        {/* افزودنِ سریع — زیرِ جعبهٔ چیپ‌ها، دقیقاً مثلِ نسخهٔ قبلی. */}
        {cardOptions && <CardQuickAdd projectId={project.id} options={cardOptions} />}

        <div className="flex justify-end">
          <Button asChild size="sm" variant="outline">
            <Link href={`/projects/${project.id}`}>{t("مشاهده")}</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
