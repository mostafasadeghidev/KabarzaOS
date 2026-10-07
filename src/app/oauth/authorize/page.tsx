import { redirect } from 'next/navigation';
import { currentSession } from '@/server/auth';
import { publicBrand } from '@/server/setup/public-brand';
import { PublicShell } from '@/components/public-shell';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { OAuthError, validateAuthorizeRequest } from '@/server/mcp/oauth';
import { parseScopes } from '@/domain/mcp/oauth';
import { primeTranslations, t } from '@/i18n/server';
import { pageTitle } from '@/i18n/page-title';
import { ConsentForm } from './consent-form';

export const generateMetadata = pageTitle('اتصالِ هوشِ مصنوعی');
export const dynamic = 'force-dynamic';

/**
 * `GET /oauth/authorize` — صفحهٔ «اجازه» ِ OAuth (۲.۸.۰).
 *
 * ⚠️ درخواستِ نامعتبر (اپِ ناشناخته، نشانیِ بازگشتِ ثبت‌نشده، بی‌PKCE) **به
 * هیچ نشانی‌ای بازهدایت نمی‌شود** — فقط پیامِ خطا؛ وگرنه این صفحه ابزارِ
 * بازهدایتِ باز می‌شد.
 * ⚠️ بی‌ورود ← صفحهٔ ورود با `next` و بازگشت به همین‌جا.
 */
export default async function AuthorizePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await primeTranslations();
  const q = await searchParams;
  const brand = await publicBrand();

  const p = {
    clientId: q.client_id ?? '',
    redirectUri: q.redirect_uri ?? '',
    codeChallenge: q.code_challenge ?? '',
    method: q.code_challenge_method ?? '',
    responseType: q.response_type ?? '',
  };
  let client;
  try {
    client = await validateAuthorizeRequest(p);
  } catch (error) {
    if (!(error instanceof OAuthError)) throw error;
    return (
      <PublicShell brand={brand}>
        <Alert variant="destructive">
          <AlertDescription>{t('درخواستِ اتصال معتبر نیست؛ از برنامهٔ هوشِ مصنوعی دوباره شروع کنید.')}</AlertDescription>
        </Alert>
      </PublicShell>
    );
  }

  const session = await currentSession();
  if (!session) {
    const self = `/oauth/authorize?${new URLSearchParams(Object.entries(q).filter((e): e is [string, string] => typeof e[1] === 'string')).toString()}`;
    redirect(`/login?next=${encodeURIComponent(self)}`);
  }

  const asked = parseScopes(q.scope);
  return (
    <PublicShell brand={brand}>
      <ConsentForm
        clientName={client.name}
        userName={session.name}
        defaultScope={asked.includes('write') ? 'write' : 'read'}
        hidden={{
          client_id: p.clientId,
          redirect_uri: p.redirectUri,
          code_challenge: p.codeChallenge,
          state: q.state ?? '',
        }}
      />
    </PublicShell>
  );
}
