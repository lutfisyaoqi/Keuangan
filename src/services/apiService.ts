import { Transaction, TransactionType, FilterType } from '../types/finance.js';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
}

export interface DashboardSummary {
  initialBalance: number;
  totalIncome: number;
  totalExpense: number;
  transactionCount: number;
  incomeCount: number;
  expenseCount: number;
}

export interface FinanceToolsSummary {
  spentByCategory: Record<string, number>;
  monthlyExpenses: Record<string, number>;
  goalContributions: Array<Pick<Transaction, 'id' | 'amount' | 'description' | 'category'>>;
}

export interface TransactionFilters {
  page: number;
  pageSize: number;
  search: string;
  type: FilterType;
  category: string;
  startDate: string;
  endDate: string;
}

export interface TransactionReceipt {
  receiptPath: string;
  receiptMime: string;
  receiptSize: number;
}

export type AdminRole = 'admin' | 'support' | 'owner';

export interface AdminOverview {
  totalAccounts: number;
  newAccounts30d: number;
  activeAccounts: number;
  disabledAccounts: number;
  totalTransactions: number;
}
export interface AdminActivity { activeUsers: number; newTransactions: number; periodDays: number }
export interface AdminRecentError { id: number; service: string; route: string; statusCode: number; createdAt: string }
export interface AdminRetention { expiringSoon: number; overduePending: number; purgedLast30Days: number; recentErrors: AdminRecentError[] }

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  created_at: string;
  account_status: 'active' | 'disabled';
  disabled_reason: string | null;
  emailConfirmed: boolean;
}

export interface AdminAuditLog {
  id: number;
  actor_user_id: string | null;
  actor_role: AdminRole;
  action: string;
  target_user_id: string | null;
  reason: string | null;
  result: 'pending' | 'success' | 'denied';
  details: Record<string, unknown>;
  created_at: string;
}

export interface AdminSettings {
  announcement: string | null;
  maintenanceMode: boolean;
  updatedAt: string;
}

export interface AdminGrowthPoint {
  day: string;
  accounts: number;
}

export interface AdminStorageUsage {
  objectCount: number;
  totalBytes: number;
}

export interface PublicServiceStatus {
  announcement: string | null;
  maintenanceMode: boolean;
}

export class ApiRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

interface TransactionRow {
  id: string;
  date: string;
  amount: number;
  description: string;
  type: TransactionType;
  category: string;
  created_at: string;
  updated_at: string;
  receipt_path?: string | null;
  receipt_mime?: string | null;
  receipt_size?: number | null;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    credentials: 'same-origin',
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  });

  if (response.status === 204) return undefined as T;
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiRequestError(
      typeof result.error === 'string' ? result.error : 'Permintaan belum dapat diproses.',
      response.status,
    );
  }
  return result as T;
}

function toTransaction(row: TransactionRow): Transaction {
  return {
    id: row.id,
    date: row.date,
    amount: Number(row.amount),
    description: row.description,
    type: row.type,
    category: row.category,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    receiptPath: row.receipt_path ?? null,
    receiptMime: row.receipt_mime ?? null,
    receiptSize: row.receipt_size == null ? null : Number(row.receipt_size),
  };
}

export const apiService = {
  getSession: () => request<{ user: AuthUser | null }>('/auth/session'),
  login: (email: string, password: string) =>
    request<{ user: AuthUser }>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  requestPasswordReset: (email: string) =>
    request<{ message: string }>('/auth/password/forgot', { method: 'POST', body: JSON.stringify({ email }) }),
  resetPassword: (accessToken: string, refreshToken: string, newPassword: string, confirmPassword: string) =>
    request<void>('/auth/password/reset', { method: 'POST', body: JSON.stringify({ accessToken, refreshToken, newPassword, confirmPassword }) }),
  register: (name: string, email: string, password: string, confirmPassword: string) =>
    request<{ user: AuthUser | null; needsEmailConfirmation: boolean }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password, confirmPassword }),
    }),
  logout: () => request<void>('/auth/logout', { method: 'POST' }),
  getDashboardSummary: () => request<DashboardSummary>('/dashboard-summary'),
  getFinanceToolsSummary: () => request<FinanceToolsSummary>('/finance-tools-summary'),
  async listTransactions(filters: TransactionFilters) {
    const params = new URLSearchParams();
    params.set('page', String(filters.page));
    params.set('pageSize', String(filters.pageSize));
    if (filters.search.trim()) params.set('search', filters.search.trim());
    if (filters.type === 'income' || filters.type === 'expense') params.set('type', filters.type);
    const category = filters.category.trim();
    if (category && category.toLowerCase() !== 'all' && !['undefined', 'null'].includes(category.toLowerCase())) {
      params.set('category', category);
    }
    const startDate = filters.startDate.trim();
    if (startDate && !['undefined', 'null'].includes(startDate.toLowerCase())) params.set('startDate', startDate);
    const endDate = filters.endDate.trim();
    if (endDate && !['undefined', 'null'].includes(endDate.toLowerCase())) params.set('endDate', endDate);
    const result = await request<{ transactions: TransactionRow[]; total: number }>(`/transactions?${params}`);
    return { transactions: result.transactions.map(toTransaction), total: result.total };
  },
  async saveTransaction(data: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt' | 'receiptPath' | 'receiptMime' | 'receiptSize'>) {
    const result = await request<{ transaction: TransactionRow }>('/transactions', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return toTransaction(result.transaction);
  },
  uploadTransactionReceipt(id: string, file: File) {
    return request<TransactionReceipt>(`/transactions/${encodeURIComponent(id)}/receipt`, {
      method: 'POST',
      body: file,
      headers: { 'Content-Type': file.type, 'X-Receipt-Name': encodeURIComponent(file.name) },
    });
  },
  getTransactionReceiptUrl: (id: string) =>
    request<{ signedUrl: string }>(`/transactions/${encodeURIComponent(id)}/receipt-url`),
  deleteTransaction: (id: string) =>
    request<void>(`/transactions/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  updateInitialBalance: (initialBalance: number) =>
    request<void>('/profile/balance', { method: 'PATCH', body: JSON.stringify({ initialBalance }) }),
  updateProfile: (name: string) =>
    request<{ user: AuthUser }>('/profile', { method: 'PATCH', body: JSON.stringify({ name }) }),
  changePassword: (currentPassword: string, newPassword: string, confirmPassword: string) =>
    request<void>('/password', { method: 'PATCH', body: JSON.stringify({ currentPassword, newPassword, confirmPassword }) }),
  deleteAccount: () => request<void>('/account', { method: 'DELETE' }),
  adminLogin: (email: string, password: string) =>
    request<{ user: AuthUser; role: AdminRole }>('/admin/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  checkAdmin: () => request<{ authenticated: true; role: AdminRole }>('/admin/login-check', { method: 'POST' }),
  getAdminOverview: () => request<AdminOverview>('/admin/overview'),
  getAdminAccountGrowth: () => request<{ points: AdminGrowthPoint[] }>('/admin/account-growth'),
  getAdminActivity: (period: number) => request<AdminActivity>(`/admin/activity?period=${period}`),
  getAdminRetention: () => request<AdminRetention>('/admin/retention'),
  getAdminStorageUsage: () => request<AdminStorageUsage>('/admin/storage-usage'),
  getAdminHealth: () => request<{ status: 'ok' | 'degraded'; checks: Record<string, boolean> }>('/admin/health'),
  async listAdminUsers(
    page: number,
    pageSize: number,
    search: string,
    sortBy: 'created_at' | 'name' | 'email' | 'account_status' = 'created_at',
    sortOrder: 'asc' | 'desc' = 'desc',
    filters: { status?: 'active' | 'disabled'; createdFrom?: string; createdTo?: string } = {},
  ) {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize), sortBy, sortOrder });
    if (search.trim()) params.set('search', search.trim());
    if (filters.status) params.set('status', filters.status);
    if (filters.createdFrom) params.set('createdFrom', filters.createdFrom);
    if (filters.createdTo) params.set('createdTo', filters.createdTo);
    return request<{ users: AdminUser[]; total: number; page: number; pageSize: number }>(`/admin/users?${params}`);
  },
  disableAdminUser: (id: string, reason: string) =>
    request<void>(`/admin/users/${encodeURIComponent(id)}/disable`, { method: 'POST', body: JSON.stringify({ reason }) }),
  enableAdminUser: (id: string, reason: string) =>
    request<void>(`/admin/users/${encodeURIComponent(id)}/enable`, { method: 'POST', body: JSON.stringify({ reason }) }),
  deleteAdminUser: (id: string, email: string, reason: string) =>
    request<void>(`/admin/users/${encodeURIComponent(id)}`, { method: 'DELETE', body: JSON.stringify({ email, reason }) }),
  listAdminAuditLogs: (
    page: number,
    pageSize: number,
    filters: { action?: string; actorRole?: AdminRole; actorId?: string; from?: string; to?: string } = {},
  ) => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    for (const [key, value] of Object.entries(filters)) {
      if (value) params.set(key, value);
    }
    return request<{ logs: AdminAuditLog[]; total: number; page: number; pageSize: number }>(`/admin/audit-logs?${params}`);
  },
  getAdminSettings: () => request<AdminSettings>('/admin/settings'),
  getPublicServiceStatus: () => request<PublicServiceStatus>('/public/service-status'),
  updateAdminAnnouncement: (announcement: string, reason: string) =>
    request<{ announcement: string | null }>('/admin/settings/announcement', {
      method: 'PATCH', body: JSON.stringify({ announcement, reason }),
    }),
  updateAdminMaintenance: (enabled: boolean, reason: string) =>
    request<{ enabled: boolean }>('/admin/settings/maintenance', {
      method: 'PATCH', body: JSON.stringify({ enabled, reason }),
    }),
  exportAdminMetrics: async (period = 30) => {
    const response = await fetch(`/api/admin/export/metrics?period=${period}`, { credentials: 'same-origin' });
    if (!response.ok) {
      const result = await response.json().catch(() => ({})) as { error?: unknown };
      throw new Error(typeof result.error === 'string' ? result.error : 'Ekspor metrik belum dapat diunduh.');
    }
    return response.blob();
  },
};
