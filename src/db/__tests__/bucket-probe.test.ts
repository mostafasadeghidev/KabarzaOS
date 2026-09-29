import { describe, it, expect, afterAll, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, sql } from '../client';
import { schedulerStamps } from '../schema';
import { bucketCheck, cachedBucketCheck, recheckBucket } from '@/server/files/bucket-probe';
import { ensureBucket, getObject } from '@/server/files/storage';
import { ForbiddenError } from '@/domain/access/guard';
import type { Actor } from '@/domain/access/permissions';

/**
 * خودآزماییِ باکت روی MinIO ِ محلی — پورتِ `Private_Files::protection_status`.
 * ⚠️ باکتِ آزمون خصوصی است، پس جوابِ درست «protected» است.
 */

const owner: Actor = { id: 1, roles: ['owner'], permissions: [], privateAccess: true };
const member: Actor = { id: 2, roles: ['member'], permissions: [], privateAccess: false };

beforeEach(async () => {
  await ensureBucket();
  await db.delete(schedulerStamps).where(eq(schedulerStamps.key, 'files:bucket_probe'));
});

afterAll(async () => {
  await db.delete(schedulerStamps).where(eq(schedulerStamps.key, 'files:bucket_probe'));
  await sql.end();
});

describe('خودآزماییِ باکت', () => {
  it('باکتِ خصوصی «محافظت‌شده» است و نمونه پاک می‌شود', async () => {
    const check = await bucketCheck();
    expect(check.status).toBe('protected');
    await expect(getObject('.probe/probe.txt')).rejects.toThrow();
    expect((await cachedBucketCheck())?.status).toBe('protected');
  });

  it('نتیجهٔ تازه دوباره آزمون نمی‌شود', async () => {
    const first = await bucketCheck();
    const second = await bucketCheck();
    expect(second.checkedAt).toBe(first.checkedAt);
  });

  it('⚠️ «بررسی دوباره» فقط برای مالک', async () => {
    await expect(recheckBucket(member)).rejects.toBeInstanceOf(ForbiddenError);
    const again = await recheckBucket(owner);
    expect(again.status).toBe('protected');
  });
});
