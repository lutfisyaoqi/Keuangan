import connectPgSimple from 'connect-pg-simple';
import { createClient, type User } from '@supabase/supabase-js';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import session, { type Store } from 'express-session';
import { Pool } from 'pg';
import express, { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '../src/types/finance';

type Database = {
  __InternalSupabase: { PostgrestVersion: '14.1.0' };
  public: {
    Tables: {
      users: {
        Row: { id: string; name: string; email: string; initial_balance: number; account_status: 'active' | 'disabled'; disabled_reason: string | null; created_at: string; updated_at: string };
        Insert: { id: string; name: string; email: string; initial_balance?: number; account_status?: 'active' | 'disabled'; disabled_reason?: string | null; created_at?: string; updated_at?: string };
        Update: { id?: string; name?: string; email?: string; initial_balance?: number; account_status?: 'active' | 'disabled'; disabled_reason?: string | null; created_at?: string; updated_at?: string };
        Relationships: [];
      };
      transactions: {
        Row: { id: string; user_id: string; date: string; amount: number; description: string; type: 'income' | 'expense'; category: string; created_at: string; updated_at: string; receipt_path?: string | null; receipt_mime?: string | null; receipt_size?: number | null };
        Insert: { id?: string; user_id: string; date: string; amount: number; description: string; type: 'income' | 'expense'; category?: string; created_at?: string; updated_at?: string; receipt_path?: string | null; receipt_mime?: string | null; receipt_size?: number | null };
        Update: { id?: string; user_id?: string; date?: string; amount?: number; description?: string; type?: 'income' | 'expense'; category?: string; created_at?: string; updated_at?: string; receipt_path?: string | null; receipt_mime?: string | null; receipt_size?: number | null };
        Relationships: [];
      };
      admin_users: {
        Row: { user_id: string; role: 'admin' | 'support' | 'owner'; created_at: string };
        Insert: { user_id: string; role: 'admin' | 'support' | 'owner'; created_at?: string };
        Update: { user_id?: string; role?: 'admin' | 'support' | 'owner'; created_at?: string };
        Relationships: [];
      };
      admin_audit_logs: {
        Row: { id: number; actor_user_id: string | null; actor_role: 'admin' | 'support' | 'owner'; action: string; target_user_id: string | null; reason: string | null; result: 'pending' | 'success' | 'denied'; details: Record<string, unknown>; created_at: string };
        Insert: { id?: number; actor_user_id?: string | null; actor_role: 'admin' | 'support' | 'owner'; action: string; target_user_id?: string | null; reason?: string | null; result: 'pending' | 'success' | 'denied'; details?: Record<string, unknown>; created_at?: string };
        Update: { id?: number; actor_user_id?: string | null; actor_role?: 'admin' | 'support' | 'owner'; action?: string; target_user_id?: string | null; reason?: string | null; result?: 'pending' | 'success' | 'denied'; details?: Record<string, unknown>; created_at?: string };
        Relationships: [];
      };
      app_settings: {
        Row: { id: boolean; announcement: string | null; maintenance_mode: boolean; updated_by: string | null; updated_at: string };
        Insert: { id?: boolean; announcement?: string | null; maintenance_mode?: boolean; updated_by?: string | null; updated_at?: string };
        Update: { id?: boolean; announcement?: string | null; maintenance_mode?: boolean; updated_by?: string | null; updated_at?: string };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      dashboard_summary: { Args: Record<PropertyKey, never>; Returns: { initial_balance: number; total_income: number; total_expense: number; transaction_count: number; income_count: number; expense_count: number }[] };
      admin_get_overview: { Args: Record<PropertyKey, never>; Returns: { total_accounts: number; new_accounts_30d: number; active_accounts: number; disabled_accounts: number; total_transactions: number }[] };
      admin_get_account_growth: { Args: Record<PropertyKey, never>; Returns: { day: string; accounts: number }[] };
      admin_get_storage_usage: { Args: Record<PropertyKey, never>; Returns: { object_count: number; total_bytes: number }[] };
      delete_my_account: { Args: Record<PropertyKey, never>; Returns: undefined };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

declare module 'express-session' {
  interface SessionData {
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number;
    adminSession?: boolean;
  }
}

declare global {
  namespace Express {
    interface Request {
      authUser?: User;
      authToken?: string;
      userClient?: ReturnType<typeof makeClient>;
      adminRole?: 'admin' | 'support' | 'owner';
    }
  }
}

const sessionCookieName = 'catatuang.sid';
const sessionMaxAge = 30 * 24 * 60 * 60 * 1000;
const adminSessionMaxAge = 30 * 60 * 1000;
const receiptBucket = 'transaction-receipts';
const maxReceiptSize = 5 * 1024 * 1024;
let sessionPool: Pool | undefined;
let missingAdminKeyLogged = false;

const serverEnvSchema = z.object({
  DATABASE_URL: z.string().url().refine((value) => value.startsWith('postgres://') || value.startsWith('postgresql://')),
  SUPABASE_URL: z.string().url().refine((value) =>
    !/(?:example-project\.supabase\.co|placeholder|your[-_ ]|change[-_ ]me|replace[-_ ]me|dummy|xxxx)/i.test(value)
  ),
  SUPABASE_ANON_KEY: z.string().min(1).refine((value) =>
    !/(?:placeholder|your[-_ ]|change[-_ ]me|replace[-_ ]me|dummy|xxxx)/i.test(value)
  ),
  AUTH_SECRET: z.string().min(32),
  APP_URL: z.string().url().refine((value) => {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.pathname === '/' && !url.search && !url.hash;
  }),
});

function readServerEnvironment() {
  const required = ['DATABASE_URL', 'SUPABASE_URL', 'SUPABASE_ANON_KEY', 'AUTH_SECRET', 'APP_URL'] as const;
  for (const name of required) {
    if (!process.env[name]?.trim()) {
      throw new Error(`Missing required environment variable: ${name}`);
    }
  }

  const result = serverEnvSchema.safeParse(process.env);
  if (!result.success) {
    const name = String(result.error.issues[0]?.path[0] ?? 'configuration');
    throw new Error(`Invalid environment variable: ${name}`);
  }
  if (process.env.NODE_ENV === 'production') {
    if (!result.data.SUPABASE_URL.startsWith('https://')) {
      throw new Error('SUPABASE_URL must use HTTPS in production.');
    }
    if (!result.data.APP_URL.startsWith('https://')) {
      throw new Error('APP_URL must use HTTPS in production.');
    }
  }
  return result.data;
}

const emptyQueryValueToUndefined = (value: unknown) =>
  typeof value === 'string' && !value.trim() ? undefined : value;

const transactionSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }),
  amount: z.number().int().positive().max(99_999_999_999_999),
  description: z.string().trim().min(1).max(200),
  type: z.enum(['income', 'expense']),
  category: z.string().trim().min(1).max(100).default('Lainnya'),
  receiptPath: z.preprocess(emptyQueryValueToUndefined, z.string().trim().min(1).max(500).nullable().optional()),
  receiptMime: z.preprocess(emptyQueryValueToUndefined, z.enum(['image/jpeg', 'image/png', 'image/webp']).nullable().optional()),
  receiptSize: z.preprocess(emptyQueryValueToUndefined, z.number().int().positive().max(maxReceiptSize).nullable().optional()),
}).superRefine((transaction, context) => {
  const categories = transaction.type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  if (!(categories as readonly string[]).includes(transaction.category)) {
    context.addIssue({ code: 'custom', path: ['category'], message: 'Kategori tidak sesuai dengan tipe transaksi.' });
  }
  const receiptFields = [transaction.receiptPath, transaction.receiptMime, transaction.receiptSize];
  const fieldsSupplied = receiptFields.some((value) => value !== undefined);
  const allFieldsSupplied = receiptFields.every((value) => value !== undefined);
  const allFieldsCleared = receiptFields.every((value) => value === null);
  const allFieldsSet = receiptFields.every((value) => value != null);
  if (fieldsSupplied && (!allFieldsSupplied || (!allFieldsCleared && !allFieldsSet))) {
    context.addIssue({ code: 'custom', path: ['receiptPath'], message: 'Metadata bukti transaksi harus lengkap.' });
  }
});

export function validateTransactionInput(value: unknown, userId: string) {
  const result = transactionSchema.safeParse(value);
  if (result.success && result.data.receiptPath && !isReceiptPathForUser(result.data.receiptPath, userId)) {
    return { success: false as const, error: new Error('Path bukti transaksi bukan milik pengguna.') };
  }
  return result;
}

function receiptMetadataToDatabase(transaction: z.infer<typeof transactionSchema>) {
  if (transaction.receiptPath === undefined && transaction.receiptMime === undefined && transaction.receiptSize === undefined) {
    return {};
  }
  return {
    receipt_path: transaction.receiptPath,
    receipt_mime: transaction.receiptMime,
    receipt_size: transaction.receiptSize,
  };
}

function isMissingReceiptSchema(error: unknown) {
  const details = error && typeof error === 'object'
    ? error as { code?: unknown; message?: unknown; details?: unknown }
    : {};
  const message = [details.message, details.details].filter((part) => typeof part === 'string').join(' ');
  return (details.code === '42703' || details.code === 'PGRST204' || details.code === 'PGRST200')
    && /receipt_(path|mime|size)/i.test(message);
}

function isReceiptPathForUser(receiptPath: unknown, userId: string): receiptPath is string {
  return typeof receiptPath === 'string'
    && receiptPath.startsWith(`${userId}/`)
    && !receiptPath.includes('..')
    && !receiptPath.startsWith('/');
}

export function transactionRetentionCutoff(reference = new Date()) {
  const year = reference.getUTCFullYear();
  const month = reference.getUTCMonth() - 2;
  const day = reference.getUTCDate();
  const targetMonthEnd = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(day, targetMonthEnd))).toISOString().slice(0, 10);
}

function hasValidCronAuthorization(header: string | undefined, secret: string) {
  if (!header) return false;
  const supplied = Buffer.from(header);
  const expected = Buffer.from(`Bearer ${secret}`);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

function receiptMimeFromBytes(body: Buffer): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (body.length >= 3 && body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff) return 'image/jpeg';
  if (body.length >= 8 && body.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) return 'image/png';
  if (body.length >= 12 && body.toString('ascii', 0, 4) === 'RIFF' && body.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

function receiptFileName(headerValue: string | undefined, mime: string) {
  let candidate = headerValue ?? '';
  try {
    candidate = decodeURIComponent(candidate);
  } catch {
    candidate = '';
  }
  const basename = candidate.split(/[\\/]/).pop() ?? '';
  const stem = basename.replace(/\.[^.]*$/, '').replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
  const extension = mime === 'image/jpeg' ? 'jpg' : mime === 'image/png' ? 'png' : 'webp';
  return `${stem || 'receipt'}.${extension}`;
}

const emailSchema = z.string().trim().email().max(254).transform((value) => value.toLowerCase());
const emailConfirmationSchema = z.string().trim().email().max(254);
const profileSchema = z.object({
  name: z.string().trim().min(2).max(100),
});

function jsonError(res: Response, status: number, message: string) {
  res.status(status).json({ error: message });
}

export function escapeCsvCell(value: string | number) {
  const text = String(value);
  const safe = /^[\t\r\n ]*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

function asyncRoute(handler: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    void handler(req, res, next).catch(next);
  };
}

function makeClient(accessToken?: string) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase configuration is missing.');

  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    ...(accessToken ? { global: { headers: { Authorization: `Bearer ${accessToken}` } } } : {}),
  });
}

function makeAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured.');
  return createClient<Database>(process.env.SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

async function readAccountStatus(userId: string, accessToken: string) {
  return makeClient(accessToken).from('users').select('account_status').eq('id', userId).maybeSingle();
}

function isMissingAccountStatusColumn(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const details = error as { code?: unknown; message?: unknown; details?: unknown };
  const code = details.code;
  const message = [details.message, details.details]
    .filter((value): value is string => typeof value === 'string')
    .join(' ');
  return (code === '42703' || code === 'PGRST204' || code === 'PGRST200')
    && /account_status/i.test(message);
}

function saveSession(req: Request, accessToken: string, refreshToken: string, expiresAt: number, adminSession = false) {
  return new Promise<void>((resolve, reject) => {
    req.session.regenerate((error) => {
      if (error) return reject(error);
      req.session.accessToken = accessToken;
      req.session.refreshToken = refreshToken;
      req.session.expiresAt = expiresAt;
      req.session.adminSession = adminSession;
      req.session.cookie.maxAge = adminSession ? adminSessionMaxAge : sessionMaxAge;
      req.session.save((saveError) => (saveError ? reject(saveError) : resolve()));
    });
  });
}

function errorHasCode(error: unknown, codes: readonly string[]) {
  const pending: unknown[] = [error];
  const seen = new Set<unknown>();
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current || typeof current !== 'object' || seen.has(current)) continue;
    seen.add(current);
    const details = current as { code?: unknown; cause?: unknown; errors?: unknown };
    if (typeof details.code === 'string' && codes.includes(details.code)) return true;
    if (details.cause) pending.push(details.cause);
    if (Array.isArray(details.errors)) pending.push(...details.errors);
  }
  return false;
}

function destroySession(req: Request) {
  return new Promise<void>((resolve, reject) => {
    if (!req.session) return resolve();
    req.session.destroy((error) => (error ? reject(error) : resolve()));
  });
}

async function getAuthenticatedUser(req: Request): Promise<User | null> {
  if (!req.session.accessToken || !req.session.refreshToken) return null;

  const authClient = makeClient();
  let accessToken = req.session.accessToken;
  let expiresAt = req.session.expiresAt ?? 0;

  if (expiresAt <= Math.floor(Date.now() / 1000) + 60) {
    const { data, error } = await authClient.auth.refreshSession({
      refresh_token: req.session.refreshToken,
    });
    if (error || !data.session) return null;
    accessToken = data.session.access_token;
    expiresAt = data.session.expires_at ?? 0;
    req.session.accessToken = accessToken;
    req.session.refreshToken = data.session.refresh_token;
    req.session.expiresAt = expiresAt;
  }

  const { data, error } = await authClient.auth.getUser(accessToken);
  if (error || !data.user) return null;

  const { data: profile, error: profileError } = await readAccountStatus(data.user.id, accessToken);
  if (profileError && !isMissingAccountStatusColumn(profileError)) {
    throw new Error('Account status could not be verified.');
  }
  if (!profileError && (!profile || profile.account_status === 'disabled')) return null;

  req.authToken = accessToken;
  req.authUser = data.user;
  req.userClient = makeClient(accessToken);
  return data.user;
}

async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      if (req.session.accessToken || req.session.refreshToken) {
        await destroySession(req);
        res.clearCookie(sessionCookieName, { path: '/' });
      }
      jsonError(res, 401, 'Sesi berakhir. Silakan login kembali.');
      return;
    }
    next();
  } catch {
    jsonError(res, 503, 'Layanan autentikasi sedang tidak tersedia.');
  }
}

function profileFromUser(user: User, name: string) {
  return {
    id: user.id,
    name,
    email: user.email ?? '',
  };
}

function protectAgainstCsrf(appUrl: string) {
  const expectedOrigin = new URL(appUrl).origin;
  return (req: Request, res: Response, next: NextFunction) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      next();
      return;
    }
    if (req.path.startsWith('/admin/') && req.path !== '/admin/auth/login'
      && !req.session.accessToken) {
      next();
      return;
    }

    try {
      const origin = req.get('origin');
      const referer = req.get('referer');
      const source = origin || (referer ? new URL(referer).origin : '');
      if (!source || source !== expectedOrigin) {
        jsonError(res, 403, 'Permintaan tidak dapat diverifikasi. Muat ulang halaman dan coba lagi.');
        return;
      }
      next();
    } catch {
      jsonError(res, 403, 'Permintaan tidak dapat diverifikasi. Muat ulang halaman dan coba lagi.');
    }
  };
}

export function createApiRouter(options: { sessionStore?: Store } = {}) {
  const config = readServerEnvironment();
  const pool = options.sessionStore ? undefined : new Pool({ connectionString: config.DATABASE_URL });
  if (pool) sessionPool = pool;
  const PgStore = connectPgSimple(session);
  const router = Router();
  const secureCookie = process.env.NODE_ENV === 'production';
  const store = options.sessionStore ?? new PgStore({
    pool: pool!,
    tableName: 'catatuang_express_sessions',
    createTableIfMissing: false,
  });

  router.use(session({
    name: sessionCookieName,
    secret: config.AUTH_SECRET,
    store,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: secureCookie,
      sameSite: 'lax',
      maxAge: sessionMaxAge,
      path: '/',
    },
    rolling: true,
  }));
  router.use('/admin', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  const adminApiRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 120,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (req) => req.socket.remoteAddress ? ipKeyGenerator(req.socket.remoteAddress) : 'unknown',
    message: { error: 'Terlalu banyak permintaan admin. Coba lagi beberapa saat.' },
  });
  router.use('/admin', adminApiRateLimit);
  router.use(protectAgainstCsrf(config.APP_URL));

  router.get('/cron/purge-old-transactions', asyncRoute(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const secret = process.env.CRON_SECRET?.trim();
    if (!secret) {
      jsonError(res, 503, 'Jadwal penghapusan belum dikonfigurasi.');
      return;
    }
    if (!hasValidCronAuthorization(req.get('authorization'), secret)) {
      jsonError(res, 401, 'Tidak diizinkan.');
      return;
    }
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
      jsonError(res, 503, 'Layanan penghapusan belum dikonfigurasi.');
      return;
    }

    const cutoffDate = transactionRetentionCutoff();
    const adminClient = makeAdminClient();
    const batchSize = 100;
    let expiredRows: Array<{ id: string; user_id: string; receipt_path: string | null }>;
    const { data, error } = await adminClient.from('transactions')
      .select('id,user_id,receipt_path')
      .lt('date', cutoffDate)
      .order('date', { ascending: true })
      .limit(batchSize);

    if (error && isMissingReceiptSchema(error)) {
      const legacyResult = await adminClient.from('transactions')
        .select('id,user_id')
        .lt('date', cutoffDate)
        .order('date', { ascending: true })
        .limit(batchSize);
      if (legacyResult.error) {
        console.error('Automatic transaction retention query failed');
        jsonError(res, 503, 'Riwayat transaksi belum dapat dibersihkan.');
        return;
      }
      expiredRows = (legacyResult.data ?? []).map((row) => ({
        id: row.id,
        user_id: row.user_id,
        receipt_path: null,
      }));
    } else if (error) {
      console.error('Automatic transaction retention query failed');
      jsonError(res, 503, 'Riwayat transaksi belum dapat dibersihkan.');
      return;
    } else {
      expiredRows = (data ?? []).map((row) => ({
        id: row.id,
        user_id: row.user_id,
        receipt_path: row.receipt_path ?? null,
      }));
    }

    if (expiredRows.length === 0) {
      res.json({ deleted: 0, cutoffDate, morePending: false });
      return;
    }

    const receiptPaths = [...new Set(expiredRows.flatMap((row) =>
      isReceiptPathForUser(row.receipt_path, row.user_id) ? [row.receipt_path] : []))];
    if (receiptPaths.length > 0) {
      const { error: storageError } = await adminClient.storage.from(receiptBucket).remove(receiptPaths);
      if (storageError) {
        console.error('Automatic transaction receipt cleanup failed');
        jsonError(res, 503, 'Foto bukti transaksi belum dapat dibersihkan.');
        return;
      }
    }

    const { data: deletedRows, error: deleteError } = await adminClient.from('transactions')
      .delete()
      .in('id', expiredRows.map((row) => row.id))
      .lt('date', cutoffDate)
      .select('id');
    if (deleteError) {
      console.error('Automatic transaction retention delete failed');
      jsonError(res, 503, 'Riwayat transaksi belum dapat dibersihkan.');
      return;
    }

    res.json({
      deleted: deletedRows?.length ?? 0,
      cutoffDate,
      morePending: expiredRows.length === batchSize,
    });
  }));

  router.get('/public/service-status', asyncRoute(async (_req, res) => {
    const { data, error } = await makeAdminClient().from('app_settings')
      .select('announcement,maintenance_mode')
      .eq('id', true)
      .maybeSingle();
    if (error || !data) {
      jsonError(res, 503, 'Informasi layanan belum tersedia.');
      return;
    }
    res.setHeader('Cache-Control', 'no-store');
    res.json({ announcement: data.announcement, maintenanceMode: data.maintenance_mode });
  }));

  const authRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Terlalu banyak percobaan. Coba lagi beberapa saat.' },
  });
  const adminLoginRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    standardHeaders: 'draft-8',
    message: { error: 'Terlalu banyak percobaan admin. Coba lagi beberapa saat.' },
    keyGenerator: (req) => req.socket.remoteAddress ? ipKeyGenerator(req.socket.remoteAddress) : 'unknown',
  });

  async function lookupAdminRole(userId: string) {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
      if (!missingAdminKeyLogged) {
        console.error('Admin role verification unavailable: server-only Supabase service key is not configured.');
        missingAdminKeyLogged = true;
      }
      return { status: 'unavailable' as const };
    }
    try {
      const { data, error } = await makeAdminClient().from('admin_users')
        .select('role')
        .eq('user_id', userId)
        .maybeSingle();
      if (error) {
        const details = error as { code?: string; message?: string };
        if (details.code === '42P01' || details.code === 'PGRST205'
          || /admin_users.+(does not exist|not found|schema cache)/i.test(details.message ?? '')) {
          console.error('Admin role verification unavailable: apply the admin database migration.');
        } else {
          console.error('Admin role verification unavailable: role lookup failed.');
        }
        return { status: 'unavailable' as const };
      }
      missingAdminKeyLogged = false;
      return data ? { status: 'found' as const, role: data.role } : { status: 'missing' as const };
    } catch {
      console.error('Admin role verification unavailable: server-side client initialization failed.');
      return { status: 'unavailable' as const };
    }
  }

  const requireAdmin: express.RequestHandler = (req, res, next) => {
    void (async () => {
      const roleResult = req.authUser ? await lookupAdminRole(req.authUser.id) : { status: 'missing' as const };
      if (roleResult.status === 'unavailable') {
        jsonError(res, 503, 'Akses admin sementara tidak dapat diverifikasi.');
        return;
      }
      if (roleResult.status === 'missing') {
        jsonError(res, 403, 'Akses admin diperlukan.');
        return;
      }
      req.adminRole = roleResult.role;
      next();
    })().catch(next);
  };
  const requireAdminWriter: express.RequestHandler = (req, res, next) => {
    if (req.adminRole === 'support') {
      const action = req.path.includes('/users/') ? `user.${req.method.toLowerCase()}`
        : req.path.includes('/announcement') ? 'settings.announcement.update'
          : 'settings.maintenance.update';
      const targetUserId = z.string().uuid().safeParse(req.params.id);
      void writeAdminAudit(
        req,
        action,
        targetUserId.success ? targetUserId.data : null,
        null,
        'denied',
        { cause: 'role_read_only' },
      ).then(() => jsonError(res, 403, 'Role support hanya memiliki akses baca.')).catch(next);
      return;
    }
    next();
  };

  async function writeAdminAudit(
    req: Request,
    action: string,
    targetUserId: string | null,
    reason: string | null,
    result: 'pending' | 'success' | 'denied',
    details: Record<string, unknown> = {},
  ) {
    const { data, error } = await makeAdminClient().from('admin_audit_logs').insert({
      actor_user_id: req.authUser!.id,
      actor_role: req.adminRole!,
      action,
      target_user_id: targetUserId,
      reason,
      result,
      details,
    }).select('id').single();
    if (error || !data) throw new Error('Admin audit log could not be written.');
    return data.id;
  }

  async function completeAdminAudit(id: number, result: 'success' | 'denied') {
    const { data, error } = await makeAdminClient().from('admin_audit_logs')
      .update({ result })
      .eq('id', id)
      .select('id')
      .maybeSingle();
    if (error || !data) throw new Error('Admin audit log could not be finalized.');
  }

  const reasonSchema = z.string().trim().min(3).max(500);

  router.post('/admin/auth/login', adminLoginRateLimit, asyncRoute(async (req, res) => {
    const input = z.object({ email: emailSchema, password: z.string().min(1).max(128) }).safeParse(req.body);
    if (!input.success) {
      jsonError(res, 401, 'Email atau password admin salah.');
      return;
    }

    let authResult;
    try {
      authResult = await makeClient().auth.signInWithPassword(input.data);
    } catch {
      console.error('Admin login failed: Supabase authentication service is unavailable.');
      jsonError(res, 503, 'Login admin belum dapat diproses. Coba lagi nanti.');
      return;
    }
    const { data, error } = authResult;
    if (error || !data.session || !data.user) {
      console.warn('Admin login denied: invalid credentials.');
      jsonError(res, 401, 'Email atau password admin salah.');
      return;
    }

    const discardAuthSession = async () => {
      const authClient = makeClient();
      const { error: setSessionError } = await authClient.auth.setSession({
        access_token: data.session!.access_token,
        refresh_token: data.session!.refresh_token,
      });
      if (!setSessionError) await authClient.auth.signOut({ scope: 'local' });
    };

    let profile;
    try {
      profile = await readAccountStatus(data.user.id, data.session.access_token);
    } catch {
      await discardAuthSession().catch(() => console.error('Admin login session cleanup failed'));
      console.error('Admin login unavailable: account status could not be verified.');
      jsonError(res, 503, 'Login admin sementara tidak dapat diverifikasi.');
      return;
    }
    if (profile.error || !profile.data) {
      await discardAuthSession().catch(() => console.error('Admin login session cleanup failed'));
      console.error(isMissingAccountStatusColumn(profile.error)
        ? 'Admin login unavailable: verify the account-status/admin database migration.'
        : 'Admin login unavailable: account status could not be verified.');
      jsonError(res, 503, 'Login admin sementara tidak dapat diverifikasi.');
      return;
    }
    if (profile.data.account_status === 'disabled') {
      await discardAuthSession().catch(() => console.error('Admin login session cleanup failed'));
      console.warn('Admin login denied: account is disabled.');
      jsonError(res, 401, 'Email atau password admin salah.');
      return;
    }

    const roleResult = await lookupAdminRole(data.user.id);
    if (roleResult.status === 'unavailable') {
      await discardAuthSession().catch(() => console.error('Admin login session cleanup failed'));
      jsonError(res, 503, 'Login admin sementara tidak dapat diverifikasi.');
      return;
    }
    if (roleResult.status === 'missing') {
      await discardAuthSession().catch(() => console.error('Admin login session cleanup failed'));
      console.warn('Admin login denied: authenticated account has no admin role.');
      jsonError(res, 401, 'Email atau password admin salah.');
      return;
    }

    try {
      await saveSession(
        req,
        data.session.access_token,
        data.session.refresh_token,
        data.session.expires_at ?? 0,
        true,
      );
    } catch {
      jsonError(res, 503, 'Sesi admin belum dapat dibuat. Coba lagi nanti.');
      return;
    }
    const name = typeof data.user.user_metadata?.name === 'string'
      ? data.user.user_metadata.name
      : data.user.email?.split('@')[0] ?? '';
    res.json({ user: profileFromUser(data.user, name), role: roleResult.role });
  }));

  router.post('/admin/login-check', requireAuth, requireAdmin, (req, res) => {
    res.json({ authenticated: true, role: req.adminRole });
  });

  router.get('/admin/overview', requireAuth, requireAdmin, asyncRoute(async (req, res) => {
    const { data, error } = await req.userClient!.rpc('admin_get_overview');
    const overview = Array.isArray(data) ? data[0] : null;
    if (error || !overview) {
      jsonError(res, 503, 'Metrik agregat admin belum dapat dimuat.');
      return;
    }
    res.json({
      totalAccounts: Number(overview.total_accounts),
      newAccounts30d: Number(overview.new_accounts_30d),
      activeAccounts: Number(overview.active_accounts),
      disabledAccounts: Number(overview.disabled_accounts),
      totalTransactions: Number(overview.total_transactions),
    });
  }));

  router.get('/admin/account-growth', requireAuth, requireAdmin, asyncRoute(async (req, res) => {
    const { data, error } = await req.userClient!.rpc('admin_get_account_growth');
    if (error || !Array.isArray(data)) {
      jsonError(res, 503, 'Grafik pertumbuhan akun belum dapat dimuat. Pastikan migrasi fitur admin terbaru sudah diterapkan.');
      return;
    }
    res.json({
      points: data.map((point) => ({ day: point.day, accounts: Number(point.accounts) })),
    });
  }));

  router.get('/admin/storage-usage', requireAuth, requireAdmin, asyncRoute(async (req, res) => {
    const { data, error } = await req.userClient!.rpc('admin_get_storage_usage');
    const usage = Array.isArray(data) ? data[0] : null;
    if (error || !usage) {
      jsonError(res, 503, 'Agregat penggunaan storage belum dapat dimuat. Pastikan migrasi fitur admin terbaru sudah diterapkan.');
      return;
    }
    res.json({ objectCount: Number(usage.object_count), totalBytes: Number(usage.total_bytes) });
  }));

  router.get('/admin/health', requireAuth, requireAdmin, asyncRoute(async (req, res) => {
    const adminClient = makeAdminClient();
    const results = await Promise.allSettled([
      adminClient.from('users').select('id', { head: true, count: 'exact' }).limit(1),
      adminClient.auth.getUser(req.authToken),
      adminClient.storage.listBuckets(),
    ]);
    const checks = {
      database: results[0].status === 'fulfilled' && !results[0].value.error,
      auth: results[1].status === 'fulfilled' && !results[1].value.error && Boolean(results[1].value.data.user),
      storage: results[2].status === 'fulfilled' && !results[2].value.error,
    };
    const status = Object.values(checks).every(Boolean) ? 200 : 503;
    res.status(status).json({ status: status === 200 ? 'ok' : 'degraded', checks });
  }));

  router.get('/admin/users', requireAuth, requireAdmin, asyncRoute(async (req, res) => {
    const query = z.object({
      page: z.preprocess(emptyQueryValueToUndefined, z.coerce.number().int().min(1).default(1)),
      pageSize: z.preprocess(emptyQueryValueToUndefined, z.coerce.number().int().min(1).max(50).default(20)),
      search: z.preprocess(emptyQueryValueToUndefined, z.string().trim().max(120).default('')),
      sortBy: z.preprocess(emptyQueryValueToUndefined, z.enum(['created_at', 'name', 'email', 'account_status']).default('created_at')),
      sortOrder: z.preprocess(emptyQueryValueToUndefined, z.enum(['asc', 'desc']).default('desc')),
    }).safeParse(req.query);
    if (!query.success) {
      jsonError(res, 400, 'Paginasi atau pencarian akun tidak valid.');
      return;
    }
    const { page, pageSize, search } = query.data;
    let request = makeAdminClient().from('users')
      .select('id,name,email,created_at,account_status,disabled_reason', { count: 'exact' });
    const safeSearch = search.replace(/[,%()\\.:!*"]/g, ' ').trim();
    if (safeSearch) request = request.or(`name.ilike.%${safeSearch}%,email.ilike.%${safeSearch}%`);
    const { data, error, count } = await request
      .order(query.data.sortBy, { ascending: query.data.sortOrder === 'asc' })
      .range((page - 1) * pageSize, page * pageSize - 1);
    if (error) {
      jsonError(res, 503, 'Daftar akun belum dapat dimuat.');
      return;
    }
    const adminClient = makeAdminClient();
    const confirmationResults = await Promise.all((data ?? []).map(async (account) => {
      const { data: authResult, error: authError } = await adminClient.auth.admin.getUserById(account.id);
      if (authError || !authResult.user) {
        return { account, emailConfirmed: null };
      }
      return { account, emailConfirmed: Boolean(authResult.user.email_confirmed_at) };
    }));
    if (confirmationResults.some((result) => result.emailConfirmed === null)) {
      console.error('Admin user list unavailable: email confirmation status could not be verified.');
      jsonError(res, 503, 'Status verifikasi email belum dapat dimuat. Coba muat ulang daftar akun.');
      return;
    }
    res.json({
      users: confirmationResults.map(({ account, emailConfirmed }) => ({ ...account, emailConfirmed })),
      total: count ?? 0,
      page,
      pageSize,
    });
  }));

  router.post('/admin/users/:id/disable', requireAuth, requireAdmin, requireAdminWriter, asyncRoute(async (req, res) => {
    const id = z.string().uuid().safeParse(req.params.id);
    const input = z.object({ reason: reasonSchema }).safeParse(req.body);
    if (!id.success || !input.success) {
      await writeAdminAudit(req, 'user.disable', id.success ? id.data : null,
        input.success ? input.data.reason : null, 'denied', { cause: 'invalid_input' });
      jsonError(res, 400, 'ID akun atau alasan penonaktifan tidak valid.');
      return;
    }
    if (id.data === req.authUser!.id) {
      await writeAdminAudit(req, 'user.disable', id.data, input.data.reason, 'denied', { cause: 'self_action' });
      jsonError(res, 400, 'Admin tidak dapat menonaktifkan akunnya sendiri.');
      return;
    }
    const targetRole = await lookupAdminRole(id.data);
    if (targetRole.status === 'unavailable') {
      try {
        await writeAdminAudit(req, 'user.disable', id.data, input.data.reason, 'denied', { cause: 'target_role_lookup_failed' });
      } catch {
        console.error('Admin disable attempt could not be recorded.');
      }
      jsonError(res, 503, 'Status akun belum dapat diverifikasi.');
      return;
    }
    if (targetRole.status === 'found' && targetRole.role === 'owner' && req.adminRole !== 'owner') {
      await writeAdminAudit(req, 'user.disable', id.data, input.data.reason, 'denied', { cause: 'owner_protection' });
      jsonError(res, 403, 'Akun owner hanya dapat dikelola oleh owner.');
      return;
    }
    const auditId = await writeAdminAudit(req, 'user.disable', id.data, input.data.reason, 'pending');
    const { data, error } = await makeAdminClient().from('users')
      .update({ account_status: 'disabled', disabled_reason: input.data.reason })
      .eq('id', id.data)
      .select('id')
      .maybeSingle();
    if (error) {
      await completeAdminAudit(auditId, 'denied');
      jsonError(res, 503, 'Status akun belum dapat diperbarui.');
      return;
    }
    if (!data) {
      await completeAdminAudit(auditId, 'denied');
      jsonError(res, 404, 'Akun tidak ditemukan.');
      return;
    }
    await completeAdminAudit(auditId, 'success');
    res.status(204).end();
  }));

  router.post('/admin/users/:id/enable', requireAuth, requireAdmin, requireAdminWriter, asyncRoute(async (req, res) => {
    const id = z.string().uuid().safeParse(req.params.id);
    const input = z.object({ reason: reasonSchema }).safeParse(req.body);
    if (!id.success || !input.success) {
      await writeAdminAudit(req, 'user.enable', id.success ? id.data : null,
        input.success ? input.data.reason : null, 'denied', { cause: 'invalid_input' });
      jsonError(res, 400, 'ID akun atau alasan aktivasi tidak valid.');
      return;
    }
    if (id.data === req.authUser!.id) {
      await writeAdminAudit(req, 'user.enable', id.data, input.data.reason, 'denied', { cause: 'self_action' });
      jsonError(res, 400, 'Admin tidak dapat mengubah status akunnya sendiri.');
      return;
    }
    const targetRole = await lookupAdminRole(id.data);
    if (targetRole.status === 'unavailable') {
      try {
        await writeAdminAudit(req, 'user.enable', id.data, input.data.reason, 'denied', { cause: 'target_role_lookup_failed' });
      } catch {
        console.error('Admin enable attempt could not be recorded.');
      }
      jsonError(res, 503, 'Status akun belum dapat diverifikasi.');
      return;
    }
    if (targetRole.status === 'found' && targetRole.role === 'owner' && req.adminRole !== 'owner') {
      await writeAdminAudit(req, 'user.enable', id.data, input.data.reason, 'denied', { cause: 'owner_protection' });
      jsonError(res, 403, 'Akun owner hanya dapat dikelola oleh owner.');
      return;
    }
    const auditId = await writeAdminAudit(req, 'user.enable', id.data, input.data.reason, 'pending');
    const { data, error } = await makeAdminClient().from('users')
      .update({ account_status: 'active', disabled_reason: null })
      .eq('id', id.data)
      .select('id')
      .maybeSingle();
    if (error) {
      await completeAdminAudit(auditId, 'denied');
      jsonError(res, 503, 'Status akun belum dapat diperbarui.');
      return;
    }
    if (!data) {
      await completeAdminAudit(auditId, 'denied');
      jsonError(res, 404, 'Akun tidak ditemukan.');
      return;
    }
    await completeAdminAudit(auditId, 'success');
    res.status(204).end();
  }));

  router.delete('/admin/users/:id', requireAuth, requireAdmin, requireAdminWriter, asyncRoute(async (req, res) => {
    const id = z.string().uuid().safeParse(req.params.id);
    const input = z.object({ email: emailConfirmationSchema, reason: reasonSchema }).safeParse(req.body);
    if (!id.success || !input.success) {
      await writeAdminAudit(req, 'user.delete', id.success ? id.data : null,
        input.success ? input.data.reason : null, 'denied', { cause: 'invalid_input' });
      jsonError(res, 400, 'ID akun, email konfirmasi, atau alasan penghapusan tidak valid.');
      return;
    }
    if (id.data === req.authUser!.id) {
      await writeAdminAudit(req, 'user.delete', id.data, input.data.reason, 'denied', { cause: 'self_action' });
      jsonError(res, 400, 'Admin tidak dapat menghapus akunnya sendiri.');
      return;
    }
    const targetRole = await lookupAdminRole(id.data);
    if (targetRole.status === 'unavailable') {
      try {
        await writeAdminAudit(req, 'user.delete', id.data, input.data.reason, 'denied', { cause: 'target_role_lookup_failed' });
      } catch {
        console.error('Admin delete attempt could not be recorded.');
      }
      jsonError(res, 503, 'Status akun belum dapat diverifikasi.');
      return;
    }
    if (targetRole.status === 'found' && targetRole.role === 'owner' && req.adminRole !== 'owner') {
      await writeAdminAudit(req, 'user.delete', id.data, input.data.reason, 'denied', { cause: 'owner_protection' });
      jsonError(res, 403, 'Akun owner hanya dapat dikelola oleh owner.');
      return;
    }
    const adminClient = makeAdminClient();
    const { data: target, error: lookupError } = await adminClient.from('users')
      .select('email')
      .eq('id', id.data)
      .maybeSingle();
    if (lookupError) {
      await writeAdminAudit(req, 'user.delete', id.data, input.data.reason, 'denied', { cause: 'target_lookup_failed' });
      jsonError(res, 503, 'Akun belum dapat diverifikasi untuk penghapusan.');
      return;
    }
    if (!target) {
      await writeAdminAudit(req, 'user.delete', id.data, input.data.reason, 'denied', { cause: 'target_not_found' });
      jsonError(res, 404, 'Akun tidak ditemukan.');
      return;
    }
    if (target.email !== input.data.email) {
      await writeAdminAudit(req, 'user.delete', id.data, input.data.reason, 'denied', { cause: 'email_confirmation_mismatch' });
      jsonError(res, 400, 'Email konfirmasi tidak cocok.');
      return;
    }
    const auditId = await writeAdminAudit(req, 'user.delete', id.data, input.data.reason, 'pending');
    const { error } = await adminClient.auth.admin.deleteUser(id.data);
    if (error) {
      await completeAdminAudit(auditId, 'denied');
      jsonError(res, 503, 'Akun belum dapat dihapus.');
      return;
    }
    await completeAdminAudit(auditId, 'success');
    res.status(204).end();
  }));

  router.get('/admin/audit-logs', requireAuth, requireAdmin, asyncRoute(async (req, res) => {
    const isoDate = z.string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .refine((value) => {
        const date = new Date(`${value}T00:00:00.000Z`);
        return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
      });
    const query = z.object({
      page: z.preprocess(emptyQueryValueToUndefined, z.coerce.number().int().min(1).default(1)),
      pageSize: z.preprocess(emptyQueryValueToUndefined, z.coerce.number().int().min(1).max(50).default(50)),
      action: z.preprocess(emptyQueryValueToUndefined, z.enum([
        'user.disable', 'user.enable', 'user.delete',
        'settings.announcement.update', 'settings.maintenance.update',
      ]).optional()),
      actorRole: z.preprocess(emptyQueryValueToUndefined, z.enum(['admin', 'support', 'owner']).optional()),
      actorId: z.preprocess(emptyQueryValueToUndefined, z.string().uuid().optional()),
      from: z.preprocess(emptyQueryValueToUndefined, isoDate.optional()),
      to: z.preprocess(emptyQueryValueToUndefined, isoDate.optional()),
    }).safeParse(req.query);
    if (!query.success) {
      jsonError(res, 400, 'Paginasi audit log tidak valid.');
      return;
    }
    if (query.data.from && query.data.to && query.data.from > query.data.to) {
      jsonError(res, 400, 'Rentang tanggal audit log tidak valid.');
      return;
    }
    const { page, pageSize } = query.data;
    let auditQuery = makeAdminClient().from('admin_audit_logs')
      .select('id,actor_user_id,actor_role,action,target_user_id,reason,result,details,created_at', { count: 'exact' })
      .order('created_at', { ascending: false });
    if (query.data.action) auditQuery = auditQuery.eq('action', query.data.action);
    if (query.data.actorRole) auditQuery = auditQuery.eq('actor_role', query.data.actorRole);
    if (query.data.actorId) auditQuery = auditQuery.eq('actor_user_id', query.data.actorId);
    if (query.data.from) auditQuery = auditQuery.gte('created_at', `${query.data.from}T00:00:00.000Z`);
    if (query.data.to) {
      const exclusiveEnd = new Date(`${query.data.to}T00:00:00.000Z`);
      exclusiveEnd.setUTCDate(exclusiveEnd.getUTCDate() + 1);
      auditQuery = auditQuery.lt('created_at', exclusiveEnd.toISOString());
    }
    const { data, error, count } = await auditQuery.range((page - 1) * pageSize, page * pageSize - 1);
    if (error) {
      jsonError(res, 503, 'Audit log belum dapat dimuat.');
      return;
    }
    res.json({ logs: data ?? [], total: count ?? 0, page, pageSize });
  }));

  router.get('/admin/settings', requireAuth, requireAdmin, asyncRoute(async (_req, res) => {
    const { data, error } = await makeAdminClient().from('app_settings')
      .select('announcement,maintenance_mode,updated_at')
      .eq('id', true)
      .maybeSingle();
    if (error || !data) {
      jsonError(res, 503, 'Pengaturan admin belum dapat dimuat.');
      return;
    }
    res.json({ announcement: data.announcement, maintenanceMode: data.maintenance_mode, updatedAt: data.updated_at });
  }));

  router.patch('/admin/settings/announcement', requireAuth, requireAdmin, requireAdminWriter, asyncRoute(async (req, res) => {
    const input = z.object({ announcement: z.string().trim().max(1000).nullable(), reason: reasonSchema }).strict().safeParse(req.body);
    if (!input.success) {
      await writeAdminAudit(req, 'settings.announcement.update', null, null, 'denied', { cause: 'invalid_input' });
      jsonError(res, 400, 'Pengumuman atau alasan perubahan tidak valid.');
      return;
    }
    const announcement = input.data.announcement || null;
    const auditId = await writeAdminAudit(req, 'settings.announcement.update', null, input.data.reason, 'pending', { announcementSet: announcement !== null });
    const { error } = await makeAdminClient().from('app_settings').upsert({
      id: true, announcement, updated_by: req.authUser!.id, updated_at: new Date().toISOString(),
    });
    if (error) {
      await completeAdminAudit(auditId, 'denied');
      jsonError(res, 503, 'Pengumuman belum dapat diperbarui.');
      return;
    }
    await completeAdminAudit(auditId, 'success');
    res.json({ announcement });
  }));

  router.patch('/admin/settings/maintenance', requireAuth, requireAdmin, requireAdminWriter, asyncRoute(async (req, res) => {
    const input = z.object({ enabled: z.boolean(), reason: reasonSchema }).strict().safeParse(req.body);
    if (!input.success) {
      await writeAdminAudit(req, 'settings.maintenance.update', null, null, 'denied', { cause: 'invalid_input' });
      jsonError(res, 400, 'Mode pemeliharaan atau alasan perubahan tidak valid.');
      return;
    }
    const auditId = await writeAdminAudit(req, 'settings.maintenance.update', null, input.data.reason, 'pending', { enabled: input.data.enabled });
    const { error } = await makeAdminClient().from('app_settings').upsert({
      id: true, maintenance_mode: input.data.enabled, updated_by: req.authUser!.id, updated_at: new Date().toISOString(),
    });
    if (error) {
      await completeAdminAudit(auditId, 'denied');
      jsonError(res, 503, 'Mode pemeliharaan belum dapat diperbarui.');
      return;
    }
    await completeAdminAudit(auditId, 'success');
    res.json({ enabled: input.data.enabled });
  }));

  router.get('/admin/export/metrics', requireAuth, requireAdmin, asyncRoute(async (req, res) => {
    const { data, error } = await req.userClient!.rpc('admin_get_overview');
    const overview = Array.isArray(data) ? data[0] : null;
    if (error || !overview) {
      jsonError(res, 503, 'Metrik agregat belum dapat diekspor.');
      return;
    }
    const rows = [
      ['metric', 'value'],
      ['total_accounts', overview.total_accounts],
      ['new_accounts_30d', overview.new_accounts_30d],
      ['active_accounts', overview.active_accounts],
      ['disabled_accounts', overview.disabled_accounts],
      ['total_transactions', overview.total_transactions],
    ].map((row) => row.map(escapeCsvCell).join(',')).join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="catatuang-admin-metrics.csv"');
    res.send(`${rows}\r\n`);
  }));

  router.post('/auth/register', authRateLimit, asyncRoute(async (req, res) => {
    const input = z.object({
      name: z.string().trim().min(2).max(100),
      email: emailSchema,
      password: z.string().min(8).max(128),
      confirmPassword: z.string().min(8).max(128),
    }).safeParse(req.body);
    if (!input.success) {
      jsonError(res, 400, 'Periksa kembali nama, email, dan password Anda.');
      return;
    }
    if (input.data.password !== input.data.confirmPassword) {
      jsonError(res, 400, 'Konfirmasi password tidak sama.');
      return;
    }

    try {
      const { data, error } = await makeClient().auth.signUp({
        email: input.data.email,
        password: input.data.password,
        options: { data: { name: input.data.name }, emailRedirectTo: process.env.APP_URL },
      });

      if (!error && data.user && data.user.identities?.length === 0) {
        jsonError(res, 409, 'Email sudah terdaftar. Silakan login.');
        return;
      }

      if (error) {
        if (error.code === 'user_already_exists' || /already registered/i.test(error.message)) {
          jsonError(res, 409, 'Email sudah terdaftar. Silakan login.');
          return;
        }
        jsonError(res, 400, 'Pendaftaran tidak berhasil. Periksa data Anda dan coba lagi.');
        return;
      }

      if (data.session) {
        await saveSession(
          req,
          data.session.access_token,
          data.session.refresh_token,
          data.session.expires_at ?? 0
        );
      }

      res.status(201).json({
        needsEmailConfirmation: !data.session,
        user: data.session && data.user ? profileFromUser(data.user, input.data.name) : null,
      });
    } catch {
      jsonError(res, 503, 'Pendaftaran belum dapat diproses. Coba lagi nanti.');
    }
  }));

  router.post('/auth/login', authRateLimit, asyncRoute(async (req, res) => {
    const input = z.object({ email: emailSchema, password: z.string().min(1).max(128) }).safeParse(req.body);
    if (!input.success) {
      jsonError(res, 401, 'Email atau password salah.');
      return;
    }

    let authResult;
    try {
      authResult = await makeClient().auth.signInWithPassword(input.data);
    } catch {
      console.error('Login failed: Supabase auth request failed');
      jsonError(res, 503, 'Login belum dapat diproses. Coba lagi nanti.');
      return;
    }

    const { data, error } = authResult;
    if (error || !data.session || !data.user) {
      if (error?.code === 'email_not_confirmed') {
        console.warn('Login failed: email confirmation required');
        jsonError(res, 403, 'Email belum dikonfirmasi. Periksa inbox Anda sebelum login.');
        return;
      }
      if (!error || error.code === 'invalid_credentials' || error.status === 400 || error.status === 401) {
        console.warn('Login failed: invalid credentials');
        jsonError(res, 401, 'Email atau password salah.');
        return;
      }
      console.error('Login failed: Supabase auth request failed');
      jsonError(res, 503, 'Login belum dapat diproses. Coba lagi nanti.');
      return;
    }

    let accountStatus;
    try {
      accountStatus = await readAccountStatus(data.user.id, data.session.access_token);
    } catch {
      jsonError(res, 503, 'Status akun belum dapat diverifikasi. Coba lagi nanti.');
      return;
    }
    if (accountStatus.error && !isMissingAccountStatusColumn(accountStatus.error)) {
      jsonError(res, 503, 'Status akun belum dapat diverifikasi. Pastikan migrasi status akun sudah diterapkan.');
      return;
    }
    if (accountStatus.data?.account_status === 'disabled') {
      jsonError(res, 403, 'Akun dinonaktifkan. Hubungi dukungan CatatUang.');
      return;
    }

    try {
      await saveSession(
        req,
        data.session.access_token,
        data.session.refresh_token,
        data.session.expires_at ?? 0
      );
    } catch (error) {
      if (errorHasCode(error, ['28P01', '28P02', '28000', '08000', '08003', '08006', 'ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT'])) {
        console.error('Login failed: database unavailable');
      } else {
        console.error('Login failed: session creation failed');
      }
      jsonError(res, 503, 'Login belum dapat diproses. Coba lagi nanti.');
      return;
    }

    let profileName = data.user.email?.split('@')[0] ?? '';
    try {
      const { data: profile, error: profileError } = await makeClient(data.session.access_token)
        .from('users')
        .select('name')
        .eq('id', data.user.id)
        .maybeSingle();
      if (profileError) {
        console.warn('Login profile lookup failed');
      } else {
        profileName = profile?.name ?? profileName;
      }
    } catch {
      console.warn('Login profile lookup failed');
    }

    res.json({ user: profileFromUser(data.user, profileName) });
  }));

  router.post('/auth/logout', asyncRoute(async (req, res) => {
    try {
      if (req.session.accessToken && req.session.refreshToken) {
        try {
          const authClient = makeClient();
          const { error } = await authClient.auth.setSession({
            access_token: req.session.accessToken,
            refresh_token: req.session.refreshToken,
          });
          if (!error) await authClient.auth.signOut({ scope: 'local' });
        } catch {
          // Destroying the server-side session still logs this browser out.
        }
      }
      await destroySession(req);
      res.clearCookie(sessionCookieName, {
        path: '/',
        httpOnly: true,
        secure: secureCookie,
        sameSite: 'lax',
      });
      res.status(204).end();
    } catch {
      jsonError(res, 500, 'Logout belum berhasil. Coba lagi.');
    }
  }));

  router.get('/auth/session', asyncRoute(async (req, res) => {
    try {
      const user = await getAuthenticatedUser(req);
      if (!user) {
        res.json({ user: null });
        return;
      }
      const { data, error } = await req.userClient!
        .from('users')
        .select('name')
        .eq('id', user.id)
        .maybeSingle();
      if (error) {
        jsonError(res, 503, 'Profil belum dapat dimuat.');
        return;
      }
      res.json({ user: profileFromUser(user, data?.name ?? user.email?.split('@')[0] ?? '') });
    } catch {
      jsonError(res, 503, 'Sesi belum dapat diverifikasi.');
    }
  }));

  router.get('/dashboard-summary', requireAuth, asyncRoute(async (req, res) => {
    const { data, error } = await req.userClient!.rpc('dashboard_summary');
    const summary = Array.isArray(data) ? data[0] : null;
    if (error || !summary) {
      jsonError(res, 503, 'Ringkasan keuangan belum dapat dimuat.');
      return;
    }
    res.json({
      initialBalance: Number(summary.initial_balance),
      totalIncome: Number(summary.total_income),
      totalExpense: Number(summary.total_expense),
      transactionCount: Number(summary.transaction_count),
      incomeCount: Number(summary.income_count),
      expenseCount: Number(summary.expense_count),
    });
  }));

  router.get('/transactions', requireAuth, asyncRoute(async (req, res) => {
    const query = z.object({
      page: z.preprocess(emptyQueryValueToUndefined, z.coerce.number().int().min(1).default(1)),
      pageSize: z.preprocess(emptyQueryValueToUndefined, z.coerce.number().int().min(1).max(50).default(20)),
      search: z.preprocess(emptyQueryValueToUndefined, z.string().trim().max(120).default('')),
      type: z.preprocess(emptyQueryValueToUndefined, z.enum(['all', 'income', 'expense']).default('all')),
      category: z.preprocess(emptyQueryValueToUndefined, z.string().max(100).default('all')),
      startDate: z.preprocess(emptyQueryValueToUndefined,
        z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
          const date = new Date(`${value}T00:00:00.000Z`);
          return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
        }).optional()),
      endDate: z.preprocess(emptyQueryValueToUndefined,
        z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
          const date = new Date(`${value}T00:00:00.000Z`);
          return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
        }).optional()),
    }).safeParse(req.query);
    if (!query.success) {
      jsonError(res, 400, 'Filter transaksi tidak valid.');
      return;
    }

    const { page, pageSize, search, type, category, startDate, endDate } = query.data;
    const userId = req.authUser!.id;
    let request = req.userClient!.from('transactions')
      .select('id,user_id,date,amount,description,type,category,created_at,updated_at,receipt_path,receipt_mime,receipt_size', { count: 'exact' })
      .eq('user_id', userId);

    if (type !== 'all') request = request.eq('type', type);
    if (category !== 'all') request = request.eq('category', category);
    if (startDate) request = request.gte('date', startDate);
    if (endDate) request = request.lte('date', endDate);
    if (search) {
      const safeSearch = search.replace(/[,%()\\]/g, ' ').trim();
      if (safeSearch) request = request.or(`description.ilike.%${safeSearch}%,category.ilike.%${safeSearch}%`);
    }

    const from = (page - 1) * pageSize;
    let { data, error, count } = await request
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .range(from, from + pageSize - 1);
    if (error && isMissingReceiptSchema(error)) {
      let legacyRequest = req.userClient!.from('transactions')
        .select('id,user_id,date,amount,description,type,category,created_at,updated_at', { count: 'exact' })
        .eq('user_id', userId);
      if (type !== 'all') legacyRequest = legacyRequest.eq('type', type);
      if (category !== 'all') legacyRequest = legacyRequest.eq('category', category);
      if (startDate) legacyRequest = legacyRequest.gte('date', startDate);
      if (endDate) legacyRequest = legacyRequest.lte('date', endDate);
      if (search) {
        const safeSearch = search.replace(/[,%()\\]/g, ' ').trim();
        if (safeSearch) legacyRequest = legacyRequest.or(`description.ilike.%${safeSearch}%,category.ilike.%${safeSearch}%`);
      }
      const legacyResult = await legacyRequest
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })
        .range(from, from + pageSize - 1);
      data = legacyResult.data?.map((row) => ({ ...row, receipt_path: null, receipt_mime: null, receipt_size: null })) ?? null;
      error = legacyResult.error;
      count = legacyResult.count;
    }
    if (error) {
      jsonError(res, 503, 'Transaksi belum dapat dimuat.');
      return;
    }

    res.json({ transactions: data ?? [], total: count ?? 0, page, pageSize });
  }));

  router.get('/transactions/:id', requireAuth, asyncRoute(async (req, res) => {
    const id = z.string().uuid().safeParse(req.params.id);
    if (!id.success) {
      jsonError(res, 400, 'ID transaksi tidak valid.');
      return;
    }
    const { data, error } = await req.userClient!.from('transactions')
      .select('id,user_id,date,amount,description,type,category,created_at,updated_at,receipt_path,receipt_mime,receipt_size')
      .eq('id', id.data)
      .eq('user_id', req.authUser!.id)
      .maybeSingle();
    if (error) {
      if (isMissingReceiptSchema(error)) {
        const legacy = await req.userClient!.from('transactions')
          .select('id,user_id,date,amount,description,type,category,created_at,updated_at')
          .eq('id', id.data)
          .eq('user_id', req.authUser!.id)
          .maybeSingle();
        if (legacy.error) {
          jsonError(res, 503, 'Detail transaksi belum dapat dimuat.');
          return;
        }
        if (!legacy.data) {
          jsonError(res, 404, 'Transaksi tidak ditemukan.');
          return;
        }
        res.json({ transaction: { ...legacy.data, receipt_path: null, receipt_mime: null, receipt_size: null } });
        return;
      }
      jsonError(res, 503, 'Detail transaksi belum dapat dimuat.');
      return;
    }
    if (!data) {
      jsonError(res, 404, 'Transaksi tidak ditemukan.');
      return;
    }
    res.json({ transaction: data });
  }));

  router.post('/transactions', requireAuth, asyncRoute(async (req, res) => {
    const input = validateTransactionInput(req.body, req.authUser!.id);
    if (!input.success) {
      jsonError(res, 400, 'Data transaksi tidak valid. Pastikan nominal lebih besar dari Rp0.');
      return;
    }
    if (input.data.receiptPath || input.data.receiptMime || input.data.receiptSize) {
      jsonError(res, 400, 'Foto bukti harus diunggah melalui fitur unggah bukti transaksi.');
      return;
    }

    const { data, error } = await req.userClient!.from('transactions')
      .insert({
        date: input.data.date,
        amount: input.data.amount,
        description: input.data.description,
        type: input.data.type,
        category: input.data.category,
        ...receiptMetadataToDatabase(input.data),
        user_id: req.authUser!.id,
      })
      .select('id,user_id,date,amount,description,type,category,created_at,updated_at')
      .single();
    if (error) {
      jsonError(res, isMissingReceiptSchema(error) ? 503 : 400, isMissingReceiptSchema(error)
        ? 'Database belum siap untuk bukti transaksi. Jalankan migration SQL bukti transaksi di Supabase.'
        : 'Transaksi tidak dapat disimpan. Periksa kembali datanya.');
      return;
    }
    res.status(201).json({ transaction: data });
  }));

  router.patch('/transactions/:id', requireAuth, asyncRoute(async (req, res) => {
    const id = z.string().uuid().safeParse(req.params.id);
    const updateSchema = z.object({
      receiptPath: z.preprocess(emptyQueryValueToUndefined, z.string().trim().min(1).max(500).nullable().optional()),
      receiptMime: z.preprocess(emptyQueryValueToUndefined, z.enum(['image/jpeg', 'image/png', 'image/webp']).nullable().optional()),
      receiptSize: z.preprocess(emptyQueryValueToUndefined, z.number().int().positive().max(maxReceiptSize).nullable().optional()),
    }).strict().superRefine((metadata, context) => {
      const fields = [metadata.receiptPath, metadata.receiptMime, metadata.receiptSize];
      const provided = fields.some((field) => field !== undefined);
      if (provided && (fields.some((field) => field === undefined)
        || (!fields.every((field) => field === null) && !fields.every((field) => field != null)))) {
        context.addIssue({ code: 'custom', path: ['receiptPath'], message: 'Metadata foto harus lengkap.' });
      }
    });
    const input = updateSchema.safeParse(req.body);
    const hasImmutableFields = req.body && typeof req.body === 'object'
      && ['amount', 'type', 'date', 'category', 'description'].some((field) => field in req.body);
    if (hasImmutableFields) {
      jsonError(res, 400, 'Transaksi bersifat final. Hapus transaksi dan input ulang untuk mengubah datanya.');
      return;
    }
    if (!id.success || !input.success || Object.keys(req.body ?? {}).length === 0) {
      jsonError(res, 400, 'Pembaruan hanya boleh berisi metadata bukti transaksi yang valid.');
      return;
    }

    const userId = req.authUser!.id;
    const { data: existing, error: lookupError } = await req.userClient!.from('transactions')
      .select('receipt_path')
      .eq('id', id.data)
      .eq('user_id', userId)
      .maybeSingle();
    if (lookupError || !existing) {
      jsonError(res, lookupError && isMissingReceiptSchema(lookupError) ? 503 : lookupError ? 400 : 404,
        lookupError && isMissingReceiptSchema(lookupError)
        ? 'Database belum siap untuk bukti transaksi. Jalankan migration SQL bukti transaksi di Supabase.'
        : lookupError ? 'Bukti transaksi belum dapat diperbarui.' : 'Transaksi tidak ditemukan.');
      return;
    }

    const newReceiptPath = input.data.receiptPath;
    const oldReceiptPath = existing.receipt_path;
    if (oldReceiptPath && newReceiptPath === null) {
      jsonError(res, 400, 'Foto bukti yang sudah tersimpan tidak dapat dilepas melalui pembaruan metadata.');
      return;
    }
    if (newReceiptPath && (!isReceiptPathForUser(newReceiptPath, userId)
      || !newReceiptPath.startsWith(`${userId}/${id.data}/`)
      || (oldReceiptPath && newReceiptPath !== oldReceiptPath))) {
      jsonError(res, 400, 'Path bukti harus milik pengguna dan penggantian file harus melalui unggah bukti.');
      return;
    }
    const patch = {
      ...(input.data.receiptPath !== undefined ? { receipt_path: input.data.receiptPath } : {}),
      ...(input.data.receiptMime !== undefined ? { receipt_mime: input.data.receiptMime } : {}),
      ...(input.data.receiptSize !== undefined ? { receipt_size: input.data.receiptSize } : {}),
    };
    const { data, error } = await req.userClient!.from('transactions')
      .update(patch)
      .eq('id', id.data)
      .eq('user_id', userId)
      .select('id,user_id,date,amount,description,type,category,created_at,updated_at,receipt_path,receipt_mime,receipt_size')
      .maybeSingle();
    if (error) {
      jsonError(res, isMissingReceiptSchema(error) ? 503 : 400, isMissingReceiptSchema(error)
        ? 'Database belum siap untuk bukti transaksi. Jalankan migration SQL bukti transaksi di Supabase.'
        : 'Metadata bukti transaksi belum dapat diperbarui.');
      return;
    }
    if (!data) {
      jsonError(res, 404, 'Transaksi tidak ditemukan.');
      return;
    }
    res.json({ transaction: data });
  }));

  router.post('/transactions/:id/receipt', requireAuth, (req, res, next) => {
    express.raw({ type: () => true, limit: maxReceiptSize })(req, res, (error: Error | null) => {
      if (!error) {
        next();
        return;
      }
      const parserError = error as { type?: unknown };
      if (parserError.type === 'entity.too.large') {
        jsonError(res, 413, 'Ukuran gambar bukti maksimal 5 MB.');
        return;
      }
      next(error);
    });
  }, asyncRoute(async (req, res) => {
    const id = z.string().uuid().safeParse(req.params.id);
    if (!id.success) {
      jsonError(res, 400, 'ID transaksi tidak valid.');
      return;
    }

    const contentType = req.get('content-type')?.split(';')[0]?.trim().toLowerCase();
    const body = Buffer.isBuffer(req.body) ? req.body : null;
    const actualMime = body ? receiptMimeFromBytes(body) : null;
    if (!body || body.length === 0 || body.length > maxReceiptSize) {
      jsonError(res, 400, 'Pilih gambar JPG, PNG, atau WEBP berukuran maksimal 5 MB.');
      return;
    }
    if (!actualMime || contentType !== actualMime) {
      jsonError(res, 400, 'Isi file tidak cocok dengan tipe gambar JPG, PNG, atau WEBP yang diizinkan.');
      return;
    }

    const userId = req.authUser!.id;
    const { data: existing, error: lookupError } = await req.userClient!.from('transactions')
      .select('id,receipt_path')
      .eq('id', id.data)
      .eq('user_id', userId)
      .maybeSingle();
    if (lookupError) {
      jsonError(res, isMissingReceiptSchema(lookupError) ? 503 : 400, isMissingReceiptSchema(lookupError)
        ? 'Database belum siap untuk bukti transaksi. Jalankan migration SQL bukti transaksi di Supabase.'
        : 'Bukti transaksi belum dapat disimpan.');
      return;
    }
    if (!existing) {
      jsonError(res, 404, 'Transaksi tidak ditemukan.');
      return;
    }
    if (existing.receipt_path) {
      jsonError(res, 409, 'Transaksi ini sudah memiliki foto bukti.');
      return;
    }

    const safeName = receiptFileName(req.get('x-receipt-name'), actualMime);
    const receiptPath = `${userId}/${id.data}/${Date.now()}-${randomUUID()}-${safeName}`;
    const storage = req.userClient!.storage.from(receiptBucket);
    const { error: uploadError } = await storage.upload(receiptPath, body, {
      contentType: actualMime,
      cacheControl: '3600',
      upsert: false,
    });
    if (uploadError) {
      const missingBucket = /bucket not found|bucket does not exist/i.test(uploadError.message);
      jsonError(res, 503, missingBucket
        ? 'Bucket bukti transaksi belum tersedia. Jalankan migration SQL bukti transaksi di Supabase.'
        : 'Gambar bukti gagal diunggah. Coba lagi.');
      return;
    }

    const { data: updated, error: updateError } = await req.userClient!.from('transactions')
      .update({ receipt_path: receiptPath, receipt_mime: actualMime, receipt_size: body.length })
      .eq('id', id.data)
      .eq('user_id', userId)
      .select('id')
      .maybeSingle();
    if (updateError || !updated) {
      const { error: cleanupError } = await storage.remove([receiptPath]);
      if (cleanupError) console.error('Uploaded transaction receipt cleanup failed');
      jsonError(res, updateError && isMissingReceiptSchema(updateError) ? 503 : updated ? 400 : 404,
        updateError && isMissingReceiptSchema(updateError)
        ? 'Database belum siap untuk bukti transaksi. Jalankan migration SQL bukti transaksi di Supabase.'
        : updated ? 'Metadata bukti transaksi gagal disimpan.' : 'Transaksi tidak ditemukan.');
      return;
    }

    res.status(201).json({ receiptPath, receiptMime: actualMime, receiptSize: body.length });
  }));

  router.get('/transactions/:id/receipt-url', requireAuth, asyncRoute(async (req, res) => {
    const id = z.string().uuid().safeParse(req.params.id);
    if (!id.success) {
      jsonError(res, 400, 'ID transaksi tidak valid.');
      return;
    }
    const userId = req.authUser!.id;
    const { data: existing, error } = await req.userClient!.from('transactions')
      .select('receipt_path')
      .eq('id', id.data)
      .eq('user_id', userId)
      .maybeSingle();
    if (error) {
      jsonError(res, isMissingReceiptSchema(error) ? 503 : 400, isMissingReceiptSchema(error)
        ? 'Database belum siap untuk bukti transaksi. Jalankan migration SQL bukti transaksi di Supabase.'
        : 'Bukti transaksi belum dapat dibuka.');
      return;
    }
    if (!existing) {
      jsonError(res, 404, 'Transaksi tidak ditemukan.');
      return;
    }
    if (!existing.receipt_path) {
      jsonError(res, 404, 'Transaksi ini belum memiliki foto bukti.');
      return;
    }
    if (!isReceiptPathForUser(existing.receipt_path, userId)) {
      jsonError(res, 404, 'Bukti transaksi tidak ditemukan.');
      return;
    }
    const { data, error: storageError } = await req.userClient!.storage.from(receiptBucket)
      .createSignedUrl(existing.receipt_path, 60 * 60);
    if (storageError || !data?.signedUrl) {
      jsonError(res, 503, 'Foto bukti belum dapat dibuka. Coba lagi.');
      return;
    }
    res.json({ signedUrl: data.signedUrl });
  }));

  router.delete('/transactions/:id', requireAuth, asyncRoute(async (req, res) => {
    const id = z.string().uuid().safeParse(req.params.id);
    if (!id.success) {
      jsonError(res, 400, 'ID transaksi tidak valid.');
      return;
    }
    const prior = await req.userClient!.from('transactions')
      .select('receipt_path')
      .eq('id', id.data)
      .eq('user_id', req.authUser!.id)
      .maybeSingle();
    if (prior.error && !isMissingReceiptSchema(prior.error)) {
      console.error('Could not load transaction receipt before deletion:', prior.error.message);
    }
    const oldReceiptPath = prior.error ? null : prior.data?.receipt_path;
    const { data, error } = await req.userClient!.from('transactions')
      .delete()
      .eq('id', id.data)
      .eq('user_id', req.authUser!.id)
      .select('id')
      .maybeSingle();
    if (error) {
      jsonError(res, 400, 'Transaksi tidak dapat dihapus.');
      return;
    }
    if (!data) {
      jsonError(res, 404, 'Transaksi tidak ditemukan.');
      return;
    }
    if (isReceiptPathForUser(oldReceiptPath, req.authUser!.id)) {
      const { error: storageError } = await req.userClient!.storage.from(receiptBucket).remove([oldReceiptPath]);
      if (storageError) console.error('Transaction receipt cleanup failed after transaction deletion:', storageError.message);
    }
    res.status(204).end();
  }));

  router.patch('/profile', requireAuth, asyncRoute(async (req, res) => {
    const input = profileSchema.safeParse(req.body);
    if (!input.success) {
      jsonError(res, 400, 'Nama wajib berisi 2 sampai 100 karakter.');
      return;
    }
    const { data, error } = await req.userClient!.from('users')
      .update({ name: input.data.name })
      .eq('id', req.authUser!.id)
      .select('id,name,email')
      .single();
    if (error) {
      jsonError(res, 400, 'Profil tidak dapat diperbarui.');
      return;
    }
    res.json({ user: { id: data.id, name: data.name, email: data.email } });
  }));

  router.patch('/profile/balance', requireAuth, asyncRoute(async (req, res) => {
    const input = z.object({ initialBalance: z.number().int().min(0).max(99_999_999_999_999) }).safeParse(req.body);
    if (!input.success) {
      jsonError(res, 400, 'Saldo awal harus berupa angka positif yang valid.');
      return;
    }
    const { error } = await req.userClient!.from('users')
      .update({ initial_balance: input.data.initialBalance })
      .eq('id', req.authUser!.id);
    if (error) {
      jsonError(res, 400, 'Saldo awal belum dapat diperbarui.');
      return;
    }
    res.status(204).end();
  }));

  router.patch('/password', requireAuth, authRateLimit, asyncRoute(async (req, res) => {
    const input = z.object({
      currentPassword: z.string().min(1).max(128),
      newPassword: z.string().min(8).max(128),
      confirmPassword: z.string().min(8).max(128),
    }).safeParse(req.body);
    if (!input.success || !req.authUser!.email) {
      jsonError(res, 400, 'Password baru minimal 8 karakter.');
      return;
    }
    if (input.data.newPassword !== input.data.confirmPassword) {
      jsonError(res, 400, 'Konfirmasi password tidak sama.');
      return;
    }

    const authClient = makeClient();
    const { error: verifyError } = await authClient.auth.signInWithPassword({
      email: req.authUser!.email,
      password: input.data.currentPassword,
    });
    if (verifyError) {
      jsonError(res, 400, 'Password saat ini tidak benar.');
      return;
    }

    const { error: sessionError } = await req.userClient!.auth.setSession({
      access_token: req.authToken!,
      refresh_token: req.session.refreshToken!,
    });
    if (sessionError) {
      jsonError(res, 401, 'Sesi tidak berlaku. Silakan login kembali.');
      return;
    }
    const { error: updateError } = await req.userClient!.auth.updateUser({ password: input.data.newPassword });
    if (updateError) {
      jsonError(res, 400, 'Password tidak dapat diperbarui.');
      return;
    }
    const { error: signOutError } = await req.userClient!.auth.signOut({ scope: 'global' });
    if (signOutError) {
      await destroySession(req);
      res.clearCookie(sessionCookieName, { path: '/', secure: secureCookie, httpOnly: true, sameSite: 'lax' });
      jsonError(res, 503, 'Password sudah diperbarui. Sesi lain belum dapat dicabut; silakan login kembali.');
      return;
    }
    try {
      await destroySession(req);
      res.clearCookie(sessionCookieName, { path: '/', secure: secureCookie, httpOnly: true, sameSite: 'lax' });
      res.status(204).end();
    } catch {
      jsonError(res, 500, 'Password sudah diperbarui. Silakan login kembali.');
    }
  }));

  router.delete('/account', requireAuth, asyncRoute(async (req, res) => {
    const { error } = await req.userClient!.rpc('delete_my_account');
    if (error) {
      jsonError(res, 500, 'Akun belum dapat dihapus. Coba lagi nanti.');
      return;
    }
    try {
      await destroySession(req);
      res.clearCookie(sessionCookieName, { path: '/', secure: secureCookie, httpOnly: true, sameSite: 'lax' });
      res.status(204).end();
    } catch {
      jsonError(res, 500, 'Akun telah dihapus. Silakan login kembali.');
    }
  }));

  router.use((_req, res) => jsonError(res, 404, 'Endpoint tidak ditemukan.'));
  router.use((error: unknown, req: Request, res: Response, _next: NextFunction) => {
    const databaseUnavailable = errorHasCode(error, ['28P01', '28P02', '28000', '08000', '08003', '08006', 'ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT']);
    if (res.headersSent) {
      console.error(databaseUnavailable ? 'Database unavailable after response was committed' : 'API error after response was committed');
      return;
    }
    if (databaseUnavailable) {
      console.error(req.method === 'POST' && req.path === '/auth/login' ? 'Login failed: database unavailable' : 'Database unavailable');
    } else {
      console.error('API request failed');
    }
    const status = databaseUnavailable ? 503 : 500;
    jsonError(res, status, status === 503 ? 'Layanan sementara tidak tersedia.' : 'Terjadi kesalahan internal. Coba lagi nanti.');
  });
  return router;
}

export async function closeApiResources() {
  const pool = sessionPool;
  sessionPool = undefined;
  if (pool) await pool.end();
}
