'use client';

import { useActionState, useState, useTransition } from 'react';
import { useFormStatus } from 'react-dom';
import { Archive, ArchiveRestore, ImageIcon, Trash2 } from 'lucide-react';
import {
  deleteProjectAction, lightenAction, setArchivedAction, type DeleteActionState,
} from '../_form/tab-actions';
import { setThumbnailAction } from './_form/file-actions';
import { format } from '@/domain/money/money';
import { humanSize, MAX_SIZE } from '@/domain/files/upload';
import { Thumb } from '@/components/thumb';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableNumericCell, TableRow,
} from '@/components/ui/table';
import { useActionToast } from '@/components/ui/toast';
import { useT } from '@/i18n/client';
import { useConfirm } from '@/components/ui/confirm';

/**
 * تبِ مدیریت — بازسازیِ `manage_tab_html()`:
 * ساعتِ کاریِ اعضا ← بایگانی ← سبک‌سازی ← حذفِ سه‌حالته.
 */

export interface HourRow {
  userId: number;
  userName: string | null;
  minutes: number;
}

export interface LightenSummaryView {
  minutes: number;
  price: string;
  clientPaidEur: string;
  memberPaidEur: string;
  wasTender: boolean;
}

/** دقیقه → «۱۲:۳۰» — همان شکلی که نسخهٔ قبلی ساعتِ کاری را نشان می‌دهد. */
function hhmm(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

function DeleteSubmit({ label, variant, onPick }: {
  label: string;
  variant: 'default' | 'destructive';
  onPick: () => void;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant={variant} disabled={pending} onClick={onPick}>
      {label}
    </Button>
  );
}

/**
 * جعبهٔ حذف — سه حالتِ R-PROJ-01:
 * clean — بدونِ دادهٔ مالی/کاری: یک دکمه
 * confirm — تایپِ عینِ نامِ پروژه + انتخابِ «جداسازی» یا «حذف کامل»
 * locked — ماندهٔ باز دارد: هیچ دکمه‌ای نیست
 */
function DeleteBox({
  projectId,
  title,
  state,
}: {
  projectId: number;
  title: string;
  state: 'clean' | 'confirm' | 'locked';
}) {
  const tr = useT();
  const t = useT();
  const [result, formAction] = useActionState<DeleteActionState, FormData>(deleteProjectAction, {});
  const [mode, setMode] = useState<'detach' | 'full'>('detach');

  if (state === 'locked') {
    return (
      <section className="grid gap-2 rounded-md border border-destructive/40 p-3">
        <h3 className="text-sm font-semibold text-destructive">{t("حذف پروژه")}</h3>
        <p className="text-xs text-muted-foreground">
          {tr("این پروژه پرداختِ ناقص (ماندهٔ باز) دارد. تا وقتی ماندهٔ کارفرما/عضو تسویه نشود، حذف تحت هیچ شرایطی ممکن نیست.")}
        </p>
      </section>
    );
  }

  return (
    <section className="grid gap-2 rounded-md border border-destructive/40 p-3">
      <h3 className="text-sm font-semibold text-destructive">{t("حذف پروژه")}</h3>

      {state === 'clean' ? (
        <form action={formAction} className="grid gap-2">
          <input type="hidden" name="projectId" value={projectId} />
          <p className="text-xs text-muted-foreground">
            {tr("این پروژه داده‌ی مالی یا ساعت کاری ندارد و آزادانه حذف می‌شود.")}
          </p>
          <div>
            <DeleteSubmit label={t("حذف پروژه")} variant="destructive" onPick={() => {}} />
          </div>
          {result.error && <p className="text-xs text-destructive">{tr(result.error)}</p>}
        </form>
      ) : (
        <form action={formAction} className="grid gap-2">
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="mode" value={mode} />

          <p className="text-xs text-muted-foreground">
            {tr("این پروژه داده‌ی مالی/کاری دارد. برای حذف، نامِ پروژه را عیناً تایپ کنید و روش را انتخاب کنید:")}
          </p>

          <div className="grid gap-1.5">
            <Label htmlFor="del-title">{t("نام پروژه:")}</Label>
            <Input
              id="del-title"
              name="confirmTitle"
              placeholder={title}
              autoComplete="off"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <DeleteSubmit
              label={t("حذف + نگه‌داشتن تراکنش‌ها (جداسازی)")}
              variant="default"
              onPick={() => setMode('detach')}
            />
            <DeleteSubmit
              label={t("حذف کامل (با تراکنش‌ها)")}
              variant="destructive"
              onPick={() => setMode('full')}
            />
          </div>

          <p className="text-[11px] text-muted-foreground">
            {tr("«جداسازی»: پروژه می‌رود ولی تراکنش‌ها حذف نمی‌شوند و با ذکرِ نامِ پروژه در شرحشان در «پرداخت‌های بی‌پروژه» می‌مانند (مانده حساب دست‌نخورده). «حذف کامل»: تراکنش‌ها هم پاک و مانده حساب بازمحاسبه می‌شود.")}
          </p>

          {result.error && <p className="text-xs text-destructive">{tr(result.error)}</p>}
        </form>
      )}
    </section>
  );
}

function LightenBox({
  projectId,
  isArchived,
  summary,
}: {
  projectId: number;
  isArchived: boolean;
  summary: LightenSummaryView | null;
}) {
  const tr = useT();
  const confirm = useConfirm();
  const t = useT();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (summary) {
    return (
      <section className="grid gap-2 rounded-md border p-3">
        <h3 className="text-sm font-semibold">{t("سبک‌سازی دیتابیس")}</h3>
        <p className="text-xs text-muted-foreground">{t("این پروژه سبک شده است. خلاصهٔ ثابت‌شده:")}</p>
        <dl className="grid gap-1 text-xs sm:grid-cols-2">
          <div className="flex gap-1">
            <dt className="text-muted-foreground">{t("مجموع ساعت کاری:")}</dt>
            <dd className="num">{hhmm(summary.minutes)}</dd>
          </div>
          <div className="flex gap-1">
            <dt className="text-muted-foreground">{t("قیمت:")}</dt>
            <dd className="num">{format(summary.price)}</dd>
          </div>
          <div className="flex gap-1">
            <dt className="text-muted-foreground">{t("دریافتی کارفرما:")}</dt>
            <dd className="num">{format(summary.clientPaidEur)}</dd>
          </div>
          <div className="flex gap-1">
            <dt className="text-muted-foreground">{t("پرداختی به اعضا:")}</dt>
            <dd className="num">{format(summary.memberPaidEur)}</dd>
          </div>
        </dl>
        {summary.wasTender && <Badge variant="outline">{t("پیش‌تر مناقصه بوده")}</Badge>}
      </section>
    );
  }

  return (
    <section className="grid gap-2 rounded-md border p-3">
      <h3 className="text-sm font-semibold">{t("سبک‌سازی دیتابیس")}</h3>
      <p className="text-xs text-muted-foreground">
        {tr("فایل‌ها، تسک‌ها، کامنت‌ها، چک‌لیست QA و جزئیات ساعت کاری پاک می‌شوند تا دیتابیس سبک شود. سوابق مالی، اعضا، کارفرمایان و یک خلاصه می‌مانند. این کار برگشت‌ناپذیر است.")}
      </p>
      {isArchived ? (
        <div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={async () => {
              if (!(await confirm({
                title: tr('پروژه سبک شود؟'),
                description: tr('فایل‌ها، تسک‌ها، کامنت‌ها و جزئیاتِ ساعت پاک می‌شوند. این کار برگشت‌ناپذیر است.'),
              }))) return;
              startTransition(async () => {
                const result = await lightenAction(projectId);
                if (result.error) setError(result.error);
              });
            }}
          >
            {tr("سبک‌سازی پروژه")}
          </Button>
        </div>
      ) : (
        /* R-PROJ-06 — قدمِ برگشت‌پذیر (بایگانی) پیش از قدمِ برگشت‌ناپذیر. */
        <p className="text-xs text-amber-600 dark:text-amber-500">
          {tr("برای سبک‌سازی، ابتدا پروژه را از همین صفحه بایگانی کنید.")}
        </p>
      )}
      {error && <p className="text-xs text-destructive">{t(error)}</p>}
    </section>
  );
}

/**
 * تصویرِ شاخصِ پروژه.
 * ⚠️ پیش‌نمایش همان کامپوننتِ کارت است تا آنچه اینجا دیده می‌شود دقیقاً همان
 * چیزی باشد که در فهرست ظاهر می‌شود.
 */
function ThumbnailForm({
  projectId,
  title,
  fileId,
}: {
  projectId: number;
  title: string;
  fileId: number | null;
}) {
  const t = useT();
  const [state, action] = useActionState(setThumbnailAction, {});
  useActionToast(state);

  return (
    <form action={action} className="flex flex-wrap items-end gap-3 rounded-md border p-3">
      <input type="hidden" name="projectId" value={projectId} />
      <Thumb id={projectId} title={title} fileId={fileId} size={56} />

      <div className="grid flex-1 gap-1.5">
        <Label htmlFor="thumb-file">{t("تصویر تازه")}</Label>
        <Input id="thumb-file" name="file" type="file" accept="image/*" required />
        <p className="text-xs text-muted-foreground">
          {t('JPEG، PNG، GIF یا WebP — تا {size}.', { size: humanSize(MAX_SIZE.avatar, t) })}
          {' '}
          {fileId
            ? t('تصویرِ قبلی پس از ذخیره حذف می‌شود.')
            : t('بدونِ تصویر، تک‌نگارِ رنگی نشان داده می‌شود.')}
        </p>
      </div>

      <ThumbnailSubmit />
    </form>
  );
}

function ThumbnailSubmit() {
  const { pending } = useFormStatus();
  const tr = useT();
  return (
    <Button type="submit" size="sm" variant="outline" disabled={pending}>
      <ImageIcon className="size-3.5" />
      {pending ? tr('در حالِ ارسال…') : tr('ذخیره تصویر')}
    </Button>
  );
}

export function ManageTab({
  projectId,
  title,
  isArchived,
  hours,
  canManage,
  deleteState,
  lightenSummary,
  thumbnailFileId,
}: {
  projectId: number;
  title: string;
  isArchived: boolean;
  hours: HourRow[];
  canManage: boolean;
  thumbnailFileId: number | null;
  deleteState: 'clean' | 'confirm' | 'locked';
  lightenSummary: LightenSummaryView | null;
}) {
  const tr = useT();
  const t = useT();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const totalMinutes = hours.reduce((sum, h) => sum + h.minutes, 0);

  return (
    <div className="grid gap-4">
      {canManage && (
        <section className="grid gap-2">
          <h3 className="text-sm font-semibold">{t("تصویر شاخص")}</h3>
          <ThumbnailForm projectId={projectId} title={title} fileId={thumbnailFileId} />
        </section>
      )}

      <section className="grid gap-2">
        <h3 className="text-sm font-semibold">{t("ساعت کاری اعضا")}</h3>
        {hours.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("ساعتِ کاری‌ای ثبت نشده.")}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("عضو")}</TableHead>
                <TableHead>{t("ساعت کاری")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {hours.map((h) => (
                <TableRow key={h.userId}>
                  <TableCell>{h.userName ?? String(h.userId)}</TableCell>
                  <TableNumericCell>{hhmm(h.minutes)}</TableNumericCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell className="font-semibold">{t("مجموع ساعت کاری")}</TableCell>
                <TableNumericCell className="font-semibold">{hhmm(totalMinutes)}</TableNumericCell>
              </TableRow>
            </TableBody>
          </Table>
        )}
      </section>

      {canManage && (
        <>
          <section className="grid gap-2 rounded-md border p-3">
            <h3 className="text-sm font-semibold">{t("بایگانی")}</h3>
            <p className="text-xs text-muted-foreground">
              {tr("بایگانی برگشت‌پذیر است؛ پروژهٔ بایگانی‌شده فقط در تبِ بایگانی دیده می‌شود.")}
            </p>
            <div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const result = await setArchivedAction(projectId, !isArchived);
                    if (result.error) setError(result.error);
                  })
                }
              >
                {isArchived ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}
                {isArchived ? t('خارج کردن از بایگانی') : t('بایگانی کردن پروژه')}
              </Button>
            </div>
            {error && <p className="text-xs text-destructive">{t(error)}</p>}
          </section>

          <LightenBox projectId={projectId} isArchived={isArchived} summary={lightenSummary} />
          <DeleteBox projectId={projectId} title={title} state={deleteState} />
        </>
      )}
    </div>
  );
}
