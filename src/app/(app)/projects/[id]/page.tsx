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
    <main className="p-6">
      <nav className="text-sm text-muted-foreground">
        <Link href="/projects" className="hover:underline">{t("پروژه‌ها")}</Link>
        <span className="mx-2">/</span>
        <span>{project.title}</span>
      </nav>

      <header className="mt-3 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{project.title}</h1>
          {/* توضیحِ پروژه — پیش از این فقط داخلِ فرمِ ویرایش دیده می‌شد. */}
          {project.description && (
            <p className="mt-2 max-w-3xl whitespace-pre-wrap text-sm text-muted-foreground">
              {project.description}
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2">
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
          </div>
        </div>
        {formOptions && (
          <ProjectDialog
            options={{
              statuses: formOptions.statuses.map((s) => ({ id: s.id, label: s.name })),
              currencies: formOptions.currencies.map((c) => ({ id: c.id, label: c.code })),
              offices: formOptions.offices.map((o) => ({ id: o.id, label: o.name })),
              parents: formOptions.parents.map((p) => ({ id: p.id, label: p.title })),
              defaultCurrencyId: formOptions.currencies.find((c) => c.isDefault)?.id ?? null,
              roleTags: formOptions.roleTags,
              canUsePrivate: formOptions.canUsePrivate,
              today: new Date().toISOString().slice(0, 10),
            }}
            project={{
              id: project.id,
              title: project.title,
              description: project.description ?? '',
              regDate: project.regDate ?? '',
              deadline: project.deadline ?? '',
              statusTagId: project.statusTagId ? String(project.statusTagId) : '',
              price: project.price,
              currencyId: project.currencyId ? String(project.currencyId) : '',
              officeId: project.officeId ? String(project.officeId) : '',
              parentId: project.parentId ? String(project.parentId) : '',
              isUnitBased: project.isUnitBased,
              isTender: project.isTender,
              tenderRoles: project.tenderRoles,
              scope: project.scope,
            }}
          />
        )}
      </header>

      {/* پورتِ نوارِ فقط‌خواندنیِ پروژهٔ منجمد (بایگانی / لغو / توقف). */}
      {detail.isFrozen && (
        <p className="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {t("این پروژه بسته یا بایگانی شده است و فقط‌خواندنی است: افزودن یا تغییرِ تسک، ساعت کاری و کامنت غیرفعال است.")}
        </p>
      )}

      {/* پورتِ `kteam-detail-meta`: تاریخِ ثبت، ددلاین با شمارش، پیشرفت، ساعت، والد/زیرپروژه‌ها. */}
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
        <li>{t("تاریخ ثبت")}: <b className="num text-foreground">{project.regDate ?? '—'}</b></li>
        <li>
          {t("ددلاین")}: <b className="num text-foreground">{project.deadline ?? '—'}</b>
          {deadlineHint && <span className="ms-1">({deadlineHint})</span>}
        </li>
        <li>
          {t("درصد پیشرفت")}: <b className="num text-foreground">{percent}%</b>
          <span className="ms-1 num">({detail.meta.doneTasks}/{detail.meta.totalTasks} {t("تسک")})</span>
        </li>
        {detail.meta.myMinutes !== null && (
          <li>{t("ساعت کاری شما")}: <b className="num text-foreground">{hoursLabel(detail.meta.myMinutes)}</b></li>
        )}
        {detail.meta.teamMinutes !== null && (
          <li>{t("ساعت کاری تیم")}: <b className="num text-foreground">{hoursLabel(detail.meta.teamMinutes)}</b></li>
        )}
        {detail.meta.parent && (
          <li>↳ {t("پیروِ پروژهٔ")}: <Link href={`/projects/${detail.meta.parent.id}`} className="underline">{detail.meta.parent.title}</Link></li>
        )}
        {detail.meta.children.length > 0 && (
          <li>
            {t("زیرپروژه‌ها (تغییر/نگهداری)")}:{' '}
            {detail.meta.children.map((c, i) => (
              <span key={c.id}>{i > 0 && t('، ')}<Link href={`/projects/${c.id}`} className="underline">{c.title}</Link></span>
            ))}
          </li>
        )}
      </ul>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {/*
          ⚠️ قیمتِ پروژه فقط برای مالک/مدیرِ مالی و **کارفرمای همین پروژه**.
          عضو دستمزدِ خودش را در تبِ مالی می‌بیند، نه مبلغِ قرارداد را —
          `domain/access/project-money`. پیش از این این کارت بی‌محافظ بود.
        */}
        {detail.canSeePrice && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-normal text-muted-foreground">{t("مبلغ")}</CardTitle></CardHeader>
            <CardContent><p className="num text-xl font-semibold">{format(project.price)}</p></CardContent>
          </Card>
        )}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-normal text-muted-foreground">{t("اعضا")}</CardTitle></CardHeader>
          <CardContent><p className="num text-xl font-semibold">{members.length}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-normal text-muted-foreground">{t("تسکِ باز")}</CardTitle></CardHeader>
          <CardContent><p className="num text-xl font-semibold">{openTasks.length}</p></CardContent>
        </Card>
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
          thumbnailFileId: project.thumbnailFileId,
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
          canInteract: detail.canInteract,
          canSeeFinance: detail.canSeeFinance,
          currencyCode: detail.currencyCode,
            logs: detail.logs,
            matrix: detail.matrix,
            dayLabels: detail.dayLabels,
          tasks,
          taskStatuses: taskStatuses.map((t) => ({
            id: t.id, name: t.name, group: t.group, color: t.color,
          })),
          taskFormOptions,
          qaForm: qaForm ? { roles: qaForm.roles } : null,
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
          <div className="grid gap-4">
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
                          <TableHead className="text-end">{t("مبلغ توافقی")}</TableHead>
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
                                style={m.roleColor ? { borderColor: m.roleColor, color: m.roleColor } : undefined}
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

    </main>
  );
}
