import { and, desc, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  absences, accounts, availabilitySlots, currencies, ledger, projectMembers,
  projectClients, projectPayments, projects, timelogs, unitEntries, userRoles, users,
} from '@/db/schema';
import { type Actor } from '@/domain/access/permissions';
import { assertCanView, visibleScopes } from '@/domain/access/guard';
import { overallSummary, sumReportable } from '@/domain/reports/summary';

/**
 * فهرستِ scope برای SQL ِ خام.
 * ⚠️ `= any($1)` با آرایهٔ جاوااسکریپت کار نمی‌کند (drizzle هر عضو را یک پارامترِ
 * جدا می‌کند). مقادیر از خودِ کد می‌آیند و فقط دو حالت دارند، ولی باز هم از
 * فهرستِ سفید عبور می‌کنند تا هیچ‌وقت رشتهٔ دلخواه به SQL نرود.
 */
function scopeList(scopes: Array<'company' | 'private'>) {
  const safe = scopes.filter((s) => s === 'company' || s === 'private');
  return sql.raw(safe.map((s) => `'${s}'`).join(',') || `'company'`);
}

/**
 * گزارش‌ها.
 *
 * ⚠️ همهٔ جمع‌ها از ستون‌های **منجمدِ** `amount_eur` خوانده می‌شوند، نه با
 * تبدیلِ دوبارهٔ نرخ (R-FISCAL-08): گزارشِ پارسال نباید با نرخِ امروز عوض شود.
 */

export async function getOverall(actor: Actor) {
  assertCanView(actor, 'reports');
  const scopes = visibleScopes(actor);

  const [values, payments, agreed, minutes] = await Promise.all([
    // ارزشِ پروژه‌ها — از ستونِ منجمدِ پرداخت‌ها نمی‌آید، پس اینجا تبدیل لازم است.
    db.select({
      n: sql<number>`count(*)::int`,
      total: sql<string>`coalesce(sum(${projects.price}), 0)::text`,
    })
      .from(projects)
      .where(and(isNull(projects.deletedAt), inArray(projects.scope, scopes))),

    db.select({
      direction: projectPayments.direction,
      total: sql<string>`coalesce(sum(${projectPayments.amountEur}), 0)::text`,
    })
      .from(projectPayments)
      .innerJoin(projects, eq(projects.id, projectPayments.projectId))
      .where(inArray(projects.scope, scopes))
      .groupBy(projectPayments.direction),

    db.select({ total: sql<string>`coalesce(sum(${projectMembers.agreedAmount}), 0)::text` })
      .from(projectMembers)
      .innerJoin(projects, eq(projects.id, projectMembers.projectId))
      .where(inArray(projects.scope, scopes)),

    db.select({ total: sql<number>`coalesce(sum(${timelogs.minutes}), 0)::int` })
      .from(timelogs)
      .innerJoin(projects, eq(projects.id, timelogs.projectId))
      .where(inArray(projects.scope, scopes)),
  ]);

  const by = new Map(payments.map((p) => [p.direction, p.total]));

  return overallSummary({
    totalValue: values[0]?.total ?? '0',
    billableExpenses: by.get('project_expense') ?? '0',
    clientPaid: by.get('incoming') ?? '0',
    memberAgreed: agreed[0]?.total ?? '0',
    memberPaid: by.get('member_payout') ?? '0',
    projectCount: values[0]?.n ?? 0,
    minutes: minutes[0]?.total ?? 0,
  });
}

/** گزارشِ اعضا — توافقی، پرداختی، مانده و ساعتِ کاری. */
export async function getMembersReport(actor: Actor) {
  assertCanView(actor, 'reports');
  const scopes = scopeList(visibleScopes(actor));

  const rows = await db.execute(sql`
    select
      u.id, u.name,
      coalesce(agreed.total, 0)::text as agreed,
      coalesce(paid.total, 0)::text   as paid,
      coalesce(hours.minutes, 0)::int as minutes
    from users u
    left join (
      select pm.user_id, sum(pm.agreed_amount) as total
      from project_members pm
      join projects p on p.id = pm.project_id and p.scope in (${scopes})
      group by pm.user_id
    ) agreed on agreed.user_id = u.id
    left join (
      select pp.user_id, sum(pp.amount_eur) as total
      from project_payments pp
      join projects p on p.id = pp.project_id and p.scope in (${scopes})
      where pp.direction = 'member_payout'
      group by pp.user_id
    ) paid on paid.user_id = u.id
    left join (
      select t.user_id, sum(t.minutes) as minutes
      from timelogs t
      join projects p on p.id = t.project_id and p.scope in (${scopes})
      group by t.user_id
    ) hours on hours.user_id = u.id
    where u.deleted_at is null
      and (agreed.total is not null or paid.total is not null or hours.minutes is not null)
    order by u.name
  `);

  return (rows as unknown as Array<{
    id: number; name: string; agreed: string; paid: string; minutes: number;
  }>).map((r) => ({
    ...r,
    minutes: Number(r.minutes),
    remaining: Math.max(0, Number(r.agreed) - Number(r.paid)).toFixed(2),
  }));
}

/** مطالباتِ کارفرما — به‌ازای هر پروژه. */
/**
 * مطالبات به تفکیکِ **کارفرما** — نه به تفکیکِ پروژه.
 *
 * ⚠️ واحدِ این گزارش شخص است، چون سؤالش «از چه کسی چقدر طلب داریم؟» است.
 * ریزِ پروژه‌به‌پروژه در صفحهٔ خودِ کارفرما می‌آید (`getClientDetail`).
 *
 * ⚠️ پروژه‌ای که **چند کارفرما** دارد، بدهی‌اش برای هرکدام کامل شمرده
 * می‌شود — همان کاری که نسخهٔ قبلی می‌کند. مسئولیت مشترک است، نه تقسیم‌شده.
 */
export async function getClientsReport(actor: Actor) {
  assertCanView(actor, 'reports');
  const scopes = scopeList(visibleScopes(actor));

  const rows = await db.execute(sql`
    select
      u.id, u.name,
      count(distinct p.id)::int             as project_count,
      coalesce(sum(p.price), 0)::text       as price,
      coalesce(sum(pay.billable), 0)::text  as expenses,
      coalesce(sum(pay.incoming), 0)::text  as paid
    from project_clients pc
    join users u on u.id = pc.user_id
    join projects p on p.id = pc.project_id
    left join (
      select project_id,
        sum(amount_eur) filter (where direction = 'incoming')        as incoming,
        sum(amount_eur) filter (where direction = 'project_expense') as billable
      from project_payments group by project_id
    ) pay on pay.project_id = p.id
    where p.deleted_at is null and p.scope in (${scopes}) and u.deleted_at is null
    group by u.id, u.name
    order by u.name
  `);

  return (rows as unknown as Array<{
    id: number; name: string; project_count: number;
    price: string; expenses: string; paid: string;
  }>).map((r) => ({
    id: r.id,
    name: r.name,
    projectCount: r.project_count,
    price: r.price,
    expenses: r.expenses,
    paid: r.paid,
    due: Math.max(0, Number(r.price) + Number(r.expenses) - Number(r.paid)).toFixed(2),
  }));
}

/**
 * هزینه‌ها از دفترکل.
 * ⚠️ R-LEDGER-06 — ردیف‌های انتقالِ داخلی کنار گذاشته می‌شوند.
 */
export async function getExpensesReport(actor: Actor) {
  assertCanView(actor, 'reports');

  const rows = await db
    .select({
      direction: ledger.direction,
      transferGroup: ledger.transferGroup,
      amountEur: ledger.amountEur,
      entryDate: ledger.entryDate,
      description: ledger.description,
      accountName: accounts.name,
    })
    .from(ledger)
    .leftJoin(accounts, eq(accounts.id, ledger.accountId))
    .where(inArray(accounts.scope, visibleScopes(actor)))
    .orderBy(ledger.entryDate);

  return {
    totalIn: sumReportable(rows, 'in'),
    totalOut: sumReportable(rows, 'out'),
    // فقط ردیف‌های گزارش‌پذیر به UI می‌روند تا جدول با جمع نخواند.
    rows: rows.filter((r) => !r.transferGroup),
  };
}

/** نقدینگی — ماندهٔ هر حساب. */
export async function getAccountsReport(actor: Actor) {
  assertCanView(actor, 'reports');

  const rows = await db.execute(sql`
    select
      a.id, a.name, c.code as currency_code, a.opening_balance::text as opening,
      coalesce(sum(case when l.direction = 'in'  then l.amount_account else 0 end), 0)::text as total_in,
      coalesce(sum(case when l.direction = 'out' then l.amount_account else 0 end), 0)::text as total_out
    from accounts a
    left join currencies c on c.id = a.currency_id
    left join ledger l on l.account_id = a.id
    where a.scope in (${scopeList(visibleScopes(actor))})
    group by a.id, a.name, c.code, a.opening_balance
    order by a.sort_order, a.name
  `);

  return (rows as unknown as Array<{
    id: number; name: string; currency_code: string | null;
    opening: string; total_in: string; total_out: string;
  }>).map((r) => ({
    id: r.id,
    name: r.name,
    currencyCode: r.currency_code,
    opening: r.opening,
    totalIn: r.total_in,
    totalOut: r.total_out,
    balance: (Number(r.opening) + Number(r.total_in) - Number(r.total_out)).toFixed(2),
  }));
}

/** ساعتِ کاری به تفکیکِ پروژه. */
export async function getHoursReport(actor: Actor) {
  assertCanView(actor, 'reports');

  return db
    .select({
      projectId: projects.id,
      title: projects.title,
      minutes: sql<number>`coalesce(sum(${timelogs.minutes}), 0)::int`,
    })
    .from(timelogs)
    .innerJoin(projects, eq(projects.id, timelogs.projectId))
    .where(inArray(projects.scope, visibleScopes(actor)))
    .groupBy(projects.id, projects.title)
    .orderBy(projects.title);
}

export { currencies, users, isNull };

/**
 * گزارشِ پروژه‌ها — قیمت، دریافتی، مطالبات، هزینهٔ اعضا و سود.
 *
 * ⚠️ «سود» = قیمت + هزینهٔ قابلِ‌صورتحساب − دریافتیِ اعضا − هزینه‌ها. هزینهٔ
 * **جذب‌شده** (`project_cost`) از سود کم می‌شود ولی به مطالبات اضافه نمی‌شود؛
 * تفاوتشان دقیقاً همان چیزی است که جهتِ چهارم برایش وجود دارد.
 */
export async function getProjectsReport(actor: Actor) {
  assertCanView(actor, 'reports');
  const scopes = scopeList(visibleScopes(actor));

  const rows = await db.execute(sql`
    select
      p.id, p.title, p.price::text as price,
      t.name as status_name, t.color as status_color,
      coalesce(pay.incoming, 0)::text        as client_paid,
      coalesce(pay.billable, 0)::text        as billable_expenses,
      coalesce(pay.absorbed, 0)::text        as absorbed_costs,
      coalesce(pay.member_paid, 0)::text     as member_paid,
      coalesce(mins.total, 0)::int           as minutes
    from projects p
    left join tags t on t.id = p.status_tag_id
    left join (
      select project_id,
        sum(amount_eur) filter (where direction = 'incoming')        as incoming,
        sum(amount_eur) filter (where direction = 'project_expense') as billable,
        sum(amount_eur) filter (where direction = 'project_cost')    as absorbed,
        sum(amount_eur) filter (where direction = 'member_payout')   as member_paid
      from project_payments group by project_id
    ) pay on pay.project_id = p.id
    left join (
      select project_id, sum(minutes) as total from timelogs group by project_id
    ) mins on mins.project_id = p.id
    where p.deleted_at is null and p.scope in (${scopes})
    order by p.title
  `);

  return (rows as unknown as Array<{
    id: number; title: string; price: string;
    status_name: string | null; status_color: string | null;
    client_paid: string; billable_expenses: string; absorbed_costs: string;
    member_paid: string; minutes: number;
  }>).map((r) => {
    const billed = Number(r.price) + Number(r.billable_expenses);
    const profit = billed - Number(r.member_paid) - Number(r.billable_expenses)
      - Number(r.absorbed_costs);

    return {
      id: r.id,
      title: r.title,
      statusName: r.status_name,
      statusColor: r.status_color,
      price: r.price,
      clientPaid: r.client_paid,
      clientDue: Math.max(0, billed - Number(r.client_paid)).toFixed(2),
      memberPaid: r.member_paid,
      profit: profit.toFixed(2),
      minutes: r.minutes,
    };
  });
}

/**
 * کارکردِ تعدادی به تفکیکِ عضو — پرداخت‌شده و پرداخت‌نشده.
 * ⚠️ عضوی که هیچ ردیفِ تعدادی ندارد اصلاً نمی‌آید؛ جدولی پر از صفر خوانا نیست.
 */
export async function getUnitsReport(actor: Actor) {
  assertCanView(actor, 'reports');

  const rows = await db
    .select({
      userId: unitEntries.userId,
      name: users.name,
      paid: sql<string>`coalesce(sum(${unitEntries.amount}) filter (where ${unitEntries.status} = 'paid'), 0)::text`,
      unpaid: sql<string>`coalesce(sum(${unitEntries.amount}) filter (where ${unitEntries.status} <> 'paid'), 0)::text`,
    })
    .from(unitEntries)
    .innerJoin(users, eq(users.id, unitEntries.userId))
    .groupBy(unitEntries.userId, users.name)
    .orderBy(users.name);

  return rows.map((r) => ({
    ...r,
    total: (Number(r.paid) + Number(r.unpaid)).toFixed(2),
  }));
}

/**
 * حضور و مرخصی — مرخصی‌های ثبت‌شده و اعضایی که **برنامهٔ هفتگی نداده‌اند**.
 *
 * ⚠️ فهرستِ دومی مهم‌تر از اولی است: مرخصی را همه ثبت می‌کنند، ولی نداشتنِ
 * برنامه بی‌سروصدا می‌ماند و همان است که «کِی در دسترس است؟» را بی‌جواب
 * می‌گذارد.
 */
export async function getAttendanceReport(actor: Actor) {
  assertCanView(actor, 'reports');

  const [leaves, scheduled, members] = await Promise.all([
    db.select({
      userId: absences.userId,
      name: users.name,
      fromDate: absences.fromDate,
      toDate: absences.toDate,
      note: absences.note,
    })
      .from(absences)
      .innerJoin(users, eq(users.id, absences.userId))
      .orderBy(sql`${absences.fromDate} desc`),
    db.selectDistinct({ userId: availabilitySlots.userId }).from(availabilitySlots),
    db.selectDistinct({ id: users.id, name: users.name })
      .from(users)
      .innerJoin(userRoles, eq(userRoles.userId, users.id))
      .where(and(
        eq(userRoles.role, 'member'),
        eq(users.memberState, 'active'),
        isNull(users.deletedAt),
      ))
      .orderBy(users.name),
  ]);

  const hasSchedule = new Set(scheduled.map((s) => s.userId));
  return {
    leaves,
    withoutSchedule: members.filter((m) => !hasSchedule.has(m.id)),
  };
}

/**
 * ریزِ کارِ یک عضو — پروژه‌به‌پروژه با مبلغِ توافقی، پرداختی و ردیف‌های پرداخت.
 *
 * ⚠️ هر ردیف در ارزِ **خودِ پروژه** است، ولی جمع‌ها در ارزِ پایه — چون جمعِ
 * دو ارزِ متفاوت بی‌معناست. همان کاری که نسخهٔ قبلی با
 * پیش از جمع می‌کند.
 */
export async function getMemberDetail(actor: Actor, userId: number) {
  assertCanView(actor, 'reports');

  const [person] = await db.select({ id: users.id, name: users.name, email: users.email })
    .from(users).where(eq(users.id, userId));
  if (!person) return null;

  /**
   * ⚠️ ردیف‌های عضویت **پیش از** پیوستن جمع می‌شوند، نه با `sum(distinct)`:
   * یک نفر می‌تواند در یک پروژه چند نقش داشته باشد، و اگر مبلغِ دو نقش
   * اتفاقاً برابر باشد `distinct` یکی‌شان را می‌بلعد و توافقی کمتر از
   * واقعیت گزارش می‌شود.
   */
  const rows = await db.execute(sql`
    select
      p.id as project_id, p.title, p.currency_id,
      c.code as currency_code,
      coalesce(mem.agreed, 0)::text     as agreed,
      coalesce(paid.total, 0)::text     as paid,
      coalesce(paid.total_eur, 0)::text as paid_eur,
      coalesce(mins.total, 0)::int      as minutes
    from (
      select project_id, sum(agreed_amount) as agreed
      from project_members
      where user_id = ${userId}
      group by project_id
    ) mem
    join projects p on p.id = mem.project_id
    left join currencies c on c.id = p.currency_id
    left join (
      select project_id,
        sum(coalesce(amount_settled, amount)) as total,
        sum(amount_eur) as total_eur
      from project_payments
      where direction = 'member_payout' and user_id = ${userId}
      group by project_id
    ) paid on paid.project_id = p.id
    left join (
      select project_id, sum(minutes) as total
      from timelogs where user_id = ${userId}
      group by project_id
    ) mins on mins.project_id = p.id
    where p.deleted_at is null
    order by p.title
  `);

  const projectRows = (rows as unknown as Array<{
    project_id: number; title: string; currency_code: string | null;
    agreed: string; paid: string; paid_eur: string; minutes: number;
  }>).map((r) => {
    const agreed = Number(r.agreed);
    const paid = Number(r.paid);
    return {
      projectId: r.project_id,
      title: r.title,
      currencyCode: r.currency_code,
      agreed: r.agreed,
      paid: r.paid,
      remaining: Math.max(0, agreed - paid).toFixed(2),
      // ⚠️ همان سه‌حالتی نسخهٔ قبلی؛ «تسویه» یعنی پرداختی به توافقی رسیده.
      status: paid <= 0 ? 'unpaid' : (agreed > 0 && paid + 0.001 >= agreed ? 'paid' : 'partial'),
      minutes: r.minutes,
    };
  });

  const lines = await db
    .select({
      projectId: projectPayments.projectId,
      amount: projectPayments.amount,
      amountSettled: projectPayments.amountSettled,
      paidAt: projectPayments.paidAt,
      note: projectPayments.note,
    })
    .from(projectPayments)
    .where(and(
      eq(projectPayments.userId, userId),
      eq(projectPayments.direction, 'member_payout'),
    ))
    .orderBy(projectPayments.paidAt);

  return { person, projects: projectRows, lines };
}

/** ریزِ مطالباتِ یک کارفرما — پروژه‌به‌پروژه با دریافتی و مانده. */
export async function getClientDetail(actor: Actor, userId: number) {
  assertCanView(actor, 'reports');

  const [person] = await db.select({ id: users.id, name: users.name, email: users.email })
    .from(users).where(eq(users.id, userId));
  if (!person) return null;

  const rows = await db.execute(sql`
    select
      p.id as project_id, p.title, p.price::text as price,
      coalesce(pay.incoming, 0)::text as paid,
      coalesce(pay.billable, 0)::text as expenses
    from project_clients pc
    join projects p on p.id = pc.project_id
    left join (
      select project_id,
        sum(amount_eur) filter (where direction = 'incoming')        as incoming,
        sum(amount_eur) filter (where direction = 'project_expense') as billable
      from project_payments group by project_id
    ) pay on pay.project_id = p.id
    where pc.user_id = ${userId} and p.deleted_at is null
    order by p.title
  `);

  const projectRows = (rows as unknown as Array<{
    project_id: number; title: string; price: string; paid: string; expenses: string;
  }>).map((r) => ({
    projectId: r.project_id,
    title: r.title,
    price: r.price,
    expenses: r.expenses,
    paid: r.paid,
    // R-TEAM-04 — بدهی = قیمت + هزینهٔ قابلِ‌صورتحساب − دریافتی.
    due: Math.max(0, Number(r.price) + Number(r.expenses) - Number(r.paid)).toFixed(2),
  }));

  return { person, projects: projectRows };
}

/**
 * ریزِ ساعتِ کاریِ یک عضو — پورتِ `hours-detail` / `hours-by-project` /
 * `hours-entries` نسخهٔ قبلی.
 *
 * ⚠️ دو نما در یک تابع، مثلِ نسخهٔ قبلی: بدونِ پروژهٔ انتخابی، جمعِ هر پروژه؛ با
 * پروژهٔ انتخابی، ریزِ روزبه‌روز. یک کوئری کمتر و یک مسیرِ کمتر.
 *
 * ⚠️ ساعتِ **عمومی** (پروژهٔ `null`) جدا شمرده می‌شود: کارِ اداری در جمعِ
 * پروژه‌ها گم می‌شد و کسی نمی‌فهمید چرا مجموع با جمعِ ستون نمی‌خواند.
 */
export async function getMemberHours(
  actor: Actor,
  userId: number,
  input: { from?: string | null; to?: string | null; projectId?: number | null } = {},
) {
  assertCanView(actor, 'reports');

  const [member] = await db.select({ id: users.id, name: users.name, email: users.email })
    .from(users).where(eq(users.id, userId));
  if (!member) return null;

  const window = [eq(timelogs.userId, userId)];
  if (input.from) window.push(gte(timelogs.logDate, input.from));
  if (input.to) window.push(lte(timelogs.logDate, input.to));

  const scoped = inArray(projects.scope, visibleScopes(actor));

  const [byProject, generalRow, entries] = await Promise.all([
    db.select({
      projectId: projects.id,
      title: projects.title,
      minutes: sql<number>`coalesce(sum(${timelogs.minutes}), 0)::int`,
    })
      .from(timelogs)
      .innerJoin(projects, eq(projects.id, timelogs.projectId))
      .where(and(...window, scoped))
      .groupBy(projects.id, projects.title)
      .orderBy(desc(sql`sum(${timelogs.minutes})`)),

    db.select({ minutes: sql<number>`coalesce(sum(${timelogs.minutes}), 0)::int` })
      .from(timelogs)
      .where(and(...window, isNull(timelogs.projectId))),

    // ریزِ ردیف‌ها فقط وقتی پروژه‌ای انتخاب شده.
    input.projectId
      ? db.select({
        id: timelogs.id,
        logDate: timelogs.logDate,
        minutes: timelogs.minutes,
        description: timelogs.description,
      })
        .from(timelogs)
        .innerJoin(projects, eq(projects.id, timelogs.projectId))
        .where(and(...window, scoped, eq(timelogs.projectId, input.projectId)))
        .orderBy(desc(timelogs.logDate), desc(timelogs.id))
      : Promise.resolve([]),
  ]);

  const general = generalRow[0]?.minutes ?? 0;
  const projectTotal = byProject.reduce((sum, r) => sum + r.minutes, 0);

  return {
    member,
    byProject,
    entries,
    totals: { project: projectTotal, general, all: projectTotal + general },
    selectedProject: input.projectId
      ? byProject.find((p) => p.projectId === input.projectId)?.title ?? null
      : null,
  };
}
