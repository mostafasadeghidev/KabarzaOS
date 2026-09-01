'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Plus, X } from 'lucide-react';
import { saveAvailabilityAction, type AvailabilityState } from './_form/availability-actions';
import { formatSlots, slotsSpan, WEEKDAYS, type Slot } from '@/domain/availability/weekly';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { useT } from '@/i18n/client';
import { PresenceDot } from '@/components/presence';
import type { PresenceState } from '@/domain/people/presence';
import { Thumb } from '@/components/thumb';
import { TablePager, TableSearch, useTableView } from '@/components/ui/table-search';

export interface MatrixRow {
  id: number;
  name: string;
  /** نقطهٔ حضورِ زنده؛ null = حضور خاموش است. */
  presence: PresenceState | null;
  avatarFileId: number | null;
  hasSchedule: boolean;
  /** روز ← بازه‌ها؛ کلیدِ نبوده یعنی آن روز در دسترس نیست. */
  days: Record<number, Slot[]>;
}

export interface AvailabilityData {
  /** برنامهٔ خودِ کاربر. */
  mine: Record<number, Slot[]>;
  order: number[];
  matrix: MatrixRow[];
  canSeeTeam: boolean;
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? 'در حالِ ذخیره…' : 'ذخیرهٔ برنامه'}
    </Button>
  );
}

/** ویرایشگرِ یک روز — تیکِ روز و بازه‌های ساعتی‌اش. */
function DayEditor({ weekday, initial }: { weekday: number; initial: Slot[] | undefined }) {
  const tr = useT();
  const t = useT();
  const enabled = initial !== undefined;
  const [on, setOn] = useState(enabled);
  const [slots, setSlots] = useState<Slot[]>(initial ?? []);

  return (
    <div className="grid gap-2 rounded-md border p-3">
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id={`day-${weekday}`}
          name="onDays"
          value={weekday}
          checked={on}
          onChange={(e) => setOn(e.target.checked)}
          className="size-4 accent-primary"
        />
        <Label htmlFor={`day-${weekday}`} className="font-medium">{tr(WEEKDAYS[weekday] ?? '')}</Label>

        {on && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="ms-auto"
            onClick={() => setSlots((s) => [...s, { from: '09:00', to: '17:00' }])}
          >
            <Plus className="size-3.5" />
            {tr("بازهٔ ساعتی")}
          </Button>
        )}
      </div>

      {on && (
        slots.length === 0 ? (
          // ⚠️ روزِ تیک‌خوردهٔ بی‌بازه یعنی «تمام روز» — باید صریح گفته شود.
          <p className="text-xs text-muted-foreground">{t("تمامِ روز در دسترس (بازه‌ای اضافه نکرده‌اید).")}</p>
        ) : (
          <div className="grid gap-1.5">
            {slots.map((slot, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  type="time"
                  name={`slot-${weekday}-from`}
                  defaultValue={slot.from}
                  className="num w-32"
                />
                <span className="text-muted-foreground">{t("تا")}</span>
                <Input
                  type="time"
                  name={`slot-${weekday}-to`}
                  defaultValue={slot.to}
                  className="num w-32"
                />
                <button
                  type="button"
                  onClick={() => setSlots((s) => s.filter((_, k) => k !== i))}
                  className="rounded-md p-1 text-muted-foreground hover:bg-muted"
                  aria-label={t("حذفِ بازه")}
                >
                  <X className="size-4" />
                </button>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}

/**
 * در دسترس بودنِ هفتگی — پورتِ `availability_section()` و
 * `availability_matrix_html()`.
 */
export function AvailabilityView({ data }: { data: AvailabilityData }) {
  const tr = useT();
  const t = useT();
  // ⚠️ ۲۵ ردیف در هر صفحه — ماتریس ستون‌های زیادی دارد و اسکرولِ بلند
  // خواندنش را سخت می‌کند.
  const matrixView = useTableView(data.matrix, (m) => m.name, 25);
  const [state, save] = useActionState(saveAvailabilityAction, {} as AvailabilityState);

  return (
    <div className="grid gap-5">
      <section className="grid gap-2">
        <h3 className="text-sm font-semibold">{t("برنامهٔ هفتگیِ من")}</h3>
        <p className="text-xs text-muted-foreground">
          {tr("روزهایی که معمولاً کار می‌کنید را تیک بزنید. بازهٔ ساعتی اختیاری است — بدونِ آن یعنی تمامِ روز.")}
        </p>

        <form action={save} className="grid gap-2">
          <div className="grid gap-2 @2xl/main:grid-cols-2">
            {data.order.map((weekday) => (
              <DayEditor key={weekday} weekday={weekday} initial={data.mine[weekday]} />
            ))}
          </div>

          <div className="flex items-center gap-3">
            <Submit />
            {(state.error || state.message) && (
              <p className={`text-xs ${state.error ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-500'}`}>
                {tr(state.error ?? state.message ?? '')}
              </p>
            )}
          </div>
        </form>
      </section>

      {data.canSeeTeam && (
        <section className="grid gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">{t("ماتریسِ تیم")}</h3>
            {/* — ماتریس با تیمِ بزرگ طولانی می‌شود. */}
            {data.matrix.length > 0 && (
              <TableSearch view={matrixView} placeholder={tr('جستجوی نام عضو…')} />
            )}
          </div>
          {data.matrix.length === 0 ? (
            <EmptyState title={t("عضوی نیست")} />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("عضو")}</TableHead>
                    {data.order.map((d) => <TableHead key={d}>{tr(WEEKDAYS[d] ?? '')}</TableHead>)}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {matrixView.rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5">
                          {/* ⚠️ حضورِ خاموش ← بی‌نقطه، نه نقطهٔ خاکستریِ گمراه‌کننده. */}
                          {row.presence && <PresenceDot state={row.presence} />}
                          <Thumb
                            id={row.id}
                            title={row.name}
                            fileId={row.avatarFileId}
                            size={22}
                            className="rounded-full"
                          />
                          {row.name}
                        </span>
                        {/* ⚠️ «برنامه نداده» با «هیچ روزی آزاد نیست» فرق دارد. */}
                        {!row.hasSchedule && (
                          <span className="ms-2 text-xs text-muted-foreground">{t("برنامه نداده")}</span>
                        )}
                      </TableCell>
                      {data.order.map((d) => {
                        const slots = row.days[d];
                        return (
                          <TableCell key={d} className="whitespace-nowrap text-xs">
                            {slots === undefined ? (
                              <span className="text-muted-foreground">—</span>
                            ) : (
                              <span title={formatSlots(slots)}>{slotsSpan(slots)}</span>
                            )}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <TablePager view={matrixView} />
        </section>
      )}
    </div>
  );
}
