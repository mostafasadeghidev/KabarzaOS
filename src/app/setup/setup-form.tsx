'use client';

import { useActionState } from 'react';
import { installAction, type SetupState } from './actions';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { useT } from '@/i18n/client';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CircleAlert } from 'lucide-react';

/**
 * ویزاردِ نصب — تنها صفحه‌ای که پیش از وجودِ هر کاربری دیده می‌شود.
 *
 * ⚠️ یک گام، نه چند گام: پنج فیلد آن‌قدر کم است که شکستنش به چند صفحه
 * فقط کلیک اضافه می‌کند. کاربر همه را یک‌جا می‌بیند و یک بار می‌فرستد.
 *
 * همان کارتِ صفحهٔ ورود (پوسته از `PublicShell`)، فقط پهن‌تر: دو ستون فیلد.
 */
export function SetupForm() {
  const t = useT();
  const [state, formAction, pending] = useActionState<SetupState, FormData>(installAction, {});
  const keep = (key: string) => state.values?.[key] ?? '';

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("به KabarzaOS خوش آمدید")}</CardTitle>
        <CardDescription>
          {t("این سامانه هنوز حسابی ندارد. حسابِ مدیرِ کل را بسازید تا شروع کنیم.")}
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form action={formAction}>
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="s-first">{t("نام")}</FieldLabel>
                <Input id="s-first" name="firstName" required autoComplete="given-name" defaultValue={keep('firstName')} />
              </Field>
              <Field>
                <FieldLabel htmlFor="s-last">{t("نام خانوادگی")}</FieldLabel>
                <Input id="s-last" name="lastName" autoComplete="family-name" defaultValue={keep('lastName')} />
              </Field>
            </div>

            <Field>
              <FieldLabel htmlFor="s-email">{t("ایمیل")}</FieldLabel>
              <Input
                id="s-email" name="email" type="email" required dir="ltr"
                autoComplete="email" defaultValue={keep('email')}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="s-username">{t("نام کاربری")}</FieldLabel>
              <Input
                id="s-username" name="username" required dir="ltr"
                autoComplete="username" defaultValue={keep('username')}
                placeholder="mostafa"
              />
              {/* ⚠️ هر دو شناسه کار می‌کنند؛ کاربر باید بداند مجبور نیست انتخاب کند. */}
              <FieldDescription>
                {t("برای ورود می‌توانید از ایمیل یا نام کاربری استفاده کنید.")}
              </FieldDescription>
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="s-pass">{t("رمز عبور")}</FieldLabel>
                <Input
                  id="s-pass" name="password" type="password" required minLength={8}
                  autoComplete="new-password" placeholder={t("دستِ‌کم ۸ نویسه")}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="s-pass2">{t("تکرارِ رمز عبور")}</FieldLabel>
                <Input
                  id="s-pass2" name="passwordRepeat" type="password" required minLength={8}
                  autoComplete="new-password"
                />
              </Field>
            </div>

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
                {pending ? <><Spinner />{t("در حالِ ساخت…")}</> : t("ساختِ حساب و ورود")}
              </Button>
            </Field>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
