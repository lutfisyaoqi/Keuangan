import React, { useState, useEffect, useRef } from 'react';
import { X, ArrowDownLeft, ArrowUpRight, AlertTriangle, Check, Sparkles, Loader2, Upload, Trash2 } from 'lucide-react';
import {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  TransactionType,
} from '../types/finance.js';
import { Transaction } from '../types/finance.js';
import { formatRupiah, getTodayDateString, parseAmount } from '../utils/formatters.js';
import { previewProjectedBalance } from '../utils/calculations.js';
import { validateTransaction } from '../utils/validation.js';
import { aiService, ParsedTransactionData } from '../services/aiService.js';
import { prepareReceiptImage } from '../utils/receiptImage.js';
import { TransactionReceipt } from '../services/apiService.js';

interface TransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: {
    date: string;
    amount: number;
    description: string;
    type: TransactionType;
    category: string;
  }) => Promise<Transaction>;
  onUploadReceipt: (id: string, file: File) => Promise<TransactionReceipt>;
  onTransactionSaved: (transaction: Transaction, receiptFailure?: string) => void;
  initialAiData?: ParsedTransactionData | null;
  currentBalance: number;
}

export const TransactionModal: React.FC<TransactionModalProps> = ({
  isOpen,
  onClose,
  onSave,
  onTransactionSaved,
  initialAiData,
  currentBalance,
  onUploadReceipt,
}) => {
  const [type, setType] = useState<TransactionType>('expense');
  const [amountStr, setAmountStr] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [category, setCategory] = useState<string>('Makanan');
  const [date, setDate] = useState<string>(getTodayDateString());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isUploadingReceipt, setIsUploadingReceipt] = useState(false);
  const [isCompressingReceipt, setIsCompressingReceipt] = useState(false);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreviewUrl, setReceiptPreviewUrl] = useState('');
  const [isDraggingReceipt, setIsDraggingReceipt] = useState(false);
  const receiptInputRef = useRef<HTMLInputElement>(null);
  const receiptPreviewUrlRef = useRef('');

  // In-modal AI Smart Input states
  const [aiText, setAiText] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiSuccessMsg, setAiSuccessMsg] = useState<string | null>(null);

  const clearReceiptPreview = () => {
    if (receiptPreviewUrlRef.current) URL.revokeObjectURL(receiptPreviewUrlRef.current);
    receiptPreviewUrlRef.current = '';
    setReceiptPreviewUrl('');
  };

  const clearError = (field: string) => {
    setErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  // Initialize the form when it opens and reset it when it closes.
  useEffect(() => {
    if (isOpen) {
      setAiText('');
      setIsAiLoading(false);
      setErrors({});
      setIsSubmitting(false);
      setIsUploadingReceipt(false);
      setReceiptFile(null);
      clearReceiptPreview();

      if (initialAiData) {
        setType(initialAiData.type);
        setAmountStr(String(initialAiData.amount));
        setDescription(initialAiData.description);
        setCategory(initialAiData.category);
        setDate(initialAiData.date || getTodayDateString());
        setAiSuccessMsg('Data otomatis terisi dari AI! Silakan periksa & simpan.');
      } else {
        // Defaults for fresh transaction
        setType('expense');
        setAmountStr('');
        setDescription('');
        setCategory('Makanan');
        setDate(getTodayDateString());
        setAiSuccessMsg(null);
      }
    } else {
      setType('expense');
      setAmountStr('');
      setDescription('');
      setCategory('Makanan');
      setDate(getTodayDateString());
      setErrors({});
      setAiText('');
      setAiSuccessMsg(null);
    }
  }, [isOpen, initialAiData]);

  useEffect(() => {
    if (isOpen) return;
    clearReceiptPreview();
    setReceiptFile(null);
    setIsUploadingReceipt(false);
  }, [isOpen]);

  // Keep category in sync when type changes
  const handleTypeChange = (newType: TransactionType) => {
    setType(newType);
    if (newType === 'income') {
      const valid = INCOME_CATEGORIES as readonly string[];
      if (!valid.includes(category)) {
        setCategory(INCOME_CATEGORIES[0]);
      }
    } else {
      const valid = EXPENSE_CATEGORIES as readonly string[];
      if (!valid.includes(category)) {
        setCategory(EXPENSE_CATEGORIES[0]);
      }
    }
    clearError('type');
  };

  if (!isOpen) return null;

  const currentAmountNum = parseAmount(amountStr);

  // Projected balance calculation
  const projectedBalance = previewProjectedBalance(
    currentBalance,
    type,
    currentAmountNum,
    undefined
  );
  const willBeNegative = projectedBalance < 0;

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[^0-9]/g, '');
    setAmountStr(raw);
    clearError('amount');
  };

  const handleAddPresetAmount = (preset: number) => {
    const cur = parseAmount(amountStr);
    const updated = cur + preset;
    setAmountStr(String(updated));
    clearError('amount');
  };

  const handleReceiptFile = async (file?: File) => {
    if (!file) return;
    setIsCompressingReceipt(true);
    try {
      const compressed = await prepareReceiptImage(file);
      clearReceiptPreview();
      const previewUrl = URL.createObjectURL(compressed);
      receiptPreviewUrlRef.current = previewUrl;
      setReceiptPreviewUrl(previewUrl);
      setReceiptFile(compressed);
      clearError('receipt');
    } catch (error) {
      setErrors((prev) => ({
        ...prev,
        receipt: error instanceof Error ? error.message : 'Gambar belum dapat diproses.',
      }));
    } finally {
      setIsCompressingReceipt(false);
      if (receiptInputRef.current) receiptInputRef.current.value = '';
    }
  };

  const handleRemoveSelectedReceipt = () => {
    clearReceiptPreview();
    setReceiptFile(null);
    clearError('receipt');
  };

  // Trigger in-modal AI Smart Parse
  const handleAiExtract = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!aiText.trim() || isAiLoading) return;

    setIsAiLoading(true);
    setAiSuccessMsg(null);

    try {
      const parsed = await aiService.parseNaturalLanguage(aiText.trim());
      setType(parsed.type);
      setAmountStr(String(parsed.amount));
      setDescription(parsed.description);
      setCategory(parsed.category);
      if (parsed.date) setDate(parsed.date);
      setErrors({});
      setAiSuccessMsg(`✨ Berhasil diekstrak: ${parsed.type === 'income' ? 'Income' : 'Expense'} · ${parsed.category} · ${formatRupiah(parsed.amount)}`);
    } catch (err: unknown) {
      console.error('AI parse in modal error:', err);
      setErrors({
        general: err instanceof Error ? err.message : 'Gagal memproses dengan AI.',
      });
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    const parsedNum = parseAmount(amountStr);

    const validation = validateTransaction({
      date,
      amount: parsedNum,
      description,
      type,
      category,
    });

    if (!validation.isValid) {
      setErrors(validation.errors as Record<string, string>);
      return;
    }

    try {
      setIsSubmitting(true);
      const transaction = await onSave({
        date,
        amount: parsedNum,
        description: description.trim(),
        type,
        category: category.trim(),
      });
      let receiptFailure: string | undefined;
      if (receiptFile) {
        setIsUploadingReceipt(true);
        try {
          await onUploadReceipt(transaction.id, receiptFile);
        } catch (error) {
          receiptFailure = error instanceof Error ? error.message : 'Coba unggah kembali dari detail transaksi.';
          console.error('Transaction saved but receipt upload failed:', error);
        }
      }
      clearReceiptPreview();
      setReceiptFile(null);
      onClose();
      onTransactionSaved(transaction, receiptFailure);
    } catch (err) {
      console.error('Error saving transaction:', err);
      setErrors({ general: err instanceof Error ? err.message : 'Transaksi belum dapat disimpan. Coba lagi.' });
    } finally {
      setIsSubmitting(false);
      setIsUploadingReceipt(false);
    }
  };

  const categoryOptions = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6"
    >
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 id="modal-title" className="text-lg font-bold text-slate-900">
            Tambah Transaksi
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
            aria-label="Tutup modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {errors.general && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-lg">
              {errors.general}
            </div>
          )}

          {/* AI Smart Input Bar */}
          <div className="bg-blue-50/70 border border-blue-200/80 rounded-xl p-3">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-900">
                  <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                  <span>Isi Otomatis dengan AI</span>
                </div>
                <span className="text-[10px] text-blue-600 font-medium">
                  Gemini Smart Parse
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={aiText}
                  onChange={(e) => setAiText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAiExtract();
                    }
                  }}
                  disabled={isAiLoading}
                  placeholder='Contoh: "tadi siang beli nasi padang 25rb"...'
                  className="flex-1 px-3 py-1.5 bg-white border border-blue-200 rounded-lg text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
                <button
                  type="button"
                  onClick={() => handleAiExtract()}
                  disabled={!aiText.trim() || isAiLoading}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold rounded-lg flex items-center gap-1 shadow-xs transition-colors shrink-0"
                >
                  {isAiLoading ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin" />
                      <span>Memproses...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3 h-3" />
                      <span>Ekstrak</span>
                    </>
                  )}
                </button>
              </div>

              {aiSuccessMsg && (
                <div className="mt-2 text-[11px] font-medium text-emerald-700 flex items-center gap-1">
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span>{aiSuccessMsg}</span>
                </div>
              )}
          </div>

          {/* Type Selector (Segmented buttons with clear intent) */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-2">
              Tipe Transaksi <span className="text-rose-500">*</span>
            </label>
            <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl">
              <button
                type="button"
                onClick={() => handleTypeChange('income')}
                className={`flex flex-col items-center justify-center py-2.5 px-3 rounded-lg text-sm font-medium transition-all ${
                  type === 'income'
                    ? 'bg-white text-emerald-700 shadow-xs ring-1 ring-emerald-500/20'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                }`}
              >
                <div className="flex items-center gap-1.5 font-bold">
                  <ArrowDownLeft className="w-4 h-4 text-emerald-600" />
                  <span>Income</span>
                </div>
                <span className="text-[11px] text-slate-500 font-normal mt-0.5">
                  Saldo bertambah (+)
                </span>
              </button>

              <button
                type="button"
                onClick={() => handleTypeChange('expense')}
                className={`flex flex-col items-center justify-center py-2.5 px-3 rounded-lg text-sm font-medium transition-all ${
                  type === 'expense'
                    ? 'bg-white text-rose-700 shadow-xs ring-1 ring-rose-500/20'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                }`}
              >
                <div className="flex items-center gap-1.5 font-bold">
                  <ArrowUpRight className="w-4 h-4 text-rose-600" />
                  <span>Expense</span>
                </div>
                <span className="text-[11px] text-slate-500 font-normal mt-0.5">
                  Saldo berkurang (-)
                </span>
              </button>
            </div>
            {errors.type && (
              <p className="mt-1 text-xs text-rose-600">{errors.type}</p>
            )}
          </div>

          {/* Amount Input */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="tx-amount" className="text-xs font-semibold uppercase tracking-wider text-slate-600">
                Nominal (Rupiah) <span className="text-rose-500">*</span>
              </label>
              {currentAmountNum > 0 && (
                <span className="text-xs font-medium text-blue-600">
                  {formatRupiah(currentAmountNum)}
                </span>
              )}
            </div>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">
                Rp
              </span>
              <input
                id="tx-amount"
                type="text"
                inputMode="numeric"
                value={amountStr}
                onChange={handleAmountChange}
                placeholder="Contoh: 30000"
                className={`w-full pl-11 pr-4 py-2.5 bg-white border rounded-xl text-slate-900 text-base font-semibold focus:outline-none focus:ring-2 transition-colors ${
                  errors.amount
                    ? 'border-rose-300 focus:ring-rose-500 bg-rose-50/20'
                    : 'border-slate-300 focus:ring-blue-500 focus:border-blue-500'
                }`}
                autoComplete="off"
              />
            </div>
            {errors.amount && (
              <p className="mt-1 text-xs text-rose-600">{errors.amount}</p>
            )}

            {/* Quick Presets */}
            <div className="mt-2 flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] text-slate-400 mr-1">Cepat:</span>
              {[10000, 25000, 50000, 100000, 500000].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => handleAddPresetAmount(preset)}
                  className="px-2 py-1 text-[11px] font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 rounded-md transition-colors"
                >
                  +{formatRupiah(preset).replace('Rp', '')}
                </button>
              ))}
            </div>
          </div>

          {/* Date & Category Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Date */}
            <div>
              <label htmlFor="tx-date" className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
                Tanggal <span className="text-rose-500">*</span>
              </label>
              <input
                id="tx-date"
                type="date"
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                  clearError('date');
                }}
                className={`w-full px-3.5 py-2.5 bg-white border rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 transition-colors ${
                  errors.date
                    ? 'border-rose-300 focus:ring-rose-500'
                    : 'border-slate-300 focus:ring-blue-500 focus:border-blue-500'
                }`}
              />
              {errors.date && (
                <p className="mt-1 text-xs text-rose-600">{errors.date}</p>
              )}
            </div>

            {/* Category */}
            <div>
              <label htmlFor="tx-category" className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
                Kategori <span className="text-rose-500">*</span>
              </label>
              <select
                id="tx-category"
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value);
                  clearError('category');
                }}
                className={`w-full px-3.5 py-2.5 bg-white border rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 transition-colors ${
                  errors.category
                    ? 'border-rose-300 focus:ring-rose-500'
                    : 'border-slate-300 focus:ring-blue-500 focus:border-blue-500'
                }`}
              >
                {categoryOptions.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
              {errors.category && (
                <p className="mt-1 text-xs text-rose-600">{errors.category}</p>
              )}
            </div>
          </div>

          {/* Description */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="tx-description" className="text-xs font-semibold uppercase tracking-wider text-slate-600">
                Deskripsi <span className="text-rose-500">*</span>
              </label>
              <span className="text-[11px] text-slate-400">
                {description.length}/200
              </span>
            </div>
            <input
              id="tx-description"
              type="text"
              maxLength={200}
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                clearError('description');
              }}
              placeholder={type === 'income' ? 'Contoh: Uang bulanan, Gaji freelance' : 'Contoh: Makan seblak, Beli bensin'}
              className={`w-full px-3.5 py-2.5 bg-white border rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 transition-colors ${
                errors.description
                  ? 'border-rose-300 focus:ring-rose-500'
                  : 'border-slate-300 focus:ring-blue-500 focus:border-blue-500'
              }`}
            />
            {errors.description && (
              <p className="mt-1 text-xs text-rose-600">{errors.description}</p>
            )}
          </div>

          {/* Bukti transaksi opsional */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-600">
              Bukti Transaksi (opsional)
            </label>
            <input
              ref={receiptInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              className="hidden"
              onChange={(event) => { void handleReceiptFile(event.target.files?.[0]); }}
            />
            {!receiptFile && (
              <button
                type="button"
                onClick={() => receiptInputRef.current?.click()}
                onDragOver={(event) => { event.preventDefault(); setIsDraggingReceipt(true); }}
                onDragLeave={() => setIsDraggingReceipt(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setIsDraggingReceipt(false);
                  void handleReceiptFile(event.dataTransfer.files[0]);
                }}
                disabled={isSubmitting || isCompressingReceipt}
                className={`flex w-full flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed px-4 py-5 text-center transition-colors disabled:opacity-60 ${
                  isDraggingReceipt ? 'border-blue-500 bg-blue-50' : 'border-slate-300 bg-slate-50 hover:border-blue-400 hover:bg-blue-50/50'
                }`}
              >
                <Upload className="h-5 w-5 text-blue-600" />
                <span className="text-sm font-medium text-slate-700">{isCompressingReceipt ? 'Mengompres gambar...' : 'Pilih atau jatuhkan gambar di sini'}</span>
                <span className="text-xs text-slate-500">JPG, PNG, atau WEBP · Maks. 5 MB · sisi gambar maks. 1600 px</span>
              </button>
            )}
            {receiptPreviewUrl && receiptFile && (
              <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <img src={receiptPreviewUrl} alt="Preview bukti transaksi" className="h-20 w-20 rounded-lg object-cover" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-800">{receiptFile.name}</p>
                  <p className="text-xs text-slate-500">{(receiptFile.size / 1024).toFixed(0)} KB · gambar dikompres</p>
                </div>
                <button
                  type="button"
                  onClick={handleRemoveSelectedReceipt}
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Hapus gambar
                </button>
              </div>
            )}
            {errors.receipt && <p role="alert" className="mt-1 text-xs text-rose-600">{errors.receipt}</p>}
          </div>

          {/* Balance Preview Card */}
          <div className="bg-slate-50 border border-slate-200/90 rounded-xl p-3.5 space-y-1.5">
            <div className="flex items-center justify-between text-xs text-slate-600">
              <span>Saldo saat ini:</span>
              <span className="font-medium text-slate-800">{formatRupiah(currentBalance)}</span>
            </div>
            <div className="flex items-center justify-between text-xs sm:text-sm font-semibold border-t border-slate-200 pt-1.5">
              <span>Saldo setelah transaksi:</span>
              <span className={willBeNegative ? 'text-rose-600' : 'text-slate-900'}>
                {formatRupiah(projectedBalance)}
              </span>
            </div>

            {/* Negative balance warning if applicable */}
            {willBeNegative && (
              <div className="mt-2 p-2.5 bg-rose-100/70 border border-rose-200 rounded-lg flex items-start gap-2 text-xs text-rose-800">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold">Saldo akan menjadi defisit ({formatRupiah(projectedBalance)}).</span>
                  <p className="text-[11px] text-rose-700 mt-0.5">
                    Anda tetap dapat menyimpan transaksi ini sesuai catatan pengeluaran Anda.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Modal Actions */}
          <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmitting || isCompressingReceipt}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-sm shadow-blue-600/30 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            >
              <Check className="w-4 h-4 stroke-[2.5]" />
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              <span>{isUploadingReceipt ? 'Mengunggah bukti...' : isCompressingReceipt ? 'Memproses gambar...' : isSubmitting ? 'Menyimpan...' : 'Simpan Transaksi'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
