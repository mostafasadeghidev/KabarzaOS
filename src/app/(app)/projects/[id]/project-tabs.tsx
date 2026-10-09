'use client';

import { useEffect, useState } from 'react';
import { ChatTab, type ProjectChat } from './chat-tab';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { TasksTab, type TaskItem, type TaskStatusOption } from './tasks-tab';
import type { TaskFormOptions } from './add-task-dialog';
import { CommentsTab, type CommentItem } from './comments-tab';
import {
  BidsTab, FinanceTab, QaTab,
  type BidRow, type FinanceSummary, type PaymentRow,
  type QaFormData, type QaRow, type QaTaskRow,
} from './side-tabs';
import {
  ManageTab, type HourRow, type ImpactCounts, type LightenSummaryView, type LogRow, type MatrixRowView,
} from './manage-tab';
import { FilesTab, type FileRow } from './files-tab';
import { ReviewsTab, type ReviewListItem } from './reviews-tab';
import type { ReviewFormOptions } from './review-item-composer';
import { MyMoneyTab, type MyMoneyData } from './my-money-tab';
import { MyBidTab, type MyBidData } from './my-bid-tab';
import { useT } from '@/i18n/client';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SectionHeader, TabPanel } from '@/components/page-shell';
import { Separator } from '@/components/ui/separator';

/**
 * هشت تبِ صفحهٔ پروژه — همان تب‌های مودالِ ویرایشِ نسخهٔ قبلی و به همان ترتیب:
 * اطلاعات · تسک‌ها · فایل‌ها · کامنت‌ها · بخش مالی · QA · مدیریت · مناقصه.
 *
 * ⚠️ تبِ مناقصه فقط وقتی پروژه مناقصه باشد دیده می‌شود — دقیقاً مثلِ نسخهٔ قبلی
 * که `. را پنهان نگه می‌دارد.
 */

export interface ProjectTabsData {
  projectId: number;
  /** گروهِ گفتگوی پروژه — فقط برای تیم؛ کارفرما و غیرعضو `null`. */
  chat: ProjectChat | null;
  title: string;
  isTender: boolean;
  isArchived: boolean;
  /** منجمد = بایگانی یا لغو/توقف — فرم‌ها پنهان می‌شوند (پورتِ `is_frozen`). */
  isFrozen: boolean;
  price: string;
  /** حقِ دیدنِ قیمتِ پروژه — `domain/access/project-money`. */
  canSeePrice: boolean;
  canManage: boolean;
  /**
   * حذفِ فایلِ **دیگران** — مجوزِ سراسریِ پروژه‌ها، همان قاعدهٔ سرور
   * (`deleteAttachment`). مدیرِ پروژه/دفتر فقط فایلِ خودش را پاک می‌کند.
   */
  canDeleteAnyFile: boolean;
  /** «کار کردن» روی پروژه — عضو/کارفرما/مدیر؛ نه بینندهٔ فقط‌خواندنی. */
  canInteract: boolean;
  canSeeFinance: boolean;
  /** کدِ ارزِ پروژه برای تبِ مالی. */
  currencyCode: string | null;
  /** ریزِ ثبت‌های ساعت و ماتریسِ دسترس‌پذیریِ اعضا — فقط برای مدیر پر می‌شوند. */
  logs: LogRow[];
  matrix: MatrixRowView[];
  dayLabels: string[];
  /** روزِ آغازِ هفته از تنظیمات (۰ = شنبه) — میان‌بُرِ «این هفته» ِ فیلترِ ثبت‌ها. */
  weekStart: number;
  tasks: TaskItem[];
  taskStatuses: TaskStatusOption[];
  /** نقش ← اعضایی که آن نقش را دارند (قاعدهٔ «برداشتنِ تسک»). */
  roleHolders: Record<number, number[]>;
  currentUserId: number;
  /** حاضر بودنش یعنی کاربر عضوِ پروژه است یا مدیرش. */
  myMoney: MyMoneyData | null;
  /** حاضر بودنش یعنی این کاربر می‌تواند برای نقشی پیشنهاد بدهد. */
  myBid: MyBidData | null;
  /** حاضر بودنش یعنی کاربر می‌تواند تسک بسازد. */
  taskFormOptions: TaskFormOptions | null;
  comments: CommentItem[];
  /** بازبینی‌هایی که این بیننده می‌بیند (۱.۱۱۶.۰). */
  reviews: ReviewListItem[];
  /**
   * گزینه‌های فرمِ بازبینی (نقش‌های همین پروژه، بخش‌ها، اعضا، اولویت‌ها).
   * حاضر بودنش یعنی بیننده می‌تواند بازبینی بسازد — مدیرِ پروژهٔ نامنجمد.
   */
  reviewFormOptions: ReviewFormOptions | null;
  /** بیننده عضو یا کادر است (نه فقط کارفرما) — نشانِ مخاطب و «پنهان از کارفرما». */
  isTeamViewer: boolean;
  files: FileRow[];
  qa: QaRow[];
  /** حاضر بودنش یعنی کاربر می‌تواند چک‌لیست اعمال کند. */
  qaForm: QaFormData | null;
  /** تسک‌هایی که چک‌لیستِ QA ساخته (پورتِ `QA::project_tasks`). */
  qaTasks: QaTaskRow[];
  bids: BidRow[];
  /** مناقصه هنوز باز است؟ (R-TENDER-01) */
  tenderIsOpen: boolean;
  hours: HourRow[];
  /** سه‌حالتیِ حذف — R-PROJ-01. */
  deleteState: 'clean' | 'confirm' | 'locked';
  impactCounts: ImpactCounts | null;
  /** حذفِ پروژه — فقط مالک. */
  canDelete: boolean;
  /** سبک‌سازی — مجوزِ سراسریِ پروژه‌ها. */
  canLighten: boolean;
  lightenSummary: LightenSummaryView | null;
  finance: FinanceSummary | null;
  payments: PaymentRow[];
}

export function ProjectTabs({
  data,
  info,
  initialTab,
  initialView,
  initialReview = null,
  initialTask = null,
}: {
  data: ProjectTabsData;
  /** پنلِ «اطلاعات» روی سرور ساخته می‌شود و اینجا فقط جاسازی می‌شود. */
  info: React.ReactNode;
  /**
   * ⚠️ لینکِ عمیق از `?tab=` — شمارنده‌های کارتِ پروژه به تبِ خودشان
   * می‌روند. پیش از این همه فقط به `/projects/{id}` می‌رفتند و کاربر روی
   * تبِ «اطلاعات» می‌افتاد و باید دوباره دنبالِ همان عدد می‌گشت.
   */
  initialTab?: string | null;
  /** زیرتب — فعلاً فقط `review` برای تبِ تسک‌ها. */
  initialView?: string | null;
  /** بازبینیِ باز از `?review=` — پیوندِ اعلان و مودالِ تسک. */
  initialReview?: number | null;
  /** شمارهٔ تسک از `?task=` (۲.۱۶.۰). */
  initialTask?: number | null;
}) {
  const tr = useT();
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const tabs: Array<{ key: string; label: string; badge?: number }> = [
    { key: 'info', label: 'اطلاعات' },
    { key: 'tasks', label: 'تسک‌ها', badge: data.tasks.length },
    // تب فقط وقتی بازبینی‌ای هست یا بیننده می‌تواند بسازد — کارفرما بی‌بازبینیِ آشکار تبی نمی‌بیند.
    ...(data.reviews.length > 0 || data.reviewFormOptions
      ? [{ key: 'reviews', label: 'بازبینی‌ها', badge: data.reviews.length }] : []),
    { key: 'files', label: 'فایل‌ها', badge: data.files.length },
    { key: 'comments', label: 'کامنت‌ها', badge: data.comments.length },
    /**
     * ⚠️ **یک** تبِ مالی، نه دو تا — همان کاری که نسخهٔ قبلی می‌کند
     * (`finance_section()`: پولِ پروژه برای مدیر/کارفرما، پولِ خودِ عضو برای
     * عضو، زیرِ یک نام). دو تبِ جدا («بخش مالی» + «پرداخت») برای کسی که هم
     * مدیر بود هم عضو، دو تبِ هم‌نام می‌ساخت و معلوم نبود کدام کدام است.
     *
     * محتوا با اجازهٔ بیننده تعیین می‌شود: قیمت و بدهیِ کارفرما فقط برای
     * دارندهٔ حقِ دیدنِ قیمت، و «پرداختِ من» برای عضو — بدونِ مجوزِ مالی،
     * چون پولِ خودش است.
     */
    ...(data.canSeePrice || data.myMoney ? [{ key: 'finance', label: 'مالی' }] : []),
    /**
     * QA فقط وقتی چیزی برای این بیننده دارد (`qa_visible_items`)، یا بیننده مدیر
     * است — فرمِ اعمالِ چک‌لیست همین تب است. پیش از این عضوی که هیچ آیتمی نداشت
     * تبِ خالی می‌دید (D#67).
     */
    ...(data.canManage || data.qa.length > 0 || data.qaTasks.length > 0
      ? [{ key: 'qa', label: 'QA', badge: data.qa.length }] : []),
    ...(data.canManage ? [{ key: 'manage', label: 'مدیریت' }] : []),
    /**
     * ⚠️ تب تا وقتی پیشنهادی ثبت شده می‌ماند، حتی اگر پرچمِ مناقصه خاموش شود —
     * نسخهٔ قبلی هم تبِ فقط‌خواندنی را نگه می‌داشت؛ پیش از این تاریخچهٔ
     * پیشنهادها با برداشتنِ یک تیک ناپدید می‌شد. دکمه‌ها با `tenderIsOpen` پنهان‌اند.
     */
    ...((data.isTender || data.bids.length > 0) && data.canManage
      ? [{ key: 'bids', label: 'پیشنهادهای مناقصه', badge: data.bids.length }] : []),
    ...(data.myBid ? [{ key: 'my-bid', label: 'پیشنهادِ من' }] : []),
    ...(data.chat ? [{ key: 'chat', label: 'گروهِ گفتگو', badge: data.chat.unread }] : []),
  ];

  /** تبِ خواسته‌شده فقط وقتی پذیرفته می‌شود که واقعاً ساخته شده باشد. */
  // پیوندهای قدیمیِ `?tab=my-money` به همان تبِ یکپارچهٔ مالی می‌روند.
  const wanted = initialTab === 'my-money' ? 'finance' : initialTab;
  const [tab, setTab] = useState(
    wanted && tabs.some((t) => t.key === wanted) ? wanted : 'info',
  );

  /**
   * ⚠️ `useState` فقط **یک بار** مقدار می‌گیرد. کاربری که همین صفحه باز بود
   * و روی اعلانِ «کامنت جدید» می‌زد، به `?tab=comments` می‌رفت ولی کامپوننت
   * دوباره سوار نمی‌شد و تب همان‌جا می‌ماند — گزارشِ «هنوز به تبِ کامنت‌ها
   * نمی‌رود». این اثر آدرس را دنبال می‌کند.
   */
  useEffect(() => {
    if (wanted && tabs.some((t) => t.key === wanted)) setTab(wanted);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted]);

  /**
   * انتخابِ تب آدرس را هم به‌روز می‌کند.
   *
   * ⚠️ بدونِ این، آدرس و آنچه دیده می‌شود از هم جدا می‌افتادند: کاربری که با
   * `?tab=comments` آمده و بعد دستی روی «تسک‌ها» زده، آدرسش هنوز
   * `?tab=comments` بود — و کلیک روی اعلانِ کامنت به **همان** آدرس، برای
   * مسیریاب «هیچ تغییری» بود و هیچ‌جا نمی‌رفت. گزارشِ «هنوز به تبِ کامنت‌ها
   * نمی‌رود» دقیقاً همین بود.
   *
   * ⚠️ `router.replace` و نه `history.replaceState`: دومی فقط نوارِ آدرس را
   * عوض می‌کند و حالتِ داخلیِ مسیریابِ Next سرِ جایش می‌ماند — یعنی همان
   * ناهماهنگی، این بار نامرئی. آزموده شد و نگرفت.
   *
   * ⚠️ `setTab` **قبل** از مسیریابی: تب فوری عوض می‌شود و رفت‌وبرگشتِ سرور
   * در پس‌زمینه می‌ماند؛ پاسخش همان چیزی است که کاربر می‌بیند، پس پرشی نیست.
   */
  const selectTab = (key: string) => {
    setTab(key);
    const next = new URLSearchParams(search?.toString() ?? '');
    next.set('tab', key);
    // زیرتب مالِ تبِ قبلی بود؛ با عوض شدنِ تب معنایش را از دست می‌دهد.
    next.delete('view');
    next.delete('review');
    router.replace(`${pathname}?${next}`, { scroll: false });
  };

  return (
    <div className="grid grid-cols-1 gap-4">
      <Tabs value={tab} onValueChange={(v) => selectTab(v as typeof tab)}>
        {/* shadcn Tabs (line): پیمایشِ افقی به‌جای شکستنِ خط — در «گزارش‌ها» تب‌ها دو ردیف می‌شدند. */}
        <div className="overflow-x-auto pb-1.5">
          <TabsList variant="line" className="w-max">
            {tabs.map((t) => (
              <TabsTrigger key={t.key} value={t.key} className="flex-none">
                {tr(t.label)}
                {/*
                  ⚠️ فاصله با `gap` روی خودِ دکمه، نه با حاشیهٔ منطقیِ نشان:
                  حاشیه در راست‌به‌چپ به همان سمتی می‌افتاد که متن است و عدد
                  عملاً به حرفِ آخر می‌چسبید («تسک‌ها۴»). `gap` جهت‌مستقل است.
                */}
                {t.badge !== undefined && t.badge > 0 && (
                  <span className="num rounded-full bg-muted px-1.5 py-0.5 text-[10px] leading-none text-muted-foreground">
                    {t.badge}
                  </span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
      </Tabs>

      {/*
        ⚠️ قاعدهٔ عرض یک‌جا و کنارِ خودِ تب نوشته می‌شود: جدول و داده
        تمام‌عرض، متن و فرم در عرضِ خواندنی. پیش از این هر تب خودش
        تصمیم می‌گرفت و سه فاصله و دو عرضِ متفاوت داشتیم.
      */}
      {tab === 'info' && <TabPanel>{info}</TabPanel>}

      {tab === 'chat' && data.chat && (
        <TabPanel width="reading"><ChatTab projectId={data.projectId} chat={data.chat} /></TabPanel>
      )}

      {tab === 'tasks' && (
        <TabPanel><TasksTab
          projectId={data.projectId}
          tasks={data.tasks}
          statuses={data.taskStatuses}
          canManage={data.canManage}
          canInteract={data.canInteract}
          isFrozen={data.isFrozen}
          roleHolders={data.roleHolders}
          currentUserId={data.currentUserId}
          formOptions={data.taskFormOptions}
          initialGroup={initialView}
          initialTask={initialTask}
        /></TabPanel>
      )}

      {tab === 'reviews' && (
        <TabPanel><ReviewsTab
          projectId={data.projectId}
          reviews={data.reviews}
          formOptions={data.reviewFormOptions}
          showAudience={data.isTeamViewer}
          initialReviewId={initialReview}
        /></TabPanel>
      )}

      {tab === 'my-bid' && data.myBid && (
        <TabPanel width="reading"><MyBidTab data={data.myBid} /></TabPanel>
      )}

      {tab === 'files' && (
        <TabPanel width="reading"><FilesTab
          files={data.files}
          projectId={data.projectId}
          canUpload={!data.isFrozen}
          canManage={data.canDeleteAnyFile}
          currentUserId={data.currentUserId}
        /></TabPanel>
      )}

      {tab === 'comments' && (
        <TabPanel width="reading"><CommentsTab
          projectId={data.projectId}
          comments={data.comments}
          canManage={data.canManage}
          canInteract={data.canInteract}
          isFrozen={data.isFrozen}
        /></TabPanel>
      )}

      {tab === 'finance' && (
        <TabPanel>
          {data.canSeePrice && (
            <FinanceTab
              price={data.price}
              finance={data.finance}
              payments={data.payments}
              canSee={data.canSeeFinance}
              projectId={data.projectId}
              currencyCode={data.currencyCode}
            />
          )}
          {data.myMoney && (
            <section className="grid grid-cols-1 gap-3">
              {/* وقتی هر دو بخش هست، مرز لازم است: بالا پولِ پروژه، پایین پولِ من. */}
              {data.canSeePrice && (
                <>
                  <Separator />
                  <SectionHeader title={tr(data.myMoney.isUnitBased ? 'کارکرد و پرداختِ من' : 'پرداختِ من')} />
                </>
              )}
              <MyMoneyTab data={data.myMoney} />
            </section>
          )}
        </TabPanel>
      )}

      {tab === 'qa' && (
        <TabPanel width="reading"><QaTab
          projectId={data.projectId}
          qa={data.qa}
          form={data.qaForm}
          tasks={data.qaTasks}
          canManage={data.canManage}
          canInteract={data.canInteract && !data.isFrozen}
        /></TabPanel>
      )}

      {tab === 'manage' && (
        <TabPanel><ManageTab
          projectId={data.projectId}
          title={data.title}
          isArchived={data.isArchived}
          hours={data.hours}
          logs={data.logs}
          matrix={data.matrix}
          dayLabels={data.dayLabels}
          weekStart={data.weekStart}
          canManage={data.canManage}
          deleteState={data.deleteState}
          impactCounts={data.impactCounts}
          canDelete={data.canDelete}
          canLighten={data.canLighten}
          lightenSummary={data.lightenSummary}
        /></TabPanel>
      )}

      {tab === 'bids' && (
        <TabPanel><BidsTab
          projectId={data.projectId}
          bids={data.bids}
          isOpen={data.tenderIsOpen}
          canManage={data.canManage}
        /></TabPanel>
      )}
    </div>
  );
}
