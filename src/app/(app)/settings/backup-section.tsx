'use client';

import { useActionState, useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useFormStatus } from 'react-dom';
import {
  CircleAlert, CircleCheck, Download, HardDriveUpload, Loader2, Pencil, Plus, PlugZap, Trash2,
} from 'lucide-react';
import {
  deleteDestinationAction, downloadBackupAction, saveBackupSettingsAction, saveDestinationAction,
  startBackupAction, testDestinationAction, type BackupState,
} from './_form/backup-actions';
import {
  DEST_LABELS, DEST_TYPES, S3_PROVIDERS, type DestParams, type DestType, type Retention,
} from '@/domain/backup/plan';
import { humanSize } from '@/domain/files/upload';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { IconButton } from '@/components/ui/icon-button';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Table, TableActionsCell, TableActionsHead, TableBody, TableCell, TableHead, TableHeader, TableNumericCell, TableRow,
} from '@/components/ui/table';
import { Panel } from '@/components/page-shell';
import { useActionToast, useToast } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/confirm';
import { useT, useTimeZone } from '@/i18n/client';
import { formatDateTime } from '@/i18n/datetime';

interface DestinationView {
  id: string;
  name: string;
  type: DestType;
  path: string;
  enabled: boolean;
  params: DestParams;
  hasSecret: boolean;
}

interface RunView {
  trigger: string;
  startedAt: string;
  finishedAt: string | null;
  running: boolean;
  ok: boolean | null;
  error?: string;
  file?: string;
  size?: number;
  destinations: Array<{ id: string; name: string; ok: boolean; error?: string; pruned?: number }>;
}

export interface BackupView {
  keyReady: boolean;
  enabled: boolean;
  hour: number;
  retention: Retention;
  keepLocal: number;
  hasPassphrase: boolean;
  destinations: DestinationView[];
  status: RunView | null;
  history: RunView[];
  local: Array<{ name: string; size: number; at: string }>;
}

function Submit({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  const tr = useT();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? <><Spinner />{tr('در حالِ ذخیره…')}</> : children}
    </Button>
  );
}

/**
 * پشتیبان‌گیری — فقط مالک.
 * وضعیت ← تنظیمات (رمز، زمان، نگه‌داری) ← مقصدها ← نسخه‌های روی سرور ← بازگردانی.
 */
export function BackupSection({ view }: { view: BackupView }) {
  const tr = useT();
  const router = useRouter();
  const running = view.status?.running ?? false;

  // ⚠️ در حالِ اجرا صفحه هر پنج ثانیه تازه می‌شود تا نتیجه بی‌رفرش برسد.
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(id);
  }, [running, router]);

  return (
    <div className="grid max-w-4xl gap-4">
      {!view.keyReady && (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertDescription>
            {tr('کلیدِ پشتیبان (BACKUP_KEY) روی سرور نیست. اپ را با نسخهٔ تازه دوباره بسازید (docker compose up -d --build)؛ کلید خودکار ساخته می‌شود.')}
          </AlertDescription>
        </Alert>
      )}
      <StatusPanel view={view} />
      <SettingsPanel view={view} />
      <DestinationsPanel view={view} />
      <LocalPanel view={view} />
      <Panel title={tr('بازگردانی و انتقال به سرورِ دیگر')}>
        <p className="text-sm leading-7 text-muted-foreground">
          {tr('روی سرورِ تازه: Docker را نصب کنید، پروژه را با git clone بگیرید، فایلِ پشتیبان را کنارش بگذارید و این دستور را بزنید. رمزِ پشتیبان پرسیده می‌شود و دیتابیس، فایل‌ها و رازهای داخلی برمی‌گردند:')}
        </p>
        <pre dir="ltr" className="overflow-x-auto rounded-lg bg-muted px-3 py-2 text-xs">./scripts/restore.sh kabarzaos-YYYY-MM-DD-HHMMSS.kbzbak</pre>
        <p className="text-xs text-muted-foreground">{tr('راهنمای کامل در docs/DEPLOY.md، بخشِ Backups.')}</p>
      </Panel>
    </div>
  );
}

function StatusPanel({ view }: { view: BackupView }) {
  const tr = useT();
  const tz = useTimeZone();
  const { show } = useToast();
  const [pending, startTransition] = useTransition();
  const s = view.status;

  return (
    <Panel
      icon={<HardDriveUpload />}
      title={tr('وضعیتِ پشتیبان‌گیری')}
      actions={(
        <Button
          type="button" size="sm" disabled={pending || s?.running || !view.hasPassphrase || !view.keyReady}
          onClick={() => startTransition(async () => {
            const result = await startBackupAction();
            show(tr(result.error ?? result.message ?? ''), result.error ? 'error' : 'success');
          })}
        >
          {s?.running ? <><Loader2 className="size-3.5 animate-spin" />{tr('در حالِ پشتیبان‌گیری…')}</> : tr('پشتیبان‌گیری همین حالا')}
        </Button>
      )}
    >
      {!s ? (
        <p className="text-sm text-muted-foreground">{tr('هنوز هیچ پشتیبانی گرفته نشده.')}</p>
      ) : (
        <div className="grid gap-2 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            {s.running
              ? <Badge variant="secondary">{tr('در جریان')}</Badge>
              : s.ok ? <Badge variant="success">{tr('موفق')}</Badge> : <Badge variant="destructive">{tr('ناموفق')}</Badge>}
            <span className="text-muted-foreground">
              {tr('آخرین اجرا: {at}', { at: formatDateTime(s.finishedAt ?? s.startedAt, tz) })}
            </span>
            {s.size ? <span className="text-muted-foreground">· {humanSize(s.size, tr)}</span> : null}
          </div>
          {s.error && s.error !== 'destination_failed' && (
            <p dir="auto" className="text-xs break-words text-destructive">{s.error}</p>
          )}
          {s.destinations.length > 0 && (
            <ul className="grid gap-1">
              {s.destinations.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center gap-1.5 text-xs">
                  {d.ok ? <CircleCheck className="size-3.5 text-emerald-600" /> : <CircleAlert className="size-3.5 text-destructive" />}
                  <span className="font-medium">{d.name}</span>
                  {d.ok && (d.pruned ?? 0) > 0 && <span className="text-muted-foreground">· {tr('{n} نسخهٔ قدیمی پاک شد', { n: d.pruned! })}</span>}
                  {d.error && <span dir="auto" className="break-all text-destructive">— {d.error}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {!view.hasPassphrase && view.keyReady && (
        <p className="text-xs text-muted-foreground">{tr('برای شروع، در کارتِ زیر رمزِ پشتیبان را تعیین کنید.')}</p>
      )}
    </Panel>
  );
}

function SettingsPanel({ view }: { view: BackupView }) {
  const tr = useT();
  const [state, action] = useActionState(saveBackupSettingsAction, {} as BackupState);
  useActionToast(state);

  return (
    <Panel title={tr('تنظیمات')}>
      {/* ⚠️ key: پس از ذخیره فرم با مقدارِ تازه سوار شود (تلهٔ ریستِ فرمِ React — ← system-section). */}
      <form key={JSON.stringify([view.enabled, view.hour, view.retention, view.keepLocal, view.hasPassphrase])} action={action} className="grid gap-4">
        <label className="flex items-center gap-1.5 text-sm">
          <Switch name="enabled" defaultChecked={view.enabled} />
          {tr('پشتیبان‌گیریِ خودکارِ روزانه')}
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="bk-hour">{tr('ساعتِ اجرا')}</FieldLabel>
            <NativeSelect id="bk-hour" name="hour" defaultValue={view.hour} containerClassName="w-full">
              {Array.from({ length: 24 }, (_, h) => (
                <NativeSelectOption key={h} value={h}>{`${String(h).padStart(2, '0')}:00`}</NativeSelectOption>
              ))}
            </NativeSelect>
            <FieldDescription>{tr('به منطقهٔ زمانیِ سامانه. ساعتِ کم‌کار بهتر است.')}</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="bk-local">{tr('نسخه‌های روی خودِ سرور')}</FieldLabel>
            <Input id="bk-local" name="keepLocal" type="number" min={1} max={30} className="num" defaultValue={view.keepLocal} />
            <FieldDescription>{tr('چند پشتیبانِ آخر روی همین سرور بماند (برای دانلودِ سریع).')}</FieldDescription>
          </Field>
        </div>

        <div className="grid gap-1.5">
          <span className="text-sm font-medium">{tr('نگه‌داری در هر مقصد')}</span>
          <div className="flex flex-wrap gap-3">
            {([['daily', 'روزانه'], ['weekly', 'هفتگی'], ['monthly', 'ماهانه']] as const).map(([key, label]) => (
              <label key={key} className="flex items-center gap-1.5 text-sm">
                <Input name={key} type="number" min={0} max={90} className="num w-20" defaultValue={view.retention[key]} />
                {tr(label)}
              </label>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {tr('مثلاً ۷ روزانه، ۴ هفتگی و ۳ ماهانه: یک هفتهٔ کامل، یک ماه هفته‌به‌هفته و سه ماه ماه‌به‌ماه. فقط فایل‌های پشتیبانِ خودِ سامانه پاک می‌شوند، نه فایل‌های دیگرِ آن پوشه.')}
          </p>
        </div>

        <Field>
          <FieldLabel htmlFor="bk-pass">{tr('رمزِ فایلِ پشتیبان')}</FieldLabel>
          <Input
            id="bk-pass" name="passphrase" type="password" autoComplete="new-password" minLength={12}
            placeholder={view.hasPassphrase ? `••••••••  ${tr('تنظیم شده — برای تغییر، رمزِ تازه بنویسید')}` : tr('دست‌کم ۱۲ نویسه')}
          />
          <FieldDescription>
            {tr('هر پشتیبان پیش از ارسال با این رمز قفل می‌شود؛ سرویسِ مقصد فقط یک فایلِ نامفهوم می‌بیند. این رمز را جای امنی بیرون از این سرور (مثلاً مدیرِ رمز) نگه دارید — بدونِ آن هیچ پشتیبانی باز نمی‌شود و ما هم راهی برای بازیابی‌اش نداریم. تغییرِ رمز فقط روی پشتیبان‌های بعدی اثر دارد.')}
          </FieldDescription>
        </Field>

        <div><Submit>{tr('ذخیره تنظیمات')}</Submit></div>
      </form>
    </Panel>
  );
}

function DestinationsPanel({ view }: { view: BackupView }) {
  const tr = useT();
  const { show } = useToast();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<DestinationView | null | 'new'>(null);
  const [pending, startTransition] = useTransition();

  const test = (d: DestinationView) => startTransition(async () => {
    const result = await testDestinationAction(d.id);
    show(tr(result.error ?? result.message ?? ''), result.error ? 'error' : 'success');
  });
  const remove = async (d: DestinationView) => {
    if (!(await confirm({ title: tr('این مقصد حذف شود؟'), description: tr('فایل‌هایی که قبلاً آنجا فرستاده شده‌اند دست نمی‌خورند.') }))) return;
    startTransition(async () => {
      const result = await deleteDestinationAction(d.id);
      show(tr(result.error ?? result.message ?? ''), result.error ? 'error' : 'success');
    });
  };

  return (
    <Panel
      title={tr('مقصدها')}
      description={tr('هر پشتیبان به همهٔ مقصدهای فعال فرستاده می‌شود؛ اگر یکی در دسترس نبود، بقیه سرِ جایشان‌اند.')}
      actions={(
        <Button type="button" size="sm" variant="outline" onClick={() => setEditing('new')} disabled={!view.keyReady}>
          <Plus className="size-3.5" />{tr('افزودنِ مقصد')}
        </Button>
      )}
    >
      {view.destinations.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {tr('هنوز مقصدی نیست. بدونِ مقصدِ بیرونی، پشتیبان فقط روی همین سرور می‌ماند و با از دست رفتنِ سرور از دست می‌رود.')}
        </p>
      ) : (
        <Table frame={false}>
          <TableHeader>
            <TableRow>
              <TableHead>{tr('نام')}</TableHead>
              <TableHead>{tr('نوع')}</TableHead>
              <TableHead>{tr('پوشه')}</TableHead>
              <TableActionsHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {view.destinations.map((d) => (
              <TableRow key={d.id}>
                <TableCell className="font-medium">
                  {d.name}
                  {!d.enabled && <Badge variant="outline" className="ms-2">{tr('غیرفعال')}</Badge>}
                </TableCell>
                <TableCell className="text-muted-foreground">{tr(DEST_LABELS[d.type]).split(' (')[0]}</TableCell>
                <TableCell dir="ltr" className="text-xs text-muted-foreground">{d.path || '/'}</TableCell>
                <TableActionsCell>
                  <IconButton variant="ghost" className="size-8" label={tr('آزمونِ اتصال')} onClick={() => test(d)} disabled={pending}>
                    <PlugZap className="size-3.5" />
                  </IconButton>
                  <IconButton variant="ghost" className="size-8" label={tr('ویرایش')} onClick={() => setEditing(d)}>
                    <Pencil className="size-3.5" />
                  </IconButton>
                  <IconButton variant="ghost" className="size-8" label={tr('حذف')} onClick={() => remove(d)} disabled={pending}>
                    <Trash2 className="size-3.5" />
                  </IconButton>
                </TableActionsCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {editing !== null && (
        <DestinationDialog dest={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
      )}
    </Panel>
  );
}

/** راهنمای کوتاهِ هر نوع — همان چیزی که کاربر برای پر کردنِ فرم لازم دارد. */
const TYPE_HELP: Partial<Record<DestType, string>> = {
  s3: 'برای Hetzner Object Storage، آروان، لیارا، Cloudflare R2 و Backblaze نوعِ «Other» را بگذارید و نشانیِ Endpoint ِ همان سرویس را بنویسید.',
  sftp: 'برای Hetzner Storage Box: نشانی uXXXXX.your-storagebox.de، درگاه 23.',
  webdav: 'برای Nextcloud: نشانیِ https://cloud.example.com/remote.php/dav/files/USERNAME و یک «رمزِ اپ» از تنظیماتِ امنیتیِ Nextcloud.',
  drive: 'روی کامپیوترِ خودتان rclone را نصب کنید و این را بزنید: rclone authorize "drive" — مرورگر باز می‌شود؛ پس از ورود، متنِ JSON ِ نمایش‌داده‌شده را اینجا بچسبانید.',
  dropbox: 'روی کامپیوترِ خودتان: rclone authorize "dropbox" — پس از ورود، متنِ JSON را اینجا بچسبانید.',
  rclone: 'برای OneDrive، pCloud، Mega، Box و بقیه: روی کامپیوترِ خودتان با rclone config یک remote بسازید، بعد خروجیِ rclone config show NAME را کامل اینجا بچسبانید.',
};

function DestinationDialog({ dest, onClose }: { dest: DestinationView | null; onClose: () => void }) {
  const tr = useT();
  const [type, setType] = useState<DestType>(dest?.type ?? 's3');
  const [state, action] = useActionState(async (prev: BackupState, form: FormData) => {
    const result = await saveDestinationAction(prev, form);
    if (result.message) onClose();
    return result;
  }, {});
  useActionToast(state);
  const p = dest?.params ?? {};
  const secretHint = dest?.hasSecret ? tr('ثبت شده — خالی بگذارید تا تغییر نکند') : '';

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{dest ? tr('ویرایشِ مقصد') : tr('افزودنِ مقصد')}</DialogTitle>
          <DialogDescription>{tr('رمزها و کلیدها رمزگذاری‌شده نگه داشته می‌شوند و دیگر نمایش داده نمی‌شوند.')}</DialogDescription>
        </DialogHeader>
        <form action={action} className="grid gap-3">
          {dest && <input type="hidden" name="id" value={dest.id} />}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="bd-name">{tr('نام')}</FieldLabel>
              <Input id="bd-name" name="name" defaultValue={dest?.name ?? ''} placeholder={tr('مثلاً: هتزنر')} required />
            </Field>
            <Field>
              <FieldLabel htmlFor="bd-type">{tr('نوع')}</FieldLabel>
              <NativeSelect
                id="bd-type" name="type" containerClassName="w-full" value={type}
                onChange={(e) => setType(e.target.value as DestType)} disabled={Boolean(dest)}
              >
                {DEST_TYPES.map((k) => <NativeSelectOption key={k} value={k}>{tr(DEST_LABELS[k])}</NativeSelectOption>)}
              </NativeSelect>
              {/* نوعِ مقصدِ موجود عوض نمی‌شود — رازهایش مالِ نوعِ قبلی‌اند. */}
              {dest && <input type="hidden" name="type" value={type} />}
            </Field>
          </div>

          {TYPE_HELP[type] && <p dir="auto" className="rounded-lg bg-muted/60 px-3 py-2 text-xs leading-6 text-muted-foreground">{tr(TYPE_HELP[type]!)}</p>}

          {type === 's3' && (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="bd-provider">{tr('سرویس')}</FieldLabel>
                  <NativeSelect id="bd-provider" name="provider" containerClassName="w-full" defaultValue={p.provider ?? 'Other'}>
                    {S3_PROVIDERS.map((v) => <NativeSelectOption key={v} value={v}>{v}</NativeSelectOption>)}
                  </NativeSelect>
                </Field>
                <Field>
                  <FieldLabel htmlFor="bd-region">{tr('منطقه (Region)')}</FieldLabel>
                  <Input id="bd-region" name="region" dir="ltr" defaultValue={p.region ?? ''} placeholder="eu-central-1" />
                </Field>
              </div>
              <Field>
                <FieldLabel htmlFor="bd-endpoint">Endpoint</FieldLabel>
                <Input id="bd-endpoint" name="endpoint" dir="ltr" defaultValue={p.endpoint ?? ''} placeholder="https://fsn1.your-objectstorage.com" />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="bd-bucket">{tr('سطل (Bucket)')}</FieldLabel>
                  <Input id="bd-bucket" name="bucket" dir="ltr" defaultValue={p.bucket ?? ''} required />
                </Field>
                <Field>
                  <FieldLabel htmlFor="bd-ak">Access Key</FieldLabel>
                  <Input id="bd-ak" name="accessKeyId" dir="ltr" defaultValue={p.accessKeyId ?? ''} autoComplete="off" required />
                </Field>
              </div>
              <Field>
                <FieldLabel htmlFor="bd-sk">Secret Key</FieldLabel>
                <Input id="bd-sk" name="secretAccessKey" type="password" dir="ltr" autoComplete="off" placeholder={secretHint} required={!dest?.hasSecret} />
              </Field>
            </>
          )}

          {(type === 'sftp' || type === 'webdav') && (
            <>
              {type === 'sftp' ? (
                <div className="grid gap-3 sm:grid-cols-[1fr_6rem]">
                  <Field>
                    <FieldLabel htmlFor="bd-host">{tr('نشانیِ سرور')}</FieldLabel>
                    <Input id="bd-host" name="host" dir="ltr" defaultValue={p.host ?? ''} required />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="bd-port">{tr('درگاه')}</FieldLabel>
                    <Input id="bd-port" name="port" dir="ltr" className="num" defaultValue={p.port ?? '22'} />
                  </Field>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
                  <Field>
                    <FieldLabel htmlFor="bd-url">{tr('نشانیِ WebDAV')}</FieldLabel>
                    <Input id="bd-url" name="url" dir="ltr" defaultValue={p.url ?? ''} placeholder="https://cloud.example.com/remote.php/dav/files/me" required />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="bd-vendor">{tr('نوع')}</FieldLabel>
                    <NativeSelect id="bd-vendor" name="vendor" containerClassName="w-full" defaultValue={p.vendor ?? 'nextcloud'}>
                      <NativeSelectOption value="nextcloud">Nextcloud</NativeSelectOption>
                      <NativeSelectOption value="owncloud">ownCloud</NativeSelectOption>
                      <NativeSelectOption value="other">{tr('دیگر')}</NativeSelectOption>
                    </NativeSelect>
                  </Field>
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="bd-user">{tr('نامِ کاربری')}</FieldLabel>
                  <Input id="bd-user" name="user" dir="ltr" defaultValue={p.user ?? ''} autoComplete="off" required />
                </Field>
                <Field>
                  <FieldLabel htmlFor="bd-pass">{tr('رمز')}</FieldLabel>
                  <Input id="bd-pass" name="password" type="password" dir="ltr" autoComplete="new-password" placeholder={secretHint} required={!dest?.hasSecret} />
                </Field>
              </div>
            </>
          )}

          {(type === 'drive' || type === 'dropbox') && (
            <Field>
              <FieldLabel htmlFor="bd-token">{tr('توکن (خروجیِ rclone authorize)')}</FieldLabel>
              <Textarea id="bd-token" name="token" dir="ltr" rows={4} className="font-mono text-xs" placeholder={secretHint || '{"access_token":"…","refresh_token":"…",…}'} required={!dest?.hasSecret} />
            </Field>
          )}

          {type === 'rclone' && (
            <Field>
              <FieldLabel htmlFor="bd-raw">{tr('پیکربندیِ rclone')}</FieldLabel>
              <Textarea id="bd-raw" name="rawConfig" dir="ltr" rows={6} className="font-mono text-xs" placeholder={secretHint || '[onedrive]\ntype = onedrive\ntoken = {…}\ndrive_id = …\ndrive_type = personal'} required={!dest?.hasSecret} />
            </Field>
          )}

          <Field>
            <FieldLabel htmlFor="bd-path">{tr('پوشه در مقصد')}</FieldLabel>
            <Input id="bd-path" name="path" dir="ltr" defaultValue={dest?.path ?? 'kabarzaos-backups'} />
            <FieldDescription>{tr('اگر نباشد ساخته می‌شود. بهتر است پوشه‌ای مخصوصِ همین کار باشد.')}</FieldDescription>
          </Field>

          <label className="flex items-center gap-1.5 text-sm">
            <Switch name="enabled" defaultChecked={dest?.enabled ?? true} />
            {tr('فعال')}
          </label>

          <DialogFooter>
            <Submit>{tr('ذخیره')}</Submit>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function LocalPanel({ view }: { view: BackupView }) {
  const tr = useT();
  const tz = useTimeZone();
  const [target, setTarget] = useState<string | null>(null);

  return (
    <Panel title={tr('نسخه‌های روی همین سرور')}>
      {view.local.length === 0 ? (
        <p className="text-sm text-muted-foreground">{tr('هنوز پشتیبانی روی سرور نیست.')}</p>
      ) : (
        <Table frame={false}>
          <TableHeader>
            <TableRow>
              <TableHead>{tr('فایل')}</TableHead>
              <TableHead numeric>{tr('زمان')}</TableHead>
              <TableHead numeric>{tr('حجم')}</TableHead>
              <TableActionsHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {view.local.map((b) => (
              <TableRow key={b.name}>
                <TableCell dir="ltr" className="font-mono text-xs">{b.name}</TableCell>
                <TableNumericCell>{formatDateTime(b.at, tz)}</TableNumericCell>
                <TableNumericCell>{humanSize(b.size, tr)}</TableNumericCell>
                <TableActionsCell>
                  <IconButton variant="ghost" className="size-8" label={tr('دانلود')} onClick={() => setTarget(b.name)}>
                    <Download className="size-3.5" />
                  </IconButton>
                </TableActionsCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {target && <DownloadDialog name={target} onClose={() => setTarget(null)} />}
    </Panel>
  );
}

/** دانلود فقط پس از تأییدِ دوبارهٔ رمزِ ورود — فایلِ پشتیبان یعنی همهٔ داده. */
function DownloadDialog({ name, onClose }: { name: string; onClose: () => void }) {
  const tr = useT();
  const [state, action] = useActionState(downloadBackupAction, {} as BackupState);
  useActionToast(state);
  useEffect(() => {
    if (state.download) {
      window.location.href = state.download;
      onClose();
    }
  }, [state.download, onClose]);

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{tr('دانلودِ پشتیبان')}</DialogTitle>
          <DialogDescription>
            {tr('این فایل همهٔ داده‌های سامانه را دارد. برای ادامه رمزِ ورودِ حسابتان را وارد کنید. دانلود در گزارشِ فعالیت ثبت می‌شود.')}
          </DialogDescription>
        </DialogHeader>
        <form action={action} className="grid gap-3">
          <input type="hidden" name="name" value={name} />
          <p dir="ltr" className="font-mono text-xs text-muted-foreground">{name}</p>
          <Field>
            <FieldLabel htmlFor="bdl-pass">{tr('رمزِ ورود')}</FieldLabel>
            <Input id="bdl-pass" name="password" type="password" autoComplete="current-password" required autoFocus />
          </Field>
          <DialogFooter><Submit>{tr('دانلود')}</Submit></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
