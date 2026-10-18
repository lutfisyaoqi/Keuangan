import React, { useState, useEffect } from 'react';
import { X, Landmark, Check } from 'lucide-react';
import { formatRupiah, parseAmount } from '../utils/formatters.js';
import { validateInitialBalance } from '../utils/validation.js';

interface InitialBalanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentInitialBalance: number;
  onSave: (amount: number) => Promise<void> | void;
}

export const InitialBalanceModal: React.FC<InitialBalanceModalProps> = ({
  isOpen,
  onClose,
  currentInitialBalance,
  onSave,
}) => {
  const [valStr, setValStr] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setValStr(currentInitialBalance > 0 ? String(currentInitialBalance) : '');
      setError(null);
    }
  }, [isOpen, currentInitialBalance]);

  if (!isOpen) return null;

  const numericVal = parseAmount(valStr);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = validateInitialBalance(numericVal);
    if (!result.isValid) {
      setError(result.error || 'Saldo awal tidak valid.');
      return;
    }
    setIsSubmitting(true);
    try {
      await onSave(result.value);
      onClose();
    } catch {
      setError('Saldo awal belum dapat disimpan. Coba lagi.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePreset = (preset: number) => {
    setValStr(String(preset));
    setError(null);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="initial-balance-modal-title"
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4"
    >
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <Landmark className="w-4 h-4" />
            </div>
            <h2 id="initial-balance-modal-title" className="text-base font-bold text-slate-900">
              Atur Saldo Awal
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
            aria-label="Tutup"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <p className="text-xs text-slate-500 leading-relaxed">
            Saldo awal adalah modal awal atau saldo rekening sebelum transaksi dicatat.
            Perhitungan saldo akhir: <span className="font-semibold text-slate-700">Saldo Awal + Pemasukan - Pengeluaran</span>.
          </p>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="init-amount" className="text-xs font-semibold uppercase tracking-wider text-slate-600">
                Nominal Saldo Awal
              </label>
              <span className="text-xs font-medium text-blue-600">
                {formatRupiah(numericVal)}
              </span>
            </div>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">
                Rp
              </span>
              <input
                id="init-amount"
                type="text"
                inputMode="numeric"
                value={valStr}
                onChange={(e) => {
                  setValStr(e.target.value.replace(/[^0-9]/g, ''));
                  setError(null);
                }}
                placeholder="0"
                className="w-full pl-11 pr-4 py-2.5 bg-white border border-slate-300 rounded-xl text-slate-900 text-base font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                autoComplete="off"
                autoFocus
              />
            </div>
            {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}

            {/* Common presets */}
            <div className="mt-2.5 flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] text-slate-400 mr-1">Pilihan:</span>
              {[0, 500000, 1000000, 1300000, 2000000, 5000000].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => handlePreset(preset)}
                  className="px-2 py-1 text-[11px] font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 rounded-md transition-colors"
                >
                  {formatRupiah(preset)}
                </button>
              ))}
            </div>
          </div>

          <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 rounded-lg shadow-sm shadow-blue-600/30 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            >
              <Check className="w-4 h-4 stroke-[2.5]" />
              <span>{isSubmitting ? 'Menyimpan...' : 'Simpan Saldo Awal'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
