'use client';

import { useState } from 'react';
import { KeyRound } from 'lucide-react';
import { AccessDialog } from '../_people/access-dialog';
import { SECTION_ACCESS, type Level } from '@/domain/access/staff-levels';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { useT } from '@/i18n/client';

export interface StaffRow {
  id: number;
  name: string;
  email: string;
  levels: Record<string, Level>;
}

/** برچسبِ سطحِ یک بخش، برای نمایشِ خلاصه در ردیف. */
function levelLabel(sectionKey: string, level: Level): string | null {
  if (level === 'none') return null;
  const section = SECTION_ACCESS.find((s) => s.key === sectionKey);
  const option = section?.levels.find((l) => l.value === level);
  return option ? `${section!.label.split(' (')[0]}: ${option.label}` : null;
}

/**
 * دسترسی همکاران ادمین.
 *
 * ⚠️ خلاصهٔ دسترسی در همان ردیف دیده می‌شود، نه فقط داخلِ دیالوگ — مالک باید
 * با یک نگاه بفهمد چه کسی به مالی دسترسی دارد.
 */
export function StaffSection({ staff }: { staff: StaffRow[] }) {
  const tr = useT();
  const t = useT();
  const [target, setTarget] = useState<StaffRow | null>(null);
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState<{ text: string; isError: boolean } | null>(null);

  if (staff.length === 0) {
    return (
      <EmptyState
        title={t("همکارِ ادمینی ثبت نشده")}
        description={t("همکارِ ادمین کسی است که بخشی از پنل را می‌بیند یا مدیریت می‌کند، بدونِ اینکه مدیرِ کل باشد.")}
      />
    );
  }

  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted-foreground">
        {tr("برای هر بخش تعیین کنید این همکار دسترسی نداشته باشد، فقط ببیند، یا مدیریت کند. کارهای حساس (تنظیمات، حذف، بستنِ مالی) همیشه فقط برای مدیرِ کل است.")}
      </p>

      {notice && (
        <p className={`text-sm ${notice.isError ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-500'}`}>
          {notice.text}
        </p>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("همکار")}</TableHead>
            <TableHead>{t("دسترسی‌های فعلی")}</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {staff.map((s) => {
            const granted = SECTION_ACCESS
              .map((section) => levelLabel(section.key, s.levels[section.key] ?? 'none'))
              .filter((x): x is string => x !== null);

            return (
              <TableRow key={s.id}>
                <TableCell>
                  <span className="font-medium">{s.name}</span>
                  <span className="block text-xs text-muted-foreground">{s.email}</span>
                </TableCell>
                <TableCell>
                  {granted.length === 0 ? (
                    <span className="text-sm text-muted-foreground">{t("بدون دسترسی")}</span>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {granted.map((g) => <Badge key={g} variant="outline">{g}</Badge>)}
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-end">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => { setTarget(s); setOpen(true); }}
                  >
                    <KeyRound className="size-3.5" />
                    {tr("دسترسی‌ها")}
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <AccessDialog
        person={target}
        open={open}
        onOpenChange={setOpen}
        onNotice={(text, isError) => setNotice({ text, isError })}
      />
    </div>
  );
}
