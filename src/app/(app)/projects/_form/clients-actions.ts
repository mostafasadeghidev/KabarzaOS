'use server';

import { revalidatePath } from 'next/cache';
import { requireActor } from '@/server/auth';
import { setClients } from '@/server/projects/service';
import { ForbiddenError } from '@/domain/access/guard';

/** اقدامِ فرمِ کارفرمایان. گارد در سرویس است (R-ARCH-01). */

export interface ClientsFormState {
  error?: string;
  ok?: boolean;
  summary?: { added: number; removed: number };
}

export async function setClientsAction(
  _prev: ClientsFormState,
  formData: FormData,
): Promise<ClientsFormState> {
  const projectId = Number(formData.get('projectId'));
  if (!Number.isInteger(projectId) || projectId <= 0) return { error: 'پروژه معتبر نیست.' };

  const userIds = formData.getAll('clientId')
    .map((v) => Number(v))
    .filter((n) => Number.isInteger(n) && n > 0);

  try {
    const actor = await requireActor();
    const summary = await setClients(actor, projectId, userIds);
    revalidatePath(`/projects/${projectId}`);
    revalidatePath('/projects');
    return { ok: true, summary };
  } catch (error) {
    if (error instanceof ForbiddenError) return { error: 'اجازهٔ تغییرِ کارفرمایان ندارید.' };
    return { error: 'کارفرمایان ذخیره نشد.' };
  }
}
