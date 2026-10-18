'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireActor } from '@/server/auth';
import { ForbiddenError } from '@/domain/access/guard';
import type { EntryInput } from '@/domain/library/model';
import {
  deleteEntry, deleteLibraryMedia, forkForProject, getRevision, installOnProject, LIBRARY_MESSAGES, LibraryError,
  removeInstall, restoreRevision, saveEntry, setEntryArchived, updateInstall, type Snapshot,
} from '@/server/library/service';
import { mediaError, mediaFrom } from '../../projects/_form/media-form';

/** اقدام‌های کتابخانهٔ کد و راهنما (۲.۳۷.۰). گاردها در سرویس‌اند (R-ARCH-01). */

export interface LibraryState {
  error?: string;
  message?: string;
}

function explain(error: unknown, fallback: string): string {
  if (error instanceof LibraryError) return LIBRARY_MESSAGES[error.code];
  if (error instanceof ForbiddenError) return 'اجازهٔ این کار را ندارید.';
  return mediaError(error) ?? fallback;
}

function refresh(entryId?: number, projectId?: number | null) {
  revalidatePath('/library');
  if (entryId) revalidatePath(`/library/${entryId}`);
  if (projectId) revalidatePath(`/projects/${projectId}`);
}

/** ورودیِ فرم از JSON ِ فیلدِ پنهان — فرم آرایهٔ تکه‌کد و گزینه دارد. */
function parsePayload(raw: FormDataEntryValue | null): EntryInput | null {
  try {
    const data = JSON.parse(String(raw ?? '')) as Partial<EntryInput>;
    const str = (v: unknown) => (typeof v === 'string' ? v : '');
    const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
    return {
      kind: str(data.kind),
      title: str(data.title),
      summary: str(data.summary),
      platform: str(data.platform),
      status: str(data.status),
      topics: arr<unknown>(data.topics).map(str),
      body: str(data.body),
      steps: str(data.steps),
      warnings: str(data.warnings),
      dependencies: str(data.dependencies),
      demoUrl: str(data.demoUrl),
      clientVisible: data.clientVisible === true,
      originProjectId: typeof data.originProjectId === 'number' ? data.originProjectId : null,
      blocks: arr<Record<string, unknown>>(data.blocks).map((b) => ({
        label: str(b.label), language: str(b.language), placement: str(b.placement),
        placementNote: str(b.placementNote), code: str(b.code),
      })),
      options: arr<Record<string, unknown>>(data.options).map((o) => ({
        name: str(o.name), kind: str(o.kind), description: str(o.description), defaultValue: str(o.defaultValue),
      })),
      relatedIds: arr<unknown>(data.relatedIds).map(Number).filter((n) => Number.isInteger(n) && n > 0),
    };
  } catch {
    return null;
  }
}

export async function saveEntryAction(_prev: LibraryState, formData: FormData): Promise<LibraryState> {
  const input = parsePayload(formData.get('payload'));
  if (!input) return { error: 'فرم خوانده نشد؛ دوباره امتحان کنید.' };
  const rawId = Number(formData.get('id'));
  const id = Number.isInteger(rawId) && rawId > 0 ? rawId : null;
  let saved: number;
  try {
    const media = await mediaFrom(formData);
    saved = await saveEntry(await requireActor(), id, input, media);
  } catch (error) {
    return { error: explain(error, 'ذخیره نشد.') };
  }
  refresh(saved, input.originProjectId);
  // ⚠️ redirect بیرون از try: خودش با پرتابِ خطا کار می‌کند.
  redirect(`/library/${saved}?saved=1`);
}

export async function setArchivedAction(id: number, archived: boolean): Promise<LibraryState> {
  try {
    await setEntryArchived(await requireActor(), id, archived);
  } catch (error) {
    return { error: explain(error, 'انجام نشد.') };
  }
  refresh(id);
  return { message: archived ? 'بایگانی شد.' : 'از بایگانی درآمد.' };
}

export async function deleteEntryAction(id: number): Promise<LibraryState> {
  try {
    await deleteEntry(await requireActor(), id);
  } catch (error) {
    return { error: explain(error, 'حذف نشد.') };
  }
  refresh();
  redirect('/library');
}

export async function deleteMediaAction(entryId: number, attachmentId: number): Promise<LibraryState> {
  try {
    await deleteLibraryMedia(await requireActor(), attachmentId);
  } catch (error) {
    return { error: explain(error, 'حذف نشد.') };
  }
  refresh(entryId);
  return {};
}

export async function installAction(
  entryId: number, projectId: number, note: string, valuesNote: string,
): Promise<LibraryState> {
  try {
    await installOnProject(await requireActor(), entryId, projectId, note, valuesNote);
  } catch (error) {
    return { error: explain(error, 'ثبت نشد.') };
  }
  refresh(entryId, projectId);
  return { message: 'روی پروژه ثبت شد.' };
}

export async function updateInstallAction(
  entryId: number, projectId: number, installId: number, note: string, valuesNote: string,
): Promise<LibraryState> {
  try {
    await updateInstall(await requireActor(), installId, note, valuesNote);
  } catch (error) {
    return { error: explain(error, 'ذخیره نشد.') };
  }
  refresh(entryId, projectId);
  return { message: 'ذخیره شد.' };
}

export async function removeInstallAction(entryId: number, projectId: number, installId: number): Promise<LibraryState> {
  try {
    await removeInstall(await requireActor(), installId);
  } catch (error) {
    return { error: explain(error, 'برداشته نشد.') };
  }
  refresh(entryId, projectId);
  return { message: 'از پروژه برداشته شد.' };
}

export async function forkAction(entryId: number, projectId: number): Promise<LibraryState> {
  let forkId: number;
  try {
    forkId = await forkForProject(await requireActor(), entryId, projectId);
  } catch (error) {
    return { error: explain(error, 'نسخه ساخته نشد.') };
  }
  refresh(entryId, projectId);
  redirect(`/library/${forkId}/edit?forked=1`);
}

export async function restoreRevisionAction(entryId: number, revisionId: number): Promise<LibraryState> {
  try {
    await restoreRevision(await requireActor(), entryId, revisionId);
  } catch (error) {
    return { error: explain(error, 'بازگردانده نشد.') };
  }
  refresh(entryId);
  return { message: 'این نسخه بازگردانده شد.' };
}

export async function revisionAction(entryId: number, revisionId: number): Promise<{ snapshot?: Snapshot; error?: string }> {
  try {
    return { snapshot: await getRevision(await requireActor(), entryId, revisionId) };
  } catch (error) {
    return { error: explain(error, 'پیدا نشد.') };
  }
}
