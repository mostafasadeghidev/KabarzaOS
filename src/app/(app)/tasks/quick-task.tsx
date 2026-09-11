'use client';

import { useActionState, useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useFormStatus } from 'react-dom';
import { Plus, CircleAlert } from 'lucide-react';
import { createTaskAction, type TaskFormState } from '../projects/_form/task-actions';
import { loadQuickTaskOptionsAction, type QuickTaskOptions } from './quick-actions';
import { Button } from '@/components/ui/button';
import { Combobox, MultiSelect } from '@/components/ui/combobox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { EmptyState } from '@/components/ui/empty-state';
import { useActionToast } from '@/components/ui/toast';
import { useT } from '@/i18n/client';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { DatePicker } from '@/components/ui/date-picker';


function SubmitButton() {
  const tr = useT();
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      <Plus className="size-4" />
      {pending ? tr('در حالِ ثبت…') : tr('ثبتِ تسک')}
    </Button>
  );
}

/**
 * «افزودنِ سریعِ تسک» — بدونِ بازکردنِ پروژه.
 *
 * ⚠️ همان اکشنِ صفحهٔ پروژه (`createTaskAction`) استفاده می‌شود، نه یک مسیرِ
 * موازی: گاردها، اعلان‌ها و قواعدِ نقش/انتساب یک‌جا می‌مانند. تنها تفاوت این
 * است که پروژه در خودِ فرم انتخاب می‌شود.
 *
 * ⚠️ گزینه‌های هر پروژه (وضعیت، اولویت، نقش‌ها، اشخاص) پس از انتخابِ پروژه
 * از سرور می‌آیند — چون به عضویت و نقشِ بیننده روی همان پروژه وابسته‌اند.
 */
export function QuickTaskForm({
  projects,
  today,
}: {
  projects: Array<{ id: number; title: string }>;
  today: string;
}) {
  const tr = useT();
  const t = useT();
  const [state, formAction] = useActionState<TaskFormState, FormData>(createTaskAction, {});
  useActionToast(state, { success: 'تسک ثبت شد.' });

  const [project, setProject] = useState<{ id: number | null; label: string }>({ id: null, label: '' });
  const [options, setOptions] = useState<QuickTaskOptions | null>(null);
  const [loading, startLoading] = useTransition();
  const [roleTagIds, setRoleTagIds] = useState<number[]>([]);
  const [title, setTitle] = useState('');
  /** آنچه در همین نشست ثبت شد — تأییدِ دیداری، بدونِ رفتن به صفحهٔ پروژه. */
  const [added, setAdded] = useState<Array<{ title: string; projectId: number; projectTitle: string }>>([]);
  const lastSubmit = useRef<{ title: string; projectId: number; projectTitle: string } | null>(null);

  useEffect(() => {
    if (project.id === null) { setOptions(null); return; }
    const id = project.id;
    startLoading(async () => {
      const next = await loadQuickTaskOptionsAction(id);
      setOptions(next);
      setRoleTagIds([]);
    });
  }, [project.id]);

  useEffect(() => {
    if (!state.ok) return;
    // ⚠️ پروژه عمداً انتخاب‌شده می‌ماند: افزودنِ چند تسکِ پشتِ‌هم به یک پروژه
    // کارِ متعارف است. فقط عنوان و نقش‌ها خالی می‌شوند.
    if (lastSubmit.current) setAdded((rows) => [lastSubmit.current!, ...rows].slice(0, 8));
    setTitle('');
    setRoleTagIds([]);
  }, [state]);

  if (projects.length === 0) {
    return (
      <EmptyState
        title={t("پروژهٔ بازی برای ثبتِ تسک ندارید")}
        description={t("تسک روی پروژه‌های باز ثبت می‌شود؛ پروژهٔ بایگانی یا بسته تغییر نمی‌پذیرد.")}
      />
    );
  }

  return (
    <div className="grid gap-4 @3xl/main:grid-cols-[minmax(0,32rem)_minmax(0,20rem)]">
      <form
        action={formAction}
        className="grid gap-3 rounded-lg border p-4"
        onSubmit={() => {
          lastSubmit.current = {
            title,
            projectId: project.id ?? 0,
            projectTitle: project.label,
          };
        }}
      >
        <input type="hidden" name="projectId" value={project.id ?? ''} />

        <div className="grid gap-1.5">
          <Label htmlFor="q-project">{t("پروژه")}</Label>
          <Combobox
            id="q-project"
            options={projects.map((p) => ({ value: p.id, label: p.title }))}
            value={project}
            onChange={setProject}
            placeholder={t("نامِ پروژه را تایپ کنید…")}
          />
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="q-title">{t("عنوانِ تسک")}</Label>
          <Input
            id="q-title"
            name="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("مثلاً: آمادهٔ‌سازیِ پیش‌نویسِ قرارداد")}
            required
          />
          {state.fieldErrors?.title && (
            <p className="text-xs text-destructive">{tr(state.fieldErrors.title)}</p>
          )}
        </div>

        {/* ⚠️ تا پروژه انتخاب نشده، گزینه‌ای برای نشان‌دادن نیست. */}
        {project.id !== null && (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="q-assignee">{t("مسئول")}</Label>
                <SearchableSelect id="q-assignee" name="assignedTo" containerClassName="w-full" disabled={loading}>
                  <NativeSelectOption value="">{t("— بدونِ مسئول —")}</NativeSelectOption>
                  {(options?.assignees ?? []).map((a) => (
                    <NativeSelectOption key={a.id} value={a.id}>{a.label}</NativeSelectOption>
                  ))}
                </SearchableSelect>
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="q-roles">{t("نقش‌ها")}</Label>
                <MultiSelect
                  id="q-roles"
                  name="roleTagIds"
                  options={(options?.roles ?? []).map((r) => ({ value: r.id, label: r.name }))}
                  selected={roleTagIds}
                  onChange={setRoleTagIds}
                  placeholder={t("نقش‌ها…")}
                />
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="q-priority">{t("اولویت")}</Label>
                <NativeSelect id="q-priority" name="priorityTagId" containerClassName="w-full" disabled={loading}>
                  <NativeSelectOption value="">{t("— انتخاب —")}</NativeSelectOption>
                  {(options?.priorities ?? []).map((p) => (
                    <NativeSelectOption key={p.id} value={p.id}>{p.name}</NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="q-due">{t("ددلاین")}</Label>
                <DatePicker id="q-due" name="dueDate" min={today} />
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="q-desc">{t("توضیحات")}</Label>
              <Textarea id="q-desc" name="description" rows={2} />
            </div>

            <label className="flex items-center gap-1.5 text-xs">
              <Checkbox name="isPrivate" />
              {t("خصوصی (فقط مدیران)")}
            </label>
          </>
        )}

        {state.error && (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertDescription>{tr(state.error)}</AlertDescription>
          </Alert>
        )}

        <div className="flex items-center gap-2">
          <SubmitButton />
          {loading && <span className="text-xs text-muted-foreground">{t("در حالِ خواندنِ گزینه‌ها…")}</span>}
        </div>
      </form>

      {added.length > 0 && (
        <section className="grid content-start gap-2 rounded-lg border border-dashed p-4">
          <h3 className="text-sm font-medium">{t("ثبت‌شده در این نشست")}</h3>
          <ul className="grid gap-1 text-sm">
            {added.map((row, i) => (
              <li key={i} className="flex items-center justify-between gap-2">
                <span className="min-w-0 flex-1 truncate">{row.title}</span>
                <Link
                  href={`/projects/${row.projectId}?tab=tasks`}
                  className="shrink-0 text-xs text-primary hover:underline"
                >
                  {row.projectTitle}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
