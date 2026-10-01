'use client';

import { useEffect, useRef, useState } from 'react';
import { CircleAlert, DatabaseBackup, TriangleAlert } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Spinner } from '@/components/ui/spinner';
import { humanSize } from '@/domain/files/upload';
import { formatDateTime } from '@/i18n/datetime';
import { useT, useTimeZone } from '@/i18n/client';
import type { RestoreManifest, RestoreStatus } from '@/server/setup/restore';

/**
 * بازگردانی از فایلِ پشتیبان روی سرورِ تازه — جایگزینِ ترمینال برای کسی که
 * فقط پنلِ استقرار (Coolify، Portainer…) دارد.
 *
 * گام‌ها: انتخابِ فایل و رمز → بارگذاریِ تکه‌تکه → خلاصه و تأیید → بازگردانی →
 * راه‌اندازیِ دوبارهٔ خودکار → صفحهٔ ورود (با همان حساب‌های قبلی).
 *
 * ⚠️ تکه‌تکه، نه یک درخواست: پراکسی‌ها اغلب سقفِ حجم دارند (nginx پیش‌فرض ۱ مگابایت).
 * اگر پاسخِ 413 آمد، اندازهٔ تکه کوچک می‌شود و همان‌جا ادامه می‌یابد.
 */

type Step = 'pick' | 'uploading' | 'checking' | 'review' | 'running' | 'restarting' | 'manual';

const BIG_CHUNK = 8 * 1024 * 1024;
const SMALL_CHUNK = 512 * 1024;

const ERRORS: Record<string, string> = {
  installed: 'این سامانه دیگر خالی نیست؛ بازگردانی از اینجا ممکن نیست.',
  busy: 'کسِ دیگری همین حالا در حالِ بازگردانی است. چند دقیقهٔ دیگر دوباره امتحان کنید.',
  token: 'نشستِ بازگردانی منقضی شد؛ از اول شروع کنید.',
  bad_passphrase: 'رمز اشتباه است یا فایل آسیب دیده.',
  not_backup: 'این فایل پشتیبانِ KabarzaOS نیست.',
  too_new: 'این پشتیبان از نسخه‌ای تازه‌تر از این سرور است؛ اول برنامه را به‌روز کنید.',
  tool_failed: 'بازگردانی کامل نشد؛ جزئیات در گزارشِ زیر است. دیتابیس فقط وقتی جایگزین می‌شود که کامل برگردد.',
};
const GENERIC = 'بارگذاری کامل نشد؛ اتصال را بررسی و دوباره امتحان کنید.';

class StepError extends Error {}

async function call<T>(op: string, token: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api/setup/restore?op=${op}`, {
    method: 'POST',
    ...init,
    headers: { 'x-restore-token': token, ...(init.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new StepError(String(body.error ?? 'upload'));
  return body as T;
}

const json = (value: unknown): RequestInit => ({
  body: JSON.stringify(value),
  headers: { 'content-type': 'application/json' },
});

export function RestorePanel({ onBack }: { onBack: () => void }) {
  const t = useT();
  const tz = useTimeZone();
  const [step, setStep] = useState<Step>('pick');
  const [file, setFile] = useState<File | null>(null);
  const [passphrase, setPassphrase] = useState('');
  const [progress, setProgress] = useState(0);
  const [manifest, setManifest] = useState<RestoreManifest | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const token = useRef('');
  const logEnd = useRef<HTMLDivElement>(null);

  const showError = (e: unknown) => setError(e instanceof StepError ? (ERRORS[e.message] ?? GENERIC) : GENERIC);

  async function upload() {
    if (!file || !passphrase) return;
    setError(null);
    setStep('uploading');
    setProgress(0);
    try {
      token.current = (await call<{ token: string }>('begin', '')).token;
      let chunk = BIG_CHUNK;
      let offset = 0;
      let retries = 0;
      while (offset < file.size) {
        let res: Response;
        try {
          res = await fetch('/api/setup/restore?op=chunk', {
            method: 'POST',
            headers: {
              'x-restore-token': token.current,
              'x-offset': String(offset),
              'content-type': 'application/octet-stream',
            },
            body: file.slice(offset, offset + chunk),
          });
        } catch (networkError) {
          // قطعیِ کوتاه — همان تکه دوباره؛ سرور جای درست را نگه داشته است.
          if (++retries > 5) throw networkError;
          await new Promise((r) => setTimeout(r, 1500 * retries));
          continue;
        }
        if (res.status === 413 && chunk > SMALL_CHUNK) {
          chunk = SMALL_CHUNK;
          continue;
        }
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (body.error === 'offset' && typeof body.expected === 'number') {
            offset = body.expected;
            continue;
          }
          throw new StepError(String(body.error ?? 'upload'));
        }
        retries = 0;
        offset = body.size;
        setProgress(Math.round((offset / file.size) * 100));
      }

      setStep('checking');
      const result = await call<{ manifest: RestoreManifest }>('inspect', token.current, json({ passphrase }));
      setManifest(result.manifest);
      setConfirmed(false);
      setStep('review');
    } catch (e) {
      showError(e);
      setStep('pick');
    }
  }

  async function apply() {
    setError(null);
    try {
      await call('apply', token.current, json({ passphrase }));
      setLog([]);
      setStep('running');
    } catch (e) {
      showError(e);
    }
  }

  async function cancel() {
    if (token.current) await call('cancel', token.current).catch(() => undefined);
    token.current = '';
    onBack();
  }

  // پیشرفتِ بازگردانی — هر دو ثانیه.
  useEffect(() => {
    if (step !== 'running') return;
    let stop = false;
    const tick = async () => {
      const res = await fetch('/api/setup/restore', { headers: { 'x-restore-token': token.current } }).catch(() => null);
      if (stop || !res) return;
      if (!res.ok) return;
      const status = (await res.json()) as RestoreStatus;
      setLog(status.log);
      if (status.phase === 'done') {
        setPassphrase('');
        setStep(status.restarts ? 'restarting' : 'manual');
      } else if (status.phase === 'failed') {
        setError(ERRORS[status.error ?? ''] ?? ERRORS.tool_failed!);
        setStep('review');
      }
    };
    const id = setInterval(tick, 2000);
    void tick();
    return () => { stop = true; clearInterval(id); };
  }, [step]);

  /*
   * پس از پایان، برنامه خودش را می‌بندد و Docker دوباره بالایش می‌آورد. نشانهٔ
   * «پردازهٔ تازه بالا آمد»: پاسخِ وضعیت دیگر ژتونِ ما را نمی‌شناسد (403). پیش از
   * آن ممکن است هنوز پردازهٔ قدیمی پاسخ دهد، پس صرفِ «/login باز شد» کافی نیست.
   */
  useEffect(() => {
    if (step !== 'restarting') return;
    const id = setInterval(async () => {
      const res = await fetch('/api/setup/restore', { headers: { 'x-restore-token': token.current } }).catch(() => null);
      if (res?.status === 403) window.location.assign('/login');
    }, 2000);
    return () => clearInterval(id);
  }, [step]);

  useEffect(() => {
    logEnd.current?.scrollIntoView({ block: 'nearest' });
  }, [log]);

  const busy = step === 'uploading' || step === 'checking' || step === 'running' || step === 'restarting';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DatabaseBackup className="size-5" />
          {t('بازگردانی از فایلِ پشتیبان')}
        </CardTitle>
        <CardDescription>
          {t('سامانه را از یک فایلِ ‎.kbzbak با همهٔ داده‌ها، فایل‌ها و حساب‌ها برگردانید. پس از آن با همان حساب‌های قبلی وارد می‌شوید.')}
        </CardDescription>
      </CardHeader>

      <CardContent>
        <FieldGroup>
          {(step === 'pick' || step === 'uploading' || step === 'checking') && (
            <>
              <Field>
                <FieldLabel htmlFor="r-file">{t('فایلِ پشتیبان')}</FieldLabel>
                <Input
                  id="r-file" type="file" accept=".kbzbak" disabled={busy} dir="ltr"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
                {file && <FieldDescription>{humanSize(file.size, t)}</FieldDescription>}
              </Field>
              <Field>
                <FieldLabel htmlFor="r-pass">{t('رمزِ فایلِ پشتیبان')}</FieldLabel>
                <Input
                  id="r-pass" type="password" autoComplete="off" disabled={busy}
                  value={passphrase} onChange={(e) => setPassphrase(e.target.value)}
                />
                <FieldDescription>{t('همان رمزی که در تنظیماتِ پشتیبان‌گیریِ سرورِ قبلی تعیین شده بود.')}</FieldDescription>
              </Field>
              {step === 'uploading' && (
                <Field>
                  <Progress value={progress} />
                  <FieldDescription>{t('در حالِ بارگذاری… {n}٪', { n: progress })}</FieldDescription>
                </Field>
              )}
            </>
          )}

          {step === 'review' && manifest && (
            <>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                <dt className="text-muted-foreground">{t('تاریخِ پشتیبان')}</dt>
                <dd>{formatDateTime(manifest.createdAt, tz)}</dd>
                <dt className="text-muted-foreground">{t('نسخه')}</dt>
                <dd dir="ltr" className="text-start">{manifest.app ?? '—'}</dd>
                <dt className="text-muted-foreground">{t('دیتابیس')}</dt>
                <dd>{humanSize(manifest.dbBytes, t)}</dd>
                <dt className="text-muted-foreground">{t('فایل‌ها')}</dt>
                <dd>{t('{n} فایل', { n: manifest.fileCount })} · {humanSize(manifest.fileBytes, t)}</dd>
              </dl>
              {manifest.tooNew ? (
                <Alert variant="destructive">
                  <CircleAlert />
                  <AlertDescription>{t(ERRORS.too_new!)}</AlertDescription>
                </Alert>
              ) : (
                <label className="flex items-start gap-2 text-sm">
                  <Checkbox checked={confirmed} onCheckedChange={(v) => setConfirmed(v === true)} className="mt-0.5" />
                  <span>{t('می‌دانم که هر چه تا این لحظه روی این سرور هست با محتوای پشتیبان جایگزین می‌شود.')}</span>
                </label>
              )}
            </>
          )}

          {(step === 'running' || step === 'restarting' || step === 'manual' || (step === 'review' && log.length > 0)) && (
            <div className="max-h-56 overflow-y-auto rounded-md border bg-muted/40 p-3 font-mono text-xs leading-relaxed">
              {log.map((line, i) => <div key={i} className="whitespace-pre-wrap break-words">{line}</div>)}
              <div ref={logEnd} />
            </div>
          )}

          {step === 'restarting' && (
            <Alert>
              <Spinner />
              <AlertDescription>
                {t('بازگردانی تمام شد. برنامه در حالِ راه‌اندازیِ دوباره است و پس از آن به صفحهٔ ورود می‌روید؛ با همان حساب‌های قبلی وارد شوید.')}
              </AlertDescription>
            </Alert>
          )}
          {step === 'manual' && (
            <Alert>
              <TriangleAlert />
              <AlertDescription>
                {t('بازگردانی تمام شد. برنامه را یک بار دوباره راه‌اندازی کنید تا رازهای بازگردانده به کار بیفتند، سپس وارد شوید.')}
              </AlertDescription>
            </Alert>
          )}

          {error && (
            <Alert variant="destructive">
              <CircleAlert />
              <AlertDescription>{t(error)}</AlertDescription>
            </Alert>
          )}

          <Field orientation="horizontal" className="flex-wrap justify-between gap-2">
            {(step === 'pick' || step === 'uploading' || step === 'checking') && (
              <Button onClick={upload} disabled={!file || !passphrase || busy}>
                {step === 'uploading' ? <><Spinner />{t('در حالِ بارگذاری…')}</>
                  : step === 'checking' ? <><Spinner />{t('در حالِ بررسیِ فایل…')}</>
                    : t('بارگذاری و بررسی')}
              </Button>
            )}
            {step === 'review' && manifest && !manifest.tooNew && (
              <Button variant="destructive" onClick={apply} disabled={!confirmed}>
                {t('بازگردانی')}
              </Button>
            )}
            {step === 'running' && (
              <Button disabled><Spinner />{t('در حالِ بازگردانی…')}</Button>
            )}
            {step === 'manual' && (
              <Button onClick={() => window.location.assign('/login')}>{t('رفتن به صفحهٔ ورود')}</Button>
            )}
            {step !== 'running' && step !== 'restarting' && step !== 'manual' && (
              <Button variant="ghost" onClick={cancel} disabled={step === 'uploading' || step === 'checking'}>
                {t('بازگشت به نصبِ تازه')}
              </Button>
            )}
          </Field>
        </FieldGroup>
      </CardContent>
    </Card>
  );
}
