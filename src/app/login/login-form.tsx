'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { login } from './actions';
import type { LoginState } from './schema';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useT } from '@/i18n/client';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CircleAlert } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

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
              <Label htmlFor="email">
                {t("ایمیل یا نام کاربری")}
              </Label>
              {/*
                ⚠️ `type="text"` نه `email`: اعتبارسنجیِ مرورگر نامِ کاربری
                را رد می‌کرد و کاربر بدونِ پیام گیر می‌افتاد.
              */}
              <Input
                id="email" name="email" type="text" required autoComplete="username" dir="ltr"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">{t("رمز عبور")}</Label>
              <Input
                id="password" name="password" type="password" required autoComplete="current-password" dir="ltr"
              />
            </div>

            {state.error && (
              <Alert variant="destructive">
                <CircleAlert />
                <AlertDescription>
                  {t(state.error)}
                </AlertDescription>
              </Alert>
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
