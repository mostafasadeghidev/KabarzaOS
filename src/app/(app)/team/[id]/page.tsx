import { redirect } from 'next/navigation';
import Link from 'next/link';
import { currentActor } from '@/server/auth';
import { teamMember } from '@/server/team/service';
import { ForbiddenError } from '@/domain/access/guard';
import { hoursLabel } from '@/domain/timelogs/timer';
import { RANGE_LABELS, type RangeKey } from '@/domain/access/office-scope';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableNumericCell, TableRow,
} from '@/components/ui/table';
import { TeamMatrix } from '../../projects/[id]/manage-tab';
import { AbsencePanel } from '../../activity/absence-panel';
import { primeTranslations, t } from '@/i18n/server';
import { PageHeader, PageShell, Section } from '@/components/page-shell';
import { StatCard } from '@/components/stat-card';
import { Progress } from '@/components/ui/progress';

/**
 * پروفایلِ کاریِ یک عضو برای مدیرِ دفتر — پورتِ `view_team_member`: آمار،
 * پروژه‌های در حال اجرا، کارکرد به تفکیکِ پروژه، در دسترس بودن، مرخصی.
 * ⚠️ گاردِ دامنه در سرویس است — شناسهٔ خارج از دامنه ۴۰۳ می‌گیرد، نه صفحهٔ خالی.
 */
export default async function TeamMemberPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ range?: string }>;
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

  const userId = Number((await params).id);
  const query = await searchParams;

  let data;
  try {
    data = await teamMember(actor, userId, query);
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return (
        <PageShell>
          <PageHeader back={{ href: '/team', label: t("تیمِ من") }} title={t("تیمِ من")} />
          <EmptyState title={t("دسترسی ندارید")} description={t("این عضو در دامنهٔ مدیریتِ شما نیست.")} />
        </PageShell>
      );
    }
    throw error;
  }

  const total = data.logs.reduce((sum, l) => sum + l.minutes, 0);
  const today = new Date().toISOString().slice(0, 10);
  const stats = [
    { label: 'پروژه‌ها', value: String(data.stats.projects), href: null },
    { label: 'در حال اجرا', value: String(data.stats.openProjects), href: null },
    { label: 'مجموع ساعت کاری', value: hoursLabel(data.stats.minutes), href: null },
    // پورتِ افزونه: کارتِ «تسک باز» به بردِ تسک‌های همین نفر می‌رود.
    { label: 'تسک باز', value: String(data.stats.openTasks), href: `/team?tab=tasks&tassignee=${userId}` },
  ];

  return (
    <PageShell>
      <PageHeader
        back={{ href: '/team', label: t("تیمِ من") }}
        title={data.person?.name ?? `#${userId}`}
        description={(
          <>
            {data.person?.roleNames.length ? data.person.roleNames.join('، ') : t('عضو')}
            {' · '}
            {t(RANGE_LABELS[(data.period.range ?? 'week') as RangeKey])} · {t('مجموع')}{' '}
            <span className="num">{hoursLabel(total)}</span>
          </>
        )}
      />

      {/* پورتِ کارت‌های آمار. */}
      <div className="grid gap-4 @md/main:grid-cols-2 @xl/main:grid-cols-4">
        {stats.map((c) => (
          <StatCard key={c.label} label={t(c.label)} value={c.value} href={c.href} />
        ))}
      </div>

      {/* پروژه‌های در حال اجرا: نقش، پیشرفت، ساعتِ خودش، تسکِ باز. */}
      <Section title={t("پروژه‌های در حال اجرا")}>
        {data.openProjects.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("پروژهٔ بازی ندارد.")}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("پروژه")}</TableHead>
                <TableHead>{t("نقش")}</TableHead>
                <TableHead>{t("درصد پیشرفت")}</TableHead>
                <TableHead numeric>{t("ساعت کاری")}</TableHead>
                <TableHead numeric>{t("تسک باز")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.openProjects.map((p) => (
                <TableRow key={p.id}>
                  <TableCell><Link href={`/projects/${p.id}`} className="hover:underline">{p.title}</Link></TableCell>
                  <TableCell>{p.roles.length > 0 ? p.roles.join('، ') : '—'}</TableCell>
                  <TableCell>
                    <span className="flex items-center gap-2">
                      <Progress value={p.progress} className="w-24" aria-label={t("درصد پیشرفت")} />
                      <span className="num text-xs">{p.progress}%</span>
                    </span>
                  </TableCell>
                  <TableNumericCell>{hoursLabel(p.minutes)}</TableNumericCell>
                  <TableNumericCell>{p.openTasks}</TableNumericCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Section>

      <Section title={t("کارکرد به تفکیک پروژه")}>
        {data.hoursAllTime.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("هنوز ساعتی ثبت نشده.")}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("پروژه")}</TableHead>
                <TableHead numeric>{t("ساعت کاری")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.hoursAllTime.map((l) => (
                <TableRow key={l.projectId ?? 'general'}>
                  <TableCell>
                    {l.projectId ? <Link href={`/projects/${l.projectId}`} className="hover:underline">{l.projectTitle}</Link> : t('کارِ عمومی')}
                  </TableCell>
                  <TableNumericCell>{hoursLabel(l.minutes)}</TableNumericCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell className="font-semibold">{t("مجموع")}</TableCell>
                <TableNumericCell className="font-semibold">{hoursLabel(data.stats.minutes)}</TableNumericCell>
              </TableRow>
            </TableBody>
          </Table>
        )}
      </Section>

      {data.matrix.length > 0 && (
        <Section title={t("در دسترس بودن")}>
          <TeamMatrix rows={data.matrix} dayLabels={data.dayLabels} />
        </Section>
      )}

      {/* پورتِ کارتِ مرخصی: مدیرِ دفتر برای این عضو مرخصی ثبت/حذف می‌کند. */}
      {data.canLeave && data.person && (
        <Section
          title={t("مرخصی / غیبت")}
          description={t("برای این عضو مرخصی ثبت کنید؛ به او اطلاع داده می‌شود و در بُردِ تیم دیده می‌شود.")}
        >
          <AbsencePanel
            data={{
              mine: data.absences,
              targets: [{ id: data.person.id, name: data.person.name }],
              meId: data.person.id,
              today,
              listTitle: 'مرخصی‌های عضو',
            }}
          />
        </Section>
      )}

      <Section title={t("تسک‌های بازِ این عضو")}>
        {data.openTasks.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("تسکِ بازی ندارد.")}</p>
        ) : (
          <ul className="grid gap-1">
            {data.openTasks.map((task) => (
              <li key={task.id} className="rounded-lg border px-3 py-2 text-sm">
                {task.title}
                <span className="ms-2 text-xs text-muted-foreground">{task.projectTitle}</span>
                {task.dueDate && <span className="num ms-2 text-xs text-muted-foreground">{task.dueDate}</span>}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </PageShell>
  );
}
