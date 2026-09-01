'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { saveBankAction, type ProfileState } from './_form/actions';
import { maskCard } from '@/domain/people/profile';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useT } from '@/i18n/client';

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? 'در حالِ ذخیره…' : 'ذخیره اطلاعات حساب'}
    </Button>
  );
}

/**
 * اطلاعاتِ حسابِ بانکی.
 *
 * ⚠️ یک کامپوننت برای هر دو جا — پروفایل و نمای عضوِ سابق. عضوِ سابق هم باید
 * بتواند شماره‌اش را اصلاح کند، وگرنه تسویهٔ نهایی به حسابِ اشتباه می‌رود.
 */
export function BankCard({
  bank,
  card,
}: {
  bank: { account: string; iban: string; card: string };
  card: string;
}) {
  const tr = useT();
  const t = useT();
  const [state, save] = useActionState(saveBankAction, {} as ProfileState);

  return (
    <form action={save} className="grid gap-3 rounded-md border p-3">
      <div>
        <h2 className="text-sm font-semibold">{t("اطلاعات حساب بانکی")}</h2>
        <p className="text-xs text-muted-foreground">
          {tr("این اطلاعات برای پرداخت به شما استفاده می‌شود.")}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="grid gap-1.5">
          <Label htmlFor="b-account">{t("شماره حساب")}</Label>
          <Input id="b-account" name="account" className="num" autoComplete="off"
            defaultValue={bank.account} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="b-iban">{t("شماره شبا")}</Label>
          <Input id="b-iban" name="iban" className="num" autoComplete="off"
            placeholder="IR…" defaultValue={bank.iban} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="b-card">{t("شماره کارت")}</Label>
          <Input id="b-card" name="card" className="num" inputMode="numeric" autoComplete="off"
            defaultValue={bank.card} />
        </div>
      </div>

      {card && (
        <p className="num text-xs text-muted-foreground">{tr('کارتِ ثبت‌شده: {card}', { card: maskCard(card) })}</p>
      )}

      <div className="flex items-center gap-3">
        <Submit />
        {(state.error || state.message) && (
          <p className={`text-xs ${state.error ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-500'}`}>
            {tr(state.error ?? state.message ?? '')}
          </p>
        )}
      </div>
    </form>
  );
}
