'use client';

import { useActionState, useRef, useState, useTransition } from 'react';
import { useFormStatus } from 'react-dom';
import {
  Download, ExternalLink, FileText, Film, ImageIcon, Link2, Paperclip, Trash2, Upload,
} from 'lucide-react';
import {
  addLinkAction, deleteAttachmentAction, uploadAttachmentAction, type FileFormState,
} from './_form/file-actions';
import { humanSize, MAX_SIZE } from '@/domain/files/upload';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useActionToast } from '@/components/ui/toast';
import { useT } from '@/i18n/client';

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
}

const KIND_ICON = {
  image: ImageIcon,
  video: Film,
  file: FileText,
} as const;

function SubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  const tr = useT();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? tr('در حال ارسال…') : children}
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
}: {
  files: FileRow[];
  projectId: number;
  canUpload: boolean;
}) {
  const tr = useT();
  const t = useT();
  const attachments = files.filter((f) => !f.isLink);
  const links = files.filter((f) => f.isLink);

  const [uploadState, upload] = useActionState(uploadAttachmentAction, {});
  useActionToast(uploadState);
  const [linkState, addLink] = useActionState(addLinkAction, {});
  useActionToast(linkState);
  const [removing, startRemove] = useTransition();
  const [removeError, setRemoveError] = useState<string | null>(null);
  const uploadForm = useRef<HTMLFormElement>(null);

  const remove = (id: number) => {
    setRemoveError(null);
    startRemove(async () => {
      const result = await deleteAttachmentAction(id, projectId);
      if (result?.error) setRemoveError(result.error);
    });
  };

  return (
    <div className="grid gap-5">
      <section className="grid gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          <Paperclip className="size-4" />
          {tr("پیوست‌ها")}
        </h3>

        {canUpload && (
          <form
            ref={uploadForm}
            action={(data) => { upload(data); uploadForm.current?.reset(); }}
            className="grid gap-2 rounded-md border p-3"
          >
            <input type="hidden" name="projectId" value={projectId} />
            <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
              <div className="grid gap-1.5">
                <Label htmlFor="att-file">{t("فایل‌ها")}</Label>
                {/* چند فایل هم‌زمان — مثلِ داشبوردِ نسخهٔ قبلی. */}
                <Input id="att-file" name="file" type="file" multiple required />
              </div>
              <SubmitButton>
                <Upload className="size-3.5" />
                {tr("بارگذاری")}
              </SubmitButton>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="att-label">{t("برچسب (اختیاری)")}</Label>
              <Input id="att-label" name="label" placeholder={t("مثلاً: قرارداد امضاشده")} />
            </div>
            <p className="text-xs text-muted-foreground">
              {tr('تصویر، ویدیو، PDF و سند — تا {size} برای هر فایل.', { size: humanSize(MAX_SIZE.attachment, tr) })}
            </p>
          </form>
        )}

        {attachments.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("پیوستی ثبت نشده.")}</p>
        ) : (
          <ul className="grid gap-2 @xl/main:grid-cols-2">
            {attachments.map((f) => {
              const Icon = KIND_ICON[f.kind as keyof typeof KIND_ICON] ?? FileText;
              return (
                <li key={f.id} className="flex items-center gap-3 rounded-md border p-2">
                  {f.kind === 'image' ? (
                    // پیش‌نمایش هم از همان مسیرِ گیت‌شده می‌آید.
                    <img
                      src={f.href}
                      alt={f.title}
                      className="size-12 shrink-0 rounded object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex size-12 shrink-0 items-center justify-center rounded bg-muted">
                      <Icon className="size-5 text-muted-foreground" />
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <a
                      href={f.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block truncate text-sm hover:underline"
                    >
                      {f.title || `#${f.id}`}
                    </a>
                    <p className="text-xs text-muted-foreground">
                      {f.uploaderName ?? '—'}
                      {f.size ? ` · ${humanSize(f.size, tr)}` : ''}
                    </p>
                  </div>

                  <a
                    href={`${f.href}?dl`}
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-muted"
                    aria-label={t("دانلود")}
                  >
                    <Download className="size-4" />
                  </a>
                  {canUpload && (
                    <button
                      type="button"
                      onClick={() => remove(f.id)}
                      disabled={removing}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-60"
                      aria-label={t("حذف")}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {removeError && <p className="text-xs text-destructive">{removeError}</p>}
      </section>

      <section className="grid gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          <Link2 className="size-4" />
          {tr("لینک‌های خارجی")}
        </h3>

        {canUpload && (
          <form action={addLink} className="grid gap-2 rounded-md border p-3">
            <input type="hidden" name="projectId" value={projectId} />
            <div className="grid gap-2 sm:grid-cols-[2fr_1fr_auto] sm:items-end">
              <div className="grid gap-1.5">
                <Label htmlFor="link-url">{t("نشانی")}</Label>
                <Input id="link-url" name="url" type="url" placeholder="https://…" required />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="link-label">{t("برچسب")}</Label>
                <Input id="link-label" name="label" placeholder={t("گوگل‌درایو")} />
              </div>
              <SubmitButton>{t("افزودن")}</SubmitButton>
            </div>
            {/* ⚠️ هیچ فایلی از این نشانی گرفته نمی‌شود — فقط ذخیره می‌شود. */}
            <p className="text-xs text-muted-foreground">
              {tr("فایل دانلود نمی‌شود؛ فقط نشانی نگه داشته می‌شود.")}
            </p>
          </form>
        )}

        {links.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {tr("لینکِ گوگل‌درایو/دراپ‌باکس و … اینجا دیده می‌شوند.")}
          </p>
        ) : (
          <ul className="grid gap-1">
            {links.map((f) => (
              <li key={f.id} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                <a
                  href={f.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex min-w-0 flex-1 items-center gap-1 truncate hover:underline"
                >
                  <span className="truncate">{f.title}</span>
                  <ExternalLink className="size-3 shrink-0" />
                </a>
                <span className="shrink-0 text-xs text-muted-foreground">{f.uploaderName ?? '—'}</span>
                {canUpload && (
                  <button
                    type="button"
                    onClick={() => remove(f.id)}
                    disabled={removing}
                    className="rounded-md p-1 text-muted-foreground hover:bg-muted disabled:opacity-60"
                    aria-label={t("حذف")}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
