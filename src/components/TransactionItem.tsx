import React from 'react';
import { ArrowDownLeft, ArrowUpRight, FileImage, Trash2 } from 'lucide-react';
import { Transaction } from '../types/finance.js';
import { formatIndonesianDate, formatRupiah } from '../utils/formatters.js';

interface TransactionItemProps {
  transaction: Transaction;
  onSelect: (tx: Transaction) => void;
  onDelete: (tx: Transaction) => void;
}

export const TransactionItem: React.FC<TransactionItemProps> = ({
  transaction,
  onSelect,
  onDelete,
}) => {
  const isIncome = transaction.type === 'income';

  return (
    <div className="group flex items-center justify-between gap-3 border-b border-slate-100 bg-white p-4 transition-colors hover:bg-slate-50/80 last:border-b-0">
      <button type="button" onClick={() => onSelect(transaction)} className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left">
      <div className="flex min-w-0 items-center gap-3.5">
        {/* Direction Icon */}
        <div
          className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
            isIncome
              ? 'bg-emerald-50 text-emerald-600'
              : 'bg-rose-50 text-rose-600'
          }`}
        >
          {isIncome ? (
            <ArrowDownLeft className="w-5 h-5" />
          ) : (
            <ArrowUpRight className="w-5 h-5" />
          )}
        </div>

        {/* Text information (Clean unboxed typography) */}
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900 truncate">
            {transaction.description}
          </p>
          <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-0.5">
            <span>{formatIndonesianDate(transaction.date)}</span>
            <span aria-hidden="true" className="text-slate-300">·</span>
            <span className="font-medium text-slate-600">{transaction.category}</span>
          </div>
        </div>
      </div>

      <div className="shrink-0 text-right">
        <div className="text-right">
          {transaction.receiptPath && (
            <span className="mb-1 inline-flex items-center gap-1 text-[11px] font-medium text-blue-600" aria-label="Memiliki foto bukti" title="Memiliki foto bukti transaksi">
              <FileImage className="h-3.5 w-3.5" />
              Bukti
            </span>
          )}
          <span
            className={`text-sm sm:text-base font-bold tabular-nums tracking-tight ${
              isIncome ? 'text-emerald-600' : 'text-rose-600'
            }`}
          >
            {formatRupiah(transaction.amount, {
              showSign: true,
              type: transaction.type,
            })}
          </span>
          <div className="text-[11px] text-slate-400 capitalize">
            {transaction.type === 'income' ? 'Pemasukan' : 'Pengeluaran'}
          </div>
        </div>
      </div>
      </button>
      <div className="flex shrink-0 items-center gap-1 border-l border-slate-100 pl-2 sm:pl-3">
          <button
            type="button"
            onClick={() => onDelete(transaction)}
            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
            title="Hapus transaksi"
            aria-label={`Hapus ${transaction.description}`}
          >
            <Trash2 className="w-4 h-4" />
          </button>
      </div>
    </div>
  );
};
