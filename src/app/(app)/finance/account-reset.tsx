'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { forgetAccount, isFinancePath } from './account-cookie';

/**
 * با بیرون رفتن از «مالی» حسابِ انتخاب‌شده فراموش می‌شود (۳.۸.۰) — در چیدمانِ اصلی
 * سوار است، پس هر صفحهٔ دیگری که باز شود (با کلیک یا مستقیم) کوکی را پاک می‌کند.
 * جابه‌جایی بین تب‌ها و فیلترهای خودِ «مالی» انتخاب را نگه می‌دارد.
 */
export function FinanceAccountReset() {
  const pathname = usePathname();
  useEffect(() => {
    if (pathname && !isFinancePath(pathname)) forgetAccount();
  }, [pathname]);
  return null;
}
