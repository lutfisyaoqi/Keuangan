import React, { useEffect, useRef, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, FileImage, Loader2, Trash2, X } from 'lucide-react';
import { Transaction } from '../types/finance.js';
import { apiService, TransactionReceipt } from '../services/apiService.js';
import { formatIndonesianDate, formatRupiah } from '../utils/formatters.js';
import { prepareReceiptImage } from '../utils/receiptImage.js';

interface TransactionDetailModalProps {
  transaction: Transaction | null;
  onClose: () => void;
  onDelete: (transaction: Transaction) => void;
  onUploadReceipt: (id: string, file: File) => Promise<TransactionReceipt>;
}

export const TransactionDetailModal: React.FC<TransactionDetailModalProps> = ({
  transaction,
  onClose,
  onDelete,
  onUploadReceipt,
}) => {
  const [details, setDetails] = useState<Transaction | null>(null);
  const [signedUrl, setSignedUrl] = useState('');
  const [isImageLoading, setIsImageLoading] = useState(false);
  const [receiptError, setReceiptError] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [isPreparing, setIsPreparing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [retry, setRetry] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDetails(transaction);
    setSignedUrl('');
    setReceiptError('');
    setIsImageLoading(false);
  }, [transaction]);

  useEffect(() => {
    let active = true;
    setSignedUrl('');
    setReceiptError('');
    if (details?.receiptPath) {
      setIsImageLoading(true);
      void (async () => {
        try {
          const { signedUrl: url } = await apiService.getTransactionReceiptUrl(details.id);
          if (active) setSignedUrl(url);
        } catch (reason) {
          if (active) setReceiptError(reason instanceof Error ? reason.message : 'Foto tidak dapat ditampilkan.');
        }
      })();
    } else {
      setIsImageLoading(false);
    }
    return () => { active = false; };
  }, [details?.id, details?.receiptPath, retry]);

  if (!transaction) return null;
  const displayedTransaction = details ?? transaction;
  const isIncome = displayedTransaction.type === 'income';

  const handleFile = async (file?: File) => {
    if (!file) return;
    setUploadError('');
    setIsPreparing(true);
    try {
      setUploadFile(await prepareReceiptImage(file));
    } catch (reason) {
      setUploadFile(null);
      setUploadError(reason instanceof Error ? reason.message : 'Foto belum dapat diproses.');
    } finally {
      setIsPreparing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleUpload = async () => {
    if (!uploadFile || isUploading) return;
    setIsUploading(true);
    setUploadError('');
    try {
      const receipt = await onUploadReceipt(transaction.id, uploadFile);
      setDetails((current) => current ? {
        ...current,
        receiptPath: receipt.receiptPath,
        receiptMime: receipt.receiptMime,
        receiptSize: receipt.receiptSize,
      } : current);
      setUploadFile(null);
    } catch (reason) {
      setUploadError(reason instanceof Error ? reason.message : 'Foto gagal diunggah. Coba lagi.');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="transaction-detail-title" className="fixed inset-0 z-[60] grid place-items-center bg-slate-900/60 p-4">
      <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 id="transaction-detail-title" className="text-base font-bold text-slate-900">Detail Transaksi</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Tutup detail">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-4 p-5">
          {details && (
            <>
              <div className={`flex items-center gap-2 text-sm font-semibold ${isIncome ? 'text-emerald-700' : 'text-rose-700'}`}>
                {isIncome ? <ArrowDownLeft className="h-5 w-5" /> : <ArrowUpRight className="h-5 w-5" />}
                {isIncome ? 'Income' : 'Expense'}
              </div>
              <p className={`text-2xl font-bold ${isIncome ? 'text-emerald-700' : 'text-rose-700'}`}>
                {formatRupiah(details.amount, { showSign: true, type: details.type })}
              </p>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-xl bg-slate-50 p-4 text-sm">
                <dt className="text-slate-500">Kategori</dt><dd className="font-medium text-slate-900">{details.category}</dd>
                <dt className="text-slate-500">Tanggal</dt><dd className="font-medium text-slate-900">{formatIndonesianDate(details.date)}</dd>
                <dt className="text-slate-500">Deskripsi</dt><dd className="break-words font-medium text-slate-900">{details.description}</dd>
                <dt className="text-slate-500">Dibuat</dt><dd className="font-medium text-slate-900">{new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(details.createdAt))}</dd>
              </dl>

              {details.receiptPath ? (
                <div>
                  <h3 className="mb-2 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-800"><FileImage className="h-4 w-4" /> Foto Bukti</h3>
                  <div className="grid min-h-40 place-items-center overflow-hidden rounded-xl bg-slate-50 p-3">
                    {isImageLoading && <div className="h-40 w-full animate-pulse rounded-lg bg-slate-200" aria-label="Memuat foto bukti" />}
                    {signedUrl && <img
                      src={signedUrl}
                      alt={`Bukti transaksi ${details.description}`}
                      onLoad={() => setIsImageLoading(false)}
                      onError={() => { setIsImageLoading(false); setSignedUrl(''); setReceiptError('Foto tidak dapat ditampilkan.'); }}
                      className={`max-h-[55vh] max-w-full object-contain ${isImageLoading ? 'hidden' : ''}`}
                    />}
                    {receiptError && <div role="alert" className="text-center text-sm text-rose-700">
                      <p>Foto tidak dapat ditampilkan.</p>
                      <p className="mt-1 text-xs">{receiptError}</p>
                      <button type="button" onClick={() => setRetry((value) => value + 1)} className="mt-2 font-semibold underline">Coba lagi</button>
                    </div>}
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-slate-300 p-4">
                  <p className="mb-2 text-sm text-slate-600">Tidak ada foto bukti</p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    capture="environment"
                    className="hidden"
                    onChange={(event) => { void handleFile(event.target.files?.[0]); }}
                  />
                  {!uploadFile && <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isPreparing || isUploading}
                    className="inline-flex items-center gap-2 text-sm font-semibold text-blue-700 disabled:opacity-50"
                  >
                    {isPreparing ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileImage className="h-4 w-4" />}
                    {isPreparing ? 'Memproses foto...' : 'Tambah foto bukti'}
                  </button>}
                  {uploadFile && <div className="flex items-center justify-between gap-3">
                    <span className="truncate text-sm text-slate-700">{uploadFile.name}</span>
                    <button type="button" onClick={() => void handleUpload()} disabled={isUploading} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">
                      {isUploading ? 'Mengunggah...' : 'Unggah foto'}
                    </button>
                  </div>}
                  {uploadError && <div role="alert" className="mt-2 text-sm text-rose-700">
                    <p>{uploadError}</p>
                    {uploadFile && <button type="button" onClick={() => void handleUpload()} disabled={isUploading} className="mt-1 font-semibold underline">Coba unggah lagi</button>}
                  </div>}
                </div>
              )}
            </>
          )}
          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
            <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">Tutup</button>
            <button type="button" onClick={() => onDelete(displayedTransaction)} className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700">
              <Trash2 className="h-4 w-4" /> Hapus transaksi
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
