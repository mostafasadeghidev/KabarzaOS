'use server';

import { requireActor } from '@/server/auth';
import { createAuthCode, OAuthError, pruneCodes, validateAuthorizeRequest } from '@/server/mcp/oauth';
import { isScope } from '@/domain/mcp/tokens';

/**
 * پاسخِ کاربر در صفحهٔ «اجازه» (۲.۸.۰).
 *
 * ⚠️ نشانیِ بازگشت **دوباره** با ثبتِ اپ سنجیده می‌شود — فرم دست‌کاری‌پذیر است.
 * ⚠️ بازهدایت در مرورگر انجام می‌شود (نه `redirect()` ِ سرور) تا طرحِ اختصاصیِ
 * برنامه‌ها (`cursor://`، `vscode://`) هم کار کند.
 */
export interface ConsentState {
  redirect?: string;
  error?: string;
}

function withParams(base: string, params: Record<string, string>): string {
  const url = new URL(base);
  for (const [k, v] of Object.entries(params)) if (v) url.searchParams.set(k, v);
  return url.toString();
}

export async function consentAction(_prev: ConsentState, form: FormData): Promise<ConsentState> {
  const clientId = String(form.get('client_id') ?? '');
  const redirectUri = String(form.get('redirect_uri') ?? '');
  const codeChallenge = String(form.get('code_challenge') ?? '');
  const state = String(form.get('state') ?? '');
  try {
    await validateAuthorizeRequest({ clientId, redirectUri, codeChallenge, method: 'S256', responseType: 'code' });
  } catch (error) {
    if (error instanceof OAuthError) return { error: 'درخواستِ اتصال معتبر نیست؛ از برنامهٔ هوشِ مصنوعی دوباره شروع کنید.' };
    throw error;
  }

  if (form.get('decision') !== 'allow') {
    return { redirect: withParams(redirectUri, { error: 'access_denied', state }) };
  }
  const actor = await requireActor();
  const scopeRaw = String(form.get('scope') ?? 'read');
  const code = await createAuthCode(actor, {
    clientId, redirectUri, codeChallenge, scope: isScope(scopeRaw) ? scopeRaw : 'read',
  });
  await pruneCodes();
  return { redirect: withParams(redirectUri, { code, state }) };
}
