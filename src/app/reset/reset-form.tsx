'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { completeResetAction, type ResetState } from './actions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useT } from '@/i18n/client';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CircleAlert } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/** فرمِ تعیینِ رمزِ تازه از راهِ لینک. */
export function ResetForm({ token }: { token: string }) {
  const t = useT();
  const [state, formAction, pending] = useActionState<ResetState, FormData>(completeResetAction, {});

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{t("تعیینِ رمزِ عبور")}</CardTitle>
          <CardDescription>{t("رمزِ تازه‌ای برای حسابتان بگذارید؛ سپس با آن وارد شوید.")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="space-y-4">
            <input type="hidden" name="token" value={token} />
            <div className="space-y-1.5">
              <Label htmlFor="next">{t("رمزِ تازه")}</Label>
              <Input
                id="next" name="next" type="password" required minLength={8} autoComplete="new-password" dir="ltr"
                placeholder={t("دستِ‌کم ۸ نویسه")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="repeat">{t("تکرارِ رمزِ تازه")}</Label>
              <Input
                id="repeat" name="repeat" type="password" required minLength={8} autoComplete="new-password" dir="ltr"
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
              {pending ? t('در حالِ ذخیره…') : t('ذخیرهٔ رمز')}
            </Button>
            <Link href="/forgot" className="block text-center text-sm text-muted-foreground underline">
              {t("درخواستِ لینکِ تازه")}
            </Link>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
