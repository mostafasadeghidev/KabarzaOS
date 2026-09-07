import Link from 'next/link';
import { Lock } from 'lucide-react';
import type { InboxTask } from '@/server/projects/service';
import { Badge } from '@/components/ui/badge';
import { chipStyle } from '@/domain/ui/contrast';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableNumericCell, TableRow,
} from '@/components/ui/table';
import { t } from '@/i18n/server';
import { ClaimTaskButton } from './inbox-claim';

/**
 * فهرستِ تسک‌های صندوق — **جدول**، نه ردیفِ درهم.
 *
 * ⚠️ چرا جدول: پیش از این هر تسک یک `flex-wrap` بود و چیپ‌ها هرجا که جا
 * داشتند می‌نشستند؛ در فهرستِ ده‌تایی هیچ ستونی زیرِ هم نبود و چشم باید هر
 * سطر را از نو می‌خواند. ستون‌ها ثابت‌اند: تسک · اولویت · وضعیت · پروژه ·
 * ددلاین · کنش.
 */
export function TaskTable({ rows, empty }: { rows: InboxTask[]; empty: string }) {
  if (rows.length === 0) {
    return <p className="px-4 pb-4 text-sm text-muted-foreground">{empty}</p>;
  }

  return (
    <div className="overflow-x-auto px-4 pb-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("تسک")}</TableHead>
            <TableHead>{t("اولویت")}</TableHead>
            <TableHead>{t("وضعیت")}</TableHead>
            <TableHead>{t("پروژه")}</TableHead>
            <TableHead>{t("ددلاین")}</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((task) => (
            <TableRow key={task.id}>
              <TableCell>
                <span className="flex items-center gap-1.5">
                  {/* پورتِ چیپِ 🔒 «خصوصی». */}
                  {task.isPrivate && (
                    <Lock className="size-3.5 shrink-0 text-muted-foreground" aria-label={t('خصوصی')} />
                  )}
                  <Link
                    // پورتِ «باز کردن در پروژه» — با تبِ تسک‌ها و زیرتبِ درست.
                    href={`/projects/${task.projectId}?tab=tasks&view=${task.isReview ? 'review' : 'cur'}`}
                    className="font-medium hover:underline"
                  >
                    {task.title}
                  </Link>
                </span>
                {/* نقش‌ها زیرِ عنوان می‌نشینند تا ستون‌ها به‌هم نریزند. */}
                {task.roles.length > 0 && (
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {task.roles
                      .map((r) => (r.claimedByName ? `${r.roleName ?? ''} (${r.claimedByName})` : (r.roleName ?? '')))
                      .join(t('، '))}
                  </span>
                )}
              </TableCell>

              <TableCell>
                {task.priorityName
                  ? <Badge variant="outline" style={chipStyle(task.priorityColor)}>{task.priorityName}</Badge>
                  : <span className="text-muted-foreground">—</span>}
              </TableCell>

              <TableCell>
                {task.statusName
                  ? (
                    <Badge
                      variant={chipStyle(task.statusColor) ? 'outline' : 'secondary'}
                      style={chipStyle(task.statusColor)}
                    >
                      {task.statusName}
                    </Badge>
                  )
                  : <span className="text-muted-foreground">—</span>}
              </TableCell>

              <TableCell className="text-muted-foreground">{task.projectTitle}</TableCell>
              <TableNumericCell className="text-muted-foreground">{task.dueDate ?? '—'}</TableNumericCell>

              <TableCell>
                {task.claimable && <ClaimTaskButton taskId={task.id} projectId={task.projectId} />}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
