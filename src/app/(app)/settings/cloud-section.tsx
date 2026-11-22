'use client';

import { useId, useState, useTransition } from 'react';
import Link from 'next/link';
import { Cloud, ExternalLink, HardDrive, Pencil, Plus, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Switch } from '@/components/ui/switch';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { EmptyState } from '@/components/ui/empty-state';
import { useConfirm } from '@/components/ui/confirm';
import { useToast } from '@/components/ui/toast';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Panel } from '@/components/page-shell';
import { useT, useTimeZone } from '@/i18n/client';
import { formatDateTime } from '@/i18n/datetime';
import type { CloudConnectionView } from '@/server/cloud/connections';
import type { FileStoreView } from '@/server/files/cloud-store';
import { humanSize } from '@/domain/files/upload';
import { useRouter } from 'next/navigation';
import {
  deleteCloudConnectionAction, migrateFilesStepAction, saveCloudConnectionAction, setFileStoreAction, testCloudConnectionAction,
  type CloudSettingsState,
} from './_form/actions';

/**
 * فضای ابری (۳.۴.۰) — اتصال به یک یا چند سرورِ Nextcloud. فقط مالک.
 *
 * ⚠️ رمزِ برنامه (App password) فقط نوشته می‌شود و هرگز به مرورگر برنمی‌گردد؛ فیلدِ خالی
 * در ویرایش یعنی «همان قبلی».
 */
const STATUS_ERRORS: Record<string, string> = {
  unauthorized: 'نام‌کاربری یا رمزِ برنامه پذیرفته نشد.',
  forbidden: 'این حساب اجازهٔ دیدنِ گروه را ندارد؛ باید «مدیرِ گروهِ» همین گروه باشد.',
  not_found: 'گروه پیدا نشد، یا این حساب مدیرِ آن نیست.',
  network: 'سرور در دسترس نیست. نشانی را بررسی کنید.',
  http: 'سرور پاسخِ خطا داد (یا به نشانیِ دیگری تغییرمسیر داد).',
  bad_response: 'پاسخِ سرور شبیهِ Nextcloud نبود. نشانی را بررسی کنید.',
  refused: 'سرور درخواست را رد کرد.',
  not_configured: 'رمزِ برنامه ذخیره نشده یا دیگر باز نمی‌شود؛ دوباره بگذاریدش.',
  no_connection: 'اتصال پیدا نشد.',
};

export function CloudSection({ connections, fileStore }: { connections: CloudConnectionView[]; fileStore: FileStoreView | null }) {
  const t = useT();
  const tz = useTimeZone();
  const { show } = useToast();
  const confirm = useConfirm();
  const [pending, start] = useTransition();
  /** `null` = بسته؛ `'new'` = اتصالِ تازه. */
  const [editing, setEditing] = useState<CloudConnectionView | 'new' | null>(null);

  const report = (state: CloudSettingsState) => {
    if (state.error) show(t(state.error, state.params), 'error');
    else if (state.message) show(t(state.message), 'success');
  };

  const remove = async (c: CloudConnectionView) => {
    if (!await confirm({
      title: t('اتصالِ «{name}» حذف شود؟', { name: c.name }),
      description: t('فقط اتصال و سرویسِ خالی‌اش از برنامه پاک می‌شوند؛ هیچ حساب یا فایلی روی Nextcloud دست نمی‌خورد.'),
      confirmLabel: t('حذف'),
      destructive: true,
    })) return;
    start(async () => report(await deleteCloudConnectionAction(c.id)));
  };

  return (
    <Panel
      title={t('فضای ابری')}
      description={t('ساختن، سهمیه و قطعِ حسابِ کارمندان روی Nextcloud ِ خودتان. هر سرور یک اتصال است و می‌شود چند تا داشت.')}
      actions={<Button data-tour="settings-cloud-add" size="sm" onClick={() => setEditing('new')}><Plus className="size-4" />{t('اتصالِ تازه')}</Button>}
      className="max-w-3xl"
    >
      <div className="grid gap-3">
        {connections.length === 0 ? (
          <EmptyState
            icon={<Cloud className="size-5" />}
            title={t('هنوز اتصالی نیست')}
            description={t('در Nextcloud یک گروه (مثلاً team) و یک کاربرِ جدا بسازید که فقط «مدیرِ همان گروه» باشد، نه ادمینِ کل؛ بعد برای او یک App password بسازید و اینجا بگذارید.')}
          />
        ) : connections.map((c) => (
          <div key={c.id} data-tour="settings-cloud-conn" className="grid gap-2 rounded-lg border p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{c.name}</span>
              {!c.isActive
                ? <Badge variant="secondary">{t('خاموش')}</Badge>
                : c.status?.ok ? <Badge>{t('وصل')}</Badge> : <Badge variant="secondary">{t('آزمون نشده')}</Badge>}
              <span className="ms-auto flex flex-wrap gap-1.5">
                <Button size="sm" variant="outline" disabled={pending} onClick={() => start(async () => report(await testCloudConnectionAction(c.id)))}>
                  {t('آزمونِ اتصال')}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setEditing(c)}><Pencil className="size-3.5" />{t('ویرایش')}</Button>
                {c.grants === 0 && (
                  <Button size="sm" variant="ghost" disabled={pending} onClick={() => { void remove(c); }} aria-label={t('حذف')}>
                    <Trash2 className="size-3.5" />
                  </Button>
                )}
              </span>
            </div>
            <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-xs sm:grid-cols-[auto_1fr]">
              <dt className="text-muted-foreground">{t('نشانی')}</dt>
              <dd dir="ltr" className="min-w-0 break-all text-start">
                <a href={c.baseUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:underline">
                  {c.baseUrl}<ExternalLink className="size-3" />
                </a>
              </dd>
              <dt className="text-muted-foreground">{t('حسابِ اتصال / گروه')}</dt>
              <dd dir="ltr" className="text-start font-mono">{c.username} · {c.groupId}</dd>
              <dt className="text-muted-foreground">{t('سهمیهٔ پیش‌فرض')}</dt>
              <dd className="num">{c.defaultQuotaGb} GB</dd>
            </dl>
            {c.status && (
              <p className={`text-xs ${c.status.ok ? 'text-muted-foreground' : 'text-destructive'}`}>
                {c.status.ok
                  ? t('آخرین آزمون موفق — {n} حساب در گروه', { n: c.status.users ?? 0 })
                  : `${t(STATUS_ERRORS[c.status.error ?? ''] ?? STATUS_ERRORS.http!)}${c.status.detail ? ` (${c.status.detail})` : ''}`}
                {' · '}<span className="num">{formatDateTime(c.status.at, tz)}</span>
              </p>
            )}
            {c.status?.ok && c.status.isAdmin && (
              <p className="rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                {t('این حساب ادمینِ کلِ Nextcloud است. کار می‌کند، ولی امن‌تر است فقط «مدیرِ گروه» باشد تا برنامه به حساب‌های بیرون از گروه دسترسی نداشته باشد.')}
              </p>
            )}
            {c.isActive && (
              <div>
                <Button size="sm" variant="link" asChild className="h-auto p-0">
                  <Link href={`/access/cloud?c=${c.id}`}>{t('حساب‌های این فضا')}</Link>
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>
      <ConnectionDialog value={editing} onClose={() => setEditing(null)} onSaved={report} />
      {fileStore && <FileStorePanel view={fileStore} connections={connections} />}
    </Panel>
  );
}

function ConnectionDialog({ value, onClose, onSaved }: {
  value: CloudConnectionView | 'new' | null;
  onClose: () => void;
  onSaved: (state: CloudSettingsState) => void;
}) {
  const t = useT();
  const [pending, start] = useTransition();
  const conn = value && value !== 'new' ? value : null;

  /** onSubmit، نه `action` — تا پس از خطا فرم خالی نشود. */
  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    start(async () => {
      const state = await saveCloudConnectionAction(conn?.id ?? null, form);
      onSaved(state);
      if (!state.error) onClose();
    });
  };

  return (
    <Dialog open={value !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent data-tour="settings-cloud-form" className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Cloud className="size-4" />{conn ? t('ویرایشِ اتصال') : t('اتصالِ تازه')}</DialogTitle>
          <DialogDescription>
            {t('حسابِ اتصال فقط «مدیرِ گروه» باشد؛ برنامه فقط حساب‌های همان گروه را می‌بیند و عوض می‌کند.')}
          </DialogDescription>
        </DialogHeader>
        <form key={conn?.id ?? 'new'} onSubmit={submit} className="grid gap-3">
          <Field>
            <FieldLabel htmlFor="cc-name">{t('نام')}</FieldLabel>
            <Input id="cc-name" name="name" required maxLength={60} defaultValue={conn?.name ?? ''} placeholder={t('فضای اصلی')} />
            <FieldDescription>{t('همین نام در «دسترسی‌ها» و «دسترسی‌های من» ِ کارمندان دیده می‌شود.')}</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="cc-url">{t('نشانی')}</FieldLabel>
            <Input id="cc-url" name="baseUrl" required dir="ltr" defaultValue={conn?.baseUrl ?? ''} placeholder="https://cloud.example.com" />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="cc-user">{t('نامِ کاربریِ اتصال')}</FieldLabel>
              <Input id="cc-user" name="username" required dir="ltr" autoComplete="off" defaultValue={conn?.username ?? ''} placeholder="kabarza-os" />
            </Field>
            <Field>
              <FieldLabel htmlFor="cc-group">{t('گروه')}</FieldLabel>
              <Input id="cc-group" name="groupId" required dir="ltr" autoComplete="off" defaultValue={conn?.groupId ?? ''} placeholder="team" />
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="cc-secret">{t('رمزِ برنامه (App password)')}</FieldLabel>
            <PasswordInput
              id="cc-secret" name="secret" dir="ltr" autoComplete="new-password" required={!conn}
              placeholder={conn?.hasSecret ? t('ذخیره شده — برای تغییر بنویسید') : ''}
            />
            <FieldDescription>
              {t('در Nextcloud با همین حساب: تنظیماتِ شخصی ← امنیت ← «ساختِ رمزِ برنامه». رمزگذاری‌شده ذخیره می‌شود و دیگر نمایش داده نمی‌شود.')}
            </FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="cc-quota">{t('سهمیهٔ حسابِ تازه (گیگ)')}</FieldLabel>
            <Input id="cc-quota" name="defaultQuotaGb" dir="ltr" inputMode="numeric" className="w-32" defaultValue={String(conn?.defaultQuotaGb ?? 10)} />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <Switch name="isActive" defaultChecked={conn?.isActive ?? true} />
            {t('روشن')}
          </label>
          <DialogFooter>
            <Button data-tour="settings-cloud-cancel" type="button" variant="ghost" onClick={onClose}>{t('انصراف')}</Button>
            <Button type="submit" disabled={pending}>{t('ذخیره')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * محلِ فایل‌های برنامه (۳.۵.۰): همهٔ پیوست‌ها، رسیدها و آواتارها روی سرورِ برنامه یا روی یکی از
 * فضاهای ابری. برای کاربر فرقی ندارد؛ فقط جای ذخیره عوض می‌شود. «انتقال» فایل‌های قبلی را می‌برد.
 */
function FileStorePanel({ view, connections }: { view: FileStoreView; connections: CloudConnectionView[] }) {
  const t = useT();
  const tz = useTimeZone();
  const router = useRouter();
  const { show } = useToast();
  const [pending, start] = useTransition();
  const [progress, setProgress] = useState<{ moved: number; failed: number; remaining: number } | null>(null);
  const [running, setRunning] = useState(false);
  const usable = connections.filter((c) => c.isActive && c.hasSecret);
  // ⚠️ نامِ یکتا: نامِ ثابت با نسخهٔ پنهانِ استریمِ React برخورد می‌کرد («Mixing React and non-React radio inputs»).
  const group = useId();
  const nameOf = (id: number) => connections.find((c) => c.id === id)?.name ?? `#${id}`;

  const choose = (value: string) => {
    const id = value === 'server' ? null : Number(value);
    start(async () => {
      const state = await setFileStoreAction(id);
      if (state.error) show(t(state.error, state.params), 'error');
      else { show(t('ذخیره شد.'), 'success'); router.refresh(); }
    });
  };

  /** گام به گام تا تمام شدن؛ هر گام حدودِ ۲۰ ثانیه. بستنِ صفحه فقط کار را نگه می‌دارد. */
  const migrate = async () => {
    setRunning(true);
    let moved = 0;
    let failed = 0;
    try {
      for (let i = 0; i < 500; i++) {
        const state = await migrateFilesStepAction();
        if (state.error) { show(t(state.error, state.params), 'error'); break; }
        moved += state.moved ?? 0;
        failed += state.failed ?? 0;
        setProgress({ moved, failed, remaining: state.remaining ?? 0 });
        // گامی که هیچ پیش نرفت (همه خطا دادند) یعنی تکرار فایده ندارد.
        if ((state.remaining ?? 0) === 0 || (state.moved ?? 0) === 0) break;
      }
    } finally {
      setRunning(false);
      router.refresh();
    }
  };

  return (
    <section data-tour="settings-cloud-filestore" className="mt-6 grid gap-3 rounded-lg border p-3 text-sm">
      <h3 className="flex items-center gap-2 font-medium"><HardDrive className="size-4" />{t('محلِ فایل‌های برنامه')}</h3>
      <p className="text-xs text-muted-foreground">
        {t('پیوستِ پروژه‌ها، تسک‌ها، کامنت‌ها، پیام‌ها، رسیدها و آواتارها. برای کاربران فرقی نمی‌کند: همان‌جا در برنامه باز و دانلود می‌شوند. روی فضای ابری، فایل‌ها در پوشهٔ خصوصیِ حسابِ اتصال (KabarzaOS-files) می‌مانند و با کسی share نمی‌شوند.')}
      </p>
      <div className="grid gap-1.5">
        <label className="flex items-center gap-2">
          <input type="radio" name={group} value="server" checked={view.connectionId === null} disabled={pending || running} onChange={() => choose('server')} />
          {t('سرورِ برنامه')}
        </label>
        {usable.map((c) => (
          <label key={c.id} className="flex items-center gap-2">
            <input type="radio" name={group} value={c.id} checked={view.connectionId === c.id} disabled={pending || running} onChange={() => choose(String(c.id))} />
            {t('فضای ابری: {name}', { name: c.name })}
          </label>
        ))}
      </div>
      {view.inactive && (
        <p className="text-xs text-destructive">
          {t('اتصالِ انتخاب‌شده خاموش است یا رمز ندارد؛ فایل‌های تازه فعلاً روی سرورِ برنامه می‌روند.')}
        </p>
      )}
      {view.lastError && (
        <p className="text-xs text-destructive">
          {t('آخرین بار فایلی روی فضای ابری نوشته نشد و روی سرور ماند ({status}). سهمیهٔ حسابِ اتصال و دسترسیِ سرور را بررسی کنید.', { status: view.lastError.status || '—' })}
          {' · '}<span className="num">{formatDateTime(view.lastError.at, tz)}</span>
        </p>
      )}
      <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-xs sm:grid-cols-[auto_1fr]">
        <dt className="text-muted-foreground">{t('روی سرورِ برنامه')}</dt>
        <dd>{t('{n} فایل', { n: view.server.count })} · <span className="num">{humanSize(view.server.bytes, t)}</span></dd>
        {view.cloud.map((c) => (
          <div key={c.connectionId} className="contents">
            <dt className="text-muted-foreground">{t('فضای ابری: {name}', { name: nameOf(c.connectionId) })}</dt>
            <dd>{t('{n} فایل', { n: c.count })} · <span className="num">{humanSize(c.bytes, t)}</span></dd>
          </div>
        ))}
      </dl>
      {view.connectionId !== null && !view.inactive && view.server.count > 0 && (
        <div className="grid gap-1.5">
          <div>
            <Button size="sm" variant="outline" disabled={running || pending} onClick={() => { void migrate(); }}>
              {running ? t('در حالِ انتقال…') : t('انتقالِ فایل‌های قبلی به فضای ابری')}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {t('هر فایل اول روی فضای ابری نوشته و سنجیده می‌شود، بعد از سرور پاک می‌شود. اگر صفحه را ببندید، کار همان‌جا می‌ایستد و بعداً ادامه پیدا می‌کند.')}
          </p>
        </div>
      )}
      {progress && (
        <p className="text-xs">
          {t('منتقل شد: {moved} · مانده: {remaining}', { moved: progress.moved, remaining: progress.remaining })}
          {progress.failed > 0 && <span className="text-destructive"> · {t('ناموفق: {n}', { n: progress.failed })}</span>}
        </p>
      )}
    </section>
  );
}
