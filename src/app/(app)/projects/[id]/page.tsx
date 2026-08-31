import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { currentActor } from '@/server/auth';
import { listUnitEntries, myRequests, myUnpaidUnits } from '@/server/finance/member-service';
import {
  getBidderView, getMemberTender, getMembersForm, getProjectFormOptions, getProjectTabs,
  getQaForm,
  getTaskFormOptions,
  getTaskStatusOptions, NotFoundError,
} from '@/server/projects/service';
import { ForbiddenError } from '@/domain/access/guard';
import { format } from '@/domain/money/money';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { MembersDialog } from '../_form/members-dialog';
import { ProjectDialog } from '../_form/project-dialog';
import { ProjectTabs } from './project-tabs';
import { BidderView } from './bidder-view';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableNumericCell, TableRow,
} from '@/components/ui/table';
import { ProjectStatus } from '../project-status';
import { t } from '@/i18n/server';

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await currentActor();
  if (!actor) redirect('/login');

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
      isFrozen: project.isArchived,
      units,
      myUnpaidUnits: unpaid,
      requests: requests.requests,
      remaining: requests.remaining,
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
  const [taskStatuses, taskFormOptions, qaForm] = await Promise.all([
    getTaskStatusOptions(actor),
    canManage ? getTaskFormOptions(actor, project.id) : Promise.resolve(null),
    canManage ? getQaForm(actor, project.id) : Promise.resolve(null),
  ]);

  // فرم‌ها فقط وقتی خوانده می‌شوند که دکمه‌شان هم دیده شود.
  const [membersForm, formOptions] = canManage
    ? await Promise.all([
        getMembersForm(actor, project.id).then((m) => ({ projectId: project.id, ...m })),
        getProjectFormOptions(actor, project.id),
      ])
    : [null, null];
  const openTasks = tasks.filter((t) => t.statusGroup !== 'complete');

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
          <div className="mt-2 flex items-center gap-2">
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

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-normal text-muted-foreground">{t("مبلغ")}</CardTitle></CardHeader>
          <CardContent><p className="num text-xl font-semibold">{format(project.price)}</p></CardContent>
        </Card>
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
        data={{
          projectId: project.id,
          title: project.title,
          isTender: project.isTender,
          isArchived: project.isArchived,
          thumbnailFileId: project.thumbnailFileId,
          roleHolders: detail.roleHolders,
          currentUserId: detail.currentUserId,
          myMoney,
          myBid,
          price: project.price,
          canManage,
          canSeeFinance: detail.canSeeFinance,
          tasks,
          taskStatuses: taskStatuses.map((t) => ({ id: t.id, name: t.name, group: t.group })),
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
                        <TableHead className="text-end">{t("مبلغ توافقی")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {members.map((m) => (
                        <TableRow key={m.id}>
                          <TableCell className="font-medium">{m.userName}</TableCell>
                          <TableCell>{m.roleName ?? '—'}</TableCell>
                          <TableNumericCell>{format(m.agreedAmount)}</TableNumericCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

          </div>
        }
      />

    </main>
  );
}
