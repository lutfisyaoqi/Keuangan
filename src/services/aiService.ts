import { TransactionType } from '../types/finance.js';

export interface ParsedTransactionData {
  description: string;
  amount: number;
  type: TransactionType;
  category: string;
  date: string;
}

function parseLocally(input: string): ParsedTransactionData {
  const lower = input.toLowerCase();
  const today = new Date();
  let date = today.toISOString().slice(0, 10);
  if (lower.includes('kemarin')) {
    today.setDate(today.getDate() - 1);
    date = today.toISOString().slice(0, 10);
  }

  const type: TransactionType = ['gaji', 'uang bulanan', 'bonus', 'terima', 'dapat uang', 'hadiah', 'transfer dari', 'pemasukan']
    .some((word) => lower.includes(word)) ? 'income' : 'expense';
  let category = 'Lainnya';
  if (type === 'income') {
    if (lower.includes('gaji')) category = 'Gaji';
    else if (lower.includes('bulanan')) category = 'Uang bulanan';
    else if (lower.includes('bonus')) category = 'Bonus';
    else if (lower.includes('hadiah')) category = 'Hadiah';
  } else if (/makan|minum|kopi|padang|seblak|bakso|sarapan|siang|resto|kafe/.test(lower)) category = 'Makanan';
  else if (/bensin|ojol|grab|gojek|parkir|tol|kereta|bus/.test(lower)) category = 'Transportasi';
  else if (/listrik|air|wifi|pulsa|token|tagihan/.test(lower)) category = 'Tagihan';
  else if (/beli|baju|sepatu|shopee|tokopedia/.test(lower)) category = 'Belanja';
  else if (/bioskop|game|nonton|liburan/.test(lower)) category = 'Hiburan';
  else if (/obat|dokter|klinik|rumah sakit/.test(lower)) category = 'Kesehatan';
  else if (/buku|kursus|sekolah|kuliah/.test(lower)) category = 'Pendidikan';

  const amountMatch = lower.match(/(\d+(?:[.,]\d+)?)\s*(jt|juta|rb|ribu|k)\b/)
    ?? lower.match(/(?:rp\.?\s*)?(\d{1,3}(?:\.\d{3})+|\d+)/);
  let amount = 25000;
  if (amountMatch) {
    const value = Number(amountMatch[1].replace(',', '.'));
    const unit = amountMatch[2]?.toLowerCase();
    amount = Math.round(value * (unit === 'jt' || unit === 'juta' ? 1_000_000 : unit ? 1_000 : 1));
  }
  const description = input
    .replace(/(?:tadi siang|tadi pagi|kemarin|tadi malam|hari ini)/gi, '')
    .replace(/\d+(?:[.,]\d+)?\s*(?:jt|juta|rb|ribu|k)\b/gi, '')
    .replace(/rp\.?\s*\d+(?:\.\d+)*/gi, '')
    .trim();

  return {
    description: description ? description[0].toUpperCase() + description.slice(1) : type === 'income' ? 'Pemasukan' : 'Pengeluaran',
    amount: amount > 0 ? amount : 25000,
    type,
    category,
    date,
  };
}

export const aiService = {
  async parseNaturalLanguage(text: string): Promise<ParsedTransactionData> {
    const normalized = text.trim();
    if (!normalized || normalized.length > 1000) throw new Error('Tulis transaksi maksimal 1.000 karakter.');
    return parseLocally(normalized);
  },
};
