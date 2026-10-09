import { describe, it, expect, beforeAll } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { db, sql } from '../client';
import { currencies, userRoles, users } from '../schema';
import { listAccounts, saveAccount, type AccountInput } from '@/server/finance/service';
import { AccountError } from '@/domain/finance/accounts';
import { authenticateToken, createToken } from '@/server/mcp/tokens';
import { buildMcpServer } from '@/server/mcp/server';
import type { Actor } from '@/domain/access/permissions';

/**
 * مشخصاتِ بانکیِ حساب (۲.۱۸.۰): شماره‌ها یکدست و سنجیده ذخیره می‌شوند، و به
 * ارائه‌دهندهٔ هوشِ مصنوعی (ابزارِ finance_accounts) نمی‌روند.
 */

let OWNER = 0, CUR = 0;
const owner = (): Actor => ({ id: OWNER, roles: ['owner'], permissions: [], privateAccess: true });
const base = (): AccountInput => ({
  id: null, name: 'حسابِ بانکی', type: 'business', officeId: null, currencyId: CUR, openingBalance: '0',
  note: '', sortOrder: 0, isActive: true, scope: 'company', accountantIds: [],
});

beforeAll(async () => {
  await sql`truncate table api_keys, ledger, account_users, accounts, user_roles, audit_log, users restart identity cascade`;
  const [u] = await db.insert(users).values({ email: 'o@bank', name: 'مالک' }).returning({ id: users.id });
  OWNER = u!.id;
  await db.insert(userRoles).values({ userId: OWNER, role: 'owner' });
  const [c] = await sql<Array<{ id: number }>>`select id from currencies order by id limit 1`;
  CUR = c?.id ?? (await db.insert(currencies).values({ code: 'TST', name: 'Test', symbol: 'T' }).returning({ id: currencies.id }))[0]!.id;
});

describe('مشخصاتِ بانکی', () => {
  it('یکدست ذخیره می‌شود: بی‌فاصله، ارقامِ لاتین، IBAN بزرگ', async () => {
    const id = await saveAccount(owner(), {
      ...base(), bankName: ' بانک ', holderName: 'شرکت', accountNumber: '۰۱۲۳-۴۵',
      cardNumber: '4111 1111 1111 1111', iban: 'de89 3704 0044 0532 0130 00',
    });
    const row = (await listAccounts(owner())).find((a) => a.id === id)!;
    expect(row).toMatchObject({ bankName: 'بانک', accountNumber: '0123-45', cardNumber: '4111111111111111', iban: 'DE89370400440532013000' });
  });

  it('IBAN و کارتِ با رقمِ کنترلیِ اشتباه رد می‌شوند', async () => {
    await expect(saveAccount(owner(), { ...base(), iban: 'DE88370400440532013000' })).rejects.toBeInstanceOf(AccountError);
    await expect(saveAccount(owner(), { ...base(), cardNumber: '4111111111111112' })).rejects.toBeInstanceOf(AccountError);
  });

  it('ابزارِ هوشِ مصنوعی شماره‌ها را نمی‌دهد', async () => {
    const { token } = await createToken(owner(), { name: 'bank', scope: 'read' });
    const auth = await authenticateToken(token);
    if (!auth.ok) throw new Error('auth');
    const server = buildMcpServer(auth.session);
    const [c, s] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 't', version: '1' });
    await Promise.all([server.connect(s), client.connect(c)]);
    const r = await client.callTool({ name: 'finance_accounts', arguments: {} }) as { content: Array<{ text: string }> };
    const text = r.content.map((x) => x.text).join('');
    expect(text).toContain('حسابِ بانکی');
    expect(text).not.toContain('4111111111111111');
    expect(text).not.toContain('DE89370400440532013000');
  });
});
