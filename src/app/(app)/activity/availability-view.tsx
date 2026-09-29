'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Plus, X } from 'lucide-react';
import { saveAvailabilityAction, type AvailabilityState } from './_form/availability-actions';
import { WEEKDAYS, type Slot } from '@/domain/availability/weekly';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useActionToast } from '@/components/ui/toast';
import { useT } from '@/i18n/client';
import { Checkbox } from '@/components/ui/checkbox';
import { Section } from '@/components/page-shell';

export interface AvailabilityData {
  /** برنامهٔ خودِ کاربر. */
  mine: Record<number, Slot[]>;
  order: number[];
  /** ایندکسِ امروز (۰ = شنبه) — نشانِ «امروز» مثلِ ماتریسِ تیم (dash-1 #86). */
  today?: number;
}

function Submit() {
  const { pending } = useFormStatus();
  const tr = useT();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? <><Spinner />{tr('در حالِ ذخیره…')}</> : tr('ذخیرهٔ برنامه')}
    </Button>
  );
}

/** ویرایشگرِ یک روز — تیکِ روز و بازه‌های ساعتی‌اش. */
function DayEditor({ weekday, initial, isToday = false }: { weekday: number; initial: Slot[] | undefined; isToday?: boolean }) {
  const tr = useT();
  const t = useT();
  const enabled = initial !== undefined;
  const [on, setOn] = useState(enabled);
  const [slots, setSlots] = useState<Slot[]>(initial ?? []);

  return (
    <div className={`grid gap-2 rounded-xl border bg-card p-3${isToday ? ' border-primary/40' : ''}`}>
      <div className="flex items-center gap-2">
        <Checkbox
          id={`day-${weekday}`}
          name="onDays"
          value={String(weekday)}
          checked={on}
          onCheckedChange={(c) => setOn(c === true)}
        />
        <Label htmlFor={`day-${weekday}`} className="font-medium">{tr(WEEKDAYS[weekday] ?? '')}</Label>
        {isToday && <span className="text-xs font-medium text-primary">{tr('امروز')}</span>}

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
                <Button
                  type="button"
                  onClick={() => setSlots((s) => s.filter((_, k) => k !== i))} variant="ghost" size="icon-xs" className="text-muted-foreground"
                  aria-label={t("حذفِ بازه")}
                >
                  <X className="size-4" />
                </Button>
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
  const [state, save] = useActionState(saveAvailabilityAction, {} as AvailabilityState);
  useActionToast(state);

  return (
    <div className="grid gap-4">
      <Section title={t("برنامهٔ هفتگیِ من")}>
        <p className="text-xs text-muted-foreground">
          {tr("روزهایی که معمولاً کار می‌کنید را تیک بزنید. بازهٔ ساعتی اختیاری است — بدونِ آن یعنی تمامِ روز.")}
        </p>

        <form action={save} className="grid gap-2">
          <div className="grid gap-2 @2xl/main:grid-cols-2">
            {data.order.map((weekday) => (
              <DayEditor key={weekday} weekday={weekday} initial={data.mine[weekday]} isToday={weekday === data.today} />
            ))}
          </div>

          <div className="flex items-center gap-3">
            <Submit />
          </div>
        </form>
      </Section>

      {/*
        ⚠️ ماتریسِ تیم از اینجا به صفحهٔ مستقلِ /availability رفت.
        این تب دادهٔ **خودِ کاربر** است — همان تقسیمی که نسخهٔ قبلی دارد:
        عضو در داشبوردِ خودش ثبت می‌کند، مدیر صفحهٔ جدا دارد. یک ماتریس در
        دو جا یعنی دو رفتار که با هم از هم دور می‌شوند.
      */}
    </div>
  );
}
