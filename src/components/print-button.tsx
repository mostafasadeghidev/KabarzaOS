'use client';

import { Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useT } from '@/i18n/client';

/** دکمهٔ چاپ — پورتِ دکمهٔ «چاپ / ذخیره به PDF» ِ فاکتورِ افزونه؛ در خودِ چاپ پنهان است. */
export function PrintButton() {
  const t = useT();
  return (
    <Button type="button" size="sm" className="print:hidden" onClick={() => window.print()}>
      <Printer className="size-3.5" />
      {t('چاپ / ذخیره به PDF')}
    </Button>
  );
}
