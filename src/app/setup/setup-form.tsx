'use client';

import { useActionState } from 'react';
import { installAction, type SetupState } from './actions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useT } from '@/i18n/client';

/**
 * ویزاردِ نصب — تنها صفحه‌ای که پیش از وجودِ هر کاربری دیده می‌شود.
 *
 * ⚠️ یک گام، نه چند گام: پنج فیلد آن‌قدر کم است که شکستنش به چند صفحه
 * فقط کلیک اضافه می‌کند. کاربر همه را یک‌جا می‌بیند و یک بار می‌فرستد.
 */
export function SetupForm() {
  const t = useT();
  const [state, formAction, pending] = useActionState<SetupState, FormData>(installAction, {});
  const keep = (key: string) => state.values?.[key] ?? '';

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>{t("به KabarzaOS خوش آمدید")}</CardTitle>
          <CardDescription>
            {t("این سامانه هنوز حسابی ندارد. حسابِ مدیرِ کل را بسازید تا شروع کنیم.")}
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form action={formAction} className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="s-first">{t("نام")}</Label>
                <Input id="s-first" name="firstName" required autoComplete="given-name" defaultValue={keep('firstName')} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="s-last">{t("نام خانوادگی")}</Label>
                <Input id="s-last" name="lastName" autoComplete="family-name" defaultValue={keep('lastName')} />
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="s-email">{t("ایمیل")}</Label>
              <Input
                id="s-email" name="email" type="email" required dir="ltr"
                autoComplete="email" defaultValue={keep('email')}
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="s-username">{t("نام کاربری")}</Label>
              <Input
                id="s-username" name="username" required dir="ltr"
                autoComplete="username" defaultValue={keep('username')}
                placeholder="mostafa"
              />
              {/* ⚠️ هر دو شناسه کار می‌کنند؛ کاربر باید بداند مجبور نیست انتخاب کند. */}
              <p className="text-xs text-muted-foreground">
                {t("برای ورود می‌توانید از ایمیل یا نام کاربری استفاده کنید.")}
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="s-pass">{t("رمز عبور")}</Label>
                <Input
                  id="s-pass" name="password" type="password" required minLength={8}
                  autoComplete="new-password" placeholder={t("دستِ‌کم ۸ نویسه")}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="s-pass2">{t("تکرارِ رمز عبور")}</Label>
                <Input
                  id="s-pass2" name="passwordRepeat" type="password" required minLength={8}
                  autoComplete="new-password"
                />
              </div>
            </div>

            {state.error && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {state.error}
              </p>
            )}

            <Button type="submit" disabled={pending} className="w-full">
              {pending ? t("در حالِ ساخت…") : t("ساختِ حساب و ورود")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
