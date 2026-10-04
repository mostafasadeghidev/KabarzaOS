'use client';

import { UserName } from '@/components/user-avatar';
import { useActionState, useRef, useState, useTransition } from 'react';
import { useFormStatus } from 'react-dom';
import {
  Download, FileText, Film, ImageIcon, Link2, Paperclip, Play, Square, Trash2, Upload,
} from 'lucide-react';
import {
  Attachment, AttachmentAction, AttachmentActions, AttachmentContent, AttachmentDescription,
  AttachmentMedia, AttachmentTitle, AttachmentTrigger,
} from '@/components/ui/attachment';
import {
  addLinkAction, deleteAttachmentAction, uploadAttachmentAction, type FileFormState,
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
import { FileInput } from '@/components/ui/file-input';

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
}

const KIND_ICON = {
  image: ImageIcon,
  video: Film,
  file: FileText,
} as const;

/** دامنهٔ لینک («drive.google.com») — زیرِ نامِ لینک، تا پیش از باز کردن معلوم باشد کجا می‌رود. */
function hostOf(href: string): string {
  try {
    return new URL(href).host;
  } catch {
    return '';
  }
}

function SubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  const tr = useT();
  return (
    <Button type="submit" size="sm" disabled={pending}>
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
      <Section icon={<Paperclip />} title={tr("پیوست‌ها")}>

        {canUpload && (
          <form
            ref={uploadForm}
            action={(data) => { upload(data); uploadForm.current?.reset(); }}
            className="grid gap-2 rounded-xl border bg-card p-3"
          >
            <input type="hidden" name="projectId" value={projectId} />
            <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
              <Field>
                <FieldLabel htmlFor="att-file">{t("فایل‌ها")}</FieldLabel>
                {/* چند فایل هم‌زمان — مثلِ داشبوردِ نسخهٔ قبلی. */}
                <FileInput id="att-file" name="file" multiple required />
              </Field>
              <SubmitButton>
                <Upload className="size-3.5" />
                {tr("بارگذاری")}
              </SubmitButton>
            </div>
            <Field>
              <FieldLabel htmlFor="att-label">{t("برچسب (اختیاری)")}</FieldLabel>
              <Input id="att-label" name="label" placeholder={t("مثلاً: قرارداد امضاشده")} />
            </Field>
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
                  <Attachment className="w-full">
                    <AttachmentMedia variant={f.kind === 'image' ? 'image' : 'icon'}>
                      {f.kind === 'image'
                        // نسخهٔ کوچک از همان مسیرِ گیت‌شده؛ نبودنش خطا نیست و اصل می‌آید (R-FILE-16).
                        ? <img src={`${f.href}?thumb`} alt="" loading="lazy" />
                        : <Icon />}
                    </AttachmentMedia>
                    <AttachmentContent>
                      <AttachmentTitle>{title}</AttachmentTitle>
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

      <Section icon={<Link2 />} title={tr("لینک‌های خارجی")}>

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
                <Input id="link-label" name="label" placeholder={t("گوگل‌درایو")} />
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
            {tr("لینکِ گوگل‌درایو/دراپ‌باکس و … اینجا دیده می‌شوند.")}
          </p>
        ) : (
          <ul className="grid gap-2 @xl/main:grid-cols-2">
            {links.map((f) => {
              const host = hostOf(f.href);
              return (
                <li key={f.id}>
                  <Attachment className="w-full">
                    <AttachmentMedia><Link2 /></AttachmentMedia>
                    <AttachmentContent>
                      <AttachmentTitle>{f.title}</AttachmentTitle>
                      <AttachmentDescription className="flex items-center gap-1">
                        {host ? <span className="shrink-0" dir="ltr">{host} ·</span> : null}
                        <UserName userId={f.uploaderId} name={f.uploaderName ?? '—'} />
                      </AttachmentDescription>
                    </AttachmentContent>
                    {canDelete(f) && (
                      <AttachmentActions>
                        <AttachmentAction
                          onClick={() => remove(f.id)}
                          disabled={removing}
                          aria-label={`${t("حذف")} — ${f.title}`}
                        >
                          <Trash2 />
                        </AttachmentAction>
                      </AttachmentActions>
                    )}
                    <AttachmentTrigger asChild>
                      <a href={f.href} target="_blank" rel="noopener noreferrer nofollow" aria-label={f.title} />
                    </AttachmentTrigger>
                  </Attachment>
                </li>
              );
            })}
          </ul>
        )}
      </Section>
    </div>
  );
}
