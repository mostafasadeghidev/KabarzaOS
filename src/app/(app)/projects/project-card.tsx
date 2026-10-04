'use client';

import { UserAvatar } from '@/components/user-avatar';
import Link from 'next/link';
import { useState } from 'react';
import { ChevronDown, CornerDownLeft, MessageSquare, ListChecks } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { format } from '@/domain/money/money';
import { summarizeProject } from '@/domain/team-money/payments';
import { deadlineBar, deadlineLabel, taskProgress } from '@/domain/projects/deadline';
import type { VisibleProjectRow } from '@/server/projects/service';
import { Thumb } from '@/components/thumb';
import { StatusPicker, type StatusOption } from './status-picker';
import { CardQuickAdd, type CardOptions } from './card-quick-add';
import { useT } from '@/i18n/client';
import { Hint } from '@/components/ui/tooltip';

/**
 * کارتِ پروژه — بازسازیِ.
 *
 * ترتیبِ بخش‌ها عیناً همان است: سرصفحه (عنوان + چیپِ وضعیت + مونوگرام) ←
 * پیوندِ والد/فرزند ← مبلغِ پنهان ← نوارِ ددلاین ← شمارنده‌های ریویو ←
 * نوارِ پیشرفت ← چیپِ کارفرما و تیم ← افزودنِ سریع ← دکمهٔ مشاهده.
 */

/** رنگِ نوارِ ددلاین بر پایهٔ فوریت — همان پله‌های نسخهٔ قبلی. */
const URGENCY: Record<string, { bar: string; text: string }> = {
  normal: { bar: 'bg-emerald-500', text: 'text-emerald-700 dark:text-emerald-400' },
  warn: { bar: 'bg-amber-500', text: 'text-amber-700 dark:text-amber-500' },
  soon: { bar: 'bg-orange-500', text: 'text-orange-700 dark:text-orange-500' },
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
    <Hint label={t("برای نمایش/پنهان‌کردن کلیک کنید")}>
      <button
        type="button"
        onClick={() => setShown((s) => !s)}
        aria-label={t("برای نمایش/پنهان‌کردن کلیک کنید")}
        className="num font-semibold tracking-wider text-foreground tabular-nums"
      >
        {shown ? value : '•••••'}
      </button>
    </Hint>
  );
}

export function ProjectCard({
  project,
  today,
  statuses,
  cardOptions,
}: {
  project: VisibleProjectRow;
  today: string;
  statuses: StatusOption[];
  /** حاضر بودنش یعنی کاربر مجوزِ مدیریت دارد. */
  cardOptions: CardOptions | null;
}) {
  const tr = useT();
  const t = useT();
  /**
   * ⚠️ پروژهٔ تمام‌شده یا کنسل‌شده نوارِ ددلاین ندارد (نسخهٔ قبلی هم نداشت):
   * «۴۰ روز گذشته» ِ قرمز روی کاری که تحویل شده، هشدارِ دروغ بود. تاریخ می‌ماند.
   */
  const finished = project.statusGroup === 'completed' || project.statusGroup === 'cancelled';
  const bar = finished ? null : deadlineBar(project.deadline, project.regDate, today);
  const percent = taskProgress(project.doneTaskCount, project.totalTaskCount);
  const urgency = bar ? URGENCY[bar.urgency]! : null;

  /*
   * ⚠️ بی‌سایه (DESIGN.md §۵): سطحِ سفید روی کاغذِ زمینه خودش جداست.
   * بازخوردِ «کلیک‌خور» مرزِ پررنگ‌تر در hover است، نه سایهٔ بزرگ‌شونده.
   *
   * ⚠️ هم‌ترازی با کارت‌های کناری — subgrid: کارت ۹ ردیف از شبکهٔ والد را
   * می‌گیرد (`row-span-9`) و ردیف‌هایش را از همان‌جا برمی‌دارد
   * (`grid-rows-subgrid`). ارتفاعِ هر ردیف بلندترین نسخهٔ آن بخش در ردیفِ
   * کارت‌هاست، پس ددلاین، نوارِ پیشرفت و دکمهٔ مشاهده در همهٔ کارت‌های یک
   * ردیف روی یک خط می‌نشینند — هر قدر هم عنوان یا چیپ‌های بالایشان بلند باشد.
   *   - هر بخش **همیشه** یک فرزندِ مستقیم است، حتی خالی: بخشِ غایب بخش‌های
   *     بعدی را یک ردیف بالا می‌کشد. شمارِ فرزندانِ درون‌جریان = ۹.
   *   - فاصله `pt` ِ خودِ بخش است و `gap` صفر: ردیفی که در هیچ کارتی محتوا
   *     ندارد (پیوندِ والد، مبلغ برای عضو، افزودنِ سریع برای غیرمدیر) باید
   *     صفر شود، ولی gap دو طرفش می‌ماند. فاصلهٔ عمودیِ کارت‌ها هم به همین
   *     دلیل `mb-3` است نه `gap-y` ِ شبکه (← project-grid).
   */
  return (
    <Card className="relative row-span-9 mb-3 grid grid-rows-subgrid gap-0 overflow-clip px-4 py-4 transition-colors hover:border-input">
      {/* نوارهای گوشه — بایگانی و مناقصه، مثلِ ribbonهای نسخهٔ قبلی. absolute است و ردیفی نمی‌گیرد. */}
      <div className="absolute top-0 end-0 flex">
        {project.isArchived && (
          <span className="bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
            {t('بایگانی')}
            {/* R-PROJ-07 — «سبک» یعنی جزئیاتش پاک و خلاصه‌اش منجمد شده. */}
            {project.isLightened && ` · ${t('سبک')}`}
          </span>
        )}
        {/* فقط مناقصهٔ **باز** روبان دارد — مناقصهٔ بسته/کنسل‌شده نه. */}
        {project.tenderOpen && (
          <span className="bg-violet-50 px-2 py-0.5 text-[10px] text-violet-800 dark:bg-violet-500/15 dark:text-violet-300">
            {t('مناقصه')}
            {project.bidCount > 0 && <> · <span className="num">{project.bidCount}</span></>}
          </span>
        )}
      </div>

      {/* ۱ · سرصفحه */}
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
              statusId={project.statusTagId}
              options={statuses}
              canManage={cardOptions !== null}
            />
          </div>
        </div>
        {/* افقی، ۱۰۵×۵۵ — تصویرِ سایت/پروژه در قابِ مربع بیش از حد بریده می‌شد. */}
        <Thumb id={project.id} title={project.title} fileId={project.thumbnailFileId} size={105} height={55} />
      </div>

      {/* ۲ · والد یا فرزندان — پیوند به کارتِ آن پروژه. */}
      <div>
        {project.parentId !== null ? (
          <div className="flex items-center gap-1 pt-2 text-xs text-muted-foreground">
            <CornerDownLeft className="size-3" />
            {tr("پیروِ:")}
            <Link href={`/projects/${project.parentId}`} className="text-foreground hover:underline">
              {project.parentTitle}
            </Link>
          </div>
        ) : project.children.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1 pt-2 text-xs text-muted-foreground">
            <ChevronDown className="size-3" />
            {t('زیرپروژه‌ها:')}
            {project.children.map((c, i) => (
              <span key={c.id}>
                <Link href={`/projects/${c.id}`} className="text-foreground hover:underline">
                  {c.title}
                </Link>
                {i < project.children.length - 1 && t('، ')}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      {/*
        ۳ · مبلغ.
        ⚠️ ردیفِ «مبلغ» فقط برای کسی که حقِ دیدنِ قیمت دارد — مالک/مدیرِ
        مالی و کارفرمای همین پروژه. سرویس قیمت را برای بقیه صفر می‌فرستد
        (`maskPrices`)، پس نشان‌دادنِ «۰» گمراه‌کننده بود.
      */}
      <div>
        {project.canSeePrice && (
          <div className="flex items-center justify-between pt-3 text-xs">
            <span className="text-muted-foreground">{t("مبلغ")}</span>
            {/*
              R-TEAM-04 — «مبلغ» جمعِ قیمت و هزینه‌های قابلِ‌صورتحساب است،
              نه قیمتِ تنها؛ کارفرما همین جمع را بدهکار است.
            */}
            {/* کدِ ارز کنارِ عدد — «۱۲٬۵۰۰» بی‌ارز معلوم نمی‌کرد یورو است یا ریال. */}
            <MaskedPrice
              value={`${format(
                String(summarizeProject(project.price, project.billableExpenses, '0').totalDue),
              )} ${project.currencyCode ?? ''}`.trim()}
            />
          </div>
        )}
      </div>

      {/*
        ۴ · نوارِ ددلاین — پر می‌شود و روزهای مانده را نشان می‌دهد.
        ⚠️ بی‌ددلاین هم خطش می‌ماند: کنارِ کارتی که ددلاین دارد، جای خالی وسطِ
        کارت شبیهِ خطای چیدمان بود؛ «بدون ددلاین» می‌گوید چرا خالی است.
      */}
      <div className="pt-3">
        {bar && urgency ? (
          <div className="grid gap-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground">{t("ددلاین")}</span>
              <span className={urgency.text}>{deadlineLabel(bar.daysLeft, t)}</span>
              <span className="num text-muted-foreground">{project.deadline}</span>
            </div>
            <Progress
              value={bar.percent}
              className="h-1.5 bg-muted"
              indicatorClassName={urgency.bar}
              aria-label={t("ددلاین")}
            />
          </div>
        ) : finished && project.deadline ? (
          <p className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>{t("ددلاین")}</span>
            <span className="num">{project.deadline}</span>
          </p>
        ) : (
          <p className="text-[11px] text-muted-foreground">{t("بدون ددلاین")}</p>
        )}
      </div>

      {/* ۵ · دو شمارندهٔ ریویو — تسک و کامنت. */}
      <div className="flex gap-4 pt-3 text-xs">
        <Link
          href={`/projects/${project.id}?tab=tasks&view=review`}
          className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
          title={t("تسک‌های نیازمند ریویو")}
        >
          <ListChecks className="size-3.5" />
          {tr("تسک‌ها")}
          <b className="num">{project.reviewCount}</b>
        </Link>
        <Link
          href={`/projects/${project.id}?tab=comments`}
          className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
          title={t("کامنت‌های نیازمند بررسی")}
        >
          <MessageSquare className="size-3.5" />
          {tr("کامنت")}
          <b className="num">{project.commentReviewCount}</b>
        </Link>
      </div>

      {/* ۶ · پیشرفتِ تسک‌ها. */}
      <div className="pt-3">
        <Link
          href={`/projects/${project.id}?tab=tasks`}
          className="grid gap-1"
          title={t("مشاهدهٔ تسک‌ها")}
        >
          {/* عدد روی نوار می‌نشیند، بیرونِ `Progress`: نوار در راست‌به‌چپ آینه می‌شود و متن نباید. */}
          <div className="relative">
            <Progress value={percent} className="h-4 bg-muted" indicatorClassName="bg-primary/70" aria-hidden />
            <b className="num absolute inset-0 flex items-center justify-center text-[10px] font-semibold">
              {percent}%
            </b>
          </div>
          <small className="text-[11px] text-muted-foreground tabular-nums">
            {tr('{done}/{total} تسک', { done: project.doneTaskCount, total: project.totalTaskCount })}
          </small>
        </Link>
      </div>

      {/*
        ۷ · جعبهٔ چیپ‌ها — کارفرمایان بالا، اعضا پایین.
        ⚠️ جعبه تا تهِ ردیف کش می‌آید تا جعبه‌های یک ردیف هم‌قد باشند، نه یکی
        کوتاه‌تر از کناری‌اش. زمینهٔ ملایم است، نه قابِ خط‌چین: قاب داخلِ کارت
        «جعبه در جعبه» می‌ساخت (DESIGN.md §۵).
      */}
      <div className="flex flex-col pt-3">
        <div className="flex-1 rounded-lg bg-muted/60 p-2.5">
          {project.clients.length === 0 && project.members.length === 0 ? (
            <span className="text-xs text-muted-foreground">{t("هنوز کسی ساین نشده")}</span>
          ) : (
            <div className="flex flex-wrap gap-1">
              {project.clients.map((c, i) => (
                <Badge key={`c${i}`} className="gap-1.5 py-0.5 ps-0.5 bg-sky-50 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300">
                  <UserAvatar userId={c.userId} name={c.name} size="sm" />
                  {c.name}
                </Badge>
              ))}
              {project.members.map((m, i) => (
                <Badge key={`m${i}`} variant="secondary" className="gap-1.5 py-0.5 ps-0.5">
                  <UserAvatar userId={m.userId} name={m.name} size="sm" />
                  {m.name}
                  {/*
                    ⚠️ برای کارفرما، «نام» خودش همان نقش است (ماسک شده)، پس
                    بدونِ این شرط چیپ «طراح · طراح» می‌شد.
                  */}
                  {m.roleName && m.roleName !== m.name && <> · {m.roleName}</>}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ۸ · افزودنِ سریع — زیرِ جعبهٔ چیپ‌ها، دقیقاً مثلِ نسخهٔ قبلی. */}
      <div>
        {cardOptions && (
          <div className="pt-3">
            <CardQuickAdd
              projectId={project.id}
              currencyId={project.currencyId}
              isUnitBased={project.isUnitBased}
              options={cardOptions}
            />
          </div>
        )}
      </div>

      {/* ۹ · دکمهٔ مشاهده — ردیفِ آخر. */}
      <div className="flex justify-end pt-3">
        <Button asChild size="sm" variant="outline">
          <Link href={`/projects/${project.id}`}>{t("مشاهده")}</Link>
        </Button>
      </div>
    </Card>
  );
}
