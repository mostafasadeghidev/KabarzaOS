import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentActor } from '@/server/auth';
import { onboardingBoard } from '@/server/onboarding/service';
import { ForbiddenError } from '@/domain/access/guard';
import { can } from '@/domain/access/permissions';
import { EmptyState } from '@/components/ui/empty-state';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableNumericCell, TableRow,
} from '@/components/ui/table';
import { PageHeader, PageShell, Panel } from '@/components/page-shell';
import { primeTranslations, t } from '@/i18n/server';
import { formatDate } from '@/i18n/datetime';
import { StartPicker, TaskRows } from './onboarding-client';
import { pageTitle } from '@/i18n/page-title';

export const generateMetadata = pageTitle('آنبوردینگ');

/**
 * آنبوردینگ — نمای مدیرانِ اعضا: کارهایی که با خودشان است، اعضایی که
 * آنبوردینگشان در جریان است، و شروع برای عضوی که هنوز ندارد.
 * ⚠️ گاردِ «اعضا» (`members.view`) در سرویس است؛ خاموش‌بودن در همین صفحه گفته می‌شود.
 */
export default async function OnboardingPage() {
  await primeTranslations();
  const actor = await currentActor();
  if (!actor) redirect('/login');

  let data;
  try {
    data = await onboardingBoard(actor);
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return (
        <PageShell>
          <PageHeader title={t('آنبوردینگ')} />
          <EmptyState title={t('دسترسی ندارید')} description={t('آنبوردینگ برای کسی باز است که اعضا را می‌بیند.')} />
        </PageShell>
      );
    }
    throw error;
  }

  const canEditLibrary = can(actor, 'settings.manage');

  if (!data.enabled) {
    return (
      <PageShell>
        <PageHeader title={t('آنبوردینگ')} />
        <EmptyState
          title={t('آنبوردینگ خاموش است')}
          description={t('از «تنظیمات ← سامانه» روشنش کنید. داده‌های قبلی سرِ جایشان هستند.')}
        />
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeader
        title={t('آنبوردینگ')}
        description={t('کارهای روزهای اولِ اعضای تازه — از کتابخانهٔ هر نقش ساخته می‌شود.')}
        actions={canEditLibrary && (
          <Link href="/settings?tab=onboarding" className="text-sm underline">{t('ویرایشِ کتابخانه')}</Link>
        )}
      />

      {data.mine.length > 0 && (
        <Panel title={t('با شماست')} description={t('کارهای آنبوردینگِ دیگران که انجامشان با شماست.')}>
          <TaskRows tasks={data.mine} showPerson />
        </Panel>
      )}

      <Panel title={t('در جریان')}>
        {data.people.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('هنوز آنبوردینگی شروع نشده.')}</p>
        ) : (
          <Table frame={false}>
            <TableHeader>
              <TableRow>
                <TableHead>{t('عضو')}</TableHead>
                <TableHead className="w-56">{t('پیشرفت')}</TableHead>
                <TableHead numeric>{t('انجام شده')}</TableHead>
                <TableHead numeric>{t('عقب‌افتاده')}</TableHead>
                <TableHead numeric>{t('شروع')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.people.map((p) => {
                const percent = p.total === 0 ? 0 : Math.round((p.done / p.total) * 100);
                return (
                  <TableRow key={p.userId}>
                    <TableCell className="font-medium">
                      <Link href={`/onboarding/${p.userId}`} className="hover:underline">{p.name}</Link>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Progress value={percent} className="h-2" />
                        <span className="num text-xs text-muted-foreground">{percent}%</span>
                      </div>
                    </TableCell>
                    <TableNumericCell>{p.done} / {p.total}</TableNumericCell>
                    <TableNumericCell>
                      {p.overdue > 0 ? <Badge variant="warning">{p.overdue}</Badge> : '—'}
                    </TableNumericCell>
                    <TableNumericCell>{formatDate(p.startedAt)}</TableNumericCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Panel>

      {data.canManage && (
        <Panel
          title={t('شروع برای عضوِ فعلی')}
          description={t('عضوِ تازه خودکار چک‌لیست می‌گیرد؛ اینجا برای عضوی است که پیش از روشن‌شدنِ آنبوردینگ آمده.')}
        >
          {data.candidates.length === 0
            ? <p className="text-sm text-muted-foreground">{t('همهٔ اعضای فعال آنبوردینگ دارند.')}</p>
            : <StartPicker candidates={data.candidates} />}
        </Panel>
      )}
    </PageShell>
  );
}
