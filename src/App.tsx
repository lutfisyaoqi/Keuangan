/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Download, Megaphone, Wrench } from 'lucide-react';
import { Transaction, TransactionType, FilterType } from './types/finance.js';
import { BalanceStats } from './utils/calculations.js';
import { apiService } from './services/apiService.js';
import { AuthProvider, useAuth } from './auth/AuthProvider.js';
import { AuthPage } from './components/AuthPage.js';
import { SettingsPage } from './pages/SettingsPage.js';
import { AdminPage } from './pages/AdminPage.js';
import { AdminLoginPage } from './pages/AdminLoginPage.js';
import { PasswordResetPage } from './pages/PasswordResetPage.js';
import { Header } from './components/Header.js';
import { DashboardStats } from './components/DashboardStats.js';
import { TransactionFilters } from './components/TransactionFilters.js';
import { TransactionList } from './components/TransactionList.js';
import { TransactionModal } from './components/TransactionModal.js';
import { InitialBalanceModal } from './components/InitialBalanceModal.js';
import { DeleteConfirmModal } from './components/DeleteConfirmModal.js';
import { SmartInputBanner } from './components/SmartInputBanner.js';
import { TransactionDetailModal } from './components/TransactionDetailModal.js';
import { ParsedTransactionData } from './services/aiService.js';
import { createFinancialSummaryCsv } from './utils/financeExport.js';
import { FinanceTools } from './components/FinanceTools.js';

function UserServiceNotices() {
  const [notice, setNotice] = useState<{ announcement: string | null; maintenanceMode: boolean } | null>(null);

  useEffect(() => {
    let active = true;
    const load = () => {
      void apiService.getPublicServiceStatus()
        .then((result) => { if (active) setNotice(result); })
        .catch(() => { if (active) setNotice(null); });
    };
    load();
    const timer = window.setInterval(load, 5 * 60 * 1000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  if (!notice || (!notice.announcement && !notice.maintenanceMode)) return null;
  return <div className="space-y-2 px-4 pt-3 sm:px-6">
    {notice.maintenanceMode && <div role="status" className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
      <Wrench className="mt-0.5 h-4 w-4 shrink-0" />
      <p><strong className="font-semibold">Pemeliharaan layanan:</strong> Beberapa fitur mungkin mengalami gangguan sementara.</p>
    </div>}
    {notice.announcement?.trim() && <div role="status" className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-950">
      <Megaphone className="mt-0.5 h-4 w-4 shrink-0" />
      <p className="whitespace-pre-wrap">{notice.announcement}</p>
    </div>}
  </div>;
}

function DashboardPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [stats, setStats] = useState<BalanceStats>({
    initialBalance: 0, totalIncome: 0, totalExpense: 0, currentBalance: 0,
    transactionCount: 0, incomeCount: 0, expenseCount: 0,
  });
  const [totalFiltered, setTotalFiltered] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [summaryError, setSummaryError] = useState('');
  const [transactionsError, setTransactionsError] = useState('');
  const [actionError, setActionError] = useState('');
  const [toast, setToast] = useState<{ message: string; transaction?: Transaction; warning?: boolean; detail?: string } | null>(null);
  const [page, setPage] = useState(1);
  const requestSequence = useRef(0);
  const toastTimer = useRef<number | undefined>(undefined);

  // 2. Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [initialAiData, setInitialAiData] = useState<ParsedTransactionData | null>(null);

  const [isInitialBalanceModalOpen, setIsInitialBalanceModalOpen] = useState(false);

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deletingTransaction, setDeletingTransaction] = useState<Transaction | null>(null);
  const [viewingTransaction, setViewingTransaction] = useState<Transaction | null>(null);

  // 3. Filters state
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<FilterType>('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const refreshDashboard = useCallback(async () => {
    const sequence = ++requestSequence.current;
    setIsLoading(true);
    const [summaryResult, transactionsResult] = await Promise.allSettled([
      apiService.getDashboardSummary(),
      apiService.listTransactions({
        page, pageSize: 20, search: searchQuery, type: typeFilter,
        category: categoryFilter, startDate, endDate,
      }),
    ]);
    if (sequence !== requestSequence.current) return;

    if (summaryResult.status === 'fulfilled') {
      const summary = summaryResult.value;
      setStats({
        ...summary,
        currentBalance: summary.initialBalance + summary.totalIncome - summary.totalExpense,
      });
      setSummaryError('');
    } else {
      setSummaryError(summaryResult.reason instanceof Error ? summaryResult.reason.message : 'Ringkasan belum dapat dimuat.');
    }

    if (transactionsResult.status === 'fulfilled') {
      setTransactions(transactionsResult.value.transactions);
      setTotalFiltered(transactionsResult.value.total);
      setTransactionsError('');
    } else {
      setTransactionsError(transactionsResult.reason instanceof Error ? transactionsResult.reason.message : 'Transaksi belum dapat dimuat.');
    }
    setIsLoading(false);
  }, [page, searchQuery, typeFilter, categoryFilter, startDate, endDate]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void refreshDashboard(); }, 180);
    return () => window.clearTimeout(timer);
  }, [refreshDashboard]);

  const hasActiveFilters = Boolean(
    searchQuery.trim() ||
      typeFilter !== 'all' ||
      categoryFilter !== 'all' ||
      startDate ||
      endDate
  );

  const handleResetFilters = useCallback(() => {
    setSearchQuery('');
    setTypeFilter('all');
    setCategoryFilter('all');
    setStartDate('');
    setEndDate('');
    setPage(1);
  }, []);

  const handleExportFinancialSummary = async () => {
    setIsExporting(true);
    setActionError('');
    try {
      const summary = await apiService.getDashboardSummary();
      const exportStats: BalanceStats = {
        ...summary,
        currentBalance: summary.initialBalance + summary.totalIncome - summary.totalExpense,
      };
      const pageSize = 50;
      let page = 1;
      let total = 0;
      const allTransactions: Transaction[] = [];

      do {
        const result = await apiService.listTransactions({
          page,
          pageSize,
          search: '',
          type: 'all',
          category: 'all',
          startDate: '',
          endDate: '',
        });
        allTransactions.push(...result.transactions);
        total = result.total;
        page++;
      } while (allTransactions.length < total && allTransactions.length > 0);

      const blob = new Blob([createFinancialSummaryCsv(exportStats, allTransactions)], {
        type: 'text/csv;charset=utf-8',
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `ringkasan-keuangan-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Ringkasan keuangan belum dapat diunduh.');
    } finally {
      setIsExporting(false);
    }
  };

  // Transaction Handlers
  const handleOpenAddModal = () => {
    setInitialAiData(null);
    setIsAddModalOpen(true);
  };

  const handleAiParsed = (data: ParsedTransactionData) => {
    setInitialAiData(data);
    setIsAddModalOpen(true);
  };

  const handleSaveTransaction = async (data: {
    date: string;
    amount: number;
    description: string;
    type: TransactionType;
    category: string;
  }): Promise<Transaction> => {
    const transaction = await apiService.saveTransaction(data);
    setPage(1);
    return transaction;
  };

  const handleUploadReceipt = async (id: string, file: File) => {
    const receipt = await apiService.uploadTransactionReceipt(id, file);
    await refreshDashboard();
    return receipt;
  };

  const uploadReceipt = (id: string, file: File) => apiService.uploadTransactionReceipt(id, file);

  const showToast = (value: { message: string; transaction?: Transaction; warning?: boolean; detail?: string }) => {
    if (toastTimer.current !== undefined) window.clearTimeout(toastTimer.current);
    setToast(value);
    toastTimer.current = window.setTimeout(() => setToast(null), value.warning ? 10000 : 4000);
  };

  const handleTransactionSaved = (transaction: Transaction, receiptFailure?: string) => {
    void refreshDashboard();
    showToast({
      message: receiptFailure ? 'Transaksi tersimpan, tapi foto gagal diunggah' : 'Transaksi berhasil disimpan',
      ...(receiptFailure ? { transaction, warning: true, detail: receiptFailure } : {}),
    });
  };

  const handleOpenDeleteModal = (tx: Transaction) => {
    setViewingTransaction(null);
    setDeletingTransaction(tx);
    setIsDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (deletingTransaction) {
      await apiService.deleteTransaction(deletingTransaction.id);
      setDeletingTransaction(null);
      await refreshDashboard();
      showToast({ message: 'Transaksi berhasil dihapus.' });
    }
  };

  const handleSaveInitialBalance = async (newAmount: number) => {
    await apiService.updateInitialBalance(newAmount);
    await refreshDashboard();
  };

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login', { replace: true });
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Logout belum berhasil.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col selection:bg-blue-100 selection:text-blue-900">
      {/* Header */}
      <Header
        onOpenAddModal={handleOpenAddModal}
        onOpenSettingsModal={() => setIsInitialBalanceModalOpen(true)}
        userName={user?.name ?? ''}
        onLogout={handleLogout}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6 sm:space-y-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Halo, {user?.name}</h2>
            <p className="mt-1 text-sm text-slate-500">Ringkasan keuangan pribadimu.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void handleExportFinancialSummary()}
              disabled={isExporting || isLoading}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-blue-200 bg-white px-4 py-2 text-sm font-semibold text-blue-700 shadow-xs transition-colors hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
              title="Unduh ringkasan dan seluruh transaksi dalam format CSV yang dapat dibuka di Excel"
            >
              <Download className="h-4 w-4" />
              {isExporting ? 'Menyiapkan...' : 'Unduh Excel (CSV)'}
            </button>
            <Link to="/settings/profile" className="text-sm font-medium text-blue-700 hover:text-blue-800">Pengaturan akun</Link>
          </div>
        </div>

        {actionError && <div role="alert" className="flex items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <span>{actionError}</span>
          <button type="button" onClick={() => void refreshDashboard()} className="shrink-0 font-semibold underline">Coba lagi</button>
        </div>}

        {isLoading && <p role="status" className="text-sm text-slate-500">Memuat data keuangan...</p>}

        {/* Dashboard Statistics */}
        <section aria-label="Ringkasan Saldo dan Keuangan">
          {summaryError && <div role="alert" className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            <span>Ringkasan: {summaryError}</span>
            <button type="button" onClick={() => void refreshDashboard()} className="shrink-0 font-semibold underline">Coba lagi</button>
          </div>}
          <DashboardStats
            stats={stats}
            onEditInitialBalance={() => setIsInitialBalanceModalOpen(true)}
          />
        </section>

        {/* Smart AI Natural Language Input */}
        <section aria-label="Input Bahasa Alami AI">
          <SmartInputBanner onParsed={handleAiParsed} />
        </section>

        <FinanceTools userId={user?.id ?? ''} transactionCount={stats.transactionCount} onRefresh={() => void refreshDashboard()} onError={setActionError} />

        {/* Transactions Section */}
        <section className="space-y-4" aria-label="Riwayat Transaksi">
          {transactionsError && <div role="alert" className="flex items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            <span>Daftar transaksi: {transactionsError}</span>
            <button type="button" onClick={() => void refreshDashboard()} className="shrink-0 font-semibold underline">Coba lagi</button>
          </div>}
          {/* Filters (only show when there are transactions, or if search is ongoing) */}
          {(stats.transactionCount > 0 || hasActiveFilters) && (
            <TransactionFilters
              searchQuery={searchQuery}
              onSearchChange={(value) => { setSearchQuery(value); setPage(1); }}
              typeFilter={typeFilter}
              onTypeFilterChange={(value) => { setTypeFilter(value); setPage(1); }}
              categoryFilter={categoryFilter}
              onCategoryFilterChange={(value) => { setCategoryFilter(value); setPage(1); }}
              startDate={startDate}
              endDate={endDate}
              onStartDateChange={(value) => { setStartDate(value); setPage(1); }}
              onEndDateChange={(value) => { setEndDate(value); setPage(1); }}
              onResetFilters={handleResetFilters}
              hasActiveFilters={hasActiveFilters}
              totalFiltered={totalFiltered}
            />
          )}

          {/* List or Empty State */}
          <TransactionList
            transactions={transactions}
            totalAllTransactions={stats.transactionCount}
            totalFiltered={totalFiltered}
            page={page}
            pageCount={Math.max(1, Math.ceil(totalFiltered / 20))}
            onPageChange={setPage}
            isFiltered={hasActiveFilters}
            onSelect={setViewingTransaction}
            onDelete={handleOpenDeleteModal}
            onAddNew={handleOpenAddModal}
            onResetFilter={handleResetFilters}
          />
        </section>

        <p className="border-t border-slate-200/80 pt-5 text-center text-xs text-slate-500">© 2026 lutfisaoqiramadhani. Hak cipta dilindungi.</p>
      </main>

      {/* Modals */}
      <TransactionModal
        isOpen={isAddModalOpen}
        onClose={() => {
          setIsAddModalOpen(false);
          setInitialAiData(null);
        }}
        onSave={handleSaveTransaction}
        onTransactionSaved={handleTransactionSaved}
        onUploadReceipt={uploadReceipt}
        initialAiData={initialAiData}
        currentBalance={stats.currentBalance}
      />
      <TransactionDetailModal
        transaction={viewingTransaction}
        onClose={() => setViewingTransaction(null)}
        onDelete={handleOpenDeleteModal}
        onUploadReceipt={handleUploadReceipt}
      />
      {toast && <div role={toast.warning ? 'alert' : 'status'} className={`fixed bottom-5 left-1/2 z-[70] flex -translate-x-1/2 items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-white shadow-lg ${toast.warning ? 'bg-amber-700' : 'bg-slate-900'}`}>
        <span>{toast.message}{toast.detail && <span className="ml-1 font-normal">— {toast.detail}</span>}</span>
        {toast.transaction && <button type="button" onClick={() => { if (toast.transaction) setViewingTransaction(toast.transaction); setToast(null); }} className="shrink-0 font-bold underline">Tambah foto</button>}
        <button type="button" onClick={() => setToast(null)} aria-label="Tutup notifikasi" className="rounded p-0.5 hover:bg-white/20">×</button>
      </div>}

      <InitialBalanceModal
        isOpen={isInitialBalanceModalOpen}
        onClose={() => setIsInitialBalanceModalOpen(false)}
        currentInitialBalance={stats.initialBalance}
        onSave={handleSaveInitialBalance}
      />

      <DeleteConfirmModal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setDeletingTransaction(null);
        }}
        onConfirm={handleConfirmDelete}
        transaction={deletingTransaction}
      />
    </div>
  );
}

function ProtectedRoute({ children }: React.PropsWithChildren) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="min-h-screen grid place-items-center text-sm text-slate-500">Memeriksa sesi...</div>;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  return <><UserServiceNotices />{children}</>;
}

function AdminRoute({ children }: React.PropsWithChildren) {
  const { user, loading } = useAuth();
  const [checkingRole, setCheckingRole] = useState(true);
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    let active = true;
    if (!user) {
      setCheckingRole(false);
      setAuthorized(false);
      return () => { active = false; };
    }
    setCheckingRole(true);
    apiService.checkAdmin()
      .then(() => { if (active) setAuthorized(true); })
      .catch(() => { if (active) setAuthorized(false); })
      .finally(() => { if (active) setCheckingRole(false); });
    return () => { active = false; };
  }, [user]);

  if (loading || checkingRole) return <div className="grid min-h-screen place-items-center bg-slate-50 text-sm text-slate-500">Memeriksa akses admin...</div>;
  if (!user || !authorized) return <Navigate to="/admin/login" replace />;
  return <>{children}</>;
}

function AdminSessionGuard({ children }: React.PropsWithChildren) {
  const { updateUser } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const idleLimit = 30 * 60 * 1000;
    let lastActivity = Date.now();
    let idleTimer: number;
    let ending = false;

    const expireSession = async () => {
      if (ending) return;
      ending = true;
      window.clearTimeout(idleTimer);
      window.clearInterval(heartbeat);
      for (const eventName of ['pointerdown', 'keydown', 'touchstart', 'scroll']) {
        window.removeEventListener(eventName, recordActivity);
      }
      try {
        await apiService.logout();
      } catch {
        console.error('Admin session could not be cleared after inactivity.');
      }
      updateUser(null);
      navigate('/admin/login', { replace: true });
    };

    const armIdleTimer = () => {
      window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(() => { void expireSession(); }, Math.max(0, idleLimit - (Date.now() - lastActivity)));
    };
    const recordActivity = () => {
      if (Date.now() - lastActivity < 1000) return;
      lastActivity = Date.now();
      armIdleTimer();
    };
    const heartbeat = window.setInterval(() => {
      if (Date.now() - lastActivity >= idleLimit) {
        void expireSession();
      } else if (document.visibilityState === 'visible') {
        void apiService.checkAdmin().catch(() => { void expireSession(); });
      }
    }, 5 * 60 * 1000);

    if (Date.now() - lastActivity >= idleLimit) {
      void expireSession();
    } else {
      armIdleTimer();
      for (const eventName of ['pointerdown', 'keydown', 'touchstart', 'scroll']) {
        window.addEventListener(eventName, recordActivity, { passive: true });
      }
    }
    return () => {
      window.clearTimeout(idleTimer);
      window.clearInterval(heartbeat);
      for (const eventName of ['pointerdown', 'keydown', 'touchstart', 'scroll']) {
        window.removeEventListener(eventName, recordActivity);
      }
    };
  }, [navigate, updateUser]);

  return <>{children}</>;
}

function HomeRedirect() {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen grid place-items-center text-sm text-slate-500">Memeriksa sesi...</div>;
  return <Navigate to={user ? '/dashboard' : '/login'} replace />;
}

export default function App() {
  return <AuthProvider>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomeRedirect />} />
        <Route path="/login" element={<AuthPage mode="login" />} />
        <Route path="/register" element={<AuthPage mode="register" />} />
        <Route path="/reset-password" element={<PasswordResetPage />} />
        <Route path="/admin/login" element={<AdminLoginPage />} />
        <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
        <Route path="/transactions" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute><Navigate to="/settings/profile" replace /></ProtectedRoute>} />
        <Route path="/settings/profile" element={<ProtectedRoute><SettingsPage mode="profile" /></ProtectedRoute>} />
        <Route path="/settings/security" element={<ProtectedRoute><SettingsPage mode="security" /></ProtectedRoute>} />
        <Route path="/admin/*" element={<AdminRoute><AdminSessionGuard><AdminPage /></AdminSessionGuard></AdminRoute>} />
        <Route path="*" element={<HomeRedirect />} />
      </Routes>
    </BrowserRouter>
  </AuthProvider>;
}
