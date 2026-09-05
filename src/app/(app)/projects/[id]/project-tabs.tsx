'use client';

import { useState } from 'react';
import { TasksTab, type TaskItem, type TaskStatusOption } from './tasks-tab';
import type { TaskFormOptions } from './add-task-dialog';
import { CommentsTab, type CommentItem } from './comments-tab';
import {
  BidsTab, FinanceTab, QaTab,
  type BidRow, type FinanceSummary, type PaymentRow,
  type QaFormData, type QaRow,
} from './side-tabs';
import {
  ManageTab, type HourRow, type LightenSummaryView, type LogRow, type MatrixRowView,
} from './manage-tab';
import { FilesTab, type FileRow } from './files-tab';
import { MyMoneyTab, type MyMoneyData } from './my-money-tab';
import { MyBidTab, type MyBidData } from './my-bid-tab';
import { useT } from '@/i18n/client';

/**
 * هشت تبِ صفحهٔ پروژه — همان تب‌های مودالِ ویرایشِ نسخهٔ قبلی و به همان ترتیب:
 * اطلاعات · تسک‌ها · فایل‌ها · کامنت‌ها · بخش مالی · QA · مدیریت · مناقصه.
 *
 * ⚠️ تبِ مناقصه فقط وقتی پروژه مناقصه باشد دیده می‌شود — دقیقاً مثلِ نسخهٔ قبلی
 * که `. را پنهان نگه می‌دارد.
 */

export interface ProjectTabsData {
  projectId: number;
  title: string;
  isTender: boolean;
  isArchived: boolean;
  /** منجمد = بایگانی یا لغو/توقف — فرم‌ها پنهان می‌شوند (پورتِ `is_frozen`). */
  isFrozen: boolean;
  thumbnailFileId: number | null;
  price: string;
  /** حقِ دیدنِ قیمتِ پروژه — `domain/access/project-money`. */
  canSeePrice: boolean;
  canManage: boolean;
  /** «کار کردن» روی پروژه — عضو/کارفرما/مدیر؛ نه بینندهٔ فقط‌خواندنی. */
  canInteract: boolean;
  canSeeFinance: boolean;
  /** کدِ ارزِ پروژه برای تبِ مالی. */
  currencyCode: string | null;
  /** ریزِ ثبت‌های ساعت و ماتریسِ دسترس‌پذیریِ اعضا — فقط برای مدیر پر می‌شوند. */
  logs: LogRow[];
  matrix: MatrixRowView[];
  dayLabels: string[];
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
  files: FileRow[];
  qa: QaRow[];
  /** حاضر بودنش یعنی کاربر می‌تواند چک‌لیست اعمال کند. */
  qaForm: QaFormData | null;
  bids: BidRow[];
  /** مناقصه هنوز باز است؟ (R-TENDER-01) */
  tenderIsOpen: boolean;
  hours: HourRow[];
  /** سه‌حالتیِ حذف — R-PROJ-01. */
  deleteState: 'clean' | 'confirm' | 'locked';
  lightenSummary: LightenSummaryView | null;
  finance: FinanceSummary | null;
  payments: PaymentRow[];
}

export function ProjectTabs({
  data,
  info,
  initialTab,
  initialView,
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
}) {
  const tr = useT();
  const tabs: Array<{ key: string; label: string; badge?: number }> = [
    { key: 'info', label: 'اطلاعات' },
    { key: 'tasks', label: 'تسک‌ها', badge: data.tasks.length },
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
    { key: 'qa', label: 'QA', badge: data.qa.length },
    ...(data.canManage ? [{ key: 'manage', label: 'مدیریت' }] : []),
    ...(data.isTender && data.canManage
      ? [{ key: 'bids', label: 'پیشنهادهای مناقصه', badge: data.bids.length }] : []),
    ...(data.myBid ? [{ key: 'my-bid', label: 'پیشنهادِ من' }] : []),
  ];

  /** تبِ خواسته‌شده فقط وقتی پذیرفته می‌شود که واقعاً ساخته شده باشد. */
  // پیوندهای قدیمیِ `?tab=my-money` به همان تبِ یکپارچهٔ مالی می‌روند.
  const wanted = initialTab === 'my-money' ? 'finance' : initialTab;
  const [tab, setTab] = useState(
    wanted && tabs.some((t) => t.key === wanted) ? wanted : 'info',
  );

  return (
    <div className="mt-6 grid gap-4">
      <nav className="flex flex-wrap gap-1 border-b">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`-mb-px flex items-center gap-2 border-b-2 px-3 py-2 text-sm transition-colors ${
              tab === t.key
                ? 'border-primary font-medium text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
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
          </button>
        ))}
      </nav>

      {tab === 'info' && info}

      {tab === 'tasks' && (
        <TasksTab
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
        />
      )}

      {tab === 'my-bid' && data.myBid && <MyBidTab data={data.myBid} />}

      {tab === 'files' && (
        <FilesTab
          files={data.files}
          projectId={data.projectId}
          canUpload={!data.isFrozen}
          canManage={data.canManage}
          currentUserId={data.currentUserId}
        />
      )}

      {tab === 'comments' && (
        <CommentsTab
          projectId={data.projectId}
          comments={data.comments}
          canManage={data.canManage}
          canInteract={data.canInteract}
          isFrozen={data.isFrozen}
        />
      )}

      {tab === 'finance' && (
        <div className="grid gap-6">
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
            <section className="grid gap-3">
              {/* وقتی هر دو بخش هست، مرز لازم است: بالا پولِ پروژه، پایین پولِ من. */}
              {data.canSeePrice && (
                <h3 className="border-t border-dashed pt-4 text-sm font-semibold">
                  {tr(data.myMoney.isUnitBased ? 'کارکرد و پرداختِ من' : 'پرداختِ من')}
                </h3>
              )}
              <MyMoneyTab data={data.myMoney} />
            </section>
          )}
        </div>
      )}

      {tab === 'qa' && (
        <QaTab
          projectId={data.projectId}
          qa={data.qa}
          form={data.qaForm}
          canManage={data.canManage}
          canInteract={data.canInteract && !data.isFrozen}
        />
      )}

      {tab === 'manage' && (
        <ManageTab
          projectId={data.projectId}
          title={data.title}
          isArchived={data.isArchived}
          hours={data.hours}
          logs={data.logs}
          matrix={data.matrix}
          dayLabels={data.dayLabels}
          canManage={data.canManage}
          deleteState={data.deleteState}
          lightenSummary={data.lightenSummary}
          thumbnailFileId={data.thumbnailFileId}
        />
      )}

      {tab === 'bids' && (
        <BidsTab
          projectId={data.projectId}
          bids={data.bids}
          isOpen={data.tenderIsOpen}
          canManage={data.canManage}
        />
      )}
    </div>
  );
}
