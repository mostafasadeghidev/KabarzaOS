'use server';

import { revalidatePath } from 'next/cache';
import { requireActor } from '@/server/auth';
import { createToken, revokeToken, TOKEN_MESSAGES, TokenError } from '@/server/mcp/tokens';
import { revokeGrant } from '@/server/mcp/oauth';

/** اقدام‌های توکنِ MCP — گارد در سرویس است (هر کس فقط توکنِ خودش). */

export interface McpTokenState {
  error?: string;
  /** متنِ توکنِ تازه — **فقط یک بار** به رابط می‌رسد. */
  token?: string;
}

function explain(error: unknown, fallback: string): string {
  return error instanceof TokenError ? TOKEN_MESSAGES[error.code] : fallback;
}

export async function createTokenAction(_prev: McpTokenState, formData: FormData): Promise<McpTokenState> {
  try {
    const { token } = await createToken(await requireActor(), {
      name: String(formData.get('name') ?? ''),
      scope: String(formData.get('scope') ?? 'read'),
    });
    revalidatePath('/profile');
    return { token };
  } catch (error) {
    return { error: explain(error, 'توکن ساخته نشد.') };
  }
}

/** قطعِ «اتصالِ وب» (OAuth) — فقط صاحبش؛ توکن‌هایش بی‌درنگ پاک می‌شوند. */
export async function revokeGrantAction(id: number): Promise<McpTokenState> {
  const ok = await revokeGrant(await requireActor(), id);
  revalidatePath('/profile');
  return ok ? {} : { error: 'اتصال پیدا نشد.' };
}

export async function revokeTokenAction(id: number): Promise<McpTokenState> {
  try {
    await revokeToken(await requireActor(), id);
    revalidatePath('/profile');
    return {};
  } catch (error) {
    return { error: explain(error, 'توکن باطل نشد.') };
  }
}
