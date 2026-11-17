/**
 * صفِ آپلود در IndexedDB ِ مرورگر (۳.۱۰.۰) — تا آپلودِ نیمه‌کاره پس از تازه شدن یا بستنِ صفحه
 * (یا قطعیِ برق) هم ادامه پیدا کند. خودِ `File` در IndexedDB ذخیره‌پذیر است.
 *
 * ⚠️ هر ردیف مالِ یک کاربر است (`userId`): روی رایانهٔ مشترک، صفِ کسِ دیگری ادامه داده نمی‌شود.
 * ⚠️ هر خطای IndexedDB (پنجرهٔ خصوصی، فضای پر) بی‌صدا نادیده گرفته می‌شود — آپلود در همان صفحه
 * همچنان کار می‌کند؛ فقط ادامه پس از بستنِ صفحه از دست می‌رود.
 */

export interface StoredUpload {
  localId: string;
  userId: number;
  projectId: number;
  label: string;
  file: File;
  /** شناسهٔ جلسهٔ سرور — پس از شروع. */
  uploadId?: string;
  addedAt: number;
}

const DB = 'kz-uploads';
const STORE = 'items';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(STORE, { keyPath: 'localId' }); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  try {
    const db = await open();
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }).finally(() => db.close());
  } catch {
    return undefined;
  }
}

export const saveUpload = (item: StoredUpload) => run('readwrite', (s) => s.put(item));
export const removeUpload = (localId: string) => run('readwrite', (s) => s.delete(localId));
export async function loadUploads(userId: number): Promise<StoredUpload[]> {
  const all = (await run('readonly', (s) => s.getAll() as IDBRequest<StoredUpload[]>)) ?? [];
  return all.filter((i) => i.userId === userId).sort((a, b) => a.addedAt - b.addedAt);
}
