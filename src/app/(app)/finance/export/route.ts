import { currentActor } from '@/server/auth';
import { getLedger } from '@/server/finance/service';
import { ForbiddenError } from '@/domain/access/guard';
import { csvDocument } from '@/domain/access/office-scope';

/**
 * خروجیِ CSV دفترِ حسابداری — پورتِ اکشنِ `export_csv` صفحهٔ حسابداری.
 *
 * ⚠️ **همان فیلترِ روی صفحه** اعمال می‌شود: پارامترها عیناً همان‌هایی‌اند که
 * جدول با آنها ساخته شده. خروجی‌ای که با چیزی که کاربر می‌بیند نخواند،
 * بدتر از نبودنش است.
 *
 * ⚠️ صفحه‌بندی برداشته می‌شود: کسی که «خروجی» می‌زند کلِ نتیجه را می‌خواهد،
 * نه ۵۰ ردیفِ صفحهٔ جاری.
 */
export async function GET(request: Request) {
  const actor = await currentActor();
  if (!actor) return new Response(null, { status: 403 });

  const params = new URL(request.url).searchParams;
  const accountId = Number(params.get('account') ?? 0);
  if (!Number.isInteger(accountId) || accountId <= 0) {
    return new Response(null, { status: 400 });
  }

  try {
    const data = await getLedger(actor, {
      accountId,
      from: params.get('from') || null,
      to: params.get('to') || null,
      tagId: Number(params.get('tag')) || null,
      projectId: Number(params.get('project')) || null,
      party: params.get('party') || null,
      page: 1,
      perPage: 10_000,
    });

    const csv = csvDocument(
      ['تاریخ', 'جهت', 'شرح', 'پروژه', 'پرداخت‌کننده', 'گیرنده', 'مبلغ', 'مبلغِ حساب', 'معادل یورو'],
      data.entries.map((e) => [
        e.entryDate,
        e.direction === 'in' ? 'ورودی' : 'خروجی',
        e.description,
        e.projectTitle ?? '',
        e.payerName ?? e.payerLabel ?? '',
        e.receiverName ?? e.receiverLabel ?? '',
        e.amount,
        e.amountAccount,
        e.amountEur ?? '',
      ]),
    );

    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        // نامِ فارسی طبقِ RFC 6266 کدگذاری می‌شود (R-FILE-11).
        'Content-Disposition':
          `attachment; filename="kabarza-ledger-${accountId}.csv"; filename*=UTF-8''${encodeURIComponent(`دفتر-${data.account.name}.csv`)}`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    if (error instanceof ForbiddenError) return new Response(null, { status: 403 });
    throw error;
  }
}
