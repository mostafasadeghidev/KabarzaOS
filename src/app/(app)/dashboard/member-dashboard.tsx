import Link from 'next/link';
import type { ClientSection, MemberDashboard, MemberSection } from '@/server/dashboard-member';
import { format } from '@/domain/money/money';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { ProjectStatus } from '../projects/project-status';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableNumericCell, TableRow,
} from '@/components/ui/table';
import { t } from '@/i18n/server';
import { formatDateTime } from '@/i18n/datetime';

/**
 * داشبوردِ عضو و کارفرما — پورتِ `member_overview()` / `client_overview()`.
 *
 * عضو: کارت‌ها + «پروژه‌های باز شما» (بدونِ قیمت) + مناقصه‌ها.
 * کارفرما: کارت‌ها + جدولِ پروژه‌ها **با** قیمت / وضعیتِ پرداخت / مانده /
 * تعدادِ تسک / پیشرفت / ساعتِ تیم — همان ستون‌های افزونه.
 * هر دو: «جلسات این هفته».
 */

type MoneyLines = Array<{ currencyCode: string; total: string }>;

function hours(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? String(h) : `${h}:${String(m).padStart(2, '0')}`;
}

const PAY_LABELS: Record<string, string> = {
  unpaid: 'پرداخت‌نشده',
  partial: 'پرداختِ جزئی',
  paid: 'تسویه‌شده',
};

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

/**
 * کارتِ ماندهٔ باز — به «امور مالی» می‌برد.
 * ⚠️ به تفکیکِ ارز نوشته می‌شود؛ جمعِ چندارزی در یک عدد بی‌معناست.
 */
function MoneyStat({
  lines, label,
}: { lines: Array<{ currencyCode: string; total: string }>; label: string }) {
  return (
    <Link href="/my-money">
      <Card className="transition-colors hover:border-primary/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-normal text-muted-foreground">{label}</CardTitle>
        </CardHeader>
        <CardContent>
          {lines.length === 0 ? (
            <p className="num text-2xl font-semibold">0</p>
          ) : (
            <div className="grid gap-0.5">
              {lines.map((l) => (
                <p key={l.currencyCode} className="num text-xl font-semibold">
                  {format(l.total)} <span className="text-xs font-normal text-muted-foreground">{l.currencyCode}</span>
                </p>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

function MemberBlock({ data, unread, money }: { data: MemberSection; unread: number; money: MoneyLines }) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat value={data.stats.projects} label={t('پروژه‌ها')} href="/projects" />
        <Stat value={data.stats.openTasks} label={t('تسک‌های باز')} href="/tasks" />
        <Stat value={data.stats.commentsToReview} label={t('کامنت‌های نیازمند بررسی')} href="/projects?tab=review" />
        <Stat value={unread} label={t('پیام‌های خوانده‌نشده')} href="/messages" />
        <MoneyStat lines={money} label={t('ماندهٔ دریافتیِ شما')} />
      </div>

      {/* پورتِ «پروژه‌های باز شما» — فقط بازها؛ بخش وقتی خالی است پنهان می‌ماند. */}
      {data.rows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('پروژه‌های باز شما')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('نام')}</TableHead>
                    <TableHead>{t('نقش شما')}</TableHead>
                    <TableHead>{t('تاریخ شروع')}</TableHead>
                    <TableHead>{t('وضعیت پروژه')}</TableHead>
                    <TableHead>{t('ددلاین')}</TableHead>
                    <TableHead className="text-end">{t('ساعت کاری شما')}</TableHead>
                    <TableHead className="text-end">{t('تسک‌های باقی‌مانده')}</TableHead>
                    <TableHead className="text-end">{t('درصد پیشرفت')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.rows.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">
                        <Link href={`/projects/${p.id}`} className="hover:underline">{p.title}</Link>
                      </TableCell>
                      <TableCell>{p.myRoles.length > 0 ? p.myRoles.join(t('، ')) : '—'}</TableCell>
                      <TableNumericCell>{p.regDate ?? '—'}</TableNumericCell>
                      <TableCell><ProjectStatus name={p.statusName} group={p.statusGroup} /></TableCell>
                      <TableNumericCell>{p.deadline ?? '—'}</TableNumericCell>
                      <TableNumericCell>{hours(p.myMinutes)}</TableNumericCell>
                      <TableNumericCell>{p.myOpenTasks}</TableNumericCell>
                      <TableNumericCell>{p.percent}%</TableNumericCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}

function ClientBlock({ data, unread, showUnread, money }: { data: ClientSection; unread: number; showUnread: boolean; money: MoneyLines }) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat value={data.stats.projects} label={t('پروژه‌ها (به‌عنوان کارفرما)')} href="/projects" />
        <Stat value={data.stats.reviewTasks} label={t('تسک‌های نیازمند بررسی')} href="/tasks" />
        <Stat value={data.stats.commentsToReview} label={t('کامنت‌های نیازمند بررسی')} href="/projects?tab=review" />
        {showUnread && <Stat value={unread} label={t('پیام‌های خوانده‌نشده')} href="/messages" />}
        <MoneyStat lines={money} label={t('ماندهٔ پرداختیِ شما')} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('پروژه‌های شما (به‌عنوان کارفرما)')}</CardTitle>
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
                    <TableHead>{t('تاریخ ثبت')}</TableHead>
                    <TableHead className="text-end">{t('قیمت')}</TableHead>
                    <TableHead>{t('وضعیت پروژه')}</TableHead>
                    <TableHead>{t('وضعیت پرداخت')}</TableHead>
                    <TableHead className="text-end">{t('مانده')}</TableHead>
                    <TableHead className="text-end">{t('تعداد تسک‌ها')}</TableHead>
                    <TableHead className="text-end">{t('درصد پیشرفت')}</TableHead>
                    <TableHead className="text-end">{t('ساعت کاری تیم')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.rows.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">
                        <Link href={`/projects/${p.id}`} className="hover:underline">{p.title}</Link>
                      </TableCell>
                      <TableNumericCell>{p.regDate ?? '—'}</TableNumericCell>
                      <TableNumericCell>{format(p.price)} {p.currencyCode ?? ''}</TableNumericCell>
                      <TableCell><ProjectStatus name={p.statusName} group={p.statusGroup} /></TableCell>
                      <TableCell>
                        <Badge variant={p.paymentStatus === 'paid' ? 'success' : p.paymentStatus === 'partial' ? 'warning' : 'outline'}>
                          {t(PAY_LABELS[p.paymentStatus] ?? p.paymentStatus)}
                        </Badge>
                      </TableCell>
                      <TableNumericCell>{format(String(p.remaining))} {p.currencyCode ?? ''}</TableNumericCell>
                      <TableNumericCell>{p.taskCount}</TableNumericCell>
                      <TableNumericCell>{p.percent}%</TableNumericCell>
                      <TableNumericCell>{hours(p.teamMinutes)}</TableNumericCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}

export function MemberDashboardView({ data, timezone = '' }: { data: MemberDashboard; timezone?: string }) {
  return (
    <div className="grid gap-6">
      {data.member && (
        <MemberBlock data={data.member} unread={data.unread} money={data.money?.member ?? []} />
      )}
      {data.client && (
        <ClientBlock
          data={data.client}
          unread={data.unread}
          showUnread={!data.member}
          money={data.money?.client ?? []}
        />
      )}

      {/* پورتِ «مناقصه‌ها»: پروژه‌هایی که می‌توانید برایشان پیشنهاد قیمت بدهید. */}
      {data.tenders.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('مناقصه‌ها')}</CardTitle>
            <p className="text-xs text-muted-foreground">{t('پروژه‌هایی که می‌توانید برایشان پیشنهاد قیمت بدهید.')}</p>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('نام')}</TableHead>
                    <TableHead>{t('نقش‌های شما')}</TableHead>
                    <TableHead className="text-end">{t('پیشنهاد شما')}</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.tenders.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">
                        <Link href={`/projects/${p.id}?tab=my-bid`} className="hover:underline">{p.title}</Link>
                      </TableCell>
                      <TableCell>{p.roleNames.join(t('، '))}</TableCell>
                      <TableNumericCell>{p.myBids > 0 ? p.myBids : '—'}</TableNumericCell>
                      <TableCell className="text-end">
                        <Link href={`/projects/${p.id}?tab=my-bid`} className="text-sm underline">
                          {p.myBids > 0 ? t('ویرایش پیشنهاد') : t('پیشنهاد بده')}
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* پورتِ «جلسات این هفته» — برای هر نقش؛ وقتی خالی است پنهان می‌ماند. */}
      {data.meetings.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('جلسات این هفته')}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {data.meetings.map((m) => (
                <li key={m.id} className="rounded-md border p-3 text-sm">
                  <p className="font-medium">{m.title}</p>
                  <p className="num text-xs text-muted-foreground">{formatDateTime(m.meetAt, timezone)}</p>
                  {m.location && <p className="text-xs text-muted-foreground">{m.location}</p>}
                  {m.projectTitle && <Badge variant="secondary" className="mt-1">{m.projectTitle}</Badge>}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-sm">
              <Link href="/meetings" className="underline">{t('همهٔ جلسات')} →</Link>
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
