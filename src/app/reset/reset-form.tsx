'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { completeResetAction, type ResetState } from './actions';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { useT } from '@/i18n/client';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CircleAlert } from 'lucide-react';
import { Input } from '@/components/ui/input';

/** فرمِ تعیینِ رمزِ تازه از راهِ لینک — همان کارتِ صفحهٔ ورود؛ پوسته از `PublicShell`. */
export function ResetForm({ token }: { token: string }) {
  const t = useT();
  const [state, formAction, pending] = useActionState<ResetState, FormData>(completeResetAction, {});

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("تعیینِ رمزِ عبور")}</CardTitle>
        <CardDescription>{t("رمزِ تازه‌ای برای حسابتان بگذارید؛ سپس با آن وارد شوید.")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction}>
          <input type="hidden" name="token" value={token} />
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="next">{t("رمزِ تازه")}</FieldLabel>
              <Input
                id="next" name="next" type="password" required minLength={8} autoComplete="new-password" dir="ltr"
                placeholder={t("دستِ‌کم ۸ نویسه")}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="repeat">{t("تکرارِ رمزِ تازه")}</FieldLabel>
              <Input
                id="repeat" name="repeat" type="password" required minLength={8} autoComplete="new-password" dir="ltr"
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
                {pending ? <><Spinner />{t('در حالِ ذخیره…')}</> : t('ذخیرهٔ رمز')}
              </Button>
              <FieldDescription className="text-center">
                <Link href="/forgot">{t("درخواستِ لینکِ تازه")}</Link>
              </FieldDescription>
            </Field>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
