'use client';

import { useActionState, useEffect, useState } from 'react';
import { Bot, Check, Eye, PenLine, ShieldCheck, X } from 'lucide-react';
import { consentAction, type ConsentState } from './actions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Spinner } from '@/components/ui/spinner';
import { useT } from '@/i18n/client';
import { cn } from '@/lib/utils';

/**
 * کارتِ «اجازه» (۲.۸.۰) — کاربر می‌بیند **کدام اپ**، **با کدام حساب** و **با
 * چه دسترسی‌ای** وصل می‌شود، و خودش دامنه را کم می‌کند (فقط‌خواندنی).
 */
export function ConsentForm({ hidden, clientName, userName, defaultScope }: {
  hidden: Record<string, string>;
  clientName: string;
  userName: string;
  defaultScope: 'read' | 'write';
}) {
  const t = useT();
  const [state, action, pending] = useActionState<ConsentState, FormData>(consentAction, {});
  const [scope, setScope] = useState<'read' | 'write'>(defaultScope);

  useEffect(() => {
    if (state.redirect) window.location.href = state.redirect;
  }, [state.redirect]);

  const choices = [
    { value: 'read' as const, icon: Eye, title: t('فقط خواندن'), body: t('تسک‌ها، پروژه‌ها، ساعت‌ها و در دسترس بودنِ تیم را می‌بیند.') },
    { value: 'write' as const, icon: PenLine, title: t('خواندن و نوشتن'), body: t('به‌علاوه: ثبتِ ساعت، تایمر، ساختنِ تسک، تغییرِ وضعیت و کامنت.') },
  ];

  return (
    <Card>
      <CardHeader>
        <div className="mb-1 flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><Bot className="size-5" /></div>
        <CardTitle dir="auto">{t('«{app}» می‌خواهد به حسابِ شما وصل شود', { app: clientName })}</CardTitle>
        <CardDescription>{t('وارد شده‌اید با: {name}', { name: userName })}</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="grid gap-4">
          {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
          <input type="hidden" name="scope" value={scope} />

          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium">{t('چه دسترسی‌ای بدهم؟')}</legend>
            {choices.map((c) => (
              <button
                key={c.value} type="button" onClick={() => setScope(c.value)}
                aria-pressed={scope === c.value}
                className={cn(
                  'flex items-start gap-3 rounded-lg border p-3 text-start transition-colors',
                  scope === c.value ? 'border-primary bg-primary/5' : 'hover:bg-muted/50',
                )}
              >
                <c.icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="grid gap-0.5">
                  <span className="text-sm font-medium">{c.title}</span>
                  <span className="text-xs text-muted-foreground">{c.body}</span>
                </span>
                {scope === c.value && <Check className="ms-auto size-4 text-primary" aria-hidden />}
              </button>
            ))}
          </fieldset>

          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
            {t('این اپ فقط چیزهایی را می‌بیند که خودتان در Kabarza می‌بینید. کارهای مالی، حذف و دسترسی‌ها ممکن نیست. هر وقت بخواهید از «پروفایل ← دستیارِ هوشِ مصنوعی» قطعش کنید.')}
          </p>

          {state.error && <Alert variant="destructive"><AlertDescription>{t(state.error)}</AlertDescription></Alert>}

          <div className="flex flex-wrap gap-2">
            <Button type="submit" name="decision" value="allow" disabled={pending || Boolean(state.redirect)}>
              {pending ? <Spinner /> : <Check className="size-4" />}{t('اجازه می‌دهم')}
            </Button>
            <Button type="submit" name="decision" value="deny" variant="outline" disabled={pending || Boolean(state.redirect)}>
              <X className="size-4" />{t('نه')}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
