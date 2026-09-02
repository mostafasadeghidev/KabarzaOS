'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { requestResetAction, type ForgotState } from './actions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useT } from '@/i18n/client';

/** فرمِ «رمزم را فراموش کرده‌ام». */
export function ForgotForm() {
  const t = useT();
  const [state, formAction, pending] = useActionState<ForgotState, FormData>(requestResetAction, {});

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{t("بازنشانیِ رمزِ عبور")}</CardTitle>
          <CardDescription>{t("ایمیل یا نامِ کاربری‌تان را بنویسید تا لینکِ تعیینِ رمزِ تازه برایتان فرستاده شود.")}</CardDescription>
        </CardHeader>
        <CardContent>
          {state.done ? (
            <div className="space-y-4">
              <p className="rounded-[--radius] bg-emerald-500/10 px-3 py-2 text-sm">
                {t("اگر حسابی با این نشانی باشد، لینکِ بازنشانی فرستاده شد؛ صندوقِ ایمیل را ببینید (تا ۲۴ ساعت معتبر است).")}
              </p>
              <Link href="/login" className="text-sm underline">{t("بازگشت به ورود")}</Link>
            </div>
          ) : (
            <form action={formAction} className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="email" className="text-sm font-medium">{t("ایمیل یا نام کاربری")}</label>
                <input
                  id="email" name="email" type="text" required autoComplete="username" dir="ltr"
                  className="h-9 w-full rounded-[--radius] border bg-background px-3 text-sm"
                />
              </div>
              {state.error && (
                <p role="alert" className="rounded-[--radius] bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {t(state.error)}
                </p>
              )}
              <Button type="submit" className="w-full" disabled={pending}>
                {pending ? t('در حالِ ارسال…') : t('ارسالِ لینک')}
              </Button>
              <Link href="/login" className="block text-center text-sm text-muted-foreground underline">
                {t("بازگشت به ورود")}
              </Link>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
