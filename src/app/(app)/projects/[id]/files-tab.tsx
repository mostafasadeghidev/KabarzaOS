'use client';

import { UserName } from '@/components/user-avatar';
import { useActionState, useRef, useState, useTransition } from 'react';
import { useFormStatus } from 'react-dom';
import {
  Download, FileText, Film, ImageIcon, Link2, Paperclip, Pin, PinOff, Play, Square, Trash2, Upload,
} from 'lucide-react';
import { LinkIcon } from '@/components/media/link-card';
import { linkTitle, providerName } from '@/domain/files/link-preview';
import { Badge } from '@/components/ui/badge';
import {
  Attachment, AttachmentAction, AttachmentActions, AttachmentContent, AttachmentDescription,
  AttachmentMedia, AttachmentTitle, AttachmentTrigger,
} from '@/components/ui/attachment';
import {
  addLinkAction, deleteAttachmentAction, pinAttachmentAction, uploadAttachmentAction, type FileFormState,
} from './_form/file-actions';
import { humanSize, MAX_SIZE } from '@/domain/files/upload';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Input } from '@/components/ui/input';
import { Field, FieldLabel } from '@/components/ui/field';
import { useActionToast } from '@/components/ui/toast';
import { useT } from '@/i18n/client';
import { useConfirm } from '@/components/ui/confirm';
import { Section } from '@/components/page-shell';
import { FormFileDrop } from '@/components/media/form-file-drop';
import { Hint } from '@/components/ui/tooltip';

export interface FileRow {
  id: number;
  label: string;
  title: string;
  href: string;
  isLink: boolean;
  kind: string;
  mime: string | null;
  size: number | null;
  uploaderName: string | null;
  uploaderId?: number | null;
  /** سنجاق‌شده — بالای فهرست (۲.۳.۰). */
  pinned?: boolean;
}

const KIND_ICON = {
  image: ImageIcon,
  video: Film,
  file: FileText,
} as const;

function SubmitButton({ children, disabled = false }: { children: React.ReactNode; disabled?: boolean }) {
  const { pending } = useFormStatus();
  const tr = useT();
  return (
    <Button type="submit" size="sm" disabled={pending || disabled}>
      {pending ? <><Spinner />{tr('در حال ارسال…')}</> : children}
    </Button>
  );
}

/**
 * تبِ فایل‌ها — پیوست، لینکِ بیرونی، پیش‌نمایش و حذف.
 *
 * ⚠️ هر پیوند به `/api/files/<id>` می‌رود، نه به S3. آدرسِ مستقیمِ شیء هرگز
 * به مرورگر نمی‌رسد (R-FILE-01).
 */
export function FilesTab({
  files,
  projectId,
  canUpload,
  canManage = false,
  currentUserId = null,
}: {
  files: FileRow[];
  projectId: number;
  canUpload: boolean;
  canManage?: boolean;
  currentUserId?: number | null;
}) {
  const tr = useT();
  const t = useT();
  const attachments = files.filter((f) => !f.isLink);
  const links = files.filter((f) => f.isLink);
  // R-FILE-09: دکمهٔ حذف فقط برای بارگذارنده یا مدیر — قبلاً به همه نشان داده می‌شد و بعد خطا می‌گرفتند.
  const canDelete = (f: FileRow) => canUpload && (canManage || (currentUserId !== null && f.uploaderId === currentUserId));

  const [uploadState, upload] = useActionState(uploadAttachmentAction, {});
  useActionToast(uploadState);
  const [linkState, addLink] = useActionState(addLinkAction, {});
  useActionToast(linkState);
  const [removing, startRemove] = useTransition();
  const confirm = useConfirm();
  const [removeError, setRemoveError] = useState<string | null>(null);
  /** ویدئویی که همین‌جا پخش می‌شود — یکی در هر لحظه، تا چند پخش‌کننده هم‌زمان بار نشوند. */
  const [playing, setPlaying] = useState<number | null>(null);
  const uploadForm = useRef<HTMLFormElement>(null);
  /** شمارِ فایل‌های انتخاب‌شده — بی‌فایل، دکمهٔ بارگذاری غیرفعال است. */
  const [pickedCount, setPickedCount] = useState(0);

  /** سنجاق — همان قاعدهٔ حذف (بارگذارنده یا مدیر). */
  const togglePin = (f: FileRow) => {
    setRemoveError(null);
    startRemove(async () => {
      const result = await pinAttachmentAction(f.id, projectId, !f.pinned);
      if (result?.error) setRemoveError(result.error);
    });
  };
  const PinAction = ({ f, title }: { f: FileRow; title: string }) => (
    <AttachmentAction
      onClick={() => togglePin(f)}
      disabled={removing}
      aria-pressed={Boolean(f.pinned)}
      aria-label={`${f.pinned ? t('برداشتنِ سنجاق') : t('سنجاق')} — ${title}`}
    >
      {f.pinned ? <PinOff /> : <Pin />}
    </AttachmentAction>
  );

  const remove = async (id: number) => {
    if (!(await confirm({ title: tr('این پیوست حذف شود؟') }))) return;
    setRemoveError(null);
    startRemove(async () => {
      const result = await deleteAttachmentAction(id, projectId);
      if (result?.error) setRemoveError(result.error);
    });
  };

  return (
    <div className="grid gap-4">
      {/*
        ⚠️ منابع بالای پیوست‌ها (۲.۳.۰): فیگما و سندهای مرجع را تیم مدام باز
        می‌کند؛ نباید زیرِ فهرستِ بلندِ فایل‌ها پنهان بمانند.
      */}
      <Section icon={<Link2 />} title={tr("منابع و لینک‌ها")}>

        {canUpload && (
          <form action={addLink} className="grid gap-2 rounded-xl border bg-card p-3">
            <input type="hidden" name="projectId" value={projectId} />
            <div className="grid gap-2 sm:grid-cols-[2fr_1fr_auto] sm:items-end">
              <Field>
                <FieldLabel htmlFor="link-url">{t("نشانی")}</FieldLabel>
                <Input id="link-url" name="url" type="url" placeholder="https://…" required />
              </Field>
              <Field>
                <FieldLabel htmlFor="link-label">{t("برچسب")}</FieldLabel>
                <Input id="link-label" name="label" placeholder={t("مثلاً: طراحیِ نهایی")} />
              </Field>
              <SubmitButton>{t("افزودن")}</SubmitButton>
            </div>
            {/* ⚠️ هیچ فایلی از این نشانی گرفته نمی‌شود — فقط ذخیره می‌شود. */}
            <p className="text-xs text-muted-foreground">
              {tr("فایل دانلود نمی‌شود؛ فقط نشانی نگه داشته می‌شود.")}
            </p>
          </form>
        )}

        {links.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {tr("لینکِ فیگما، گوگل‌درایو، سایتِ آزمایشی و … اینجا دیده می‌شوند.")}
          </p>
        ) : (
          <ul className="grid gap-2 @xl/main:grid-cols-2">
            {links.map((f) => {
              // برچسبِ کاربر اول؛ وگرنه عنوانِ خوانا از خودِ نشانی، نه نشانیِ خام.
              const title = f.label || linkTitle(f.href);
              return (
                <li key={f.id}>
                  <Attachment className={`w-full${f.pinned ? ' border-primary/40' : ''}`}>
                    <AttachmentMedia className="bg-transparent p-0"><LinkIcon href={f.href} /></AttachmentMedia>
                    <AttachmentContent>
                      <AttachmentTitle className="flex items-center gap-1.5">
                        <span className="truncate" dir="auto">{title}</span>
                        {f.pinned && <Badge variant="secondary" className="shrink-0">{t('سنجاق‌شده')}</Badge>}
                      </AttachmentTitle>
                      <AttachmentDescription className="flex items-center gap-1">
                        <span className="shrink-0" dir="ltr">{providerName(f.href)} ·</span>
                        <UserName userId={f.uploaderId} name={f.uploaderName ?? '—'} />
                      </AttachmentDescription>
                    </AttachmentContent>
                    {canDelete(f) && (
                      <AttachmentActions>
                        <PinAction f={f} title={title} />
                        <AttachmentAction
                          onClick={() => remove(f.id)}
                          disabled={removing}
                          aria-label={`${t("حذف")} — ${title}`}
                        >
                          <Trash2 />
                        </AttachmentAction>
                      </AttachmentActions>
                    )}
                    <Hint label={f.href}>
                      <AttachmentTrigger asChild>
                        <a href={f.href} target="_blank" rel="noopener noreferrer nofollow" aria-label={title} />
                      </AttachmentTrigger>
                    </Hint>
                  </Attachment>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section icon={<Paperclip />} title={tr("پیوست‌ها")}>

        {canUpload && (
          <form
            ref={uploadForm}
            action={(data) => { upload(data); uploadForm.current?.reset(); }}
            className="grid gap-2 rounded-xl border bg-card p-3"
          >
            <input type="hidden" name="projectId" value={projectId} />
            {/* چند فایل هم‌زمان؛ رها کردن، چسباندنِ اسکرین‌شات یا کلیک — مثلِ بازبینی. */}
            <FormFileDrop name="file" onCountChange={setPickedCount} />
            {/* برچسبِ اختیاری برای فایل‌های همین بارگذاری (با چند فایل شماره می‌گیرد). */}
            <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
              <Field>
                <FieldLabel htmlFor="att-label">{t("برچسب (اختیاری)")}</FieldLabel>
                <Input id="att-label" name="label" placeholder={t("مثلاً: قرارداد امضاشده")} />
              </Field>
              <SubmitButton disabled={pickedCount === 0}>
                <Upload className="size-3.5" />
                {tr("بارگذاری")}
              </SubmitButton>
            </div>
            <p className="text-xs text-muted-foreground">
              {tr('تصویر، ویدیو، PDF و سند — تا {size} برای هر فایل.', { size: humanSize(MAX_SIZE.attachment, tr) })}
            </p>
          </form>
        )}

        {attachments.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("پیوستی ثبت نشده.")}</p>
        ) : (
          /*
            ⚠️ کلِ کارت پیوندِ «باز کردن» است (`AttachmentTrigger`)؛ دانلود و حذف
            دکمه‌های جدای رویش‌اند و کلیکشان فایل را باز نمی‌کند.
          */
          <ul className="grid gap-2 @xl/main:grid-cols-2">
            {attachments.map((f) => {
              const Icon = KIND_ICON[f.kind as keyof typeof KIND_ICON] ?? FileText;
              const title = f.title || `#${f.id}`;
              return (
                <li key={f.id}>
                  <Attachment className={`w-full${f.pinned ? ' border-primary/40' : ''}`}>
                    <AttachmentMedia variant={f.kind === 'image' ? 'image' : 'icon'}>
                      {f.kind === 'image'
                        // نسخهٔ کوچک از همان مسیرِ گیت‌شده؛ نبودنش خطا نیست و اصل می‌آید (R-FILE-16).
                        ? <img src={`${f.href}?thumb`} alt="" loading="lazy" />
                        : <Icon />}
                    </AttachmentMedia>
                    <AttachmentContent>
                      <AttachmentTitle className="flex items-center gap-1.5">
                        <span className="truncate">{title}</span>
                        {f.pinned && <Badge variant="secondary" className="shrink-0">{t('سنجاق‌شده')}</Badge>}
                      </AttachmentTitle>
                      <AttachmentDescription className="flex items-center gap-1">
                        <UserName userId={f.uploaderId} name={f.uploaderName ?? '—'} />
                        {f.size ? <span className="shrink-0">· {humanSize(f.size, tr)}</span> : null}
                      </AttachmentDescription>
                    </AttachmentContent>
                    <AttachmentActions>
                      {f.kind === 'video' && (
                        <AttachmentAction
                          onClick={() => setPlaying(playing === f.id ? null : f.id)}
                          aria-label={`${playing === f.id ? t('بستنِ پخش') : t('پخش')} — ${title}`}
                          aria-pressed={playing === f.id}
                        >
                          {playing === f.id ? <Square /> : <Play />}
                        </AttachmentAction>
                      )}
                      <AttachmentAction asChild aria-label={`${t("دانلود")} — ${title}`}>
                        <a href={`${f.href}?dl`}><Download /></a>
                      </AttachmentAction>
                      {canDelete(f) && <PinAction f={f} title={title} />}
                      {canDelete(f) && (
                        <AttachmentAction
                          onClick={() => remove(f.id)}
                          disabled={removing}
                          aria-label={`${t("حذف")} — ${title}`}
                        >
                          <Trash2 />
                        </AttachmentAction>
                      )}
                    </AttachmentActions>
                    <AttachmentTrigger asChild>
                      <a href={f.href} target="_blank" rel="noopener noreferrer nofollow" aria-label={title} />
                    </AttachmentTrigger>
                  </Attachment>
                  {/*
                    پخشِ درون‌خطی — پورتِ `<video>` ِ نسخهٔ قبلی. از همان مسیرِ گیت‌شده
                    و با Range (۱.۹۴.۰)، پس جلو/عقب رفتن کلِ فایل را دوباره نمی‌کشد.
                    ⚠️ پخش‌کننده فقط بعد از کلیک ساخته می‌شود، پس فهرست پیش از پخش هیچ بایتی از ویدئو نمی‌کشد.
                  */}
                  {playing === f.id && (
                    <video
                      src={f.href}
                      controls
                      autoPlay
                      preload="metadata"
                      className="mt-2 max-h-80 w-full rounded-lg border bg-black"
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {removeError && <p className="text-xs text-destructive">{tr(removeError)}</p>}
      </Section>

    </div>
  );
}
