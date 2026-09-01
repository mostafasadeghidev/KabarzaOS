import Link from 'next/link';
import type { MemberDashboard } from '@/server/dashboard-member';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { ProjectStatus } from '../projects/project-status';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableNumericCell, TableRow,
} from '@/components/ui/table';
import { t } from '@/i18n/server';

/**
 * داشبوردِ عضو و کارفرما — پورتِ `member_overview()` / `client_overview()`.
 *
 * ⚠️ **بدونِ قیمت**. کامنتِ خودِ نسخهٔ قبلی روی جدولِ عضو: «Open projects
 * only — minimal columns, no price». ستون‌ها همان‌هایی‌اند که آنجا هست:
 * نام · نقشِ شما · تاریخِ شروع · ددلاین · ساعتِ کاریِ شما · تسکِ باقی‌مانده ·
 * درصدِ پیشرفت.
 *
 * کارفرما همان کارت‌ها را می‌بیند ولی برچسبِ «تسکِ باز» برایش «تسکِ نیازمندِ
 * بررسی» است — او تسکِ اساین‌شده ندارد.
 */

function hours(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? String(h) : `${h}:${String(m).padStart(2, '0')}`;
}

function Stat({ value, label, href }: { value: number; label: string; href: string }) {
  return (
    <Link href={href}>
      <Card className="transition-colors hover:border-primary/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-normal text-muted-foreground">{label}</CardTitle>
        </CardHeader>
        <CardContent><p className="num text-2xl font-semibold">{value}</p></CardContent>
      </Card>
    </Link>
  );
}

export function MemberDashboardView({ data }: { data: MemberDashboard }) {
  const isClient = data.kind === 'client';

  return (
    <div className="grid gap-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat value={data.stats.projects} label={t('پروژه‌ها')} href="/projects" />
        <Stat
          value={data.stats.openTasks}
          label={isClient ? t('تسک‌های نیازمند بررسی') : t('تسک‌های باز')}
          href="/tasks"
        />
        <Stat
          value={data.stats.commentsToReview}
          label={t('کامنت‌های نیازمند بررسی')}
          href="/projects"
        />
        <Stat value={data.stats.unread} label={t('پیام‌های خوانده‌نشده')} href="/messages" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {isClient ? t('پروژه‌های شما (به‌عنوان کارفرما)') : t('پروژه‌های باز شما')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.rows.length === 0 ? (
            <EmptyState title={t('پروژه‌ای ندارید.')} />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('نام')}</TableHead>
                    {!isClient && <TableHead>{t('نقش شما')}</TableHead>}
                    <TableHead>{t('وضعیت پروژه')}</TableHead>
                    <TableHead>{t('ددلاین')}</TableHead>
                    {!isClient && (
                      <TableHead className="text-end">{t('ساعت کاری شما')}</TableHead>
                    )}
                    <TableHead className="text-end">{t('تسک‌های باقی‌مانده')}</TableHead>
                    <TableHead className="text-end">{t('درصد پیشرفت')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.rows.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">
                        <Link href={`/projects/${p.id}`} className="hover:underline">
                          {p.title}
                        </Link>
                      </TableCell>
                      {!isClient && (
                        <TableCell>
                          {p.myRoles.length > 0 ? p.myRoles.join(t('، ')) : '—'}
                        </TableCell>
                      )}
                      <TableCell>
                        <ProjectStatus name={p.statusName} group={p.statusGroup} />
                      </TableCell>
                      <TableNumericCell>{p.deadline ?? '—'}</TableNumericCell>
                      {!isClient && <TableNumericCell>{hours(p.myMinutes)}</TableNumericCell>}
                      <TableNumericCell>{p.myOpenTasks}</TableNumericCell>
                      <TableNumericCell>{p.percent}%</TableNumericCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
