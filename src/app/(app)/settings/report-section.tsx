'use client';

import { useActionState, useState, useTransition } from 'react';
import { useFormStatus } from 'react-dom';
import { Send } from 'lucide-react';
import {
  previewReportAction, saveReportAction, sendReportNowAction, type ReportState,
} from './_form/actions';
import { REPORT_SECTIONS, type ReportConfig } from '@/domain/scheduler/daily-report';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useT } from '@/i18n/client';

function Notice({ state }: { state: ReportState }) {
  if (!state.error && !state.message) return null;
  return (
    <p className={`text-xs ${state.error ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-500'}`}>
      {state.error ?? state.message}
    </p>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return <Button type="submit" size="sm" disabled={pending}>{pending ? 'در حالِ ذخیره…' : 'ذخیره'}</Button>;
}

/**
 * گزارشِ روزانه.
 * ⚠️ بخشِ **فعالِ خالی** هم در گزارش می‌آید («موردی ثبت نشده») — سکوت دو
 * معنا دارد و خواننده باید بداند کدام است.
 */
export function ReportSection({ config }: { config: ReportConfig }) {
  const tr = useT();
  const t = useT();
  const [state, save] = useActionState(saveReportAction, {} as ReportState);
  const [aux, setAux] = useState<ReportState>({});
  const [pending, startTransition] = useTransition();

  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">
        {tr("خلاصهٔ یک‌روزهٔ فعالیت که به کانالِ تیم فرستاده می‌شود. این گزارشِ گروهی است، نه اعلانِ شخصی.")}
      </p>

      <form action={save} className="grid max-w-2xl gap-4">
        <fieldset className="grid gap-2">
          <legend className="text-sm font-medium">{t("بخش‌ها")}</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {REPORT_SECTIONS.map((s) => (
              <label key={s.key} className="flex items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  name="sections"
                  value={s.key}
                  defaultChecked={config.sections.includes(s.key)}
                  className="size-3.5 accent-primary"
                />
                {s.icon} {t(s.label)}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="r-time">{t("ساعتِ ارسال")}</Label>
            <Input id="r-time" name="time" type="time" className="num" defaultValue={config.time} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="r-offset">{t("گزارشِ چند روزِ قبل")}</Label>
            <Input
              id="r-offset" name="offset" type="number" min={0} max={7}
              className="num" defaultValue={config.offset}
            />
            <p className="text-xs text-muted-foreground">{t("۱ یعنی دیروز.")}</p>
          </div>
        </div>

        <fieldset className="grid gap-2 rounded-md border p-3">
          <legend className="px-1 text-sm font-medium">{t("مقصدها")}</legend>

          <label className="flex items-center gap-1.5 text-sm">
            <input
              type="checkbox" name="discord" defaultChecked={config.discord}
              className="size-3.5 accent-primary"
            />
            {tr("دیسکورد")}
          </label>
          <Input
            name="webhook" type="url" placeholder="https://discord.com/api/webhooks/…"
            defaultValue={config.webhook}
          />

          <label className="flex items-center gap-1.5 text-sm">
            <input
              type="checkbox" name="telegram" defaultChecked={config.telegram}
              className="size-3.5 accent-primary"
            />
            {tr("تلگرامِ مدیرِ کل")}
          </label>
          {/* ⚠️ بدونِ توکنِ بات این گزینه بی‌اثر است. */}
          <p className="text-xs text-muted-foreground">
            {tr("تلگرام فقط وقتی کار می‌کند که باتِ سامانه پیکربندی شده باشد.")}
          </p>
        </fieldset>

        <div className="flex flex-wrap items-center gap-3">
          <Submit />
          <Button
            type="button" size="sm" variant="outline" disabled={pending}
            onClick={() => startTransition(async () => setAux(await previewReportAction()))}
          >
            {tr("پیش‌نمایش")}
          </Button>
          <Button
            type="button" size="sm" variant="outline" disabled={pending}
            onClick={() => startTransition(async () => setAux(await sendReportNowAction()))}
          >
            <Send className="size-3.5" />
            {tr("ارسالِ فوری")}
          </Button>
          <Notice state={state} />
          <Notice state={aux} />
        </div>
      </form>

      {aux.preview && (
        <pre className="max-h-96 overflow-auto rounded-md border bg-muted/40 p-3 text-xs whitespace-pre-wrap">
          {aux.preview}
        </pre>
      )}
    </div>
  );
}
