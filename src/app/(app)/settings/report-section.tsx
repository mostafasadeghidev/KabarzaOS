'use client';

import { useActionState, useState, useTransition } from 'react';
import { useFormStatus } from 'react-dom';
import { Send } from 'lucide-react';
import {
  previewReportAction, saveReportAction, sendReportNowAction, testDiscordAction, type ReportState,
} from './_form/actions';
import { REPORT_SECTIONS, type ReportConfig } from '@/domain/scheduler/daily-report';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Input } from '@/components/ui/input';
import { Field, FieldLabel, FieldDescription } from '@/components/ui/field';
import { useActionToast } from '@/components/ui/toast';
import { useT } from '@/i18n/client';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Panel, SectionHeader } from '@/components/page-shell';

function Submit() {
  const { pending } = useFormStatus();
  const tr = useT();
  return <Button type="submit" size="sm" disabled={pending}>{pending ? <><Spinner />{tr('در حالِ ذخیره…')}</> : tr('ذخیره')}</Button>;
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
  useActionToast(state);
  const [aux, setAux] = useState<ReportState>({});
  useActionToast(aux);
  const [pending, startTransition] = useTransition();

  return (
    <div className="grid grid-cols-1 gap-4">
      <SectionHeader
        title={t("گزارش روزانه")}
        description={tr("خلاصهٔ یک‌روزهٔ فعالیت که به کانالِ تیم فرستاده می‌شود. این گزارشِ گروهی است، نه اعلانِ شخصی.")}
      />

      <form action={save} className="grid max-w-4xl gap-4">
        <Panel title={t("محتوا و زمان‌بندی")}>
          <fieldset className="grid gap-2">
            <legend className="text-sm font-medium">{t("بخش‌ها")}</legend>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {REPORT_SECTIONS.map((s) => (
                <label key={s.key} className="flex items-center gap-1.5 text-sm">
                  <Checkbox
                    name="sections"
                    value={String(s.key)}
                    defaultChecked={config.sections.includes(s.key)}
                  />
                  {s.icon} {t(s.label)}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="r-time">{t("ساعتِ ارسال")}</FieldLabel>
              <Input id="r-time" name="time" type="time" className="num" defaultValue={config.time} />
            </Field>
            <Field>
              <FieldLabel htmlFor="r-offset">{t("گزارشِ چند روزِ قبل")}</FieldLabel>
              <Input
                id="r-offset" name="offset" type="number" min={0} max={7}
                className="num" defaultValue={config.offset}
              />
              <FieldDescription>{t("۱ یعنی دیروز.")}</FieldDescription>
            </Field>
          </div>
        </Panel>

        <Panel title={t("مقصدها")}>

          <label className="flex items-center gap-1.5 text-sm">
            <Switch name="discord" defaultChecked={config.discord}
            />
            {tr("دیسکورد")}
          </label>
          <Input
            name="webhook" type="url" placeholder="https://discord.com/api/webhooks/…"
            defaultValue={config.webhook}
          />

          <label className="flex items-center gap-1.5 text-sm">
            <Switch name="telegram" defaultChecked={config.telegram}
            />
            {tr("تلگرامِ مدیرِ کل")}
          </label>
          {/* ⚠️ بدونِ توکنِ بات این گزینه بی‌اثر است. */}
          <p className="text-xs text-muted-foreground">
            {tr("تلگرام فقط وقتی کار می‌کند که باتِ سامانه پیکربندی شده باشد.")}
          </p>
        </Panel>

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
          <Button
            type="button" size="sm" variant="outline" disabled={pending}
            onClick={() => startTransition(async () => setAux(await testDiscordAction()))}
          >
            {tr("تستِ اتصالِ دیسکورد")}
          </Button>
        </div>
      </form>

      {aux.preview && (
        <pre className="max-h-96 overflow-auto rounded-lg border bg-muted/40 p-3 text-xs whitespace-pre-wrap">
          {aux.preview}
        </pre>
      )}
    </div>
  );
}
