'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Plus, X } from 'lucide-react';
import { saveAvailabilityAction, type AvailabilityState } from './_form/availability-actions';
import { WEEKDAYS, type Slot } from '@/domain/availability/weekly';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useActionToast } from '@/components/ui/toast';
import { useT } from '@/i18n/client';

export interface AvailabilityData {
  /** برنامهٔ خودِ کاربر. */
  mine: Record<number, Slot[]>;
  order: number[];
}

function Submit() {
  const { pending } = useFormStatus();
  const tr = useT();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? tr('در حالِ ذخیره…') : tr('ذخیرهٔ برنامه')}
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
  const [state, save] = useActionState(saveAvailabilityAction, {} as AvailabilityState);
  useActionToast(state);

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
          </div>
        </form>
      </section>

      {/*
        ⚠️ ماتریسِ تیم از اینجا به صفحهٔ مستقلِ /availability رفت.
        این تب دادهٔ **خودِ کاربر** است — همان تقسیمی که نسخهٔ قبلی دارد:
        عضو در داشبوردِ خودش ثبت می‌کند، مدیر صفحهٔ جدا دارد. یک ماتریس در
        دو جا یعنی دو رفتار که با هم از هم دور می‌شوند.
      */}
    </div>
  );
}
