import React from 'react';
import { Plus, ReceiptText, SearchX } from 'lucide-react';

interface EmptyStateProps {
  isFiltered?: boolean;
  onAddNew?: () => void;
  onResetFilter?: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  isFiltered = false,
  onAddNew,
  onResetFilter,
}) => {
  if (isFiltered) {
    return (
      <div className="py-12 px-4 text-center bg-white rounded-2xl border border-slate-200">
        <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 mx-auto flex items-center justify-center">
          <SearchX className="w-6 h-6" />
        </div>
        <h3 className="mt-3 text-base font-bold text-slate-800">
          Tidak ada transaksi yang sesuai
        </h3>
        <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto">
          Coba sesuaikan kata kunci pencarian, ubah tanggal, atau reset filter yang sedang aktif.
        </p>
        {onResetFilter && (
          <button
            type="button"
            onClick={onResetFilter}
            className="mt-4 px-4 py-2 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
          >
            Reset Semua Filter
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="py-14 px-4 text-center bg-white rounded-2xl border border-slate-200 shadow-xs">
      <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 mx-auto flex items-center justify-center">
        <ReceiptText className="w-7 h-7" />
      </div>
      <h3 className="mt-4 text-base sm:text-lg font-bold text-slate-900">
        Belum ada transaksi
      </h3>
      <p className="mt-1 text-xs sm:text-sm text-slate-500 max-w-sm mx-auto">
        Mulai catat pemasukan dan pengeluaranmu untuk memantau keuangan pribadimu dengan rapi.
      </p>
      {onAddNew && (
        <button
          type="button"
          onClick={onAddNew}
          className="mt-5 inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 rounded-lg shadow-sm shadow-blue-600/30 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
          <span>Tambah Transaksi</span>
        </button>
      )}
    </div>
  );
};
