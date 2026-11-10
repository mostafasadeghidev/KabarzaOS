'use client';

import { useState, useTransition } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { CopyText } from '@/components/copy-text';
import { IconButton } from '@/components/ui/icon-button';
import { useToast } from '@/components/ui/toast';
import { useT } from '@/i18n/client';
import { revealSecretAction } from './_form/actions';

/**
 * رمزِ یک دسترسی پشتِ دکمهٔ چشم (۲.۵۸.۰) — در دفتر و پروفایل.
 *
 * ⚠️ رمز همراهِ صفحه نمی‌آید: فقط با کلیک از سرور خوانده می‌شود، تا در دادهٔ
 * صفحه نباشد و هر دیدن ثبت شود. با بستنِ چشم از حافظهٔ کامپوننت هم می‌رود.
 */
export function SecretReveal({ grantId }: { grantId: number }) {
  const tr = useT();
  const { show } = useToast();
  const [secret, setSecret] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const toggle = () => {
    if (secret !== null) { setSecret(null); return; }
    startTransition(async () => {
      const result = await revealSecretAction(grantId);
      if (result.secret !== undefined) setSecret(result.secret);
      else show(tr(result.error ?? 'رمز خوانده نشد؛ دوباره ثبتش کنید.'), 'error');
    });
  };

  return (
    <span className="inline-flex items-center gap-1" dir="ltr">
      {secret !== null
        ? <CopyText value={secret} className="num text-xs" />
        : <span aria-hidden className="text-xs text-muted-foreground">••••••••</span>}
      <IconButton
        type="button"
        variant="ghost"
        size="icon-sm"
        disabled={pending}
        onClick={toggle}
        label={secret !== null ? tr('پنهان کردنِ رمز') : tr('نمایشِ رمز')}
      >
        {secret !== null ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
      </IconButton>
    </span>
  );
}
