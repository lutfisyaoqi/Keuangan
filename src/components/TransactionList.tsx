import React from 'react';
import { Transaction } from '../types/finance.js';
import { TransactionItem } from './TransactionItem.js';
import { EmptyState } from './EmptyState.js';
import { ArrowUpDown } from 'lucide-react';

interface TransactionListProps {
  transactions: Transaction[];
  totalAllTransactions: number;
  totalFiltered: number;
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  isFiltered: boolean;
  onSelect: (tx: Transaction) => void;
  onDelete: (tx: Transaction) => void;
  onAddNew: () => void;
  onResetFilter: () => void;
}

export const TransactionList: React.FC<TransactionListProps> = ({
  transactions,
  totalAllTransactions,
  totalFiltered,
  page,
  pageCount,
  onPageChange,
  isFiltered,
  onSelect,
  onDelete,
  onAddNew,
  onResetFilter,
}) => {
  if (totalAllTransactions === 0) {
    return <EmptyState isFiltered={false} onAddNew={onAddNew} />;
  }

  if (transactions.length === 0) {
    return <EmptyState isFiltered={isFiltered} onAddNew={onAddNew} onResetFilter={onResetFilter} />;
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-bold text-slate-800 tracking-tight">
            Riwayat Transaksi
          </h2>
          <span className="text-xs text-slate-500">
            ({totalFiltered} ditemukan)
          </span>
        </div>
        <div className="flex items-center gap-1 text-xs text-slate-500">
          <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
          <span>Terbaru dahulu</span>
        </div>
      </div>

      {/* List items */}
      <div className="divide-y divide-slate-100">
        {transactions.map((tx) => (
          <TransactionItem
            key={tx.id}
            transaction={tx}
            onSelect={onSelect}
            onDelete={onDelete}
          />
        ))}
      </div>

      {pageCount > 1 && <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3">
        <span className="text-xs text-slate-500">Halaman {page} dari {pageCount}</span>
        <div className="flex gap-2">
          <button type="button" disabled={page <= 1} onClick={() => onPageChange(page - 1)} className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-40">Sebelumnya</button>
          <button type="button" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)} className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-40">Berikutnya</button>
        </div>
      </div>}
    </div>
  );
};
