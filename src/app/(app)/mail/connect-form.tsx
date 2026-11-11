'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { PasswordInput } from '@/components/ui/password-input';
import { useToast } from '@/components/ui/toast';
import { useT } from '@/i18n/client';
import { connectMailboxAction, type MailboxState } from './actions';

/**
 * «اتصالِ صندوق» (۲.۶۲.۰): کارمند یک بار رمزِ فعلیِ ایمیلش را می‌دهد؛ برنامه با آن
 * یک کلیدِ فقط‌خواندنیِ جدا می‌گیرد و خودِ رمز را دور می‌اندازد.
 */
export function ConnectMailboxForm({ address }: { address: string }) {
  const tr = useT();
  const router = useRouter();
  const { show } = useToast();
  const [state, action, pending] = useActionState(connectMailboxAction, {} as MailboxState);

  useEffect(() => {
    if (state.error) show(tr(state.error), 'error');
    else if (state.ok) { show(tr('صندوق وصل شد.'), 'success'); router.refresh(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form action={action} className="grid max-w-md gap-3">
      <p className="flex items-center gap-2 text-sm">
        <Mail className="size-4" />
        <span dir="ltr">{address}</span>
      </p>
      <Field>
        <FieldLabel htmlFor="mail-pass">{tr('رمزِ فعلیِ ایمیل')}</FieldLabel>
        <PasswordInput id="mail-pass" name="password" autoComplete="current-password" required dir="ltr" />
        <FieldDescription>
          {tr('فقط یک بار. برنامه با آن یک کلیدِ جدا و فقط‌خواندنی برای نمایشِ ایمیل‌ها می‌گیرد و خودِ رمز را نگه نمی‌دارد. اگر بعداً رمزت را عوض کنی، این اتصال می‌ماند.')}
        </FieldDescription>
      </Field>
      <div>
        <Button type="submit" disabled={pending}>{tr('اتصالِ صندوق')}</Button>
      </div>
    </form>
  );
}
