'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { login } from './actions';
import type { LoginState } from './schema';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useT } from '@/i18n/client';

export function LoginForm({ notice }: { notice?: string } = {}) {
  const t = useT();
  const [state, formAction, pending] = useActionState<LoginState, FormData>(login, {});

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{t("ورود به KabarzaOS")}</CardTitle>
          <CardDescription>{t("برای ادامه وارد شوید")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="space-y-4">
            {notice && (
              <p className="rounded-[--radius] bg-emerald-500/10 px-3 py-2 text-sm">{t(notice)}</p>
            )}
            <div className="space-y-1.5">
              <label htmlFor="email" className="text-sm font-medium">
                {t("ایمیل یا نام کاربری")}
              </label>
              {/*
                ⚠️ `type="text"` نه `email`: اعتبارسنجیِ مرورگر نامِ کاربری
                را رد می‌کرد و کاربر بدونِ پیام گیر می‌افتاد.
              */}
              <input
                id="email" name="email" type="text" required autoComplete="username" dir="ltr"
                className="h-9 w-full rounded-[--radius] border bg-background px-3 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="password" className="text-sm font-medium">{t("رمز عبور")}</label>
              <input
                id="password" name="password" type="password" required autoComplete="current-password" dir="ltr"
                className="h-9 w-full rounded-[--radius] border bg-background px-3 text-sm"
              />
            </div>

            {state.error && (
              <p role="alert" className="rounded-[--radius] bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {t(state.error)}
              </p>
            )}

            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? t('در حال ورود…') : t('ورود')}
            </Button>
            {/* پورتِ `wp_lostpassword_url`: راهِ خودخدمتِ بازنشانی. */}
            <Link href="/forgot" className="block text-center text-sm text-muted-foreground underline">
              {t("رمزم را فراموش کرده‌ام")}
            </Link>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
