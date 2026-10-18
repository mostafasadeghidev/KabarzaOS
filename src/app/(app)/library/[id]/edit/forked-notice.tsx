'use client';

import { GitFork } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useT } from '@/i18n/client';

/** پس از «نسخهٔ جدا برای این پروژه» — تا معلوم باشد این دیگر همان موردِ مشترک نیست. */
export function ForkedNotice() {
  const tr = useT();
  return (
    <Alert>
      <GitFork />
      <AlertDescription>
        {tr('نسخهٔ جدا ساخته شد و به‌جای موردِ اصلی روی همان پروژه ثبت شد. حالا تغییرهای این پروژه را اینجا بدهید؛ به بقیهٔ پروژه‌ها نمی‌رسد.')}
      </AlertDescription>
    </Alert>
  );
}
