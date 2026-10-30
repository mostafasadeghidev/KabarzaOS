'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireActor } from '@/server/auth';
import { ForbiddenError } from '@/domain/access/guard';
import type { EntryInput } from '@/domain/library/model';
import {
  deleteEntry, deleteLibraryMedia, forkForProject, getRevision, getSuggestionDiff, installOnProject, LIBRARY_MESSAGES,
  LibraryError, removeInstall, restoreRevision, reviewSuggestion, saveEntry, setEntryArchived, suggestEdit,
  updateInstall, withdrawSuggestion, type Snapshot, type SuggestionDiff,
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

/** ورودیِ فرم از JSON ِ فیلدِ پنهان — فرم آرایهٔ تکه‌کد، گزینه و گام دارد. */
function parsePayload(raw: FormDataEntryValue | null): EntryInput | null {
  try {
    const data = JSON.parse(String(raw ?? '')) as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === 'string' ? v : '');
    const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
    const ids = (v: unknown) => arr<unknown>(v).map(Number).filter((n) => Number.isInteger(n) && n >= 0);
    const id = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) && v > 0 ? v : null);
    return {
      kind: str(data.kind),
      title: str(data.title),
      summary: str(data.summary),
      platform: str(data.platform),
      status: str(data.status),
      category: str(data.category),
      versionLabel: str(data.versionLabel),
      topics: arr<unknown>(data.topics).map(str),
      body: str(data.body),
      warnings: str(data.warnings),
      dependencies: str(data.dependencies),
      instances: str(data.instances),
      demoUrl: str(data.demoUrl),
      videoUrl: str(data.videoUrl),
      cloneableUrl: str(data.cloneableUrl),
      changeNote: str(data.changeNote),
      clientVisible: data.clientVisible === true,
      originProjectId: id(data.originProjectId),
      blocks: arr<Record<string, unknown>>(data.blocks).map((b) => ({
        label: str(b.label), language: str(b.language), placement: str(b.placement),
        placementNote: str(b.placementNote), code: str(b.code),
      })),
      options: arr<Record<string, unknown>>(data.options).map((o) => ({
        name: str(o.name), kind: str(o.kind), role: str(o.role), description: str(o.description), value: str(o.value),
        defaultValue: str(o.defaultValue), element: str(o.element), target: str(o.target), important: str(o.important),
        example: str(o.example),
        allowedValues: arr<Record<string, unknown>>(o.allowedValues).map((a) => ({ value: str(a?.value), description: str(a?.description) })),
      })),
      steps: arr<Record<string, unknown>>(data.steps).map((s) => ({
        key: str(s.key).replace(/[^0-9a-z-]/gi, '').slice(0, 40),
        title: str(s.title),
        body: str(s.body),
        blockIndexes: ids(s.blockIndexes),
        optionNames: arr<unknown>(s.optionNames).map(str),
        mediaIds: ids(s.mediaIds).filter((n) => n > 0),
      })),
      related: arr<Record<string, unknown>>(data.related)
        .map((r) => ({ id: Number(r.id), note: str(r.note) }))
        .filter((r) => Number.isInteger(r.id) && r.id > 0),
      requiresIds: ids(data.requiresIds).filter((n) => n > 0),
      replacesId: id(data.replacesId),
      coverMediaId: id(data.coverMediaId),
    };
  } catch {
    return null;
  }
}

/** تصویرهای تازهٔ هر گام — فیلدِ `stepmedia-<key>` ِ همان گام (`StepsEditor`). */
async function stepMediaFrom(formData: FormData, input: EntryInput) {
  const out: Record<string, Awaited<ReturnType<typeof mediaFrom>>> = {};
  for (const s of input.steps) {
    if (!s.key) continue;
    const files = await mediaFrom(formData, `stepmedia-${s.key}`);
    if (files.length > 0) out[s.key] = files;
  }
  return out;
}

export async function saveEntryAction(_prev: LibraryState, formData: FormData): Promise<LibraryState> {
  const input = parsePayload(formData.get('payload'));
  if (!input) return { error: 'فرم خوانده نشد؛ دوباره امتحان کنید.' };
  const rawId = Number(formData.get('id'));
  const id = Number.isInteger(rawId) && rawId > 0 ? rawId : null;
  let saved: number;
  try {
    const media = await mediaFrom(formData);
    saved = await saveEntry(await requireActor(), id, input, media, await stepMediaFrom(formData, input));
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
  let added: number;
  try {
    added = await installOnProject(await requireActor(), entryId, projectId, note, valuesNote);
  } catch (error) {
    return { error: explain(error, 'ثبت نشد.') };
  }
  refresh(entryId, projectId);
  return { message: added > 0 ? 'روی پروژه ثبت شد؛ پیش‌نیازهایش هم نصب شدند.' : 'روی پروژه ثبت شد.' };
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

/* ---------- پیشنهادِ ویرایش (۲.۴۶.۰) ---------- */

export async function suggestEditAction(_prev: LibraryState, formData: FormData): Promise<LibraryState> {
  const input = parsePayload(formData.get('payload'));
  const id = Number(formData.get('id'));
  if (!input || !Number.isInteger(id) || id <= 0) return { error: 'فرم خوانده نشد؛ دوباره امتحان کنید.' };
  try {
    await suggestEdit(await requireActor(), id, input, String(formData.get('note') ?? ''));
  } catch (error) {
    return { error: explain(error, 'فرستاده نشد.') };
  }
  refresh(id);
  redirect(`/library/${id}?suggested=1`);
}

export async function suggestionDiffAction(suggestionId: number): Promise<{ diff?: SuggestionDiff; error?: string }> {
  try {
    return { diff: await getSuggestionDiff(await requireActor(), suggestionId) };
  } catch (error) {
    return { error: explain(error, 'پیدا نشد.') };
  }
}

export async function reviewSuggestionAction(
  suggestionId: number, decision: 'accept' | 'reject', note: string,
): Promise<LibraryState> {
  let entryId: number;
  try {
    entryId = await reviewSuggestion(await requireActor(), suggestionId, decision, note);
  } catch (error) {
    return { error: explain(error, 'انجام نشد.') };
  }
  refresh(entryId);
  return { message: decision === 'accept' ? 'پیشنهاد پذیرفته و اعمال شد.' : 'پیشنهاد رد شد.' };
}

export async function withdrawSuggestionAction(suggestionId: number): Promise<LibraryState> {
  let entryId: number;
  try {
    entryId = await withdrawSuggestion(await requireActor(), suggestionId);
  } catch (error) {
    return { error: explain(error, 'انجام نشد.') };
  }
  refresh(entryId);
  return { message: 'پیشنهاد پس گرفته شد.' };
}
