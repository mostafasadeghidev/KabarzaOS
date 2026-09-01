'use client';

import { useState, useTransition } from 'react';
import { KeyRound, UserMinus, UserPlus } from 'lucide-react';
import { setStaffRoleAction } from '../_people/_form/access-actions';
import { useToast } from '@/components/ui/toast';
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
export function StaffSection({
  staff,
  candidates,
}: {
  staff: StaffRow[];
  /** کاربرانی که هنوز همکارِ ادمین نیستند. */
  candidates: Array<{ id: number; name: string; email: string }>;
}) {
  const tr = useT();
  const t = useT();
  const { show } = useToast();
  const [target, setTarget] = useState<StaffRow | null>(null);
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState<{ text: string; isError: boolean } | null>(null);
  const [pick, setPick] = useState('');
  const [pending, startTransition] = useTransition();

  /**
   * ⚠️ افزودنِ همکار **بالای** جدول می‌ماند، حتی وقتی هنوز همکاری نیست —
   * پیش از این حالتِ خالی زودتر return می‌کرد و تنها راهِ ساختنِ اولین
   * همکارِ ادمین را هم پنهان می‌کرد.
   */
  const setStaff = (userId: number, staffFlag: boolean) =>
    startTransition(async () => {
      const result = await setStaffRoleAction(userId, staffFlag);
      if (result.error) show(t(result.error), 'error');
      else show(t(result.message ?? 'انجام شد.'), 'success');
      setPick('');
    });

  const adder = candidates.length > 0 && (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed p-3">
      <span className="text-sm text-muted-foreground">{tr('افزودنِ همکارِ ادمین')}</span>
      <select
        value={pick}
        onChange={(e) => setPick(e.target.value)}
        className="h-9 min-w-56 flex-1 rounded-md border border-input bg-transparent px-3 text-sm outline-none"
      >
        <option value="">{t('— انتخابِ کاربر —')}</option>
        {candidates.map((c) => (
          <option key={c.id} value={c.id}>{`${c.name} — ${c.email}`}</option>
        ))}
      </select>
      <Button
        type="button"
        size="sm"
        disabled={pick === '' || pending}
        onClick={() => setStaff(Number(pick), true)}
      >
        <UserPlus className="size-3.5" />
        {tr('افزودن')}
      </Button>
    </div>
  );

  if (staff.length === 0) {
    return (
      <div className="grid gap-3">
        {adder}
        <EmptyState
          title={t("همکارِ ادمینی ثبت نشده")}
          description={t("همکارِ ادمین کسی است که بخشی از پنل را می‌بیند یا مدیریت می‌کند، بدونِ اینکه مدیرِ کل باشد.")}
        />
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {adder}
      <p className="text-sm text-muted-foreground">
        {tr("برای هر بخش تعیین کنید این همکار دسترسی نداشته باشد، فقط ببیند، یا مدیریت کند. کارهای حساس (تنظیمات، حذف، بستنِ مالی) همیشه فقط برای مدیرِ کل است.")}
      </p>

      {notice && (
        <p className={`text-sm ${notice.isError ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-500'}`}>
          {t(notice.text)}
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
                  {/* ⚠️ برداشتنِ نقش، دسترسی‌های per-user را هم پاک می‌کند. */}
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="ms-1 text-muted-foreground hover:text-destructive"
                    disabled={pending}
                    onClick={() => setStaff(s.id, false)}
                  >
                    <UserMinus className="size-3.5" />
                    {tr("برداشتن")}
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
