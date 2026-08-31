'use server';

import { requireActor } from '@/server/auth';
import { recomputeEur } from '@/server/finance/service';
import { ForbiddenError } from '@/domain/access/guard';
import { revalidatePath } from 'next/cache';

export interface RecomputeState {
  error?: string;
  message?: string;
}

/** پورتِ دکمهٔ «بازمحاسبهٔ معادلِ یورو» ِ تبِ گزارشِ کلی — فقط مالک. */
export async function recomputeEurAction(): Promise<RecomputeState> {
  try {
    const actor = await requireActor();
    const n = await recomputeEur(actor);
    revalidatePath('/reports');
    return {
      message: n.ledger + n.payments === 0
        ? 'همهٔ ردیف‌ها از قبل درست بودند.'
        : `به‌روز شد: ${n.ledger} ردیفِ دفتر و ${n.payments} پرداخت.`,
    };
  } catch (error) {
    if (error instanceof ForbiddenError) return { error: 'فقط مدیرِ کل.' };
    return { error: 'بازمحاسبه ناتمام ماند.' };
  }
}
