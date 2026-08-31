import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  company, currencies, projectClients, projectPayments, projects, users,
} from '@/db/schema';
import { canViewSection, type Actor } from '@/domain/access/permissions';
import { ForbiddenError, visibleScopes } from '@/domain/access/guard';
import {
  invoiceNumber, invoiceTotals, isIssuable, issuerName,
  type InvoiceLine,
} from '@/domain/finance/invoice';
import { getSystemConfig } from '@/server/settings/system-service';

/**
 * دادهٔ فاکتورِ یک پروژه.
 *
 * ⚠️ فاکتور سندِ **مالی** است: پشتِ مجوزِ مالی گارد می‌شود، نه صرفِ دسترسی
 * به پروژه. کارفرما هم فاکتورِ خودش را می‌بیند.
 */
export async function getInvoice(actor: Actor, projectId: number) {
  const rows = await db
    .select({
      id: projects.id,
      title: projects.title,
      price: projects.price,
      scope: projects.scope,
      regDate: projects.regDate,
      currencyCode: currencies.code,
    })
    .from(projects)
    .leftJoin(currencies, eq(currencies.id, projects.currencyId))
    .where(eq(projects.id, projectId));

  const project = rows[0];
  if (!project) throw new ForbiddenError('project.not_found');
  if (!visibleScopes(actor).includes(project.scope)) throw new ForbiddenError('project.forbidden');

  // مجوزِ مالی، یا کارفرمای همین پروژه.
  const clientRows = await db
    .select({ userId: projectClients.userId, name: users.name })
    .from(projectClients)
    .leftJoin(users, eq(users.id, projectClients.userId))
    .where(eq(projectClients.projectId, projectId))
    .orderBy(asc(projectClients.id));

  const isClient = clientRows.some((c) => c.userId === actor.id);
  if (!canViewSection(actor, 'finance') && !isClient) throw new ForbiddenError('finance.view');

  const payments = await db
    .select({
      direction: projectPayments.direction,
      amount: projectPayments.amount,
      amountSettled: projectPayments.amountSettled,
      paidAt: projectPayments.paidAt,
      note: projectPayments.note,
    })
    .from(projectPayments)
    .where(eq(projectPayments.projectId, projectId))
    .orderBy(asc(projectPayments.paidAt));

  // ⚠️ مبلغِ «تسویه‌شده» بر مبلغِ خام مقدم است — همان قاعدهٔ بقیهٔ جمع‌ها.
  const value = (p: (typeof payments)[number]) => Number(p.amountSettled ?? p.amount);
  /** تاریخِ پرداخت به رشتهٔ YYYY-MM-DD — روی سند ساعت معنا ندارد. */
  const day = (at: Date | string | null) =>
    at ? (typeof at === 'string' ? at.slice(0, 10) : at.toISOString().slice(0, 10)) : null;

  const expenses = payments.filter((p) => p.direction === 'project_expense');
  const incoming = payments.filter((p) => p.direction === 'incoming');

  const billable = expenses.reduce((sum, p) => sum + value(p), 0).toFixed(2);
  const paid = incoming.reduce((sum, p) => sum + value(p), 0).toFixed(2);

  const totals = invoiceTotals({
    price: project.price,
    billableExpenses: billable,
    paid,
  });

  const charges: InvoiceLine[] = [
    {
      description: 'قیمت ثبت‌شدهٔ پروژه',
      date: project.regDate,
      amount: Number(project.price).toFixed(2),
    },
    ...expenses.map((p) => ({
      description: p.note || 'هزینهٔ پروژه',
      date: day(p.paidAt),
      amount: value(p).toFixed(2),
    })),
  ];

  // ⚠️ نامِ برند پشتیبانِ نامِ شرکت است (`issuerName`)؛ فاکتورِ بی‌نام صادر نشود.
  const [issuerRows, system] = await Promise.all([
    db.select().from(company).where(eq(company.id, 1)),
    getSystemConfig(),
  ]);
  const issuer = issuerRows[0];

  return {
    number: invoiceNumber(projectId),
    issuedOn: new Date().toISOString().slice(0, 10),
    project: { id: project.id, title: project.title },
    currencyCode: project.currencyCode,
    clients: clientRows.map((c) => c.name).filter((n): n is string => Boolean(n)),
    charges,
    receipts: incoming.map((p) => ({
      description: p.note || 'پرداخت کارفرما',
      date: day(p.paidAt),
      amount: value(p).toFixed(2),
    })),
    totals,
    issuable: isIssuable({ hasClient: clientRows.length > 0, totalDue: totals.totalDue }),
    issuer: {
      name: issuerName(issuer?.name ?? '', system.brandName),
      address: issuer?.address ?? '',
      taxId: issuer?.taxId ?? '',
      email: issuer?.email ?? '',
      phone: issuer?.phone ?? '',
      website: issuer?.website ?? '',
      bank: issuer?.bank ?? '',
      footer: issuer?.invoiceFooter ?? '',
      /**
       * ⚠️ شناسهٔ فایل می‌رود، نه URL: بایت‌های فایل فقط از مسیرِ گیت‌شدهٔ
       * `/api/files/[id]` سِرو می‌شوند (D-009) و ساختنِ لینکِ مستقیم آن
       * گارد را دور می‌زد.
       */
      logoFileId: issuer?.logoFileId ?? null,
    },
  };
}

export { and };
