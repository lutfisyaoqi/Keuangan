import { Transaction, TransactionType, FilterType } from '../types/finance.js';
import { supabase, supabaseErrorMessage } from './supabaseClient.js';

export interface AuthUser { id: string; name: string; email: string }
export interface DashboardSummary {
  initialBalance: number; totalIncome: number; totalExpense: number;
  transactionCount: number; incomeCount: number; expenseCount: number;
}
export interface FinanceToolsSummary {
  spentByCategory: Record<string, number>;
  monthlyExpenses: Record<string, number>;
  goalContributions: Array<Pick<Transaction, 'id' | 'amount' | 'description' | 'category'>>;
}
export interface TransactionFilters {
  page: number; pageSize: number; search: string; type: FilterType;
  category: string; startDate: string; endDate: string;
}
export interface TransactionReceipt { receiptPath: string; receiptMime: string; receiptSize: number }
export type AdminRole = 'admin' | 'support' | 'owner';
export interface AdminOverview {
  totalAccounts: number; newAccounts30d: number; activeAccounts: number;
  disabledAccounts: number; totalTransactions: number;
}
export interface AdminActivity { activeUsers: number; newTransactions: number; periodDays: number }
export interface AdminRecentError { id: number; service: string; route: string; statusCode: number; createdAt: string }
export interface AdminRetention {
  expiringSoon: number; overduePending: number; purgedLast30Days: number; recentErrors: AdminRecentError[];
}
export interface AdminUser {
  id: string; name: string; email: string; created_at: string;
  account_status: 'active' | 'disabled'; disabled_reason: string | null; emailConfirmed: boolean;
}
export interface AdminAuditLog {
  id: number; actor_user_id: string | null; actor_role: AdminRole; action: string;
  target_user_id: string | null; reason: string | null; result: 'pending' | 'success' | 'denied';
  details: Record<string, unknown>; created_at: string;
}
export interface AdminSettings { announcement: string | null; maintenanceMode: boolean; updatedAt: string }
export interface AdminGrowthPoint { day: string; accounts: number }
export interface AdminStorageUsage { objectCount: number; totalBytes: number }
export interface PublicServiceStatus { announcement: string | null; maintenanceMode: boolean }

export class ApiRequestError extends Error {
  constructor(message: string, readonly status: number) { super(message); this.name = 'ApiRequestError'; }
}

const productionAppOrigin = 'https://keuangan-kohl.vercel.app';

function authRedirectUrl(path: string) {
  const origin = import.meta.env.DEV ? window.location.origin : productionAppOrigin;
  return new URL(path, origin).toString();
}

interface TransactionRow {
  id: string; user_id: string; date: string; amount: number | string; description: string;
  type: TransactionType; category: string; created_at: string; updated_at: string;
  receipt_path?: string | null; receipt_mime?: string | null; receipt_size?: number | null;
}

function throwSupabaseError(error: { message?: string; code?: string; status?: number } | null | undefined): never {
  const status = error?.status
    ?? (error?.code === 'invalid_credentials' ? 401 : error?.code === '42501' ? 403 : 400);
  throw new ApiRequestError(supabaseErrorMessage(error), status);
}

async function currentAuthUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) throwSupabaseError(error);
  if (!data.user) throw new ApiRequestError('Silakan login kembali.', 401);
  return data.user;
}

async function profileFor(user: { id: string; email?: string; user_metadata?: Record<string, unknown> }): Promise<AuthUser> {
  const { data, error } = await supabase.from('users').select('name,account_status').eq('id', user.id).maybeSingle();
  if (error) throwSupabaseError(error);
  if (!data) throw new ApiRequestError('Profil akun belum tersedia. Pastikan migrasi database CatatUang sudah diterapkan.', 503);
  if (data.account_status === 'disabled') {
    await supabase.auth.signOut();
    throw new ApiRequestError('Akun dinonaktifkan. Hubungi dukungan CatatUang.', 403);
  }
  return { id: user.id, name: data.name ?? String(user.user_metadata?.name ?? ''), email: user.email ?? '' };
}

function toTransaction(row: TransactionRow): Transaction {
  return {
    id: row.id, date: row.date, amount: Number(row.amount), description: row.description,
    type: row.type, category: row.category, createdAt: row.created_at, updatedAt: row.updated_at,
    receiptPath: row.receipt_path ?? null, receiptMime: row.receipt_mime ?? null,
    receiptSize: row.receipt_size == null ? null : Number(row.receipt_size),
  };
}

async function allOwnTransactions() {
  const user = await currentAuthUser();
  const rows: TransactionRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('transactions').select('*').eq('user_id', user.id)
      .order('date', { ascending: false }).order('created_at', { ascending: false }).range(from, from + 999);
    if (error) throwSupabaseError(error);
    rows.push(...((data ?? []) as TransactionRow[]));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

async function rpc<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(name as never, args as never);
  if (error) throwSupabaseError(error);
  return data as T;
}

function mapOverview(row: Record<string, unknown>): AdminOverview {
  return {
    totalAccounts: Number(row.total_accounts), newAccounts30d: Number(row.new_accounts_30d),
    activeAccounts: Number(row.active_accounts), disabledAccounts: Number(row.disabled_accounts),
    totalTransactions: Number(row.total_transactions),
  };
}

export const apiService = {
  async getSession() {
    const { data, error } = await supabase.auth.getSession();
    if (error) throwSupabaseError(error);
    return { user: data.session ? await profileFor(data.session.user) : null };
  },
  async login(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user) throwSupabaseError(error ?? { message: 'Email atau password salah.', status: 401 });
    return { user: await profileFor(data.user) };
  },
  async register(name: string, email: string, password: string, confirmPassword: string) {
    if (password !== confirmPassword) throw new ApiRequestError('Konfirmasi password tidak sama.', 400);
    const { data, error } = await supabase.auth.signUp({
      email, password, options: { data: { name }, emailRedirectTo: authRedirectUrl('/dashboard') },
    });
    if (error) throwSupabaseError(error);
    return {
      needsEmailConfirmation: !data.session,
      user: data.session && data.user ? await profileFor(data.user) : null,
    };
  },
  async logout() {
    const { error } = await supabase.auth.signOut();
    if (error) throwSupabaseError(error);
  },
  async requestPasswordReset(email: string) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: authRedirectUrl('/reset-password'),
    });
    if (error) throwSupabaseError(error);
    return { message: 'Jika email terdaftar, tautan pemulihan akan segera dikirim.' };
  },
  async resetPassword(accessToken: string, refreshToken: string, newPassword: string, confirmPassword: string) {
    if (newPassword !== confirmPassword) throw new ApiRequestError('Konfirmasi password tidak sama.', 400);
    const { data, error: sessionError } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
    if (sessionError || !data.user) throwSupabaseError(sessionError ?? { message: 'Tautan pemulihan tidak valid atau sudah kedaluwarsa.', status: 400 });
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throwSupabaseError(error);
    await supabase.auth.signOut({ scope: 'global' });
  },
  async getDashboardSummary(): Promise<DashboardSummary> {
    const rows = await rpc<Array<Record<string, unknown>>>('dashboard_summary');
    const row = rows[0];
    if (!row) throw new ApiRequestError('Ringkasan keuangan belum dapat dimuat.', 503);
    return {
      initialBalance: Number(row.initial_balance), totalIncome: Number(row.total_income),
      totalExpense: Number(row.total_expense), transactionCount: Number(row.transaction_count),
      incomeCount: Number(row.income_count), expenseCount: Number(row.expense_count),
    };
  },
  async getFinanceToolsSummary(): Promise<FinanceToolsSummary> {
    const transactions = (await allOwnTransactions()).map(toTransaction);
    const spentByCategory: Record<string, number> = {};
    const monthlyExpenses: Record<string, number> = {};
    for (const transaction of transactions) {
      if (transaction.type !== 'expense') continue;
      spentByCategory[transaction.category] = (spentByCategory[transaction.category] ?? 0) + transaction.amount;
      const month = transaction.date.slice(0, 7);
      monthlyExpenses[month] = (monthlyExpenses[month] ?? 0) + transaction.amount;
    }
    const goalContributions = transactions
      .filter((transaction) => transaction.type === 'expense' && /^setoran tabungan #\d+:/i.test(transaction.description))
      .map(({ id, amount, description, category }) => ({ id, amount, description, category }));
    return { spentByCategory, monthlyExpenses, goalContributions };
  },
  async listTransactions(filters: TransactionFilters) {
    const user = await currentAuthUser();
    let query = supabase.from('transactions').select('*', { count: 'exact' }).eq('user_id', user.id)
      .order('date', { ascending: false }).order('created_at', { ascending: false });
    if (filters.search.trim()) query = query.ilike('description', `%${filters.search.trim()}%`);
    if (filters.type === 'income' || filters.type === 'expense') query = query.eq('type', filters.type);
    if (filters.category.trim() && filters.category.toLowerCase() !== 'all') query = query.eq('category', filters.category.trim());
    if (filters.startDate.trim()) query = query.gte('date', filters.startDate.trim());
    if (filters.endDate.trim()) query = query.lte('date', filters.endDate.trim());
    const from = Math.max(0, (filters.page - 1) * filters.pageSize);
    const { data, error, count } = await query.range(from, from + filters.pageSize - 1);
    if (error) throwSupabaseError(error);
    return { transactions: ((data ?? []) as TransactionRow[]).map(toTransaction), total: count ?? 0 };
  },
  async saveTransaction(input: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt' | 'receiptPath' | 'receiptMime' | 'receiptSize'>) {
    const user = await currentAuthUser();
    const { data, error } = await supabase.from('transactions').insert({ ...input, user_id: user.id }).select('*').single();
    if (error) throwSupabaseError(error);
    return toTransaction(data as TransactionRow);
  },
  async uploadTransactionReceipt(id: string, file: File): Promise<TransactionReceipt> {
    const user = await currentAuthUser();
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
      throw new ApiRequestError('Bukti harus berupa JPG, PNG, atau WEBP dengan ukuran maksimal 5 MiB.', 400);
    }
    const extension = file.type === 'image/jpeg' ? 'jpg' : file.type.split('/')[1];
    const receiptPath = `${user.id}/${id}/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await supabase.storage.from('transaction-receipts').upload(receiptPath, file, { contentType: file.type, upsert: false });
    if (uploadError) throwSupabaseError(uploadError);
    const receipt = { receipt_path: receiptPath, receipt_mime: file.type, receipt_size: file.size };
    const { error: updateError } = await supabase.from('transactions').update(receipt).eq('id', id).eq('user_id', user.id);
    if (updateError) {
      await supabase.storage.from('transaction-receipts').remove([receiptPath]);
      throwSupabaseError(updateError);
    }
    return { receiptPath, receiptMime: file.type, receiptSize: file.size };
  },
  async getTransactionReceiptUrl(id: string) {
    const user = await currentAuthUser();
    const { data: row, error: rowError } = await supabase.from('transactions').select('receipt_path')
      .eq('id', id).eq('user_id', user.id).maybeSingle();
    if (rowError) throwSupabaseError(rowError);
    if (!row?.receipt_path) throw new ApiRequestError('Bukti transaksi tidak ditemukan.', 404);
    const { data, error } = await supabase.storage.from('transaction-receipts').createSignedUrl(row.receipt_path, 3600);
    if (error) throwSupabaseError(error);
    return { signedUrl: data.signedUrl };
  },
  async deleteTransaction(id: string) {
    const user = await currentAuthUser();
    const { data: row, error: readError } = await supabase.from('transactions').select('receipt_path')
      .eq('id', id).eq('user_id', user.id).maybeSingle();
    if (readError) throwSupabaseError(readError);
    if (row?.receipt_path) await supabase.storage.from('transaction-receipts').remove([row.receipt_path]);
    const { error } = await supabase.from('transactions').delete().eq('id', id).eq('user_id', user.id);
    if (error) throwSupabaseError(error);
  },
  async updateInitialBalance(initialBalance: number) {
    const user = await currentAuthUser();
    const { error } = await supabase.from('users').update({ initial_balance: initialBalance }).eq('id', user.id);
    if (error) throwSupabaseError(error);
  },
  async updateProfile(name: string) {
    const user = await currentAuthUser();
    const { error } = await supabase.from('users').update({ name }).eq('id', user.id);
    if (error) throwSupabaseError(error);
    return { user: { id: user.id, email: user.email ?? '', name } };
  },
  async changePassword(currentPassword: string, newPassword: string, confirmPassword: string) {
    if (newPassword !== confirmPassword) throw new ApiRequestError('Konfirmasi password tidak sama.', 400);
    const user = await currentAuthUser();
    if (!user.email) throw new ApiRequestError('Email akun tidak tersedia.', 400);
    const { error: verifyError } = await supabase.auth.signInWithPassword({ email: user.email, password: currentPassword });
    if (verifyError) throwSupabaseError(verifyError);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throwSupabaseError(error);
    await supabase.auth.signOut({ scope: 'global' });
  },
  async deleteAccount() {
    const { error } = await supabase.rpc('delete_my_account');
    if (error) throwSupabaseError(error);
    await supabase.auth.signOut();
  },
  async adminLogin(email: string, password: string) {
    const result = await apiService.login(email, password);
    try {
      const { role } = await this.checkAdmin();
      return { user: result.user, role };
    } catch (error) {
      await supabase.auth.signOut();
      throw error;
    }
  },
  async checkAdmin() {
    const role = await rpc<string | null>('admin_get_my_role');
    if (!role || !['admin', 'support', 'owner'].includes(role)) throw new ApiRequestError('Akun ini tidak memiliki akses admin.', 403);
    return { authenticated: true as const, role: role as AdminRole };
  },
  async getAdminOverview() {
    const rows = await rpc<Array<Record<string, unknown>>>('admin_get_overview');
    if (!rows[0]) throw new ApiRequestError('Metrik agregat belum dapat dimuat.', 503);
    return mapOverview(rows[0]);
  },
  async getAdminAccountGrowth() {
    const rows = await rpc<Array<{ day: string; accounts: number }>>('admin_get_account_growth');
    return { points: rows.map((row) => ({ day: row.day, accounts: Number(row.accounts) })) };
  },
  async getAdminActivity(period: number) {
    const rows = await rpc<Array<{ active_users: number; new_transactions: number; period_days: number }>>('admin_get_activity', { period_days: period });
    const row = rows[0];
    if (!row) throw new ApiRequestError('Aktivitas belum dapat dimuat.', 503);
    return { activeUsers: Number(row.active_users), newTransactions: Number(row.new_transactions), periodDays: Number(row.period_days) };
  },
  async getAdminRetention(): Promise<AdminRetention> {
    const [metrics, errors] = await Promise.all([
      rpc<Array<{ expiring_soon: number; overdue_pending: number; purged_last_30_days: number }>>('admin_get_retention_metrics'),
      rpc<Array<{ id: number; service: string; route: string; status_code: number; created_at: string }>>('admin_get_recent_errors'),
    ]);
    const row = metrics[0];
    if (!row) throw new ApiRequestError('Metrik retensi belum dapat dimuat.', 503);
    return {
      expiringSoon: Number(row.expiring_soon), overduePending: Number(row.overdue_pending),
      purgedLast30Days: Number(row.purged_last_30_days),
      recentErrors: errors.map((item) => ({ id: Number(item.id), service: item.service, route: item.route, statusCode: Number(item.status_code), createdAt: item.created_at })),
    };
  },
  async getAdminStorageUsage() {
    const rows = await rpc<Array<{ object_count: number; total_bytes: number }>>('admin_get_storage_usage');
    const row = rows[0];
    if (!row) throw new ApiRequestError('Penggunaan storage belum dapat dimuat.', 503);
    return { objectCount: Number(row.object_count), totalBytes: Number(row.total_bytes) };
  },
  async getAdminHealth() { return rpc<{ status: 'ok' | 'degraded'; checks: Record<string, boolean> }>('admin_get_health'); },
  async listAdminUsers(page: number, pageSize: number, search: string, sortBy: 'created_at' | 'name' | 'email' | 'account_status' = 'created_at', sortOrder: 'asc' | 'desc' = 'desc', filters: { status?: 'active' | 'disabled'; createdFrom?: string; createdTo?: string } = {}) {
    return rpc<{ users: AdminUser[]; total: number; page: number; pageSize: number }>('admin_list_users', {
      p_page: page, p_page_size: pageSize, p_search: search.trim(), p_sort_by: sortBy, p_sort_order: sortOrder,
      p_status: filters.status ?? null, p_created_from: filters.createdFrom ?? null, p_created_to: filters.createdTo ?? null,
    });
  },
  async disableAdminUser(id: string, reason: string) { await rpc('admin_disable_user', { p_user_id: id, p_reason: reason }); },
  async enableAdminUser(id: string, reason: string) { await rpc('admin_enable_user', { p_user_id: id, p_reason: reason }); },
  async deleteAdminUser(id: string, email: string, reason: string) { await rpc('admin_delete_user', { p_user_id: id, p_email: email, p_reason: reason }); },
  async listAdminAuditLogs(page: number, pageSize: number, filters: { action?: string; actorRole?: AdminRole; actorId?: string; from?: string; to?: string } = {}) {
    return rpc<{ logs: AdminAuditLog[]; total: number; page: number; pageSize: number }>('admin_list_audit_logs', {
      p_page: page, p_page_size: pageSize, p_action: filters.action ?? null,
      p_actor_role: filters.actorRole ?? null, p_actor_id: filters.actorId ?? null,
      p_from: filters.from ?? null, p_to: filters.to ?? null,
    });
  },
  async getAdminSettings() {
    const rows = await rpc<Array<{ announcement: string | null; maintenance_mode: boolean; updated_at: string }>>('admin_get_settings');
    const row = rows[0];
    if (!row) throw new ApiRequestError('Pengaturan admin belum dapat dimuat.', 503);
    return { announcement: row.announcement, maintenanceMode: row.maintenance_mode, updatedAt: row.updated_at };
  },
  async getPublicServiceStatus() {
    const rows = await rpc<Array<{ announcement: string | null; maintenance_mode: boolean }>>('get_public_service_status');
    return { announcement: rows[0]?.announcement ?? null, maintenanceMode: rows[0]?.maintenance_mode ?? false };
  },
  async updateAdminAnnouncement(announcement: string, reason: string) {
    return { announcement: await rpc<string | null>('admin_update_announcement', { p_announcement: announcement || null, p_reason: reason }) };
  },
  async updateAdminMaintenance(enabled: boolean, reason: string) {
    await rpc('admin_update_maintenance', { p_enabled: enabled, p_reason: reason });
    return { enabled };
  },
  async exportAdminMetrics(period = 30) {
    const [overview, activity, retention] = await Promise.all([
      this.getAdminOverview(), this.getAdminActivity(period), this.getAdminRetention(),
    ]);
    const rows: Array<Array<string | number>> = [
      ['metric', 'value'], ['total_accounts', overview.totalAccounts], ['new_accounts_30d', overview.newAccounts30d],
      ['active_accounts', overview.activeAccounts], ['disabled_accounts', overview.disabledAccounts],
      ['total_transactions', overview.totalTransactions], [`active_users_${period}d`, activity.activeUsers],
      [`new_transactions_${period}d`, activity.newTransactions], ['transactions_expiring_soon', retention.expiringSoon],
      ['expired_transactions_pending_purge', retention.overduePending], ['transactions_purged_30d', retention.purgedLast30Days],
    ];
    const csv = rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\r\n');
    return new Blob([`${csv}\r\n`], { type: 'text/csv;charset=utf-8' });
  },
};
