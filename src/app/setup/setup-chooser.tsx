'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useT } from '@/i18n/client';
import { RestorePanel } from './restore-panel';
import { SetupForm } from './setup-form';

/**
 * ویزاردِ نصب: «حسابِ تازه» یا «برگرداندنِ سامانهٔ قبلی از پشتیبان».
 *
 * ⚠️ نصبِ تازه پیش‌فرض است و بازگردانی فقط یک پیوندِ زیرِ کارت: بیشترِ نصب‌ها
 * تازه‌اند، و دکمهٔ «جایگزین کن» نباید اولین چیزی باشد که کسی می‌بیند.
 */
export function SetupChooser() {
  const t = useT();
  const [mode, setMode] = useState<'install' | 'restore'>('install');

  if (mode === 'restore') return <RestorePanel onBack={() => setMode('install')} />;
  return (
    <div className="flex flex-col gap-3">
      <SetupForm />
      <p className="text-center text-sm text-muted-foreground">
        {t('سامانه را به سرورِ تازه منتقل می‌کنید؟')}{' '}
        <Button variant="link" className="h-auto p-0" onClick={() => setMode('restore')}>
          {t('بازگردانی از فایلِ پشتیبان')}
        </Button>
      </p>
    </div>
  );
}
