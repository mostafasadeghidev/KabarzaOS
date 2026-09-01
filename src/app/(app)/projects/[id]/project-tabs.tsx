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
  ManageTab, type HourRow, type LightenSummaryView,
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
  thumbnailFileId: number | null;
  price: string;
  /** حقِ دیدنِ قیمتِ پروژه — `domain/access/project-money`. */
  canSeePrice: boolean;
  canManage: boolean;
  canSeeFinance: boolean;
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
     * ⚠️ «بخشِ مالی» پولِ **پروژه** است (قیمت، دریافتی، بدهیِ کارفرما)، پس
     * فقط برای کسی که حقِ دیدنِ قیمت دارد. پیش از این همیشه ساخته می‌شد و
     * عضوِ عادی مبلغِ قراردادِ کارفرما را می‌دید. پولِ خودِ عضو تبِ جداگانه
     * دارد («پرداخت») — `domain/access/project-money`.
     */
    ...(data.canSeePrice ? [{ key: 'finance', label: 'بخش مالی' }] : []),
    /**
     * ⚠️ «پولِ من» مجوزِ مالی نمی‌خواهد — پولِ خودِ عضو است.
     * نامش با نوعِ پروژه عوض می‌شود: «کارکرد» فقط وقتی معنا دارد که پروژه
     * تعدادی باشد (`Projects::is_unit_based()`)؛ وگرنه تب فقط درخواستِ
     * پرداخت را دارد و نامیدنش «کارکرد» وعدهٔ چیزی است که داخلش نیست.
     */
    ...(data.myMoney
      ? [{ key: 'my-money', label: data.myMoney.isUnitBased ? 'کارکرد و پرداخت' : 'پرداخت' }]
      : []),
    { key: 'qa', label: 'QA', badge: data.qa.length },
    ...(data.canManage ? [{ key: 'manage', label: 'مدیریت' }] : []),
    ...(data.isTender && data.canManage
      ? [{ key: 'bids', label: 'پیشنهادهای مناقصه', badge: data.bids.length }] : []),
    ...(data.myBid ? [{ key: 'my-bid', label: 'پیشنهادِ من' }] : []),
  ];

  /** تبِ خواسته‌شده فقط وقتی پذیرفته می‌شود که واقعاً ساخته شده باشد. */
  const [tab, setTab] = useState(
    initialTab && tabs.some((t) => t.key === initialTab) ? initialTab : 'info',
  );

  return (
    <div className="mt-6 grid gap-4">
      <nav className="flex flex-wrap gap-1 border-b">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm transition-colors ${
              tab === t.key
                ? 'border-primary font-medium text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tr(t.label)}
            {t.badge !== undefined && t.badge > 0 && (
              <span className="num ms-1 text-xs text-muted-foreground">{t.badge}</span>
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
          roleHolders={data.roleHolders}
          currentUserId={data.currentUserId}
          formOptions={data.taskFormOptions}
          initialGroup={initialView}
        />
      )}

      {tab === 'my-money' && data.myMoney && <MyMoneyTab data={data.myMoney} />}

      {tab === 'my-bid' && data.myBid && <MyBidTab data={data.myBid} />}

      {tab === 'files' && (
        <FilesTab files={data.files} projectId={data.projectId} canUpload={!data.isArchived} />
      )}

      {tab === 'comments' && (
        <CommentsTab
          projectId={data.projectId}
          comments={data.comments}
          canManage={data.canManage}
        />
      )}

      {tab === 'finance' && (
        <FinanceTab
          price={data.price}
          finance={data.finance}
          payments={data.payments}
          canSee={data.canSeeFinance}
          projectId={data.projectId}
        />
      )}

      {tab === 'qa' && (
        <QaTab
          projectId={data.projectId}
          qa={data.qa}
          form={data.qaForm}
          canManage={data.canManage}
        />
      )}

      {tab === 'manage' && (
        <ManageTab
          projectId={data.projectId}
          title={data.title}
          isArchived={data.isArchived}
          hours={data.hours}
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
