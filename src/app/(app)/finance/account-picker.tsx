'use client';

import { Building2, Landmark, Lock, Wallet } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Amount } from '@/components/amount-privacy';
import { formatIn } from '@/domain/money/money';
import { useT } from '@/i18n/client';
import type { AccountOption } from './ledger-view';
import { LAST_ACCOUNT_COOKIE } from './account-cookie';


/** آخرین حسابِ دیده‌شده را برای دفعهٔ بعد نگه می‌دارد (فقط همین مرورگر). */
export function rememberAccount(id: number): void {
  try {
    document.cookie = `${LAST_ACCOUNT_COOKIE}=${id}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  } catch {
    // مرورگرِ بی‌کوکی — دفعهٔ بعد دوباره انتخاب می‌کند.
  }
}

/**
 * انتخابِ حساب پیش از دفترکل (۲.۴۵.۰).
 *
 * ⚠️ پیش از این صفحهٔ «مالی» بی‌صدا **اولین** حساب را باز می‌کرد و کسی که حواسش
 * نبود ردیف را در حسابِ اشتباه می‌نوشت (یورو به‌جای تومان). حالا بارِ اول کارتِ
 * همهٔ حساب‌ها می‌آید و یک کلیک حساب را باز می‌کند؛ از آن به بعد همان آخرین
 * حساب باز می‌شود. مودال با «تأیید» عمداً نه: بعد از چند بار بی‌خواندن تأیید
 * می‌شود و جلوی همان اشتباه را نمی‌گیرد.
 */
export function AccountPicker({ accounts, onPick }: {
  accounts: AccountOption[];
  onPick: (id: number) => void;
}) {
  const t = useT();
  // حساب‌های فعال اول؛ غیرفعال‌ها کم‌رنگ در انتها.
  const sorted = [...accounts].sort((a, b) => Number(b.isActive) - Number(a.isActive));
  return (
    <div className="grid gap-3">
      <div className="grid gap-0.5">
        <h2 className="text-base font-semibold">{t('کدام حساب را می‌خواهید ببینید؟')}</h2>
        <p className="text-sm text-muted-foreground">
          {t('ردیف‌های تازه در همین حساب ثبت می‌شوند. بعداً از بالای دفترکل عوضش کنید.')}
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {sorted.map((a) => {
          const Icon = a.type === 'personal' ? Wallet : Landmark;
          return (
            /*
              ⚠️ div با نقشِ دکمه، نه <button>: مبلغِ پنهان (`Amount`) خودش دکمه است
              و دکمه داخلِ دکمه HTML ِ نامعتبر است.
            */
            <div
              key={a.id}
              role="button"
              tabIndex={0}
              onClick={() => { rememberAccount(a.id); onPick(a.id); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); rememberAccount(a.id); onPick(a.id); }
              }}
              className={`grid cursor-pointer gap-3 rounded-xl border bg-card p-4 text-start transition hover:border-primary/50 hover:bg-primary/5 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none ${a.isActive ? '' : 'opacity-60'}`}
            >
              <span className="flex items-start justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="size-4" />
                  </span>
                  <span className="grid min-w-0">
                    <span className="truncate font-semibold">{a.name}</span>
                    {a.officeName && (
                      <span className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                        <Building2 className="size-3" />{a.officeName}
                      </span>
                    )}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  {a.scope === 'private' && <Lock className="size-3.5 text-muted-foreground" aria-label={t('خصوصی')} />}
                  <Badge variant="outline" className="num">{a.currencyCode ?? '—'}</Badge>
                </span>
              </span>
              <span className="grid gap-0.5">
                <span className="text-xs text-muted-foreground">{t('مانده')}</span>
                <Amount className="num text-lg font-semibold">{formatIn(a.balance, a.currencyCode)} {a.currencyCode ?? ''}</Amount>
              </span>
              {!a.isActive && <span className="text-xs text-muted-foreground">{t('غیرفعال')}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
