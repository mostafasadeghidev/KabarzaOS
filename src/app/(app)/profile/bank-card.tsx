'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { saveBankAction, type ProfileState } from './_form/actions';
import { maskCard } from '@/domain/people/profile';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useActionToast } from '@/components/ui/toast';
import { useT } from '@/i18n/client';
import { Panel } from '@/components/page-shell';

function Submit() {
  const { pending } = useFormStatus();
  const tr = useT();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? <><Spinner />{tr('در حالِ ذخیره…')}</> : tr('ذخیره اطلاعات حساب')}
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
  useActionToast(state);

  return (
    <Panel title={t("اطلاعات حساب بانکی")} description={tr("این اطلاعات برای پرداخت به شما استفاده می‌شود.")}>
    <form action={save} className="grid gap-3">

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
      </div>
    </form>
    </Panel>
  );
}
