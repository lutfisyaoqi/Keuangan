import React from 'react';
import { ArrowDownLeft, ArrowUpRight, Receipt, Landmark, Edit3 } from 'lucide-react';
import { BalanceStats } from '../utils/calculations.js';
import { formatRupiah } from '../utils/formatters.js';

interface DashboardStatsProps {
  stats: BalanceStats;
  onEditInitialBalance: () => void;
}

export const DashboardStats: React.FC<DashboardStatsProps> = ({
  stats,
  onEditInitialBalance,
}) => {
  const isNegativeBalance = stats.currentBalance < 0;

  return (
    <div className="space-y-4">
      {/* Primary Card: Saldo Saat Ini */}
      <div
        className={`rounded-2xl border p-5 sm:p-6 transition-colors ${
          isNegativeBalance
            ? 'bg-rose-50/60 border-rose-200'
            : 'bg-white border-slate-200 shadow-xs'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs sm:text-sm font-semibold uppercase tracking-wider text-slate-500">
                Saldo Saat Ini
              </span>
              {isNegativeBalance && (
                <span className="text-xs font-semibold px-2 py-0.5 rounded bg-rose-100 text-rose-700">
                  Defisit
                </span>
              )}
            </div>

            <div
              className={`mt-2 text-3xl sm:text-4xl font-extrabold tracking-tight ${
                isNegativeBalance ? 'text-rose-600' : 'text-slate-900'
              }`}
            >
              {formatRupiah(stats.currentBalance)}
            </div>

            <div className="mt-2 flex items-center gap-2 text-xs sm:text-sm text-slate-500">
              <Landmark className="w-3.5 h-3.5 text-slate-400" />
              <span>
                Saldo awal: <strong className="text-slate-700 font-medium">{formatRupiah(stats.initialBalance)}</strong>
              </span>
              <button
                type="button"
                onClick={onEditInitialBalance}
                className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 font-medium text-xs underline underline-offset-2 ml-1"
              >
                <Edit3 className="w-3 h-3" />
                Ubah
              </button>
            </div>
          </div>

          {/* Formula calculation badge for clarity */}
          <div className="hidden lg:block bg-slate-50 border border-slate-200/80 rounded-xl p-3 text-xs text-slate-600">
            <div className="font-semibold text-slate-700 mb-1">Kalkulasi Saldo:</div>
            <div className="space-y-0.5 font-mono text-[11px]">
              <div>Saldo Awal: {formatRupiah(stats.initialBalance)}</div>
              <div className="text-emerald-600">+ Pemasukan: {formatRupiah(stats.totalIncome)}</div>
              <div className="text-rose-600">- Pengeluaran: {formatRupiah(stats.totalExpense)}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Secondary Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        {/* Total Income */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Total Pemasukan</span>
            <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <ArrowDownLeft className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-xl sm:text-2xl font-bold text-emerald-600">
            {formatRupiah(stats.totalIncome, { showSign: true, type: 'income' })}
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {stats.incomeCount} transaksi masuk
          </p>
        </div>

        {/* Total Expense */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Total Pengeluaran</span>
            <div className="w-7 h-7 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
              <ArrowUpRight className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-xl sm:text-2xl font-bold text-rose-600">
            {formatRupiah(stats.totalExpense, { showSign: true, type: 'expense' })}
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {stats.expenseCount} transaksi keluar
          </p>
        </div>

        {/* Transaction Count */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Jumlah Transaksi</span>
            <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <Receipt className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-xl sm:text-2xl font-bold text-slate-900">
            {stats.transactionCount} Transaksi
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Semua riwayat tercatat
          </p>
        </div>
      </div>
    </div>
  );
};
