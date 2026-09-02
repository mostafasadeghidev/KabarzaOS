'use server';

import { requireActor } from '@/server/auth';
import { recomputeEur } from '@/server/finance/service';
import { ForbiddenError } from '@/domain/access/guard';
import { revalidatePath } from 'next/cache';
import { getT } from '@/i18n/server';

export interface RecomputeState {
  error?: string;
  message?: string;
}

/** پورتِ دکمهٔ «بازمحاسبهٔ معادلِ یورو» ِ تبِ گزارشِ کلی — مالک یا مدیرِ مالی. */
export async function recomputeEurAction(): Promise<RecomputeState> {
  try {
    const actor = await requireActor();
    const n = await recomputeEur(actor);
    revalidatePath('/reports');
    return {
      message: n.ledger + n.payments === 0
        ? 'همهٔ ردیف‌ها از قبل درست بودند.'
        : (await getT())('به‌روز شد: {ledger} ردیفِ دفتر و {payments} پرداخت.',
          { ledger: n.ledger, payments: n.payments }),
    };
  } catch (error) {
    if (error instanceof ForbiddenError) return { error: 'فقط مالک یا مدیرِ مالی.' };
    return { error: 'بازمحاسبه ناتمام ماند.' };
  }
}
