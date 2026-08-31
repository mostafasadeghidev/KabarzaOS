'use client';

import { useActionState, useEffect, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { loadCandidatesAction, saveMeetingAction, type MeetingFormState } from './_form/actions';
import type { Candidate } from '@/domain/meetings/attendees';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Combobox } from '@/components/ui/combobox';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { useT } from '@/i18n/client';

export interface MeetingFormOptions {
  projects: Array<{ id: number; title: string }>;
  offices: Array<{ id: number; name: string }>;
}

export interface MeetingView {
  id: number;
  title: string;
  description: string;
  meetAt: Date | string;
  location: string;
  projectId: number | null;
  officeId: number | null;
  attendees: Array<{ userId: number; name: string }>;
}

const cellSelect =
  'h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50';

/** `datetime-local` مقدارِ محلی می‌خواهد، نه ISO ِ UTC. */
function toLocalInput(value: Date | string | null): string {
  if (!value) return '';
  const d = typeof value === 'string' ? new Date(value) : value;
  const offset = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - offset).toISOString().slice(0, 16);
}

function SubmitButton({ isEdit }: { isEdit: boolean }) {
  const t = useT();
  const { pending } = useFormStatus();
  if (pending) return <Button type="submit" disabled>{t("در حالِ ذخیره…")}</Button>;
  return <Button type="submit">{isEdit ? 'ذخیرهٔ جلسه' : 'ایجاد جلسه'}</Button>;
}

/**
 * فرمِ جلسه — `meetings/create-form.php`:
 * نوعِ جلسه (پروژه‌ای/عمومی) ← پروژه یا دفتر ← موضوع ← تاریخ و ساعت ←
 * مکان ← توضیحات ← دعوت‌شدگان.
 *
 * ⚠️ فهرستِ دعوت‌شدگان با تغییرِ پروژه/دفتر **از سرور** تازه می‌شود — قواعدش
 * (تیکِ پیش‌فرض، حذفِ عضوِ سابق، اختیاری‌بودنِ مدیران) در دامنه است.
 */
export function MeetingForm({
  open,
  onOpenChange,
  meeting,
  options,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null یعنی جلسهٔ نو. */
  meeting: MeetingView | null;
  options: MeetingFormOptions;
}) {
  const tr = useT();
  const t = useT();
  const [state, formAction] = useActionState<MeetingFormState, FormData>(saveMeetingAction, {});
  const isEdit = meeting !== null;

  // ⚠️ جلسهٔ نو پیش‌فرض «مرتبط با پروژه» است (اولین گزینهٔ نسخهٔ قبلی)، تا کاربر
  // ناخواسته یک جلسهٔ عمومی با همهٔ اعضا نسازد.
  const [kind, setKind] = useState<'project' | 'general'>(
    meeting === null || meeting.projectId ? 'project' : 'general',
  );
  const [projectId, setProjectId] = useState<string>(meeting?.projectId ? String(meeting.projectId) : '');
  const [officeId, setOfficeId] = useState<string>(meeting?.officeId ? String(meeting.officeId) : '');
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [checked, setChecked] = useState<Set<number>>(
    new Set(meeting?.attendees.map((a) => a.userId) ?? []),
  );

  // هر بار که جلسهٔ دیگری باز می‌شود، فرم از نو مقدار می‌گیرد.
  useEffect(() => {
    setKind(meeting === null || meeting.projectId ? 'project' : 'general');
    setProjectId(meeting?.projectId ? String(meeting.projectId) : '');
    setOfficeId(meeting?.officeId ? String(meeting.officeId) : '');
    setChecked(new Set(meeting?.attendees.map((a) => a.userId) ?? []));
  }, [meeting]);

  // فهرستِ دعوت‌شدگان با نوع/پروژه/دفتر عوض می‌شود.
  useEffect(() => {
    if (!open) return;
    if (kind === 'project' && !projectId) {
      setCandidates(null);
      return;
    }
    const pid = kind === 'project' ? Number(projectId) : null;
    const offices = kind === 'general' && officeId ? [Number(officeId)] : [];
    let alive = true;
    loadCandidatesAction(pid, offices).then((list) => {
      if (!alive) return;
      setCandidates(list);
      // در حالتِ ویرایش، تیک‌های ذخیره‌شده می‌مانند؛ در حالتِ نو، پیش‌فرضِ دامنه.
      if (!isEdit) setChecked(new Set(list.filter((c) => c.checked).map((c) => c.userId)));
    });
    return () => { alive = false; };
  }, [open, kind, projectId, officeId, isEdit]);

  useEffect(() => {
    if (state.ok) onOpenChange(false);
  }, [state.ok, onOpenChange]);

  const toggle = (userId: number) =>
    setChecked((cur) => {
      const next = new Set(cur);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'ویرایشِ جلسه' : 'جلسهٔ جدید'}</DialogTitle>
          <DialogDescription>
            {tr("دعوت‌شدگان با نوعِ جلسه و پروژه/دفترِ انتخابی تعیین می‌شوند.")}
          </DialogDescription>
        </DialogHeader>

        <form key={meeting?.id ?? 'new'} action={formAction} className="grid gap-3">
          {isEdit && <input type="hidden" name="meetingId" value={meeting.id} />}

          <div className="grid gap-1.5">
            <Label htmlFor="m-kind">{t("نوع جلسه")}</Label>
            <select
              id="m-kind"
              className={cellSelect}
              value={kind}
              onChange={(e) => setKind(e.target.value as 'project' | 'general')}
            >
              <option value="project">{t("مرتبط با پروژه")}</option>
              <option value="general">{t("عمومی / تیمی (بدون پروژه)")}</option>
            </select>
          </div>

          {kind === 'project' ? (
            <div className="grid gap-1.5">
              <Label htmlFor="m-project">{t("پروژه")}</Label>
              {/*
                ⚠️ جستجوی زنده، نه فهرستِ کشویی: تیمِ واقعی ده‌ها پروژه دارد و
                پیمایشِ یک select ِ بلند عملاً غیرقابلِ استفاده است.
                فهرستِ دعوت‌شدگان هم با تغییرِ همین مقدار تازه می‌شود.
              */}
              <Combobox
                id="m-project"
                name="projectId"
                options={options.projects.map((p) => ({ value: p.id, label: p.title }))}
                value={{
                  id: projectId ? Number(projectId) : null,
                  label: options.projects.find((p) => String(p.id) === projectId)?.title ?? '',
                }}
                onChange={(next) => setProjectId(next.id ? String(next.id) : '')}
                placeholder={t("نامِ پروژه را تایپ کنید…")}
              />
            </div>
          ) : (
            <div className="grid gap-1.5">
              <Label htmlFor="m-office">{t("دفتر (برای جلسهٔ عمومی)")}</Label>
              <select
                id="m-office"
                name="officeId"
                className={cellSelect}
                value={officeId}
                onChange={(e) => setOfficeId(e.target.value)}
              >
                <option value="">{t("همهٔ دفاتر")}</option>
                {options.offices.map((o) => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="grid gap-1.5">
            <Label htmlFor="m-title">{t("موضوع جلسه")}</Label>
            <Input
              id="m-title"
              name="title"
              defaultValue={state.values?.title ?? meeting?.title ?? ''}
              placeholder={t("مثلاً: بررسی پیشرفت پروژه")}
              required
            />
            {state.fieldErrors?.title && (
              <p className="text-xs text-destructive">{state.fieldErrors.title}</p>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="m-at">{t("تاریخ و ساعت")}</Label>
              <Input
                id="m-at"
                type="datetime-local"
                name="meetAt"
                className="num"
                defaultValue={state.values?.meetAt ?? toLocalInput(meeting?.meetAt ?? null)}
                required
              />
              {state.fieldErrors?.meetAt && (
                <p className="text-xs text-destructive">{state.fieldErrors.meetAt}</p>
              )}
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="m-loc">{t("مکان")}</Label>
              <Input
                id="m-loc"
                name="location"
                defaultValue={state.values?.location ?? meeting?.location ?? ''}
                placeholder={t("مثلاً: meet.google.com/…")}
              />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="m-desc">{t("توضیحات (اختیاری)")}</Label>
            <Textarea
              id="m-desc"
              name="description"
              rows={2}
              defaultValue={state.values?.description ?? meeting?.description ?? ''}
            />
          </div>

          <fieldset className="grid gap-1.5 rounded-md border p-3">
            <legend className="px-1 text-sm font-medium">{t("دعوت‌شدگان")}</legend>
            {candidates === null ? (
              <p className="text-xs text-muted-foreground">
                {tr("برای انتخابِ دعوت‌شدگان، ابتدا پروژه (یا نوعِ جلسه) را مشخص کنید.")}
              </p>
            ) : candidates.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t("فرد قابلِ دعوتی یافت نشد.")}</p>
            ) : (
              <>
                <div className="flex gap-2 text-xs">
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() => setChecked(new Set(candidates.map((c) => c.userId)))}
                  >
                    {tr("انتخاب همه")}
                  </button>
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() => setChecked(new Set())}
                  >
                    {tr("هیچ‌کدام")}
                  </button>
                </div>
                <div className="grid gap-1">
                  {candidates.map((c) => (
                    <label key={c.userId} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        name="attendees"
                        value={c.userId}
                        checked={checked.has(c.userId)}
                        onChange={() => toggle(c.userId)}
                        className="size-4 accent-primary"
                      />
                      {c.name}
                      <span className="text-xs text-muted-foreground">({c.sub})</span>
                    </label>
                  ))}
                </div>
              </>
            )}
          </fieldset>

          {state.error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {state.error}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {tr("انصراف")}
            </Button>
            <SubmitButton isEdit={isEdit} />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
