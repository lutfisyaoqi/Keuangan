import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import express from 'express';
import session from 'express-session';
import { apiService } from '../services/apiService';
import { closeApiResources, createApiRouter, escapeCsvCell, validateTransactionInput } from '../../server/api';

test('transaction validation accepts missing receipts and rejects invalid receipt metadata', () => {
  const userId = '00000000-0000-4000-8000-000000000001';
  const transaction = {
    date: '2026-09-30',
    amount: 1_500_000,
    description: 'Pemasukan bulanan',
    type: 'income',
    category: 'Gaji',
  };
  assert.equal(validateTransactionInput(transaction, userId).success, true);
  assert.equal(validateTransactionInput({ ...transaction, receiptPath: '', receiptMime: '', receiptSize: '' }, userId).success, true);
  assert.equal(validateTransactionInput({ ...transaction, receiptPath: '' }, userId).success, true);
  assert.equal(validateTransactionInput({
    ...transaction,
    receiptPath: `${userId}/transaction/file.jpg`,
    receiptMime: 'application/pdf',
    receiptSize: 100,
  }, userId).success, false);
  assert.equal(validateTransactionInput({
    ...transaction,
    receiptPath: `${userId}/transaction/file.jpg`,
    receiptMime: 'image/jpeg',
    receiptSize: 5 * 1024 * 1024 + 1,
  }, userId).success, false);
  assert.equal(validateTransactionInput({
    ...transaction,
    receiptPath: '00000000-0000-4000-8000-000000000002/transaction/file.jpg',
    receiptMime: 'image/jpeg',
    receiptSize: 100,
  }, userId).success, false);
});

test('transaction service omits empty and default filters from the query string', async (context) => {
  context.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL) => {
    assert.equal(String(input), '/api/transactions?page=1&pageSize=20');
    return new Response(JSON.stringify({ transactions: [], total: 0 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });

  const result = await apiService.listTransactions({
    page: 1,
    pageSize: 20,
    search: '  ',
    type: 'all',
    category: '',
    startDate: ' ',
    endDate: 'undefined',
  });
  assert.deepEqual(result, { transactions: [], total: 0 });
});

test('receipt service uploads to the backend route with the image MIME and filename headers', async (context) => {
  const id = '00000000-0000-4000-8000-000000000003';
  const image = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], 'bukti.jpg', { type: 'image/jpeg' });
  context.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    assert.equal(String(input), `/api/transactions/${id}/receipt`);
    assert.equal(init?.method, 'POST');
    assert.equal(init?.credentials, 'same-origin');
    assert.equal(new Headers(init?.headers).get('content-type'), 'image/jpeg');
    assert.equal(new Headers(init?.headers).get('x-receipt-name'), 'bukti.jpg');
    assert.equal(init?.body, image);
    return new Response(JSON.stringify({ receiptPath: `${id}/receipt.jpg` }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  });

  await apiService.uploadTransactionReceipt(id, image);
});

test('auth validation and anonymous API requests fail safely', async (context) => {
  process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:5432/test';
  process.env.SUPABASE_URL = 'https://test-project.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'test-anon-key';
  process.env.AUTH_SECRET = 'test-session-secret-which-is-not-real';
  process.env.APP_URL = 'http://localhost:3000';
  process.env.NODE_ENV = 'test';

  const app = express();
  app.use(express.json());
  app.use('/api', createApiRouter({ sessionStore: new session.MemoryStore() }));
  const server = await new Promise<ReturnType<typeof app.listen>>((resolve, reject) => {
    const listeningServer = app.listen(0, '127.0.0.1', () => resolve(listeningServer));
    listeningServer.once('error', reject);
  });
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const baseUrl = `http://127.0.0.1:${address.port}/api`;

  context.after(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
    await closeApiResources();
  });

  const anonymousTransactions = await fetch(`${baseUrl}/transactions`);
  assert.equal(anonymousTransactions.status, 401);

  const anonymousMutation = await fetch(`${baseUrl}/transactions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: process.env.APP_URL ?? '' },
    body: JSON.stringify({ date: '2026-09-30', amount: 100, description: 'test', type: 'expense', category: 'Makanan', user_id: 'other-user' }),
  });
  assert.equal(anonymousMutation.status, 401);

  const invalidEmail = await fetch(`${baseUrl}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: process.env.APP_URL ?? '' },
    body: JSON.stringify({ name: 'Test User', email: 'not-an-email', password: 'password123', confirmPassword: 'password123' }),
  });
  assert.equal(invalidEmail.status, 400);

  const passwordMismatch = await fetch(`${baseUrl}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: process.env.APP_URL },
    body: JSON.stringify({ name: 'Test User', email: 'test@example.com', password: 'password123', confirmPassword: 'password456' }),
  });
  assert.equal(passwordMismatch.status, 400);

  const invalidLogin = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: process.env.APP_URL },
    body: JSON.stringify({ email: 'not-an-email', password: 'wrong-password' }),
  });
  assert.equal(invalidLogin.status, 401);
  assert.deepEqual(await invalidLogin.json(), { error: 'Email atau password salah.' });
});

test('server refuses example Supabase URL and placeholder anon key', () => {
  process.env.DATABASE_URL = 'postgresql://127.0.0.1:5432/test';
  process.env.SUPABASE_ANON_KEY = 'test-anon-key';
  process.env.AUTH_SECRET = 'test-session-secret-which-is-not-real';
  process.env.APP_URL = 'http://localhost:3000';
  process.env.NODE_ENV = 'test';

  process.env.SUPABASE_URL = 'https://example-project.supabase.co';
  assert.throws(
    () => createApiRouter({ sessionStore: new session.MemoryStore() }),
    /Invalid environment variable: SUPABASE_URL/,
  );

  process.env.SUPABASE_URL = 'https://test-project.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'your-supabase-anon-key';
  assert.throws(
    () => createApiRouter({ sessionStore: new session.MemoryStore() }),
    /Invalid environment variable: SUPABASE_ANON_KEY/,
  );
});

test('migration contains ownership policies for all transaction operations', async () => {
  const migration = await readFile(new URL('../../database/migrations/001_finance_auth.sql', import.meta.url), 'utf8');
  assert.match(migration, /alter table public\.transactions enable row level security/i);
  assert.match(migration, /create policy "users can read own transactions"[\s\S]*?using \(\(select auth\.uid\(\)\) = user_id\)/i);
  assert.match(migration, /create policy "users can insert own transactions"[\s\S]*?with check \(\(select auth\.uid\(\)\) = user_id\)/i);
  assert.match(migration, /create policy "users can update own transactions"[\s\S]*?using \(\(select auth\.uid\(\)\) = user_id\)[\s\S]*?with check \(\(select auth\.uid\(\)\) = user_id\)/i);
  assert.match(migration, /create policy "users can delete own transactions"[\s\S]*?using \(\(select auth\.uid\(\)\) = user_id\)/i);
  const immutableMigration = await readFile(new URL('../../database/migrations/20261013212000_make_transactions_immutable.sql', import.meta.url), 'utf8');
  assert.match(immutableMigration, /new\.amount is distinct from old\.amount/i);
  assert.match(immutableMigration, /new\.description is distinct from old\.description/i);
  assert.match(immutableMigration, /before update on public\.transactions/i);
});

test('dedicated Express session migration avoids collisions with existing sessions tables', async () => {
  const migration = await readFile(new URL('../../database/migrations/20261015113000_add_express_session_store.sql', import.meta.url), 'utf8');
  assert.match(migration, /create table if not exists public\.catatuang_express_sessions\s*\(\s*sid varchar not null primary key,\s*sess json not null,\s*expire timestamp\(6\) not null/i);
  assert.match(migration, /alter table public\.catatuang_express_sessions enable row level security/i);
  assert.match(migration, /revoke all on public\.catatuang_express_sessions from public/i);
  assert.match(migration, /foreach role_name in array array\['anon', 'authenticated', 'service_role'\]/i);
  const serverSource = await readFile(new URL('../../server/api.ts', import.meta.url), 'utf8');
  assert.match(serverSource, /tableName: 'catatuang_express_sessions'/);
});

test('admin hardening migration removes client access to account status and admin tables', async () => {
  const migration = await readFile(new URL('../../supabase/migrations/20261013230000_restrict_user_status_updates.sql', import.meta.url), 'utf8');
  assert.match(migration, /revoke update on table public\.users from public, anon, authenticated/i);
  assert.match(migration, /revoke update \(account_status, disabled_reason\) on table public\.users from public, anon, authenticated/i);
  assert.match(migration, /grant update \(name, initial_balance\) on table public\.users to authenticated/i);
  assert.match(migration, /revoke all on table public\.admin_users from public, anon, authenticated/i);
  assert.match(migration, /revoke all on table public\.admin_audit_logs from public, anon, authenticated/i);
  assert.match(migration, /revoke all on table public\.app_settings from public, anon, authenticated/i);
});

test('admin migration protects RLS tables and privileged RPC execution', async () => {
  const migration = await readFile(new URL('../../supabase/migrations/20261013220000_add_admin_panel.sql', import.meta.url), 'utf8');
  for (const table of ['admin_users', 'admin_audit_logs', 'app_settings']) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
    assert.match(migration, new RegExp(`revoke all on public\\.${table} from public, anon, authenticated`, 'i'));
  }
  assert.match(migration, /security definer\s+set search_path = ''[\s\S]*?from public\.admin_users as admins[\s\S]*?admins\.user_id = \(select auth\.uid\(\)\)/i);
  assert.match(migration, /revoke all on function public\.admin_get_overview\(\) from public, anon/i);
  assert.match(migration, /grant execute on function public\.admin_get_overview\(\) to authenticated/i);
});

test('admin dashboard aggregate migration only exposes guarded anonymous totals', async () => {
  const migration = await readFile(new URL('../../supabase/migrations/20261014060000_add_admin_dashboard_aggregates.sql', import.meta.url), 'utf8');
  for (const functionName of ['admin_get_account_growth', 'admin_get_storage_usage']) {
    assert.match(migration, new RegExp(`security definer\\s+set search_path = ''[\\s\\S]*?public\\.admin_users[\\s\\S]*?auth\\.uid\\(\\)[\\s\\S]*?revoke all on function public\\.${functionName}\\(\\) from public, anon`, 'i'));
    assert.match(migration, new RegExp(`grant execute on function public\\.${functionName}\\(\\) to authenticated`, 'i'));
  }
  assert.match(migration, /sum\([\s\S]*metadata->>'size'[\s\S]*\)::bigint/i);
  assert.doesNotMatch(migration, /select\s+[^;]*(?:storage_objects\.)?(?:name|owner_id|bucket_id)\s*[,;]/i);
});

test('register, login session, and transaction ownership use the authenticated user', async (context) => {
  process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:5432/test';
  process.env.SUPABASE_URL = 'https://test-project.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'test-anon-key';
  process.env.AUTH_SECRET = 'test-session-secret-which-is-not-real';
  process.env.APP_URL = 'http://localhost:3000';
  process.env.NODE_ENV = 'test';

  const userId = '00000000-0000-4000-8000-000000000001';
  const otherUserId = '00000000-0000-4000-8000-000000000002';
  const transactionId = '00000000-0000-4000-8000-000000000003';
  const otherTransactionId = '00000000-0000-4000-8000-000000000004';
  const user = {
    id: userId,
    aud: 'authenticated',
    role: 'authenticated',
    email: 'user-a@example.com',
    phone: '',
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: { name: 'User A' },
    identities: [{ identity_id: userId, id: userId, user_id: userId }],
    created_at: '2026-09-30T00:00:00.000Z',
    updated_at: '2026-09-30T00:00:00.000Z',
    is_anonymous: false,
  };
  const transaction = {
    id: transactionId,
    user_id: userId,
    date: '2026-09-30',
    amount: 30_000,
    description: 'Makan siang',
    type: 'expense',
    category: 'Makanan',
    created_at: '2026-09-30T00:00:00.000Z',
    updated_at: '2026-09-30T00:00:00.000Z',
    receipt_path: null,
    receipt_mime: null,
    receipt_size: null,
  };
  const tokenPayload = Buffer.from(JSON.stringify({ sub: userId, aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url');
  const accessToken = `eyJhbGciOiJub25lIn0.${tokenPayload}.test-signature`;
  const refreshToken = 'test-refresh-token';
  const requests: Array<{ path: string; method: string; query: URLSearchParams; body: Record<string, unknown>; authorization: string | null; contentType: string | null }> = [];
  let mockedReceiptPath: string | null = null;
  const originalFetch = globalThis.fetch;

  context.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const rawUrl = input instanceof Request ? input.url : input.toString();
    const url = new URL(rawUrl);
    if (url.origin !== process.env.SUPABASE_URL) return originalFetch(input, init);

    const method = init?.method ?? 'GET';
    const requestHeaders = new Headers(init?.headers);
    const contentType = requestHeaders.get('content-type');
    const body = init?.body && contentType?.includes('application/json')
      ? JSON.parse(String(init.body)) as Record<string, unknown>
      : {};
    const authorization = requestHeaders.get('authorization');
    requests.push({ path: url.pathname, method, query: url.searchParams, body, authorization, contentType });

    let payload: unknown = {};
    let status = 200;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };

    if (url.pathname === '/auth/v1/signup') {
      const duplicate = body.email === 'taken@example.com';
      payload = { user: { ...user, email: body.email, identities: duplicate ? [] : user.identities }, session: null };
    } else if (url.pathname === '/auth/v1/token') {
      if (body.email === 'unknown@example.com') {
        status = 400;
        payload = { code: 'invalid_credentials', message: 'Invalid login credentials' };
      } else {
        payload = {
          access_token: accessToken,
          token_type: 'bearer',
          expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          refresh_token: refreshToken,
          user,
        };
      }
    } else if (url.pathname === '/auth/v1/user') {
      payload = user;
    } else if (url.pathname === '/auth/v1/logout') {
      payload = null;
      status = 204;
    } else if (url.pathname === '/rest/v1/users') {
      payload = [{ name: 'User A' }];
    } else if (url.pathname === '/rest/v1/transactions') {
      headers['Content-Range'] = '*/0';
      if (method === 'GET') {
        const requestedId = url.searchParams.get('id');
        if (requestedId === `eq.${otherTransactionId}`) {
          payload = [];
        } else if (url.searchParams.get('select') === 'receipt_path') {
          payload = [{ receipt_path: mockedReceiptPath }];
        } else {
          payload = [transaction];
          headers['Content-Range'] = '0-0/1';
        }
      } else if (method === 'POST') {
        payload = { ...transaction, ...body, id: transactionId };
        status = 201;
      } else if (method === 'PATCH' || method === 'DELETE') {
        const requestedId = url.searchParams.get('id');
        if (requestedId === `eq.${otherTransactionId}`) {
          payload = [];
        } else {
          if (method === 'PATCH' && typeof body.receipt_path === 'string') mockedReceiptPath = body.receipt_path;
          payload = method === 'DELETE' ? [{ id: transactionId }] : [{ ...transaction, ...body }];
        }
      } else {
        status = 405;
      }
    } else if (url.pathname.startsWith('/storage/v1/object/sign/')) {
      payload = { signedURL: '/object/sign/transaction-receipts/receipt.jpg?token=test-signed-token' };
    } else if (url.pathname.startsWith('/storage/v1/object/transaction-receipts/')) {
      payload = { Key: url.pathname.slice('/storage/v1/object/'.length) };
    } else if (url.pathname === '/storage/v1/object/transaction-receipts' && method === 'DELETE') {
      payload = [];
    } else {
      status = 404;
      payload = { message: 'Unexpected mocked Supabase endpoint.' };
    }
    return new Response(status === 204 ? null : JSON.stringify(payload), { status, headers });
  });

  const app = express();
  app.use(express.json());
  const store = new session.MemoryStore();
  const originalStoreSet = store.set.bind(store);
  let nextSessionSaveCode: string | null = null;
  store.set = (sid, sessionData, callback) => {
    if (nextSessionSaveCode) {
      const code = nextSessionSaveCode;
      nextSessionSaveCode = null;
      callback?.(Object.assign(new Error('injected session store failure'), { code }));
      return;
    }
    originalStoreSet(sid, sessionData, callback);
  };
  app.use('/api', createApiRouter({ sessionStore: store }));
  const server = await new Promise<ReturnType<typeof app.listen>>((resolve, reject) => {
    const listeningServer = app.listen(0, '127.0.0.1', () => resolve(listeningServer));
    listeningServer.once('error', reject);
  });
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const baseUrl = `http://127.0.0.1:${address.port}/api`;
  context.after(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
    await closeApiResources();
  });

  const headers = { 'Content-Type': 'application/json', Origin: process.env.APP_URL };
  const validRegistration = await fetch(`${baseUrl}/auth/register`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ name: 'User A', email: 'USER-A@example.com', password: 'password123', confirmPassword: 'password123' }),
  });
  assert.equal(validRegistration.status, 201);
  assert.deepEqual(await validRegistration.json(), { needsEmailConfirmation: true, user: null });
  assert.equal(requests.find((request) => request.path === '/auth/v1/signup')?.body.email, 'user-a@example.com');

  const duplicateRegistration = await fetch(`${baseUrl}/auth/register`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ name: 'User A', email: 'taken@example.com', password: 'password123', confirmPassword: 'password123' }),
  });
  assert.equal(duplicateRegistration.status, 409);

  const login = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ email: 'USER-A@example.com', password: 'password123' }),
  });
  assert.equal(login.status, 200);
  assert.match(login.headers.get('set-cookie') ?? '', /catatuang\.sid=.*HttpOnly/i);
  const cookie = login.headers.get('set-cookie')?.split(';')[0];
  assert.ok(cookie);

  const sessionId = decodeURIComponent(cookie.slice(cookie.indexOf('=') + 1)).split('.')[0].replace(/^s:/, '');
  await new Promise<void>((resolve, reject) => {
    store.get(sessionId, (error, savedSession) => {
      if (error || !savedSession) {
        reject(error ?? new Error('Login session was not saved.'));
        return;
      }
      store.set(sessionId, { ...savedSession, expiresAt: Math.floor(Date.now() / 1000) - 1 }, (saveError) => {
        if (saveError) reject(saveError);
        else resolve();
      });
    });
  });
  const restoredSession = await fetch(`${baseUrl}/auth/session`, { headers: { Cookie: cookie } });
  assert.equal(restoredSession.status, 200);
  assert.equal((await restoredSession.json() as { user: { id: string } }).user.id, userId);
  assert.equal(
    requests.filter((request) => request.path === '/auth/v1/token').at(-1)?.query.get('grant_type'),
    'refresh_token',
  );

  const invalidCredentials = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ email: 'unknown@example.com', password: 'wrong-password' }),
  });
  assert.equal(invalidCredentials.status, 401);
  assert.deepEqual(await invalidCredentials.json(), { error: 'Email atau password salah.' });

  nextSessionSaveCode = 'SESSION_STORE_FAILURE';
  const sessionFailure = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ email: 'USER-A@example.com', password: 'password123' }),
  });
  assert.equal(sessionFailure.status, 503);
  assert.deepEqual(await sessionFailure.json(), { error: 'Login belum dapat diproses. Coba lagi nanti.' });

  nextSessionSaveCode = '28P01';
  const databaseFailure = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ email: 'USER-A@example.com', password: 'password123' }),
  });
  assert.equal(databaseFailure.status, 503);
  assert.deepEqual(await databaseFailure.json(), { error: 'Login belum dapat diproses. Coba lagi nanti.' });

  const ownTransactions = await fetch(`${baseUrl}/transactions`, { headers: { Cookie: cookie } });
  assert.equal(ownTransactions.status, 200);
  const listRequest = requests.find((request) => request.path === '/rest/v1/transactions' && request.method === 'GET');
  assert.equal(listRequest?.query.get('user_id'), `eq.${userId}`);
  assert.match(listRequest?.query.get('select') ?? '', /receipt_path,receipt_mime,receipt_size/);
  const listBody = await ownTransactions.json() as { transactions: Array<{ id: string; receipt_path: string | null; receipt_mime: string | null; receipt_size: number | null }> };
  assert.equal(listBody.transactions[0].id, transactionId);
  assert.equal(listBody.transactions[0].receipt_path, null);
  assert.equal(listBody.transactions[0].receipt_mime, null);
  assert.equal(listBody.transactions[0].receipt_size, null);

  const transactionDetail = await fetch(`${baseUrl}/transactions/${transactionId}`, { headers: { Cookie: cookie } });
  assert.equal(transactionDetail.status, 200);
  const detailBody = await transactionDetail.json() as { transaction: { receipt_path: string | null } };
  assert.equal(detailBody.transaction.receipt_path, null);

  const emptyDateFilters = await fetch(`${baseUrl}/transactions?startDate=&endDate=`, { headers: { Cookie: cookie } });
  assert.equal(emptyDateFilters.status, 200);
  const unfilteredRequest = requests.filter((request) => request.path === '/rest/v1/transactions' && request.method === 'GET').at(-1);
  assert.equal(unfilteredRequest?.query.has('date'), false);

  const formerFrontendQuery = await fetch(
    `${baseUrl}/transactions?page=1&pageSize=20&search=&type=all&category=all&startDate=&endDate=`,
    { headers: { Cookie: cookie } },
  );
  assert.equal(formerFrontendQuery.status, 200);

  const receiptUrlWithoutPhoto = await fetch(`${baseUrl}/transactions/${transactionId}/receipt-url`, {
    headers: { Cookie: cookie },
  });
  assert.equal(receiptUrlWithoutPhoto.status, 404);
  assert.deepEqual(await receiptUrlWithoutPhoto.json(), { error: 'Transaksi ini belum memiliki foto bukti.' });
  assert.equal(requests.some((request) => request.path.startsWith('/storage/v1/object/sign/')), false);

  mockedReceiptPath = `${userId}/${transactionId}/receipt.jpg`;
  const receiptUrlForOwner = await fetch(`${baseUrl}/transactions/${transactionId}/receipt-url`, {
    headers: { Cookie: cookie },
  });
  assert.equal(receiptUrlForOwner.status, 200);
  assert.deepEqual(await receiptUrlForOwner.json(), {
    signedUrl: 'https://test-project.supabase.co/storage/v1/object/sign/transaction-receipts/receipt.jpg?token=test-signed-token',
  });
  const receiptLookup = requests.filter((request) => request.path === '/rest/v1/transactions' && request.method === 'GET').at(-1);
  assert.equal(receiptLookup?.query.get('user_id'), `eq.${userId}`);
  assert.equal(receiptLookup?.query.get('id'), `eq.${transactionId}`);
  const signedUrlRequest = requests.filter((request) => request.path.startsWith('/storage/v1/object/sign/')).at(-1);
  assert.equal(signedUrlRequest?.method, 'POST');
  assert.match(signedUrlRequest?.path ?? '', /\/storage\/v1\/object\/sign\/transaction-receipts\//);
  assert.equal(signedUrlRequest?.body.expiresIn, 60 * 60);
  assert.equal(signedUrlRequest?.authorization, `Bearer ${accessToken}`);

  const receiptUrlForAnotherUser = await fetch(`${baseUrl}/transactions/${otherTransactionId}/receipt-url`, {
    headers: { Cookie: cookie },
  });
  assert.equal(receiptUrlForAnotherUser.status, 404);
  assert.deepEqual(await receiptUrlForAnotherUser.json(), { error: 'Transaksi tidak ditemukan.' });
  assert.equal(requests.filter((request) => request.path.startsWith('/storage/v1/object/sign/')).length, 1);
  mockedReceiptPath = null;

  const invalidDateFilter = await fetch(`${baseUrl}/transactions?startDate=2026-02-30`, { headers: { Cookie: cookie } });
  assert.equal(invalidDateFilter.status, 400);
  const invalidTypeFilter = await fetch(`${baseUrl}/transactions?type=invalid`, { headers: { Cookie: cookie } });
  assert.equal(invalidTypeFilter.status, 400);

  const create = await fetch(`${baseUrl}/transactions`, {
    method: 'POST',
    headers: { ...headers, Cookie: cookie },
    body: JSON.stringify({ ...transaction, user_id: otherUserId }),
  });
  assert.equal(create.status, 201);
  const insertRequest = requests.find((request) => request.path === '/rest/v1/transactions' && request.method === 'POST');
  assert.equal(insertRequest?.body.user_id, userId);

  const createWithReceiptMetadata = await fetch(`${baseUrl}/transactions`, {
    method: 'POST',
    headers: { ...headers, Cookie: cookie },
    body: JSON.stringify({
      ...transaction,
      receiptPath: `${userId}/${transactionId}/receipt.jpg`,
      receiptMime: 'image/jpeg',
      receiptSize: 1234,
    }),
  });
  assert.equal(createWithReceiptMetadata.status, 400);

  const invalidCategory = await fetch(`${baseUrl}/transactions`, {
    method: 'POST',
    headers: { ...headers, Cookie: cookie },
    body: JSON.stringify({ ...transaction, category: 'Kategori asing' }),
  });
  assert.equal(invalidCategory.status, 400);
  assert.equal(requests.filter((request) => request.path === '/rest/v1/transactions' && request.method === 'POST').length, 1);

  for (const immutableField of ['amount', 'type', 'date', 'category', 'description']) {
    const rejectedUpdate: Response = await fetch(`${baseUrl}/transactions/${transactionId}`, {
      method: 'PATCH',
      headers: { ...headers, Cookie: cookie },
      body: JSON.stringify({ [immutableField]: transaction[immutableField as keyof typeof transaction] }),
    });
    assert.equal(rejectedUpdate.status, 400, `${immutableField} must be immutable`);
    assert.match((await rejectedUpdate.json() as { error: string }).error, /bersifat final/i);
  }

  const receiptUpdate = await fetch(`${baseUrl}/transactions/${transactionId}`, {
    method: 'PATCH',
    headers: { ...headers, Cookie: cookie },
    body: JSON.stringify({
      receiptPath: `${userId}/${transactionId}/receipt.jpg`,
      receiptMime: 'image/jpeg',
      receiptSize: 1234,
    }),
  });
  assert.equal(receiptUpdate.status, 200);
  const receiptUpdateRequest = requests.filter((request) => request.path === '/rest/v1/transactions' && request.method === 'PATCH').at(-1);
  assert.equal(receiptUpdateRequest?.query.get('user_id'), `eq.${userId}`);
  assert.deepEqual(receiptUpdateRequest?.body, {
    receipt_path: `${userId}/${transactionId}/receipt.jpg`,
    receipt_mime: 'image/jpeg',
    receipt_size: 1234,
  });

  const receiptPathForAnotherTransaction = await fetch(`${baseUrl}/transactions/${transactionId}`, {
    method: 'PATCH',
    headers: { ...headers, Cookie: cookie },
    body: JSON.stringify({
      receiptPath: `${userId}/${otherTransactionId}/receipt.jpg`,
      receiptMime: 'image/jpeg',
      receiptSize: 1234,
    }),
  });
  assert.equal(receiptPathForAnotherTransaction.status, 400);

  const receiptUpdateOtherUser = await fetch(`${baseUrl}/transactions/${otherTransactionId}`, {
    method: 'PATCH',
    headers: { ...headers, Cookie: cookie },
    body: JSON.stringify({
      receiptPath: `${userId}/${otherTransactionId}/receipt.jpg`,
      receiptMime: 'image/jpeg',
      receiptSize: 1234,
    }),
  });
  assert.equal(receiptUpdateOtherUser.status, 404);

  const deleteOtherUser = await fetch(`${baseUrl}/transactions/${otherTransactionId}`, {
    method: 'DELETE',
    headers: { Cookie: cookie, Origin: process.env.APP_URL },
  });
  assert.equal(deleteOtherUser.status, 404);
  const deleteRequest = requests.filter((request) => request.path === '/rest/v1/transactions' && request.method === 'DELETE').at(-1);
  assert.equal(deleteRequest?.query.get('user_id'), `eq.${userId}`);

  const uploadHeaders = {
    Cookie: cookie,
    Origin: process.env.APP_URL,
    'Content-Type': 'image/jpeg',
    'X-Receipt-Name': 'bukti.jpg',
  };
  const uploadForAnotherUser = await fetch(`${baseUrl}/transactions/${otherTransactionId}/receipt`, {
    method: 'POST',
    headers: uploadHeaders,
    body: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
  });
  assert.equal(uploadForAnotherUser.status, 404);
  assert.deepEqual(await uploadForAnotherUser.json(), { error: 'Transaksi tidak ditemukan.' });
  assert.equal(requests.some((request) => request.path.startsWith('/storage/v1/object/transaction-receipts/')), false);

  const invalidMimeUpload = await fetch(`${baseUrl}/transactions/${transactionId}/receipt`, {
    method: 'POST',
    headers: { ...uploadHeaders, 'Content-Type': 'application/pdf' },
    body: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
  });
  assert.equal(invalidMimeUpload.status, 400);
  assert.match((await invalidMimeUpload.json() as { error: string }).error, /gambar JPG, PNG, atau WEBP/i);

  const oversizedUpload = await fetch(`${baseUrl}/transactions/${transactionId}/receipt`, {
    method: 'POST',
    headers: uploadHeaders,
    body: new Uint8Array(5 * 1024 * 1024 + 1).fill(0xff),
  });
  assert.equal(oversizedUpload.status, 413);
  assert.deepEqual(await oversizedUpload.json(), { error: 'Ukuran gambar bukti maksimal 5 MB.' });

  const uploadReceipt = await fetch(`${baseUrl}/transactions/${transactionId}/receipt`, {
    method: 'POST',
    headers: uploadHeaders,
    body: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
  });
  assert.equal(uploadReceipt.status, 201);
  const uploadedReceipt = await uploadReceipt.json() as { receiptPath: string; receiptMime: string; receiptSize: number };
  assert.match(uploadedReceipt.receiptPath, new RegExp(`^${userId}/${transactionId}/`));
  assert.equal(uploadedReceipt.receiptMime, 'image/jpeg');
  assert.equal(uploadedReceipt.receiptSize, 4);
  const storageUploadRequest = requests.find((request) => request.path.startsWith('/storage/v1/object/transaction-receipts/'));
  assert.equal(storageUploadRequest?.method, 'POST');
  assert.equal(storageUploadRequest?.contentType, 'image/jpeg');
  const receiptMetadataRequest = requests.filter((request) => request.path === '/rest/v1/transactions' && request.method === 'PATCH').at(-1);
  assert.equal(receiptMetadataRequest?.query.get('user_id'), `eq.${userId}`);
  assert.deepEqual(receiptMetadataRequest?.body, {
    receipt_path: uploadedReceipt.receiptPath,
    receipt_mime: 'image/jpeg',
    receipt_size: 4,
  });

  const receiptUrlAfterUpload = await fetch(`${baseUrl}/transactions/${transactionId}/receipt-url`, {
    headers: { Cookie: cookie },
  });
  assert.equal(receiptUrlAfterUpload.status, 200);

  const deleteOwn = await fetch(`${baseUrl}/transactions/${transactionId}`, {
    method: 'DELETE',
    headers: { Cookie: cookie, Origin: process.env.APP_URL },
  });
  assert.equal(deleteOwn.status, 204);

  const logout = await fetch(`${baseUrl}/auth/logout`, {
    method: 'POST',
    headers: { Cookie: cookie, Origin: process.env.APP_URL },
  });
  assert.equal(logout.status, 204);
  assert.ok(requests.some((request) => request.path === '/auth/v1/logout'));
  assert.match(logout.headers.get('set-cookie') ?? '', /catatuang\.sid=.*Expires=/i);
  const expiredSession = await fetch(`${baseUrl}/transactions`, { headers: { Cookie: cookie } });
  assert.equal(expiredSession.status, 401);
});

test('admin CSV values are safely quoted and formula-escaped', () => {
  assert.equal(escapeCsvCell('total_accounts'), '"total_accounts"');
  assert.equal(escapeCsvCell('=HYPERLINK("https://example.com")'), `"'=HYPERLINK(""https://example.com"")"`);
  assert.equal(escapeCsvCell('  -1'), '"\'  -1"');
});

test('admin page renders announcement as text, not HTML', async () => {
  const source = await readFile(new URL('../pages/AdminPage.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /dangerouslySetInnerHTML/);
  assert.match(source, /value=\{announcementDraft\}/);
  const loginSource = await readFile(new URL('../pages/AdminLoginPage.tsx', import.meta.url), 'utf8');
  assert.match(loginSource, /requestError\.status !== 403/);
  assert.match(loginSource, /await apiService\.logout\(\)/);
  assert.match(loginSource, /await apiService\.checkAdmin\(\)/);
  assert.match(loginSource, /Akun ini tidak memiliki akses admin/);
  assert.match(loginSource, /updateUser\(null\)/);
  assert.doesNotMatch(loginSource, /Sesi ini bukan sesi admin/);
});

test('admin routes provide separate SPA sections and keep the user app isolated', async () => {
  const appSource = await readFile(new URL('../App.tsx', import.meta.url), 'utf8');
  const adminSource = await readFile(new URL('../pages/AdminPage.tsx', import.meta.url), 'utf8');
  for (const route of ['/admin/*', '/admin/users', '/admin/audit', '/admin/settings']) {
    assert.ok(appSource.includes(route) || adminSource.includes(route));
  }
  for (const label of ['Ringkasan', 'Akun', 'Audit Log', 'Pengaturan']) assert.ok(adminSource.includes(label));
  assert.match(adminSource, /setTimeout\([\s\S]*250/);
  assert.match(adminSource, /confirmEmail !== actionDialog\.user\.email/);
  assert.match(appSource, /getPublicServiceStatus/);
  assert.doesNotMatch(adminSource, /dangerouslySetInnerHTML/);
  assert.doesNotMatch(adminSource, /receipt_path|initial_balance|password|access_token|refresh_token/i);
});

test('admin endpoints are rate limited by the direct peer, not forged X-Forwarded-For', async (context) => {
  process.env.DATABASE_URL = 'postgresql://127.0.0.1:5432/test';
  process.env.SUPABASE_URL = 'https://test-project.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'test-anon-key';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
  process.env.AUTH_SECRET = 'test-session-secret-which-is-not-real';
  process.env.APP_URL = 'http://localhost:3000';
  process.env.NODE_ENV = 'test';

  const app = express();
  app.use(express.json());
  app.use('/api', createApiRouter({ sessionStore: new session.MemoryStore() }));
  const server = await new Promise<ReturnType<typeof app.listen>>((resolve, reject) => {
    const listeningServer = app.listen(0, '127.0.0.1', () => resolve(listeningServer));
    listeningServer.once('error', reject);
  });
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const baseUrl = `http://127.0.0.1:${address.port}/api`;
  context.after(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
    await closeApiResources();
  });

  const loginStatuses: number[] = [];
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const response = await fetch(`${baseUrl}/admin/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: process.env.APP_URL ?? '',
        'X-Forwarded-For': `198.51.100.${attempt + 1}`,
      },
      body: '{}',
    });
    loginStatuses.push(response.status);
  }
  assert.deepEqual(loginStatuses, [401, 401, 401, 401, 401, 429]);

  const protectedStatuses: number[] = [];
  for (let attempt = 0; attempt < 115; attempt += 1) {
    const response = await fetch(`${baseUrl}/admin/health`, {
      headers: { 'X-Forwarded-For': `203.0.113.${attempt % 250 + 1}` },
    });
    protectedStatuses.push(response.status);
  }
  assert.equal(protectedStatuses[0], 401);
  assert.equal(protectedStatuses[113], 401);
  assert.equal(protectedStatuses[114], 429);
});

test('admin API enforces roles, limits exposed account data, audits changes, and confirms deletion', async (context) => {
  process.env.DATABASE_URL = 'postgresql://127.0.0.1:5432/test';
  process.env.SUPABASE_URL = 'https://test-project.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'test-anon-key';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
  process.env.AUTH_SECRET = 'test-session-secret-which-is-not-real';
  process.env.APP_URL = 'http://localhost:3000';
  process.env.NODE_ENV = 'test';

  const adminId = '00000000-0000-4000-8000-000000000011';
  const regularId = '00000000-0000-4000-8000-000000000012';
  const targetId = '00000000-0000-4000-8000-000000000013';
  const disabledId = '00000000-0000-4000-8000-000000000014';
  const ownerId = '00000000-0000-4000-8000-000000000015';
  const supportId = '00000000-0000-4000-8000-000000000016';
  const adminUser = {
    id: adminId, aud: 'authenticated', role: 'authenticated', email: 'admin@example.com', phone: '',
    app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: { name: 'Admin' },
    identities: [{ identity_id: adminId, id: adminId, user_id: adminId }],
    created_at: '2026-09-30T00:00:00.000Z', updated_at: '2026-09-30T00:00:00.000Z', is_anonymous: false,
  };
  const regularUser = {
    ...adminUser, id: regularId, email: 'user@example.com',
    app_metadata: { provider: 'email', providers: ['email'], role: 'owner' },
    user_metadata: { name: 'User', role: 'owner' },
    identities: [{ identity_id: regularId, id: regularId, user_id: regularId }],
  };
  const supportUser = {
    ...adminUser, id: supportId, email: 'support@example.com',
    identities: [{ identity_id: supportId, id: supportId, user_id: supportId }],
  };
  const disabledUser = {
    ...adminUser, id: disabledId, email: 'disabled@example.com',
    identities: [{ identity_id: disabledId, id: disabledId, user_id: disabledId }],
  };
  const adminToken = 'test-admin-access';
  const regularToken = 'test-regular-access';
  const disabledToken = 'test-disabled-access';
  const requests: Array<{ path: string; method: string; query: URLSearchParams; body: Record<string, unknown>; authorization: string | null }> = [];
  const originalFetch = globalThis.fetch;
  let nextAuditId = 0;
  let accountStatusMigrationApplied = true;
  let adminRoleMigrationApplied = true;
  const disabledAccountIds = new Set([disabledId]);

  context.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const rawUrl = input instanceof Request ? input.url : input.toString();
    const url = new URL(rawUrl);
    if (url.origin !== process.env.SUPABASE_URL) return originalFetch(input, init);

    const method = init?.method ?? 'GET';
    const headers = new Headers(init?.headers);
    const authorization = headers.get('authorization');
    const body = init?.body && headers.get('content-type')?.includes('application/json')
      ? JSON.parse(String(init.body)) as Record<string, unknown>
      : {};
    requests.push({ path: url.pathname, method, query: url.searchParams, body, authorization });

    let status = 200;
    let payload: unknown = {};
    const responseHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
    if (url.pathname === '/auth/v1/token') {
      const user = body.email === 'admin@example.com' ? adminUser
        : body.email === 'support@example.com' ? supportUser
        : body.email === 'disabled@example.com' ? disabledUser
          : regularUser;
      const token = user.id === adminId ? adminToken : user.id === supportId ? 'test-support-access'
        : user.id === disabledId ? disabledToken : regularToken;
      payload = {
        access_token: token, token_type: 'bearer', expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: `${token}-refresh`, user,
      };
    } else if (url.pathname === '/auth/v1/user') {
      if (authorization?.includes('support')) payload = supportUser;
      else
      payload = authorization === `Bearer ${adminToken}` ? adminUser
        : authorization === `Bearer ${disabledToken}` ? disabledUser
          : regularUser;
    } else if (url.pathname.startsWith('/auth/v1/admin/users/')) {
      const requestedAuthUserId = url.pathname.split('/').at(-1);
      payload = { user: { id: requestedAuthUserId, email_confirmed_at: '2026-09-30T00:00:00.000Z' } };
    } else if (url.pathname === '/rest/v1/users') {
      if (method === 'HEAD') {
        responseHeaders['Content-Range'] = '*/4';
        return new Response(null, { status: 200, headers: responseHeaders });
      } else if (method === 'GET' && url.searchParams.get('select') === 'account_status') {
        if (!accountStatusMigrationApplied) {
          status = 400;
          payload = { code: '42703', message: 'column users.account_status does not exist' };
          return new Response(JSON.stringify(payload), { status, headers: responseHeaders });
        }
        const requestedId = url.searchParams.get('id')?.replace('eq.', '');
        payload = { account_status: requestedId && disabledAccountIds.has(requestedId) ? 'disabled' : 'active' };
      } else if (method === 'GET') {
        responseHeaders['Content-Range'] = '0-0/1';
        payload = [{
          id: targetId, name: 'Target User', email: 'target@example.com',
          created_at: '2026-09-30T00:00:00.000Z', account_status: 'active', disabled_reason: null,
        }];
      } else if (method === 'PATCH') {
        payload = [{ id: targetId }];
      }
    } else if (url.pathname === '/rest/v1/admin_users') {
      if (!adminRoleMigrationApplied) {
        status = 404;
        payload = { code: 'PGRST205', message: 'Could not find the table public.admin_users in the schema cache' };
        return new Response(JSON.stringify(payload), { status, headers: responseHeaders });
      }
      const roleUserId = url.searchParams.get('user_id');
      payload = roleUserId === `eq.${adminId}` ? [{ role: 'admin' }]
        : roleUserId === `eq.${ownerId}` ? [{ role: 'owner' }]
          : roleUserId === `eq.${supportId}` ? [{ role: 'support' }]
          : [];
    } else if (url.pathname === '/rest/v1/admin_audit_logs') {
      if (method === 'GET') {
        responseHeaders['Content-Range'] = '*/0';
        payload = [];
      } else if (method === 'POST') {
        status = 201;
        payload = { id: ++nextAuditId };
      } else {
        payload = [{ id: Number(url.searchParams.get('id')?.replace('eq.', '')) }];
      }
    } else if (url.pathname === '/rest/v1/app_settings') {
      if (method === 'GET') payload = { announcement: null, maintenance_mode: false, updated_at: '2026-10-13T00:00:00.000Z' };
      else {
        status = 201;
        payload = [];
      }
    } else if (url.pathname === '/rest/v1/rpc/admin_get_overview') {
      payload = [{
        total_accounts: 4, new_accounts_30d: 1, active_accounts: 3,
        disabled_accounts: 1, total_transactions: 12,
      }];
    } else if (url.pathname === '/rest/v1/rpc/admin_get_account_growth') {
      payload = [{ day: '2026-10-13', accounts: 1 }];
    } else if (url.pathname === '/rest/v1/rpc/admin_get_storage_usage') {
      payload = [{ object_count: 3, total_bytes: 2048 }];
    } else if (url.pathname === '/rest/v1/rpc/dashboard_summary') {
      payload = [{
        initial_balance: 0, total_income: 0, total_expense: 0,
        transaction_count: 0, income_count: 0, expense_count: 0,
      }];
    } else if (url.pathname === '/rest/v1/transactions' && method === 'GET') {
      responseHeaders['Content-Range'] = '*/0';
      payload = [];
    } else if (url.pathname.startsWith('/storage/v1/bucket')) {
      payload = [];
    } else {
      status = 404;
      payload = { message: `Unexpected mocked endpoint: ${url.pathname}` };
    }
    return new Response(JSON.stringify(payload), { status, headers: responseHeaders });
  });

  const app = express();
  app.use(express.json());
  app.use('/api', createApiRouter({ sessionStore: new session.MemoryStore() }));
  const server = await new Promise<ReturnType<typeof app.listen>>((resolve, reject) => {
    const listeningServer = app.listen(0, '127.0.0.1', () => resolve(listeningServer));
    listeningServer.once('error', reject);
  });
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const baseUrl = `http://127.0.0.1:${address.port}/api`;
  context.after(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
    await closeApiResources();
  });

  const anonymousOverview = await fetch(`${baseUrl}/admin/overview`);
  assert.equal(anonymousOverview.status, 401);
  const protectedAdminRoutes: Array<[string, string]> = [
    ['POST', '/admin/login-check'],
    ['GET', '/admin/overview'],
    ['GET', '/admin/account-growth'],
    ['GET', '/admin/storage-usage'],
    ['GET', '/admin/health'],
    ['GET', '/admin/users'],
    ['GET', '/admin/audit-logs?action=invalid'],
    ['POST', `/admin/users/${targetId}/disable`],
    ['POST', `/admin/users/${targetId}/enable`],
    ['DELETE', `/admin/users/${targetId}`],
    ['GET', '/admin/audit-logs'],
    ['GET', '/admin/settings'],
    ['PATCH', '/admin/settings/announcement'],
    ['PATCH', '/admin/settings/maintenance'],
    ['GET', '/admin/export/metrics'],
  ];
  for (const [method, path] of protectedAdminRoutes) {
    const routeResponse: Response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      ...(method === 'POST' || method === 'PATCH' || method === 'DELETE' ? { body: '{}' } : {}),
    });
    assert.equal(routeResponse.status, 401, `anonymous ${method} ${path}`);
  }

  async function login(email: string) {
    const response = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: process.env.APP_URL ?? '' },
      body: JSON.stringify({ email, password: 'password123' }),
    });
    assert.equal(response.status, 200);
    return response.headers.get('set-cookie')?.split(';')[0] ?? '';
  }

  const regularCookie = await login('user@example.com');
  const regularCheck = await fetch(`${baseUrl}/admin/login-check`, { method: 'POST', headers: { Cookie: regularCookie, Origin: process.env.APP_URL } });
  assert.equal(regularCheck.status, 403);
  for (const [method, path] of protectedAdminRoutes) {
    const routeResponse: Response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: { Cookie: regularCookie, Origin: process.env.APP_URL ?? '', 'Content-Type': 'application/json' },
      ...(method === 'POST' || method === 'PATCH' || method === 'DELETE' ? { body: '{}' } : {}),
    });
    assert.equal(routeResponse.status, 403, `regular user ${method} ${path}`);
  }
  const supportCookie = await login('support@example.com');
  const supportWrite = await fetch(`${baseUrl}/admin/settings/announcement`, {
    method: 'PATCH',
    headers: { Cookie: supportCookie, Origin: process.env.APP_URL, 'Content-Type': 'application/json' },
    body: JSON.stringify({ announcement: 'Percobaan terbatas', reason: 'Uji role support' }),
  });
  assert.equal(supportWrite.status, 403);
  const supportDeniedAudit = requests.find((request) => request.path === '/rest/v1/admin_audit_logs'
    && request.method === 'POST' && request.body.actor_role === 'support'
    && request.body.result === 'denied');
  assert.deepEqual(supportDeniedAudit?.body.details, { cause: 'role_read_only' });

  const regularAdminLogin = await fetch(`${baseUrl}/admin/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: process.env.APP_URL ?? '' },
    body: JSON.stringify({ email: 'user@example.com', password: 'password123' }),
  });
  assert.equal(regularAdminLogin.status, 401);
  assert.deepEqual(await regularAdminLogin.json(), { error: 'Email atau password admin salah.' });
  assert.equal(regularAdminLogin.headers.get('set-cookie'), null);

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  const missingServiceKeyLogin = await fetch(`${baseUrl}/admin/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: process.env.APP_URL ?? '' },
    body: JSON.stringify({ email: 'admin@example.com', password: 'password123' }),
  });
  assert.equal(missingServiceKeyLogin.status, 503);
  const missingServiceKeyBody = await missingServiceKeyLogin.json() as { error: string };
  assert.equal(missingServiceKeyBody.error, 'Login admin sementara tidak dapat diverifikasi.');
  assert.doesNotMatch(missingServiceKeyBody.error, /service_role|migration|table|SUPABASE/i);
  process.env.SUPABASE_SERVICE_ROLE_KEY = serviceRoleKey;

  adminRoleMigrationApplied = false;
  const missingAdminMigrationLogin = await fetch(`${baseUrl}/admin/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: process.env.APP_URL ?? '' },
    body: JSON.stringify({ email: 'admin@example.com', password: 'password123' }),
  });
  assert.equal(missingAdminMigrationLogin.status, 503);
  assert.deepEqual(await missingAdminMigrationLogin.json(), { error: 'Login admin sementara tidak dapat diverifikasi.' });
  adminRoleMigrationApplied = true;

  const adminLogin = await fetch(`${baseUrl}/admin/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: process.env.APP_URL ?? '' },
    body: JSON.stringify({ email: 'admin@example.com', password: 'password123' }),
  });
  assert.equal(adminLogin.status, 200);
  assert.deepEqual(await adminLogin.json(), {
    user: { id: adminId, name: 'Admin', email: 'admin@example.com' },
    role: 'admin',
  });
  const adminCookie = adminLogin.headers.get('set-cookie')?.split(';')[0] ?? '';
  const adminSetCookie = adminLogin.headers.get('set-cookie') ?? '';
  const adminCookieExpires = new Date(adminSetCookie.match(/Expires=([^;]+)/i)?.[1] ?? '').getTime();
  assert.ok(adminCookieExpires > Date.now() + 29 * 60 * 1000);
  assert.ok(adminCookieExpires < Date.now() + 31 * 60 * 1000);
  assert.match(adminSetCookie, /HttpOnly/i);
  assert.match(adminSetCookie, /SameSite=Lax/i);

  const disabledLogin = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: process.env.APP_URL ?? '' },
    body: JSON.stringify({ email: 'disabled@example.com', password: 'password123' }),
  });
  assert.equal(disabledLogin.status, 403);

  const adminCheck = await fetch(`${baseUrl}/admin/login-check`, { method: 'POST', headers: { Cookie: adminCookie, Origin: process.env.APP_URL } });
  assert.equal(adminCheck.status, 200);
  assert.deepEqual(await adminCheck.json(), { authenticated: true, role: 'admin' });

  const invalidDisable = await fetch(`${baseUrl}/admin/users/${targetId}/disable`, {
    method: 'POST',
    headers: { Cookie: adminCookie, Origin: process.env.APP_URL, 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason: '' }),
  });
  assert.equal(invalidDisable.status, 400);
  const invalidDisableAudit = requests.find((request) => request.path === '/rest/v1/admin_audit_logs'
    && request.method === 'POST' && request.body.action === 'user.disable'
    && request.body.result === 'denied');
  assert.deepEqual(invalidDisableAudit?.body.details, { cause: 'invalid_input' });

  const overview = await fetch(`${baseUrl}/admin/overview`, { headers: { Cookie: adminCookie } });
  assert.equal(overview.status, 200);
  assert.deepEqual(await overview.json(), {
    totalAccounts: 4, newAccounts30d: 1, activeAccounts: 3, disabledAccounts: 1, totalTransactions: 12,
  });
  const regularOverview = await fetch(`${baseUrl}/admin/overview`, { headers: { Cookie: regularCookie } });
  assert.equal(regularOverview.status, 403);

  const growth = await fetch(`${baseUrl}/admin/account-growth`, { headers: { Cookie: adminCookie } });
  assert.equal(growth.status, 200);
  assert.deepEqual((await growth.json() as { points: Array<{ day: string; accounts: number }> }).points, [{ day: '2026-10-13', accounts: 1 }]);
  const storageUsage = await fetch(`${baseUrl}/admin/storage-usage`, { headers: { Cookie: adminCookie } });
  assert.equal(storageUsage.status, 200);
  assert.deepEqual(await storageUsage.json(), { objectCount: 3, totalBytes: 2048 });

  const health = await fetch(`${baseUrl}/admin/health`, { headers: { Cookie: adminCookie } });
  assert.equal(health.status, 200);
  assert.equal(health.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await health.json(), { status: 'ok', checks: { database: true, auth: true, storage: true } });
  const publicStatus = await fetch(`${baseUrl}/public/service-status`);
  assert.equal(publicStatus.status, 200);
  assert.equal(publicStatus.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await publicStatus.json(), { announcement: null, maintenanceMode: false });
  const auditPage = await fetch(`${baseUrl}/admin/audit-logs`, { headers: { Cookie: adminCookie } });
  assert.equal(auditPage.status, 200);
  assert.deepEqual((await auditPage.json() as { logs: unknown[] }).logs, []);
  const filteredAudit = await fetch(
    `${baseUrl}/admin/audit-logs?action=user.disable&actorRole=owner&actorId=${adminId}&from=2026-10-01&to=2026-10-14`,
    { headers: { Cookie: adminCookie } },
  );
  assert.equal(filteredAudit.status, 200);
  const auditQuery = requests.find((request) => request.path === '/rest/v1/admin_audit_logs'
    && request.query.get('actor_user_id') === `eq.${adminId}`);
  assert.equal(auditQuery?.query.get('action'), 'eq.user.disable');
  assert.equal(auditQuery?.query.get('actor_role'), 'eq.owner');
  assert.equal(auditQuery?.query.get('created_at'), 'gte.2026-10-01T00:00:00.000Z');
  const invalidAuditDate = await fetch(`${baseUrl}/admin/audit-logs?from=2026-02-31`, { headers: { Cookie: adminCookie } });
  assert.equal(invalidAuditDate.status, 400);
  const invalidAuditAdmin = await fetch(`${baseUrl}/admin/audit-logs?actorId=not-a-uuid`, { headers: { Cookie: adminCookie } });
  assert.equal(invalidAuditAdmin.status, 400);
  const announcement = await fetch(`${baseUrl}/admin/settings/announcement`, {
    method: 'PATCH', headers: { Cookie: adminCookie, Origin: process.env.APP_URL, 'Content-Type': 'application/json' },
    body: JSON.stringify({ announcement: 'Pemeliharaan terjadwal', reason: 'Informasi layanan' }),
  });
  assert.equal(announcement.status, 200);
  const maintenance = await fetch(`${baseUrl}/admin/settings/maintenance`, {
    method: 'PATCH', headers: { Cookie: adminCookie, Origin: process.env.APP_URL, 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled: true, reason: 'Pemeliharaan terjadwal' }),
  });
  assert.equal(maintenance.status, 200);
  const metricsExport = await fetch(`${baseUrl}/admin/export/metrics`, { headers: { Cookie: adminCookie } });
  assert.equal(metricsExport.status, 200);
  assert.match(await metricsExport.text(), /^"metric","value"\r\n"total_accounts","4"/);

  const users = await fetch(`${baseUrl}/admin/users?page=1&pageSize=10`, { headers: { Cookie: adminCookie } });
  assert.equal(users.status, 200);
  const userList = await users.json() as { users: Array<Record<string, unknown>> };
  assert.deepEqual(Object.keys(userList.users[0]).sort(), ['account_status', 'created_at', 'disabled_reason', 'email', 'emailConfirmed', 'id', 'name']);
  assert.equal(userList.users[0].emailConfirmed, true);
  assert.equal(JSON.stringify(userList).match(/initial_balance|transactions|receipt|password|token/gi), null);
  const usersQuery = requests.find((request) => request.path === '/rest/v1/users'
    && request.method === 'GET' && request.query.get('select')?.includes('disabled_reason'));
  assert.equal(usersQuery?.query.get('select'), 'id,name,email,created_at,account_status,disabled_reason');
  const invalidUserPage = await fetch(`${baseUrl}/admin/users?page=1&pageSize=51`, { headers: { Cookie: adminCookie } });
  assert.equal(invalidUserPage.status, 400);
  const invalidUserSort = await fetch(`${baseUrl}/admin/users?sortBy=transactions`, { headers: { Cookie: adminCookie } });
  assert.equal(invalidUserSort.status, 400);

  const disableTarget = await fetch(`${baseUrl}/admin/users/${targetId}/disable`, {
    method: 'POST', headers: { Cookie: adminCookie, Origin: process.env.APP_URL, 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason: 'Pelanggaran kebijakan' }),
  });
  assert.equal(disableTarget.status, 204);
  const enableTarget = await fetch(`${baseUrl}/admin/users/${targetId}/enable`, {
    method: 'POST', headers: { Cookie: adminCookie, Origin: process.env.APP_URL, 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason: 'Kasus sudah diselesaikan' }),
  });
  assert.equal(enableTarget.status, 204);

  const disableSelf = await fetch(`${baseUrl}/admin/users/${adminId}/disable`, {
    method: 'POST', headers: { Cookie: adminCookie, Origin: process.env.APP_URL, 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason: 'Permintaan pengujian' }),
  });
  assert.equal(disableSelf.status, 400);
  const disableOwner = await fetch(`${baseUrl}/admin/users/${ownerId}/disable`, {
    method: 'POST', headers: { Cookie: adminCookie, Origin: process.env.APP_URL, 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason: 'Uji perlindungan owner' }),
  });
  assert.equal(disableOwner.status, 403);
  const deleteSelf = await fetch(`${baseUrl}/admin/users/${adminId}`, {
    method: 'DELETE', headers: { Cookie: adminCookie, Origin: process.env.APP_URL, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@example.com', reason: 'Permintaan pengujian' }),
  });
  assert.equal(deleteSelf.status, 400);
  const deleteOwner = await fetch(`${baseUrl}/admin/users/${ownerId}`, {
    method: 'DELETE', headers: { Cookie: adminCookie, Origin: process.env.APP_URL, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'owner@example.com', reason: 'Uji perlindungan owner' }),
  });
  assert.equal(deleteOwner.status, 403);

  const wrongEmailDelete = await fetch(`${baseUrl}/admin/users/${targetId}`, {
    method: 'DELETE', headers: { Cookie: adminCookie, Origin: process.env.APP_URL, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'wrong@example.com', reason: 'Permintaan penghapusan' }),
  });
  assert.equal(wrongEmailDelete.status, 400);
  assert.equal(requests.some((request) => request.method === 'DELETE' && request.path === `/auth/v1/admin/users/${targetId}`), false);
  const wrongCaseDelete = await fetch(`${baseUrl}/admin/users/${targetId}`, {
    method: 'DELETE', headers: { Cookie: adminCookie, Origin: process.env.APP_URL, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'Target@example.com', reason: 'Konfirmasi harus sama persis' }),
  });
  assert.equal(wrongCaseDelete.status, 400);
  assert.equal(requests.some((request) => request.method === 'DELETE' && request.path === `/auth/v1/admin/users/${targetId}`), false);

  const deleteTarget = await fetch(`${baseUrl}/admin/users/${targetId}`, {
    method: 'DELETE', headers: { Cookie: adminCookie, Origin: process.env.APP_URL, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'target@example.com', reason: 'Akun diminta dihapus' }),
  });
  assert.equal(deleteTarget.status, 204);
  assert.ok(requests.some((request) => request.path === '/rest/v1/admin_audit_logs'
    && request.method === 'PATCH' && request.body.result === 'success'));
  assert.ok(requests.some((request) => request.path === '/rest/v1/admin_audit_logs'
    && request.method === 'POST' && request.body.action === 'user.delete' && request.body.result === 'denied'));
  const serializedAuditRows = JSON.stringify(requests.filter((request) => request.path === '/rest/v1/admin_audit_logs'));
  assert.doesNotMatch(serializedAuditRows, /test-admin-access|test-regular-access|receiptPath|initial_balance|transaction description/i);

  disabledAccountIds.add(regularId);
  const disabledExistingSession = await fetch(`${baseUrl}/admin/overview`, { headers: { Cookie: regularCookie } });
  assert.equal(disabledExistingSession.status, 401);
  disabledAccountIds.delete(regularId);

  accountStatusMigrationApplied = false;
  const legacyUserLogin = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: process.env.APP_URL ?? '' },
    body: JSON.stringify({ email: 'user@example.com', password: 'password123' }),
  });
  assert.equal(legacyUserLogin.status, 200);
  const legacyUserCookie = legacyUserLogin.headers.get('set-cookie')?.split(';')[0] ?? '';
  const legacySession = await fetch(`${baseUrl}/auth/session`, { headers: { Cookie: legacyUserCookie } });
  assert.equal(legacySession.status, 200);
  assert.equal((await legacySession.json() as { user: unknown }).user !== null, true);
  const legacyDashboardSummary = await fetch(`${baseUrl}/dashboard-summary`, { headers: { Cookie: legacyUserCookie } });
  assert.equal(legacyDashboardSummary.status, 200);
  const legacyTransactions = await fetch(`${baseUrl}/transactions`, { headers: { Cookie: legacyUserCookie } });
  assert.equal(legacyTransactions.status, 200);
});