import React, { useState } from 'react';
import { AlertCircle, Trash2 } from 'lucide-react';
import { Transaction } from '../types/finance.js';
import { formatRupiah, formatIndonesianDate } from '../utils/formatters.js';

interface DeleteConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
  transaction: Transaction | null;
}

export const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  transaction,
}) => {
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState('');
  if (!isOpen || !transaction) return null;

  const isExpense = transaction.type === 'expense';

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="delete-dialog-title"
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4"
    >
      <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150 p-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
            <AlertCircle className="w-5 h-5" />
          </div>
          <div>
            <h2 id="delete-dialog-title" className="text-base font-bold text-slate-900">
              Hapus transaksi?
            </h2>
            <p className="text-xs text-slate-500">
              Data tidak bisa dikembalikan. Transaksi bersifat final; jika ingin mengubahnya, hapus lalu input ulang.
            </p>
          </div>
        </div>

        {error && <p role="alert" className="mt-3 text-xs text-rose-700">{error}</p>}

        {/* Transaction preview details */}
        <div className="mt-4 p-3 bg-slate-50 border border-slate-200/80 rounded-xl">
          <div className="text-sm font-semibold text-slate-800 break-words">
            {transaction.description}
          </div>
          <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
            <span>
              {formatIndonesianDate(transaction.date)} · {transaction.category}
            </span>
            <span
              className={`font-bold ${
                isExpense ? 'text-rose-600' : 'text-emerald-600'
              }`}
            >
              {formatRupiah(transaction.amount, { showSign: true, type: transaction.type })}
            </span>
          </div>
        </div>

        <p className="mt-3 text-xs text-slate-500">
          Bukti foto terkait juga akan dihapus. Saldo akan dihitung ulang setelah transaksi dihapus.
        </p>

        <div className="mt-5 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={() => {
              setIsDeleting(true);
              setError('');
              Promise.resolve(onConfirm()).then(onClose).catch((requestError: unknown) => {
                setError(requestError instanceof Error ? requestError.message : 'Transaksi belum dapat dihapus.');
              }).finally(() => setIsDeleting(false));
            }}
            disabled={isDeleting}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-rose-600 hover:bg-rose-700 active:bg-rose-800 rounded-lg shadow-sm shadow-rose-600/30 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-600"
          >
            <Trash2 className="w-4 h-4" />
            <span>{isDeleting ? 'Menghapus...' : 'Hapus'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
