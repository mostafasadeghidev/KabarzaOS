'use server';

import { requireActor } from '@/server/auth';
import { search, type SearchHit } from '@/server/search/service';

/** جستجوی پالتِ فرمان — گاردها در سرویس‌اند. */
export async function searchAction(query: string): Promise<SearchHit[]> {
  try {
    return await search(await requireActor(), query);
  } catch (error) {
    console.error('[search]', error);
    return [];
  }
}
