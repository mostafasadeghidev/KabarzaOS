'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { requestResetAction, type ForgotState } from './actions';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { useT } from '@/i18n/client';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CircleAlert, CircleCheck } from 'lucide-react';
import { Input } from '@/components/ui/input';

/** فرمِ «رمزم را فراموش کرده‌ام» — همان کارتِ صفحهٔ ورود؛ پوسته از `PublicShell`. */
export function ForgotForm() {
  const t = useT();
  const [state, formAction, pending] = useActionState<ForgotState, FormData>(requestResetAction, {});

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("بازنشانیِ رمزِ عبور")}</CardTitle>
        <CardDescription>{t("ایمیل یا نامِ کاربری‌تان را بنویسید تا لینکِ تعیینِ رمزِ تازه برایتان فرستاده شود.")}</CardDescription>
      </CardHeader>
      <CardContent>
        {state.done ? (
          <FieldGroup>
            <Alert>
              <CircleCheck />
              <AlertDescription>
                {t("اگر حسابی با این نشانی باشد، لینکِ بازنشانی فرستاده شد؛ صندوقِ ایمیل را ببینید (تا ۲۴ ساعت معتبر است).")}
              </AlertDescription>
            </Alert>
            <FieldDescription className="text-center">
              <Link href="/login">{t("بازگشت به ورود")}</Link>
            </FieldDescription>
          </FieldGroup>
        ) : (
          <form action={formAction}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="email">{t("ایمیل یا نام کاربری")}</FieldLabel>
                <Input
                  id="email" name="email" type="text" required autoComplete="username" dir="ltr"
                />
              </Field>
              {state.error && (
                <Alert variant="destructive">
                  <CircleAlert />
                  <AlertDescription>
                    {t(state.error)}
                  </AlertDescription>
                </Alert>
              )}
              <Field>
                <Button type="submit" disabled={pending}>
                  {pending ? <><Spinner />{t('در حالِ ارسال…')}</> : t('ارسالِ لینک')}
                </Button>
                <FieldDescription className="text-center">
                  <Link href="/login">{t("بازگشت به ورود")}</Link>
                </FieldDescription>
              </Field>
            </FieldGroup>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
