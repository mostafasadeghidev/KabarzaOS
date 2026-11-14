'use client';

import { useState, useTransition } from 'react';
import { KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { PasswordInput } from '@/components/ui/password-input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import { useT } from '@/i18n/client';
import { resetMailPasswordAction } from '../_form/actions';

/** همان قاعدهٔ سرور (`mailPasswordProblem`) — فقط برای پیامِ زودتر؛ سنجشِ اصلی سمتِ سرور است. */
function problem(value: string): string | null {
  if (value.length < 12 || value.length > 128) return 'رمز باید بینِ ۱۲ تا ۱۲۸ نویسه باشد.';
  if (/\s/.test(value)) return 'رمز فاصله نداشته باشد.';
  if (!/[A-Za-z]/.test(value) || !/[0-9]/.test(value)) return 'رمز هم حرفِ لاتین داشته باشد هم رقم.';
  return null;
}

/**
 * «رمزِ تازه» برای یک صندوق (۳.۳.۰) — خودکار (تصادفی) یا رمزی که مدیر خودش می‌نویسد.
 *
 * ⚠️ هر دو حالت رمزِ قبلی و همهٔ اتصال‌های قبلی (گوشی، Outlook، SMTP) را باطل می‌کنند.
 * رمز در دفتر می‌ماند: صندوقِ عضو در «دسترسی‌های من» ِ او، صندوقِ بی‌صاحب پشتِ چشمِ همین صفحه.
 */
export function NewPasswordDialog({ target, onClose, onDone }: {
  target: { accountId: string; address: string; linked: boolean } | null;
  onClose: () => void;
  onDone: (result: { grantId: number | null; password?: string }) => void;
}) {
  const tr = useT();
  const { show } = useToast();
  const [pending, start] = useTransition();
  const [mode, setMode] = useState<'auto' | 'custom'>('auto');
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  const close = () => { setMode('auto'); setValue(''); setError(null); onClose(); };

  const submit = () => {
    if (!target) return;
    if (mode === 'custom') {
      const p = problem(value);
      if (p) { setError(p); return; }
    }
    start(async () => {
      const result = await resetMailPasswordAction(target.accountId, mode === 'custom' ? value : null);
      if (result.error) { show(tr(result.error, result.params), 'error'); return; }
      show(tr('رمزِ تازه گذاشته شد.'), 'success');
      setValue('');
      onDone({ grantId: result.grantId ?? null, password: result.password });
      close();
    });
  };

  return (
    <Dialog open={target !== null} onOpenChange={(open) => { if (!open) close(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><KeyRound className="size-4" />{tr('رمزِ تازه')}</DialogTitle>
          <DialogDescription dir="ltr" className="text-start">{target?.address}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <RadioGroup value={mode} onValueChange={(v) => { setMode(v as typeof mode); setError(null); }} className="grid gap-2">
            <label className="flex items-center gap-2 text-sm">
              <RadioGroupItem value="auto" />{tr('خودکار — یک رمزِ تصادفیِ قوی ساخته شود')}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <RadioGroupItem value="custom" />{tr('دستی — رمز را خودم می‌نویسم')}
            </label>
          </RadioGroup>
          {mode === 'custom' && (
            <Field>
              <FieldLabel htmlFor="np-value">{tr('رمزِ تازه')}</FieldLabel>
              <PasswordInput
                id="np-value" dir="ltr" autoComplete="new-password" value={value}
                onChange={(e) => { setValue(e.target.value); setError(null); }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }}
              />
              <FieldDescription>{tr('دست‌کم ۱۲ نویسه، بی فاصله، با حرفِ لاتین و رقم.')}</FieldDescription>
              {error && <p className="text-xs text-destructive">{tr(error)}</p>}
            </Field>
          )}
          <p className="rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
            {target?.linked
              ? tr('رمزِ فعلی و همهٔ ورودهای گوشی و Outlook و اتصالِ صندوق در همین برنامه باطل می‌شوند. رمزِ تازه در «دسترسی‌های من» ِ کارمند دیده می‌شود.')
              : tr('رمزِ فعلی باطل می‌شود؛ هر جا با آن وصل است (مثلاً تنظیمِ SMTP) باید رمزِ تازه را بگذارید. رمزِ تازه در همین صفحه پشتِ دکمهٔ چشم می‌ماند.')}
          </p>
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={close}>{tr('انصراف')}</Button>
          <Button type="button" variant="destructive" disabled={pending} onClick={submit}>{tr('رمزِ تازه بگذار')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
