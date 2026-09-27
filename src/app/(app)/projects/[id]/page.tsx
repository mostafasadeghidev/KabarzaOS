import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { currentActor } from '@/server/auth';
import { listUnitEntries, myRequests, myUnpaidUnits } from '@/server/finance/member-service';
import {
  getBidderView, getMemberTender, getMembersForm, getProjectFormOptions, getProjectTabs,
  getQaForm,
  getTaskFormOptions,
  getTaskStatusOptions, NotFoundError, getClientsForm, taskStatusOptionsFor,
} from '@/server/projects/service';
import { ForbiddenError } from '@/domain/access/guard';
import { format } from '@/domain/money/money';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { MembersDialog } from '../_form/members-dialog';
import { ClientsDialog } from '../_form/clients-dialog';
import { MemberAccessToggle } from '../_form/member-access';
import { MemberRemoveButton } from '../_form/member-remove';
import { canManageSection } from '@/domain/access/permissions';
import { ProjectDialog } from '../_form/project-dialog';
import { ProjectTabs } from './project-tabs';
import { BidderView } from './bidder-view';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableNumericCell, TableRow,
} from '@/components/ui/table';
import { ProjectStatus } from '../project-status';
import { primeTranslations, t } from '@/i18n/server';
import { deadlineLabel, taskProgress } from '@/domain/projects/deadline';
import { StatusPicker } from '../status-picker';
import { chipStyle } from '@/domain/ui/contrast';
import { countOpenThreads } from '@/domain/projects/threads';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CircleAlert } from 'lucide-react';
import { PageHeader, PageShell } from '@/components/page-shell';
import { StatCard } from '@/components/stat-card';

export default async function ProjectDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  /**
   * ⚠️ `?tab=` و `?view=` لینکِ عمیق‌اند — شمارنده‌های کارتِ پروژه به تبِ
   * خودشان می‌روند («تسک‌ها»، «کامنت‌ها»، و زیرتبِ «نیازمند ریویو»). نسخهٔ
   * قبلی هم همین را سمتِ سرور حل می‌کند تا صفحه از فریمِ اول روی تبِ درست
   * بنشیند و تبِ پیش‌فرض یک‌لحظه چشمک نزند.
   */
  searchParams: Promise<{ tab?: string; view?: string }>;
}) {
  /**
   * ⚠️ هر صفحه **خودش** ترجمه را آماده می‌کند و به چیدمان تکیه نمی‌کند:
   * در ناوبریِ سمتِ کلاینت، Next فقط بخشِ صفحه را دوباره رندر می‌کند و
   * چیدمان را از درختِ کش‌شده برمی‌دارد — پس `primeTranslations()` ِ
   * چیدمان اجرا نمی‌شود و `t()` رشتهٔ فارسیِ مبدأ را برمی‌گرداند.
   * `cache()` تضمین می‌کند در هر درخواست فقط یک بار اجرا شود.
   */
  await primeTranslations();

  const actor = await currentActor();
  if (!actor) redirect('/login');

  const query = await searchParams;
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();

  let detail;
  try {
    detail = await getProjectTabs(actor, id);
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof ForbiddenError) {
      /**
       * ⚠️ تنها استثنای دسترسیِ غیرعضو: **مناقصه‌گرِ واجدِ شرایط**.
       * نمایش عمداً تنگ است (عنوان، تسک‌های نقشِ خودش، فایل‌ها، فرمِ
       * پیشنهاد) — وگرنه هر کسی با یک تگِ نقش داخلِ پروژه‌ها را می‌دید.
       */
      const bidder = await getBidderView(actor, id);
      if (bidder) return <BidderView data={bidder} />;

      // پروژهٔ خصوصیِ خارج از دسترس هم «یافت نشد» می‌دهد، نه «ممنوع».
      notFound();
    }
    throw error;
  }

  const { project, members, tasks, canManage } = detail;

  /**
   * «پولِ من» — کارکرد و درخواستِ پرداخت.
   * ⚠️ مجوزِ مالی لازم ندارد؛ ولی اگر کاربر نه عضو باشد نه مدیر، سرویس
   * ForbiddenError می‌دهد و تب اصلاً ساخته نمی‌شود.
   */
  let myMoney = null;
  try {
    const [units, unpaid, requests] = await Promise.all([
      listUnitEntries(actor, id),
      myUnpaidUnits(actor, id),
      myRequests(actor, id),
    ]);
    myMoney = {
      projectId: id,
      canManage,
      isFrozen: detail.isFrozen,
      isUnitBased: project.isUnitBased,
      units,
      myUnpaidUnits: unpaid,
      requests: requests.requests,
      remaining: requests.remaining,
      agreed: requests.agreed,
      paid: requests.paid,
      currencyCode: requests.currencyCode,
      status: requests.status,
      payouts: requests.payouts,
      available: requests.available,
      outstanding: requests.outstanding,
      // ⚠️ عضوِ دو-نقشه دو ردیفِ عضویت دارد؛ در انتخابگر باید یک‌بار بیاید
      // (نسخهٔ قبلی هم با $seen همین کار را می‌کند).
      members: [...new Map(
        members.map((m) => [m.userId, { id: m.userId, name: m.userName ?? `#${m.userId}` }]),
      ).values()],
      today: new Date().toISOString().slice(0, 10),
    };
  } catch { /* نه عضو است نه مدیر — تب دیده نمی‌شود. */ }

  /**
   * ⚠️ مدیری که خودش عضوِ پروژه نیست، «پولِ من» ندارد: نه قراردادی، نه
   * پرداختی، نه درخواستی. پیش از این تبِ مالی برایش ساخته می‌شد و **خالی**
   * باز می‌شد — کاربر روی تبی کلیک می‌کرد که هیچ‌چیز در آن نبود.
   */
  if (myMoney && canManage) {
    const hasPersonal = myMoney.isUnitBased
      || Number(myMoney.agreed) > 0
      || myMoney.payouts.length > 0
      || myMoney.requests.length > 0;
    if (!hasPersonal) myMoney = null;
  }

  /**
   * «پیشنهادِ من» — فقط وقتی پروژه مناقصه باشد و کاربر نقشِ بازی داشته باشد.
   * ⚠️ برای مدیر ساخته نمی‌شود: او تبِ «پیشنهادهای مناقصه» را دارد و آنجا
   * همهٔ پیشنهادها را می‌بیند.
   */
  let myBid = null;
  if (!canManage) {
    const tender = await getMemberTender(actor, id);
    if (tender && (tender.openRoles.length > 0 || tender.wonRoles.length > 0)) {
      myBid = { projectId: id, ...tender };
    }
  }
  /**
   * ⚠️ فقط برای مدیر خوانده می‌شود. `getTaskStatusOptions` مجوزِ **سراسریِ**
   * `projects.view` می‌خواهد، ولی عضوِ همین پروژه از مسیرِ عضویت وارد شده و
   * آن مجوز را ندارد — صدازدنِ بی‌قیدش صفحه را با ForbiddenError می‌انداخت،
   * یعنی عضو پروژه‌اش را در فهرست می‌دید ولی نمی‌توانست بازش کند.
   *
   * نبودنش چیزی از او نمی‌گیرد: `TaskStatusPicker` برای غیرمدیر همان چیپِ
   * خواندنی را برمی‌گرداند، مثلِ `task_status_dropdown_html()` نسخهٔ قبلی.
   */
  const [taskStatuses, taskFormOptions, qaForm] = await Promise.all([
    // پورتِ افزونه: هر شرکت‌کننده وضعیتِ تسک را عوض می‌کند (عضو تسکش را به ریویو می‌فرستد) — نه روی منجمد.
    detail.canInteract && !detail.isFrozen ? taskStatusOptionsFor(actor, project.id) : Promise.resolve([]),
    /**
     * ⚠️ فرمِ تسک برای **هر کسی که پروژه را می‌بیند** — عضو و کارفرما هم.
     * سرویس همان گارد را دارد، پس این شرط و آن گارد یکی‌اند و از هم جدا
     * نمی‌افتند. پروژهٔ منجمد فرم نمی‌گیرد (نوشتن رد می‌شود، پس دکمه هم
     * نباید باشد).
     */
    detail.isFrozen ? Promise.resolve(null) : getTaskFormOptions(actor, project.id),
    canManage ? getQaForm(actor, project.id) : Promise.resolve(null),
  ]);

  // فرم‌ها فقط وقتی خوانده می‌شوند که دکمه‌شان هم دیده شود.
  const [membersForm, formOptions, clientsForm] = canManage
    ? await Promise.all([
        getMembersForm(actor, project.id).then((m) => ({ projectId: project.id, ...m })),
        getProjectFormOptions(actor, project.id),
        getClientsForm(actor, project.id).then((c) => ({ projectId: project.id, ...c })),
      ])
    : [null, null, null];
  const openTasks = tasks.filter((t) => t.statusGroup !== 'complete');

  /**
   * چند تا از تسک‌های این پروژه از چک‌لیستِ QA آمده‌اند.
   *
   * ⚠️ آیتمِ «تسک‌ساز» در `project_qa` **نمی‌نشیند** — مستقیم تسک می‌شود. پس
   * تبِ QA هیچ ردی از آن نداشت و مدیر بعدِ اعمال نمی‌فهمید کارِ واقعی ساخته
   * شده. همان قاعدهٔ تطبیقِ عنوان که `getProjectTabs` برای چیپِ «تسک» به کار
   * می‌برد (پورتِ `find_task_item`).
   */
  const qaTaskTitles = new Set(
    (qaForm?.library ?? []).filter((i) => i.isTask).map((i) => i.title),
  );
  const qaTaskCount = qaTaskTitles.size === 0
    ? 0
    : tasks.filter((t) => qaTaskTitles.has(t.title)).length;
  // رشته‌های بازِ کامنت — همان شمارشی که داشبورد دارد (`countOpenThreads`).
  const openComments = countOpenThreads(detail.comments);
  // متای جزئیات — پورتِ `kteam-detail-meta`.
  const todayIso = new Date().toISOString().slice(0, 10);
  const daysLeft = project.deadline
    ? Math.floor((Date.parse(project.deadline) - Date.parse(todayIso)) / 86_400_000)
    : null;
  const deadlineHint = daysLeft === null ? '' : deadlineLabel(daysLeft, t);
  const percent = taskProgress(detail.meta.doneTasks, detail.meta.totalTasks);
  const hoursLabel = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
  /** `$hide_amounts` ِ نسخهٔ قبلی — فقط دو مجوزِ سراسری. */
  const canSeeAgreedAmounts =
    canManageSection(actor, 'projects') || canManageSection(actor, 'finance');

  return (
    <PageShell>
      <PageHeader
        back={{ href: '/projects', label: t("پروژه‌ها") }}
        title={project.title}
        description={project.description ? (
          // توضیحِ پروژه — پیش از این فقط داخلِ فرمِ ویرایش دیده می‌شد.
          <p className="max-w-3xl whitespace-pre-wrap">{project.description}</p>
        ) : undefined}
        actions={formOptions && (
          <ProjectDialog
            options={{
              statuses: formOptions.statuses.map((s) => ({ id: s.id, label: s.name })),
              currencies: formOptions.currencies.map((c) => ({ id: c.id, label: c.code })),
              offices: formOptions.offices.map((o) => ({ id: o.id, label: o.name })),
              parents: formOptions.parents.map((p) => ({ id: p.id, label: p.title })),
              defaultCurrencyId: formOptions.currencies.find((c) => c.isDefault)?.id ?? null,
              roleTags: formOptions.roleTags,
              canUsePrivate: formOptions.canUsePrivate,
              canEditMoney: canSeeAgreedAmounts,
              today: new Date().toISOString().slice(0, 10),
            }}
            project={{
              id: project.id,
              title: project.title,
              description: project.description ?? '',
              regDate: project.regDate ?? '',
              deadline: project.deadline ?? '',
              statusTagId: project.statusTagId ? String(project.statusTagId) : '',
              /**
               * ⚠️ صفر، نه پنهان‌کردن در فرم: هرچه اینجا باشد در payload ِ صفحه
               * می‌ماند و با View Source خوانده می‌شود. مدیرِ پروژه/دفتر قیمت را
               * نمی‌بیند (`canEditMoney`) و سرور هم برایش مقدارِ قبلی را نگه می‌دارد.
               */
              price: canSeeAgreedAmounts ? project.price : '0',
              currencyId: project.currencyId ? String(project.currencyId) : '',
              officeId: project.officeId ? String(project.officeId) : '',
              parentId: project.parentId ? String(project.parentId) : '',
              isUnitBased: project.isUnitBased,
              isTender: project.isTender,
              tenderRoles: canSeeAgreedAmounts ? project.tenderRoles : null,
              scope: project.scope,
              thumbnailFileId: project.thumbnailFileId,
            }}
          />
        )}
      >
        {/* پورتِ `project_status_control`: مدیر انتخابگر، بقیه چیپ. */}
        {formOptions ? (
          <StatusPicker
            projectId={project.id}
            name={detail.statusName}
            group={detail.statusGroup}
            statusId={project.statusTagId ?? null}
            options={formOptions.statuses.map((s) => ({ id: s.id, name: s.name, group: s.group ?? null, color: s.color ?? null }))}
            canManage
          />
        ) : (
          <ProjectStatus name={detail.statusName} group={detail.statusGroup} />
        )}
        {project.scope === 'private' && <Badge variant="warning">{t("خصوصی")}</Badge>}
        {project.isArchived && <Badge variant="secondary">{t("بایگانی‌شده")}</Badge>}
      </PageHeader>

      {/* پورتِ نوارِ فقط‌خواندنیِ پروژهٔ منجمد (بایگانی / لغو / توقف). */}
      {detail.isFrozen && (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertDescription>
            {t("این پروژه بسته یا بایگانی شده است و فقط‌خواندنی است: افزودن یا تغییرِ تسک، ساعت کاری و کامنت غیرفعال است.")}
          </AlertDescription>
        </Alert>
      )}

      {/*
        پورتِ `kteam-detail-meta`: تاریخِ ثبت، ددلاین با شمارش، پیشرفت، ساعت.

        ⚠️ شبکهٔ برچسب/مقدار، نه یک سطرِ درهم: پیش از این هر پنج قلم پشتِ هم
        در یک خط می‌نشستند («تاریخ ثبت: … ددلاین: … درصد پیشرفت: …») و چشم
        مرزِ قلم‌ها را پیدا نمی‌کرد. حالا برچسبِ کوچک بالا و مقدارِ پررنگ
        پایین است — همان الگویی که shadcn برای فراداده به کار می‌برد.
      */}
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm @2xl/main:grid-cols-3 @5xl/main:grid-cols-5">
        <div className="grid gap-0.5">
          <dt className="text-xs text-muted-foreground">{t("تاریخ ثبت")}</dt>
          <dd className="num font-medium">{project.regDate ?? '—'}</dd>
        </div>
        <div className="grid gap-0.5">
          <dt className="text-xs text-muted-foreground">{t("ددلاین")}</dt>
          <dd className="font-medium">
            <span className="num">{project.deadline ?? '—'}</span>
            {deadlineHint && (
              <span className="ms-1 text-xs font-normal text-muted-foreground">({deadlineHint})</span>
            )}
          </dd>
        </div>
        <div className="grid gap-0.5">
          <dt className="text-xs text-muted-foreground">{t("درصد پیشرفت")}</dt>
          <dd className="font-medium">
            <span className="num">{percent}%</span>
            <span className="num ms-1 text-xs font-normal text-muted-foreground">
              ({detail.meta.doneTasks}/{detail.meta.totalTasks} {t("تسک")})
            </span>
          </dd>
        </div>
        {detail.meta.myMinutes !== null && (
          <div className="grid gap-0.5">
            <dt className="text-xs text-muted-foreground">{t("ساعت کاری شما")}</dt>
            <dd className="num font-medium">{hoursLabel(detail.meta.myMinutes)}</dd>
          </div>
        )}
        {detail.meta.teamMinutes !== null && (
          <div className="grid gap-0.5">
            <dt className="text-xs text-muted-foreground">{t("ساعت کاری تیم")}</dt>
            <dd className="num font-medium">{hoursLabel(detail.meta.teamMinutes)}</dd>
          </div>
        )}
      </dl>

      {/* خویشاوندیِ پروژه‌ها سطرِ خودش را دارد: عنوان‌ها بلندند و در شبکه نمی‌نشینند. */}
      {(detail.meta.parent || detail.meta.children.length > 0) && (
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
          {detail.meta.parent && (
            <span>
              ↳ {t("پیروِ پروژهٔ")}:{' '}
              <Link href={`/projects/${detail.meta.parent.id}`} className="underline">
                {detail.meta.parent.title}
              </Link>
            </span>
          )}
          {detail.meta.children.length > 0 && (
            <span>
              {t("زیرپروژه‌ها (تغییر/نگهداری)")}:{' '}
              {detail.meta.children.map((c, i) => (
                <span key={c.id}>
                  {i > 0 && t('، ')}
                  <Link href={`/projects/${c.id}`} className="underline">{c.title}</Link>
                </span>
              ))}
            </span>
          )}
        </div>
      )}

      {/*
        ⚠️ کارت‌های سرِ صفحه «کارِ باز» را می‌گویند، نه پول: قیمتِ پروژه جای
        خودش را در تبِ مالی دارد و اینجا فقط یک عددِ ایستا بود که هر بار که
        کارفرما یا عضو صفحه را باز می‌کرد، مبلغِ قرارداد را جلوی چشمش
        می‌گذاشت. جایش «کامنتِ باز» نشسته — رشته‌هایی که تازه‌ترین پیامشان
        هنوز بسته نشده و منتظرِ کسی هستند.
      */}
      <div className="grid gap-4 @xl/main:grid-cols-3">
        <StatCard label={t("اعضا")} value={members.length} />
        <StatCard label={t("تسکِ باز")} value={openTasks.length} />
        <StatCard label={t("کامنتِ باز")} value={openComments} />
      </div>

      <ProjectTabs
        initialTab={query.tab ?? null}
        initialView={query.view ?? null}
        data={{
          projectId: project.id,
          title: project.title,
          isTender: project.isTender,
          isArchived: project.isArchived,
          isFrozen: detail.isFrozen,
          roleHolders: detail.roleHolders,
          currentUserId: detail.currentUserId,
          myMoney,
          myBid,
          /**
           * ⚠️ صفر، نه پنهان‌کردن با CSS: تبِ مالی برای عضوِ خالص هم ساخته
           * می‌شود (دستمزدِ خودش)، پس اگر قیمت را می‌فرستادیم در payload ِ
           * همان صفحه می‌ماند و با View Source خوانده می‌شد.
           */
          price: detail.canSeePrice ? project.price : '0',
          canSeePrice: detail.canSeePrice,
          canManage,
          // ⚠️ پیش از این دکمهٔ حذف با `canManage` ِ پروژه‌محور نشان داده می‌شد و سرور ردش می‌کرد.
          canDeleteAnyFile: canManageSection(actor, 'projects'),
          canInteract: detail.canInteract,
          canSeeFinance: detail.canSeeFinance,
          currencyCode: detail.currencyCode,
            logs: detail.logs,
            matrix: detail.matrix,
            dayLabels: detail.dayLabels,
            weekStart: detail.weekStart,
          tasks,
          taskStatuses: taskStatuses.map((t) => ({
            id: t.id, name: t.name, group: t.group, color: t.color,
          })),
          taskFormOptions,
          qaForm: qaForm ? { roles: qaForm.roles } : null,
          qaTaskCount,
          tenderIsOpen: detail.tenderIsOpen,
          comments: detail.comments,
          files: detail.files,
          qa: detail.qa,
          bids: detail.bids,
          hours: detail.hours,
          deleteState: detail.deleteState,
          lightenSummary: (project.lightenSummary as {
            minutes: number; price: string; clientPaidEur: string;
            memberPaidEur: string; wasTender: boolean;
          } | null) ?? null,
          finance: detail.finance,
          payments: detail.payments,
        }}
        info={
          <div className="grid grid-cols-1 gap-4">
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle className="text-base">{t("اعضای پروژه")}</CardTitle>
                {membersForm && <MembersDialog data={membersForm} />}
              </CardHeader>
              <CardContent>
                {members.length === 0 ? (
                  <EmptyState title={t("عضوی ثبت نشده")} />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("عضو")}</TableHead>
                        <TableHead>{t("نقش")}</TableHead>
                        {/*
                          ⚠️ دستمزدِ توافقیِ اعضا پول است و فقط مالک/مدیرِ
                          سراسریِ پروژه‌ها و مدیرِ مالی می‌بینندش —
                          `$hide_amounts` ِ نسخهٔ قبلی. حتی کارفرما هم نه:
                          او قیمتِ پروژه را می‌بیند، نه تقسیمِ داخلیِ تیم.
                          پیش از این ستون برای همه رندر می‌شد.
                        */}
                        {canSeeAgreedAmounts && (
                          <TableHead numeric>{t("مبلغ توافقی")}</TableHead>
                        )}
                        {canManage && <TableHead />}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {members.map((m) => (
                        <TableRow key={m.id}>
                          <TableCell className="font-medium">
                            {m.userName}
                            {m.accessBlocked && (
                              <Badge variant="outline" className="ms-1.5 text-[10px]">
                                {t("دسترسی قطع")}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {/* پورتِ `role_color`: چیپِ نقش به رنگِ تگ. */}
                            {m.roleName ? (
                              <Badge
                                variant="outline"
                                style={chipStyle(m.roleColor)}
                              >
                                {m.roleName}
                              </Badge>
                            ) : '—'}
                          </TableCell>
                          {canSeeAgreedAmounts && (
                            <TableNumericCell>{format(m.agreedAmount)}</TableNumericCell>
                          )}
                          {canManage && (
                            <TableCell>
                              <span className="flex items-center justify-end gap-1">
                                <MemberAccessToggle
                                  projectId={project.id}
                                  userId={m.userId}
                                  blocked={m.accessBlocked}
                                />
                                {/* پورتِ `remove_member`: حذفِ صریحِ ردیف، حتی برای عضوِ طلبکار/سابق. */}
                                <MemberRemoveButton
                                  projectId={project.id}
                                  memberRowId={m.id}
                                  name={m.userName ?? `#${m.userId}`}
                                />
                              </span>
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            {/* کارفرمایان — پورتِ چیپ‌های کارفرما؛ اولی «کارفرمای اصلی» (قدیمی‌ترین انتساب). */}
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle className="text-base">{t("کارفرمایان")}</CardTitle>
                {clientsForm && <ClientsDialog data={clientsForm} />}
              </CardHeader>
              <CardContent>
                {detail.clients.length === 0 ? (
                  <EmptyState title={t("کارفرمایی ثبت نشده")} />
                ) : (
                  <ul className="grid gap-1 text-sm">
                    {detail.clients.map((c, i) => (
                      <li key={c.userId} className="flex items-center gap-2">
                        {c.name}
                        {i === 0 && detail.clients.length > 1 && (
                          <Badge variant="outline" className="text-[10px]">{t("کارفرمای اصلی")}</Badge>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        }
      />

    </PageShell>
  );
}
