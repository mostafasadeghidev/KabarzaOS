import { notFound, redirect } from 'next/navigation';
import { requireActor } from '@/server/auth';
import { findTaskByRef } from '@/server/projects/task-numbers';

/**
 * `/t/ALZ-325` (۲.۱۶.۰) — نشانیِ کوتاهِ هر تسک: پیوندِ کامنت‌ها، تلگرام و
 * جستجو. ⚠️ فقط اگر همین بیننده تسک را می‌بیند (و در آن پروژه فقط کارفرما
 * نیست)؛ وگرنه «یافت نشد» — نه «ممنوع»، تا وجودِ تسک لو نرود.
 */
export default async function TaskRefPage({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  const found = await findTaskByRef(await requireActor(), decodeURIComponent(ref));
  if (!found) notFound();
  redirect(`/projects/${found.projectId}?task=${found.number}`);
}
