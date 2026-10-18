import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, TransactionType } from '../types/finance.js';

export interface ValidationResult {
  isValid: boolean;
  errors: {
    date?: string;
    amount?: string;
    description?: string;
    type?: string;
    category?: string;
    general?: string;
  };
}

export function validateTransaction(data: {
  date: string;
  amount: number | string;
  description: string;
  type: TransactionType | string;
  category: string;
}): ValidationResult {
  const errors: ValidationResult['errors'] = {};

  // 1. Validate Date
  if (!data.date || typeof data.date !== 'string' || !data.date.trim()) {
    errors.date = 'Tanggal transaksi wajib diisi.';
  } else {
    // Check YYYY-MM-DD pattern
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(data.date.trim())) {
      errors.date = 'Format tanggal tidak valid (gunakan format YYYY-MM-DD).';
    }
  }

  // 2. Validate Amount
  const numAmount = typeof data.amount === 'number' ? data.amount : Number(data.amount);
  if (
    data.amount === undefined ||
    data.amount === null ||
    data.amount === '' ||
    isNaN(numAmount) ||
    !isFinite(numAmount)
  ) {
    errors.amount = 'Nominal transaksi wajib diisi berupa angka.';
  } else if (numAmount <= 0) {
    errors.amount = 'Nominal harus lebih besar dari Rp0. Jangan gunakan angka 0 atau negatif.';
  }

  // 3. Validate Description
  if (!data.description || typeof data.description !== 'string' || !data.description.trim()) {
    errors.description = 'Deskripsi transaksi wajib diisi.';
  } else if (data.description.trim().length > 200) {
    errors.description = 'Deskripsi maksimal 200 karakter.';
  }

  // 4. Validate Type
  if (data.type !== 'income' && data.type !== 'expense') {
    errors.type = 'Pilih tipe transaksi yang valid (Income atau Expense).';
  }

  // 5. Validate Category
  if (!data.category || typeof data.category !== 'string' || !data.category.trim()) {
    errors.category = 'Kategori transaksi wajib dipilih.';
  } else {
    const validCategories =
      data.type === 'income' ? (INCOME_CATEGORIES as readonly string[]) : (EXPENSE_CATEGORIES as readonly string[]);
    // Allow either predefined or fallback to Lainnya
    if (!validCategories.includes(data.category.trim()) && data.category.trim() !== 'Lainnya') {
      errors.category = 'Kategori harus dipilih dari daftar kategori yang tersedia.';
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

export function validateInitialBalance(val: number | string): { isValid: boolean; error?: string; value: number } {
  const num = typeof val === 'number' ? val : Number(val);
  if (isNaN(num) || !isFinite(num)) {
    return {
      isValid: false,
      error: 'Saldo awal harus berupa angka yang valid.',
      value: 0,
    };
  }
  if (num < 0) {
    return {
      isValid: false,
      error: 'Saldo awal tidak boleh negatif.',
      value: 0,
    };
  }
  return {
    isValid: true,
    value: Math.round(num),
  };
}
