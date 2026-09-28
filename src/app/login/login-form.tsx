'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { login } from './actions';
import type { LoginState } from './schema';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { useT } from '@/i18n/client';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CircleAlert, CircleCheck } from 'lucide-react';
import { Input } from '@/components/ui/input';

/**
 * فرمِ ورود — بلوکِ login ِ shadcn: کارت، `FieldGroup`، پیوندِ «فراموشی» کنارِ
 * برچسبِ رمز. پوسته و نشانِ برند از `PublicShell` می‌آید (صفحه آن را می‌سازد).
 */
export function LoginForm({ notice }: { notice?: string } = {}) {
  const t = useT();
  const [state, formAction, pending] = useActionState<LoginState, FormData>(login, {});

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("ورود به حساب")}</CardTitle>
        <CardDescription>{t("برای ادامه وارد شوید")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction}>
          <FieldGroup>
            {notice && (
              <Alert>
                <CircleCheck />
                <AlertDescription>{t(notice)}</AlertDescription>
              </Alert>
            )}
            <Field>
              <FieldLabel htmlFor="email">{t("ایمیل یا نام کاربری")}</FieldLabel>
              {/*
                ⚠️ `type="text"` نه `email`: اعتبارسنجیِ مرورگر نامِ کاربری
                را رد می‌کرد و کاربر بدونِ پیام گیر می‌افتاد.
              */}
              <Input
                id="email" name="email" type="text" required autoComplete="username" dir="ltr"
              />
            </Field>
            <Field>
              <div className="flex items-center">
                <FieldLabel htmlFor="password">{t("رمز عبور")}</FieldLabel>
                {/* پورتِ `wp_lostpassword_url`: راهِ خودخدمتِ بازنشانی. */}
                <Link href="/forgot" className="ms-auto text-sm underline-offset-4 hover:underline">
                  {t("رمزم را فراموش کرده‌ام")}
                </Link>
              </div>
              <Input
                id="password" name="password" type="password" required autoComplete="current-password" dir="ltr"
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
                {pending ? <><Spinner />{t('در حال ورود…')}</> : t('ورود')}
              </Button>
            </Field>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
